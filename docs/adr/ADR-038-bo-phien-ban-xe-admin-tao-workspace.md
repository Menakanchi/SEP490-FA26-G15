# ADR-038 — Bỏ phiên bản xe, Admin tạo workspace và gán Manager, báo cáo công việc theo project

**Trạng thái:** Proposed 07/10/2026 (TrungDQ, nhánh `trungdam`; schema + migration 006 + code đã đổi)
**Phạm vi:** sửa ADR-036 (phần xe Digital Twin có phiên bản, phần workspace xin / duyệt) và ADR-037. 30 → 29 bảng.
Giữ nguyên 5 role hệ thống (ADR-035), `project_members` và `NEAR_MISS` (ADR-037).

## Bối cảnh

TrungDQ chốt lại nghiệp vụ ngày 07/10/2026:

1. Admin tạo workspace và gán thẳng Manager quản lý — không còn Manager xin rồi Admin duyệt.
2. Không sửa thông số xe, nên bỏ phiên bản xe (`vehicle_versions`).
3. Báo cáo công việc gửi theo từng project, Manager duyệt — thay `workspace_task_reports`.
4. Manager xem được mọi thành viên trong workspace của mình.
5. Trong project, chỉ thành viên của project đó xem được thành viên khác của nó; không xem được thành viên project
   khác.

## Lựa chọn cho xe

1. Giữ một dòng xe cho mỗi project (bảng `vehicles`, không số phiên bản) — loại: vẫn là thông số sửa được theo
   project, đúng thứ không muốn.
2. **Thông số vật lý nằm thẳng trong danh mục `carla_vehicle_models`, cố định; project chỉ chọn xe** — chọn.

## Quyết định

- **Xe:**
  - Bỏ `vehicle_versions` (cả trạng thái hiệu chuẩn UNVERIFIED / CALIBRATED / VERIFIED).
  - Thông số vật lý (khối lượng, cản gió, trọng tâm, ma sát lốp, mô-men phanh, chiều dài cơ sở, tốc độ tối đa,
    giới hạn phanh, phanh đo trên CARLA) chuyển vào `carla_vehicle_models`. App không có màn sửa.
  - `projects.carla_vehicle_model_id` là xe project đang chọn (UC-23). Đổi xe không ảnh hưởng run cũ.
  - `simulation_runs`, `regression_tests`, `optimization_runs`, `sensors` trỏ `carla_vehicle_model_id`.
  - Bất biến regression giữ nguyên: `fk_sr_baseline` / `fk_sr_regression` ép cùng xe, cùng seed, cùng biến thể,
    cùng bộ mô phỏng — chỉ đổi cột xe. Xe là danh mục chung nên FK tới xe là FK đơn, không ghép `project_id`.
- **Workspace:** `status` chỉ còn `ACTIVE` / `ARCHIVED`; thêm `created_by_user_id` (Admin); bỏ
  `requested_by_user_id`, `approved_by_user_id`, `approved_at`, `review_note` và hai CHECK duyệt. Thông báo bỏ
  `WORKSPACE_REQUESTED` / `WORKSPACE_DECIDED`, thêm `WORKSPACE_ASSIGNED` (báo Manager được gán).
- **Báo cáo:** `workspace_task_reports` → `task_reports` có `project_id` bắt buộc; `task_id` tuỳ chọn, có thì
  FK ghép `(task_id, project_id)` → `workspace_tasks(id, project_id)` ép task cùng project. Manager của workspace
  chứa project duyệt (service kiểm).
- **Quyền xem thành viên (mục 4, 5):** không cần đổi bảng — `workspaces.manager_id` + `workspace_members` và
  `projects.created_by_user_id` + `project_members` đủ dữ liệu. Kiểm ở API khi làm màn workspace / project.

## Hệ quả

- Migration `006_2026-10-07_bo-phien-ban-xe-admin-tao-workspace.sql`: chép thông số phiên bản xe đang dùng sang
  mẫu xe, đổi cột xe ở run / regression / tối ưu / cảm biến, dựng lại FK regression (MySQL kiểm lại dữ liệu cũ).
  Đã thử trên bản sao DB dev: 29 bảng giống hệt `01_schema.sql`, giữ đủ 1188 run, 4 regression, 758 lỗi.
- Kết quả mô phỏng không đổi: giữ đúng thông số xe MVP (2100 kg, phanh tối đa 9,5 m/s²). Tên xe trong JSON tải
  về đổi từ "VF8 v1.2" thành "Audi e-tron".
- UC-25 (lịch sử phiên bản và hiệu chuẩn xe), UC-17 (Manager xin tạo workspace) và UC-18 (Admin duyệt workspace)
  không còn đúng; nhóm cần sửa UC List trong Final Report.
- Chưa có API / màn workspace, thành viên, báo cáo (TD-30).
