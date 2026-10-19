# 19/10/2026 — Dọn dữ liệu kịch bản local theo yêu cầu

## Phạm vi

Xóa toàn bộ họ kịch bản, phiên bản/biến thể và kết quả phụ thuộc trong database MySQL `vehicsim` của app local.
Bao gồm lượt chạy, artifact trong DB, va chạm, lỗi/nguyên nhân, regression/khuyến nghị và dữ liệu tối ưu/phân tích liên quan.
Giữ tài khoản, workspace/project, danh mục xe/cảm biến, cấu hình AEB và tri thức kỹ thuật.
Các file artifact trên đĩa và database sao chép dùng kiểm thử không thuộc yêu cầu xóa database đang dùng.

## Thực hiện và điều kiện hoàn thành

1. Đọc schema đang chạy, đếm dữ liệu và xác minh database của backend.
2. Tạm dừng backend, sao lưu MySQL vào `data/backups/` (gitignore), xác minh file/chữ ký.
3. Xóa theo thứ tự khóa ngoại trong transaction; không tắt kiểm khóa ngoại, không reset schema/volume.
4. Kiểm các bảng kịch bản/kết quả đã rỗng và dữ liệu giữ lại không đổi; khởi động lại backend, kiểm health.

## Bằng chứng

Đã commit transaction và kiểm chứng ngày 19/10/2026 trên container `sep490-fa26-g15-mysql-1`, database `vehicsim`.
Backend và các worker con được dừng trước khi sao lưu; tại thời điểm kiểm kê có 75 run PENDING và 1 RUNNING.

| Bảng | Số dòng đã xóa | Còn lại |
|---|---:|---:|
| `scenarios` | 13 | 0 |
| `scenario_versions` | 842 | 0 |
| `simulation_runs` | 1.673 | 0 |
| `simulation_artifacts` | 8 | 0 |
| `collision_events` | 218 | 0 |
| `failures` | 1.019 | 0 |
| `root_causes` | 926 | 0 |
| `regression_tests` | 6 | 0 |
| `regression_test_items` | 481 | 0 |
| `engineering_recommendations` | 6 | 0 |
| `optimization_runs`, `optimization_trials`, `analysis_results` | 0 | 0 |

- Sao lưu toàn DB: `data/backups/scenario-cleanup-20261019-005018/vehicsim-before-cleanup.sql.gz` (gitignore),
  38.412.718 byte SQL trước nén. Đã giải nén đối chiếu byte và kiểm đủ 29 bảng cùng footer mysqldump hoàn tất.
  `manifest.json` cùng thư mục giữ SHA-256, số dòng trước/sau và checksum các bảng giữ lại; `cleanup.sql` giữ thao tác đã chạy.
- Xóa từ lá tới gốc của liên kết `baseline_run_id`/`parent_version_id`; bảng con dùng CASCADE. Tất cả trong một transaction,
  kiểm số dòng và checksum trước COMMIT, kiểm lại sau COMMIT. Không tắt `FOREIGN_KEY_CHECKS`, không sửa CHECK/schema hoặc reset ID.
- 15 bảng giữ lại có cùng `CHECKSUM TABLE ... EXTENDED`, gồm 2 tài khoản, 1 workspace, 1 project, 1 xe, 7 AEB version,
  28 giá trị tham số, 4 tham số và 7 tài liệu kỹ thuật. Thông báo trước/sau đều 0 dòng.
- Đã khởi động lại app bằng `scripts/dev-carla.ps1`; kiểm đếm sau khởi động vẫn 0 họ/biến thể/run/regression.
  Bản sao DB kiểm thử và các file sensor/artifact trên đĩa được giữ theo phạm vi đã nêu.
