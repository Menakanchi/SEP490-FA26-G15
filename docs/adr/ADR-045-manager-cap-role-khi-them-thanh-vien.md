# ADR-045 — Manager / Admin cấp role ENGINEER / REVIEWER khi thêm tài khoản tự đăng ký vào workspace

**Trạng thái:** Proposed 23/10/2026
**Phạm vi:** M4 / M5 (`WorkspaceService`, màn `/workspace/[id]`), `workspace_members` (migration 010). Thay phần "Ai cấp" của ENGINEER /
REVIEWER trong ADR-035 và luật "chỉ thêm người mang ENGINEER / REVIEWER vào workspace" ở mục Hệ quả của ADR-035.

## Bối cảnh

ADR-035: mỗi người một role hệ thống (`users.role_id`); ENGINEER / REVIEWER do Admin cấp; Manager chỉ thêm người **đã** mang hai role
đó. Nhưng app mở đăng ký công khai và mọi tài khoản tự đăng ký đều là EXPERIENCER, mà chưa có màn Admin đổi role (TD-28) — nên muốn đưa
một người mới vào workspace phải nhờ Admin chạy `scripts/create_admin.py --role …` trước. Người dùng (23/10/2026) chốt: khi thêm thành
viên, Manager / Admin chọn luôn role cho người đó.

## Các lựa chọn

1. Giữ ADR-035, làm màn Admin đổi role (TD-28) — Manager vẫn phải chờ Admin cho từng người.
2. Role theo workspace (cột role ở `workspace_members`, quyền tính theo workspace) — quay lại ADR-034, phải viết lại mọi chỗ kiểm quyền
   theo `users.role_id`; app còn chạy trên một project (TD-30).
3. **Thêm người = cấp role hệ thống** — chọn.

## Quyết định

- **Ai thêm được:** chỉ tài khoản **EXPERIENCER** đang hoạt động, chưa ở workspace. ENGINEER / REVIEWER sẵn có (Admin cấp) không
  thêm qua màn này nữa; người đã được nâng role ở một workspace cũng không thêm được vào workspace thứ hai.
- **Role cấp:** Manager / Admin bắt buộc chọn ENGINEER hoặc REVIEWER; service đổi `users.role_id` và ghi role đã cấp vào
  `workspace_members.granted_role` trong cùng transaction. Role đọc lại từ DB mỗi request nên API có hiệu lực ngay; frontend của người
  đó cần đăng nhập lại để thấy menu mới (thông báo `MEMBER_ADDED` nói rõ).
- **Khi bớt:** nếu `granted_role` khác NULL, người đó không còn ở workspace nào, và role hiện tại vẫn đúng là role đã cấp, thì trả về
  EXPERIENCER. Role có từ trước (`granted_role` NULL, mọi dòng trước migration 010) và role Admin đã đổi sau đó thì giữ nguyên.
- Project cá nhân của người được nâng role không đổi.

## Hệ quả

- Manager có quyền nâng role hệ thống, nhưng chỉ từ EXPERIENCER lên ENGINEER / REVIEWER và chỉ kèm việc thêm vào workspace mình quản lý;
  không tạo được ADMIN / MANAGER, không hạ role người do Admin cấp.
- Một người chỉ thuộc tối đa một workspace qua đường này. Cần một người ở nhiều workspace thì phải có ADR khác (vd. cho thêm ENGINEER /
  REVIEWER sẵn có, giữ nguyên role).
- Tài khoản dev / seed mang ENGINEER / REVIEWER từ trước không còn xuất hiện ở ô tìm thành viên; muốn thử dùng tài khoản EXPERIENCER.
- `RemoveMemberResult` thêm `role_reverted`; thông báo rời workspace ghi rõ khi tài khoản trở về Experiencer.
