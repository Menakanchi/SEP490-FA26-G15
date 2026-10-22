"""Test của adapter CARLA: chạy bằng ``python -m pytest worker/tests`` (Python >= 3.10, chỉ cần pytest)."""

import json
import sys
from pathlib import Path

import pytest

WORKER = Path(__file__).resolve().parents[1]
if str(WORKER) not in sys.path:
    sys.path.insert(0, str(WORKER))

# Mẫu .xosc do bộ xuất Java sinh; đã đối chiếu từng byte với bộ xuất Python cũ (xem src/test/resources/parity/README.md).
XOSC_FIXTURE = WORKER.parent / "src" / "test" / "resources" / "parity" / "xosc.json"


@pytest.fixture
def xosc(tmp_path: Path) -> Path:
    """Một file .xosc profile hiện tại (``vehicsim.xosc/v3``) do bộ xuất sinh ra."""
    entries = json.loads(XOSC_FIXTURE.read_text(encoding="utf-8"))
    path = tmp_path / "scenario.xosc"
    path.write_text(next(e["xml"] for e in entries if e["name"] == "export 0"), encoding="utf-8")
    return path
