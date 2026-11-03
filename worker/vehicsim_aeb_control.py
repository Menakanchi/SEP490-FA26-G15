"""Controller ScenarioRunner cho ego: lớp CARLA mỏng, KHÔNG có logic AEB (ADR-042).

Mỗi tick: đọc trạng thái CARLA (ego, người đi bộ, va chạm), gửi cho lõi Java qua ``bridge.Bridge``, nhận lệnh phanh và áp vào xe. Khung tọa độ, đo giảm tốc, AEB,
bàn đạp phanh, điều kiện kết thúc, chấm điểm và ghi ``result.json`` đều ở ``com.vsos.core`` (xem ``bridge.py``).

Module/class name tuân theo ActorControl của ScenarioRunner: vehicsim_aeb_control -> VehicsimAebControl.
Chỉ được import trong tiến trình ScenarioRunner có CARLA, không ở backend hoặc lõi mô phỏng.
"""

from __future__ import annotations

from pathlib import Path

import carla
from bridge import Bridge, BridgeError
from carla_physics import apply_physics_overrides, physics_snapshot
from srunner.scenariomanager.actorcontrols.npc_vehicle_control import NpcVehicleControl
from srunner.scenariomanager.carla_data_provider import CarlaDataProvider
from srunner.scenariomanager.timer import GameTime


