"""Dữ liệu mặc định cho vòng MVP: workspace, project, xe, AEB system, baseline v1.0.

Idempotent: chạy lại không tạo trùng. Dùng bởi ``scripts/seed_vehicsim.py`` và test.

v1.0 dùng TTC 1,5 s (không phải mặc định 1,8 của ``aeb_parameters``) để kịch bản
demo của MVP diễn ra được: tăng lên 1,8 s sửa được vài ca va chạm nhưng thêm vài ca
phanh oan — đúng sự đánh đổi mà màn regression cần cho thấy.
"""

from __future__ import annotations

from sqlalchemy import insert, select

from src.services.vehicsim import tables as t
from src.services.vehicsim.common import engine, now

# Phải khớp phần SEED DATA của database/mysql/01_schema.sql —
# tests/test_vehicsim/test_bootstrap.py canh điều này.
AEB_PARAMETER_SEED = [
    ("DETECTION_CONFIDENCE_THRESHOLD", "Detection Confidence Threshold", "PERCEPTION", "ratio", 0.30, 0.99, 0.70, 1),
    ("RELATIVE_VELOCITY_THRESHOLD", "Relative Velocity Threshold", "DECISION", "m/s", 0.50, 10.0, 2.0, 2),
    ("PREDICTION_HORIZON", "Prediction Horizon", "DECISION", "s", 0.50, 4.0, 2.0, 3),
    ("SAFETY_DISTANCE_MARGIN", "Safety Distance Margin", "DECISION", "m", 0.50, 5.0, 2.0, 4),
    ("TTC_THRESHOLD", "TTC Threshold", "DECISION", "s", 0.50, 4.0, 1.8, 5),
    ("BRAKE_ACTIVATION_DELAY", "Brake Activation Delay", "CONTROL", "s", 0.0, 0.5, 0.15, 6),
    ("MAX_DECELERATION", "Target / Max Deceleration", "VEHICLE_DYNAMICS", "m/s2", 3.0, 10.0, 8.0, 7),
    ("BRAKE_BUILDUP_RATE", "Brake Build-up Rate", "CONTROL", "m/s3", 10.0, 100.0, 50.0, 8),
    ("JERK_LIMIT", "Jerk Limit", "CONTROL", "m/s3", 5.0, 50.0, 20.0, 9),
    ("ACTUATOR_RESPONSE_TIME", "Actuator Response Time", "VEHICLE_DYNAMICS", "s", 0.02, 0.30, 0.10, 10),
]

BASELINE_OVERRIDES = {"TTC_THRESHOLD": 1.5}


def seed_parameters_if_missing(conn) -> None:
    """MySQL đã seed từ file SQL; SQLite trong test thì chưa."""
    if conn.execute(select(t.aeb_parameters.c.id).limit(1)).first() is not None:
        return
    conn.execute(
        insert(t.aeb_parameters),
        [
            {
                "code": code,
                "name": name,
                "category": category,
                "unit": unit,
                "min_value": lo,
                "max_value": hi,
                "default_value": default,
                "sort_order": order,
            }
            for code, name, category, unit, lo, hi, default, order in AEB_PARAMETER_SEED
        ],
    )


def ensure_default_project(owner_user_id: int) -> dict:
    ts = now()
    with engine().begin() as conn:
        seed_parameters_if_missing(conn)
        project = conn.execute(select(t.projects).order_by(t.projects.c.id).limit(1)).first()
        if project is not None:
            system = conn.execute(select(t.aeb_systems).where(t.aeb_systems.c.project_id == project.id)).first()
            return {"project_id": project.id, "aeb_system_id": system.id if system else None, "created": False}

        workspace_id = conn.execute(
            insert(t.workspaces).values(
                name="AEB Pedestrian",
                description="MVP workspace: pedestrian-crossing AEB validation",
                owner_id=owner_user_id,
                created_at=ts,
                updated_at=ts,
            )
        ).inserted_primary_key[0]
        project_id = conn.execute(
            insert(t.projects).values(
                workspace_id=workspace_id,
                name="VF8 AEB MVP",
                description="Closed-loop MVP: describe → simulate → fail → tune → regression → decide",
                status="ACTIVE",
                created_by=owner_user_id,
                created_at=ts,
                updated_at=ts,
            )
        ).inserted_primary_key[0]
        vehicle_id = conn.execute(
            insert(t.vehicles).values(
                project_id=project_id,
                name="VF8 v1.2",
                carla_blueprint="vehicle.tesla.model3",
                mass_kg=2100,
                length_m=4.75,
                width_m=1.93,
                height_m=1.67,
                wheelbase_m=2.95,
                max_speed_mps=50,
                max_brake_decel_mps2=9.5,
                tire_friction_coeff=1.0,
                created_at=ts,
                updated_at=ts,
            )
        ).inserted_primary_key[0]
        system_id = conn.execute(
            insert(t.aeb_systems).values(
                project_id=project_id,
                vehicle_id=vehicle_id,
                name="AEB",
                description="Pedestrian AEB + FCW",
                created_at=ts,
                updated_at=ts,
            )
        ).inserted_primary_key[0]
        version_id = conn.execute(
            insert(t.aeb_versions).values(
                aeb_system_id=system_id,
                version_number=1,
                label="v1.0",
                source="MANUAL",
                status="BASELINE",
                notes="Initial baseline",
                created_by=owner_user_id,
                created_at=ts,
            )
        ).inserted_primary_key[0]
        params = conn.execute(select(t.aeb_parameters)).all()
        conn.execute(
            insert(t.aeb_parameter_values),
            [
                {
                    "aeb_version_id": version_id,
                    "aeb_parameter_id": p.id,
                    "value": BASELINE_OVERRIDES.get(p.code, float(p.default_value)),
                }
                for p in params
            ],
        )
    return {"project_id": project_id, "aeb_system_id": system_id, "created": True}
