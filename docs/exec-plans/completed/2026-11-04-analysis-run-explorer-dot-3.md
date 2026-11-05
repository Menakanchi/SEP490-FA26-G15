# Đợt 3 — Run Explorer

Ngày: 04/11/2026. Nhánh: `chuvv`; working tree sạch khi bắt đầu.

## Phạm vi

Chỉ frontend Analysis: bảng lượt chạy, bộ lọc hiện hành, tìm/sắp xếp trong trang,
phân trang máy chủ, thao tác chi tiết/playback và URL quay lại. Một đợt rồi dừng;
không commit/push. Không thay API, backend, worker, schema hoặc công thức chỉ số.

## Kế hoạch và nghiệm thu

- [x] Đọc hướng dẫn repo/frontend, Next.js local và hợp đồng AnalysisRun/API.
- [x] Tách Run Explorer và CSS Module; phân cấp dữ liệu, nguồn, trạng thái, chỉ số, thao tác.
- [x] Giữ lọc toàn danh sách; hiện chip bỏ từng bộ lọc. Tìm/sắp xếp chỉ trong trang,
      số thiếu ở cuối khi sắp xếp chỉ số; không tính lại metrics.
- [x] Giữ query, page size, page, lựa chọn khi đi chi tiết/playback rồi quay lại.
- [x] Lint, TypeScript, production build, RepoDocsTest, browser fixtures và ảnh ba kích thước.
- [x] Ghi kết quả/giới hạn, chuyển completed và dừng trước Đợt 4.

## Giới hạn kiểm chứng

Chưa có phiên backend/auth/DB/CARLA thật hoặc thiết kế Figma được cung cấp.
Browser fixtures chỉ là dữ liệu kiểm thử chặn API trong trình duyệt; không thêm mock vào production.

## Kết quả triển khai

- Tách `AnalysisRunExplorer` và CSS Module; dashboard giữ API/state/draft/mutation hiện có.
- Bảng phân cấp mã run, biến thể/họ/seed, simulator/dt/baseline/xe/điều kiện,
  trạng thái chạy và kết quả AEB có nhãn riêng, ba chỉ số có đơn vị, lựa chọn tập và thao tác.
- Cố định cột run bên trái và thao tác bên phải khi cuộn; vùng bảng có tên và nhận focus,
  tiêu đề cột/caption, link và select có accessible name. Run đã chọn có nền riêng.
- Link Chi tiết/Playback mang nguyên `returnTo`; chưa có telemetry thì không đưa link playback.
  Quy tắc `eligible`, role, revision và lưu draft theo account/project giữ nguyên.
- Chip hiển thị mọi bộ lọc hợp lệ đang áp dụng; bỏ riêng từng chip giữ bộ lọc khác,
  query/sort/page_size và reset page theo cơ chế hiện có.
- Tìm kiếm bỏ khoảng trắng hai đầu, không phân biệt hoa/thường. Có nút xóa, số dòng hiển thị,
  trạng thái không khớp tìm kiếm riêng với không có run khớp bộ lọc.
- Tìm/sắp xếp chỉ trên `items` của trang đã tải; nhãn ghi rõ phạm vi. Không fetch toàn bộ để
  giả lập tìm/sort toàn danh sách, không gửi q/sort ngoài hợp đồng API.
- Sắp xếp theo mã hoặc chỉ số; null/không hữu hạn ở cuối, khi bằng chỉ số dùng mã giảm dần.
  Số 0 giữ 0.00; số thiếu hiện —. Không tính lại metrics hoặc tự phân loại kết quả.
- Dùng pagination máy chủ và last-page clamp hiện có; loading/error không hiện bảng cũ.
  Không đổi pagination dùng chung hoặc thiết kế Overview/Detail/Playback/Dataset.

## Files để commit riêng

Modified:
- `frontend/src/components/BaselineAnalysisDashboard.tsx`
- `frontend/tests/analysis-redesign.mjs`

Added:
- `frontend/src/components/analysis/AnalysisRunExplorer.tsx`
- `frontend/src/components/analysis/AnalysisRunExplorer.module.css`
- `docs/exec-plans/completed/2026-11-04-analysis-run-explorer-dot-3.md`

Deleted: không có file. Không API/migration/dependency mới; không đổi lockfile.
Bỏ block render bảng inline/import không còn dùng sau khi tách; không bỏ chức năng nghiệp vụ.

## Kiểm chứng đã chạy

- Trong frontend: `npm.cmd run lint`: PASS.
- Trong frontend: `npx.cmd tsc --noEmit`: PASS.
- Trong frontend: `npm.cmd run build`: PASS, production build và mọi route hoàn tất.
- Gốc repo: `mvnw.cmd -B "-Dtest=RepoDocsTest" test`: PASS, 5 test, không lỗi/bỏ qua.
- Trong frontend: `node tests/analysis-redesign.mjs`: PASS trên production frontend và Edge headless.
  Bổ sung thứ tự null/0/bằng điểm, tìm trim/reload, không fetch API khi tìm/sort cục bộ,
  thiếu telemetry vô hiệu chọn tập/không có playback link; bỏ filter giữ query và reset page;
  trạng thái không có dữ liệu thay bảng cũ; page=999 được clamp, page size đổi reset page;
  chi tiết/playback/browser Back giữ nguyên URL; chọn tập còn nguyên qua đổi filter.
  Kiểm tra cột cố định và không tràn trang ở 1920×1080, 1366×768, 1024×768.
  Các checks Overview, detail, playback, dataset/handoff, chỉ đọc/lỗi/403 của đợt trước vẫn PASS.
- Browser lần đầu fail do assert URL chạy trước khi Next.js điều hướng xong; đã thêm
  `waitForURL`, chạy lại PASS. Một lệnh sửa test chạy sai thư mục không ghi được file;
  đã sửa đúng đường dẫn. Không thay logic điều hướng ứng dụng để hợp thức hóa test.
- Đã xem PNG bản cuối tại 1366/1024 px; hoàn thiện cột thao tác sau lần xem ảnh đầu.
- Bằng chứng gitignored: `data/analysis-batch3-ui/result.json` (`BROWSER_FIXTURE_ONLY`) và PNG.
  Fixture số biên chỉ ở test; không đưa mock vào production. Chưa kiểm backend/auth/DB/CARLA
  thật hoặc đối chiếu Figma; browser token/role/API đều do test chặn riêng trong trình duyệt.
- `git diff --check`: PASS. Diff backend/worker/schema/API client/types/routes/shared UI,
  shared summary và Overview rỗng. Không có lỗi check còn lại đã phát hiện trong phạm vi này.

## Git và điểm dừng

Nhánh `chuvv`; working tree sạch khi bắt đầu, cuối đợt chỉ 2 modified + 3 added kể trên.
Không git add/commit/push/merge/reset/clean. Frontend tạm cổng 3100 đã dừng sau kiểm thử.
Đợt 3 hoàn thành ở phạm vi source và browser fixture. Commit gợi ý:
`refactor(analysis): redesign run explorer and preserve table state`.

Dừng để người dùng kiểm tra và tự commit. Đợt 4 — Run Detail và Telemetry chưa bắt đầu.
