# Redesign giao diện phân tích — Người 3

Trạng thái: đã triển khai frontend; còn kiểm chứng tích hợp runtime thật và Figma.
Audit và bảng đối chiếu chi tiết ở [báo cáo](../../vehicsim/audit-redesign-analysis-2026-11-03.md).

## Phạm vi

Working tree sạch trước khi sửa. Giữ route, API, schema, công thức và mutation semantics.
Thay đổi chỉ thuộc UI Analysis, component hiển thị snapshot dùng chung, API client page_size
và nhãn sidebar. Không chỉnh backend/worker hoặc dữ liệu cá nhân.

## Tiến độ

- [x] Khảo sát cấu trúc, tài liệu và dependency/data flow Người 3.
- [x] Chốt information architecture Tổng quan / Lượt chạy / Ca lỗi / Tập bàn giao.
- [x] Triển khai bảng, phân trang, URL state, draft theo phiên, chi tiết và playback.
- [x] Thêm browser test với parity fixture, giữ mock trong test.
- [x] Ghi kết quả kiểm tra cuối cùng bên dưới.
- [ ] Chạy smoke với backend/DB thật khi có môi trường phù hợp.
- [ ] Đối chiếu thiết kế Figma khi có quyền truy cập file/node.

## Bằng chứng đã có

- npm.cmd ci hoàn tất. npm.ps1 bị ExecutionPolicy chặn; dùng npm.cmd, không thay policy.
- Lượt build đầu trùng lúc cài Playwright tạm, lỗi thiếu type estree; chạy lại sau cài đặt đã qua.
- Lint, typecheck và production build trước đợt chỉnh cuối đã qua; cần kết quả cuối bên dưới.
- Browser fixture test đã qua: navigation, URL/filter/page/search/sort, returnTo, chọn tập qua trang,
  reload draft/snapshot, payload run_revisions, playback time/play/pause/seek/speed,
  ca lỗi theo họ, loading/empty/error/403, role chỉ đọc và không ghi sang optimizer/candidate/regression.
- Đã xem ảnh overview 1366, dataset/playback tablet để kiểm bố cục. Ảnh chỉ dùng fixture parity.
- Bộ cài test Playwright chỉ trong node_modules, không đổi package.json/package-lock.json.

## Còn thiếu / không được tuyên bố đã kiểm

- Docker Engine chưa hoạt động, không có backend nghe ở 8001/8101. Không chạm cấu hình máy,
  khởi động lại Docker, tạo tài khoản hoặc sửa DB cá nhân để vượt giới hạn.
- Chưa đăng nhập API thật, chưa chốt/handoff dataset qua backend thật; smoke tích hợp cũ chỉ cập nhật
  selector/navigation, chưa chạy lại trong phiên này.
- Chưa có URL/file Figma, không tuyên bố đã đối chiếu.
- Chưa thử CARLA hoặc nghiệm thu toàn hệ thống; không đổi module Người 1/2/4/5.
- Baseline server pagination còn nạp toàn scalar scope; related_runs thiếu identity để bảo đảm so sánh.
  Xem báo cáo audit; không sửa ngoài UI.

## Kết quả cuối

- `npm.cmd run lint`: PASS, không warning/error ở lượt cuối.
- `npx.cmd tsc --noEmit`: PASS; production build cuối cũng hoàn tất bước TypeScript.
- `npm.cmd run build`: PASS trên source cuối; tất cả route, gồm Analysis và AEB, build được.
- `mvnw.cmd -B "-Dtest=AnalysisServiceTest,AnalysisDatasetTest,AnalysisSnapshotTest,AnalysisMetricsTest,RepoDocsTest" test`:
  PASS, 33 test, 0 failure/error/skip; không cần DB/CARLA/provider.
- `mvnw.cmd -B "-Dtest=RepoDocsTest" test` sau khi thêm báo cáo/tech debt: PASS, 5 test.
- `node tests/analysis-redesign.mjs`: PASS trên production frontend và Edge headless.
  Dữ liệu từ parity fixture, API interception chỉ trong test, không phải backend/DB thật.
  Kiểm thêm trang /aeb nhận đúng dataset_id và hiển thị shared summary, không tự tạo candidate/trial/regression.
- Ảnh overview/explorer: 1920×1080, 1366×768, 1024×768; detail từng phần, dataset,
  playback và failure list ở tablet; ảnh loading/empty/error/forbidden.
  Assertions không có overflow ngang ở overview/explorer/chi tiết/playback được kiểm.
- Đã xem ảnh overview/explorer 1366 và detail evidence/tablet, dataset/playback tablet.
  Qua ảnh phát hiện dấu missing bị lỗi encoding và số evidence quá dài: đã sửa và chạy lại build/browser.
  Test hiện kiểm metric thiếu hiển thị dấu —, giữ nguyên số 0 khi là số đo.
- `git diff --check`: PASS. Không đổi package.json/package-lock.json, schema, Java hoặc worker.
- Bằng chứng: `data/analysis-redesign-ui/result.json` và PNG (gitignored, chỉ fixture).
- Frontend tạm được dừng sau kiểm thử; chưa tạo commit.

Giữ kế hoạch **active**: phần runtime backend/DB thật, login thật, CARLA và Figma chưa nghiệm thu.
Không dùng kết quả fixture để xác nhận toàn bộ hệ thống vận hành.
