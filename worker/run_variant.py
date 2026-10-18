"""Chạy MỘT biến thể VehicSim trên CARLA — xem trực tiếp trong cửa sổ CARLA.

    # CARLA 0.9.15 đang chạy (cách bật server: CLAUDE.md, mục "CARLA trên máy dev này")
    worker/.venv/bin/python worker/run_variant.py vehicsim-run-42.json
    worker/.venv/bin/python worker/run_variant.py vehicsim-run-42.json --video --map Town05
    worker/.venv/bin/python worker/run_variant.py scenario_ir.json --aeb aeb_v1.2.json --seed 7

File JSON là bundle web xuất ở màn "Chi tiết lỗi" / "Phát lại" (nút "Tải JSON chạy
CARLA") hoặc Scenario IR ở màn "Sinh từ mô tả". Cùng tham số và cùng ``result.json``
với ``kinematic_sim.py`` — backend gọi được cả hai như nhau (ADR-027).

Dựng cảnh
---------
Tìm một đoạn làn **thẳng tuyệt đối**, không qua giao lộ, đủ dài cho biến thể (ưu
tiên làn ngoài cùng bên phải). Ego đặt ở đầu đoạn, chạy đều ``ego_speed_kmh``; điểm
giao cắt nằm trước mũi xe ``trigger + 1,5 s × tốc độ`` — đúng như bộ động học.
Người đi bộ đứng cách tim làn 3,6 m bên phải và **bắt đầu đi khi mũi xe còn cách
vạch ``trigger_distance_m``** (trigger tương đối, không theo giây tuyệt đối).

AEB
---
Chính ``AebStack`` của bộ động học: mỗi tick đọc ground truth từ CARLA, AEB trả mức
giảm tốc, file này đổi ra bàn đạp phanh. Perception vẫn là mô hình tổng hợp trên
ground truth (chưa đọc camera/LiDAR) — khác biệt với bộ động học nằm ở **vật lý xe
và va chạm** của CARLA, kể cả cách người đi bộ tăng tốc.

Đã đo trên CARLA 0.9.16 (01/10/2026, TD-17): phanh hết cỡ ở 40 km/h, xe mặc định chỉ
giảm tốc ~4,6 m/s² (``--full-brake-decel``), rồi dưới ~6 m/s thì dừng gần như tức
thì (đo ra 21–27 m/s², vượt μ·g); ``apply_physics_control`` đổi ma sát lốp / mô-men
phanh **không** thay đổi kết quả — nên mưa/đường trơn mới chỉ có hình ảnh, chưa vào
vật lý. Giảm tốc ghi vào frame bị kẹp ở μ·g và số khung bị kẹp ghi vào
``case.carla.decel_clamped_frames``.

Xe (ADR-033)
------------
Blueprint và vật lý lấy từ ``vehicle.carla`` của bundle, tức từ DB (``carla_vehicle_models``, ADR-038):
spawn đúng blueprint, ép khối lượng / hệ số cản / trường bánh
xe bằng ``apply_physics_control``, đọc lại sau khi xe tiếp đất rồi ghi bảng đối chiếu
"cấu hình ↔ CARLA" vào ``case.carla.vehicle_check``. Kích thước không ép được (gắn với
mesh); phanh tối đa chỉ ép được chiều yếu hơn (AEB không xin quá ``max_brake_decel_mps2``).
``--blueprint`` trên dòng lệnh vẫn thắng, để thử nhanh một xe khác.

Ranh giới: file này được ``import carla`` (venv worker, Python 3.10); lõi ``vehicsim_core`` và backend Java thì
không bao giờ (``worker/tests``). ``carla`` chỉ được import trong
``run_on_carla`` để test kiểm phần hình học không cần CARLA.
"""

from __future__ import annotations

import argparse
import queue
import shutil
import subprocess
import sys
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path

import sim_common
from vehicsim_core.aeb_stack import DT, record_event
from vehicsim_core.bundle import PHYSICS_SCALARS, WHEEL_FIELDS, RunSpec, carla_simulator
from vehicsim_core.simulator import (
    CURB_SLOWDOWN_M,
    CURB_STOP_Y_M,
    MAX_DURATION_S,
    PEDESTRIAN_RADIUS_M,
    PEDESTRIAN_START_Y_M,
    G,
    MotionStats,
    SimulationOutcome,
    build_outcome,
    ground_truth_ttc,
    make_frame,
    new_aeb_stack,
)

