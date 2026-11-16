"""Bám camera của CARLA vào xe ego trong lúc scenario chạy — công cụ dev.

Vấn đề nó giải: ScenarioRunner **không** di chuyển spectator camera. Kịch bản chạy
ở toạ độ nào đó trên Town04, còn cửa sổ CarlaUE4 vẫn nhìn vào chỗ map được load.
Nhìn vào đó thấy đường trống và tưởng scenario không chạy.

Script này chỉ **đọc** vị trí xe rồi **đặt** spectator. Nó không gọi ``world.tick()``
nên không phá chế độ synchronous mà ScenarioRunner đang giữ.

``--hud`` hiện một ô số ở **góc trên trái bên trong cửa sổ CarlaUE4** (cửa sổ thuộc về CARLA: đi theo, bị che và ẩn
cùng CARLA, không nổi riêng trên màn hình; không thấy cửa sổ CARLA thì không hiện): tốc độ, gia tốc dọc thân xe,
bàn đạp ga/phanh (cả phanh do controller AEB áp), thời gian mô phỏng và khoảng cách tâm-tâm tới người đi bộ / xe
gần nhất. Số lấy từ snapshot của **từng tick** (``wait_for_tick``), nên khớp đúng khung xe đang hiện. Chỉ là số vật lý
đọc từ CARLA — quyết định AEB, TTC của AEB ở lõi Java (ADR-042), không tính ở đây.

Vì sao là cửa sổ riêng, không phải ``world.debug.draw_string`` (bản 15/11/2026): CARLA chỉ vẽ chữ ở toạ độ 3D, không có
HUD cố định trên màn hình; lệnh vẽ còn đua với tick của ScenarioRunner nên khung hình có hai bản số chồng lệch nhau.
Ô số này là cửa sổ Tk của tiến trình này, không thuộc world nên không thể lọt vào ảnh camera của run.

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
import threading
import time

try:
    import carla
except ImportError:  # pragma: no cover - chỉ xảy ra khi chạy sai python; test phần số không cần carla
    carla = None

ROLE_NAME = "hero"
TARGET_REFRESH_S = 1.0  # danh sách người đi bộ / xe khác: lấy lại mỗi giây, không gọi get_actors() mỗi tick
CARLA_WINDOW_TITLE = "CarlaUE4"
WAITING = ["Đang chờ xe ego…"]


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
    """Các dòng của ô số, từ trên xuống. Dòng 0 là tốc độ (chữ to), dòng 2 là bàn đạp (đỏ khi phanh)."""
    accel = round(accel_mps2, 1) + 0.0  # không in "-0.0"
    lines = [
        f"{speed_mps * 3.6:5.1f} km/h",
        f"Gia tốc {accel:+5.1f} m/s²",
        f"Ga {throttle:4.2f}   Phanh {brake:4.2f}",
        f"t {sim_time_s:6.2f} s",
    ]
    gaps = []
    if pedestrian_m is not None:
        gaps.append(f"Người {pedestrian_m:5.1f} m")
    if vehicle_m is not None:
        gaps.append(f"Xe {vehicle_m:5.1f} m")
    if gaps:
        lines.append("   ".join(gaps) + " (tâm-tâm)")
    return lines


def nearest(origin, locations) -> float | None:  # noqa: ANN001 - carla.Location, các carla.Location
    best = None
    for location in locations:
        d = origin.distance(location)
        if best is None or d < best:
            best = d
    return best


def snapshot_locations(snapshot, actors) -> list:  # noqa: ANN001
    """Vị trí các actor **trong đúng tick này**; actor đã huỷ không có trong snapshot thì bỏ qua."""
    found = (snapshot.find(actor.id) for actor in actors)
    return [s.get_transform().location for s in found if s is not None]


def hud_from_snapshot(hero, snapshot, t0: float, walkers, others) -> tuple[list[str], bool] | None:  # noqa: ANN001
    """Số của một tick, đọc từ snapshot (không RPC nào ngoài ``get_control``). ``None`` khi ego vừa biến mất."""
    state = snapshot.find(hero.id)
    if state is None:
        return None
    tf = state.get_transform()
    velocity = state.get_velocity()
    control = hero.get_control()
    lines = hud_lines(
        speed_mps=math.sqrt(longitudinal(velocity, velocity)),
        accel_mps2=longitudinal(state.get_acceleration(), tf.get_forward_vector()),
        throttle=control.throttle,
        brake=control.brake,
        sim_time_s=snapshot.timestamp.elapsed_seconds - t0,
        pedestrian_m=nearest(tf.location, snapshot_locations(snapshot, walkers)),
        vehicle_m=nearest(tf.location, snapshot_locations(snapshot, others)),
    )
    return lines, control.brake > 0.0


def follow(client, args, publish=None, stop: threading.Event | None = None) -> None:  # noqa: ANN001
    """Vòng bám ego. Có ``publish`` (chế độ HUD) thì chờ từng tick và gửi số của tick đó ra ô HUD."""
    period = 1.0 / max(args.rate, 1.0)
    started = time.time()
    world = spectator = hero = None
    walkers, others, targets_at = [], [], 0.0
    t0 = None  # giờ mô phỏng lúc thấy ego: HUD hiện thời gian của kịch bản, không phải giờ server từ lúc bật
    announced = False

    while (args.timeout <= 0 or time.time() - started < args.timeout) and not (stop and stop.is_set()):
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
                if publish:
                    publish(WAITING, False)
                announced = False
                world = None  # có thể map vừa bị đổi — lấy lại ở vòng sau
                time.sleep(0.25)
                continue

            if not announced:
                print(f"Thấy ego: {hero.type_id} (id={hero.id}) trên {world.get_map().name}", flush=True)
                announced = True
                targets_at, t0 = 0.0, None

            if publish:
                # Chỉ chờ tick của ScenarioRunner, không tick: mỗi tick một lần đọc, số khớp đúng khung đang hiện.
                snapshot = world.wait_for_tick(2.0)
                if t0 is None:
                    t0 = snapshot.timestamp.elapsed_seconds
                if time.time() - targets_at > TARGET_REFRESH_S:
                    actors = world.get_actors()
                    walkers = list(actors.filter("walker.pedestrian.*"))
                    others = [a for a in actors.filter("vehicle.*") if a.id != hero.id]
                    targets_at = time.time()
                shown = hud_from_snapshot(hero, snapshot, t0, walkers, others)
                if shown is None:
                    hero = None
                    continue
                publish(*shown)
                tf = snapshot.find(hero.id).get_transform()
            else:
                tf = hero.get_transform()

            spectator.set_transform(
                bird_transform(tf, args.bird_height)
                if args.view == "bird"
                else chase_transform(tf, args.distance, args.height)
            )
            if not publish:
                time.sleep(period)
        except RuntimeError as exc:
            # Hay gặp lúc server đang load map: RPC timeout, actor vừa bị huỷ.
            # Đây là trạng thái bình thường, không phải lý do để thoát.
            print(f"[tạm mất kết nối] {exc}", file=sys.stderr, flush=True)
            world = None
            announced = False
            time.sleep(0.5)


def carla_window() -> tuple[int, int, int] | None:
    """(hwnd, x, y): cửa sổ CarlaUE4 và góc trên trái vùng vẽ của nó trên màn hình (Windows).
    ``None``: không phải Windows, không thấy cửa sổ hoặc cửa sổ đang thu nhỏ."""
    if sys.platform != "win32":
        return None
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    # Tiêu đề thật là "CarlaUE4  " (có dấu cách cuối) nên FindWindowW theo tên chính xác không thấy — duyệt và so tiền tố.
    found = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def visit(hwnd, _):  # noqa: ANN001, ANN202
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            title = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, title, length + 1)
            if title.value.strip().startswith(CARLA_WINDOW_TITLE):
                found.append(hwnd)
                return False
        return True

    user32.EnumWindows(visit, 0)
    hwnd = found[0] if found else None
    if not hwnd or user32.IsIconic(hwnd):
        return None
    point = wintypes.POINT(0, 0)
    if not user32.ClientToScreen(hwnd, ctypes.byref(point)):
        return None
    return hwnd, point.x, point.y


def set_owner(window_hwnd: int, owner_hwnd: int) -> None:
    """Cho cửa sổ ô số **thuộc về** cửa sổ CARLA: luôn nằm ngay trên CARLA (không phải trên mọi cửa sổ), bị cửa sổ khác
    che cùng lúc với CARLA, ẩn khi CARLA thu nhỏ, không hiện trên taskbar."""
    import ctypes

    user32 = ctypes.windll.user32
    user32.SetWindowLongPtrW.restype = ctypes.c_void_p
    user32.SetWindowLongPtrW.argtypes = (ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p)
    user32.SetWindowLongPtrW(window_hwnd, -8, owner_hwnd)  # GWLP_HWNDPARENT = owner của cửa sổ top-level


class Overlay:
    """Ô số không viền, ghim ở góc trên trái **trong** cửa sổ CARLA và thuộc về cửa sổ đó.
    Không thấy cửa sổ CARLA (thu nhỏ, chạy ẩn, không phải Windows) thì ô số ẩn — không bao giờ nổi riêng trên màn hình.
    Chỉ chạy ở luồng chính (Tk)."""

    BG, FG, RED = "#101418", "#f2f2f2", "#ff5a5a"
    MARGIN = 12
    REFRESH_MS = 15  # đọc số mới nhất ~60 lần/giây; số đổi theo tick mô phỏng
    PLACE_EVERY_MS = 200

    def __init__(self, worker: threading.Thread) -> None:
        import tkinter as tk

        self.worker = worker
        self.latest: tuple[list[str], bool] = (WAITING, False)
        self.shown: tuple[list[str], bool] | None = None
        self.owner = None
        self.visible = False
        self.root = tk.Tk()
        self.root.withdraw()  # chỉ hiện khi đã gắn vào cửa sổ CARLA
        self.root.title("VehicSim HUD")
        self.root.overrideredirect(True)
        try:
            self.root.attributes("-alpha", 0.85)
        except tk.TclError:
            pass
        self.root.configure(bg=self.BG)
        self.labels = []
        for i in range(5):
            font = ("Consolas", 22, "bold") if i == 0 else ("Consolas", 12)
            label = tk.Label(self.root, text="", font=font, fg=self.FG, bg=self.BG, anchor="w", justify="left")
            self.labels.append(label)
        self.placed_at = 0.0

    def publish(self, lines: list[str], braking: bool) -> None:
        self.latest = (lines, braking)  # gán một tuple: đổi nguyên khối, luồng Tk không đọc nửa chừng

    def _place(self) -> None:
        found = carla_window()
        if found is None:
            if self.visible:
                self.root.withdraw()
                self.visible = False
            return
        hwnd, x, y = found
        self.root.geometry(f"+{x + self.MARGIN}+{y + self.MARGIN}")
        if not self.visible:
            self.root.deiconify()
            self.root.update_idletasks()
            self.visible = True
            self.owner = None  # Tk có thể tạo lại khung cửa sổ khi hiện lại: gắn lại owner
        if self.owner != hwnd:
            set_owner(int(self.root.wm_frame(), 16), hwnd)
            self.owner = hwnd

    def _refresh(self) -> None:
        if not self.worker.is_alive():
            self.root.destroy()
            return
        if self.latest is not self.shown:
            self.shown = lines, braking = self.latest
            for i, label in enumerate(self.labels):
                if i < len(lines):
                    label.configure(text=lines[i], fg=self.RED if i == 2 and braking else self.FG)
                    label.pack(fill="x", padx=10, pady=(6 if i == 0 else 0, 6 if i == len(lines) - 1 else 0))
                else:
                    label.pack_forget()
        now = time.monotonic()
        if now - self.placed_at > self.PLACE_EVERY_MS / 1000:
            self.placed_at = now
            self._place()
        self.root.after(self.REFRESH_MS, self._refresh)

    def run(self) -> None:
        self._place()
        self._refresh()
        self.root.mainloop()


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
    p.add_argument("--hud", action="store_true", help="ô số tốc độ/bàn đạp/khoảng cách ở góc trên trái cửa sổ CARLA")
    args = p.parse_args()
    if carla is None:
        sys.exit("Không import được carla. Dùng python của worker/.venv-carla, xem docs/vehicsim/carla-local.md.")

    client = carla.Client(args.host, args.port)
    client.set_timeout(10.0)
    print(f"Đang bám ego ({args.view}{', HUD' if args.hud else ''}). Ctrl-C để dừng.", flush=True)
    try:
        if not args.hud:
            follow(client, args)
            return 0
        stop = threading.Event()
        box: list[Overlay] = []
        worker = threading.Thread(target=lambda: follow(client, args, lambda *s: box[0].publish(*s), stop), daemon=True)
        try:
            box.append(Overlay(worker))
        except Exception as exc:  # noqa: BLE001 - không có màn hình/Tk: vẫn bám camera, chỉ mất ô số
            print(f"[HUD] không mở được ô số ({exc}); chỉ bám camera.", file=sys.stderr, flush=True)
            follow(client, args, stop=stop)
            return 0
        worker.start()
        try:
            box[0].run()
        finally:
            stop.set()
    except KeyboardInterrupt:
        print("\nĐã dừng bám.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
