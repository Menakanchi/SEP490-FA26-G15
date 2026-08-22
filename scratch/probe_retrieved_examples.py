"""Probe tay: xem `odd` và `retrieved_examples` của một lần sinh thật.

Không phải test — nó gọi LLM thật và ghi vào database thật. Chạy bằng tay:

    DATABASE_URL="sqlite:///data/app.db" .venv/bin/python scratch/probe_retrieved_examples.py

Đặt `DATABASE_URL` sang file khác nếu không muốn đụng DB dev, nhưng nhớ là
retriever chỉ nhìn thấy kịch bản `approved_library` — DB trống thì
`retrieved_examples` luôn rỗng và probe này không nói lên điều gì.
"""

import asyncio
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8")

from src.api.routes import _run_workflow  # noqa: E402
from src.config import get_settings  # noqa: E402
from src.services import db  # noqa: E402

PROMPT = "xe trộn bê tông đang lùi chậm vào công trình"


async def main() -> int:
    print(f"=== DATABASE_URL === {get_settings().database_url}")
    db.init_db()

    # Dựng hàng request rồi await thẳng `_run_workflow`. Đi qua `generate()` thì
    # nó tự `asyncio.create_task(...)`, nên probe sẽ phải poll thay vì đọc kết
    # quả ngay — và `force_generate` ở đây là cố ý: chạy lại đúng câu này lần
    # thứ hai vẫn phải sinh thật, không bị chốt chặn trùng của ADR-015 trả về
    # kết quả cũ.
    request_id = str(uuid.uuid4())
    db.create_generation_request(
        request_id,
        PROMPT,
        validation_mode="static",
        limit=3,
        created_by="scratch-probe",
        force_generate=True,
    )
    await _run_workflow(request_id)

    req = db.get_generation_request(request_id)
    if not req or not req.get("scenario_id"):
        print("=== KHÔNG SINH ĐƯỢC ===")
        print("step:", req and req.get("step"), "| error:", req and req.get("error"))
        return 1

    scenario = db.get_scenario(req["scenario_id"])
    print(f"=== SCENARIO === {scenario['scenario_id']} ({scenario['status']})")

    print("=== ODD FIELD ===")
    print(json.dumps(scenario["odd"], indent=2, ensure_ascii=False))

    print("=== RETRIEVED EXAMPLES FIELD ===")
    print(json.dumps(scenario.get("retrieved_examples", []), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