DEFAULT_BLUEPRINT = "vehicle.audi.etron"  # SUV điện cỡ VF8 (4,9 × 1,93 m); CARLA không có VinFast
WALKER_BLUEPRINT = "walker.pedestrian.0001"
CLEARANCE_AFTER_M = 15.0  # đoạn thẳng còn phải có sau vạch để xe chạy qua hết
MAX_LATERAL_DEVIATION_M = 0.3  # đoạn "thẳng": mọi waypoint lệch khỏi đường thẳng đầu đoạn ít hơn mức này
MAX_HEADING_DEVIATION_DEG = 1.0
SETTLE_TICKS = 10  # cho xe/người tiếp đất trước khi bắt đầu đo
ROLE_PREFIX = "vehicsim_"  # role_name của mọi actor runner tạo — để lần sau nhận ra đồ bỏ lại
FFMPEG_TIMEOUT_S = 120


# ---------------------------------------------------------------------------
# Phần thuần (không cần CARLA) — tests/test_worker/test_run_variant.py
# ---------------------------------------------------------------------------


def weather_parameters(weather: str, time_of_day: str) -> dict[str, float]:
    """Mã thời tiết/thời điểm VehicSim -> tham số ``carla.WeatherParameters``."""
    base = {
        "cloudiness": 10.0,
        "precipitation": 0.0,
        "precipitation_deposits": 0.0,
        "wind_intensity": 5.0,
        "fog_density": 0.0,
        "fog_distance": 0.0,
        "wetness": 0.0,
        "sun_azimuth_angle": 45.0,
    }
    per_weather = {
        "CLEAR": {},
        "CLOUDY": {"cloudiness": 80.0},
        "RAIN": {
            "cloudiness": 80.0,
            "precipitation": 50.0,
            "precipitation_deposits": 40.0,
            "wetness": 60.0,
            "wind_intensity": 20.0,
        },
        "HEAVY_RAIN": {
            "cloudiness": 100.0,
            "precipitation": 100.0,
            "precipitation_deposits": 90.0,
            "wetness": 100.0,
            "wind_intensity": 60.0,
        },
        "FOG": {"cloudiness": 60.0, "fog_density": 60.0, "fog_distance": 10.0, "wetness": 20.0},
    }
    sun_altitude = {"DAY": 60.0, "DUSK": 4.0, "NIGHT": -40.0}
    return {**base, **per_weather.get(weather, {}), "sun_altitude_angle": sun_altitude.get(time_of_day, 60.0)}


@dataclass(frozen=True)
class CrossingFrame:
    """Hệ toạ độ đặt ở điểm giao cắt: gốc tại tim làn ego trên vạch băng qua.

    ``fwd``/``right`` lấy thẳng từ ``Transform.get_forward_vector()`` /
    ``get_right_vector()`` của waypoint — không tự suy từ yaw, vì CARLA dùng hệ
    tay trái. Đổi sang hệ của bộ động học: dọc đường là ``along``, ngang lấy bên
    TRÁI là dương (``left``).
    """

    ox: float
    oy: float
    fx: float
    fy: float
    rx: float
    ry: float

    def along(self, x: float, y: float) -> float:
        return (x - self.ox) * self.fx + (y - self.oy) * self.fy

    def left(self, x: float, y: float) -> float:
        return -((x - self.ox) * self.rx + (y - self.oy) * self.ry)

    def velocity_along(self, vx: float, vy: float) -> float:
        return vx * self.fx + vy * self.fy

    def velocity_left(self, vx: float, vy: float) -> float:
        return -(vx * self.rx + vy * self.ry)


def walker_speed(case, ped_y: float, started: bool) -> float:
    """Tốc độ người đi bộ cần đặt ở tick này — cùng luật "chậm dần rồi dừng ở lề" với bộ động học."""
    if not started:
        return 0.0
    if case.stops_at_curb:
        if ped_y >= CURB_STOP_Y_M:
            return 0.0
        remaining = CURB_STOP_Y_M - ped_y
        return case.pedestrian_speed_mps * max(0.15, min(1.0, remaining / CURB_SLOWDOWN_M))
    return case.pedestrian_speed_mps


def brake_pedal(decel_cmd: float, measured_decel: float, full_brake_decel: float, gain: float = 0.05) -> float:
    """Mức giảm tốc AEB yêu cầu (m/s²) -> bàn đạp phanh CARLA [0, 1].

    Feed-forward theo giả định bàn đạp tỉ lệ tuyến tính với giảm tốc (1,0 ứng với
    ``full_brake_decel``), cộng một chút bù theo sai số đo được ở tick trước.
    """
    if decel_cmd <= 0:
        return 0.0
    pedal = decel_cmd / full_brake_decel + gain * (decel_cmd - measured_decel)
    return max(0.0, min(1.0, pedal))


