# 5 role hệ thống, bỏ cấu hình xe so sánh và Meomeo Agent (06/10/2026)

Quyết định: [ADR-035](../../adr/ADR-035-nam-role-he-thong-bo-cau-hinh-xe-va-meomeo.md). Người chốt: TrungDQ.

## Đầu vào

- Tài liệu database mới của nhóm (Google Doc "database", 3 tab: SQL 25 bảng · nghiệp vụ VehicSim · giải thích
  bảng) và context diagram (draw.io).
- Câu trả lời của TrungDQ: 5 role hệ thống; mỗi người một role; Manager thêm người vào workspace; EXP có
  optimization và regression nhưng không recommendation / approve; bỏ cấu hình xe; gỡ Meomeo Agent.

## Review bản SQL 25 bảng của nhóm (tóm tắt)

Lỗ nghiệp vụ của bản 25 bảng mà DB repo đã xử lý (nên giữ DB repo):

| Bản 25 bảng | DB repo |
|---|---|
| Regression chỉ một `scenario_version_id` — không thấy "sửa A, hỏng B" | Regression trên cả họ, cặp run cùng seed (`fk_sr_baseline_run`) |
| Hai chỗ duyệt (`regression_tests` và `engineering_recommendations`) | Một chỗ: `regression_tests.review_*` |
| Recommendation không cần regression (`ck_er_source`) | Khuyến nghị **là** regression test |
| "Một BASELINE" chỉ là comment | `uq_aeb_versions_one_baseline` (cột sinh + UNIQUE) |
| `projects.workspace_id ON DELETE SET NULL`; project cá nhân trùng tên lọt UNIQUE | RESTRICT; `uq_projects_personal_name` |
| Không ép scenario / xe / AEB của run cùng project | Khoá ngoại ghép theo `project_id` |
| `natural_language_input` NOT NULL, không parent/source ⇒ không có họ kịch bản, nhập tay, import | `scenario_versions.source` + `parent_version_id` |
| Optimization một scenario, một trial một run | Optimization trên cả họ |
| Run không ghi bộ mô phỏng | `carla_version` = danh tính bộ mô phỏng |
| `passed` không bắt phanh oan | `false_activation`, `missed_activation`, `aeb_triggered` |

Ba tab tự mâu thuẫn (mã role, `aeb_system`, `project_member`, cột `optimization_runs`, cách nhóm 10 tham số
AEB, cột `vehicles`) — đã báo nhóm; DB repo theo các quyết định ở ADR-035.

## Đã làm

- **DB:** `01_schema.sql` 36 → 32 bảng; migration `004_2026-10-06_nam-role-he-thong.sql` (`users.role_id`
  thay `user_roles`, thêm `gender` / `date_of_birth` / `bio`, seed 5 role, `workspace_members` bỏ
  `member_role`, xoá `vehicle_configurations`, `vehicle_comparisons`, `knowledge_chunks`, cột cấu hình xe ở
  `simulation_runs`, view truy vết).
- **API:** `WRITE_ROLES = {ADMIN, ENGINEER, EXPERIENCE}`, `DECIDE_ROLES = {REVIEWER}`;
  `users.User.role` (một role); `scripts/create_admin.py --role ADMIN|MANAGER|ENGINEER|REVIEWER` đổi role.
- **Gỡ Meomeo:** `assistant.py`, `agent_tools.py`, `knowledge.py`, `guardrails.py`, route `/assistant/*`,
  embedding trong `llm.py`, `ProjectAssistant.tsx`, `assistantHistory.ts`, ảnh linh vật, test.
- **Gỡ cấu hình xe:** `runs.create_runs` / `spec_for_run` chỉ dùng dòng `vehicles`; vẫn ép blueprint + khối
  lượng + hệ số cản của xe chính vào CARLA (`tests/test_vehicsim/test_vehicle_carla.py`).
- **Frontend:** `Role` thêm `engineer` / `reviewer`; `canWrite` (ADMIN/ENGINEER/EXPERIENCE), `canDecide`
  (REVIEWER) cho màn khuyến nghị và duyệt.
- **Tài liệu:** ADR-035; ADR-028/029/033/034 → Superseded; AGENTS.md (luật cứng 3, bỏ luật 10),
  architecture.md, database-schema.md, tech-debt (bỏ TD-23, TD-29; sửa TD-25, TD-26, TD-28, TD-30; thêm TD-31).

## Kiểm chứng (06/10)

- `pytest tests/`: xanh, kể cả test mới `test_only_reviewer_decides_and_reviewer_cannot_run`
  (Engineer/EXP và Manager nhận 403 khi quyết định; Reviewer nhận 403 khi tạo họ, 200 khi quyết định).
- `ruff check src/ tests/`, `ruff format --check`; frontend `npm run lint`, `npx tsc --noEmit`: sạch.
- MySQL 8.4 (container dev): DB dựng mới từ `01_schema.sql` so với bản sao DB dev + migration 004 qua
  `information_schema` (cột, index, FK, CHECK, bảng, nội dung `roles`): **0 khác biệt**. 32 bảng, 396 cột,
  83 FK, 14 CHECK, 145 index; 1.188 run giữ nguyên; view trả 1.188 dòng. Chạy lại 004 dừng ngay ở dòng đầu.
- 10/10 phép thử ràng buộc trên DB đã migrate: user phải có role, role lạ bị từ chối, role đang dùng không
  xoá được, thêm thành viên không cần `member_role`, không thêm trùng, purpose `VEHICLE_COMPARISON` bị từ chối,
  `user_roles` / `vehicle_configurations` / `knowledge_chunks` không còn.
- DB dev máy TrungDQ đã nâng lên 004 (sao lưu trước đó); 2 tài khoản giữ `ADMIN`, `EXPERIENCE`.

## Còn lại

TD-30 (nhiều project, workspace, ẩn recommendation trên project cá nhân), TD-28 (màn quản lý user/role),
TD-31 (bản chụp thông số xe theo run), TD-26 (mọi máy chạy migration 004).
