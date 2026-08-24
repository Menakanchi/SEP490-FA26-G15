"""ScenarioRunner actor-control adapter cho CARLA ``BehaviorAgent``.

Tên file và tên class cố ý khớp quy tắc import của OpenScenarioParser:
``behavior_agent_control.py`` -> ``BehaviorAgentControl``.
"""

from __future__ import annotations

import math

import carla
from agents.navigation.behavior_agent import BehaviorAgent
from agents.navigation.local_planner import RoadOption
from ego_controller import EgoController


def _angle_delta(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


def _straightest(current, candidates):  # noqa: ANN001, ANN201 — CARLA types chỉ có trong worker venv
    """Chọn nhánh tiếp tục thẳng nhất; ổn định hơn lấy phần tử đầu ở junction."""
    return min(
        candidates,
        key=lambda waypoint: (
            _angle_delta(waypoint.transform.rotation.yaw, current.transform.rotation.yaw),
            waypoint.road_id != current.road_id,
        ),
    )


class _ScenarioBehaviorAgent(BehaviorAgent):
    """BehaviorAgent nhưng lấy tốc độ thử nghiệm từ OpenSCENARIO.

    ``BehaviorAgent`` gốc luôn thay target bằng speed limit của map ở mỗi tick.
    Điều đó làm phép A/B đổi hai biến cùng lúc: controller *và* tốc độ. Scenario
    Forge cần giữ tốc độ trong ODD/spec cố định để kết quả tránh va chạm thực sự
    phản ánh quyết định closed-loop.
    """

    def __init__(self, actor, behavior: str):  # noqa: ANN001
        self._scenario_speed_kmh = 1.0
        # Cùng PID ngang với NpcVehicleControl của ScenarioRunner: bộ này đã
        # chứng minh bám làn êm ở chính các artifact hiện có. PID mặc định của
        # BehaviorAgent (K_D=0.2) đảo lái thấy rõ khi target 90 km/h.
        options = {
            "lateral_control_dict": {"K_P": 1.0, "K_D": 0.01, "K_I": 0.0, "dt": 0.05},
        }
        super().__init__(actor, behavior=behavior, opt_dict=options)

    def set_scenario_speed(self, speed_kmh: float) -> None:
        self._scenario_speed_kmh = max(float(speed_kmh), 1.0)

    def _update_information(self) -> None:
        super()._update_information()
        self._speed_limit = self._scenario_speed_kmh
        self._local_planner.set_speed(self._scenario_speed_kmh)
        self._look_ahead_steps = int(self._scenario_speed_kmh / 10)
        self._incoming_waypoint, self._incoming_direction = self._local_planner.get_incoming_waypoint_and_direction(
            steps=self._look_ahead_steps
        )
        if self._incoming_direction is None:
            self._incoming_direction = RoadOption.LANEFOLLOW


class BehaviorAgentControl(EgoController):
    """Đưa BehaviorAgent vào cơ chế ``ActorControl`` của OpenSCENARIO."""

    def __init__(self, actor, args=None):  # noqa: ANN001
        super().__init__(actor)
        options = args or {}
        self._behavior = options.get("behavior", "normal")
        self._route_length_m = float(options.get("route_length_m", 800.0))
        self._route_step_m = float(options.get("route_step_m", 5.0))
        self._agent = _ScenarioBehaviorAgent(actor, behavior=self._behavior)
        self._assign_forward_plan()

    def _assign_forward_plan(self) -> None:
        carla_map = self._actor.get_world().get_map()
        start_waypoint = carla_map.get_waypoint(
            self._actor.get_location(),
            project_to_road=True,
            lane_type=carla.LaneType.Driving,
        )
        waypoint = start_waypoint
        plan = []
        travelled = 0.0
        while waypoint is not None and travelled < self._route_length_m:
            candidates = waypoint.next(self._route_step_m)
            if not candidates:
                break
            waypoint = _straightest(waypoint, candidates)
            plan.append((waypoint, RoadOption.LANEFOLLOW))
            travelled += self._route_step_m
        if not plan:
            raise RuntimeError("BehaviorAgent không dựng được route tiến từ vị trí ego")
        self._agent.set_global_plan(plan)

    def update_target_speed(self, speed: float) -> None:
        super().update_target_speed(speed)
        self._apply_speed_cap()

    def _apply_speed_cap(self) -> None:
        target_kmh = max(self._target_speed * 3.6, 1.0)
        # Tốc độ scenario là biến độc lập cần giữ cố định trong phép A/B.
        self._agent.set_scenario_speed(target_kmh)
        self._agent._behavior.max_speed = target_kmh  # noqa: SLF001 — API 0.9.15 không có setter
        self._agent._behavior.speed_lim_dist = 0.0  # noqa: SLF001

    def run_step(self) -> None:
        if not self._actor or not self._actor.is_alive:
            return
        self._apply_speed_cap()
        self._actor.apply_control(self._agent.run_step(debug=False))
        # OpenScenario đánh dấu SpeedAction trong Init bằng ``set_init_speed``.
        # NpcVehicleControl của baseline ép vận tốc thật lên target cho tới khi
        # PID bắt kịp; custom controller phải giữ cùng hợp đồng, nếu không phép
        # A/B đổi cả controller lẫn nhịp gặp adversary.
        velocity = self._actor.get_velocity()
        current_speed = math.hypot(velocity.x, velocity.y)
        if self._init_speed and abs(self._target_speed - current_speed) > 3.0:
            yaw = math.radians(self._actor.get_transform().rotation.yaw)
            self._actor.set_target_velocity(
                carla.Vector3D(
                    x=math.cos(yaw) * self._target_speed,
                    y=math.sin(yaw) * self._target_speed,
                    z=0.0,
                )
            )

    def reset(self) -> None:
        if self._actor and self._actor.is_alive:
            self._actor.apply_control(carla.VehicleControl(throttle=0.0, brake=1.0))
        self._agent = None
        self._actor = None