class DecelMeter:
    """Giảm tốc đo từ tốc độ CARLA: trung bình trượt qua ``window`` tick, kẹp ở ``limit``.

    - Trước khi AEB phanh luôn trả 0: ở chế độ giữ tốc độ tốc độ đọc về dao động
      ±0,1 m/s mỗi tick — đạo hàm thô ra "giảm tốc" 4 m/s² giả.
    - Khi phanh, tốc độ đọc về có dạng răng cưa chu kỳ 2 tick (đo: 2 rồi 7 m/s² xen
      kẽ, trung bình 4,6) — cửa sổ 2 tick lấy đúng một chu kỳ.
    - Dưới ~6 m/s xe CARLA dừng gần như tức thì (21–27 m/s²): giá trị vượt ``limit``
      (μ·g, giới hạn vật lý của lốp) bị kẹp và đếm vào ``clamped``.
    """

    def __init__(self, limit: float, window: int = 2) -> None:
        self.limit = limit
        self.clamped = 0
        self.speeds: deque[float] = deque(maxlen=window + 1)

    def update(self, speed: float, *, braking: bool) -> float:
        self.speeds.append(speed)
        if not braking or len(self.speeds) < 2:
            return 0.0
        decel = max(0.0, (self.speeds[0] - self.speeds[-1]) / (DT * (len(self.speeds) - 1)))
        if decel > self.limit:
            self.clamped += 1
            return self.limit
        return decel


def required_length_m(spec: RunSpec) -> float:
    """Đoạn thẳng tối thiểu: tới vạch + thân xe + đoạn đệm sau vạch."""
    return spec.case.crossing_x + spec.vehicle.length_m + CLEARANCE_AFTER_M


DIMENSION_TOLERANCE_M = 0.05  # mesh lệch cấu hình quá mức này thì báo MISMATCH
UNVERIFIED_WHEEL_FIELDS = ("tire_friction", "max_brake_torque")  # TD-17: đổi mà quãng phanh không đổi


def ego_blueprint(spec: RunSpec, cli_blueprint: str | None) -> str:
    """``--blueprint`` > blueprint trong DB (bundle) > mặc định."""
    return cli_blueprint or spec.vehicle_carla.get("blueprint") or DEFAULT_BLUEPRINT


def apply_physics_overrides(pc, physics: dict, vector3d) -> None:
    """Ghi ``physics`` (đã kiểm ở ``bundle``) vào một ``VehiclePhysicsControl`` đọc từ xe.

    ``wheels`` là một object (mọi bánh) hoặc danh sách theo thứ tự bánh của CARLA.
    Người gọi tự ``apply_physics_control`` — hàm này chỉ sửa đối tượng để test được không cần CARLA.
    """
    for key in PHYSICS_SCALARS:
        if key in physics:
            setattr(pc, key, physics[key])
    if "center_of_mass" in physics:
        com = physics["center_of_mass"]
        pc.center_of_mass = vector3d(com["x"], com["y"], com["z"])
    requested = physics.get("wheels")
    if requested is not None:
        wheels = list(pc.wheels)  # CARLA trả bản sao: sửa rồi gán lại cả danh sách
        per_wheel = requested if isinstance(requested, list) else [requested] * len(wheels)
        if len(per_wheel) != len(wheels):
            raise RuntimeError(f"physics.wheels có {len(per_wheel)} phần tử nhưng xe có {len(wheels)} bánh")
        for wheel, values in zip(wheels, per_wheel):
            for key, value in values.items():
                setattr(wheel, key, value)
        pc.wheels = wheels


def wheelbase_m(positions) -> float | None:
    """Chiều dài cơ sở từ vị trí bánh của CARLA (cm, thứ tự trước-trái, trước-phải, sau-trái, sau-phải)."""
    if len(positions) < 4:
        return None
    fx, fy = (positions[0].x + positions[1].x) / 2, (positions[0].y + positions[1].y) / 2
    rx, ry = (positions[2].x + positions[3].x) / 2, (positions[2].y + positions[3].y) / 2
    return ((fx - rx) ** 2 + (fy - ry) ** 2) ** 0.5 / 100.0


