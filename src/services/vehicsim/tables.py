"""Bảng MVP của VehicSim trên schema MySQL (``database/mysql/01_schema.sql``).

Giống ``auth/users.py``: các ``Table`` ở đây chỉ mô tả lại **đúng các cột code
đọc/ghi** để SQLAlchemy Core sinh câu lệnh có tham số. Nguồn sự thật vẫn là
file SQL — MySQL dựng bảng từ đó, ``metadata.create_all`` chỉ chạy trên SQLite
trong test. Dùng chung ``metadata`` với ``users`` để khoá ngoại tới ``users``
dựng được trong test.

Không mô tả ``optimization_*`` và ``sensors``: MVP không đụng tới (FE-13 và
cảm biến thật để sau).
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
    SmallInteger,
    String,
    Table,
    Text,
    UniqueConstraint,
)

from src.services.auth.users import metadata

# SQLite chỉ tự tăng với INTEGER PRIMARY KEY; MySQL dùng BIGINT như file SQL.
_Id = BigInteger().with_variant(Integer, "sqlite")
_TinyId = SmallInteger().with_variant(Integer, "sqlite")


def _dec(precision: int, scale: int) -> Numeric:
    # asdecimal=False: trả float thay vì Decimal — code tính toán và JSON đều cần float.
    return Numeric(precision, scale, asdecimal=False)


def _fk(target: str, **kw) -> ForeignKey:
    return ForeignKey(target, **kw)


workspaces = Table(
    "workspaces",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("name", String(150), nullable=False),
    Column("description", Text),
    Column("owner_id", _Id, _fk("users.id"), nullable=False),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)

projects = Table(
    "projects",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("workspace_id", _Id, _fk("workspaces.id"), nullable=False),
    Column("name", String(150), nullable=False),
    Column("description", Text),
    Column("status", Enum("ACTIVE", "ARCHIVED", native_enum=False), nullable=False, default="ACTIVE"),
    Column("created_by", _Id, _fk("users.id"), nullable=False),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)

vehicles = Table(
    "vehicles",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("project_id", _Id, _fk("projects.id"), nullable=False, unique=True),
    Column("name", String(150), nullable=False),
    Column("carla_blueprint", String(100), nullable=False),
    Column("mass_kg", _dec(8, 2), nullable=False),
    Column("length_m", _dec(5, 3), nullable=False),
    Column("width_m", _dec(5, 3), nullable=False),
    Column("height_m", _dec(5, 3), nullable=False),
    Column("wheelbase_m", _dec(5, 3), nullable=False),
    Column("max_speed_mps", _dec(7, 3), nullable=False),
    Column("max_brake_decel_mps2", _dec(5, 2), nullable=False),
    Column("tire_friction_coeff", _dec(4, 3)),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)

aeb_systems = Table(
    "aeb_systems",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("project_id", _Id, _fk("projects.id"), nullable=False),
    Column("vehicle_id", _Id, _fk("vehicles.id"), nullable=False, unique=True),
    Column("name", String(150), nullable=False),
    Column("description", Text),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)

AEB_VERSION_STATUSES = ("BASELINE", "CANDIDATE", "ACCEPTED", "REJECTED", "ARCHIVED")

aeb_versions = Table(
    "aeb_versions",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("aeb_system_id", _Id, _fk("aeb_systems.id"), nullable=False),
    Column("version_number", Integer, nullable=False),
    Column("label", String(100)),
    Column("source", Enum("MANUAL", "OPTIMIZATION", native_enum=False), nullable=False, default="MANUAL"),
    Column("status", Enum(*AEB_VERSION_STATUSES, native_enum=False), nullable=False, default="CANDIDATE"),
    Column("parent_version_id", _Id, _fk("aeb_versions.id")),
    Column("notes", Text),
    Column("created_by", _Id, _fk("users.id")),
    Column("created_at", DateTime, nullable=False),
    UniqueConstraint("aeb_system_id", "version_number"),
)

aeb_parameters = Table(
    "aeb_parameters",
    metadata,
    Column("id", _TinyId, primary_key=True, autoincrement=True),
    Column("code", String(40), nullable=False, unique=True),
    Column("name", String(100), nullable=False),
    Column("category", String(20), nullable=False),
    Column("unit", String(20), nullable=False),
    Column("description", String(255)),
    Column("min_value", _dec(12, 4), nullable=False),
    Column("max_value", _dec(12, 4), nullable=False),
    Column("default_value", _dec(12, 4), nullable=False),
    Column("sort_order", Integer, nullable=False),
)

aeb_parameter_values = Table(
    "aeb_parameter_values",
    metadata,
    Column("aeb_version_id", _Id, _fk("aeb_versions.id", ondelete="CASCADE"), primary_key=True),
    Column("aeb_parameter_id", _TinyId, _fk("aeb_parameters.id"), primary_key=True),
    Column("value", _dec(12, 4), nullable=False),
)

scenarios = Table(
    "scenarios",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("project_id", _Id, _fk("projects.id"), nullable=False),
    Column("code", String(30), nullable=False),
    Column("name", String(200), nullable=False),
    Column("description", Text),
    Column(
        "category",
        Enum("PEDESTRIAN", "VEHICLE", "CYCLIST", "OTHER", native_enum=False),
        nullable=False,
        default="PEDESTRIAN",
    ),
    Column("created_by", _Id, _fk("users.id"), nullable=False),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
    UniqueConstraint("project_id", "code"),
)

scenario_versions = Table(
    "scenario_versions",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("scenario_id", _Id, _fk("scenarios.id"), nullable=False),
    Column("version_number", Integer, nullable=False),
    Column(
        "source",
        Enum("NATURAL_LANGUAGE", "MANUAL", "GENERATED", native_enum=False),
        nullable=False,
        default="MANUAL",
    ),
    Column("parent_version_id", _Id, _fk("scenario_versions.id")),
    Column("natural_language_input", Text),
    Column("llm_model", String(100)),
    Column("scenario_ir", JSON, nullable=False),
    Column("validation_status", String(10), nullable=False, default="VALID"),
    Column("validation_errors", JSON),
    Column("opendrive_map", String(100), nullable=False),
    Column("openscenario_version", String(20)),
    Column("xosc_content", Text),
    Column("change_note", String(500)),
    Column("created_by", _Id, _fk("users.id"), nullable=False),
    Column("created_at", DateTime, nullable=False),
    UniqueConstraint("scenario_id", "version_number"),
)

scenario_objects = Table(
    "scenario_objects",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("scenario_version_id", _Id, _fk("scenario_versions.id", ondelete="CASCADE"), nullable=False),
    Column("name", String(100), nullable=False),
    Column("role", String(10), nullable=False),
    Column("object_type", String(20), nullable=False),
    Column("carla_blueprint", String(100)),
    Column("extra_config", JSON),
)

scenario_environments = Table(
    "scenario_environments",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column(
        "scenario_version_id",
        _Id,
        _fk("scenario_versions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    ),
    Column("weather", String(12), nullable=False, default="CLEAR"),
    Column("time_of_day", String(6), nullable=False, default="DAY"),
    Column("road_condition", String(4), nullable=False, default="DRY"),
    Column("friction", _dec(4, 3), nullable=False, default=1.0),
)

scenario_parameters = Table(
    "scenario_parameters",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("scenario_version_id", _Id, _fk("scenario_versions.id", ondelete="CASCADE"), nullable=False),
    Column("scenario_object_id", _Id, _fk("scenario_objects.id", ondelete="CASCADE")),
    Column("param_name", String(64), nullable=False),
    Column("value", _dec(14, 4), nullable=False),
    Column("unit", String(20)),
)

RUN_PURPOSES = ("MANUAL", "BASELINE", "OPTIMIZATION", "REGRESSION")
RUN_STATUSES = ("QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED")

simulation_runs = Table(
    "simulation_runs",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("project_id", _Id, _fk("projects.id"), nullable=False),
    Column("scenario_id", _Id, _fk("scenarios.id"), nullable=False),
    Column("scenario_version_id", _Id, _fk("scenario_versions.id"), nullable=False),
    Column("vehicle_id", _Id, _fk("vehicles.id"), nullable=False),
    Column("aeb_system_id", _Id, _fk("aeb_systems.id"), nullable=False),
    Column("aeb_version_id", _Id, _fk("aeb_versions.id"), nullable=False),
    Column("regression_test_id", _Id, _fk("regression_tests.id")),
    Column("baseline_run_id", _Id, _fk("simulation_runs.id")),
    Column("purpose", Enum(*RUN_PURPOSES, native_enum=False), nullable=False, default="MANUAL"),
    Column("random_seed", BigInteger, nullable=False),
    Column("status", Enum(*RUN_STATUSES, native_enum=False), nullable=False, default="QUEUED"),
    Column("carla_version", String(30)),
    Column("fixed_delta_seconds", _dec(6, 4)),
    Column("max_duration_s", _dec(8, 2)),
    Column("worker_host", String(150)),
    Column("run_config", JSON),
    Column("error_message", Text),
    Column("requested_by", _Id, _fk("users.id")),
    Column("queued_at", DateTime, nullable=False),
    Column("started_at", DateTime),
    Column("finished_at", DateTime),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)

simulation_results = Table(
    "simulation_results",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column(
        "simulation_run_id",
        _Id,
        _fk("simulation_runs.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    ),
    Column("end_reason", String(16), nullable=False),
    Column("simulated_duration_s", _dec(9, 3)),
    Column("total_frames", Integer),
    Column("ego_final_speed_mps", _dec(7, 3)),
    Column("ego_distance_m", _dec(9, 3)),
    Column("raw_metrics", JSON),
    Column("created_at", DateTime, nullable=False),
)

aeb_results = Table(
    "aeb_results",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column(
        "simulation_result_id",
        _Id,
        _fk("simulation_results.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    ),
    Column("collision", Boolean, nullable=False),
    Column("collision_count", Integer, nullable=False, default=0),
    Column("impact_speed_mps", _dec(7, 3)),
    Column("min_ttc_s", _dec(8, 4)),
    Column("min_distance_m", _dec(8, 3)),
    Column("aeb_triggered", Boolean, nullable=False, default=False),
    Column("aeb_trigger_time_s", _dec(8, 3)),
    Column("braking_latency_s", _dec(8, 4)),
    Column("false_activation", Boolean, nullable=False, default=False),
    Column("missed_activation", Boolean, nullable=False, default=False),
    Column("max_deceleration_mps2", _dec(7, 3)),
    Column("mean_deceleration_mps2", _dec(7, 3)),
    Column("max_jerk_mps3", _dec(8, 3)),
    Column("stopping_distance_m", _dec(8, 3)),
    Column("verdict", String(4), nullable=False),
    Column("evaluated_at", DateTime, nullable=False),
)

collision_events = Table(
    "collision_events",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("aeb_result_id", _Id, _fk("aeb_results.id", ondelete="CASCADE"), nullable=False),
    Column("event_index", Integer, nullable=False, default=1),
    Column("target_object_id", _Id, _fk("scenario_objects.id")),
    Column("timestamp_s", _dec(9, 3), nullable=False),
    Column("impact_speed_mps", _dec(7, 3), nullable=False),
    Column("relative_speed_mps", _dec(7, 3)),
    Column("distance_at_trigger_m", _dec(8, 3)),
    Column("collision_type", String(5), nullable=False, default="FRONT"),
    Column("impact_x_m", _dec(9, 3)),
    Column("impact_y_m", _dec(9, 3)),
    Column("created_at", DateTime, nullable=False),
)

failures = Table(
    "failures",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("simulation_run_id", _Id, _fk("simulation_runs.id", ondelete="CASCADE"), nullable=False),
    Column("aeb_result_id", _Id, _fk("aeb_results.id")),
    Column("failure_type", String(32), nullable=False),
    Column("severity", String(8), nullable=False),
    Column("description", Text),
    Column("detected_at_s", _dec(9, 3)),
    Column("detected_by", String(6), nullable=False, default="AUTO"),
    Column("created_at", DateTime, nullable=False),
    UniqueConstraint("simulation_run_id", "failure_type"),
)

root_causes = Table(
    "root_causes",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("failure_id", _Id, _fk("failures.id", ondelete="CASCADE"), nullable=False),
    Column("cause_category", String(16), nullable=False),
    Column("cause_code", String(64), nullable=False),
    Column("related_aeb_parameter_id", _TinyId, _fk("aeb_parameters.id")),
    Column("description", Text),
    Column("confidence", _dec(4, 3)),
    Column("is_primary", Boolean, nullable=False, default=False),
    Column("analysis_method", String(12), nullable=False, default="RULE_BASED"),
    Column("created_at", DateTime, nullable=False),
    UniqueConstraint("failure_id", "cause_code"),
)

REGRESSION_STATUSES = ("PENDING", "RUNNING", "PASSED", "FAILED", "ERROR")
REVIEW_DECISIONS = ("PENDING", "ACCEPT", "REJECT", "REQUEST_MORE_TESTS")

regression_tests = Table(
    "regression_tests",
    metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("project_id", _Id, _fk("projects.id"), nullable=False),
    Column("name", String(150)),
    Column("aeb_system_id", _Id, _fk("aeb_systems.id"), nullable=False),
    Column("baseline_aeb_version_id", _Id, _fk("aeb_versions.id"), nullable=False),
    Column("candidate_aeb_version_id", _Id, _fk("aeb_versions.id"), nullable=False),
    Column("scenario_id", _Id, _fk("scenarios.id"), nullable=False),
    Column("base_scenario_version_id", _Id, _fk("scenario_versions.id"), nullable=False),
    Column("pass_criteria", JSON, nullable=False),
    Column("metric_deltas", JSON),
    Column("status", Enum(*REGRESSION_STATUSES, native_enum=False), nullable=False, default="PENDING"),
    Column("review_decision", Enum(*REVIEW_DECISIONS, native_enum=False), nullable=False, default="PENDING"),
    Column("reviewed_by", _Id, _fk("users.id")),
    Column("reviewed_at", DateTime),
    Column("review_note", Text),
    Column("review_conditions", Text),
    Column("created_by", _Id, _fk("users.id"), nullable=False),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)
