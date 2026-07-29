# ADR-001: Tách CARLA ra worker riêng, backend cloud không bao giờ `import carla`

**Ngày:** 2026-07-28
**Trạng thái:** Accepted

## Bối cảnh

Deliverable #5 bắt buộc có **Live URL** hoạt động — chấm bằng cách mở từ máy lạ. Hạ tầng miễn phí khả dụng (Render free tier) chỉ có 512MB RAM và **không có GPU**.

CARLA cần GPU và vài GB VRAM. Cả nhóm chỉ có **một** máy có GPU (laptop RTX 4060 8GB của Công), và máy đó không thể bật 24/7.

Cần quyết: CARLA chạy ở đâu, và backend quan hệ với nó thế nào.

## Các lựa chọn

### Lựa chọn 1: CARLA là service trong `docker-compose`, Agent Core gọi trực tiếp
- Ưu: đơn giản, một codebase, một venv, gọi hàm trực tiếp.
- Nhược: **backend không deploy được lên bất kỳ hạ tầng miễn phí nào** vì `import carla` fail khi không có CARLA. Mất Deliverable #5. Demo phụ thuộc hoàn toàn vào một cái laptop đang bật.

### Lựa chọn 2: Backend cloud + worker GPU pull-based qua HTTP
- Ưu: backend deploy được lên Render; worker chạy từ máy bất kỳ có CARLA; worker offline không làm chết web.
- Nhược: thêm một giao thức job queue phải tự viết; thêm một mặt tiếp xúc phải test.

### Lựa chọn 3: Thuê GPU cloud để chạy CARLA cạnh backend
- Ưu: kiến trúc đơn giản như lựa chọn 1 nhưng vẫn có Live URL.
- Nhược: tốn tiền thật, không có ngân sách. Không dùng được.

## Quyết định

**Lựa chọn 2.** Backend chạy trên cloud và **không bao giờ `import carla`**. Worker là process riêng chạy trên máy có GPU, **pull** job từ backend qua HTTP (`GET /internal/jobs`, bảo vệ bằng `WORKER_TOKEN`) và POST kết quả về.

Thêm trường `validation_mode: static | sim` vào request: `static` không cần worker, `sim` mới đẩy xuống hàng đợi.

## Lý do

1. **Live URL là điều kiện chấm, không phải tính năng.** Bất kỳ thiết kế nào làm backend không deploy được đều bị loại từ đầu.
2. **Pull-based thay vì push** vì worker nằm sau NAT ở nhà, không có IP công khai để backend gọi vào.
3. `validation_mode: static` biến "worker đang tắt" từ sự cố thành **trạng thái vận hành bình thường** — demo vẫn chạy được toàn bộ luồng sinh scenario khi laptop đóng.
4. Ranh giới HTTP cũng chính là ranh giới Python version (xem ADR-002) — một đường cắt giải quyết hai vấn đề.

## Hệ quả

- Phải tự viết job state machine (`src/services/jobs.py`) và giao thức worker (`internal_jobs.py`). Đây là chi phí có thật, đổi lấy Deliverable #5.
- Kết quả sim là **bất đồng bộ**: `POST /generate` trả `request_id` ngay, client poll `GET /status/{id}`.
- Worker cần secret riêng (`WORKER_TOKEN`); không dùng chung khoá với người dùng.
- Tài liệu vận hành worker (cài đặt, chạy, troubleshooting) là trách nhiệm của `worker/README.md`.
- Rủi ro "một máy GPU = single point of failure" **không** bị ADR này loại bỏ, chỉ bị giảm: bất kỳ ai cài được CARLA đều chạy worker được. Xem §11 của `BATTLE_PLAN.md`.
