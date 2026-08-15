"""Durable scenario persistence shared by SQLite and PostgreSQL.

The table and column names in this module are the contract consumed by the
retriever.  Keep them backend-neutral and use SQLAlchemy Core only.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from struct import pack, unpack
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    event,
    insert,
    select,
    update,
)
from sqlalchemy.engine import Engine

from src.models.schemas import (
    JobStatus,
    ReviewDecision,
    ReviewGate,
    ScenarioSpec,
    ScenarioStatus,
    can_request_simulation,
    next_status_after_review,
)

metadata = MetaData()

scenarios = Table(
    "scenarios",
    metadata,
    Column("scenario_id", String(64), primary_key=True),
    Column("status", String(32), nullable=False),
    Column("title", String(120), nullable=False),
    Column("description_vi", Text, nullable=False),
    Column("spec", JSON, nullable=False),
    Column("xosc_content", Text, nullable=False),
    Column("assumptions", JSON, nullable=False),
    Column("tags", JSON, nullable=False),
    Column("road_type", String(50), nullable=False),
    Column("weather", String(50), nullable=False),
    Column("actor_type", String(50), nullable=False),
    Column("maneuver", String(50), nullable=False),
    Column("embedding", LargeBinary, nullable=True),
    Column("embedding_model", String(100), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
)
Index("ix_scenarios_road_type", scenarios.c.road_type)
Index("ix_scenarios_weather", scenarios.c.weather)
Index("ix_scenarios_actor_type", scenarios.c.actor_type)
Index("ix_scenarios_maneuver", scenarios.c.maneuver)

generation_requests = Table(
    "generation_requests",
    metadata,
    Column("request_id", String(64), primary_key=True),
    Column("description_vi", Text, nullable=False),
    Column("validation_mode", String(32), nullable=False),
    Column("status", String(16), nullable=False),
    Column("scenario_id", String(64), ForeignKey("scenarios.scenario_id"), nullable=True),
    Column("issue_history", JSON, nullable=False),
    Column("node_metrics", JSON, nullable=False),
    Column("failed_reason", Text, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

review_decisions = Table(
    "review_decisions",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("scenario_id", String(64), ForeignKey("scenarios.scenario_id"), nullable=False),
    Column("gate", String(32), nullable=False),
    Column("approved", Boolean, nullable=False),
    Column("reviewer", String(255), nullable=False),
    Column("reason", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

scenario_jobs = Table(
    "scenario_jobs",
    metadata,
    Column("job_id", String(64), primary_key=True),
    Column("scenario_id", String(64), ForeignKey("scenarios.scenario_id"), nullable=False),
    Column("status", String(32), nullable=False),
    Column("claimed_by", String(255), nullable=True),
    Column("claimed_at", DateTime(timezone=True), nullable=True),
    Column("result", JSON, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)


class PersistenceError(RuntimeError):
    """A durable write or repository-enforced transition failed."""


def utcnow() -> datetime:
    return datetime.now(UTC)


def encode_embedding(values: Iterable[float]) -> bytes:
    """Encode float32 values using the retriever contract: little-endian BLOB."""
    vector = tuple(float(value) for value in values)
    return pack(f"<{len(vector)}f", *vector)


def decode_embedding(blob: bytes) -> tuple[float, ...]:
    if len(blob) % 4:
        raise ValueError("embedding BLOB length must be divisible by four")
    return unpack(f"<{len(blob) // 4}f", blob)


def make_engine(database_url: str) -> Engine:
    kwargs: dict[str, Any] = {"future": True}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(database_url, **kwargs)
    if database_url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection: Any, _record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


class ScenarioRepository:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    def create_schema(self) -> None:
        metadata.create_all(self.engine)

    def persist_pending_review(
        self,
        *,
        request_id: str,
        request_description_vi: str,
        scenario_description_vi: str,
        validation_mode: str,
        spec: ScenarioSpec,
        xosc_content: str,
        assumptions: list[dict[str, Any]],
        issue_history: list[dict[str, Any]],
        node_metrics: dict[str, Any],
        tags: list[str] | None = None,
    ) -> None:
        """Atomically persist a completed request and its pending scenario.

        Embedding is deliberately NULL here.  It may only be written by an
        approved BEFORE_LIBRARY review transaction.
        """
        now = utcnow()
        try:
            with self.engine.begin() as connection:
                connection.execute(
                    insert(scenarios).values(
                        scenario_id=spec.scenario_id,
                        status=ScenarioStatus.PENDING_REVIEW.value,
                        title=spec.title,
                        description_vi=scenario_description_vi,
                        spec=spec.model_dump(mode="json"),
                        xosc_content=xosc_content,
                        assumptions=assumptions,
                        tags=tags or [],
                        road_type=spec.odd.road_type.value,
                        weather=spec.odd.weather.value,
                        actor_type=spec.odd.actor_type.value,
                        maneuver=spec.odd.maneuver.value,
                        embedding=None,
                        embedding_model=None,
                        created_at=now,
                    )
                )
                connection.execute(
                    insert(generation_requests).values(
                        request_id=request_id,
                        description_vi=request_description_vi,
                        validation_mode=validation_mode,
                        status="done",
                        scenario_id=spec.scenario_id,
                        issue_history=issue_history,
                        node_metrics=node_metrics,
                        failed_reason=None,
                        created_at=now,
                        updated_at=now,
                    )
                )
        except Exception as exc:
            raise PersistenceError("could not persist pending scenario") from exc

    def get_scenario(self, scenario_id: str) -> dict[str, Any] | None:
        with self.engine.connect() as connection:
            row = (
                connection.execute(select(scenarios).where(scenarios.c.scenario_id == scenario_id))
                .mappings()
                .one_or_none()
            )
        return dict(row) if row else None

    def apply_review(
        self,
        decision: ReviewDecision,
        *,
        embedding: Iterable[float] | None = None,
        embedding_model: str | None = None,
        job_id: str | None = None,
    ) -> ScenarioStatus:
        """Append a decision and apply its transition in one transaction."""
        try:
            with self.engine.begin() as connection:
                row = connection.execute(
                    select(scenarios.c.status).where(scenarios.c.scenario_id == decision.scenario_id).with_for_update()
                ).one_or_none()
                if row is None:
                    raise PersistenceError("scenario does not exist")
                current = ScenarioStatus(row.status)
                target = next_status_after_review(current, decision.gate, decision.approved)
                if target is None:
                    raise PersistenceError("invalid scenario review transition")

                values: dict[str, Any] = {"status": target.value}
                if decision.gate is ReviewGate.BEFORE_LIBRARY and decision.approved:
                    if embedding is None or not embedding_model or not embedding_model.strip():
                        raise PersistenceError("BEFORE_LIBRARY approval requires embedding and embedding_model")
                    embedding_blob = encode_embedding(embedding)
                    if not embedding_blob:
                        raise PersistenceError("BEFORE_LIBRARY approval requires a non-empty embedding")
                    values.update(embedding=embedding_blob, embedding_model=embedding_model)

                changed = connection.execute(
                    update(scenarios)
                    .where(
                        scenarios.c.scenario_id == decision.scenario_id,
                        scenarios.c.status == current.value,
                    )
                    .values(**values)
                )
                if changed.rowcount != 1:
                    raise PersistenceError("scenario changed during review")
                connection.execute(
                    insert(review_decisions).values(
                        scenario_id=decision.scenario_id,
                        gate=decision.gate.value,
                        approved=decision.approved,
                        reviewer=decision.reviewer,
                        reason=decision.reason,
                        created_at=decision.decided_at,
                    )
                )
                if decision.gate is ReviewGate.BEFORE_SIM and decision.approved:
                    if not job_id:
                        raise PersistenceError("BEFORE_SIM approval requires job_id")
                    now = utcnow()
                    connection.execute(
                        insert(scenario_jobs).values(
                            job_id=job_id,
                            scenario_id=decision.scenario_id,
                            status=JobStatus.PENDING.value,
                            claimed_by=None,
                            claimed_at=None,
                            result=None,
                            created_at=now,
                            updated_at=now,
                        )
                    )
                return target
        except PersistenceError:
            raise
        except Exception as exc:
            raise PersistenceError("could not apply review") from exc

    def request_simulation(self, scenario_id: str) -> None:
        """Move an approved library scenario to the second review gate."""
        try:
            with self.engine.begin() as connection:
                row = connection.execute(
                    select(scenarios.c.status).where(scenarios.c.scenario_id == scenario_id).with_for_update()
                ).one_or_none()
                if row is None or not can_request_simulation(ScenarioStatus(row.status)):
                    raise PersistenceError("scenario is not eligible for simulation review")
                changed = connection.execute(
                    update(scenarios)
                    .where(
                        scenarios.c.scenario_id == scenario_id,
                        scenarios.c.status == ScenarioStatus.APPROVED_LIBRARY.value,
                    )
                    .values(status=ScenarioStatus.PENDING_SIM_REVIEW.value)
                )
                if changed.rowcount != 1:
                    raise PersistenceError("scenario changed during simulation request")
        except PersistenceError:
            raise
        except Exception as exc:
            raise PersistenceError("could not request simulation") from exc
