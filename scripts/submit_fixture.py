"""Đưa một ScenarioSpec có sẵn vào hàng chờ duyệt mô phỏng — không cần LLM.

Dùng khi chưa có ``OPENAI_API_KEY`` mà vẫn muốn đi đúng luồng web: script tạo bản
nháp + biên dịch ``.xosc`` rồi đẩy sang ``pending_sim_review``. **Không** tự duyệt:
người duyệt vẫn phải bấm Approve ở trang HITL Review (``/review``), sau đó worker
kéo job về chạy CARLA.

    uv run python scripts/submit_fixture.py                                   # sc_001 (xe máy tạt đầu)
    uv run python scripts/submit_fixture.py fixtures/scenario_specs/sc_001.json --backend http://127.0.0.1:8000
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents.nodes.convert_xosc_node import convert_spec_to_xosc  # noqa: E402
from src.models.schemas import ScenarioSpec  # noqa: E402


def _post(backend: str, path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{backend}/api/v1{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("spec", nargs="?", default="fixtures/scenario_specs/sc_001.json")
    parser.add_argument("--backend", default="http://127.0.0.1:8000")
    parser.add_argument("--created-by", default="creator")
    args = parser.parse_args()

    spec = ScenarioSpec.model_validate(json.loads(Path(args.spec).read_text(encoding="utf-8")))
    try:
        xosc = convert_spec_to_xosc(spec)
    except Exception as exc:  # noqa: BLE001 — báo rõ thay vì gửi file rỗng
        print(f"Spec ngoài phạm vi converter, không chạy CARLA được: {exc}", file=sys.stderr)
        return 1

    try:
        draft = _post(
            args.backend,
            "/scenarios/draft",
            {
                "title": spec.title,
                "description_vi": spec.description_vi,
                "odd": spec.odd.model_dump(mode="json"),
                "spec": spec.model_dump(mode="json"),
                "xosc_content": xosc,
                "created_by": args.created_by,
            },
        )
        scenario_id = draft["scenario_id"]
        _post(args.backend, f"/scenarios/{scenario_id}/submit", {})
    except urllib.error.URLError as exc:
        print(f"Không gọi được backend {args.backend}: {exc}", file=sys.stderr)
        return 1

    print(f"Đã đưa {scenario_id} vào hàng chờ duyệt mô phỏng.")
    print(f"Duyệt tại: http://127.0.0.1:3000/review?scenario_id={scenario_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
