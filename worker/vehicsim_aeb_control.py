"""ScenarioRunner controller adapter; logic AEB vẫn chỉ ở vehicsim_core.aeb_stack.

Module/class name tuân theo ActorControl của ScenarioRunner: vehicsim_aeb_control -> VehicsimAebControl.
Chỉ được import trong tiến trình ScenarioRunner có CARLA, không ở backend hoặc lõi mô phỏng.
"""

from __future__ import annotations

import json
from pathlib import Path

import carla
from openscenario_export import read_profile, read_xosc
from run_variant import CrossingFrame, DecelMeter, apply_physics_overrides, brake_pedal
from srunner.scenariomanager.actorcontrols.npc_vehicle_control import NpcVehicleControl
from srunner.scenariomanager.carla_data_provider import CarlaDataProvider
from srunner.scenariomanager.timer import GameTime
from vehicsim_core.aeb_stack import record_event
from vehicsim_core.bundle import result_document
from vehicsim_core.evaluation import evaluate, to_document
from vehicsim_core.filters import SPEC as JERK_FILTER_SPEC
from vehicsim_core.filters import filtered_rms_jerk
from vehicsim_core.simulator import (
    MAX_DURATION_S,
    PEDESTRIAN_RADIUS_M,
    PEDESTRIAN_START_Y_M,
    G,
    MotionStats,
    brake_phase_start,
    build_outcome,
    ground_truth_ttc,
    make_frame,
    new_aeb_stack,
)


