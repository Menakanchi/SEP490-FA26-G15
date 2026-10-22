"""Đọc/ghi ``carla.VehiclePhysicsControl`` — lớp CARLA mỏng, không có logic nghiệp vụ (ADR-042).

Giá trị cần ép đã được lõi Java kiểm (khoảng giá trị, trường được phép); ở đây chỉ gán vào đối tượng CARLA. Không import ``carla``: người gọi truyền
``carla.Vector3D``, nên test chạy được không cần CARLA.
"""

from __future__ import annotations

# Tên thuộc tính CARLA 0.9.16 để đọc lại những gì xe thực sự dùng.
PHYSICS_SCALARS = ("mass", "drag_coefficient", "max_rpm", "moi", "final_ratio")
WHEEL_FIELDS = (
    "tire_friction",
    "max_brake_torque",
    "max_handbrake_torque",
    "max_steer_angle",
    "radius",
    "damping_rate",
    "long_stiff_value",
    "lat_stiff_value",
    "lat_stiff_max_load",
)


def apply_physics_overrides(pc, physics: dict, vector3d) -> None:
    """Ghi ``physics`` vào một ``VehiclePhysicsControl`` đọc từ xe. Người gọi tự ``apply_physics_control``.

    ``wheels`` là một object (mọi bánh) hoặc danh sách theo thứ tự bánh của CARLA.
    """
    for key, value in physics.items():
        if key in ("center_of_mass", "wheels"):
            continue
        if not hasattr(pc, key):
            raise RuntimeError(f"VehiclePhysicsControl không có trường {key}")
        setattr(pc, key, value)
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
