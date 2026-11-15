"""Bám camera của CARLA vào xe ego trong lúc scenario chạy — công cụ dev.

Vấn đề nó giải: ScenarioRunner **không** di chuyển spectator camera. Kịch bản chạy
ở toạ độ nào đó trên Town04, còn cửa sổ CarlaUE4 vẫn nhìn vào chỗ map được load.
Nhìn vào đó thấy đường trống và tưởng scenario không chạy.

Script này chỉ **đọc** vị trí xe rồi **đặt** spectator. Nó không gọi ``world.tick()``
nên không phá chế độ synchronous mà ScenarioRunner đang giữ.

``--hud`` vẽ thêm chữ cạnh xe trong cửa sổ CARLA: tốc độ, gia tốc dọc, bàn đạp ga/phanh
(cả phanh do controller AEB áp), thời gian mô phỏng và khoảng cách tâm-tâm tới người đi bộ /
xe gần nhất. Chỉ là số vật lý đọc từ CARLA — quyết định AEB, TTC của AEB ở lõi Java (ADR-042),
không tính ở đây. Chữ ``draw_string`` chỉ thấy trong cửa sổ server, không vào ảnh camera; tắt mặc định.

Nhịp vẽ (đo CARLA 0.9.16 ngày 15/11/2026): chữ vẽ sau tick N đến server lúc trước, lúc sau khung hình
kế tiếp (đua với tick của ScenarioRunner), nên vẽ mỗi tick thì khung có hai bản lệch nhau ("50.0" đọc
thành "60.0") hoặc không có bản nào. Vì vậy HUD chỉ đổi số ``--hud-hz`` lần/giây (giờ thật), mỗi bản
sống đúng một chu kỳ; camera vẫn bám xe từng tick (``wait_for_tick``, không tick).

Chạy song song với scenario (terminal thứ ba), hoặc để ``run_xosc.py`` tự bật:

    worker/.venv/bin/python worker/follow_hero.py
    worker/.venv/bin/python worker/follow_hero.py --view bird
    worker/.venv/bin/python worker/follow_hero.py --hud

Ctrl-C để dừng. Không tìm thấy ego thì nó chờ, không thoát — bật trước khi chạy
scenario cũng được.
"""

from __future__ import annotations

import argparse
import math
import sys
import time

try:
    import carla
except ImportError:  # pragma: no cover - chỉ xảy ra khi chạy sai python; test phần số không cần carla
    carla = None

ROLE_NAME = "hero"
TARGET_REFRESH_S = 1.0  # danh sách người đi bộ / xe khác: lấy lại mỗi giây, không gọi get_actors() mỗi tick


def find_hero(world: carla.World) -> carla.Actor | None:
    """Xe ego. ScenarioRunner đặt ``role_name='hero'`` theo Property trong .xosc."""
    vehicles = world.get_actors().filter("vehicle.*")
    for actor in vehicles:
        if actor.attributes.get("role_name") == ROLE_NAME:
            return actor
    # Kịch bản không khai role_name thì đành lấy xe đầu tiên còn hơn không thấy gì.
    return vehicles[0] if len(vehicles) else None


def chase_transform(vehicle_tf: carla.Transform, distance: float, height: float) -> carla.Transform:
    """Camera lùi ra sau và nâng lên, nhìn chếch xuống theo hướng xe."""
    yaw = math.radians(vehicle_tf.rotation.yaw)
    location = carla.Location(
        x=vehicle_tf.location.x - distance * math.cos(yaw),
        y=vehicle_tf.location.y - distance * math.sin(yaw),
        z=vehicle_tf.location.z + height,
    )
    pitch = -math.degrees(math.atan2(height, max(distance, 0.1)))
    return carla.Transform(location, carla.Rotation(pitch=pitch, yaw=vehicle_tf.rotation.yaw))


