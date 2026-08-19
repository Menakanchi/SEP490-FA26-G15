# ADR-006: Dùng OpenAI `text-embedding-3-small` cho production, không dùng sentence-transformers

**Ngày:** 2026-07-28
**Trạng thái:** Accepted

## Bối cảnh

Thư viện kịch bản cần embedding để tìm kiếm ngữ nghĩa trên câu tiếng Việt. Backend deploy lên **Render free tier: 512MB RAM**, image phải build và khởi động được trong giới hạn đó.

`forge-spec.md` để mở "sentence-transformers *hoặc* OpenAI".

## Các lựa chọn

### Lựa chọn 1: sentence-transformers chạy trong process backend
- Ưu: không tốn tiền mỗi lần gọi; không phụ thuộc API bên ngoài; chạy được offline.
- Nhược: kéo theo **torch ~2GB** vào Docker image. Image phình, thời gian build tăng, và model nạp vào RAM khi khởi động — **vượt trần 512MB của Render**. Backend không khởi động được nghĩa là mất Deliverable #5.

### Lựa chọn 2: OpenAI `text-embedding-3-small` qua API
- Ưu: image không có torch, RAM backend gần như không đổi; chất lượng tốt trên tiếng Việt; giá rẻ ở quy mô vài nghìn vector.
- Nhược: phụ thuộc API bên ngoài; tốn tiền theo lượng gọi; cần quản lý khoá.

### Lựa chọn 3: sentence-transformers chạy ở worker GPU, backend gọi qua job queue
- Ưu: không có torch trong image backend, không tốn tiền API.
- Nhược: **tìm kiếm thư viện trở thành phụ thuộc GPU** — worker tắt là không search được. Phá vỡ chính nguyên tắc của ADR-001 là Live URL phải tự đứng được.

## Quyết định

**Lựa chọn 2.** Production dùng OpenAI `text-embedding-3-small`.

sentence-transformers **chỉ** dùng cho experiment local/offline nếu cần so sánh, và **không bao giờ** xuất hiện trong dependency backend ở `pyproject.toml`.

## Lý do

1. **Trần RAM 512MB là ràng buộc cứng của deliverable**, không phải sở thích. torch ~2GB loại lựa chọn 1 ngay lập tức.
2. Lựa chọn 3 nghe hợp lý nhưng làm hỏng bất biến quan trọng nhất của kiến trúc: *Live URL hoạt động khi worker offline*. Search là chức năng cốt lõi của web, không được phụ thuộc GPU.
3. Chi phí embedding ở quy mô này (vài nghìn scenario, seed một lần rồi thỉnh thoảng thêm) là **không đáng kể** so với chi phí LLM sinh scenario. Đây không phải chỗ để tiết kiệm.
4. Toàn bộ dữ liệu là mô phỏng/công khai, **không có dữ liệu cá nhân thật**, nên việc gửi text ra API bên ngoài không tạo rủi ro tuân thủ. Ghi rõ điều này trong `docs/safety.md`.

## Hệ quả

- Dependency backend trong `pyproject.toml` **không được** có `torch`, `sentence-transformers`, hay bất cứ thứ gì kéo chúng theo. Nếu image phình bất thường, đây là chỗ kiểm tra đầu tiên.
- Embedding trở thành một lệnh gọi mạng ⇒ cần xử lý lỗi và retry trong `src/services/library/embeddings.py`.
- Đổi model embedding về sau đòi **re-embed toàn bộ corpus**. Chốt model từ tuần 1 và ghi tên model vào payload của mỗi điểm trong Qdrant để biết vector nào sinh bằng model nào.
- Chi phí embedding tính vào `cost/scenario` và hiện trên `/stats` cùng chi phí LLM.