def physics_snapshot(pc, extent) -> dict:
    """Thông số xe CARLA thực sự dùng (đọc lại sau khi ép) + kích thước mesh."""
    return {
        **{key: float(getattr(pc, key)) for key in PHYSICS_SCALARS},
        "center_of_mass": {axis: float(getattr(pc.center_of_mass, axis)) for axis in ("x", "y", "z")},
        "wheels": [{key: float(getattr(w, key)) for key in WHEEL_FIELDS} for w in pc.wheels],
        "length_m": 2 * float(extent.x),
        "width_m": 2 * float(extent.y),
        "height_m": 2 * float(extent.z),
        "wheelbase_m": wheelbase_m([w.position for w in pc.wheels]),
    }


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= max(1e-3, 1e-3 * abs(a))


def vehicle_check(spec: RunSpec, actual: dict, *, blueprint: str, full_brake_decel: float) -> list[dict]:
    """Bảng đối chiếu "cấu hình trong DB ↔ CARLA thực tế", mỗi dòng một thông số.

    Trạng thái: MATCH (khớp sẵn) · APPLIED (đã ép, đọc lại khớp) · NOT_APPLIED (đã ép nhưng đọc
    lại khác) · MISMATCH (khác và không ép được) · CONTROLLER_CAP (ép bằng bộ điều khiển: AEB
    không xin quá mức này) · UNREACHABLE (CARLA phanh hết cỡ cũng không đạt) · CLI_OVERRIDE.
    """
    rows: list[dict] = []

    def add(param: str, configured, carla_value, status: str, note: str = "") -> None:
        rows.append({"param": param, "configured": configured, "carla": carla_value, "status": status, "note": note})

    wanted = spec.vehicle_carla.get("blueprint")
    if wanted is not None:
        add("blueprint", wanted, blueprint, "MATCH" if wanted == blueprint else "CLI_OVERRIDE")

    dims = {"length_m": spec.vehicle.length_m, "width_m": spec.vehicle.width_m}
    dims.update(spec.vehicle_carla.get("dimensions") or {})
    for key, configured in dims.items():
        carla_value = actual.get(key)
        if carla_value is None:
            continue
        ok = abs(configured - carla_value) <= DIMENSION_TOLERANCE_M
        add(
            key,
            configured,
            round(carla_value, 3),
            "MATCH" if ok else "MISMATCH",
            "" if ok else "Gắn với mesh của blueprint — CARLA không ép được; bộ động học dùng số cấu hình",
        )

    physics = spec.vehicle_carla.get("physics") or {}
    for key in PHYSICS_SCALARS:
        if key in physics:
            add(key, physics[key], actual[key], "APPLIED" if _close(physics[key], actual[key]) else "NOT_APPLIED")
    if "center_of_mass" in physics:
        want, got = physics["center_of_mass"], actual["center_of_mass"]
        same = all(_close(want[a], got[a]) for a in ("x", "y", "z"))
        add("center_of_mass", want, got, "APPLIED" if same else "NOT_APPLIED")
    requested = physics.get("wheels")
    if requested is not None:
        per_wheel = requested if isinstance(requested, list) else [requested] * len(actual["wheels"])
        for key in WHEEL_FIELDS:
            pairs = [(w[key], got[key]) for w, got in zip(per_wheel, actual["wheels"]) if key in w]
            if not pairs:
                continue
            same = all(_close(want, got) for want, got in pairs)
            add(
                f"wheels.{key}",
                [want for want, _ in pairs],
                [round(got, 3) for _, got in pairs],
                "APPLIED" if same else "NOT_APPLIED",
                "TD-17: CARLA nhận giá trị nhưng chưa đo được tác dụng lên quãng phanh"
                if same and key in UNVERIFIED_WHEEL_FIELDS
                else "",
            )

    cap = spec.vehicle.max_brake_decel_mps2
    if cap <= full_brake_decel:
        add("max_brake_decel_mps2", cap, full_brake_decel, "CONTROLLER_CAP", "AEB không xin quá mức này")
    else:
        add(
            "max_brake_decel_mps2",
            cap,
            full_brake_decel,
            "UNREACHABLE",
            f"CARLA phanh hết cỡ chỉ đạt ~{full_brake_decel:g} m/s² (--full-brake-decel)",
        )
    return rows


# ---------------------------------------------------------------------------
# Phần CARLA
# ---------------------------------------------------------------------------


