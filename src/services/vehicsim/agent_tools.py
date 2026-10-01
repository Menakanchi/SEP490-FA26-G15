"""Công cụ CHỈ ĐỌC của Trợ lý dự án (ReAct, ADR-029).

Ranh giới an toàn nằm ở đây, không ở prompt:

- **Danh sách trắng cố định** (``TOOLS``). Không công cụ nào nhận SQL, đường dẫn file hay tên
  bảng; không công cụ nào chạm ``users``/``roles``, cấu hình, ``.env`` hay hàm ghi.
- **Project do server gắn** (``ToolContext.project_id``) — LLM không chọn được project.
- **Tham số kiểu chặt** (``ToolArgs``, Literal/int có giới hạn); sai thì trả lỗi cho LLM tự sửa.
- **Mọi kết quả** đi qua ``guardrails.clean`` (bỏ khoá nhạy cảm, vô hiệu hoá câu giống lệnh
  trong văn bản người dùng nhập) và bị cắt ở ``MAX_OBSERVATION_CHARS``.
- Mỗi kết quả gắn mã nguồn ``[S#]`` (``SourceBook``) để câu trả lời cuối chỉ được dẫn nguồn
  thật sự đã đọc.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import select

from src.services.vehicsim import guardrails, knowledge, views
from src.services.vehicsim import tables as t
from src.services.vehicsim.common import NotFoundError, aeb_parameter_catalog, engine

MAX_OBSERVATION_CHARS = 6000
MAX_ROWS = 15

Outcome = Literal["COLLISION", "NEAR_MISS", "FALSE_BRAKING"]
FailureClass = Literal["PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS"]
Weather = Literal["CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG"]
TimeOfDay = Literal["DAY", "DUSK", "NIGHT"]
GroupBy = Literal[
    "outcome",
    "failure_class",
    "cause_code",
    "failure_type",
    "ego_speed_kmh",
    "trigger_distance_m",
    "pedestrian_speed_mps",
    "stops_at_curb",
    "weather",
    "time_of_day",
    "aeb_version",
    "family",
]


class ToolArgs(BaseModel):
    """Tham số chung cho mọi công cụ; công cụ nào dùng trường nào ghi ở ``TOOLS``. Không dùng thì null."""

    query: str | None = Field(default=None, max_length=300, description="search_knowledge: câu tìm kiếm.")
    run_id: int | None = Field(default=None, ge=1, description="get_run: mã lượt chạy, vd. 1055.")
    code: str | None = Field(
        default=None,
        max_length=40,
        description="Mã đối tượng: RT-004/REC-004 (regression), v1.3 (AEB version), PX7 (họ kịch bản). Null = liệt kê.",
    )
    outcome: Outcome | None = None
    failure_class: FailureClass | None = None
    family: str | None = Field(default=None, max_length=40, description="Mã họ kịch bản để lọc, vd. PX7.")
    aeb_version: str | None = Field(default=None, max_length=40, description="Nhãn AEB version để lọc, vd. v1.0.")
    weather: Weather | None = None
    time_of_day: TimeOfDay | None = None
    min_speed_kmh: float | None = Field(default=None, ge=0, le=200)
    max_speed_kmh: float | None = Field(default=None, ge=0, le=200)
    stops_at_curb: bool | None = None
    group_by: GroupBy | None = None
    sort_by: Literal["impact_kmh", "min_ttc_s", "run_id"] | None = None
    limit: int | None = Field(default=None, ge=1, le=MAX_ROWS)


@dataclass
class SourceBook:
    """Mã nguồn [S#] cho mọi thứ công cụ đã trả về trong một câu hỏi."""

    sources: list[dict] = field(default_factory=list)

    def add(self, type_: str, ref: str, title: str, link: str | None) -> str:
        for s in self.sources:
            if s["type"] == type_ and s["ref"] == ref:
                return s["id"]
        sid = f"S{len(self.sources) + 1}"
        self.sources.append(
            {"id": sid, "type": type_, "ref": guardrails.redact(ref), "title": guardrails.redact(title), "link": link}
        )
        return sid


@dataclass
class ToolContext:
    project_id: int
    book: SourceBook
    _cache: dict = field(default_factory=dict)

    def cached(self, key: str, loader: Callable):
        if key not in self._cache:
            self._cache[key] = guardrails.clean(loader())
        return self._cache[key]

    def failures(self) -> list[dict]:
        return self.cached("failures", lambda: views.failure_list(page=1, page_size=1_000_000))["items"]

    def versions(self) -> list[dict]:
        return self.cached("versions", views.aeb_versions)

    def families(self) -> list[dict]:
        return self.cached("families", views.families)

    def regressions(self) -> list[dict]:
        return self.cached("regressions", views.regression_list)["items"]

    def simulators(self) -> dict[int, str]:
        """``{run_id: bộ mô phỏng}`` — để trợ lý không đoán "CARLA" khi dữ liệu chạy bằng động học (đo 03/10)."""
        if "simulators" not in self._cache:
            sr = t.simulation_runs
            with engine().connect() as conn:
                rows = conn.execute(select(sr.c.id, sr.c.carla_version).where(sr.c.project_id == self.project_id)).all()
            self._cache["simulators"] = {r.id: r.carla_version or "unknown" for r in rows}
        return self._cache["simulators"]


# ---------------------------------------------------------------------------
# Tiện ích
# ---------------------------------------------------------------------------


def _norm(code: str | None) -> str:
    return guardrails.fold(code or "").strip().strip("#").replace(" ", "")


def _label_of(ctx: ToolContext) -> dict[int, str]:
    return {v["id"]: v["label"] for v in ctx.versions()}


def _filtered(ctx: ToolContext, a: ToolArgs) -> list[dict]:
    label_of = _label_of(ctx)
    sims = ctx.simulators()
    family_ids = None
    if a.family:
        family_ids = {f["id"] for f in ctx.families() if _norm(f["code"]) == _norm(a.family)}
    rows = []
    for item in ctx.failures():
        params = item.get("parameters") or {}
        outcome = "FALSE_BRAKING" if item["failure_type"] == "FALSE_BRAKING" else item["outcome"]
        speed = params.get("ego_speed_kmh")
        if a.outcome and outcome != a.outcome:
            continue
        if a.failure_class and item.get("failure_class") != a.failure_class:
            continue
        if family_ids is not None and item["scenario_id"] not in family_ids:
            continue
        if a.aeb_version and _norm(label_of.get(item.get("aeb_version_id"))) != _norm(a.aeb_version):
            continue
        if a.weather and item.get("weather") != a.weather:
            continue
        if a.time_of_day and item.get("time_of_day") != a.time_of_day:
            continue
        if a.stops_at_curb is not None and bool(params.get("stops_at_curb")) != a.stops_at_curb:
            continue
        if a.min_speed_kmh is not None and (speed is None or speed < a.min_speed_kmh):
            continue
        if a.max_speed_kmh is not None and (speed is None or speed > a.max_speed_kmh):
            continue
        rows.append({**item, "_outcome": outcome, "_simulator": sims.get(item["run_id"])})
    return rows


def _filters_text(a: ToolArgs) -> str:
    used = a.model_dump(exclude_none=True, exclude={"query", "run_id", "code", "group_by", "sort_by", "limit"})
    return json.dumps(used, ensure_ascii=False) if used else "không lọc"


def _brief(item: dict, label_of: dict[int, str]) -> dict:
    p = item.get("parameters") or {}
    return {
        "run": f"#{item['run_id']}",
        "variant": item["variant"],
        "family": item["family"],
        "conditions": item["summary"],
        "ego_speed_kmh": p.get("ego_speed_kmh"),
        "trigger_distance_m": p.get("trigger_distance_m"),
        "pedestrian_speed_mps": p.get("pedestrian_speed_mps"),
        "stops_at_curb": p.get("stops_at_curb"),
        "outcome": item["_outcome"] if "_outcome" in item else item["outcome"],
        "failure_class": item.get("failure_class"),
        "cause_code": item.get("cause_code"),
        "impact_kmh": item.get("impact_kmh"),
        "min_ttc_s": item.get("min_ttc_s"),
        "aeb": label_of.get(item.get("aeb_version_id")),
        "simulator": item.get("_simulator"),
    }


def _dump(sid: str, header: str, payload) -> str:
    body = json.dumps(guardrails.clean(payload), ensure_ascii=False, default=str)
    if len(body) > MAX_OBSERVATION_CHARS:
        body = body[:MAX_OBSERVATION_CHARS] + "…(đã cắt)"
    return f"[{sid}] {header}\n{body}"


# ---------------------------------------------------------------------------
# Công cụ
# ---------------------------------------------------------------------------


def search_knowledge(ctx: ToolContext, a: ToolArgs) -> str:
    if not a.query:
        return "Lỗi tham số: search_knowledge cần 'query'."
    hits = knowledge.search(ctx.project_id, a.query, k=6)
    if not hits:
        return "Không tìm thấy đoạn nào."
    blocks = []
    for h in hits:
        sid = ctx.book.add(h.source_type, h.ref, h.title, h.link)
        blocks.append(f"[{sid}] {guardrails.redact(h.title)}\n{guardrails.redact(h.content)[:1500]}")
    return "\n\n".join(blocks)


def project_overview(ctx: ToolContext, a: ToolArgs) -> str:
    c = ctx.cached("context", views.context)
    kpis = ctx.cached("failure_kpis", lambda: views.failure_list(page=1, page_size=1))["kpis"]
    reg = ctx.cached("regression_kpis", views.regression_list)["kpis"]
    sid = ctx.book.add("PROJECT", "project", "Tổng quan project", "/")
    return _dump(
        sid,
        "Tổng quan project",
        {
            "project": c["project"]["name"],
            "workspace": c["workspace"]["name"],
            "vehicle": c["vehicle"]["name"],
            "aeb_system": c["system"]["name"],
            "baseline": (c["system"]["baseline"] or {}).get("label"),
            "aeb_versions": [f"{v['label']} ({v['status']})" for v in c["versions"]],
            "families": len(ctx.families()),
            "variants": sum(f["variants"] for f in ctx.families()),
            "failures": kpis,
            "regression": reg,
        },
    )


def get_run(ctx: ToolContext, a: ToolArgs) -> str:
    if not a.run_id:
        return "Lỗi tham số: get_run cần 'run_id'."
    try:
        d = guardrails.clean(views.failure_detail(a.run_id))
    except NotFoundError:
        return f"Không có lượt chạy #{a.run_id} trong project."
    sid = ctx.book.add("FAILURE", f"#{a.run_id}", f"Lượt chạy #{a.run_id}", f"/analysis/failures/{a.run_id}")
    keep = (
        "purpose status seed variant summary config simulator date outcome verdict failure_type failure_class "
        "headline metrics chain environment ttc_threshold_s"
    ).split()
    payload = {k: d.get(k) for k in keep}
    payload["family"] = d.get("family")
    payload["aeb_parameters"] = {x["code"]: x["value"] for x in d.get("configuration", [])}
    payload["events"] = [{"t": e["t"], "event": e["label"]} for e in (d.get("events") or [])][:15]
    payload["similar_runs"] = [f"#{s['run_id']} {s['variant']}" for s in (d.get("similar") or [])]
    return _dump(sid, f"Lượt chạy #{a.run_id}", payload)


def list_failures(ctx: ToolContext, a: ToolArgs) -> str:
    rows = _filtered(ctx, a)
    order = a.sort_by or "impact_kmh"
    if order == "impact_kmh":
        rows.sort(key=lambda r: -(r.get("impact_kmh") or 0))
    elif order == "min_ttc_s":
        rows.sort(key=lambda r: r.get("min_ttc_s") if r.get("min_ttc_s") is not None else 99)
    else:
        rows.sort(key=lambda r: -r["run_id"])
    label_of = _label_of(ctx)
    sid = ctx.book.add("FAILURE", "list", "Danh sách ca lỗi (đã lọc)", "/analysis/failures")
    limit = a.limit or 10
    return _dump(
        sid,
        f"Ca lỗi khớp bộ lọc {_filters_text(a)}: {len(rows)} ca; {min(limit, len(rows))} ca đầu theo {order}",
        {"matched": len(rows), "rows": [_brief(r, label_of) for r in rows[:limit]]},
    )


def failure_stats(ctx: ToolContext, a: ToolArgs) -> str:
    rows = _filtered(ctx, a)
    group = a.group_by or "outcome"
    label_of = _label_of(ctx)

    def key(r: dict):
        p = r.get("parameters") or {}
        return {
            "outcome": r["_outcome"],
            "failure_class": r.get("failure_class") or "none",
            "cause_code": r.get("cause_code") or "none",
            "failure_type": r.get("failure_type"),
            "aeb_version": label_of.get(r.get("aeb_version_id"), "?"),
            "family": r.get("family"),
            "weather": r.get("weather"),
            "time_of_day": r.get("time_of_day"),
        }.get(group, p.get(group))

    counts: dict[str, int] = {}
    for r in rows:
        k = str(key(r))
        counts[k] = counts.get(k, 0) + 1
    impacts = [r["impact_kmh"] for r in rows if r.get("impact_kmh")]
    # Đo 03/10: chỉ có max_impact thì câu "ca nào mạnh nhất" không nêu được mã lượt chạy.
    worst = sorted((r for r in rows if r.get("impact_kmh")), key=lambda r: -r["impact_kmh"])[:3]
    sid = ctx.book.add("FAILURE", "stats", "Thống kê ca lỗi", "/analysis/failures")
    return _dump(
        sid,
        f"Thống kê ca lỗi theo {group}, bộ lọc {_filters_text(a)} (tính trên TOÀN BỘ ca lỗi khớp lọc)",
        {
            "total": len(rows),
            "by_" + group: dict(sorted(counts.items(), key=lambda kv: -kv[1])),
            "collisions_with_impact": len(impacts),
            "max_impact_kmh": max(impacts) if impacts else None,
            "mean_impact_kmh": round(sum(impacts) / len(impacts), 1) if impacts else None,
            "top_impacts": [_brief(r, label_of) for r in worst],
            "simulators": {s: sum(1 for r in rows if r["_simulator"] == s) for s in {r["_simulator"] for r in rows}},
        },
    )


def get_parameters(ctx: ToolContext, a: ToolArgs) -> str:
    with engine().connect() as conn:
        catalog = aeb_parameter_catalog(conn)
    baseline = next((v for v in ctx.versions() if v["status"] == "BASELINE"), {})
    sid = ctx.book.add("AEB", "parameters", "Danh mục tham số AEB", "/aeb")
    return _dump(
        sid,
        "Danh mục 10 tham số AEB (khoảng cho phép = giới hạn khi tạo ứng viên)",
        [
            {
                "code": r["code"],
                "name": r["name"],
                "category": r["category"],
                "unit": r["unit"],
                "min": float(r["min_value"]),
                "max": float(r["max_value"]),
                "catalog_default": float(r["default_value"]),
                "baseline_value": (baseline.get("parameters") or {}).get(r["code"]),
            }
            for r in catalog  # bỏ cột description: dữ liệu đang lỗi mã hoá (TD-22)
        ],
    )


def get_aeb_version(ctx: ToolContext, a: ToolArgs) -> str:
    versions = ctx.versions()
    baseline = next((v for v in versions if v["status"] == "BASELINE"), {})
    base_params = baseline.get("parameters") or {}

    def diff(v: dict) -> dict:
        return {c: [base_params.get(c), x] for c, x in v["parameters"].items() if base_params.get(c) != x}

    if not a.code:
        sid = ctx.book.add("AEB", "versions", "Các AEB version", "/aeb")
        return _dump(
            sid,
            "Các AEB version (diff = [baseline, version])",
            [
                {"label": v["label"], "status": v["status"], "notes": v["notes"], "diff_vs_baseline": diff(v)}
                for v in versions
            ],
        )
    v = next((v for v in versions if _norm(v["label"]) == _norm(a.code) or str(v["id"]) == _norm(a.code)), None)
    if v is None:
        return f"Không có AEB version '{guardrails.neutralize(a.code, 40)}'. Có: {', '.join(x['label'] for x in versions)}."
    tests = [
        f"{t['code']} ({t['status']}, quyết định {t['review_decision']})"
        for t in ctx.regressions()
        if t["candidate_version_id"] == v["id"]
    ]
    sid = ctx.book.add("AEB", v["label"], f"AEB {v['label']}", "/aeb")
    return _dump(
        sid,
        f"AEB version {v['label']}",
        {
            **{k: v[k] for k in ("label", "status", "source", "notes", "created_at")},
            "parameters": v["parameters"],
            "diff_vs_baseline": diff(v),
            "regressions": tests,
        },
    )


def get_family(ctx: ToolContext, a: ToolArgs) -> str:
    families = ctx.families()
    if not a.code:
        sid = ctx.book.add("FAMILY", "families", "Các họ kịch bản", "/scenarios")
        return _dump(
            sid,
            "Các họ kịch bản",
            [
                {"code": f["code"], "name": f["name"], "variants": f["variants"], "failures": f["failures"]}
                for f in families
            ],
        )
    f = next((f for f in families if _norm(f["code"]) == _norm(a.code) or str(f["id"]) == _norm(a.code)), None)
    if f is None:
        return (
            f"Không có họ kịch bản '{guardrails.neutralize(a.code, 40)}'. Có: {', '.join(x['code'] for x in families)}."
        )
    rows = [r for r in ctx.failures() if r["scenario_id"] == f["id"]]
    outcomes: dict[str, int] = {}
    for r in rows:
        o = "FALSE_BRAKING" if r["failure_type"] == "FALSE_BRAKING" else r["outcome"]
        outcomes[o] = outcomes.get(o, 0) + 1
    sid = ctx.book.add("FAMILY", f["code"], f"Họ kịch bản {f['code']}", "/scenarios")
    return _dump(
        sid,
        f"Họ kịch bản {f['code']}",
        {
            **{
                k: f[k]
                for k in ("code", "name", "description", "variants", "parameter_space", "runs", "failures", "baseline")
            },
            "failures_by_outcome": outcomes,
        },
    )


def get_regression(ctx: ToolContext, a: ToolArgs) -> str:
    tests = ctx.regressions()
    if not a.code:
        sid = ctx.book.add("REGRESSION", "list", "Các regression", "/validation/regression")
        return _dump(
            sid,
            "Các kiểm thử hồi quy",
            [
                {
                    k: t[k]
                    for k in (
                        "code",
                        "baseline",
                        "candidate",
                        "status",
                        "review_decision",
                        "scenarios",
                        "fixed",
                        "regressed",
                    )
                }
                for t in tests
            ],
        )
    wanted = _norm(a.code).replace("rec-", "rt-")
    t = next((t for t in tests if _norm(t["code"]) == wanted or str(t["id"]) == wanted.lstrip("rt-").lstrip("0")), None)
    if t is None:
        return f"Không có regression '{guardrails.neutralize(a.code, 40)}'. Có: {', '.join(x['code'] for x in tests)}."
    d = guardrails.clean(views.recommendation_detail(t["id"]))
    s = d.get("summary") or {}
    sid = ctx.book.add("REGRESSION", d["code"], f"Regression {d['code']}", f"/validation/regression/{t['id']}")
    return _dump(
        sid,
        f"Regression {d['code']} / khuyến nghị {d['recommendation_code']}",
        {
            "name": d["name"],
            "family": d["family"],
            "baseline": d["baseline"]["label"],
            "candidate": d["candidate"]["label"],
            "status": d["status"],
            "review_decision": d["review_decision"],
            "review_note": (d.get("review") or {}).get("note"),
            "changed_parameters": [x for x in d["parameter_diff"] if x["changed"]],
            "counts": s.get("counts"),
            "rates_pct": s.get("rates"),
            "median_min_ttc": s.get("median_min_ttc"),
            "criteria": [
                {k: x.get(k) for k in ("label", "passed", "actual", "threshold", "required")}
                for x in s.get("criteria", [])
                if x.get("enabled", True)
            ],
            "changed_scenarios": [
                f"{x['label']} {x['change']}: {x['baseline_outcome']} #{x['baseline_run_id']} -> "
                f"{x['candidate_outcome']} #{x['candidate_run_id']}"
                for x in s.get("pairs", [])
                if x["change"] in ("fixed", "regressed")
            ][:20],
            "recommendation_status": d.get("recommendation_status"),
            "confidence": d.get("confidence"),
            "tradeoffs": d.get("tradeoffs"),
            "evidence": d.get("evidence"),
        },
    )


@dataclass(frozen=True)
class Tool:
    fn: Callable[[ToolContext, ToolArgs], str]
    usage: str


TOOLS: dict[str, Tool] = {
    "search_knowledge": Tool(
        search_knowledge,
        "query — tìm trong tài liệu repo + đoạn tri thức của project (kiến trúc, ADR, lý do thiết kế, quy trình)",
    ),
    "project_overview": Tool(
        project_overview, "(không tham số) — tổng quan: xe, baseline, số họ/biến thể/ca lỗi/regression"
    ),
    "get_run": Tool(
        get_run, "run_id — chi tiết một lượt chạy: kết quả, chuỗi nguyên nhân, số đo, sự kiện, tham số AEB"
    ),
    "list_failures": Tool(
        list_failures,
        "lọc: outcome, failure_class, family, aeb_version, weather, time_of_day, min/max_speed_kmh, stops_at_curb; sort_by, limit ≤ 15",
    ),
    "failure_stats": Tool(
        failure_stats,
        "group_by + cùng bộ lọc như list_failures — đếm trên TOÀN BỘ ca lỗi; dùng cho câu 'nhất/bao nhiêu/tỉ lệ'",
    ),
    "get_parameters": Tool(
        get_parameters, "(không tham số) — 10 tham số AEB: đơn vị, khoảng cho phép, giá trị baseline"
    ),
    "get_aeb_version": Tool(
        get_aeb_version, "code = nhãn (v1.3) hoặc null để liệt kê — tham số và khác biệt so với baseline"
    ),
    "get_family": Tool(get_family, "code = mã họ (PX7) hoặc null để liệt kê — không gian tham số, số ca lỗi"),
    "get_regression": Tool(
        get_regression, "code = RT-004/REC-004 hoặc null để liệt kê — tiêu chí, kết quả, đánh đổi, quyết định"
    ),
}


def run_tool(ctx: ToolContext, name: str, args: ToolArgs) -> str:
    tool = TOOLS.get(name)
    if tool is None:
        return f"Lỗi: không có công cụ '{guardrails.neutralize(name, 40)}'. Chỉ dùng: {', '.join(TOOLS)}."
    return tool.fn(ctx, args)
