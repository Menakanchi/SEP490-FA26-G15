# Phần 3: dữ liệu phân tích và tập baseline bất biến

Trạng thái: hoàn thành đợt 1; phần tiếp nối đã hoàn thành theo hợp đồng legacy trong kế hoạch hoàn thiện phần 3 cùng ngày. Kế thừa thay đổi chưa commit ở màn phân tích, API dataset và AEB.
Phạm vi: lưu tập baseline bằng analysis_results/BASELINE_DATASET; hiển thị motion telemetry đã lưu.
Không thay AEB, simulator, công thức objective, physics hoặc dữ liệu run cũ.

## Thiết kế
- Schema 29 bảng giữ nguyên; migration 009 mở rộng enum analysis_type, đồng bộ entity và từ điển DB.
- GET /analysis/dataset?scenario_id=... là preview có token SHA-256; nhóm xe/simulator chọn xác định.
- POST /analysis/datasets nhận scenario_id và preview_token, kiểm lại dữ liệu trong transaction;
  chặn preview cũ; role ghi và quota áp dụng như các thao tác ghi khác.
- GET /analysis/datasets/{id} chỉ đọc snapshot cùng project, có baseline_current.
- Lưu toàn họ, giữ ca an toàn và NOT_RUN; không biến run thiếu thành PASS.
- UI chuyển dataset_id sang AEB. ID cũ giữ nguyên run/seed khi baseline/run mới xuất hiện.
- Biểu đồ bổ sung đọc vị trí/vận tốc/gia tốc GT và TTC perceived/GT từ artifact đã lưu.
  Không gọi dữ liệu tổng hợp trên GT là perception sensor thật.

## Kiểm chứng
- Java: snapshot bất biến, preview cũ, project khác, quyền/quota, telemetry thiếu.
- Frontend: lint, typecheck, build; chạy app và kiểm luồng nếu có backend đăng nhập.
- UI phải ghi giới hạn nếu chưa truy cập được Figma hoặc chưa có môi trường runtime.
- Migration chưa tự áp vào DB người dùng; không xóa/ghi đè dữ liệu.

## Còn lại của phần 3
- Hợp đồng phiên bản mới cho gia tốc/pha phanh/Butterworth/impact tương đối: viết ADR Proposed,
  chốt với phần 2/4/5 trước khi đổi kết quả; hiện giữ AS_STORED.
- Chọn/tách tập tối ưu và xác minh độc lập, hỗ trợ nhiều seed và lựa chọn xe/simulator rõ ràng.
- Phụ thuộc sensor perception/physics/stops_at_curb từ phần 1/2; không chứng nhận an toàn.

Tập baseline chỉ lấy scenario_versions.source = GENERATED; bản gốc chứa không gian tham số không phải ca chạy (TD-43). UI cho chọn cả họ không có lỗi.

## Bằng chứng ngày 22/10/2026
- Backend: mvnw.cmd -B clean test qua: 233 test, 0 lỗi, 1 bỏ qua parity mở rộng.
  Sau khi thêm ca near-miss và lọc GENERATED, nhóm AnalysisDatasetTest/AnalysisSnapshotTest/
  VehicSimSecurityTest/RepoDocsTest qua 19 test.
- Frontend: npm.cmd run lint sạch; npx.cmd tsc --noEmit qua; npm.cmd run build qua.
- npm.cmd audit --omit=dev --audit-level=high: 0 lỗ hổng production.
- UI: node tests/analysis-ui-smoke.mjs qua trên Edge headless/Playwright 1.64.1:
  đăng nhập fixture, chọn họ không có lỗi, preview, lỗi preview cũ dịch tiếng Việt,
  chuyển dataset_id, tải lại snapshot baseline cũ, biểu đồ gia tốc và TTC nhận thức thiếu.
- Đã xem ảnh preview và motion ở data/ui-analysis-smoke/ (gitignored);
  thêm ảnh baseline cũ 02-saved-stale.png. Đây là dữ liệu fixture, không phải CARLA thật.
- Dừng frontend tạm sau kiểm tra. Không sửa package.json/package-lock.json.
- Chưa có .env backend/tài khoản kiểm thử cho phiên này; chưa chạy tích hợp DB/CARLA thật.
  Không truy cập được Figma qua công cụ hiện có, chưa đối chiếu thiết kế.
- Migration 009 chỉ được chuẩn bị trong repo, chưa áp vào DB đang có trên máy.
  Không hoàn tất toàn bộ nhiệm vụ người 3: còn các mục phía trên và TD-49.

## Tiếp nối cùng ngày
Phần snapshot v2/chia tập và hợp đồng tổng hợp legacy đã được triển khai trong kế hoạch hoàn thiện phần 3.
Bằng chứng DB thật ở môi trường riêng và UI thật ghi trong kế hoạch hoàn thiện; phần kiểm chứng fixture phía trên là lịch sử đợt đầu.