def _straight_path(carla, start, length_m: float, step_m: float = 2.0):
    """Các waypoint cách nhau ``step_m`` từ ``start``, hoặc None nếu đoạn không thẳng/đủ dài."""
    t0 = start.transform
    f0, r0 = t0.get_forward_vector(), t0.get_right_vector()
    yaw0 = t0.rotation.yaw
    path = [start]
    travelled = 0.0
    while travelled < length_m:
        nxt = path[-1].next(step_m)
        if not nxt:
            return None
        wp = nxt[0]
        if wp.is_junction or wp.lane_type != carla.LaneType.Driving:
            return None
        d = wp.transform.location - t0.location
        lateral = d.x * r0.x + d.y * r0.y
        heading = (wp.transform.rotation.yaw - yaw0 + 180.0) % 360.0 - 180.0
        if abs(lateral) > MAX_LATERAL_DEVIATION_M or abs(heading) > MAX_HEADING_DEVIATION_DEG:
            return None
        if d.x * f0.x + d.y * f0.y <= travelled:  # đi lùi/vòng lại: không phải đoạn thẳng
            return None
        path.append(wp)
        travelled += step_m
    return path


def _candidate_starts(carla, cmap):
    """Điểm đầu đoạn theo thứ tự cố định: làn ngoài cùng bên phải trước, rồi mọi làn xe."""
    starts = [w for w in cmap.generate_waypoints(4.0) if w.lane_type == carla.LaneType.Driving and not w.is_junction]

    def rightmost(w) -> bool:
        right = w.get_right_lane()
        return right is None or right.lane_type != carla.LaneType.Driving

    return [w for w in starts if rightmost(w)] + [w for w in starts if not rightmost(w)]


def _to_carla_weather(carla, spec: RunSpec):
    return carla.WeatherParameters(**weather_parameters(spec.case.weather, spec.case.time_of_day))


class _Scene:
    """Các actor đã spawn; ``destroy`` luôn chạy trong ``finally``."""

    def __init__(self) -> None:
        self.sensors: list = []
        self.actors: list = []

    def destroy(self) -> None:
        for sensor in self.sensors:
            try:
                sensor.stop()
            except RuntimeError:
                pass
        for actor in [*self.sensors, *self.actors]:
            try:
                actor.destroy()
            except RuntimeError:
                pass
        self.sensors.clear()
        self.actors.clear()


def _spawn_scene(carla, world, spec: RunSpec, args, scene: _Scene, blueprint: str):
    """Thử lần lượt các đoạn thẳng cho tới khi đặt được cả xe lẫn người đi bộ."""
    cmap = world.get_map()
    library = world.get_blueprint_library()
    ego_bp = library.find(blueprint)
    ego_bp.set_attribute("role_name", f"{ROLE_PREFIX}ego")  # runner tự lái camera, không cần follow_hero.py
    walker_bp = library.find(WALKER_BLUEPRINT)
    walker_bp.set_attribute("role_name", f"{ROLE_PREFIX}pedestrian")
    if walker_bp.has_attribute("is_invincible"):
        walker_bp.set_attribute("is_invincible", "false")

    need = required_length_m(spec) + 6.0  # + chỗ cho phần đầu xe tính từ tâm
    usable = 0
    for start in _candidate_starts(carla, cmap):
        path = _straight_path(carla, start, need)
        if path is None:
            continue
        if usable < args.spot:
            usable += 1
            continue
        spawn = carla.Transform(start.transform.location + carla.Location(z=0.3), start.transform.rotation)
        ego = world.try_spawn_actor(ego_bp, spawn)
        if ego is None:
            continue
        bbox = ego.bounding_box
        front_offset = bbox.location.x + bbox.extent.x
        crossing_wp = start.next(front_offset + spec.case.crossing_x)[0]
        ct = crossing_wp.transform
        fwd, right = ct.get_forward_vector(), ct.get_right_vector()
        offset = -PEDESTRIAN_START_Y_M  # 3,6 m về bên phải tim làn
        walker_loc = carla.Location(
            x=ct.location.x + right.x * offset, y=ct.location.y + right.y * offset, z=ct.location.z + 1.0
        )
        walker = world.try_spawn_actor(
            walker_bp, carla.Transform(walker_loc, carla.Rotation(yaw=ct.rotation.yaw - 90.0))
        )
        if walker is None:
            ego.destroy()
            continue
        scene.actors += [ego, walker]
        frame = CrossingFrame(ct.location.x, ct.location.y, fwd.x, fwd.y, right.x, right.y)
        return ego, walker, frame, front_offset, start
    raise RuntimeError(
        f"Không tìm được đoạn làn thẳng ≥ {need:.0f} m trên map {cmap.name} để đặt cảnh "
        f"(hoặc mọi chỗ đều vướng vật cản). Thử --map Town04 hoặc Town05, hoặc giảm --spot."
    )


