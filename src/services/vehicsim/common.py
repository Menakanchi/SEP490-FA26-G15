"""Tiện ích dùng chung cho các dịch vụ VehicSim MVP."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select

from src.services.auth import users
from src.services.vehicsim import tables as t


class NotFoundError(Exception):
    """Bản ghi không tồn tại (hoặc không thuộc project đang xem)."""


class InvalidRequestError(Exception):
    """Dữ liệu vào đúng kiểu nhưng sai nghiệp vụ — tầng HTTP đổi thành 400/409."""


def now() -> datetime:
    # DATETIME của MySQL không mang múi giờ: quy ước lưu UTC dạng naive (như auth/users.py).
    return datetime.now(UTC).replace(tzinfo=None)


def engine():
    """Cùng engine với phần xác thực: một DB MySQL cho cả hệ thống mới."""
    return users.get_engine()


def version_label(row) -> str:
    """Nhãn hiển thị của một AEB version: ``label`` nếu có, không thì ``v<n>``."""
    return row.label or f"v{row.version_no}"


def aeb_parameter_catalog(conn) -> list[dict]:
    rows = conn.execute(select(t.aeb_parameters).order_by(t.aeb_parameters.c.sort_order)).all()
    return [dict(r._mapping) for r in rows]


def aeb_values(conn, aeb_version_id: int) -> dict[str, float]:
    """``{"TTC_THRESHOLD": 1.5, ...}`` của một AEB version."""
    rows = conn.execute(
        select(t.aeb_parameters.c.code, t.aeb_parameter_values.c.param_value)
        .join(t.aeb_parameter_values, t.aeb_parameter_values.c.parameter_id == t.aeb_parameters.c.id)
        .where(t.aeb_parameter_values.c.aeb_version_id == aeb_version_id)
    ).all()
    return {r.code: float(r.param_value) for r in rows}


def baseline_version(conn, project_id: int):
    """AEB version BASELINE của project (MySQL ép đúng một), hoặc ``None``."""
    return conn.execute(
        select(t.aeb_versions).where(t.aeb_versions.c.project_id == project_id, t.aeb_versions.c.status == "BASELINE")
    ).first()


def active_vehicle(conn, project_id: int):
    """Phiên bản xe đang dùng của project, kèm kích thước từ ``carla_vehicle_models``."""
    row = conn.execute(
        select(
            t.vehicle_versions,
            t.carla_vehicle_models.c.carla_blueprint_id,
            t.carla_vehicle_models.c.length_m,
            t.carla_vehicle_models.c.width_m,
            t.carla_vehicle_models.c.height_m,
        )
        .join(t.carla_vehicle_models, t.carla_vehicle_models.c.id == t.vehicle_versions.c.carla_vehicle_model_id)
        .where(t.vehicle_versions.c.project_id == project_id, t.vehicle_versions.c.is_active.is_(True))
    ).first()
    if row is None:
        raise NotFoundError("phiên bản xe đang dùng của project")
    return row


def vehicle_by_id(conn, vehicle_version_id: int):
    """Như ``active_vehicle`` nhưng theo id — run cũ giữ đúng phiên bản xe nó đã chạy."""
    row = conn.execute(
        select(
            t.vehicle_versions,
            t.carla_vehicle_models.c.carla_blueprint_id,
            t.carla_vehicle_models.c.length_m,
            t.carla_vehicle_models.c.width_m,
            t.carla_vehicle_models.c.height_m,
        )
        .join(t.carla_vehicle_models, t.carla_vehicle_models.c.id == t.vehicle_versions.c.carla_vehicle_model_id)
        .where(t.vehicle_versions.c.id == vehicle_version_id)
    ).first()
    if row is None:
        raise NotFoundError("phiên bản xe")
    return row


def variant_label(scenario_code: str, version_number: int) -> str:
    return f"{scenario_code}-{version_number:03d}"


WEATHER_LABELS = {
    "CLEAR": "clear",
    "CLOUDY": "cloudy",
    "RAIN": "rain",
    "HEAVY_RAIN": "heavy rain",
    "FOG": "fog",
}
TIME_LABELS = {"DAY": "Day", "DUSK": "Dusk", "NIGHT": "Night"}


def variant_summary(ir: dict) -> str:
    """Dòng mô tả ngắn cho bảng: ``Night · heavy rain · 60 km/h``."""
    parts = [
        TIME_LABELS.get(ir.get("time_of_day", "DAY"), "Day"),
        WEATHER_LABELS.get(ir.get("weather", "CLEAR"), "clear"),
        f"{ir.get('ego_speed_kmh', 0):.0f} km/h",
    ]
    if ir.get("stops_at_curb"):
        parts.append("stops at curb")
    return " · ".join(parts)
