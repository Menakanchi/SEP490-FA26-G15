"""Bám camera của CARLA vào xe ego trong lúc scenario chạy — công cụ dev.

Vấn đề nó giải: ScenarioRunner **không** di chuyển spectator camera. Kịch bản chạy
ở toạ độ nào đó trên Town04, còn cửa sổ CarlaUE4 vẫn nhìn vào chỗ map được load.
Nhìn vào đó thấy đường trống và tưởng scenario không chạy.

Script này chỉ **đọc** vị trí xe rồi **đặt** spectator. Nó không gọi ``world.tick()``
nên không phá chế độ synchronous mà ScenarioRunner đang giữ.

Chạy song song với scenario (terminal thứ ba), hoặc để ``dev_ui.py`` tự bật:

    worker/.venv/bin/python worker/follow_hero.py
    worker/.venv/bin/python worker/follow_hero.py --view bird

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
except ImportError:  # pragma: no cover - chỉ xảy ra khi chạy sai python
    sys.exit("Không import được carla. Dùng worker/.venv/bin/python, xem fixtures/README.md.")

ROLE_NAME = "hero"


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


def main() -> int:
    p = argparse.ArgumentParser(description="Bám spectator camera vào ego")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=2000)
    p.add_argument("--view", choices=["chase", "bird"], default="chase")
    p.add_argument("--distance", type=float, default=12.0, help="chase: lùi sau bao nhiêu mét")
    p.add_argument("--height", type=float, default=6.0, help="chase: nâng cao bao nhiêu mét")
    p.add_argument("--bird-height", type=float, default=45.0, help="bird: cao bao nhiêu mét")
    p.add_argument("--rate", type=float, default=30.0, help="số lần cập nhật mỗi giây")
    p.add_argument("--timeout", type=float, default=0.0, help="tự thoát sau N giây (0 = chạy mãi)")
    args = p.parse_args()

    client = carla.Client(args.host, args.port)
    client.set_timeout(10.0)

    period = 1.0 / max(args.rate, 1.0)
    started = time.time()
    world = None
    spectator = None
    announced = False

    print(f"Đang bám ego ({args.view}). Ctrl-C để dừng.", flush=True)
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

                hero = find_hero(world)
                if hero is None:
                    announced = False
                    world = None  # có thể map vừa bị đổi — lấy lại ở vòng sau
                    time.sleep(0.25)
                    continue

                if not announced:
                    print(f"Thấy ego: {hero.type_id} (id={hero.id}) trên {world.get_map().name}", flush=True)
                    announced = True

                tf = hero.get_transform()
                spectator.set_transform(
                    bird_transform(tf, args.bird_height)
                    if args.view == "bird"
                    else chase_transform(tf, args.distance, args.height)
                )
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
