#!/usr/bin/env python3
"""Tính lại ``scenarios.verification`` theo luật suýt-va-chạm (03/09/2026).

    uv run python scripts/backfill_verification.py            # chỉ xem, không ghi
    uv run python scripts/backfill_verification.py --apply    # ghi thật

Vì sao cần: ``verification_from_execution`` trước 03/09 đọc **mỗi**
``CollisionTest``. ``lane_drift`` và ``jaywalk`` cố ý dựng một lần đi sát nhau
chứ không dựng cú đâm, nên chúng không bao giờ ra ``CollisionTest = FAILURE`` —
đo được 0/19 và 0/5 chưa từng được gắn ``ADVERSARIAL``, kể cả bản khe hở 0,375 m.
Cổng few-shot của retriever lọc theo nhãn này, nên hai maneuver đó bị cấm cửa
khỏi pool ví dụ vĩnh viễn.

Luật mới xét cả hai đường tới nguy hiểm: va chạm, **hoặc** khe hở nhỏ hơn
``NEAR_MISS_M``. Nó chỉ **thêm** ``ADVERSARIAL``, không bao giờ gỡ — nên script
này không thể làm mất nhãn của kịch bản nào.

Nhãn tính lại từ ``scenario_jobs.result`` của **lượt chạy cuối**, không từ nhãn
đang lưu: nguồn sự thật là kết quả CARLA, không phải kết luận cũ. Bỏ qua job
``controller_evaluation`` — theo ADR-021 kết quả BehaviorAgent không được cập
nhật ``VerificationLevel``, nếu không một controller giỏi sẽ xoá chính bằng chứng
làm baseline.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import get_settings  # noqa: E402
from src.models.schemas import (  # noqa: E402
    CriterionResult,
    CriterionStatus,
    VerificationLevel,
    verification_from_execution,
)
from src.services.persistence import sqlite_path  # noqa: E402


def _muc_kiem_chung(payload: dict) -> VerificationLevel:
    """``scenario_jobs.result`` -> mức kiểm chứng, qua đúng hàm production."""
    tieu_chi = [
        CriterionResult(
            name=item["name"],
            result=CriterionStatus(item["result"]),
            actual=str(item.get("actual", "")),
        )
        for item in payload.get("criteria_results", [])
    ]
    return verification_from_execution(
        bool(payload.get("success")),
        tieu_chi,
        min_distance_m=(payload.get("metrics") or {}).get("min_distance_m"),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="ghi thật; mặc định chỉ xem")
    parser.add_argument("--db", default=None, help="đường dẫn SQLite (mặc định lấy từ settings)")
    args = parser.parse_args()

    db_path = Path(args.db) if args.db else sqlite_path(get_settings().database_url, caller="backfill_verification")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Lượt chạy CUỐI của mỗi kịch bản. ORDER BY rồi ghi đè trong dict là đủ và
    # đọc rõ hơn window function.
    luot_cuoi: dict[str, sqlite3.Row] = {}
    for row in conn.execute(
        """
        SELECT s.scenario_id, s.maneuver, s.status, s.verification, j.result
        FROM scenarios s
        JOIN scenario_jobs j ON j.scenario_id = s.scenario_id
        WHERE j.result IS NOT NULL
          AND (j.job_kind IS NULL OR j.job_kind = 'scenario_validation')
        ORDER BY j.created_at
        """
    ):
        luot_cuoi[row["scenario_id"]] = row

    doi_nhan: list[tuple[str, str, str, str, str]] = []
    for scenario_id, row in luot_cuoi.items():
        moi = _muc_kiem_chung(json.loads(row["result"]))
        if moi.value != row["verification"]:
            doi_nhan.append((scenario_id, row["maneuver"], row["status"], row["verification"], moi.value))

    doi_nhan.sort()
    print(f"Kịch bản đã chạy CARLA: {len(luot_cuoi)}")
    print(f"Đổi nhãn              : {len(doi_nhan)}")
    if doi_nhan:
        print("  theo chiều  :", Counter((c, m) for _, _, _, c, m in doi_nhan).most_common())
        print("  theo maneuver:", Counter(m for _, m, _, _, _ in doi_nhan).most_common())
        print()
        for scenario_id, maneuver, status, cu, moi in doi_nhan:
            print(f"  {scenario_id:14} {maneuver:14} {status:20} {cu} -> {moi}")

    # Chốt an toàn: luật mới chỉ THÊM adversarial. Mất nhãn là dấu hiệu luật đã
    # bị sửa sai chiều, và lúc đó đừng ghi gì cả.
    mat_nhan = [x for x in doi_nhan if x[3] == VerificationLevel.ADVERSARIAL.value]
    if mat_nhan:
        print(f"\nDỪNG: {len(mat_nhan)} kịch bản MẤT nhãn adversarial — luật mới chỉ được thêm, không được gỡ.")
        for x in mat_nhan:
            print("  ", x)
        return 1

    if not args.apply:
        print("\n(chỉ xem — thêm --apply để ghi)")
        return 0

    with conn:
        for scenario_id, _, _, _, moi in doi_nhan:
            conn.execute(
                "UPDATE scenarios SET verification = ? WHERE scenario_id = ?",
                (moi, scenario_id),
            )
    print(f"\nĐã ghi {len(doi_nhan)} nhãn.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
