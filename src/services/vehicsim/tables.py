"""Bảng VehicSim trên schema MySQL 30 bảng (``database/mysql/01_schema.sql``, ADR-036, ADR-037).

Giống ``auth/users.py``: các ``Table`` ở đây chỉ mô tả lại **đúng các cột code
đọc/ghi** để SQLAlchemy Core sinh câu lệnh có tham số. Nguồn sự thật vẫn là
file SQL — MySQL dựng bảng từ đó (kèm khoá ngoại ghép, cột sinh, CHECK),
``metadata.create_all`` chỉ chạy trên SQLite trong test. Dùng chung ``metadata``
với ``users`` để khoá ngoại tới ``users`` dựng được trong test.

Không mô tả các bảng code chưa đọc/ghi: ``workspace_members``, ``workspace_messages``,
``notifications``, ``workspace_tasks``, ``workspace_task_reports``, ``sensors``,
``optimization_*``, ``analysis_results``, ``tech_references`` (nghĩa từng cột ở
``docs/vehicsim/database-schema.md``). Thêm code dùng bảng nào thì mô tả bảng đó ở đây.
"""

from __future__ import annotations

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)

from src.services.auth.users import metadata

# SQLite chỉ tự tăng với INTEGER PRIMARY KEY; MySQL dùng BIGINT như file SQL.
_Id = BigInteger().with_variant(Integer, "sqlite")


def _dec(precision: int, scale: int) -> Numeric:
    # asdecimal=False: trả float thay vì Decimal — code tính toán và JSON đều cần float.
    return Numeric(precision, scale, asdecimal=False)


def _fk(target: str, **kw) -> ForeignKey:
    return ForeignKey(target, **kw)


def _enum(*values: str) -> Enum:
    return Enum(*values, native_enum=False)