def _chase_camera(carla, ego, back_m: float = 8.0, up_m: float = 3.5):
    t = ego.get_transform()
    f = t.get_forward_vector()
    loc = carla.Location(x=t.location.x - f.x * back_m, y=t.location.y - f.y * back_m, z=t.location.z + up_m)
    return carla.Transform(loc, carla.Rotation(pitch=-12.0, yaw=t.rotation.yaw))


def _encode_video(frames_dir: Path, target: Path) -> Path | None:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return None
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-framerate", str(round(1 / DT)), "-i", str(frames_dir / "%06d.png")]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", str(target)]
    try:
        done = subprocess.run(cmd, check=False, timeout=FFMPEG_TIMEOUT_S)
    except subprocess.TimeoutExpired:  # run() đã giết ffmpeg; giữ lại ảnh PNG
        return None
    return target if done.returncode == 0 else None


def _destroy_leftovers(world) -> int:
    """Xoá actor ``vehicsim_*`` mà lần chạy trước bị giết cứng để lại; trả số actor đã xoá."""
    leftovers = [a for a in world.get_actors() if a.attributes.get("role_name", "").startswith(ROLE_PREFIX)]
    for actor in sorted(leftovers, key=lambda a: not a.type_id.startswith("sensor.")):  # cảm biến trước
        if actor.type_id.startswith("sensor."):
            actor.stop()
        actor.destroy()
    return len(leftovers)


def _release(world, original) -> None:
    """Trả server về chế độ không đồng bộ khi thoát — kể cả khi trước đó đang đồng bộ.

    "Trước đó đang đồng bộ" thường là do một lần chạy bị giết cứng để lại; khôi phục
    nguyên trạng thì server vẫn chờ một tick không bao giờ đến và đứng hình.
    """
    settings = world.get_settings()
    settings.synchronous_mode = False
    settings.fixed_delta_seconds = None if original.synchronous_mode else original.fixed_delta_seconds
    world.apply_settings(settings)


