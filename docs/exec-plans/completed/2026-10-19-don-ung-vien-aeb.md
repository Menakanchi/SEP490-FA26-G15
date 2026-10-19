# 19/10/2026 — Dọn ứng viên AEB local

Người dùng yêu cầu xóa tiếp dữ liệu ứng viên AEB sau khi đã xóa kịch bản.
Phạm vi: 6 version mang trạng thái CANDIDATE và các dòng tham số của chúng trong MySQL `vehicsim`.
Giữ nguyên bản BASELINE v1.0, danh mục 4 tham số, tài khoản và mọi dữ liệu khác.

1. Dừng backend để không tạo thêm ứng viên trong lúc dọn.
2. Sao lưu DB vào `data/backups/` (gitignore), kiểm toàn vẹn bản sao lưu.
3. Xóa ứng viên trong transaction có kiểm khóa ngoại, xác minh baseline/tham số và checksum các bảng khác trước COMMIT.
4. Khởi động lại backend, kiểm health và số ứng viên còn lại bằng 0.

Đã hoàn thành transaction ngày 19/10/2026 trên container `sep490-fa26-g15-mysql-1`, DB `vehicsim`:

- Xóa 6 ứng viên (ID 2–7, trạng thái CANDIDATE) và 24 dòng `aeb_parameter_values` qua CASCADE.
- Giữ nguyên version ID 1, BASELINE v1.0 và 4 giá trị tham số; đối chiếu dữ liệu trước/sau bằng truy vấn đầy đủ.
- 27 bảng khác có checksum không đổi. Không tắt kiểm khóa ngoại, không reset schema hay bộ đếm ID.
- Sao lưu toàn DB vào `data/backups/aeb-candidate-cleanup-20261019-005428/vehicsim-before-aeb-cleanup.sql.gz`
  (gitignore); đã kiểm giải nén khớp byte, đủ 29 bảng và footer mysqldump. SHA-256:
  `6ace2fa7eb49e517cb426c2b0e290486b173480a591645c5f04eda9820417f8d`.
- `manifest.json` và `cleanup.sql` trong cùng thư mục ghi ID đã xóa, số dòng và trạng thái `COMMITTED_AND_VERIFIED`.
- Khởi động lại backend bằng `scripts/dev-carla.ps1` để tiếp tục thử trên web.
