"""Chạy file .xosc VehicSim bằng ScenarioRunner trên CARLA local, ghi result và sensor.

    worker/.venv-carla/Scripts/python worker/run_xosc.py scenario.xosc --out data/run
    worker/.venv-carla/Scripts/python worker/run_xosc.py --status

CARLA server bật riêng; SR_ROOT mặc định ~/scenario_runner. JSON cũ vẫn chuyển cho run_variant.py,
để các run của profile CARLA trực tiếp không bị âm thầm đổi bộ thực thi.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

import sensor_recorder
import sim_common
from openscenario_export import read_profile, read_xosc
from vehicsim_core.bundle import carla_simulator

WORKER = Path(__file__).resolve().parent
STOP_FLAG = "stop.requested"  # backend ghi vào thư mục run để xin dừng (Windows không có tín hiệu mềm cho tiến trình con)
POLL_S = 0.5
_ACTOR_PREFIXES = ("vehicle.", "walker.", "sensor.", "controller.")


class RunStoppedError(Exception):
    """Backend xin dừng run này (hủy hoặc hết thời gian); đã dọn xong thì thoát EXIT_STOPPED."""


def wait_for_exit(proc: subprocess.Popen, timeout: float, stop_flag: Path) -> int:
    """Chờ ScenarioRunner thoát, nhưng nhìn thấy cờ dừng trong vòng ``POLL_S`` thay vì chờ hết ``timeout``."""
    waited = 0.0
    while True:
        try:
            return proc.wait(timeout=POLL_S)
        except subprocess.TimeoutExpired:
            waited += POLL_S
        if stop_flag.exists():
            raise RunStoppedError(f"Có yêu cầu dừng ({stop_flag.name})")
        if waited >= timeout:
            raise subprocess.TimeoutExpired(proc.args, timeout)


def release_world(client) -> int:  # noqa: ANN001 - carla.Client
    """Trả server về trạng thái sạch: không đồng bộ, không còn xe/người/cảm biến của lần chạy trước. Trả số actor đã xoá.

    ScenarioRunner bị giết cứng (hủy, timeout, Windows ``terminate``) không kịp dọn: actor còn lại và server kẹt chế độ
    đồng bộ chờ một tick không bao giờ đến. Một server chỉ chạy tuần tự các run của VehicSim nên xoá theo loại actor là an toàn.
    """
    world = client.get_world()
    settings = world.get_settings()
    settings.synchronous_mode = False
    settings.fixed_delta_seconds = None
    world.apply_settings(settings)
    world.wait_for_tick()  # ở chế độ đồng bộ, get_actors() là ảnh cũ cho tới tick kế tiếp (đo 01/10)
    leftovers = [a for a in world.get_actors() if a.type_id.startswith(_ACTOR_PREFIXES)]
    # Cảm biến và controller phải dừng trước chủ của chúng.
    for actor in sorted(leftovers, key=lambda a: not a.type_id.startswith(("sensor.", "controller."))):
        try:
            if actor.type_id.startswith(("sensor.", "controller.")):
                actor.stop()
            actor.destroy()
        except RuntimeError:  # đã bị xoá cùng chủ
            pass
    client.get_trafficmanager(8005).set_synchronous_mode(False)
    return len(leftovers)


def environment(sr_root: Path) -> dict[str, str]:
    env = dict(os.environ)
    carla_root = Path(env.get("CARLA_ROOT", "C:/Carla_package" if os.name == "nt" else "/opt/carla-simulator"))
    env["PYTHONPATH"] = os.pathsep.join((str(WORKER), str(carla_root / "PythonAPI/carla"), str(sr_root), env.get("PYTHONPATH", "")))
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def probe(host: str, port: int, sr_root: Path) -> dict:
    info = {"connected": False, "version": None, "scenario_runner": (sr_root / "scenario_runner.py").is_file()}
    try:
        import carla

        client = carla.Client(host, port)
        client.set_timeout(3.0)
        info["version"] = client.get_server_version()
        info["client_version"] = client.get_client_version()
        info["connected"] = True
        info["compatible"] = carla_simulator(info["version"]) == carla_simulator(info["client_version"])
    except (ImportError, RuntimeError) as exc:
        info["error"] = str(exc)
    return info


def prepare_runtime(source: Path, target: Path, out: Path, simulator: str) -> None:
    tree = ET.parse(source)
    properties = tree.find(".//Controller[@name='VehicSimAEB']/Properties")
    if properties is None:
        raise ValueError("File .xosc thiếu controller AEB của VehicSim")
    overrides = {"module": str(WORKER / "vehicsim_aeb_control.py"), "xosc_file": str(source.resolve()),
                 "out_dir": str(out.resolve()), "simulator_version": simulator}
    for name, value in overrides.items():
        prop = properties.find(f"Property[@name='{name}']")
        if prop is None:
            prop = ET.SubElement(properties, "Property", name=name)
        prop.set("value", value)
    tree.write(target, encoding="utf-8", xml_declaration=True)


def run(args: argparse.Namespace) -> int:
    read_xosc(args.xosc)  # không nhận XML ngoài hợp đồng/không rõ metadata vào đường ghi kết quả
    state = probe(args.host, args.port, args.sr_root)
    if not state["connected"] or not state.get("compatible") or not state["scenario_runner"]:
        raise RuntimeError(f"Môi trường CARLA chưa sẵn sàng: {json.dumps(state, ensure_ascii=False)}")
    import carla

    client = carla.Client(args.host, args.port)
    client.set_timeout(120.0)
    world = client.get_world()
    # Nạp map trước khi gắn recorder, tránh thread recorder bỏ cuộc trong lúc ScenarioRunner load_world.
    map_name = ET.parse(args.xosc).find("./RoadNetwork/LogicFile").attrib["filepath"]
    if world.get_map().name.split("/")[-1] != map_name:
        world = client.load_world(map_name)
    out = (args.out or args.xosc.with_suffix("")).resolve()
    out.mkdir(parents=True, exist_ok=True)
    result_file = out / "result.json"
    result_file.unlink(missing_ok=True)
    lifecycle = {"destroyed_before": release_world(client), "destroyed_after": None, "stopped": False}
    if lifecycle["destroyed_before"]:
        print(f"Dọn lại sau lần chạy bị ngắt: xoá {lifecycle['destroyed_before']} actor cũ.", file=sys.stderr)
    runtime = out / "scenario.runtime.xosc"
    suffix, step_s, _ = read_profile(args.xosc)
    prepare_runtime(args.xosc, runtime, out, carla_simulator(state["version"]) + suffix)
    env = environment(args.sr_root)
    recorder = sensor_recorder.SensorRecorder(args.host, args.port, out / "sensors", camera=args.camera, step_s=step_s)
    follower = proc = None
    recorder.start()
    command = [sys.executable, str(args.sr_root / "scenario_runner.py"), "--openscenario", str(runtime),
               "--host", args.host, "--port", str(args.port), "--timeout", "120", "--sync", "--frameRate", str(round(1 / step_s)),
               "--trafficManagerPort", "8005", "--json", "--outputDir", str(out)]
    try:
        with (out / "follow_hero.log").open("w", encoding="utf-8") as camera_log, (out / "scenario_runner.log").open("w", encoding="utf-8") as log:
            follower = subprocess.Popen([sys.executable, str(WORKER / "follow_hero.py"), "--host", args.host,
                                         "--port", str(args.port), "--view", "chase"], env=env, stdout=camera_log, stderr=subprocess.STDOUT)
            proc = subprocess.Popen(command, cwd=args.sr_root, env=env, stdout=log, stderr=subprocess.STDOUT)
            code = wait_for_exit(proc, args.timeout, out / STOP_FLAG)
        criteria = []
        for path in out.glob("*.json"):
            doc = json.loads(path.read_text(encoding="utf-8"))
            if "criteria" in doc:
                criteria.append(doc)
        if code != 0 or not criteria or not result_file.is_file():
            result_file.unlink(missing_ok=True)
            raise RuntimeError(f"ScenarioRunner kết thúc mã {code} hoặc thiếu kết quả; xem {out / 'scenario_runner.log'}")
    except RunStoppedError:
        lifecycle["stopped"] = True
        raise
    finally:
        for child in (proc, follower):
            if child is not None and child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=5)
        recorder.stop()
        try:
            lifecycle["destroyed_after"] = release_world(client)
        except RuntimeError:
            pass
        if lifecycle["stopped"]:
            result_file.unlink(missing_ok=True)  # run bị dừng không có điểm hợp lệ
        (out / "lifecycle.json").write_text(json.dumps(lifecycle), encoding="utf-8")
    print(f"Đã chạy .xosc bằng ScenarioRunner: {result_file}")
    return 0


def main(argv: list[str] | None = None) -> int:
    sim_common._console_safe()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("xosc", type=Path, nargs="?")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--host", default=os.environ.get("CARLA_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("CARLA_PORT", "2000")))
    parser.add_argument("--sr-root", type=Path, default=Path(os.environ.get("SR_ROOT", str(Path.home() / "scenario_runner"))))
    parser.add_argument("--timeout", type=float, default=240.0)
    parser.add_argument("--camera", action="store_true")
    parser.add_argument("--fast", action="store_true", help="tương thích hợp đồng worker; ScenarioRunner dùng sync tick")
    parser.add_argument("--status", action="store_true")
    args = parser.parse_args(argv)
    sim_common.install_stop_handlers()
    if args.status:
        print(json.dumps(probe(args.host, args.port, args.sr_root), ensure_ascii=False))
        return 0
    if args.xosc is None:
        parser.error("cần file .xosc hoặc --status")
    if args.xosc.suffix.lower() == ".json":
        import run_variant

        legacy = [str(args.xosc), "--host", args.host, "--port", str(args.port)]
        if args.out:
            legacy += ["--out", str(args.out)]
        if args.fast:
            legacy.append("--fast")
        return run_variant.main(legacy)
    try:
        return run(args)
    except RunStoppedError as exc:
        print(str(exc), file=sys.stderr)
        return sim_common.EXIT_STOPPED
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print(str(exc), file=sys.stderr)
        return sim_common.EXIT_SIMULATOR_ERROR


if __name__ == "__main__":
    raise SystemExit(main())