class VehicsimAebControl(NpcVehicleControl):
    def __init__(self, actor, args=None):  # noqa: ANN001 - interface ScenarioRunner
        super().__init__(actor, args)
        # NpcVehicleControl.run_step tự apply_control lệnh của LocalPlanner; actor.get_control() sau đó trả lệnh của TICK TRƯỚC (CARLA chỉ cập nhật khi tick),
        # nên giữ lại đúng lệnh planner vừa tính trong tick này để lấy góc lái hiện tại.
        self._planned = None
        planner_step = self._local_planner.run_step

        def capture(*a, **kw):  # noqa: ANN002, ANN003 - bọc nguyên chữ ký LocalPlanner.run_step
            self._planned = planner_step(*a, **kw)
            return self._planned

        self._local_planner.run_step = capture
        options = args or {}
        self.out = Path(options["out_dir"])
        self.bridge = Bridge(self.out / "bridge.log")
        try:
            request = {"xosc": options["xosc_file"], "out_dir": str(self.out), "simulator_version": options["simulator_version"]}
            if options.get("full_brake_decel") is not None:
                request["full_brake_decel"] = float(options["full_brake_decel"])
            opened = self.bridge.request("open", timeout=30.0, **request)
            physics = opened.get("physics") or {}
            if physics:
                control = actor.get_physics_control()
                apply_physics_overrides(control, physics, carla.Vector3D)
                actor.apply_physics_control(control)
        except Exception:
            self.bridge.close(grace_s=2.0)
            raise
        self.pedestrian_start_y = opened["constants"]["pedestrian_start_y_m"]
        # Radar chạy bóng (ADR-043): thuộc tính lấy từ lõi Java; ở đây chỉ gắn cảm biến và chuyển điểm thô, không lọc/bám.
        self.radar_attributes = opened.get("radar") or {}
        self.radar = None
        self._radar_points: list[list[float]] | None = None
        self.walker = None
        self.started_at = None
        self.initialized = False
        self.cruising = False
        self.finished = False
        self.collision_types: list[str] = []
        self.sensor = None

    def _initialize(self) -> bool:
        world = self._actor.get_world()
        self.walker = next((a for a in world.get_actors().filter("walker.*") if a.attributes.get("role_name") == "pedestrian"), None)
        if self.walker is None:
            return False
        transform = self._actor.get_transform()
        forward, right = transform.get_forward_vector(), transform.get_right_vector()
        location = self.walker.get_location()
        front_offset = self._actor.bounding_box.extent.x + self._actor.bounding_box.location.x
        self.started_at = GameTime.get_time()
        self.sensor = world.spawn_actor(world.get_blueprint_library().find("sensor.other.collision"), carla.Transform(), attach_to=self._actor)
        self.sensor.listen(lambda event: self.collision_types.append(event.other_actor.type_id))
        if self.radar_attributes:
            radar_bp = world.get_blueprint_library().find("sensor.other.radar")
            for key, value in self.radar_attributes.items():
                radar_bp.set_attribute(key, str(value))
            self.radar = world.spawn_actor(radar_bp, carla.Transform(carla.Location(x=front_offset + 0.1, z=1.0)), attach_to=self._actor)
            # Callback chạy ở luồng cảm biến: gán cả danh sách một lần (nguyên tử trong CPython), run_step đọc lần đo mới nhất.
            self.radar.listen(lambda data: setattr(self, "_radar_points",
                                                   [[round(d.depth, 3), round(d.azimuth, 5), round(d.altitude, 5), round(d.velocity, 3)] for d in data]))
        # Đọc lại thông số CARLA thực sự áp cho xe (sau khi ép ở __init__ và đã qua vài tick), ghi vào result.json để đối chiếu.
        applied = physics_snapshot(self._actor.get_physics_control(), self._actor.bounding_box.extent)
        self.bridge.request("init", ego={"fwd": [forward.x, forward.y], "right": [right.x, right.y]}, walker=[location.x, location.y],
                            front_offset=front_offset,
                            carla={"map": world.get_map().name, "blueprint": self._actor.type_id, "physics": applied})
        self.initialized = True
        return True

    def run_step(self) -> None:
        if not self._actor or not self._actor.is_alive:
            return
        if self.finished:
            self._actor.apply_control(carla.VehicleControl(brake=1.0))
            return
        if not self.initialized and not self._initialize():
            super().run_step()
            return
        t = round(GameTime.get_time() - self.started_at, 3)
        transform, velocity = self._actor.get_transform(), self._actor.get_velocity()
        forward = transform.get_forward_vector()
        location, ped_velocity = self.walker.get_location(), self.walker.get_velocity()
        extra = {"radar": self._radar_points or []} if self.radar is not None else {}
        reply = self.bridge.request(
            "step", t=t,
            ego={"loc": [transform.location.x, transform.location.y], "fwd": [forward.x, forward.y], "vel": [velocity.x, velocity.y]},
            ped={"loc": [location.x, location.y], "vel": [ped_velocity.x, ped_velocity.y]},
            walker_hit=any(name.startswith("walker.") for name in self.collision_types), **extra)
        if reply["skip"]:  # cùng tick đã xử lý
            return
        if reply["decel_cmd"] > 0:  # AEB đang yêu cầu phanh: thôi giữ tốc độ không đổi
            self._init_speed = False
            if self.cruising:
                self._actor.disable_constant_velocity()
                self.cruising = False
        # ScenarioRunner lo bám làn; quyết định phanh đến từ lõi Java, không dùng BehaviorAgent để né nguy hiểm.
        self._planned = None
        super().run_step()
        if self._planned is None:  # actor vừa mất giữa tick: NpcVehicleControl đã thoát sớm
            return
        control = self._planned
        control.throttle = 0.0
        control.brake = reply["pedal"] if reply["braking"] else 0.0
        if not reply["braking"] and not self.cruising and self._target_speed > 0:
            self._actor.enable_constant_velocity(carla.Vector3D(self._target_speed, 0.0, 0.0))
            self.cruising = True
        self._actor.apply_control(control)
        if reply["finished"]:
            self.finished = True
            CarlaDataProvider.update_osc_global_params({"vs_done": 1.0})

    def reset(self) -> None:
        try:
            if self._actor and self._actor.is_alive:
                if self.initialized and not self.finished:
                    try:
                        self.bridge.request("finish", reason="TIMEOUT")
                    except BridgeError:
                        pass  # không có kết quả hợp lệ thì run.py báo lỗi; không tự bịa kết quả
                if self.cruising:
                    self._actor.disable_constant_velocity()
            for sensor in (self.sensor, self.radar):
                if sensor is not None:
                    try:
                        sensor.stop()
                        sensor.destroy()
                    except RuntimeError:
                        pass
        finally:
            self.bridge.close()
        super().reset()
