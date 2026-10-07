"""Dữ liệu mặc định cho vòng MVP: workspace, project, xe (phiên bản 1), baseline AEB v1.0.

Idempotent: chạy lại không tạo trùng. Dùng bởi ``scripts/seed_vehicsim.py`` và test.

v1.0 dùng TTC 1,5 s (không phải mặc định 1,8 của ``aeb_parameters``) để kịch bản
demo của MVP diễn ra được: tăng lên 1,8 s sửa được vài ca va chạm nhưng thêm vài ca
phanh oan — đúng sự đánh đổi mà màn regression cần cho thấy.
"""

from __future__ import annotations

from sqlalchemy import insert, select

from src.services.vehicsim import tables as t
from src.services.vehicsim.common import engine, now

# Phải khớp phần SEED của database/mysql/01_schema.sql —
# test_python_parameter_seed_matches_sql_seed canh điều này.
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

# Seed của carla_vehicle_models trong 01_schema.sql: runner CARLA spawn blueprint này (TD-17 đo trên nó).
DEFAULT_BLUEPRINT = {
    "carla_blueprint_id": "vehicle.audi.etron",
    "display_name": "Audi e-tron",
    "length_m": 4.75,
    "width_m": 1.93,
    "height_m": 1.67,
}


def seed_catalogs_if_missing(conn) -> None:
    """MySQL đã seed từ file SQL; SQLite trong test thì chưa."""
    if conn.execute(select(t.aeb_parameters.c.id).limit(1)).first() is None:
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
    if conn.execute(select(t.carla_vehicle_models.c.id).limit(1)).first() is None:
        conn.execute(insert(t.carla_vehicle_models).values(**DEFAULT_BLUEPRINT))


def ensure_default_project(owner_user_id: int) -> dict:
    ts = now()
    with engine().begin() as conn:
        seed_catalogs_if_missing(conn)
        project = conn.execute(select(t.projects).order_by(t.projects.c.id).limit(1)).first()
        if project is not None:
            return {"project_id": project.id, "created": False}

        # Seed do người chạy script tạo, nên coi như đã được duyệt (manager = người duyệt = owner).
        workspace_id = conn.execute(
            insert(t.workspaces).values(
                name="AEB Pedestrian",
                description="MVP workspace: pedestrian-crossing AEB validation",
                manager_id=owner_user_id,
                status="ACTIVE",
                approved_by_user_id=owner_user_id,
                approved_at=ts,
                created_date=ts,
                updated_at=ts,
            )
        ).inserted_primary_key[0]
        project_id = conn.execute(
            insert(t.projects).values(
                workspace_id=workspace_id,
                name="VF8 AEB MVP",
                description="Closed-loop MVP: describe → simulate → fail → tune → regression → decide",
                status="ACTIVE",
                created_by_user_id=owner_user_id,
                created_date=ts,
                updated_at=ts,
            )
        ).inserted_primary_key[0]
        model_id = conn.execute(
            select(t.carla_vehicle_models.c.id).where(
                t.carla_vehicle_models.c.carla_blueprint_id == DEFAULT_BLUEPRINT["carla_blueprint_id"]
            )
        ).scalar_one()
        conn.execute(
            insert(t.vehicle_versions).values(
                project_id=project_id,
                carla_vehicle_model_id=model_id,
                version_no=1,
                name="VF8 v1.2",
                mass_kg=2100,
                wheelbase_m=2.95,
                max_speed_mps=50,
                max_brake_decel_mps2=9.5,
                tire_friction=1.0,
                calibration_status="UNVERIFIED",
                is_active=True,
                created_by_user_id=owner_user_id,
                created_date=ts,
            )
        )
        version_id = conn.execute(
            insert(t.aeb_versions).values(
                project_id=project_id,
                version_no=1,
                label="v1.0",
                source="MANUAL",
                status="BASELINE",
                notes="Initial baseline",
                created_by_user_id=owner_user_id,
                created_date=ts,
            )
        ).inserted_primary_key[0]
        params = conn.execute(select(t.aeb_parameters)).all()
        conn.execute(
            insert(t.aeb_parameter_values),
            [
                {
                    "aeb_version_id": version_id,
                    "parameter_id": p.id,
                    "param_value": BASELINE_OVERRIDES.get(p.code, float(p.default_value)),
                }
                for p in params
            ],
        )
    return {"project_id": project_id, "created": True}
