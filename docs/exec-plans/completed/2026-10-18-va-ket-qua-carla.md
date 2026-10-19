# 18/10/2026 — Vá kiểm tra kết quả CARLA và telemetry

## Mục tiêu và phạm vi

Sửa ba lỗi phát hiện khi review: kết quả CARLA không khớp run vẫn được nhận; thông báo hoàn thành được phát trước
commit khiến regression có thể kẹt khi nộp đồng thời; tốc độ thiếu trong CSV bị coi là 0 và làm sai quãng phanh.
Giữ nguyên mô hình dữ liệu, luật AEB, seed baseline/candidate và quyền Reviewer.

## Các bước

1. Đã thêm test cho seed/source sai hoặc thiếu, thứ tự commit → thông báo regression và rollback, frame thiếu tốc độ.
2. Đã vá bước kiểm kết quả dùng chung, đưa thông báo ra sau transaction đã commit, bỏ frame không đủ dữ liệu động học.
3. Đã chạy test tái hiện trước/sau bản vá, gate Java và worker; cập nhật hợp đồng trong tài liệu kiến trúc.
4. Đã hoàn thành và chuyển kế hoạch sang completed.

## Điều kiện hoàn thành

- Seed và source phải khớp run trước khi ghi bất kỳ dữ liệu kết quả nào; simulator vẫn phải khớp.
- Listener regression chỉ nhận thông báo sau khi kết quả đã commit; rollback/commit lỗi không phát thông báo.
- Tốc độ trống/sai không biến thành 0; tốc độ 0 đo được vẫn là một khung hợp lệ.
- Các test hiện có và test hồi quy liên quan đều qua. Không dùng DB chính hoặc gọi CARLA/LLM thật để kiểm thử.

## Bằng chứng

- Trước bản vá: 26 test tập trung, 8 test mới thất bại (seed/source chưa kiểm; chưa có ranh giới commit trước event;
  CSV thiếu/sai dữ liệu vẫn được coi là tốc độ 0 hoặc còn được tính).
- Sau bản vá: `./mvnw.cmd clean test -q` — **114 test Java, 0 lỗi, 0 bỏ qua**; bao gồm test tài liệu và ma trận quyền.
- `python -m pytest worker/tests -q -p no:cacheprovider` — **66 test Python qua**.
- `CarlaResultSubmissionTest`: từ chối seed sai/thiếu/không nguyên và từng ID source sai/thiếu trước khi ghi;
  chỉ thông báo sau commit; rollback và lỗi commit không thông báo. Một test dùng proxy và lifecycle transaction
  Spring thật (Db giả) kiểm listener nằm ngoài transaction upload, mở được transaction mới; không chỉ kiểm thứ tự mock.
- `TelemetryMetricsServiceTest`: CSV có tốc độ trống ở t=0,6 s cho quãng phanh **7,983 m** thay vì **0,5 m**;
  frame trống cũng không thành vận tốc va chạm 0. Tốc độ 0 đo thật vẫn giữ; NaN/Infinity/số âm bị loại;
  thiếu cột hoặc không còn frame hợp lệ trả lỗi nghiệp vụ.
- `git diff --check` sạch (giữ quy ước CRLF của checkout). Không sửa frontend, schema hoặc thuật toán mô phỏng.

## Giới hạn kiểm chứng

Các test không ghi DB chính, không gọi CARLA hay LLM thật. Ranh giới transaction được kiểm bằng Spring với Db giả;
chưa chạy thử upload đồng thời trên MySQL thật. File kết quả thiếu seed/source (ví dụ chạy từ IR trần) nay bị từ chối;
cần chạy bằng bundle tải từ đúng run để giữ đủ metadata.