def bird_transform(vehicle_tf: carla.Transform, height: float) -> carla.Transform:
    """Nhìn thẳng từ trên xuống. Dễ thấy đổi làn hơn hẳn camera sau lưng."""
    location = carla.Location(
        x=vehicle_tf.location.x,
        y=vehicle_tf.location.y,
        z=vehicle_tf.location.z + height,
    )
    return carla.Transform(location, carla.Rotation(pitch=-90.0, yaw=vehicle_tf.rotation.yaw))


def longitudinal(vec, forward) -> float:  # noqa: ANN001 - carla.Vector3D hoặc vật có x/y/z
    """Thành phần dọc thân xe: âm là đang giảm tốc."""
    return vec.x * forward.x + vec.y * forward.y + vec.z * forward.z


def hud_lines(
    speed_mps: float,
    accel_mps2: float,
    throttle: float,
    brake: float,
    sim_time_s: float,
    pedestrian_m: float | None,
    vehicle_m: float | None,
) -> list[str]:
    """Các dòng chữ HUD, từ trên xuống. ASCII không dấu: font debug của CARLA không chắc có glyph tiếng Việt."""
    accel = round(accel_mps2, 1) + 0.0  # không in "-0.0"
    lines = [
        f"v {speed_mps * 3.6:5.1f} km/h   a {accel:+5.1f} m/s2",
        f"ga {throttle:4.2f}   phanh {brake:4.2f}",
    ]
    gaps = []
    if pedestrian_m is not None:
        gaps.append(f"nguoi {pedestrian_m:5.1f} m")
    if vehicle_m is not None:
        gaps.append(f"xe {vehicle_m:5.1f} m")
    lines.append(f"t {sim_time_s:6.2f} s" + ("   " + "   ".join(gaps) + " (tam-tam)" if gaps else ""))
    return lines


def nearest(origin, actors) -> float | None:  # noqa: ANN001 - carla.Location, list[carla.Actor]
    best = None
    for actor in actors:
        try:
            d = origin.distance(actor.get_location())
        except RuntimeError:  # actor vừa bị huỷ
            continue
        if best is None or d < best:
            best = d
    return best


def draw_hud(world, hero, snapshot, t0: float, life_time: float, walkers, others) -> None:  # noqa: ANN001
    """Chỉ dùng ``draw_string``: chữ chỉ hiện ở cửa sổ server. ``draw_point``/``draw_box``/``draw_line`` là hình trong world
    và **lọt vào ảnh camera RGB** (kiểm CARLA 0.9.16 ngày 15/11/2026) — dùng chúng sẽ làm bẩn dữ liệu cảm biến của run."""
    tf = hero.get_transform()
    forward = tf.get_forward_vector()
    control = hero.get_control()
    velocity = hero.get_velocity()
    lines = hud_lines(
        speed_mps=math.sqrt(longitudinal(velocity, velocity)),
        accel_mps2=longitudinal(hero.get_acceleration(), forward),
        throttle=control.throttle,
        brake=control.brake,
        sim_time_s=snapshot.timestamp.elapsed_seconds - t0,
        pedestrian_m=nearest(tf.location, walkers),
        vehicle_m=nearest(tf.location, others),
    )
    white, red = carla.Color(255, 255, 255), carla.Color(255, 60, 60)
    for i, text in enumerate(lines):
        location = carla.Location(x=tf.location.x, y=tf.location.y, z=tf.location.z + 3.2 - 0.45 * i)
        color = red if i == 1 and control.brake > 0.0 else white
        world.debug.draw_string(location, text, draw_shadow=True, color=color, life_time=life_time)


