"""Test của lõi mô phỏng + worker: chạy bằng ``python -m pytest worker/tests`` (Python >= 3.10, chỉ cần pytest)."""

import sys
from pathlib import Path

WORKER = Path(__file__).resolve().parents[1]
if str(WORKER) not in sys.path:
    sys.path.insert(0, str(WORKER))