def run_on_carla(spec: RunSpec, args, out: Path) -> tuple[SimulationOutcome, str, dict]:
    import carla  # chỉ có trong venv worker

    client = carla.Client(args.host, args.port)
    client.set_timeout(args.connect_timeout)
    name = carla_simulator(client.get_server_version())
    world = client.get_world()
    if args.map and not world.get_map().name.endswith(args.map):
        print(f"Đang nạp map {args.map}…")
        world = client.load_world(args.map)
    original = world.get_settings()
    if original.synchronous_mode:  # thường do lần chạy trước bị giết cứng: không còn ai tick
        _release(world, original)
    world.wait_for_tick()  # ở chế độ đồng bộ, get_actors() là ảnh cũ cho tới tick kế tiếp (đo 01/10)
    leftovers = _destroy_leftovers(world)
    if leftovers or original.synchronous_mode:
        print(
            f"Dọn lại sau lần chạy bị ngắt: xoá {leftovers} actor cũ, server đang đồng bộ = {original.synchronous_mode}.",
            file=sys.stderr,
        )
    settings = world.get_settings()
    settings.synchronous_mode = True
    settings.fixed_delta_seconds = DT
    world.apply_settings(settings)

    scene = _Scene()
    artifacts: dict[str, str] = {}
    try:
        world.set_weather(_to_carla_weather(carla, spec))
        blueprint = ego_blueprint(spec, args.blueprint)
        ego, walker, frame, front_offset, start = _spawn_scene(carla, world, spec, args, scene, blueprint)
        physics = spec.vehicle_carla.get("physics") or {}
        if physics:  # ép trước khi xe tiếp đất; đọc lại sau SETTLE_TICKS
            pc = ego.get_physics_control()
            apply_physics_overrides(pc, physics, carla.Vector3D)
            ego.apply_physics_control(pc)

        collisions: list[str] = []
        collision_bp = world.get_blueprint_library().find("sensor.other.collision")
        collision_bp.set_attribute("role_name", f"{ROLE_PREFIX}sensor")
        collision_sensor = world.spawn_actor(collision_bp, carla.Transform(), attach_to=ego)
        scene.sensors.append(collision_sensor)
        collision_sensor.listen(lambda e: collisions.append(e.other_actor.type_id))

        images: queue.Queue = queue.Queue()
        frames_dir = out / "frames"
        if args.video:
            frames_dir.mkdir(parents=True, exist_ok=True)
            cam_bp = world.get_blueprint_library().find("sensor.camera.rgb")
            cam_bp.set_attribute("image_size_x", "1280")
            cam_bp.set_attribute("image_size_y", "720")
            cam_bp.set_attribute("role_name", f"{ROLE_PREFIX}sensor")
            camera = world.spawn_actor(
                cam_bp, carla.Transform(carla.Location(x=-7.0, z=3.0), carla.Rotation(pitch=-12.0)), attach_to=ego
            )
            scene.sensors.append(camera)
            camera.listen(images.put)

        spectator = world.get_spectator()
        ego.apply_control(carla.VehicleControl(hand_brake=True))
        for _ in range(SETTLE_TICKS):
            world.tick()
        checks = vehicle_check(
            spec,
            physics_snapshot(ego.get_physics_control(), ego.bounding_box.extent),
            blueprint=blueprint,
            full_brake_decel=args.full_brake_decel,
        )
        for row in checks:
            if row["status"] in ("NOT_APPLIED", "MISMATCH", "UNREACHABLE"):
                print(f"Xe: {row['param']} cấu hình {row['configured']} ↔ CARLA {row['carla']} ({row['status']})")
        ego.apply_control(carla.VehicleControl(hand_brake=False, throttle=0.0, brake=0.0))
        v0 = spec.case.ego_speed_kmh / 3.6
        ego.enable_constant_velocity(carla.Vector3D(v0, 0.0, 0.0))  # "lái xe giữ ga", tới khi AEB phanh
        world.tick()
        while not images.empty():
            images.get_nowait()

        case, vehicle = spec.case, spec.vehicle
        crossing_x = case.crossing_x
        half_w = vehicle.width_m / 2
        frames: list[dict] = []
        events: list[dict] = []
        stack = new_aeb_stack(case, spec.params, spec.seed, vehicle, events)
        stats = MotionStats()
        ped_started = False
        ped_stopped = False
        braking = False
        meter = DecelMeter(limit=case.road_friction * G)
        end_reason = "TIMEOUT"
        image_index = 0
        print(f"Đang chạy trên {name} · map {world.get_map().name.split('/')[-1]}…")

        for k in range(int(round(MAX_DURATION_S / DT)) + 1):
            tick_started = time.perf_counter()
            t = k * DT
            et, ev = ego.get_transform(), ego.get_velocity()
            ef = et.get_forward_vector()
            front_x = et.location.x + ef.x * front_offset
            front_y = et.location.y + ef.y * front_offset
            gap = -frame.along(front_x, front_y)
            ego_v = max(0.0, frame.velocity_along(ev.x, ev.y))
            ego_y = frame.left(et.location.x, et.location.y)
            wl, wv = walker.get_location(), walker.get_velocity()
            ped_y = frame.left(wl.x, wl.y)
            ped_vy = frame.velocity_left(wv.x, wv.y)
            measured_decel = meter.update(ego_v, braking=braking)

            # ---- Người đi bộ: trigger theo khoảng cách --------------------------
            if not ped_started and gap <= case.trigger_distance_m:
                ped_started = True
                record_event(events, t, "gt_start", "Pedestrian starts crossing")
            speed = walker_speed(case, ped_y, ped_started)
            if case.stops_at_curb and ped_started and speed == 0.0 and not ped_stopped:
                ped_stopped = True
                record_event(events, t, "gt_stop", "Pedestrian stops at the curb")
            walker.apply_control(carla.WalkerControl(direction=carla.Vector3D(-frame.rx, -frame.ry, 0.0), speed=speed))

            # ---- AEB cần kiểm thử ----------------------------------------------
            ttc_gt = ground_truth_ttc(gap, ped_y, ego_v, vehicle)
            tick = stack.step(t, gap=gap, ped_y=ped_y, ped_vy=ped_vy, ego_v=ego_v)
            if tick.decel_cmd > 0:
                if not braking:
                    ego.disable_constant_velocity()
                    braking = True
                pedal = brake_pedal(tick.decel_cmd, measured_decel, args.full_brake_decel)
                ego.apply_control(carla.VehicleControl(throttle=0.0, brake=pedal))
            stats.add(measured_decel)
            frames.append(
                make_frame(
                    t=t,
                    ego_x=crossing_x - gap,
                    ego_v=ego_v,
                    ego_decel=measured_decel,
                    crossing_x=crossing_x,
                    ped_y=ped_y,
                    ped_vy=ped_vy,
                    tick=tick,
                    ttc_gt=ttc_gt,
                    stack=stack,
                )
            )

            # ---- Kết thúc: va chạm do CARLA báo, hoặc hình học chồng lấn ------------
            front_along, ped_along = -gap, frame.along(wl.x, wl.y)
            overlap = (
                ped_along - PEDESTRIAN_RADIUS_M <= front_along
                and ped_along + PEDESTRIAN_RADIUS_M >= front_along - vehicle.length_m
                and abs(ped_y - ego_y) <= half_w + PEDESTRIAN_RADIUS_M
            )
            hit_walker = any(type_id.startswith("walker.") for type_id in collisions)
            if hit_walker or overlap:
                end_reason = "COLLISION"
                record_event(
                    events,
                    t,
                    "collision",
                    f"Collision · {ego_v * 3.6:.1f} km/h",
                    impact_speed_mps=round(ego_v, 3),
                    detected_by="carla_sensor" if hit_walker else "geometry",
                )
                break
            if ego_v <= 0.05 and stack.decision_t is not None:
                end_reason = "EGO_STOPPED"
                record_event(events, t, "stopped", "Ego stopped", gap_m=round(gap, 2))
                break
            if front_along - vehicle.length_m > ped_along + 1.0:
                end_reason = "TARGET_CLEARED"
                break

            frame_id = world.tick()
            spectator.set_transform(_chase_camera(carla, ego))
            if args.video:
                image = images.get(timeout=5.0)
                while image.frame < frame_id:
                    image = images.get(timeout=5.0)
                image.save_to_disk(str(frames_dir / f"{image_index:06d}.png"))
                image_index += 1
            if not args.fast:
                time.sleep(max(0.0, DT - (time.perf_counter() - tick_started)))

        if args.video:
            video = _encode_video(frames_dir, out / "video.mp4")
            if video is not None:
                artifacts["video"] = str(video)
            else:
                artifacts["frames"] = str(frames_dir)
                print("Không có ffmpeg trong PATH: giữ ảnh từng khung ở", frames_dir, file=sys.stderr)

        outcome = build_outcome(
            case=case,
            params=spec.params,
            vehicle=vehicle,
            stack=stack,
            stats=stats,
            frames=frames,
            events=events,
            end_reason=end_reason,
            crossing_x=crossing_x,
            decel_available=min(spec.params.max_deceleration, vehicle.max_brake_decel_mps2, case.road_friction * G),
        )
        outcome.case["carla"] = {
            "map": world.get_map().name,
            "blueprint": blueprint,
            "spawn": [round(start.transform.location.x, 2), round(start.transform.location.y, 2)],
            "full_brake_decel": args.full_brake_decel,
            "decel_clamped_frames": meter.clamped,
            "vehicle_check": checks,
        }
        return outcome, name, artifacts
    finally:
        scene.destroy()
        _release(world, original)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sim_common.add_common_args(parser)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=2000)
    parser.add_argument("--connect-timeout", type=float, default=20.0)
    parser.add_argument("--map", help="nạp map trước khi chạy, vd. Town04, Town05 (mặc định: map đang mở)")
    parser.add_argument("--spot", type=int, default=0, help="chọn đoạn thẳng thứ N tìm được (đổi chỗ đặt cảnh)")
    parser.add_argument(
        "--blueprint",
        help=f"blueprint xe ego, thắng giá trị trong JSON (mặc định: vehicle.carla.blueprint, rồi {DEFAULT_BLUEPRINT})",
    )
    parser.add_argument(
        "--full-brake-decel",
        type=float,
        default=4.6,
        help="giảm tốc (m/s²) ứng với bàn đạp phanh 1,0; 4,6 đo trên audi.etron, CARLA 0.9.16 (TD-17)",
    )
    parser.add_argument("--video", action="store_true", help="quay video.mp4 từ camera sau xe (cần ffmpeg)")
    args = parser.parse_args(argv)
    sim_common.install_stop_handlers()
    spec = sim_common.load_spec(args)
    out = sim_common.out_dir(args)
    if spec.case.crossing_x + spec.vehicle.length_m > 250:
        print("Biến thể quá dài cho một đoạn thẳng trên map CARLA.", file=sys.stderr)
        return sim_common.EXIT_BAD_INPUT
    try:
        outcome, name, artifacts = run_on_carla(spec, args, out)
    except ImportError:
        print("Không import được carla: chạy bằng venv của worker (worker/.venv, Python 3.10).", file=sys.stderr)
        return sim_common.EXIT_SIMULATOR_ERROR
    except (RuntimeError, queue.Empty) as exc:  # carla báo lỗi kết nối/spawn bằng RuntimeError
        print(f"CARLA lỗi: {exc or 'camera không trả ảnh'}", file=sys.stderr)
        return sim_common.EXIT_SIMULATOR_ERROR
    return sim_common.finish(args, spec, outcome, simulator=name, artifacts=artifacts)


if __name__ == "__main__":
    raise SystemExit(main())
