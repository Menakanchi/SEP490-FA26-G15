"""Tri thức cho Trợ lý dự án (RAG, chỉ đọc): dựng đoạn, nhúng vector, tìm kiếm.

Hai nguồn, cùng bảng ``knowledge_chunks``:

- **Tài liệu repo** (``project_id`` NULL): chỉ các file trong danh sách trắng
  ``DOC_SOURCES`` — kiến trúc VehicSim, ADR-023 → 029, nợ kỹ thuật, exec plan, AGENTS/CLAUDE.
  Không bao giờ đọc ``.env``, code hay dữ liệu ngoài danh sách
  (``test_only_whitelisted_docs_are_indexed``).
- **Dữ liệu project**: dựng từ chính các view màn hình (``views.py``), nên số trợ lý thấy
  là số kỹ sư thấy trên UI: tổng quan, 10 tham số + mọi AEB version, họ kịch bản, từng ca
  lỗi, từng regression + khuyến nghị.

Chỉ mục là dữ liệu dẫn xuất, cập nhật **tăng dần**: ``sync`` dựng lại văn bản, so
``content_hash``, chỉ nhúng đoạn mới/đổi, xoá đoạn không còn. Dấu vân tay dữ liệu lưu ở
Redis nên câu hỏi không phải dựng lại khi không có gì đổi.

Vector: ``text-embedding-3-small`` (ADR-006) khi có OpenAI key; không có thì
``hashing-bow-v1`` — băm túi từ đã bỏ dấu, chạy offline, test dùng. Mỗi đoạn ghi model của
nó; tìm kiếm chỉ so với đoạn cùng model, đổi model là tự nhúng lại.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sqlalchemy import delete, func, insert, or_, select, update

from src.services import llm
from src.services.auth import otp
from src.services.vehicsim import guardrails, runs, views
from src.services.vehicsim import tables as t
from src.services.vehicsim.common import aeb_parameter_catalog, engine, now

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
DOC_SOURCES = (
    # KHÔNG có AGENTS.md / CLAUDE.md: đó là file chỉ dẫn cho agent viết code — đúng loại văn
    # bản mệnh lệnh mà trợ lý không được đọc như dữ liệu (chống prompt injection, ADR-029).
    "docs/vehicsim/*.md",
    "docs/adr/ADR-02[3-9]-*.md",
    "docs/exec-plans/tech-debt-tracker.md",
    "docs/exec-plans/completed/*.md",
)
KNOWLEDGE_VERSION = 2  # đổi cách dựng văn bản thì tăng số này để chỉ mục dựng lại (2: guardrails)
MAX_CHUNK_CHARS = 1800
EMBED_BATCH = 96
HASH_MODEL = "hashing-bow-v1"
HASH_DIM = 1024
# Dưới ngưỡng này câu hỏi coi như không dính gì tới project: từ chối mà không gọi LLM.
# Chỉ là chốt chặn tiết kiệm — LLM vẫn tự xét phạm vi với câu lọt qua. Đo 01/10/2026 trên DB
# dev (795 đoạn): 11 câu đúng chủ đề 0,351–0,664; 8 câu lạc đề 0,207–0,434 ("viết code
# python" cao nhất). 0,30 chặn được 4/8 câu lạc đề mà không chặn câu đúng nào.
MIN_SCORE = {llm.EMBEDDING_MODEL: 0.30, HASH_MODEL: 0.10}
SYNC_LOCK_S = 600
MAX_PER_DOC = 2
MAX_FAILURES = 5
# Dấu hiệu câu hỏi tổng hợp/so sánh (đã bỏ dấu): "mạnh nhất", "bao nhiêu", "tỉ lệ", "phổ biến"...
AGGREGATE_CUES = re.compile(
    r"\bnhat\b|bao nhieu|\btong\b|\btop\b|trung binh|pho bien|thong ke|\bt[iy] le\b|phan tram|%|xep hang"
    r"|\bmost\b|how many|\bcount\b|\baverage\b|\bworst\b|\bbest\b"
)


@dataclass(frozen=True)
class Chunk:
    key: str
    source_type: str
    ref: str
    title: str
    content: str
    link: str | None = None
    project_id: int | None = None


@dataclass(frozen=True)
class Hit:
    key: str
    source_type: str
    ref: str
    title: str
    link: str | None
    content: str
    score: float
    pinned: bool = False  # luôn có mặt trong ngữ cảnh (mã được nhắc, hoặc thống kê cho câu tổng hợp)
    explicit: bool = False  # mã được nhắc thẳng trong câu (#1055, RT-004...) — đủ để coi là đúng chủ đề


# ---------------------------------------------------------------------------
# Nhúng vector
# ---------------------------------------------------------------------------


def _openai_embedder():
    """Tách riêng để test thay bằng ``None`` (không bao giờ gọi API thật trong test)."""
    return llm.get_embeddings()


def active_model() -> str:
    return llm.EMBEDDING_MODEL if _openai_embedder() is not None else HASH_MODEL


# Hư từ (đã bỏ dấu) không mang chủ đề: giữ lại thì câu hỏi nào cũng "giống" tài liệu tiếng Việt.
_STOPWORDS = frozenset(
    "la gi cua co khong va cac nhung mot nhu nao duoc cho voi trong khi thi de bi o tai ve sao nay do da dang se "
    "cung rat nhat hon bao nhieu ai toi ban giup minh hay hoac neu vi nen ma ra vao len lai con chi moi tu den theo "
    "tren duoi sau truoc khac hoi xin cai nguoi viec lam the a an of is are and to in for on with what how why which "
    "who be it this that".split()
)


def _hash_embed(texts: list[str]) -> np.ndarray:
    out = np.zeros((len(texts), HASH_DIM), dtype=np.float32)
    for i, text in enumerate(texts):
        tokens = [tok for tok in re.findall(r"[a-z0-9_]+", guardrails.fold(text)) if tok not in _STOPWORDS]
        for feature in tokens + [f"{a} {b}" for a, b in zip(tokens, tokens[1:], strict=False)]:
            h = int.from_bytes(hashlib.blake2b(feature.encode(), digest_size=8).digest(), "little")
            out[i, h % HASH_DIM] += -1.0 if h >> 63 else 1.0
    norms = np.linalg.norm(out, axis=1, keepdims=True)
    return out / np.where(norms == 0, 1.0, norms)


def embed(texts: list[str], model: str) -> np.ndarray:
    """Ma trận ``(n, dim)`` float32 đã chuẩn hoá L2, theo đúng ``model`` yêu cầu."""
    if not texts:
        return np.zeros((0, HASH_DIM), dtype=np.float32)
    if model == HASH_MODEL:
        return _hash_embed(texts)
    embedder = _openai_embedder()
    if embedder is None:
        raise RuntimeError("chưa cấu hình OpenAI key cho embedding")
    rows: list[list[float]] = []
    for start in range(0, len(texts), EMBED_BATCH):
        batch = texts[start : start + EMBED_BATCH]
        started = time.perf_counter()
        rows.extend(embedder.embed_documents(batch))
        tokens = max(1, sum(len(x) for x in batch) // 4)
        llm.record_provider_metric(
            kind="embedding",
            operation="vs_assistant_embedding",
            model=model,
            attempt=0,
            escalated=False,
            latency_s=round(time.perf_counter() - started, 6),
            input_tokens=tokens,
            cached_input_tokens=0,
            output_tokens=0,
            cost_usd=round(tokens * llm.EMBEDDING_COST_PER_MILLION_TOKENS / 1_000_000, 9),
            token_source="estimated_chars_div_4",
        )
    matrix = np.asarray(rows, dtype=np.float32)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    return matrix / np.where(norms == 0, 1.0, norms)


# ---------------------------------------------------------------------------
# Đoạn từ tài liệu repo
# ---------------------------------------------------------------------------


def doc_paths() -> list[Path]:
    paths: set[Path] = set()
    for pattern in DOC_SOURCES:
        paths.update(p for p in REPO_ROOT.glob(pattern) if p.is_file())
    return sorted(paths)


def _sections(text: str) -> list[tuple[str, str]]:
    """Markdown -> [(đường dẫn heading, nội dung)]; bỏ qua '#' trong khối code."""
    sections: list[tuple[str, list[str]]] = []
    trail: list[str] = []
    body: list[str] = []
    fenced = False

    def flush() -> None:
        if "".join(body).strip():
            sections.append((" › ".join(trail) or "Mở đầu", list(body)))
        body.clear()

    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            fenced = not fenced
        match = None if fenced else re.match(r"^(#{1,4})\s+(.+?)\s*$", line)
        if match:
            flush()
            level = len(match.group(1))
            trail[:] = trail[: level - 1] + [match.group(2)]
            continue
        body.append(line)
    flush()
    return [(heading, "\n".join(lines).strip()) for heading, lines in sections]


def _pieces(body: str) -> list[str]:
    """Cắt mục dài theo đoạn văn để mỗi đoạn tri thức ≤ ``MAX_CHUNK_CHARS``."""
    if len(body) <= MAX_CHUNK_CHARS:
        return [body]
    pieces, current = [], ""
    for para in re.split(r"\n\s*\n", body):
        while len(para) > MAX_CHUNK_CHARS:
            pieces.append(para[:MAX_CHUNK_CHARS])
            para = para[MAX_CHUNK_CHARS:]
        if current and len(current) + len(para) + 2 > MAX_CHUNK_CHARS:
            pieces.append(current)
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current.strip():
        pieces.append(current)
    return pieces


def doc_chunks() -> list[Chunk]:
    chunks = []
    for path in doc_paths():
        rel = path.relative_to(REPO_ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        h1 = re.search(r"^#\s+(.+?)\s*$", text, re.MULTILINE)
        doc_title = h1.group(1) if h1 else rel
        for i, (heading, body) in enumerate(_sections(text)):
            for j, piece in enumerate(_pieces(body)):
                chunks.append(
                    Chunk(
                        key=f"doc:{rel}#{i}.{j}",
                        source_type="DOC",
                        ref=rel,
                        title=f"{rel} › {heading}"[:255],
                        content=guardrails.neutralize_document(
                            f"Tài liệu {rel} ({doc_title})\nMục: {heading}\n\n{piece}"
                        ),
                    )
                )
    return chunks


# ---------------------------------------------------------------------------
# Đoạn từ dữ liệu project (qua views.py — cùng số liệu với màn hình)
# ---------------------------------------------------------------------------


def _fmt(value) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:g}"
    if isinstance(value, (list, tuple)):
        return ", ".join(_fmt(v) for v in value)
    return str(value)


def _failure_stats(p: str, project_id: int, items: list[dict], label_of: dict) -> Chunk:
    """Câu hỏi tổng hợp ("va chạm mạnh nhất", "lỗi hay gặp nhất") không tìm được bằng từng ca lẻ."""

    def tally(key) -> str:
        counts: dict[str, int] = {}
        for item in items:
            value = _fmt(key(item))
            counts[value] = counts.get(value, 0) + 1
        return ", ".join(f"{k} {n}" for k, n in sorted(counts.items(), key=lambda kv: -kv[1]))

    worst = sorted((i for i in items if i.get("impact_kmh")), key=lambda i: -i["impact_kmh"])[:10]
    return Chunk(
        key=f"{p}:failures:stats",
        source_type="FAILURE",
        ref="stats",
        title=f"Thống kê {len(items)} ca lỗi",
        link="/analysis/failures",
        project_id=project_id,
        content=(
            f"Thống kê toàn bộ {len(items)} ca lỗi của project.\n"
            f"Theo kết quả: {tally(lambda i: 'FALSE_BRAKING' if i['failure_type'] == 'FALSE_BRAKING' else i['outcome'])}.\n"
            f"Theo loại lỗi: {tally(lambda i: i['failure_type'])}.\n"
            f"Theo khâu hỏng chính: {tally(lambda i: i['failure_class'] or 'không khâu nào')}.\n"
            f"Theo mã nguyên nhân: {tally(lambda i: i.get('cause_code') or 'không có')}.\n"
            f"Theo tốc độ xe (km/h): {tally(lambda i: (i.get('parameters') or {}).get('ego_speed_kmh'))}.\n"
            f"Theo thời tiết: {tally(lambda i: i.get('weather'))}; theo thời điểm: {tally(lambda i: i.get('time_of_day'))}.\n"
            f"Theo AEB version: {tally(lambda i: label_of.get(i.get('aeb_version_id'), '—'))}.\n"
            f"Theo họ kịch bản: {tally(lambda i: i['family'])}.\n"
            "Va chạm mạnh nhất: "
            + (
                "; ".join(
                    f"#{i['run_id']} {i['variant']} ({i['summary']}, AEB {label_of.get(i.get('aeb_version_id'), '—')}) "
                    f"va ở {_fmt(i['impact_kmh'])} km/h"
                    for i in worst
                )
                or "không có va chạm"
            )
            + "."
        ),
    )


def project_chunks(project_id: int) -> list[Chunk]:
    ctx = guardrails.clean(views.context())
    if ctx["project"]["id"] != project_id:
        raise ValueError(f"project {project_id} không phải project đang mở ({ctx['project']['id']})")
    p = f"p{project_id}"
    families = guardrails.clean(views.families())
    versions = guardrails.clean(views.aeb_versions())
    failures = guardrails.clean(views.failure_list(page=1, page_size=1_000_000))
    regressions = guardrails.clean(views.regression_list())
    recommendations = guardrails.clean(views.recommendations())
    with engine().connect() as conn:
        catalog = aeb_parameter_catalog(conn)
    baseline = ctx["system"]["baseline"] or {}
    label_of = {v["id"]: v["label"] for v in versions}
    baseline_values = next((v["parameters"] for v in versions if v["id"] == baseline.get("id")), {})

    chunks: list[Chunk] = []
    k, rk = failures["kpis"], regressions["kpis"]
    chunks.append(
        Chunk(
            key=f"{p}:overview",
            source_type="PROJECT",
            ref="project",
            title=f"Tổng quan project {ctx['project']['name']}",
            link="/",
            project_id=project_id,
            content=(
                f'Tổng quan project "{ctx["project"]["name"]}" (workspace "{ctx["workspace"]["name"]}"). '
                f"Xe: {ctx['vehicle']['name']}. Hệ thống AEB: {ctx['system']['name']}, baseline hiện hành: "
                f"{baseline.get('label', '—')}. Motif MVP: người đi bộ băng ngang (Euro NCAP CPNA).\n"
                f"Họ kịch bản: {len(families)} họ, tổng {sum(f['variants'] for f in families)} biến thể.\n"
                f"Ca lỗi đã ghi nhận: {k['total']} (va chạm {k['collisions']}, suýt va chạm {k['near_misses']}, "
                f"phanh oan {k['false_braking']}); theo khâu hỏng chính: "
                + ", ".join(f"{cls} {n}" for cls, n in k["by_class"].items())
                + f".\nKiểm thử hồi quy: {rk['total']} (đạt {rk['passed']}, không đạt {rk['failed']}, "
                f"đang chạy {rk['running']}). Khuyến nghị chờ kỹ sư duyệt: "
                f"{sum(1 for r in recommendations if r['status'] == 'PENDING')}.\n"
                f"Bộ mô phỏng cho run mới: {runs.configured_simulator()}."
            ),
        )
    )

    lines = []
    for row in catalog:
        lines.append(
            f"- {row['code']} ({row['name']}, nhóm {row['category']}, đơn vị {row['unit']}): khoảng cho phép "
            f"[{_fmt(float(row['min_value']))}, {_fmt(float(row['max_value']))}], mặc định danh mục "
            f"{_fmt(float(row['default_value']))}; baseline {baseline.get('label', '—')} đang dùng "
            f"{_fmt(baseline_values.get(row['code']))}."
        )
    chunks.append(
        Chunk(
            key=f"{p}:aeb:catalog",
            source_type="AEB",
            ref="parameters",
            title="Danh mục 10 tham số AEB",
            link="/aeb",
            project_id=project_id,
            content=(
                "Danh mục 10 tham số AEB. Khoảng cho phép là không gian tìm kiếm khi tạo ứng viên: mọi giá trị "
                "ứng viên phải nằm trong khoảng và khác version cha ít nhất một tham số.\n" + "\n".join(lines)
            ),
        )
    )

    tests_by_candidate: dict[int, list[dict]] = {}
    for item in regressions["items"]:
        tests_by_candidate.setdefault(item["candidate_version_id"], []).append(item)
    for v in versions:
        params = v["parameters"]
        diff = [
            f"{code} {_fmt(baseline_values.get(code))} → {_fmt(value)}"
            for code, value in params.items()
            if baseline_values.get(code) != value
        ]
        tests = tests_by_candidate.get(v["id"], [])
        parent = label_of.get(v["parent_version_id"]) if v["parent_version_id"] else None
        chunks.append(
            Chunk(
                key=f"{p}:aeb:version:{v['id']}",
                source_type="AEB",
                ref=v["label"],
                title=f"AEB version {v['label']} ({v['status']})",
                link="/aeb",
                project_id=project_id,
                content=(
                    f"AEB version {v['label']} (id {v['id']}): trạng thái {v['status']}, nguồn {v['source']}, "
                    f"tạo {v['created_at']}" + (f", từ version cha {parent}" if parent else "") + ". "
                    f"Ghi chú: {v['notes'] or 'không có'}.\n"
                    "Giá trị 10 tham số: "
                    + "; ".join(f"{c}={_fmt(x)}" for c, x in params.items())
                    + ".\n"
                    + (
                        f"Khác baseline {baseline.get('label', '—')}: " + "; ".join(diff) + "."
                        if diff
                        else f"Giống hệt baseline {baseline.get('label', '—')}."
                    )
                    + (
                        "\nRegression của ứng viên này: "
                        + "; ".join(f"{x['code']} ({x['status']}, quyết định {x['review_decision']})" for x in tests)
                        if tests
                        else ""
                    )
                ),
            )
        )

    by_family: dict[int, list[dict]] = {}
    for item in failures["items"]:
        by_family.setdefault(item["scenario_id"], []).append(item)
    for f in families:
        items = by_family.get(f["id"], [])
        outcomes: dict[str, int] = {}
        classes: dict[str, int] = {}
        for item in items:
            outcome = "FALSE_BRAKING" if item["failure_type"] == "FALSE_BRAKING" else item["outcome"]
            outcomes[outcome] = outcomes.get(outcome, 0) + 1
            if item["failure_class"]:
                classes[item["failure_class"]] = classes.get(item["failure_class"], 0) + 1
        space = f["parameter_space"] or {}
        chunks.append(
            Chunk(
                key=f"{p}:family:{f['id']}",
                source_type="FAMILY",
                ref=f["code"],
                title=f"Họ kịch bản {f['code']} · {f['name']}",
                link="/scenarios",
                project_id=project_id,
                content=(
                    f'Họ kịch bản {f["code"]} "{f["name"]}" (id {f["id"]}, tạo {f["created_at"]}). '
                    f"Mô tả: {f['description'] or 'không có'}. {f['variants']} biến thể. Không gian tham số: "
                    f"tốc độ xe {_fmt(space.get('ego_speed_kmh'))} km/h; khoảng cách kích hoạt "
                    f"{_fmt(space.get('trigger_distance_m'))} m; tốc độ người đi bộ "
                    f"{_fmt(space.get('pedestrian_speed_mps'))} m/s; dừng ở lề {_fmt(space.get('stops_at_curb'))}; "
                    f"thời tiết {_fmt(space.get('weather'))}; thời điểm {_fmt(space.get('time_of_day'))}.\n"
                    f"Baseline: {f['baseline']}. Lượt chạy theo trạng thái: "
                    + ", ".join(f"{s} {n}" for s, n in f["runs"].items())
                    + f". Ca lỗi: {f['failures']}"
                    + (" — theo kết quả " + ", ".join(f"{o} {n}" for o, n in outcomes.items()) if outcomes else "")
                    + (" — theo khâu " + ", ".join(f"{c} {n}" for c, n in classes.items()) if classes else "")
                    + "."
                ),
            )
        )

    for item in failures["items"]:
        params = item.get("parameters") or {}
        chunks.append(
            Chunk(
                key=f"{p}:failure:{item['run_id']}",
                source_type="FAILURE",
                ref=f"#{item['run_id']}",
                title=f"Lượt chạy #{item['run_id']} · {item['variant']} · {item['outcome']}",
                link=f"/analysis/failures/{item['run_id']}",
                project_id=project_id,
                content=(
                    f'Ca lỗi lượt chạy #{item["run_id"]} — họ "{item["family"]}", biến thể {item["variant"]} '
                    f"({item['summary']}), AEB {label_of.get(item.get('aeb_version_id'), '—')}.\n"
                    f"Tham số kịch bản: tốc độ xe {_fmt(params.get('ego_speed_kmh'))} km/h, kích hoạt khi còn "
                    f"{_fmt(params.get('trigger_distance_m'))} m, người đi bộ {_fmt(params.get('pedestrian_speed_mps'))} "
                    f"m/s, {'dừng ở lề' if params.get('stops_at_curb') else 'băng qua'}, thời tiết "
                    f"{params.get('weather', '—')}, thời điểm {params.get('time_of_day', '—')}.\n"
                    f"Kết quả {item['outcome']}; loại lỗi {item['failure_type']}, mức {item['severity']}; khâu hỏng "
                    f"chính {item['failure_class'] or 'không khâu nào'}"
                    + (f" ({item['cause_code']})" if item.get("cause_code") else "")
                    + (f"; va chạm ở {_fmt(item['impact_kmh'])} km/h" if item.get("impact_kmh") else "")
                    + f"; TTC nhỏ nhất {_fmt(item.get('min_ttc_s'))} s.\nNguyên nhân gốc: {item['root_cause'] or '—'}"
                ),
            )
        )

    chunks.append(_failure_stats(p, project_id, failures["items"], label_of))

    recs_by_code = {r["regression_code"]: r for r in recommendations}
    for item in regressions["items"]:
        d = guardrails.clean(views.recommendation_detail(item["id"]))
        s = d.get("summary") or {}  # test đang chạy chưa có tổng kết
        c, r = s.get("counts", {}), s.get("rates", {})
        ttc = s.get("median_min_ttc") or {}
        changed = [x for x in d["parameter_diff"] if x["changed"]]
        moved = [x for x in s.get("pairs", []) if x["change"] in ("fixed", "regressed")]
        review = d.get("review") or {}
        rec = recs_by_code.get(d["code"], {})
        chunks.append(
            Chunk(
                key=f"{p}:regression:{item['id']}",
                source_type="REGRESSION",
                ref=d["code"],
                title=f"Regression {d['code']} · {d['baseline']['label']} → {d['candidate']['label']} · {d['status']}",
                link=f"/validation/regression/{item['id']}",
                project_id=project_id,
                content=(
                    f'Kiểm thử hồi quy {d["code"]} "{d["name"]}" (id {d["id"]}, khuyến nghị '
                    f'{d["recommendation_code"]}), họ kịch bản "{d["family"]}", tạo {d["created_at"]}. '
                    f"Baseline {d['baseline']['label']} → ứng viên {d['candidate']['label']}. "
                    f"Trạng thái {d['status']}; quyết định kỹ sư {d['review_decision']}"
                    + (f" (lý do: {review.get('note')})" if review.get("note") else "")
                    + (f"; điều kiện: {review['conditions']}" if review.get("conditions") else "")
                    + ".\nTham số đổi: "
                    + (
                        "; ".join(
                            f"{x['code']} {_fmt(x['baseline'])} → {_fmt(x['candidate'])} {x['unit']}" for x in changed
                        )
                        or "không"
                    )
                    + f".\nKết quả trên {c.get('scenarios', '—')} kịch bản: sửa được {c.get('fixed', '—')}, xấu đi "
                    f"{c.get('regressed', '—')}, không đổi {c.get('unchanged', '—')}, va chạm mới {c.get('new_collisions', '—')}. "
                    f"Tỉ lệ va chạm {_fmt(r.get('collision_baseline_pct'))}% → {_fmt(r.get('collision_candidate_pct'))}%; "
                    f"phanh oan {_fmt(r.get('false_activation_baseline_pct'))}% → {_fmt(r.get('false_activation_candidate_pct'))}%; "
                    f"median min TTC {_fmt(ttc.get('baseline'))} → {_fmt(ttc.get('candidate'))} s.\nTiêu chí: "
                    + "; ".join(
                        f"[{'đạt' if x['passed'] else 'không đạt'}] {x['label']} (thực tế {_fmt(x['actual'])}"
                        + (f", ngưỡng {_fmt(x['threshold'])}" if x.get("threshold") is not None else "")
                        + (", bắt buộc" if x["required"] else "")
                        + ")"
                        for x in s.get("criteria", [])
                        if x.get("enabled", True)
                    )
                    + f".\nKhuyến nghị {d['recommendation_code']}: {d.get('recommendation_status', rec.get('status', '—'))}, "
                    f"độ tin cậy {d.get('confidence', '—')}. Đánh đổi: {' '.join(d.get('tradeoffs') or []) or 'không ghi nhận'} "
                    "Bằng chứng: "
                    + "; ".join(f"{e['title']} {e['status']} ({e['detail']})" for e in d.get("evidence") or [])
                    + ".\nKịch bản đổi kết quả: "
                    + (
                        "; ".join(
                            f"{x['label']} {x['change']}: {x['baseline_outcome']} (#{x['baseline_run_id']}) → "
                            f"{x['candidate_outcome']} (#{x['candidate_run_id']})"
                            for x in moved
                        )
                        or "không có"
                    )
                ),
            )
        )
    return chunks


# ---------------------------------------------------------------------------
# Đồng bộ chỉ mục
# ---------------------------------------------------------------------------


def _content_hash(chunk: Chunk, model: str) -> str:
    raw = json.dumps([model, chunk.title, chunk.ref, chunk.link, chunk.content], ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _scope(project_id: int):
    return or_(t.knowledge_chunks.c.project_id == project_id, t.knowledge_chunks.c.project_id.is_(None))


def _fingerprint(project_id: int, model: str) -> str:
    """Thứ gì đổi thì câu hỏi sau phải dựng lại văn bản: run, regression, AEB, họ kịch bản, tài liệu, code."""
    with engine().connect() as conn:
        sr, rt, sc = t.simulation_runs, t.regression_tests, t.scenarios
        parts = [
            conn.execute(
                select(func.count(), func.max(sr.c.id), func.max(sr.c.updated_at)).where(sr.c.project_id == project_id)
            ).one(),
            conn.execute(
                select(func.count(), func.max(rt.c.updated_at), func.max(rt.c.reviewed_at)).where(
                    rt.c.project_id == project_id
                )
            ).one(),
            conn.execute(select(func.count(), func.max(sc.c.id)).where(sc.c.project_id == project_id)).one(),
            conn.execute(
                select(func.count(), func.max(t.aeb_versions.c.id))
                .join(t.aeb_systems, t.aeb_systems.c.id == t.aeb_versions.c.aeb_system_id)
                .where(t.aeb_systems.c.project_id == project_id)
            ).one(),
        ]
    docs = [(p.name, p.stat().st_mtime_ns, p.stat().st_size) for p in doc_paths()]
    raw = json.dumps([KNOWLEDGE_VERSION, model, [list(x) for x in parts], docs], default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def _indexed(project_id: int, model: str) -> bool:
    kc = t.knowledge_chunks
    with engine().connect() as conn:
        return (
            conn.execute(
                select(kc.c.id).where(kc.c.project_id == project_id, kc.c.embedding_model == model).limit(1)
            ).first()
            is not None
        )


def sync(project_id: int, *, force: bool = False) -> dict:
    """Đưa chỉ mục về khớp dữ liệu hiện tại; chỉ nhúng đoạn mới/đổi. Trả thống kê."""
    model = active_model()
    redis = otp.get_redis()
    fp_key, lock_key = f"vehicsim:kb:fp:{project_id}", f"vehicsim:kb:lock:{project_id}"
    fingerprint = _fingerprint(project_id, model)
    if not force and redis.get(fp_key) == fingerprint and _indexed(project_id, model):
        return {"model": model, "skipped": True}
    if not redis.set(lock_key, "1", nx=True, ex=SYNC_LOCK_S):
        return {"model": model, "busy": True}  # request khác đang dựng — dùng chỉ mục hiện có
    try:
        chunks = doc_chunks() + project_chunks(project_id)
        hashes = {c.key: _content_hash(c, model) for c in chunks}
        kc = t.knowledge_chunks
        with engine().connect() as conn:
            existing = {
                r.source_key: r.content_hash
                for r in conn.execute(select(kc.c.source_key, kc.c.content_hash).where(_scope(project_id)))
            }
        changed = [c for c in chunks if existing.get(c.key) != hashes[c.key]]
        vectors = embed([c.content for c in changed], model)
        stale = sorted(set(existing) - set(hashes))
        ts = now()
        with engine().begin() as conn:
            for start in range(0, len(stale), 500):
                conn.execute(delete(kc).where(kc.c.source_key.in_(stale[start : start + 500])))
            for chunk, vector in zip(changed, vectors, strict=True):
                values = {
                    "project_id": chunk.project_id,
                    "source_type": chunk.source_type,
                    "source_ref": chunk.ref[:255],
                    "title": chunk.title[:255],
                    "link": chunk.link,
                    "content": chunk.content,
                    "content_hash": hashes[chunk.key],
                    "embedding_model": model,
                    "embedding": vector.astype("<f4").tobytes(),
                    "updated_at": ts,
                }
                if chunk.key in existing:
                    conn.execute(update(kc).where(kc.c.source_key == chunk.key).values(**values))
                else:
                    conn.execute(insert(kc).values(source_key=chunk.key, created_at=ts, **values))
        redis.set(fp_key, fingerprint)
        return {"model": model, "chunks": len(chunks), "embedded": len(changed), "deleted": len(stale)}
    finally:
        redis.delete(lock_key)


def status(project_id: int) -> dict:
    kc = t.knowledge_chunks
    model = active_model()
    with engine().connect() as conn:
        rows = conn.execute(
            select(kc.c.source_type, func.count(), func.max(kc.c.updated_at))
            .where(_scope(project_id), kc.c.embedding_model == model)
            .group_by(kc.c.source_type)
        ).all()
    counts = {r[0]: int(r[1]) for r in rows}
    updated = max((r[2] for r in rows if r[2] is not None), default=None)
    return {
        "model": model,
        "embeddings": "openai" if model == llm.EMBEDDING_MODEL else "offline",
        "chunks": sum(counts.values()),
        "by_type": counts,
        "updated_at": updated.isoformat() if updated else None,
    }


# ---------------------------------------------------------------------------
# Tìm kiếm
# ---------------------------------------------------------------------------


def _direct_keys(project_id: int, query: str, rows) -> tuple[set[str], set[str]]:
    """``(mã được nhắc thẳng, đoạn thống kê cho câu tổng hợp)`` — cả hai luôn vào ngữ cảnh.

    Chỉ nhóm đầu được coi là bằng chứng "đúng chủ đề": "Giá bitcoin bao nhiêu?" cũng có
    "bao nhiêu" nhưng không được lách chốt chặn ngoài phạm vi nhờ đoạn thống kê.
    """
    p = f"p{project_id}"
    folded = guardrails.fold(query)
    keys = {f"{p}:failure:{n}" for n in re.findall(r"(?:#|\brun\s*|luot\s*(?:chay\s*)?#?)(\d{1,7})\b", folded)}
    keys |= {f"{p}:regression:{int(n)}" for n in re.findall(r"\b(?:rt|rec)-?(\d{1,5})\b", folded)}
    tokens = {tok.strip(".-") for tok in re.findall(r"[a-z0-9_.\-]+", folded)}  # "v1.3." cuối câu
    for row in rows:
        ref = guardrails.fold(row.source_ref)
        if row.source_type in ("AEB", "FAMILY") and ref in tokens:
            keys.add(row.source_key)
    if re.search(r"\b[a-z]+_[a-z_]+\b", folded) or "tham so" in folded or "parameter" in folded:
        keys.add(f"{p}:aeb:catalog")
    aggregate: set[str] = set()
    if AGGREGATE_CUES.search(folded):
        # Câu tổng hợp phải dựa vào số đếm trên TOÀN BỘ dữ liệu — đo 01/10: "va chạm mạnh nhất"
        # lấy 8 ca lẻ điểm sát nhau, LLM trả #791 68,9 km/h trong khi thật là #631 73,5 km/h.
        aggregate = {f"{p}:failures:stats", f"{p}:overview"}
    return keys, aggregate


def search(project_id: int, query: str, *, k: int = 8, max_pinned: int = 4) -> list[Hit]:
    """Đoạn liên quan nhất (cosine), mã được nhắc thẳng đứng đầu. Chỉ trong project + tài liệu repo."""
    model = active_model()
    kc = t.knowledge_chunks
    with engine().connect() as conn:
        rows = conn.execute(
            select(
                kc.c.source_key, kc.c.source_type, kc.c.source_ref, kc.c.title, kc.c.link, kc.c.content, kc.c.embedding
            )
            .where(_scope(project_id), kc.c.embedding_model == model)
            .order_by(kc.c.id)
        ).all()
    if not rows:
        return []
    matrix = np.vstack([np.frombuffer(r.embedding, dtype="<f4") for r in rows])
    scores = matrix @ embed([query], model)[0]
    explicit, aggregate = _direct_keys(project_id, query, rows)
    pinned = [i for i, r in enumerate(rows) if r.source_key in explicit][:max_pinned]
    pinned += [i for i, r in enumerate(rows) if r.source_key in aggregate and i not in pinned]
    # Tối đa MAX_PER_DOC đoạn mỗi tài liệu: không thì một ADR dài chiếm hết ngữ cảnh và ADR
    # mang lý do thật bị đẩy ra ngoài (đo 01/10: "vì sao động học thay vì CARLA" → 8/8 đoạn ADR-027).
    # Tương tự, tối đa MAX_FAILURES ca lẻ để còn chỗ cho thống kê, regression, tài liệu.
    ranked: list[int] = []
    per_doc: dict[str, int] = {}
    failures = 0
    for i in np.argsort(-scores):
        if i in pinned:
            continue
        r = rows[i]
        if r.source_type == "DOC":
            if per_doc.get(r.source_ref, 0) >= MAX_PER_DOC:
                continue
            per_doc[r.source_ref] = per_doc.get(r.source_ref, 0) + 1
        if r.source_type == "FAILURE" and r.source_ref != "stats":
            if failures >= MAX_FAILURES:
                continue
            failures += 1
        ranked.append(int(i))
        if len(ranked) == k:
            break

    def hit(i: int, is_pinned: bool) -> Hit:
        r = rows[i]
        return Hit(
            r.source_key,
            r.source_type,
            r.source_ref,
            r.title,
            r.link,
            r.content,
            float(scores[i]),
            is_pinned,
            r.source_key in explicit,
        )

    return [hit(i, True) for i in pinned] + [hit(int(i), False) for i in ranked]


def min_score(model: str | None = None) -> float:
    return MIN_SCORE.get(model or active_model(), 0.0)
