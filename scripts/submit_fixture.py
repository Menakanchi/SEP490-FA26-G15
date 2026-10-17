"""Đưa một ScenarioSpec có sẵn vào hàng chờ duyệt mô phỏng — không cần LLM.

Dùng khi chưa có ``OPENAI_API_KEY`` mà vẫn muốn đi đúng luồng web: script tạo bản
nháp + biên dịch ``.xosc`` rồi đẩy sang ``pending_sim_review``. **Không** tự duyệt:
người duyệt vẫn phải bấm Approve ở trang HITL Review (``/review``), sau đó worker
kéo job về chạy CARLA.

    uv run python scripts/submit_fixture.py                                   # sc_001 (xe máy tạt đầu)
    uv run python scripts/submit_fixture.py fixtures/scenario_specs/variants/ # cả thư mục (9 biến thể)
    uv run python scripts/submit_fixture.py a.json b.json --backend http://127.0.0.1:8000
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


def _spec_files(paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for raw in paths:
        path = Path(raw)
        files.extend(sorted(path.glob("*.json")) if path.is_dir() else [path])
    return files


def submit(spec_path: Path, backend: str, created_by: str) -> int:
    spec = ScenarioSpec.model_validate(json.loads(spec_path.read_text(encoding="utf-8")))
    try:
        xosc = convert_spec_to_xosc(spec)
    except Exception as exc:  # noqa: BLE001 — báo rõ thay vì gửi file rỗng
        print(f"{spec_path.name}: ngoài phạm vi converter, không chạy CARLA được: {exc}", file=sys.stderr)
        return 1

    try:
        draft = _post(
            backend,
            "/scenarios/draft",
            {
                "title": spec.title,
                "description_vi": spec.description_vi,
                "odd": spec.odd.model_dump(mode="json"),
                "spec": spec.model_dump(mode="json"),
                "xosc_content": xosc,
                "created_by": created_by,
            },
        )
        scenario_id = draft["scenario_id"]
        _post(backend, f"/scenarios/{scenario_id}/submit", {})
    except urllib.error.URLError as exc:
        print(f"Không gọi được backend {backend}: {exc}", file=sys.stderr)
        return 1

    print(f"{spec_path.name} -> {scenario_id}: http://127.0.0.1:3000/review?scenario_id={scenario_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "specs", nargs="*", default=["fixtures/scenario_specs/sc_001.json"], help="file .json hoặc thư mục"
    )
    parser.add_argument("--backend", default="http://127.0.0.1:8000")
    parser.add_argument("--created-by", default="creator")
    args = parser.parse_args()

    files = _spec_files(args.specs)
    failed = sum(submit(f, args.backend, args.created_by) for f in files)
    print(f"Đã đưa {len(files) - failed}/{len(files)} kịch bản vào hàng chờ duyệt mô phỏng (Cổng 1).")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