class VehicsimAebControl(NpcVehicleControl):
    def __init__(self, actor, args=None):  # noqa: ANN001 - interface ScenarioRunner
        super().__init__(actor, args)
        options = args or {}
        self.spec = read_xosc(Path(options["xosc_file"]))
        _, self.step_s, self.perception_period_s = read_profile(Path(options["xosc_file"]))
        self.out = Path(options["out_dir"])
        self.full_brake_decel = float(options.get("full_brake_decel", 4.6))
        self.simulator_version = options["simulator_version"]
        self.events: list[dict] = []
        self.frames: list[dict] = []
        self.stack = new_aeb_stack(self.spec.case, self.spec.params, self.spec.seed, self.spec.vehicle, self.events,
                                   dt=self.step_s, perception_period_s=self.perception_period_s)
        self.stats = MotionStats(dt=self.step_s)
        # Cửa sổ đo giảm tốc giữ nguyên 0,1 s (2 tick ở 20 Hz): đúng một chu kỳ răng cưa tốc độ CARLA đã đo.
        self.meter = DecelMeter(limit=self.spec.case.road_friction * G, window=max(2, round(0.1 / self.step_s)), dt=self.step_s)
        self.frame = None
        self.walker = None
        self.started_at = None
        self.braking = False
        self.cruising = False
        self.finished = False
        self.collision_types: list[str] = []
        self.ped_started = False
        self.sensor = None
        physics = self.spec.vehicle_carla.get("physics") or {}
        if physics:
            control = actor.get_physics_control()
            apply_physics_overrides(control, physics, carla.Vector3D)
            actor.apply_physics_control(control)

    def _initialize(self) -> bool:
        world = self._actor.get_world()
        self.walker = next((a for a in world.get_actors().filter("walker.*")
                            if a.attributes.get("role_name") == "pedestrian"), None)
        if self.walker is None:
            return False
        transform = self._actor.get_transform()
        forward, right = transform.get_forward_vector(), transform.get_right_vector()
        location = self.walker.get_location()
        # Walker bắt đầu bên phải tim làn; gốc frame đặt ở tim làn trên vạch băng qua.
        self.frame = CrossingFrame(location.x + right.x * PEDESTRIAN_START_Y_M,
                                   location.y + right.y * PEDESTRIAN_START_Y_M,
                                   forward.x, forward.y, right.x, right.y)
        self.front_offset = self._actor.bounding_box.extent.x + self._actor.bounding_box.location.x
        self.started_at = GameTime.get_time()
        self.sensor = world.spawn_actor(world.get_blueprint_library().find("sensor.other.collision"),
                                        carla.Transform(), attach_to=self._actor)
        self.sensor.listen(lambda event: self.collision_types.append(event.other_actor.type_id))
        return True

    def run_step(self) -> None:
        if not self._actor or not self._actor.is_alive:
            return
        if self.finished:
            self._actor.apply_control(carla.VehicleControl(brake=1.0))
            return
        if self.frame is None and not self._initialize():
            super().run_step()
            return
        t = round(GameTime.get_time() - self.started_at, 3)
        if self.frames and t <= self.frames[-1]["t"]:
            return
        transform, velocity = self._actor.get_transform(), self._actor.get_velocity()
        forward = transform.get_forward_vector()
        gap = -self.frame.along(transform.location.x + forward.x * self.front_offset,
                                transform.location.y + forward.y * self.front_offset)
        ego_v = max(0.0, self.frame.velocity_along(velocity.x, velocity.y))
        location, ped_velocity = self.walker.get_location(), self.walker.get_velocity()
        ped_y = self.frame.left(location.x, location.y)
        ped_vy = self.frame.velocity_left(ped_velocity.x, ped_velocity.y)
        if not self.ped_started and ped_vy > 0.05:
            self.ped_started = True
            record_event(self.events, t, "gt_start", "Pedestrian starts crossing")
        decel = self.meter.update(ego_v, braking=self.braking)
        tick = self.stack.step(t, gap=gap, ped_y=ped_y, ped_vy=ped_vy, ego_v=ego_v)
        if tick.decel_cmd > 0:
            self.braking = True
            self._init_speed = False
            if self.cruising:
                self._actor.disable_constant_velocity()
                self.cruising = False
        # ScenarioRunner lo bám làn; quyết định phanh dùng chung AebStack, không dùng BehaviorAgent để né nguy hiểm.
        super().run_step()
        control = self._actor.get_control()
        control.throttle = 0.0
        control.brake = brake_pedal(tick.decel_cmd, decel, self.full_brake_decel) if self.braking else 0.0
        if not self.braking and not self.cruising and self._target_speed > 0:
            self._actor.enable_constant_velocity(carla.Vector3D(self._target_speed, 0.0, 0.0))
            self.cruising = True
        self._actor.apply_control(control)
        self.stats.add(decel)
        self.frames.append(make_frame(
            t=t, ego_x=self.spec.case.crossing_x - gap, ego_v=ego_v, ego_decel=decel,
            crossing_x=self.spec.case.crossing_x, ped_y=ped_y, ped_vy=ped_vy, tick=tick,
            ttc_gt=ground_truth_ttc(gap, ped_y, ego_v, self.spec.vehicle), stack=self.stack,
        ))
        ped_along = self.frame.along(location.x, location.y)
        ego_y = self.frame.left(transform.location.x, transform.location.y)
        overlap = (ped_along - PEDESTRIAN_RADIUS_M <= -gap
                   and ped_along + PEDESTRIAN_RADIUS_M >= -gap - self.spec.vehicle.length_m
                   and abs(ped_y - ego_y) <= self.spec.vehicle.width_m / 2 + PEDESTRIAN_RADIUS_M)
        if overlap or any(name.startswith("walker.") for name in self.collision_types):
            record_event(self.events, t, "collision", f"Collision · {ego_v * 3.6:.1f} km/h", impact_speed_mps=round(ego_v, 3))
            self._finish("COLLISION")
        elif ego_v <= 0.05 and self.stack.decision_t is not None:
            record_event(self.events, t, "stopped", "Ego stopped", gap_m=round(gap, 2))
            self._finish("EGO_STOPPED")
        elif -gap - self.spec.vehicle.length_m > ped_along + 1.0:
            self._finish("TARGET_CLEARED")
        elif t >= MAX_DURATION_S - 0.1:
            self._finish("TIMEOUT")

    def _finish(self, end_reason: str) -> None:
        if self.finished or not self.frames:
            return
        outcome = build_outcome(
            case=self.spec.case, params=self.spec.params, vehicle=self.spec.vehicle, stack=self.stack,
            stats=self.stats, frames=self.frames, events=self.events, end_reason=end_reason,
            crossing_x=self.spec.case.crossing_x,
            decel_available=min(self.spec.params.max_deceleration, self.spec.vehicle.max_brake_decel_mps2,
                                self.spec.case.road_friction * G),
            dt=self.step_s,
        )
        steps = [b["t"] - a["t"] for a, b in zip(self.frames, self.frames[1:])]
        start = brake_phase_start(self.frames, outcome.metrics["brake_onset_t"])
        # Thực nghiệm (D3, kế hoạch 20/10): cùng tín hiệu ego_a của rms_jerk_mps3 nhưng lọc Butterworth 10 Hz trước khi đạo hàm.
        # Không thay objective chính thức: bậc lọc/causal/nguồn gia tốc còn chờ Thành viên 3 chốt. Chỉ tính được khi bước < 0,05 s.
        filtered = (filtered_rms_jerk([f["ego_a"] for f in self.frames], start, self.step_s, JERK_FILTER_SPEC["cutoff_hz"])
                    if start is not None and self.step_s < 0.05 else None)
        world = self._actor.get_world()
        outcome.case["carla"] = {"map": world.get_map().name, "blueprint": self._actor.type_id,
                                 "full_brake_decel": self.full_brake_decel, "runner": "ScenarioRunner",
                                 "decel_clamped_frames": self.meter.clamped,
                                 # Bước cấu hình và bước đo được từ timestamp khung thật: không coi cấu hình là đã đạt tốc độ này.
                                 "fixed_delta_seconds": self.step_s, "perception_period_s": self.perception_period_s,
                                 "jerk_filtered": {"status": "EXPERIMENTAL", "filter": JERK_FILTER_SPEC, "signal": "ego_a",
                                                   "rms_jerk_mps3": None if filtered is None else round(filtered, 3)},
                                 "measured_step_s": {"min": round(min(steps), 4), "max": round(max(steps), 4), "mean": round(sum(steps) / len(steps), 4),
                                                     "frames": len(self.frames)} if steps else None}
        # Wrapper đã bắt tay với server và kiểm client/server cùng phiên bản trước khi chạy.
        result = result_document(self.spec, outcome, simulator=self.simulator_version,
                                 evaluation=to_document(evaluate(outcome, self.spec.params)))
        self.out.mkdir(parents=True, exist_ok=True)
        (self.out / "result.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        self.finished = True
        CarlaDataProvider.update_osc_global_params({"vs_done": 1.0})

    def reset(self) -> None:
        if self._actor and self._actor.is_alive:
            self._finish("TIMEOUT")
            if self.cruising:
                self._actor.disable_constant_velocity()
        if self.sensor is not None:
            try:
                self.sensor.stop()
                self.sensor.destroy()
            except RuntimeError:
                pass
        super().reset()
