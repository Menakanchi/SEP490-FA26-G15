# ADR-022 — Closed-loop dừng ở cặp A/B có người khởi động

**Trạng thái:** Accepted 24/08/2026  
**Phạm vi:** giới hạn cam kết của Phase 4

## Bối cảnh

Yêu cầu nâng cao của RAV-03 là tích hợp closed-loop với mô hình lái để lọc các
kịch bản làm mô hình thất bại. Bản hiện tại đã chạy một cặp cùng điều kiện đầu:
baseline xác minh nguy hiểm và BehaviorAgent đo phản ứng của mô hình; kết quả
được phân loại và lưu riêng theo ADR-021.

Một vòng ngoài tự đọc coverage gap/near-fail, mutate tham số, tạo job rồi lặp qua
nhiều thế hệ là một bài toán khác. Nó cần thêm chính sách ngân sách GPU, điều kiện
dừng, quyền tự phê duyệt qua HITL và đánh giá chất lượng của chiến lược tìm kiếm.
Đó không phải điều kiện để chứng minh mô hình lái thất bại trên một artifact.

## Quyết định

1. Closed-loop của MVP kết thúc sau **một cặp baseline/BehaviorAgent do con người
   khởi động** trên cùng artifact.
2. Hệ thống tự kiểm điều kiện đầu, so va chạm/phanh/khe hở/giảm tốc và trả khuyến
   nghị. `keep_regression` giữ controller failure làm ca hồi quy.
3. Campaign và Tune vẫn tồn tại, nhưng chỉ chạy khi người dùng chủ động yêu cầu.
   Khuyến nghị `create_harder_variant` không tự tạo biến thể hay tự tiêu GPU.
4. Không xây vòng tự mutate, tự xếp job và chạy nhiều thế hệ không giám sát; đây
   là phần **ngoài phạm vi**, không phải backlog còn thiếu của bản nộp.

## Lý do

- Đáp ứng đúng yêu cầu lọc kịch bản làm mô hình lái thất bại mà không tự mở rộng
  thành một hệ tối ưu scenario.
- Giữ ranh giới HITL rõ ràng: con người quyết định khi nào tiêu thêm GPU.
- Kết quả A/B truy nguyên được; một vòng tìm kiếm nhiều thế hệ cần một protocol
  đánh giá riêng mới có thể tuyên bố tốt hơn ngẫu nhiên.
- Giảm rủi ro vận hành và giữ bản demo trung thực với phần đã chạy thật.

## Hệ quả

- Phase 4 được xem là hoàn thành trong phạm vi: ODD campaign + controller A/B +
  phân loại controller failure.
- ADR-014 và ADR-021 vẫn giữ nguyên các quyết định batch/job; mọi câu mô tả vòng
  explore–exploit tự động trong đó là bối cảnh lịch sử, không còn là cam kết MVP.
- Benchmark cost/latency và mở rộng nhãn người là các việc đánh giá độc lập;
  chúng không kéo vòng nhiều thế hệ trở lại phạm vi.