workspaces = Table(
    "workspaces",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("name", String(150), nullable=False),
    Column("description", Text),
    Column("manager_id", _Id, _fk("users.id"), nullable=False),
    Column("status", _enum("PENDING_APPROVAL", "ACTIVE", "ARCHIVED", "REJECTED"), nullable=False),
    Column("requested_by_user_id", _Id, _fk("users.id")),
    Column("approved_by_user_id", _Id, _fk("users.id")),
    Column("approved_at", DateTime),
    Column("review_note", Text),
    Column("created_date", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)

projects = Table(
    "projects",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("workspace_id", _Id, _fk("workspaces.id")),  # NULL = project cá nhân của EXPERIENCER
    Column("name", String(150), nullable=False),
    Column("description", Text),
    Column("status", _enum("ACTIVE", "ARCHIVED"), nullable=False, default="ACTIVE"),
    Column("created_by_user_id", _Id, _fk("users.id"), nullable=False),
    Column("created_date", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)

# Danh mục blueprint CARLA: kích thước đọc từ bounding box (CARLA không cho đổi).
carla_vehicle_models = Table(
    "carla_vehicle_models",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("carla_blueprint_id", String(100), nullable=False, unique=True),
    Column("display_name", String(150)),
    Column("length_m", _dec(6, 3), nullable=False),
    Column("width_m", _dec(6, 3), nullable=False),
    Column("height_m", _dec(6, 3), nullable=False),
)

# Xe của project = các phiên bản Digital Twin; đúng một bản ``is_active`` (MySQL ép bằng cột sinh).
vehicle_versions = Table(
    "vehicle_versions",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("project_id", _Id, _fk("projects.id"), nullable=False),
    Column("carla_vehicle_model_id", _Id, _fk("carla_vehicle_models.id"), nullable=False),
    Column("version_no", Integer, nullable=False),
    Column("name", String(100), nullable=False),
    Column("mass_kg", _dec(8, 2), nullable=False),
    Column("drag_coefficient", _dec(4, 3)),
    Column("center_of_mass_x_m", _dec(6, 3)),
    Column("center_of_mass_y_m", _dec(6, 3)),
    Column("center_of_mass_z_m", _dec(6, 3)),
    Column("tire_friction", _dec(4, 2)),
    Column("wheelbase_m", _dec(5, 3)),
    Column("max_speed_mps", _dec(6, 2)),
    Column("max_brake_decel_mps2", _dec(5, 2), nullable=False),
    Column("carla_full_brake_decel_mps2", _dec(5, 2)),
    Column("calibration_status", _enum("UNVERIFIED", "CALIBRATED", "VERIFIED"), nullable=False),
    Column("is_active", Boolean, nullable=False, default=False),
    Column("created_by_user_id", _Id, _fk("users.id"), nullable=False),
    Column("created_date", DateTime, nullable=False),
    UniqueConstraint("project_id", "version_no"),
)

AEB_VERSION_STATUSES = ("DRAFT", "BASELINE", "CANDIDATE", "ACCEPTED", "REJECTED", "ARCHIVED")

aeb_parameters = Table(
    "aeb_parameters",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("code", String(50), nullable=False, unique=True),
    Column("name", String(100), nullable=False),
    Column("category", String(20), nullable=False),
    Column("unit", String(20), nullable=False),
    Column("min_value", _dec(14, 6), nullable=False),
    Column("max_value", _dec(14, 6), nullable=False),
    Column("default_value", _dec(14, 6), nullable=False),
    Column("description", Text),
    Column("sort_order", Integer, nullable=False),
)

# Một hệ AEB mỗi project: version gắn thẳng project; đúng một BASELINE mỗi project.
aeb_versions = Table(
    "aeb_versions",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("project_id", _Id, _fk("projects.id"), nullable=False),
    Column("version_no", Integer, nullable=False),
    Column("label", String(100)),
    Column("status", _enum(*AEB_VERSION_STATUSES), nullable=False, default="CANDIDATE"),
    Column("source", _enum("MANUAL", "OPTIMIZATION"), nullable=False, default="MANUAL"),
    Column("parent_version_id", _Id, _fk("aeb_versions.id")),
    Column("notes", Text),
    Column("created_by_user_id", _Id, _fk("users.id"), nullable=False),
    Column("created_date", DateTime, nullable=False),
    UniqueConstraint("project_id", "version_no"),
)

aeb_parameter_values = Table(
    "aeb_parameter_values",
    metadata,
    Column("aeb_version_id", _Id, _fk("aeb_versions.id", ondelete="CASCADE"), primary_key=True),
    Column("parameter_id", _Id, _fk("aeb_parameters.id"), primary_key=True),
    Column("param_value", _dec(14, 6), nullable=False),
)

# Một scenario = một họ kịch bản.
scenarios = Table(
    "scenarios",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("project_id", _Id, _fk("projects.id"), nullable=False),
    Column("code", String(30), nullable=False),
    Column("name", String(150), nullable=False),
    Column("description", Text),
    Column("created_by_user_id", _Id, _fk("users.id"), nullable=False),
    Column("created_date", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
    UniqueConstraint("project_id", "code"),
    UniqueConstraint("project_id", "name"),
)

# Bản gốc (không gian tham số) + biến thể GENERATED (một điểm của lưới, có cột lọc).
scenario_versions = Table(
    "scenario_versions",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("scenario_id", _Id, _fk("scenarios.id"), nullable=False),
    Column("version_no", Integer, nullable=False),
    Column("source", _enum("NATURAL_LANGUAGE", "MANUAL", "IMPORTED_XOSC", "GENERATED"), nullable=False),
    Column("parent_version_id", _Id, _fk("scenario_versions.id")),
    Column("natural_language_input", Text),
    Column("llm_model", String(100)),
    Column("scenario_ir_json", JSON, nullable=False),
    Column("ego_speed_kmh", _dec(6, 2)),
    Column("trigger_distance_m", _dec(6, 2)),
    Column("pedestrian_speed_mps", _dec(5, 2)),
    Column("stops_at_curb", Boolean),
    Column("weather", String(12)),
    Column("time_of_day", String(6)),
    Column("road_friction", _dec(4, 2)),
    Column("map_name", String(100)),
    Column("validation_status", _enum("NOT_VALIDATED", "VALID", "INVALID"), nullable=False),
    Column("status_message", Text),
    Column("created_by_user_id", _Id, _fk("users.id"), nullable=False),
    Column("created_date", DateTime, nullable=False),
    UniqueConstraint("scenario_id", "version_no"),
)

REGRESSION_EXECUTION = ("PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED")
REGRESSION_VERDICTS = ("PENDING", "PASSED", "REGRESSED", "FAILED")

# execution_status = chạy xong chưa; verdict = kết luận (chỉ có khi COMPLETED).
regression_tests = Table(
    "regression_tests",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("project_id", _Id, _fk("projects.id"), nullable=False),
    Column("scenario_id", _Id, _fk("scenarios.id"), nullable=False),
    Column("baseline_aeb_version_id", _Id, _fk("aeb_versions.id"), nullable=False),
    Column("candidate_aeb_version_id", _Id, _fk("aeb_versions.id"), nullable=False),
    Column("vehicle_version_id", _Id, _fk("vehicle_versions.id"), nullable=False),
    Column("simulator_version", String(30), nullable=False),
    Column("name", String(150)),
    Column("pass_criteria_json", JSON, nullable=False),
    Column("execution_status", _enum(*REGRESSION_EXECUTION), nullable=False, default="PENDING"),
    Column("verdict", _enum(*REGRESSION_VERDICTS), nullable=False, default="PENDING"),
    Column("total_scenarios", Integer, nullable=False, default=0),
    Column("fixed_scenarios", Integer, nullable=False, default=0),
    Column("regressed_scenarios", Integer, nullable=False, default=0),
    Column("created_by_user_id", _Id, _fk("users.id"), nullable=False),
    Column("created_date", DateTime, nullable=False),
    Column("finished_at", DateTime),
)

RUN_PURPOSES = ("BASELINE", "EVALUATION", "OPTIMIZATION", "REGRESSION", "ROBUSTNESS")
RUN_STATUSES = ("PENDING", "RUNNING", "PAUSED", "COMPLETED", "FAILED", "STOPPED")

# Một lần chạy = biến thể × phiên bản xe × AEB version × seed × bộ mô phỏng, gồm luôn kết quả chấm AEB.
simulation_runs = Table(
    "simulation_runs",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("project_id", _Id, _fk("projects.id"), nullable=False),
    Column("scenario_id", _Id, _fk("scenarios.id"), nullable=False),
    Column("scenario_version_id", _Id, _fk("scenario_versions.id"), nullable=False),
    Column("vehicle_version_id", _Id, _fk("vehicle_versions.id"), nullable=False),
    Column("aeb_version_id", _Id, _fk("aeb_versions.id"), nullable=False),
    Column("simulator_type", _enum("KINEMATIC", "CARLA"), nullable=False),
    Column("simulator_version", String(30), nullable=False),  # vehicsim-kinematic-1.0 | carla-0.9.16
    Column("map_name", String(100)),
    Column("fixed_delta_seconds", _dec(6, 4), nullable=False),
    Column("max_duration_s", _dec(8, 2)),
    Column("purpose", _enum(*RUN_PURPOSES), nullable=False),
    Column("status", _enum(*RUN_STATUSES), nullable=False, default="PENDING"),
    Column("random_seed", BigInteger, nullable=False),
    Column("baseline_run_id", _Id, _fk("simulation_runs.id")),
    Column("regression_test_id", _Id, _fk("regression_tests.id")),
    Column("run_config_json", JSON),
    Column("verdict", _enum("PASS", "FAIL")),
    Column("end_reason", _enum("TARGET_CLEARED", "EGO_STOPPED", "COLLISION", "TIMEOUT", "ERROR")),
    Column("simulated_duration_s", _dec(9, 3)),
    Column("collision_occurred", Boolean),
    Column("first_detection_time_s", _dec(8, 3)),
    Column("first_detection_distance_m", _dec(8, 3)),
    Column("fcw_activated", Boolean),
    Column("fcw_time_s", _dec(8, 3)),
    Column("aeb_activated", Boolean),
    Column("aeb_activation_time_s", _dec(8, 3)),
    Column("is_false_positive", Boolean),
    Column("is_false_negative", Boolean),
    Column("impact_speed_mps", _dec(8, 3)),
    Column("min_distance_m", _dec(10, 3)),
    Column("min_ttc_s", _dec(8, 3)),
    Column("braking_response_time_s", _dec(8, 3)),
    Column("max_deceleration_mps2", _dec(8, 3)),
    Column("mean_deceleration_mps2", _dec(8, 3)),
    Column("max_jerk_mps3", _dec(8, 3)),
    Column("stopping_distance_m", _dec(8, 3)),
    Column("telemetry_json", JSON),
    Column("error_message", Text),
    Column("worker_host", String(150)),
    Column("created_by_user_id", _Id, _fk("users.id"), nullable=False),
    Column("queued_at", DateTime, nullable=False),
    Column("started_at", DateTime),
    Column("ended_at", DateTime),
)

# File của run chạy ngoài process (CARLA): result.json, video.mp4. Chỉ lưu đường dẫn.
simulation_artifacts = Table(
    "simulation_artifacts",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("simulation_run_id", _Id, _fk("simulation_runs.id", ondelete="CASCADE"), nullable=False),
    Column(
        "artifact_type",
        _enum("VIDEO_MP4", "TELEMETRY", "SENSOR_OUTPUT", "GROUND_TRUTH", "LOG", "RESULT_FILE", "XOSC"),
        nullable=False,
    ),
    Column("file_name", String(255), nullable=False),
    Column("storage_url", String(1024), nullable=False),
    Column("mime_type", String(100)),
    Column("file_size_bytes", BigInteger),
    Column("created_date", DateTime, nullable=False),
)

collision_events = Table(
    "collision_events",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("simulation_run_id", _Id, _fk("simulation_runs.id", ondelete="CASCADE"), nullable=False),
    Column("frame", Integer, nullable=False),
    Column("simulation_time_s", _dec(10, 3), nullable=False),
    Column("other_actor_type_id", String(100)),
    Column("collision_type", _enum("FRONT", "SIDE", "REAR", "OTHER"), nullable=False, default="FRONT"),
    Column("impact_speed_mps", _dec(8, 3)),
    Column("location_x_m", _dec(10, 3)),
    Column("location_y_m", _dec(10, 3)),
)

STAGES = ("PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS")

failures = Table(
    "failures",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("simulation_run_id", _Id, _fk("simulation_runs.id", ondelete="CASCADE"), nullable=False),
    Column("failure_type", String(32), nullable=False),
    Column("category", _enum(*STAGES), nullable=False),
    Column("severity", _enum("LOW", "MEDIUM", "HIGH", "CRITICAL"), nullable=False),
    Column("description", Text, nullable=False),
    Column("detected_by", _enum("AUTO", "MANUAL"), nullable=False, default="AUTO"),
    Column("created_date", DateTime, nullable=False),
    UniqueConstraint("simulation_run_id", "failure_type"),
)

root_causes = Table(
    "root_causes",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("failure_id", _Id, _fk("failures.id", ondelete="CASCADE"), nullable=False),
    Column("category", _enum(*STAGES), nullable=False),
    Column("cause_code", String(64), nullable=False),
    Column("description", Text, nullable=False),
    Column("aeb_parameter_id", _Id, _fk("aeb_parameters.id")),
    Column("confidence", _dec(4, 3)),
    Column("is_primary", Boolean, nullable=False, default=False),
    UniqueConstraint("failure_id", "cause_code"),
)

OUTCOMES = ("SAFE", "NEAR_MISS", "COLLISION")

# Kết quả từng kịch bản của một regression: run candidate ghép với đúng run baseline.
regression_test_items = Table(
    "regression_test_items",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("regression_test_id", _Id, _fk("regression_tests.id", ondelete="CASCADE"), nullable=False),
    Column("scenario_version_id", _Id, _fk("scenario_versions.id"), nullable=False),
    Column("baseline_run_id", _Id, _fk("simulation_runs.id"), nullable=False),
    Column("candidate_run_id", _Id, _fk("simulation_runs.id"), nullable=False, unique=True),
    Column("baseline_outcome", _enum(*OUTCOMES)),
    Column("candidate_outcome", _enum(*OUTCOMES)),
    Column("change_type", _enum("FIXED", "REGRESSED", "UNCHANGED")),
    Column("is_regression", Boolean, nullable=False, default=False),
    UniqueConstraint("regression_test_id", "scenario_version_id"),
)

RECOMMENDATION_STATUSES = ("PENDING_REVIEW", "ACCEPTED", "REJECTED", "MORE_TESTS_REQUESTED")

# Một khuyến nghị cho một regression; Reviewer quyết định (không bao giờ tự Accept).
engineering_recommendations = Table(
    "engineering_recommendations",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("project_id", _Id, _fk("projects.id"), nullable=False),
    Column("regression_test_id", _Id, _fk("regression_tests.id"), nullable=False, unique=True),
    Column("candidate_aeb_version_id", _Id, _fk("aeb_versions.id"), nullable=False),
    Column("content", Text, nullable=False),
    Column("confidence", _enum("HIGH", "MEDIUM", "LOW")),
    Column("status", _enum(*RECOMMENDATION_STATUSES), nullable=False, default="PENDING_REVIEW"),
    Column("created_by_user_id", _Id, _fk("users.id"), nullable=False),
    Column("reviewed_by_user_id", _Id, _fk("users.id")),
    Column("reviewed_at", DateTime),
    Column("review_notes", Text),
    Column("review_conditions", Text),
    Column("created_date", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)
