"""Durable scenario persistence shared by SQLite and PostgreSQL.

The table and column names in this module are the contract consumed by the
retriever.  Keep them backend-neutral and use SQLAlchemy Core only.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
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
    EgoControllerType,
    JobKind,
    JobStatus,
    ReviewDecision,
    ReviewGate,
    ScenarioSpec,
    ScenarioStatus,
    VerificationLevel,
    next_status_after_execution,
    next_status_after_review,
    normalize_prompt,
)

metadata = MetaData()

scenarios = Table(
    "scenarios",
    metadata,
    Column("scenario_id", String(64), primary_key=True),
    Column("status", String(32), nullable=False),
    Column("title", String(120), nullable=False),
    Column("description_vi", Text, nullable=False),
    # Khoá chặn trùng ở lối vào (ADR-015 §15.2): dạng đã chuẩn hoá của chính
    # ``description_vi`` ở hàng này. Nullable vì hàng có từ trước khi cột này tồn
    # tại; ``init_db()`` backfill chúng.
    Column("description_normalized", Text, nullable=True),
    # Người tạo. Đề bài đòi "ít nhất 2 vai trò: người tạo và người duyệt" — không
    # lưu ai tạo thì hệ thống có ĐÚNG MỘT vai trò, và không phân biệt được người
    # tự duyệt bài của mình với người duyệt hộ. Không xác thực (đề bài không đòi),
    # nhưng có ghi thì mới nói được là có phân vai.
    Column("created_by", String(255), nullable=False, server_default="unknown"),
    Column("spec", JSON, nullable=False),
    Column("xosc_content", Text, nullable=False),
    Column("assumptions", JSON, nullable=False),
    Column("tags", JSON, nullable=False),
    Column("road_type", String(50), nullable=False),
    Column("weather", String(50), nullable=False),
    Column("actor_type", String(50), nullable=False),
    Column("maneuver", String(50), nullable=False),
    # Trục thứ hai bên cạnh `status`: kịch bản đã kiểm chứng tới đâu (ADR-017).
    # Là cột thật chứ không nhét vào `tags` JSON, cùng lý do ADR-013 đưa bốn trục
    # ODD ra cột riêng: retrieval lọc theo nó, mà `WHERE` không đào vào JSON được.
    Column("verification", String(32), nullable=False, server_default=VerificationLevel.UNVERIFIED.value),
    Column("embedding", LargeBinary, nullable=True),
    Column("embedding_model", String(100), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
)
Index("ix_scenarios_road_type", scenarios.c.road_type)
Index("ix_scenarios_weather", scenarios.c.weather)
Index("ix_scenarios_actor_type", scenarios.c.actor_type)
Index("ix_scenarios_maneuver", scenarios.c.maneuver)
Index("ix_scenarios_verification", scenarios.c.verification)
# Có index thì tra trùng là một lần seek. Không có thì mỗi ``POST /generate`` quét
# cả bảng — ADR-015 §Hệ quả đòi index chính vì thế.
Index("ix_scenarios_description_normalized", scenarios.c.description_normalized)

generation_requests = Table(
    "generation_requests",
    metadata,
    Column("request_id", String(64), primary_key=True),
    Column("description_vi", Text, nullable=False),
    # Xem ghi chú cùng tên ở bảng ``scenarios``. ``NULL`` mang thêm một nghĩa ở
    # đây: lần sinh này được yêu cầu bằng ``force_generate``, nên nó cố ý đứng
    # ngoài cả phép tra trùng lẫn unique index bên dưới.
    Column("description_normalized", Text, nullable=True),
    Column("created_by", String(255), nullable=False, server_default="unknown"),
    Column("validation_mode", String(32), nullable=False),
    Column("status", String(16), nullable=False),
    Column("scenario_id", String(64), ForeignKey("scenarios.scenario_id"), nullable=True),
    Column("issue_history", JSON, nullable=False),
    Column("node_metrics", JSON, nullable=False),
    Column("failed_reason", Text, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
    # Ba cột dưới chỉ phục vụ polling `GET /status/{request_id}`: chúng nói lần
    # sinh này đang ở node nào, không nói kết quả của nó. Tách bảng riêng cho
    # tiến độ thì mỗi lần poll thành hai truy vấn trên hai bảng có thể lệch nhau;
    # để chung một hàng thì tiến trình và kết quả không bao giờ rời nhau.
    Column("step", String(32), nullable=False, server_default="queued"),
    Column("progress", Integer, nullable=False, server_default="0"),
    Column("error", Text, nullable=True),
    # Top-k người dùng chọn ở FE. Lưu lại vì nó đổi kết quả retrieval — không có
    # nó thì không tái dựng được một lần sinh đã xảy ra.
    Column("retrieve_limit", Integer, nullable=False, server_default="3"),
    # Lần sinh này thuộc chiến dịch nào. NULL = người tự gõ câu (đường retail).
    # Cần để tách hai luồng khi đọc số liệu và khi duyệt theo lô (ADR-014).
    Column("campaign_id", String(64), nullable=True),
)

# Hai request giống hệt nhau tới cùng lúc thì cái sau phải hỏng ở tầng DB, không
# phải ở tầng ứng dụng: giữa lúc handler đọc "chưa có ai chạy" và lúc nó INSERT
# có một khe thời gian, và khe đó đủ rộng cho request thứ hai lọt qua. Unique
# index từng phần đóng khe đó mà không cần khoá trong process — thứ vốn vô dụng
# khi có nhiều worker.
#
# ``NULL`` không đụng unique index trong cả SQLite lẫn Postgres, nên
# ``force_generate`` (ghi ``NULL``) luôn chạy được, kể cả song song.
Index(
    "ux_generation_requests_running_description",
    generation_requests.c.description_normalized,
    unique=True,
    sqlite_where=generation_requests.c.status == "running",
    postgresql_where=generation_requests.c.status == "running",
)

campaigns = Table(
    "campaigns",
    metadata,
    Column("campaign_id", String(64), primary_key=True),
    Column("created_by", String(255), nullable=False, server_default="unknown"),
    # Danh sách ô ODD người dùng khoanh, đã giao với SupportPolicy trước khi lưu.
    # Lưu nguyên thay vì lưu bộ lọc: bộ lọc sinh ra ô nào phụ thuộc SupportPolicy
    # tại thời điểm chạy, mà policy sẽ mở rộng khi có anchor mới — lúc đó không
    # còn dựng lại được chiến dịch cũ để đối chiếu.
    Column("cells", JSON, nullable=False),
    Column("per_cell", Integer, nullable=False, server_default="1"),
    # Trần chi phí là ĐIỀU KIỆN DỪNG, không phải tuỳ chọn: một vòng lặp sinh tự
    # động không có trần là một hoá đơn không có trần.
    Column("max_scenarios", Integer, nullable=False),
    Column("status", String(16), nullable=False, server_default="running"),
    Column("generated", Integer, nullable=False, server_default="0"),
    Column("failed", Integer, nullable=False, server_default="0"),
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

intent_labels = Table(
    "intent_labels",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("scenario_id", String(64), ForeignKey("scenarios.scenario_id"), nullable=False),
    Column("labeller", String(255), nullable=False),
    Column("label", String(16), nullable=False),
    Column("reason", Text, nullable=False, server_default=""),
    Column("automatic_verdict", String(16), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
)
"""Nhãn người chấm cho câu hỏi "kịch bản này có tái hiện đúng ý định không".

