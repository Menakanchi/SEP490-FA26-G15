"""Benchmark cost/request và latency của workflow sinh kịch bản.

Chạy trên bản sao SQLite để không làm bẩn thư viện demo. Đây là benchmark online:
phải có ``OPENAI_API_KEY`` và có phát sinh phí API. CARLA không tham gia vì graph
sinh kết thúc ở BEFORE_SIM.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import sqlite3
import sys
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

PROMPTS = (
    "Trên cao tốc trời quang, xe máy vượt lên tạt đầu ô tô ego đang chạy 55 km/h rồi phanh gấp.",
    "Trên cao tốc mưa nhẹ, ô tô vượt phải tạt đầu xe ego ở tốc độ 50 km/h rồi giảm tốc đột ngột.",
    "Trên cao tốc mưa lớn, xe tải vượt lên cắt vào làn trước ô tô ego rồi phanh gấp.",
    "Trên cao tốc sương mù, xe máy từ phía sau tạt đầu xe ego đang chạy 45 km/h.",
    "Trên cao tốc trời quang, xe tải phía trước phanh gấp khi ô tô ego đang chạy 60 km/h.",
    "Trên cao tốc mưa nhẹ, ô tô phía trước bất ngờ phanh gấp trước xe ego ở khoảng cách gần.",
    "Trên cao tốc mưa lớn, xe máy phía trước giảm tốc đột ngột khiến ô tô ego không kịp tránh.",
    "Trên cao tốc sương mù, xe tải đang chạy phía trước ô tô ego bất ngờ phanh gấp.",
    "Trên cao tốc trời quang, ô tô bên cạnh lấn sang làn của xe ego đang chạy 50 km/h.",
    "Trên cao tốc mưa nhẹ, xe tải trôi làn sang phần đường của ô tô ego ở khoảng cách gần.",
    "Trên cao tốc mưa lớn, xe máy lấn làn của ô tô ego khi hai xe đang chạy song song.",
    "Trên cao tốc sương mù, ô tô ở làn bên cạnh lệch dần vào làn xe ego.",
    "Trên cao tốc trời quang, ô tô phía trước bất ngờ dừng giữa làn khiến xe ego phải xử lý.",
    "Trên cao tốc mưa nhẹ, xe tải dừng giữa làn ngay trước ô tô ego đang chạy 45 km/h.",
    "Trên cao tốc mưa lớn, xe máy phía trước dừng lại trong làn của ô tô ego.",
    "Trên cao tốc sương mù, một xe tải chạy ngược chiều trong đúng làn của ô tô ego.",
    "Trên cao tốc trời quang, ô tô chạy ngược chiều đối đầu xe ego trong cùng làn.",
    "Trên cao tốc mưa nhẹ, xe máy đi ngược chiều trong làn của ô tô ego đang tiến tới.",
    "Trên đường đô thị thẳng trời quang, ô tô vượt đèn đỏ cắt ngang đường xe ego đang đèn xanh.",
    "Trên đường đô thị thẳng mưa nhẹ, xe tải vượt đèn đỏ từ đường vuông góc và cắt trước xe ego.",
)


def _percentile(values: list[float], percentile: float) -> float | None:
    """Linear interpolation, cùng quy ước percentile mặc định của NumPy."""
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def _distribution(values: list[float], *, digits: int = 6) -> dict[str, float | None]:
    if not values:
        return {"min": None, "mean": None, "p50": None, "p95": None, "max": None}
    return {
        "min": round(min(values), digits),
        "mean": round(mean(values), digits),
        "p50": round(float(_percentile(values, 0.50)), digits),
        "p95": round(float(_percentile(values, 0.95)), digits),
        "max": round(max(values), digits),
    }


def _copy_sqlite(source: Path, destination: Path) -> None:
    """SQLite online backup tạo snapshot nhất quán dù backend đang chạy."""
    with sqlite3.connect(source) as source_conn, sqlite3.connect(destination) as destination_conn:
        source_conn.backup(destination_conn)


def _read_metrics(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    return {}


async def _run(source_db: Path, samples: int) -> dict[str, Any]:
    if not os.environ.get("OPENAI_API_KEY", "").strip():
        raise SystemExit("Thiếu OPENAI_API_KEY; benchmark online không dùng số giả.")
    if not source_db.is_file():
        raise SystemExit(f"Không tìm thấy database nguồn: {source_db}")

    # LangSmith không thuộc benchmark này. Tắt tracing để một key LangSmith cũ
    # không thêm retry/log 403 vào latency của OpenAI workflow.
    os.environ["LANGCHAIN_TRACING_V2"] = "false"
    os.environ["LANGSMITH_TRACING"] = "false"

    with tempfile.TemporaryDirectory(prefix="scenario-forge-benchmark-") as temp_dir:
        benchmark_db = Path(temp_dir) / "benchmark.db"
        _copy_sqlite(source_db, benchmark_db)
        os.environ["DATABASE_URL"] = f"sqlite:///{benchmark_db}"

        # Import sau khi đặt DATABASE_URL: settings có lru_cache và mọi repository
        # phải cùng trỏ vào snapshot, không được ghi nhầm vào kho demo.
        from src.api.routes import _run_workflow
        from src.config import get_settings
        from src.services import db
        from src.services.llm import EMBEDDING_COST_PER_MILLION_TOKENS, MODEL_COSTS

        db.init_db()
        selected = PROMPTS[:samples]
        rows: list[dict[str, Any]] = []

        for index, prompt in enumerate(selected, start=1):
            request_id = f"bench_{uuid.uuid4().hex}"
            db.create_generation_request(
                request_id,
                prompt,
                "static",
                limit=3,
                created_by="benchmark",
                force_generate=True,
            )
            await _run_workflow(request_id)
            request = db.get_generation_request(request_id) or {}
            metrics = _read_metrics(request.get("node_metrics"))
            provider = metrics.get("provider") or {}
            row = {
                "sample": index,
                "prompt": prompt,
                "status": request.get("status"),
                "scenario_id": request.get("scenario_id"),
                "error": request.get("error") or request.get("failed_reason"),
                "workflow_latency_s": metrics.get("workflow_latency_s"),
                "node_latency": metrics.get("node_latency") or {},
                "provider": provider,
            }
            rows.append(row)
            print(
                f"[{index:02d}/{len(selected):02d}] {row['status']} "
                f"{float(row['workflow_latency_s'] or 0):.3f}s "
                f"${float(provider.get('cost_usd') or 0):.6f}",
                flush=True,
            )

        workflow_latencies = [float(row["workflow_latency_s"]) for row in rows if row["workflow_latency_s"]]
        costs = [float(row["provider"].get("cost_usd") or 0.0) for row in rows]
        input_tokens = [float(row["provider"].get("input_tokens") or 0.0) for row in rows]
        output_tokens = [float(row["provider"].get("output_tokens") or 0.0) for row in rows]
        calls = [float(row["provider"].get("calls") or 0.0) for row in rows]

        node_names = sorted({node for row in rows for node in row["node_latency"]})
        node_summary = {
            node: _distribution(
                [float(row["node_latency"][node]["latency_s"]) for row in rows if node in row["node_latency"]]
            )
            for node in node_names
        }

        return {
            "benchmark": "generation_cost_latency",
            "measured_at": datetime.now(UTC).isoformat(),
            "scope": "7-node generation workflow through BEFORE_SIM; excludes HTTP polling and CARLA",
            "sample_count": len(rows),
            "completed": sum(row["status"] == "done" for row in rows),
            "failed": sum(row["status"] != "done" for row in rows),
            "model": get_settings().model_name,
            "escalated_model": get_settings().escalated_model,
            "percentile_method": "linear interpolation at (n-1)*q",
            "pricing_usd_per_million_tokens": {
                **MODEL_COSTS,
                "text-embedding-3-small": {"input": EMBEDDING_COST_PER_MILLION_TOKENS},
            },
            "pricing_sources": [
                "https://developers.openai.com/api/docs/models/gpt-5.6-luna",
                "https://developers.openai.com/api/docs/models/gpt-5.4-mini",
                "https://developers.openai.com/api/docs/models/gpt-5.4",
                "https://developers.openai.com/api/docs/models/text-embedding-3-small",
            ],
            "summary": {
                "workflow_latency_s": _distribution(workflow_latencies),
                "cost_usd_per_request": _distribution(costs, digits=9),
                "total_cost_usd": round(sum(costs), 9),
                "input_tokens_per_request": _distribution(input_tokens, digits=1),
                "output_tokens_per_request": _distribution(output_tokens, digits=1),
                "provider_calls_per_request": _distribution(calls, digits=2),
                "node_latency_s": node_summary,
            },
            "samples": rows,
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-db", type=Path, required=True, help="SQLite library dùng làm snapshot retrieval")
    parser.add_argument("--samples", type=int, default=len(PROMPTS), choices=range(1, len(PROMPTS) + 1))
    parser.add_argument("--output", type=Path, help="Ghi JSON; bỏ trống thì in stdout")
    args = parser.parse_args()

    result = asyncio.run(_run(args.source_db.resolve(), args.samples))
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
        print(f"Đã ghi {args.output}")
    else:
        print(rendered)


if __name__ == "__main__":
    main()
