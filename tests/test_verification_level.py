"""``verification_from_execution`` — nhãn kiểm chứng suy từ kết quả chạy CARLA.

File này ra đời ngày 03/09/2026 vì hàm đó **chưa từng có test nào**, và nó đã sai
suốt: nó đọc mỗi ``CollisionTest``, nên hai maneuver cố ý không dựng cú đâm thì
vĩnh viễn không bao giờ được gắn ``ADVERSARIAL``.

Nhãn này không phải chuyện nội bộ: cổng few-shot của retriever lọc theo nó, nên
sai nhãn là cấm cửa cả một maneuver khỏi pool ví dụ.
"""

from __future__ import annotations

import pytest

from src.models.schemas import (
    NEAR_MISS_M,
    CriterionResult,
    CriterionStatus,
    VerificationLevel,
    verification_from_execution,
)


def _collision(result: CriterionStatus) -> list[CriterionResult]:
    return [CriterionResult(name="CollisionTest", result=result, actual="1")]


KHONG_VA_CHAM = _collision(CriterionStatus.SUCCESS)
CO_VA_CHAM = _collision(CriterionStatus.FAILURE)


def test_a_collision_is_adversarial_regardless_of_the_gap() -> None:
    """``CollisionTest = FAILURE`` là tin tốt — hành vi cũ, phải giữ nguyên."""
    level = verification_from_execution(True, CO_VA_CHAM, min_distance_m=0.0)

    assert level is VerificationLevel.ADVERSARIAL


def test_a_near_miss_without_a_collision_is_still_adversarial() -> None:
    """``lane_drift`` cố ý dựng near-miss, không dựng cú đâm.

    Đo ngày 03/09: 0/19 ``lane_drift`` và 0/5 ``jaywalk`` từng được gắn
    ADVERSARIAL, kể cả ``sc_024_t4`` khe hở 0,375 m — bản tới hạn nhất của cả
    chuỗi dò. Luật cũ đọc mỗi ``CollisionTest`` nên hai maneuver đó bị cổng
    few-shot loại vĩnh viễn.
    """
    level = verification_from_execution(True, KHONG_VA_CHAM, min_distance_m=0.375)

    assert level is VerificationLevel.ADVERSARIAL


def test_running_cleanly_far_away_is_not_a_hazard() -> None:
    """Chạy trót lọt mà cách nhau 6,46 m thì không có nguy hiểm nào.

    ``sc_107`` là ca thật: xe tải vượt đèn đỏ đúng nhãn, đúng ODD, L4 chấm ĐÚNG
    vì nó thật sự vượt đèn đỏ — nhưng ego đi qua nút giao an toàn. Đây là lý do
    không lấy L4 làm tiêu chí cho nhãn này.
    """
    level = verification_from_execution(True, KHONG_VA_CHAM, min_distance_m=6.464)

    assert level is VerificationLevel.RAN_NO_HAZARD


@pytest.mark.parametrize(
    ("gap", "mong_doi"),
    [
        (NEAR_MISS_M - 0.001, VerificationLevel.ADVERSARIAL),
        (NEAR_MISS_M, VerificationLevel.RAN_NO_HAZARD),
        (NEAR_MISS_M + 0.001, VerificationLevel.RAN_NO_HAZARD),
    ],
    ids=["dưới ngưỡng", "đúng ngưỡng", "trên ngưỡng"],
)
def test_the_near_miss_threshold_is_strictly_below(gap: float, mong_doi: VerificationLevel) -> None:
    """Ghim đúng chiều so sánh: ``< NEAR_MISS_M``, không phải ``<=``.

    Cùng chiều với luật L4 và M3, để một lượt chạy không thể vừa "suýt va chạm"
    theo chỗ này vừa "không" theo chỗ kia.
    """
    assert verification_from_execution(True, KHONG_VA_CHAM, min_distance_m=gap) is mong_doi


def test_without_trajectory_numbers_it_falls_back_to_the_criterion() -> None:
    """Thiếu số quỹ đạo thì đọc mỗi ``CollisionTest``, đúng hành vi cũ.

    Không đoán: khe hở ``None`` nghĩa là *chưa đo được*, không nghĩa là *xa*.
    """
    assert verification_from_execution(True, KHONG_VA_CHAM) is VerificationLevel.RAN_NO_HAZARD
    assert verification_from_execution(True, CO_VA_CHAM) is VerificationLevel.ADVERSARIAL


def test_a_failed_run_says_nothing_about_hazard() -> None:
    """Crash / timeout thì khe hở đo được cũng vô nghĩa.

    Kết quả cũ do worker chưa có chốt chặn vẫn mang số của actor còn sót
    (``sc_025`` ngày 22/08: ``Unable to add actors`` mà vẫn có khe hở 12,58 m).
    """
    level = verification_from_execution(False, CO_VA_CHAM, min_distance_m=0.0)

    assert level is VerificationLevel.EXECUTION_FAILED


def test_the_near_miss_threshold_has_one_definition() -> None:
    """``metrics`` phải dùng đúng hằng số của ``schemas``, không phải bản sao.

    Trước 03/09 có hai bản ``NEAR_MISS_M = 1.0`` ở hai file. Hai bản sao là để
    chúng lệch nhau.
    """
    from src.services import metrics

    assert metrics.NEAR_MISS_M is NEAR_MISS_M