Vì sao cần bảng này: mức L4 hiện do máy tự chấm bằng luật do chính ta viết, nên
nó không trả lời được câu "ai nói kịch bản này đúng?". Có nhãn người thì L4 đo
được — báo cáo được **mức khớp** giữa chấm tự động và chấm tay.

``automatic_verdict`` chép lại phán quyết của máy **tại thời điểm chấm**. Nó ở
đây để chỗ lệch còn truy được về sau khi luật chấm đã đổi; không có nó thì sửa
luật một lần là mất sạch lịch sử bất đồng, mà chỗ bất đồng mới là thứ đáng giá.

Nhiều nhãn cho cùng một kịch bản là **hợp lệ và mong muốn**: hai người chấm chồng
lên nhau cho ra mức đồng thuận giữa người với người, thước đo mạnh hơn hẳn.
"""

scenario_jobs = Table(
    "scenario_jobs",
    metadata,
    Column("job_id", String(64), primary_key=True),
    Column("scenario_id", String(64), ForeignKey("scenarios.scenario_id"), nullable=False),
    Column("status", String(32), nullable=False),
    Column("job_kind", String(32), nullable=False, server_default=JobKind.SCENARIO_VALIDATION.value),
    Column(
        "ego_controller",
        String(32),
        nullable=False,
        server_default=EgoControllerType.SCENARIO_RUNNER_DEFAULT.value,
    ),
    Column("claimed_by", String(255), nullable=True),
    Column("claimed_at", DateTime(timezone=True), nullable=True),
    Column("result", JSON, nullable=True),
    # Bản sao .xosc gửi kèm cho worker. Worker GPU chạy ở máy khác và không nối
    # được vào bảng `scenarios`, nên job phải tự mang nội dung đi (ADR-001: thứ
    # đi qua ranh giới máy là chuỗi XML, không phải object).
    Column("xosc_content", Text, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

users = Table(
    "users",
    metadata,
    Column("username", String(255), primary_key=True),
    Column("name", String(255), nullable=False),
    Column("email", String(255), nullable=False),
    Column("role", String(50), nullable=False, server_default="creator"),
    Column("status", String(50), nullable=False, server_default="active"),
    Column("reason", Text, nullable=True),
    Column("password_hash", String(255), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)
Index("ix_users_role", users.c.role)
Index("ix_users_status", users.c.status)


class PersistenceError(RuntimeError):
    """A durable write or repository-enforced transition failed."""


def utcnow() -> datetime:
    return datetime.now(UTC)


# Định dạng BLOB của cột `scenarios.embedding`: float32, little-endian.
#
# Đây là **định nghĩa duy nhất** của định dạng đó. Mọi chỗ ghi hoặc đọc vector
# phải đi qua `encode_embedding` / `decode_embedding`, hoặc dùng
# `EMBEDDING_DTYPE` nếu cần đường nhanh của numpy.
#
# Trước đây có hai bản cài đặt: module này dùng `struct`, còn
# `library/retriever.py` tự `np.frombuffer` và `.tobytes()`. Cả hai cùng chạy
# được nên không ai thấy vấn đề — cho tới lúc một bên đổi endianness hoặc kiểu
# số. Lúc đó vector không hỏng mà **lệch**: cosine vẫn trả về một con số, chỉ là
# con số vô nghĩa, và retrieval xếp hạng sai mà không có lỗi nào bắn ra.
#
# `test_embedding_codec_has_one_definition` ghim sự tương đương giữa hai đường.
_STRUCT_ELEMENT = "f"  # struct: float32
EMBEDDING_DTYPE = "<f4"  # numpy: cùng thứ đó, little-endian
EMBEDDING_ITEMSIZE = 4


def encode_embedding(values: Iterable[float]) -> bytes:
    """Vector float -> BLOB theo đúng định dạng cột `scenarios.embedding`."""
    vector = tuple(float(value) for value in values)
    return pack(f"<{len(vector)}{_STRUCT_ELEMENT}", *vector)


def decode_embedding(blob: bytes) -> tuple[float, ...]:
    """BLOB -> tuple float. Ngược của :func:`encode_embedding`."""
    if len(blob) % EMBEDDING_ITEMSIZE:
        raise ValueError("embedding BLOB length must be divisible by four")
    return unpack(f"<{len(blob) // EMBEDDING_ITEMSIZE}{_STRUCT_ELEMENT}", blob)


SQLITE_URL_PREFIX = "sqlite:///"


def sqlite_path(database_url: str, *, caller: str) -> Path:
    """``sqlite:///…`` -> đường dẫn file. **Một định nghĩa duy nhất.**

    Hai module mở SQLite bằng ``sqlite3`` thuần (``services/db.py`` và
    ``library/retriever.py``) và trước đây mỗi module tự bóc tiền tố này. Hai
    bản sao của cùng một phép bóc chuỗi thì không sai ngay — chúng lệch nhau vào
    lần đầu ai đó thêm một dạng URL mới ở một bên, và triệu chứng là retrieval
    đọc đúng file khác với file backend đang ghi: **rỗng, không có lỗi nào**.

    ``caller`` chỉ đi vào thông báo lỗi, để người đọc traceback biết ngay module
    nào đòi SQLite mà cấu hình lại trỏ sang backend khác.
    """
    if not database_url.startswith(SQLITE_URL_PREFIX):
        raise RuntimeError(f"{caller} chỉ chạy trên SQLite; database_url hiện tại là {database_url!r}")
    return Path(database_url[len(SQLITE_URL_PREFIX) :])


def connect_sqlite(path: Path) -> sqlite3.Connection:
    """Kết nối ``sqlite3`` thuần với ``row_factory`` đã đặt sẵn.

    Quên ``row_factory = sqlite3.Row`` là mọi chỗ đọc theo tên cột trở thành
    ``TypeError`` ở tận nơi dùng, nên nó đi kèm luôn với việc mở kết nối.
    """
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn


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

    def persist_pending_sim_review(
        self,
        *,
        request_id: str,
        request_description_vi: str,
        scenario_description_vi: str,
        created_by: str,
        validation_mode: str,
        spec: ScenarioSpec,
        xosc_content: str,
        assumptions: list[dict[str, Any]],
        issue_history: list[dict[str, Any]],
        node_metrics: dict[str, Any],
        tags: list[str] | None = None,
    ) -> None:
        """Persist a completed generation at the first gate, BEFORE_SIM.

        Embedding is deliberately NULL here.  It may only be written by an
        approved BEFORE_LIBRARY review transaction.
        """
        now = utcnow()
        try:
            with self.engine.begin() as connection:
                connection.execute(
                    insert(scenarios).values(
                        scenario_id=spec.scenario_id,
                        status=ScenarioStatus.PENDING_SIM_REVIEW.value,
                        title=spec.title,
                        description_vi=scenario_description_vi,
                        description_normalized=normalize_prompt(scenario_description_vi),
                        created_by=created_by,
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
                # Hàng `generation_requests` có thể ĐÃ tồn tại: tầng HTTP tạo nó
                # ngay khi nhận request để `GET /status` có gì mà trả về, rồi
                # workflow mới chạy. Insert thẳng vào đó là vi phạm khoá chính,
                # và cả transaction đổ — tức là sinh xong nhưng không lưu được.
                #
                # Update-trước-insert-sau thay vì `INSERT OR REPLACE`: cú pháp
                # upsert của SQLite và Postgres khác nhau, mà ADR-011 chốt cùng
                # một repository chạy trên cả hai.
                finalised = {
                    "description_vi": request_description_vi,
                    "validation_mode": validation_mode,
                    "status": "done",
                    "step": "done",
                    "progress": 100,
                    "error": None,
                    "scenario_id": spec.scenario_id,
                    "issue_history": issue_history,
                    "node_metrics": node_metrics,
                    "failed_reason": None,
                    "updated_at": now,
                }
                updated = connection.execute(
                    update(generation_requests)
                    .where(generation_requests.c.request_id == request_id)
                    .values(**finalised)
                )
                if updated.rowcount == 0:
                    connection.execute(
                        insert(generation_requests).values(
                            request_id=request_id,
                            created_at=now,
                            **finalised,
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
                    select(scenarios.c.status, scenarios.c.xosc_content)
                    .where(scenarios.c.scenario_id == decision.scenario_id)
                    .with_for_update()
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
                            job_kind=JobKind.SCENARIO_VALIDATION.value,
                            ego_controller=EgoControllerType.SCENARIO_RUNNER_DEFAULT.value,
                            claimed_by=None,
                            claimed_at=None,
                            result=None,
                            xosc_content=row.xosc_content,
                            created_at=now,
                            updated_at=now,
                        )
                    )
                return target
        except PersistenceError:
            raise
        except Exception as exc:
            raise PersistenceError("could not apply review") from exc

    def record_execution(self, scenario_id: str, verification: VerificationLevel) -> ScenarioStatus:
        """Persist worker evidence and atomically open BEFORE_LIBRARY."""
        try:
            with self.engine.begin() as connection:
                row = connection.execute(
                    select(scenarios.c.status).where(scenarios.c.scenario_id == scenario_id).with_for_update()
                ).one_or_none()
                if row is None:
                    raise PersistenceError("scenario does not exist")
                current = ScenarioStatus(row.status)
                target = next_status_after_execution(current)
                if target is None:
                    raise PersistenceError("scenario is not waiting for execution result")
                changed = connection.execute(
                    update(scenarios)
                    .where(scenarios.c.scenario_id == scenario_id, scenarios.c.status == current.value)
                    .values(status=target.value, verification=verification.value)
                )
                if changed.rowcount != 1:
                    raise PersistenceError("scenario changed during execution result")
                return target
        except PersistenceError:
            raise
        except Exception as exc:
            raise PersistenceError("could not record execution") from exc
