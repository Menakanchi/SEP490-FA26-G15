"""Hợp đồng controller ego chạy bên trong tick loop của ScenarioRunner.

File này thuộc worker GPU nên được phép phụ thuộc ScenarioRunner. Backend chỉ
biết tên controller đi qua JSON; object điều khiển không bao giờ vượt ranh giới
máy của ADR-001.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from srunner.scenariomanager.actorcontrols.basic_control import BasicControl


class EgoController(BasicControl, ABC):
    """Adapter tối thiểu mà ScenarioRunner gọi ở mỗi simulation tick."""

    @abstractmethod
    def run_step(self) -> None:
        """Tính và áp một lệnh điều khiển cho ego."""

    @abstractmethod
    def reset(self) -> None:
        """Nhả tài nguyên và đưa ego về trạng thái an toàn."""