def main() -> int:
    p = argparse.ArgumentParser(description="Bám spectator camera vào ego")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=2000)
    p.add_argument("--view", choices=["chase", "bird"], default="chase")
    p.add_argument("--distance", type=float, default=12.0, help="chase: lùi sau bao nhiêu mét")
    p.add_argument("--height", type=float, default=6.0, help="chase: nâng cao bao nhiêu mét")
    p.add_argument("--bird-height", type=float, default=45.0, help="bird: cao bao nhiêu mét")
    p.add_argument("--rate", type=float, default=30.0, help="số lần cập nhật mỗi giây (không dùng khi --hud)")
    p.add_argument("--timeout", type=float, default=0.0, help="tự thoát sau N giây (0 = chạy mãi)")
    p.add_argument("--hud", action="store_true", help="vẽ tốc độ/gia tốc/bàn đạp/khoảng cách cạnh xe trong cửa sổ CARLA")
    p.add_argument("--hud-hz", type=float, default=5.0, help="số lần đổi chữ HUD mỗi giây (giờ thật)")
    args = p.parse_args()
    if carla is None:
        sys.exit("Không import được carla. Dùng python của worker/.venv-carla, xem docs/vehicsim/carla-local.md.")

    client = carla.Client(args.host, args.port)
    client.set_timeout(10.0)

    period = 1.0 / max(args.rate, 1.0)
    started = time.time()
    world = None
    spectator = None
    hero = None
    walkers, others, targets_at, drawn_at = [], [], 0.0, 0.0
    hud_period = 1.0 / max(args.hud_hz, 0.5)
    t0 = None  # giờ mô phỏng lúc thấy ego: HUD hiện thời gian của kịch bản, không phải giờ server từ lúc bật
    announced = False

    print(f"Đang bám ego ({args.view}{', HUD' if args.hud else ''}). Ctrl-C để dừng.", flush=True)
    try:
        while args.timeout <= 0 or time.time() - started < args.timeout:
            try:
                # Lấy lại world mỗi khi mất dấu ego. **Bắt buộc**: ScenarioRunner
                # gọi load_world() theo <LogicFile> trong .xosc, và lần load đó
                # thay hẳn world trên server. Một tham chiếu ``world`` lấy một lần
                # lúc khởi động sẽ trỏ vào world CŨ sau khi map đổi — spectator
                # cũ vẫn nhận set_transform() nhưng không còn cái nào đang hiển thị.
                # Triệu chứng đúng như đã gặp: script chạy, không lỗi, camera đứng im.
                if world is None or spectator is None:
                    world = client.get_world()
                    spectator = world.get_spectator()
                    hero = None

                if hero is None or not hero.is_alive:
                    hero = find_hero(world)
                if hero is None:
                    announced = False
                    world = None  # có thể map vừa bị đổi — lấy lại ở vòng sau
                    time.sleep(0.25)
                    continue

                if not announced:
                    print(f"Thấy ego: {hero.type_id} (id={hero.id}) trên {world.get_map().name}", flush=True)
                    announced = True
                    targets_at, t0 = 0.0, None

                if args.hud:
                    # Chỉ chờ tick của ScenarioRunner, không tick: vẽ mỗi bước để chữ không nháy.
                    snapshot = world.wait_for_tick(2.0)
                    if t0 is None:
                        t0 = snapshot.timestamp.elapsed_seconds
                    if time.time() - targets_at > TARGET_REFRESH_S:
                        actors = world.get_actors()
                        walkers = list(actors.filter("walker.pedestrian.*"))
                        others = [a for a in actors.filter("vehicle.*") if a.id != hero.id]
                        targets_at = time.time()

                tf = hero.get_transform()
                spectator.set_transform(
                    bird_transform(tf, args.bird_height)
                    if args.view == "bird"
                    else chase_transform(tf, args.distance, args.height)
                )
                if args.hud:
                    if time.time() - drawn_at >= hud_period:
                        drawn_at = time.time()
                        draw_hud(world, hero, snapshot, t0, hud_period, walkers, others)
                else:
                    time.sleep(period)
            except RuntimeError as exc:
                # Hay gặp lúc server đang load map: RPC timeout, actor vừa bị huỷ.
                # Đây là trạng thái bình thường, không phải lý do để thoát.
                print(f"[tạm mất kết nối] {exc}", file=sys.stderr, flush=True)
                world = None
                announced = False
                time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nĐã dừng bám.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
