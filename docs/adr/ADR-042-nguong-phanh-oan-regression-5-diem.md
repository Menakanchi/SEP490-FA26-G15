# ADR-042 — Ngưỡng phanh oan mặc định của regression: 5 điểm %

**Trạng thái:** Proposed 20/10/2026
**Phạm vi:** `RegressionService.defaultCriteria`, form `/validation/regression/new`; bổ sung ADR-025 mục 3, thực hiện lời hứa "cùng cổng regression" của ADR-040 §7.

## Bối cảnh

ADR-025 đặt tiêu chí `false_activation_increase_max_pts` mặc định 0,5 điểm %. ADR-040 §7 đặt ràng buộc tối ưu "phanh oan tăng ≤ 5 điểm %"
và ghi đó là cùng cổng với regression. Hai con số khác nhau (TD-48): một candidate khả thi và nằm trên Pareto có thể bị regression từ chối
chỉ vì ngưỡng chặt hơn gấp mười lần, và người triển khai tối ưu với người xác minh phải đoán ngưỡng của nhau.

## Các lựa chọn

1. Giữ 0,5 điểm % ở regression, 5 điểm % ở tối ưu.
2. Dùng 5 điểm % ở cả hai.
3. Chưa chốt, mỗi bên tự đặt.

## Quyết định

Chọn (2).

1. Mặc định `false_activation_increase_max_pts` của regression là **5 điểm %**, một hằng duy nhất
   `RegressionService.DEFAULT_FALSE_ACTIVATION_MAX_PTS` để phần tối ưu đọc lại, không chép số.
2. `no_new_collision` và `identical_seeds` vẫn bắt buộc; các tiêu chí khác vẫn tắt được và người tạo test vẫn chỉnh được ngưỡng.
3. Regression test đã tạo giữ ngưỡng đã lưu trong `pass_criteria_json`; verdict và khuyến nghị của chúng không đổi.
4. Candidate thuộc Pareto không đồng nghĩa regression PASSED: vẫn phải chạy regression và Reviewer vẫn quyết định.

## Lý do

- Một con số cho cả hai phía thì thứ được tối ưu và thứ được xác minh là một.
- Mỗi ca phanh oan trên một họ nhỏ đã chiếm nhiều điểm % (họ 10 biến thể: 1 ca = 10 điểm %), nên 5 điểm % vẫn chặn đổi va chạm lấy phanh oan
  ở họ nhỏ; ở họ lớn, Reviewer vẫn thấy số tuyệt đối.

## Hệ quả

- Họ lớn (từ 20 biến thể trở lên) chấp nhận được 1 ca phanh oan thêm mà vẫn PASSED; không đổi `no_new_collision`.
- Nhóm xem lại ngưỡng sau khi có dữ liệu tối ưu thật; đổi ngưỡng lần nữa cần ADR mới.
- TD-48 còn lại phần người triển khai tối ưu đọc cùng hằng và cùng quy ước va chạm.
- Máy kiểm: `RegressionRulesTest#defaultFalseActivationThresholdIsFivePoints`,
  `RegressionRulesTest#aTestStoredWithTheOldThresholdIsStillJudgedByIt`.
