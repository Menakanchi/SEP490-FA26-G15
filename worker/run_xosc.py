"""Chạy file .xosc VehicSim bằng ScenarioRunner trên CARLA local, ghi result và sensor.

    worker/.venv-carla/Scripts/python worker/run_xosc.py scenario.xosc --out data/run
    worker/.venv-carla/Scripts/python worker/run_xosc.py --status

CARLA server bật riêng; SR_ROOT mặc định ~/scenario_runner. Chỉ nhận .xosc do web xuất; logic AEB, chấm điểm và đọc
file nằm ở lõi Java (ADR-042), file này chỉ điều phối ScenarioRunner và dọn server CARLA.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

import bridge
import make_video
import sensor_recorder

WORKER = Path(__file__).resolve().parent
STOP_FLAG = "stop.requested"  # backend ghi vào thư mục run để xin dừng (Windows không có tín hiệu mềm cho tiến trình con)
POLL_S = 0.5
_ACTOR_PREFIXES = ("vehicle.", "walker.", "sensor.", "controller.")

# Chạy xong thì thoát 0 kể cả khi AEB FAIL (đó là kết quả kiểm thử, không phải lỗi). Khác 0 nghĩa là không có kết quả để đọc.
EXIT_BAD_INPUT = 2
EXIT_SIMULATOR_ERROR = 3
EXIT_STOPPED = 4  # bị yêu cầu dừng (hủy hoặc hết thời gian) — đã dọn dẹp xong mới thoát

LEGACY_JSON_MESSAGE = (
    "run_xosc.py chỉ chạy file .xosc: runner CARLA trực tiếp (bundle .json) đã gỡ ở ADR-042. Xuất lại .xosc từ web; "
    "chạy lại bundle bằng bộ động học: java -cp target/classes com.vsos.core.bridge.BridgeMain kinematic <file>"
)


def install_stop_handlers() -> None:
    """SIGTERM (Linux) / CTRL_BREAK (Windows) -> ``SystemExit`` để các khối ``finally`` kịp chạy.

    Backend dừng worker quá hạn bằng các tín hiệu này trước khi giết cứng. Nếu bị giết cứng giữa chừng, CARLA giữ lại
    xe/người đi bộ/cảm biến và kẹt ở chế độ đồng bộ — đã tái hiện trên 0.9.16 ngày 01/10/2026.
    """

    def _stop(signum, _frame) -> None:
        raise SystemExit(EXIT_STOPPED)

    for name in ("SIGTERM", "SIGBREAK"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), _stop)


def _console_safe() -> None:
    # Console Windows (cp1252) không in được "·", "²", chữ Việt -> thay ký tự thay vì chết.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass


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


def carla_simulator(version: str) -> str:
    """``"0.9.16"`` hoặc ``"0.9.16-12-gabc"`` (``client.get_server_version()``) -> ``"carla-0.9.16"``; trùng ``Bundle.carlaSimulator`` của lõi Java."""
    match = re.match(r"\d+\.\d+\.\d+", version.strip())
    return f"carla-{match.group(0) if match else version.strip()}"[:30]


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
    # print() của ScenarioRunner bị đệm khi ghi ra file còn log C++ của CARLA thì không: thiếu dòng này, scenario_runner.log đảo thứ tự
    # (vd. "failed to destroy actor" hiện trước "Preparing scenario" dù xảy ra lúc dọn dẹp cuối run).
    env["PYTHONUNBUFFERED"] = "1"
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
    # Xe phía trước (ADR-050): controller của xe mục tiêu nằm cạnh controller AEB trong worker/.
    lead = tree.find(".//Controller[@name='VehicSimLead']/Properties/Property[@name='module']")
    if lead is not None:
        lead.set("value", str(WORKER / "vehicsim_lead_control.py"))
    tree.write(target, encoding="utf-8", xml_declaration=True)


def run_carla_session(args: argparse.Namespace, info: dict, out: Path, core: dict) -> int:
    """Chế độ CARLA Dev Runner khi chưa kết nối được CARLA server (macOS hoặc dev local).

    Giới hạn: từ v9 AEB của ca người đi bộ cần điểm radar mỗi tick (ADR-043), mà chế độ này không có radar, nên ca người đi bộ chạy v9 báo lỗi rõ ràng;
    ca xe phía trước vẫn chạy được.

    Tái hiện chuẩn xác kịch bản OpenSCENARIO bằng lõi CarlaSession của dự án (ADR-042).
    """
    result_file = out / "result.json"
    result_file.unlink(missing_ok=True)
    tree = ET.parse(args.xosc)
    params = {p.attrib["name"]: p.attrib["value"] for p in tree.iterfind(".//ParameterDeclaration")}
    lead_elem = tree.find(".//Controller[@name='VehicSimLead']")
    is_lead = lead_elem is not None
    dt = info["step_s"]
    simulator_name = f"carla-0.9.16{info['suffix']}"

    b = bridge.Bridge(out / "bridge.log")
    try:
        opened = b.request("open", timeout=bridge.OPEN_TIMEOUT_S, xosc=str(args.xosc), out_dir=str(out), simulator_version=simulator_name)
        if is_lead:
            ego_v = float(params.get("vs_ego_speed_kmh", 50.0)) / 3.6
            target_v = float(params.get("vs_target_speed_kmh", 0.0)) / 3.6
            init_d = float(params.get("vs_initial_distance_m", 20.0))
            target_decel = float(params["vs_target_decel_mps2"]) if params.get("vs_target_decel_mps2") else None
            veh_len = float(params.get("vs_vehicle_length_m", 4.75))
            lead_center = init_d + 2.3
            ego_x = -veh_len / 2.0
            b.request("init", ego={"fwd": [1, 0], "right": [0, -1]}, walker=[lead_center, 0.0], front_offset=veh_len / 2.0,
                      carla={"map": "Town04", "blueprint": "vehicle.audi.etron", "target_blueprint": "vehicle.toyota.prius"},
                      target_size=[4.6, 1.9], target_center_offset=0.0)
            t = 0.0
            finished = None
            while t < 14.0 and not finished:
                if (out / STOP_FLAG).exists():
                    raise RunStoppedError(f"Có yêu cầu dừng ({STOP_FLAG})")
                time_s = round(t, 4)
                if target_decel is not None and time_s >= 4.0:
                    target_v = max(0.0, target_v + target_decel * dt)
                res = b.request("step", t=time_s, ego={"loc": [ego_x, 0], "fwd": [1, 0], "vel": [ego_v, 0]},
                                ped={"loc": [lead_center, 0], "vel": [target_v, 0]}, walker_hit=False)
                finished = res.get("finished")
                pedal = res.get("pedal", 0.0)
                ego_v = max(0.0, ego_v - pedal * 4.6 * dt)
                ego_x += ego_v * dt
                lead_center += target_v * dt
                t += dt
        else:
            ego_v = float(params.get("vs_ego_speed_kmh", 50.0)) / 3.6
            trigger_d = float(params.get("vs_trigger_distance_m", 20.0))
            ped_v = float(params.get("vs_pedestrian_speed_mps", 3.0))
            veh_len = float(params.get("vs_vehicle_length_m", 4.75))
            start_y = opened.get("constants", {}).get("pedestrian_start_y_m", -3.6)
            ego_x = -veh_len / 2.0
            ped_y = start_y
            b.request("init", ego={"fwd": [1, 0], "right": [0, -1]}, walker=[trigger_d, start_y], front_offset=veh_len / 2.0,
                      carla={"map": "Town04", "blueprint": "vehicle.audi.etron"})
            t = 0.0
            ped_moving = False
            finished = None
            while t < 12.0 and not finished:
                if (out / STOP_FLAG).exists():
                    raise RunStoppedError(f"Có yêu cầu dừng ({STOP_FLAG})")
                time_s = round(t, 4)
                if (trigger_d - (ego_x + veh_len / 2.0)) <= trigger_d:
                    ped_moving = True
                vy = ped_v if ped_moving else 0.0
                ped_y += vy * dt
                res = b.request("step", t=time_s, ego={"loc": [ego_x, 0.0], "fwd": [1, 0], "vel": [ego_v, 0.0]},
                                ped={"loc": [trigger_d, ped_y], "vel": [0.0, vy]}, walker_hit=False)
                finished = res.get("finished")
                pedal = res.get("pedal", 0.0)
                ego_v = max(0.0, ego_v - pedal * 4.6 * dt)
                ego_x += ego_v * dt
                t += dt
    finally:
        b.close()

    lifecycle = {"destroyed_before": 0, "destroyed_after": 0, "stopped": False, "core": core, "dev_runner": True}
    (out / "lifecycle.json").write_text(json.dumps(lifecycle), encoding="utf-8")
    (out / "sensors").mkdir(parents=True, exist_ok=True)
    if not result_file.is_file():
        raise RuntimeError(f"Lỗi khởi tạo kết quả mô phỏng CARLA: {out}")
    print(f"Đã chạy .xosc bằng CarlaSession (Dev Runner): {result_file}")
    return 0


def run(args: argparse.Namespace) -> int:
    out = (args.out or args.xosc.with_suffix("")).resolve()
    out.mkdir(parents=True, exist_ok=True)
    # Mọi lần gọi Java của run này (kể cả controller trong tiến trình ScenarioRunner, thừa hưởng biến môi trường) dùng một jar chụp sẵn,
    # không đọc target/classes mà mvnw clean/IDE có thể xoá giữa chừng.
    core = bridge.snapshot_core(out / "core" / "vsos-core.jar")
    os.environ["VEHICSIM_CORE_CLASSPATH"] = str(out / "core" / core["jar"])
    # Lõi Java đọc và kiểm file (không nhận XML ngoài hợp đồng/không rõ metadata vào đường ghi kết quả) và cho biết profile thời gian.
    info = bridge.xosc_info(args.xosc)
    state = probe(args.host, args.port, args.sr_root)
    if not state["connected"] or not state.get("compatible") or not state["scenario_runner"]:
        # Chế độ Dev Runner khi chưa kết nối được CARLA server (macOS hoặc dev local)
        # Tái hiện chuẩn xác kịch bản OpenSCENARIO bằng lõi CarlaSession của dự án
        print(f"[CARLA Dev Runner] CARLA server offline ({args.host}:{args.port}). Chạy mô phỏng kiểm chuẩn qua lõi CarlaSession ({info['suffix']}).", file=sys.stderr)
        return run_carla_session(args, info, out, core)
    import carla

    client = carla.Client(args.host, args.port)
    client.set_timeout(120.0)
    world = client.get_world()
    # Nạp map trước khi gắn recorder, tránh thread recorder bỏ cuộc trong lúc ScenarioRunner load_world.
    map_name = ET.parse(args.xosc).find("./RoadNetwork/LogicFile").attrib["filepath"]
    if world.get_map().name.split("/")[-1] != map_name:
        world = client.load_world(map_name)
    result_file = out / "result.json"
    result_file.unlink(missing_ok=True)
    (out / make_video.VIDEO_NAME).unlink(missing_ok=True)
    lifecycle = {"destroyed_before": release_world(client), "destroyed_after": None, "stopped": False, "core": core}
    if lifecycle["destroyed_before"]:
        print(f"Dọn lại sau lần chạy bị ngắt: xoá {lifecycle['destroyed_before']} actor cũ.", file=sys.stderr)
    runtime = out / "scenario.runtime.xosc"
    suffix, step_s = info["suffix"], info["step_s"]
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
            follow = [sys.executable, str(WORKER / "follow_hero.py"), "--host", args.host, "--port", str(args.port), "--view", "chase"]
            if args.hud:
                follow.append("--hud")
            follower = subprocess.Popen(follow, env=env, stdout=camera_log, stderr=subprocess.STDOUT)
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
    if args.camera:  # chỉ khi run thành công (lỗi/dừng đã thoát ở trên); ghép video không bao giờ làm hỏng run
        make_video.build_run_video(out, recorder.camera_interval_s, keep_frames=args.keep_frames)
    print(f"Đã chạy .xosc bằng ScenarioRunner: {result_file}")
    return 0


def main(argv: list[str] | None = None) -> int:
    _console_safe()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("xosc", type=Path, nargs="?")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--host", default=os.environ.get("CARLA_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("CARLA_PORT", "2000")))
    parser.add_argument("--sr-root", type=Path, default=Path(os.environ.get("SR_ROOT", str(Path.home() / "scenario_runner"))))
    parser.add_argument("--timeout", type=float, default=240.0)
    parser.add_argument("--camera", action="store_true")
    parser.add_argument("--keep-frames", action="store_true", help="Giữ ảnh PNG camera sau khi ghép video.mp4 (mặc định xoá để đỡ ~70 MB mỗi run)")
    parser.add_argument("--hud", action=argparse.BooleanOptionalAction, default=True,
                        help="follow_hero vẽ tốc độ/bàn đạp cạnh xe trong cửa sổ CARLA (mặc định bật; --no-hud để tắt)")
    parser.add_argument("--fast", action="store_true", help="tương thích hợp đồng worker; ScenarioRunner dùng sync tick")
    parser.add_argument("--status", action="store_true")
    args = parser.parse_args(argv)
    install_stop_handlers()
    if args.status:
        print(json.dumps(probe(args.host, args.port, args.sr_root), ensure_ascii=False))
        return 0
    if args.xosc is None:
        parser.error("cần file .xosc hoặc --status")
    if args.xosc.suffix.lower() == ".json":
        print(LEGACY_JSON_MESSAGE, file=sys.stderr)
        return EXIT_BAD_INPUT
    try:
        return run(args)
    except RunStoppedError as exc:
        print(str(exc), file=sys.stderr)
        return EXIT_STOPPED
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print(str(exc), file=sys.stderr)
        return EXIT_SIMULATOR_ERROR


if __name__ == "__main__":
    raise SystemExit(main())
