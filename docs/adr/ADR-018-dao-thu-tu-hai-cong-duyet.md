# ADR-018: Chạy mô phỏng trước khi duyệt vào thư viện

**Ngày:** 2026-08-19  
**Trạng thái:** Accepted  
**Thay thế:** bảng transition ở ADR-011 §3.3 và thứ tự xử lý kết quả mô phỏng ở ADR-017

## Bối cảnh

Luồng cũ duyệt `BEFORE_LIBRARY` trước rồi mới xin chạy CARLA. Reviewer ở cổng
thư viện vì thế chỉ thấy spec, preview và XML tĩnh; không thể biết scenario có
chạy được hoặc tái hiện đúng intent hay không. Kết quả thật đến sau khi dữ liệu
đã được publish và đã có thể quay lại làm few-shot.

Hai quyết định con người cần trả lời hai câu khác nhau:

1. Có cho phép scenario này tiêu tài nguyên GPU để kiểm chứng không?
2. Sau khi xem kết quả thực thi, có cho phép nó trở thành dữ liệu thư viện không?

## Quyết định

Đảo thứ tự thành:

```text
sinh spec + .xosc
  -> pending_sim_review
  -> BEFORE_SIM
  -> simulation_queued + ScenarioJob
  -> CARLA trả ExecutionResult/criteria
  -> pending_library_review
  -> BEFORE_LIBRARY
  -> approved_library | rejected
```

- Reject ở bất kỳ cổng nào đều kết thúc ở `rejected`.
- Approve `BEFORE_SIM` chỉ tạo job, chưa tạo embedding và chưa publish.
- Worker callback ghi `VerificationLevel` cùng kết quả thực thi rồi mở cổng 2;
  callback không tự quyết định đưa vào thư viện.
- Approve `BEFORE_LIBRARY` mới tạo embedding. Retriever chỉ đọc
  `approved_library` có embedding.
- `.xosc` tải được từ khi generation hoàn tất để reviewer cổng 1 có thể kiểm
  tra hoặc chạy chẩn đoán; quyền tải file không đồng nghĩa quyền publish.
- Không có endpoint `request-sim` hay đường chạy lại từ `approved_library`
  trong state machine MVP này.

## Lý do

`BEFORE_SIM` bảo vệ tài nguyên; `BEFORE_LIBRARY` bảo vệ chất lượng dữ liệu. Đặt
cổng thư viện sau CARLA cho reviewer đúng bằng chứng cần thiết: scenario có chạy
được không, criteria nào pass/fail, và hazard có thực sự xuất hiện không.

## Hệ quả

- Worker offline không chặn generate, review sơ bộ hoặc tải `.xosc`, nhưng sẽ
  làm scenario nằm ở `simulation_queued` và chưa thể vào thư viện.
- UI review phải hiển thị kết quả thực thi gần nhất ở Cổng 2.
- `ScenarioStatus` có năm giá trị; `JobStatus` vẫn là trục riêng.
- Dữ liệu cũ ở `pending_sim_review` được hiểu là đang chờ Cổng 1. `init_db()` tự
  chuyển record `pending_review` cũ sang `pending_sim_review`.
