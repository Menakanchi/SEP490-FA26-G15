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
from openscenario_export import SIMULATOR_SUFFIX, read_xosc
from vehicsim_core.bundle import carla_simulator

WORKER = Path(__file__).resolve().parent


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
    settings = world.get_settings()
    settings.synchronous_mode = False
    settings.fixed_delta_seconds = None
    world.apply_settings(settings)
    out = (args.out or args.xosc.with_suffix("")).resolve()
    out.mkdir(parents=True, exist_ok=True)
    result_file = out / "result.json"
    result_file.unlink(missing_ok=True)
    runtime = out / "scenario.runtime.xosc"
    prepare_runtime(args.xosc, runtime, out, carla_simulator(state["version"]) + SIMULATOR_SUFFIX)
    env = environment(args.sr_root)
    recorder = sensor_recorder.SensorRecorder(args.host, args.port, out / "sensors", camera=args.camera)
    follower = proc = None
    recorder.start()
    command = [sys.executable, str(args.sr_root / "scenario_runner.py"), "--openscenario", str(runtime),
               "--host", args.host, "--port", str(args.port), "--timeout", "120", "--sync",
               "--trafficManagerPort", "8005", "--json", "--outputDir", str(out)]
    try:
        with (out / "follow_hero.log").open("w", encoding="utf-8") as camera_log, (out / "scenario_runner.log").open("w", encoding="utf-8") as log:
            follower = subprocess.Popen([sys.executable, str(WORKER / "follow_hero.py"), "--host", args.host,
                                         "--port", str(args.port), "--view", "chase"], env=env, stdout=camera_log, stderr=subprocess.STDOUT)
            proc = subprocess.Popen(command, cwd=args.sr_root, env=env, stdout=log, stderr=subprocess.STDOUT)
            code = proc.wait(timeout=args.timeout)
        criteria = []
        for path in out.glob("*.json"):
            doc = json.loads(path.read_text(encoding="utf-8"))
            if "criteria" in doc:
                criteria.append(doc)
        if code != 0 or not criteria or not result_file.is_file():
            result_file.unlink(missing_ok=True)
            raise RuntimeError(f"ScenarioRunner kết thúc mã {code} hoặc thiếu kết quả; xem {out / 'scenario_runner.log'}")
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
            world = client.get_world()
            settings = world.get_settings()
            settings.synchronous_mode = False
            settings.fixed_delta_seconds = None
            world.apply_settings(settings)
            client.get_trafficmanager(8005).set_synchronous_mode(False)
        except RuntimeError:
            pass
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
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print(str(exc), file=sys.stderr)
        return sim_common.EXIT_SIMULATOR_ERROR


if __name__ == "__main__":
    raise SystemExit(main())
