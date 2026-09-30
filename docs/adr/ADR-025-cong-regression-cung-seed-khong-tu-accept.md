# ADR-025 — Cổng regression: so từng cặp cùng seed, không bao giờ tự Accept

**Trạng thái:** Proposed 30/09/2026
**Phạm vi:** `src/services/vehicsim/regression.py`, màn 15/04/17/18

## Bối cảnh

Concept doc đặt luật: ứng viên sửa kịch bản A mà làm hỏng kịch bản B thì **không
bao giờ** được tự chấp nhận, và kỹ sư luôn phải duyệt. So tỉ lệ tổng (va chạm %
trước/sau) che mất ca xấu đi khi số ca tốt lên nhiều hơn. Khi review code còn phát
hiện: hai test cùng baseline cùng PASSED, Accept test thứ nhất làm test thứ hai trỏ
vào baseline đã bị hạ — Accept tiếp sẽ vi phạm UNIQUE "một BASELINE" (lỗi 500), và
Reject có thể đánh dấu nhầm baseline hiện hành là REJECTED.

## Các lựa chọn

1. So tỉ lệ tổng, tự nâng candidate nếu tốt hơn.
2. So tỉ lệ tổng, kỹ sư quyết định.
3. Ghép **cặp cùng biến thể + cùng seed**, tiêu chí có ngưỡng, kỹ sư quyết định, và chặn quyết định trên trạng thái cũ.

## Quyết định

Chọn (3).

1. Mỗi biến thể có một run baseline; candidate chạy lại **đúng seed** đó (FK ép ở DB).
2. Ma trận chuyển trạng thái SAFE/NEAR_MISS/COLLISION + verdict cho từng cặp;
   `regressed` nếu kết quả hoặc verdict xấu đi.
3. Tiêu chí: `no_new_collision`, `identical_seeds` bắt buộc (không tắt được); tỉ lệ va
   chạm không tăng; phanh oan tăng ≤ 0,5 điểm %; median min TTC đổi ≥ −0,1 s. Mọi
   tiêu chí đang bật phải qua mới PASSED.
4. Không có đường tự Accept. `decide` cần lý do + xác nhận; Accept chỉ khi test
   PASSED **và** baseline của test vẫn là BASELINE **và** candidate vẫn là CANDIDATE.
   Accept hạ baseline cũ trước, nâng candidate sau, trong một transaction.

## Lý do

- So cặp cùng seed tách được hiệu ứng của cấu hình khỏi nhiễu perception.
- Chặn trạng thái cũ biến lỗi 500/ghi sai thành 400 có giải thích ("baseline đã đổi —
  chạy lại regression").

## Hệ quả

- Chỉ tăng ngưỡng TTC thường FAILED vì phanh oan tăng — đúng ý đồ (đổi va chạm lấy
  phanh oan không phải cải thiện).
- Bằng chứng Robustness/Pareto/Sensitivity trả `NOT_RUN` cho tới khi có FE-13 (TD-06);
  confidence hiện chỉ dựa trên regression.
- Máy kiểm: `test_regression_pairs_same_seeds_and_accept_swaps_baseline`,
  `test_failed_regression_cannot_be_accepted`,
  `test_decision_requires_reason_and_confirmation`,
  `test_accepting_one_candidate_blocks_stale_tests`.
