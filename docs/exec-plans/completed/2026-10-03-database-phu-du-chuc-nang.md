# Database phủ đủ chức năng (03/10/2026)

**Yêu cầu (TrungDQ):** "database của tôi đã đầy đủ chưa — hãy làm hết"; giữa chừng chốt thêm "chỉ nghiên
cứu một xe, xe là bản duy nhất, không có version; lấy thêm xe thì clone thông số từ CARLA".
**Quyết định:** [ADR-031](../../adr/ADR-031-database-phu-du-chuc-nang.md) (+ phần schema của
[ADR-030](../../adr/ADR-030-bo-viewer-them-expert-va-forum.md)). **Từ điển dữ liệu:**
[database-schema.md](../../vehicsim/database-schema.md).

## Đã làm

1. Đối chiếu 28 bảng với FE-01 → FE-14, màn Figma 05/07/08 và ADR-030 → danh sách thiếu (ADR-031 §Bối cảnh).
2. `01_schema.sql`: +8 bảng, +cột ở `users`, `optimization_trials`, `simulation_runs`,
   `simulation_artifacts`, `failures`; role EXPERT thay VIEWER; view truy vết thêm `robustness_test_id`.
3. Bản nháp có `vehicle_versions` + `vehicle_parameters` — bỏ sau quyết định "một xe, không version";
   gỡ khỏi file, migration và DB dev (hai bảng rỗng, không mất dữ liệu).
4. `database/mysql/migrations/001_2026-10-03_phu-du-chuc-nang.sql`: nâng DB 28 bảng; CREATE TABLE chép
   nguyên văn từ `01_schema.sql`; sửa luôn `review_decision` (TD-26) và chữ vỡ latin1 (TD-22, đã xoá khỏi
   tracker).
5. Code theo schema: `WRITE_ROLES` + EXPERT, `RUN_PURPOSES` + ROBUSTNESS, `scripts/create_admin.py --role`,
   frontend nhận role `expert` (quyền ghi, nhãn "Chuyên gia", các `allowedRoles` có `engineer`).
6. Meomeo Agent không đánh chỉ mục `database-schema.md` (`DOC_EXCLUDED`) — guardrail
   test_tool_output_never_carries_user_data_or_injected_commands đã bắt được tài liệu mới làm lộ tên cột
   của bảng `users`.
7. Tài liệu: database-schema.md viết lại cho 36 bảng; `test_schema_doc_covers_every_table_and_column`
   giữ tài liệu khớp file SQL; AGENTS.md, architecture.md, tech-debt-tracker cập nhật.

## Kiểm chứng

| Kiểm | Kết quả |
|---|---|
| Sao lưu DB dev trước khi đụng (mysqldump trong container, chép nguyên byte) | 34 MB, 28 bảng |
| DB dựng mới từ `01_schema.sql` so với bản sao DB dev + migration 001 (cột, kiểu, collation, index, FK, CHECK, view) | 0 khác biệt — 36 bảng, 435 cột, 91 FK, 15 CHECK, 158 index |
| Dữ liệu sau migration | giữ nguyên: 1.134 run, 717 lỗi, 2 user, 7 AEB version, 804 đoạn tri thức |
| Chạy migration lần hai | dừng ngay ở `ADD COLUMN avatar_url` (Duplicate column), không đổi dữ liệu |
| DB dev máy TrungDQ sau khi nâng so với DB dựng mới | 0 khác biệt |
| 23 phép thử ràng buộc trên dữ liệu thật (rollback) | 23/23 đúng |
| Mô tả tiếng Việt `roles` / `aeb_parameters` sau migration | khớp từng byte với DB dựng mới (10/10) |
| Backend `pytest tests/` (04/10) | 764 passed, 35 skipped |
| Backend `ruff check` / `ruff format --check` | chỉ còn 3 lỗi I001 + 2 file chưa format có sẵn của TD-16; file của lần này sạch |
| Frontend `npm run lint`, `tsc --noEmit`, `next build` | sạch, exit 0 |

## Còn lại

- Thành viên khác chạy migration 001 trên DB của mình (TD-26).
- Code cho 8 bảng mới (API + màn hình), script `worker/` clone thông số xe từ CARLA.
- Sửa ERD drawio và báo cáo theo database-schema.md (TD-24).
