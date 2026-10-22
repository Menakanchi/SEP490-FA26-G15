# Exec plan — Bỏ phiên bản xe, Admin tạo workspace, báo cáo theo project (ADR-038)

**Trạng thái:** xong 07/10/2026 · **Người làm:** TrungDQ (nhánh `trungdam`)

## Mục tiêu

Áp 5 quyết định nghiệp vụ của TrungDQ ([ADR-038](../../adr/ADR-038-bo-phien-ban-xe-admin-tao-workspace.md)) lên
schema đang chạy (30 → 29 bảng) mà không mất dữ liệu, không đổi kết quả mô phỏng của run cũ.

## Đã làm

1. `01_schema.sql`:
   - bỏ `vehicle_versions`; thông số vật lý vào `carla_vehicle_models`;
   - thêm `projects.carla_vehicle_model_id`; run / regression / tối ưu / cảm biến trỏ mẫu xe;
   - dựng lại `fk_sr_baseline`, `fk_sr_regression`, `uq_sr_replay`, `uq_rt_run_scope` trên mẫu xe;
   - `workspaces` bỏ cột xin / duyệt, thêm `created_by_user_id`;
   - `workspace_task_reports` → `task_reports` có `project_id`, FK ghép tới task cùng project;
   - thông báo `WORKSPACE_ASSIGNED` thay hai loại xin / duyệt.
2. Migration `006_2026-10-07_bo-phien-ban-xe-admin-tao-workspace.sql` cho DB đang ở 005.
3. Code:
   - `tables.py`;
   - `common.active_vehicle` / `vehicle_by_id` đọc mẫu xe;
   - `runs.py`, `regression.py`, `views.py`: cột `carla_vehicle_model_id`;
   - `bootstrap.py` seed thông số xe vào danh mục và chọn sẵn xe cho project.
4. Tài liệu: `database-schema.md`, `architecture.md`, ADR-038, mục lục ADR, tech debt (TD-24, TD-26, TD-31, TD-32),
   `AGENTS.md`, `README.md`.

## Kiểm chứng

| Việc | Kết quả |
|---|---|
| Dựng `01_schema.sql` trên MySQL 8.4 (DB tạm) | 29 bảng, 378 cột, 80 FK, 27 CHECK |
| Chạy 006 trên bản sao DB dev, so `SHOW CREATE TABLE` từng bảng với schema mới | 29/29 bảng giống hệt |
| Số dòng trước / sau | 1188 run, 4 regression, 384 cặp, 758 lỗi, 646 phiên bản kịch bản — không đổi |
| FK regression dựng lại có kiểm dữ liệu cũ (`FOREIGN_KEY_CHECKS = 1`) | Thêm được, không dòng nào vi phạm |
| Ràng buộc mới | Chặn: báo cáo trỏ task của project khác, workspace thiếu Admin tạo, run regression đổi sang xe khác |
| Áp 006 lên DB dev (sao lưu trước, 28,7 MB) | 29 bảng; 1188 run trỏ `vehicle.audi.etron` |
| Code trên DB dev thật | `context`, danh sách lỗi (758), JSON chạy CARLA đúng thông số xe; mô phỏng lại 10 run cũ khớp kết quả đã lưu |
| `ruff check`, `ruff format --check`, `pytest` | sạch; 261 passed, 1 skipped |

## Còn lại

- API / màn: Admin tạo workspace + gán Manager, Manager xem thành viên, thành viên project, báo cáo theo project,
  và quyền xem thành viên chỉ trong project mình (TD-30).
- Nhóm sửa UC List trong Final Report: bỏ UC-25, sửa UC-17 / UC-18 theo Admin tạo workspace.
