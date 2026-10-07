# ADR-035 — 5 role hệ thống, mỗi người một role; bỏ cấu hình xe để so sánh và Meomeo Agent

**Trạng thái:** Proposed 06/10/2026 (TrungDQ, nhánh `trungdam`; DB + phân quyền API đã làm, lọc theo workspace chưa — TD-30)
**Phạm vi:** FE-01, FE-02, FE-04, FE-05, FE-14. **Thay** ADR-034 (role theo workspace), ADR-033 (cấu hình xe để
so sánh), ADR-028 và ADR-029 (Meomeo Agent).

## Bối cảnh

Ngày 06/10 nhóm chốt tài liệu nghiệp vụ + database mới (Google Doc "database", 3 tab: SQL 25 bảng, nghiệp vụ,
giải thích bảng) và context diagram. TrungDQ trả lời các điểm còn mở:

- **5 role hệ thống:** ADMIN, MANAGER, ENGINEER, REVIEWER, EXPERIENCER — không còn role theo workspace.
- **Mỗi người đúng một role.**
- **Manager thêm người vào workspace** (không có luồng "xin vào project").
- **EXP** (người tự đăng ký): project cá nhân, mô phỏng, optimization **và** regression, nhưng **không** có
  Engineering Recommendation và **không** Approve / Reject.
- **Bỏ cấu hình xe để so sánh** (một project chỉ một xe, không biến thể xe).
- **Bỏ chatbot Meomeo Agent.**

Bản SQL 25 bảng của nhóm có nhiều lỗ nghiệp vụ mà DB repo (36 bảng) đã xử lý — regression chỉ trên một
scenario, hai chỗ duyệt, recommendation không cần regression, không ép một baseline, không ép cùng project,
không biểu diễn được họ kịch bản, không bắt được phanh oan. Bản review đầy đủ ở exec plan bên dưới.

## Lựa chọn

1. Thay DB repo bằng bản 25 bảng rồi vá — loại: phải viết lại toàn bộ service/test và vá lại đúng những lỗ
   DB hiện tại đã đóng.
2. **Giữ DB repo, migration 004 áp các quyết định mới** — chọn.

## Quyết định

| Role | Ai cấp | Được làm |
|---|---|---|
| `ADMIN` | script trên máy chủ | Quản trị hệ thống, cấp / đổi role người dùng |
| `MANAGER` | Admin | Tạo workspace, thêm / bớt ENGINEER và REVIEWER; chỉ đọc phần kỹ thuật, không duyệt |
| `ENGINEER` | Admin | Toàn bộ quy trình kỹ thuật: scenario, mô phỏng, candidate, optimization, regression |
| `REVIEWER` | Admin | Xem kết quả, **Accept / Reject / yêu cầu kiểm thêm** recommendation; không chạy mô phỏng |
| `EXPERIENCE` (Experiencer) | tự đăng ký | Project cá nhân: scenario, mô phỏng, optimization, regression; không recommendation, không duyệt |

Mã role giữ là `EXPERIENCE` (đã có trên DB và code từ ADR-034); tên hiển thị là "Experiencer".

DB (migration 004, 36 → 32 bảng):

- `users.role_id` (NOT NULL, FK `roles`) thay bảng `user_roles`; tài khoản cũ giữ role cao nhất đang có.
  Thêm `gender`, `date_of_birth`, `bio` (hồ sơ theo tài liệu nghiệp vụ §18).
- `roles` seed 5 role. `workspace_members` bỏ `member_role` — vai trò lấy từ `users.role_id`.
- Xoá `user_roles`, `vehicle_configurations`, `vehicle_comparisons`, `knowledge_chunks`; `simulation_runs` bỏ
  `vehicle_configuration_id`, `vehicle_comparison_id` và purpose `VEHICLE_COMPARISON`.
- Giữ việc runner CARLA ép blueprint / khối lượng / hệ số cản của **xe chính** vào CARLA (phần không phụ
  thuộc cấu hình phụ của ADR-033).

API (có hiệu lực ngay): ghi (tạo họ, chạy, candidate, regression) cần ENGINEER / EXPERIENCE / ADMIN;
quyết định recommendation chỉ REVIEWER — người làm không bao giờ tự duyệt việc mình.

## Hệ quả

- "Không bao giờ tự Accept" giờ được ép bằng role: Engineer / EXP tạo regression, chỉ Reviewer quyết định.
  Trên project cá nhân của EXP không ai quyết định, nên candidate ở đó mãi là CANDIDATE — đúng chủ ý.
- Luật phải ép ở API khi làm TD-30 (DB không ép được vì phụ thuộc role): chỉ thêm người mang ENGINEER /
  REVIEWER vào workspace; project thuộc workspace chỉ thành viên thấy; project cá nhân chỉ người tạo thấy;
  EXP không tạo được workspace.
- Mất Meomeo Agent: không còn lời gọi LLM nào ngoài bước "Sinh từ mô tả"; bỏ embedding.
- Mất cấu hình xe để so sánh: muốn thử thông số xe khác thì sửa dòng `vehicles` (run cũ vẫn truy vết được
  qua `run_config` + `carla_version`, nhưng không giữ bản chụp thông số xe — ghi ở TD-31).

## Kiểm chứng (06/10)

[Exec plan](../exec-plans/completed/2026-10-06-nam-role-he-thong.md).
