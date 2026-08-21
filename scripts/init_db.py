"""Create the persistence schema from an empty database."""

import sys
from pathlib import Path


def main() -> None:
    """Dựng schema **và** chạy các migration dữ liệu kèm theo.

    Gọi ``db.init_db()`` chứ không gọi thẳng ``ScenarioRepository.create_schema()``:
    bản trước chỉ ``create_all`` nên migration trạng thái của ADR-018 — thứ đưa
    record ``pending_review`` cũ về Cổng 1 — **không bao giờ chạy trên đường
    triển khai**. Nó chỉ chạy trong fixture của test và trong ``seed_db.py``, nên
    test xanh trong khi database thật vẫn giữ trạng thái đã bị bỏ.

    ``sys.path`` phải được nới trước khi import ``src``: chạy ``python
    scripts/init_db.py`` đặt ``scripts/`` làm ``sys.path[0]``, không phải gốc
    repo, nên import ở cấp module sẽ chết bằng ``ModuleNotFoundError`` — đúng
    câu lệnh mà docstring của ``db.init_db`` chỉ người ta dùng.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    from src.config import get_settings
    from src.services.db import init_db

    init_db()
    print(f"Initialized persistence schema at {get_settings().database_url}")


if __name__ == "__main__":
    main()
