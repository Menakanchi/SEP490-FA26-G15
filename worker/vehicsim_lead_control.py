"""Controller ScenarioRunner cho xe mục tiêu của nhóm xe phía trước CCRs / CCRm / CCRb (ADR-050). KHÔNG có logic AEB.

Xe mục tiêu ở Euro NCAP là mục tiêu mềm do robot kéo theo profile vận tốc cố định, không phải một xe tự lái. ScenarioRunner chỉ đặt được tốc độ đích
(``ChangeActorTargetSpeed``) còn mức giảm tốc do PID của xe quyết định, nên controller này ép đúng profile của bộ động học
(``com.vsos.core.simulation.LeadVehicleSimulator``): chạy đều ``speed_mps``; nếu ``decel_mps2`` < 0 thì từ ``brake_start_s`` giảm đều tới khi dừng.
Tham số lấy từ Properties của controller trong ``.xosc`` (``XoscExport.exportLead``). Đường road 40 thẳng nên giữ vận tốc theo hướng xe là đủ bám làn.

Module/class name tuân theo ActorControl của ScenarioRunner: vehicsim_lead_control -> VehicsimLeadControl.
"""

from __future__ import annotations

import carla
from srunner.scenariomanager.actorcontrols.basic_control import BasicControl
from srunner.scenariomanager.timer import GameTime


class VehicsimLeadControl(BasicControl):
    def __init__(self, actor, args=None):  # noqa: ANN001 - interface ScenarioRunner
        super().__init__(actor)
        options = args or {}
        self.speed = float(options.get("speed_mps") or 0.0)
        self.decel = float(options.get("decel_mps2") or 0.0)
        self.brake_start = float(options.get("brake_start_s") or 1.0)
        self.started_at = None
        self.cruising = False

    def profile_speed(self, t: float) -> float:
        """Vận tốc mục tiêu theo thời gian kể từ tick đầu (m/s) — cùng công thức với bộ động học."""
        if self.decel < 0 and t >= self.brake_start:
            return max(0.0, self.speed + self.decel * (t - self.brake_start))
        return self.speed

    def run_step(self) -> None:
        if not self._actor or not self._actor.is_alive:
            return
        now = GameTime.get_time()
        if self.started_at is None:
            self.started_at = now
        speed = self.profile_speed(now - self.started_at)
        if speed > 0:
            # Vận tốc hằng theo trục xe (hệ toạ độ actor): mỗi tick đặt lại để đi đúng profile.
            self._actor.enable_constant_velocity(carla.Vector3D(speed, 0.0, 0.0))
            self.cruising = True
        else:
            if self.cruising:
                self._actor.disable_constant_velocity()
                self.cruising = False
            self._actor.apply_control(carla.VehicleControl(throttle=0.0, brake=1.0, hand_brake=True))

    def reset(self) -> None:
        if self._actor and self._actor.is_alive and self.cruising:
            self._actor.disable_constant_velocity()
        self.cruising = False  # BasicControl.reset() cố ý ném NotImplementedError: lớp con tự dọn, không gọi super()
