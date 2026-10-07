# ADR-037 — Thành viên project, loại lỗi NEAR_MISS, 2 loại thông báo; chốt các chỗ UC List lệch DB

**Trạng thái:** Proposed 07/10/2026 (TrungDQ, nhánh `trungdam`; schema + migration 005 + bộ chấm đã đổi)
**Phạm vi:** bổ sung ADR-036 (29 → 30 bảng). Giữ nguyên role / quyền của ADR-035. Gộp vào migration 005
(`005_2026-10-06_schema-30-bang.sql`, đi thẳng 32 → 30 bảng) vì 005 chưa phát hành cho máy nào ngoài TrungDQ,
nên không có migration 006.

## Bối cảnh

Đối chiếu UC List mới trong Final Report (Bảng 3-3, 74 UC, 07/10/2026) với schema 29 bảng thấy 6 chỗ lệch:

- UC-65: Reviewer gửi feedback, Manager quyết định.
- UC-72/73/74: thêm, xoá, xem thành viên project; Manager giao project.
- UC-17/19: đổi role Engineer ↔ Reviewer theo từng workspace.
- UC-50: liệt kê ca "near miss".
- UC-22: thông báo "lỗi mới" và "candidate mới".
- UC-11: xem cấu hình quyền của role.

TrungDQ chốt từng chỗ ngày 07/10/2026.

## Quyết định

| UC | Chốt | Ảnh hưởng DB |
|---|---|---|
| UC-65 | Reviewer tự Accept / Reject, **không** cần Manager quyết định | Không đổi: `engineering_recommendations.reviewed_by_user_id` + `ck_er_no_self_review` đã đúng. UC spec cần sửa lại |
| UC-72/73/74 | Project có thêm / xoá / xem thành viên; người dùng **tự tạo** project (ENGINEER trong workspace, EXPERIENCER cá nhân), Manager không giao project | Thêm bảng `project_members` |
| UC-17/19 | Mỗi người một role hệ thống, **không đổi** theo workspace | Không đổi. UC spec bỏ phần "đổi role thành viên" |
| UC-50 | Thêm loại lỗi `NEAR_MISS` | `failures.failure_type` thêm `NEAR_MISS` |
| UC-22 | Thêm 2 loại thông báo | `notifications.type` thêm `FAILURE_DETECTED`, `CANDIDATE_CREATED` |
| UC-11 | Bỏ UC này | Không đổi: quyền vẫn kiểm ở FastAPI, không có bảng quyền |

### `project_members`

- Chỉ project thuộc workspace có thành viên. `workspace_id NOT NULL` + FK ghép `(project_id, workspace_id)` →
  `projects(id, workspace_id)` nên project cá nhân không có dòng nào.
- Thành viên phải đang ở workspace của project: FK ghép `(workspace_id, user_id)` → `workspace_members`. Rời
  workspace thì tự rời mọi project của workspace đó (CASCADE).
- Owner là người tạo (`projects.created_by_user_id`), không cần dòng riêng. Không có cột role.

### `NEAR_MISS`

- Bộ chấm (`evaluation.py`) gán `NEAR_MISS` cho ca suýt va chạm mà không khâu nào sai — trước đây gán
  `INSUFFICIENT_STOPPING_DISTANCE`. Ca suýt va chạm có khâu sai vẫn mang loại của khâu đó (`LATE_BRAKING`…).
- `INSUFFICIENT_STOPPING_DISTANCE` giữ trong ENUM cho kỹ sư gán tay. Migration 005 đổi các dòng `AUTO` cũ sang
  `NEAR_MISS` lúc chép dữ liệu.
- Kết quả mô phỏng không đổi (chỉ đổi nhãn), nên không cần đổi tên bộ mô phỏng.

## Hệ quả

- Máy kiểm: `test_thin_margin_with_every_stage_passing_is_a_near_miss_failure`,
  `test_every_failure_type_the_evaluator_writes_exists_in_the_sql_enum`.
- Chưa có API / màn cho thành viên project và thông báo (TD-30).
- Nhóm cần sửa UC-17, UC-19, UC-65, UC-72, UC-74 trong Final Report và bỏ UC-11 khỏi UC List.
