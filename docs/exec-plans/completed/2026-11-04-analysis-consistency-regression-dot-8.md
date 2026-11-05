# Đợt 8 — UI Consistency và Regression Testing

Ngày 04/11/2026, nhánh chuvv; working tree sạch trước khi bắt đầu.
Chỉ Đợt 8; không stage/commit/push/merge/reset/clean. Dừng sau bàn giao.

## Kế hoạch

- [x] Đọc AGENTS/CLAUDE, hướng dẫn package, Next.js local accessibility/navigation/CSS.
- [x] Rà module Analysis, khung trang, sidebar, table/pager và browser regression Đợt 1–7.
- [x] Chuẩn hóa focus/disabled/loading, table region/pager dùng chung; dọn selector không còn consumer.
- [x] Responsive tới màn hẹp, giữ navigation đầy đủ, giới hạn thay đổi shell cho Analysis.
- [x] Guard URL run ID, chuẩn hóa lỗi theo run và navigation quay lại; không đổi nghiệp vụ/metrics.
- [x] Lint/types/build; browser hồi quy 1–8/keyboard/mobile/ảnh; checks Analysis và tài liệu phù hợp.
- [x] Ghi bằng chứng và giới hạn, chuyển completed, dừng để người dùng commit.

## Audit

Sidebar mặc định width 248px và luôn display:flex ngoài admin, làm hẹp nội dung Analysis trên mobile.
Các bảng run/failure/draft đã có region focusable nhưng lặp markup; snapshot chưa có region/tabIndex.
Hai pager draft có cùng nhãn size, chưa có navigation landmark phân biệt theo tập.
CSS Analysis có selector giao diện cũ không còn consumer trong frontend/src.
Detail/playback gọi API bằng Number(runId) không guard NaN/Infinity/ID không dương.
Detail giữ actionError chuỗi không gắn ID, khác playback đã scope theo run.
Nguồn số đo/backend/core, schema/API, dataset/handoff và playback engine phải giữ nguyên.

## Giới hạn ban đầu

Không có thiết kế Figma/phiên đăng nhập thật trong tác vụ; browser fixture kiểm UI, không thay
production bằng mock. Không đọc cấu hình/tài khoản cá nhân. Xác minh live nếu có môi trường phù hợp,
nếu không ghi rõ giới hạn. Không sửa thuật toán tối ưu hoặc ngưỡng regression.


## Kết quả triển khai

- `AnalysisTableRegion` dùng chung cho run/failure/draft/snapshot: region có tên, nhận focus và
  cuộn ngang bằng bàn phím; giữ class CSS module của từng bảng. Các utility overflow/max-width/min-width
  nằm ngay trong component nên AEB mở trực tiếp không phụ thuộc đã tải CSS Analysis.
- `AnalysisPager` có navigation landmark; hai tập có tên phân trang riêng. Giữ API props cũ,
  thêm label tùy chọn và disabled size khi loading. Snapshot giữ phân trang 20 dòng hiện có,
  thêm landmark; không đổi dữ liệu hoặc cách tổng hợp objective dùng chung với Overview/AEB.
- Đồng bộ focus-visible, focus inset cho tab/nav/summary/region, disabled và spinner reduced-motion.
  Chỉ giảm chuyển động trang trí, không đổi clock/seek/rate hoặc marker của playback.
- Dọn selector CSS cũ không còn consumer trong frontend/src (kpis/columns/check/chart-row/chain,
  layout detail cũ); giữ breakpoint bộ lọc hiện hành. Không xóa component/chức năng còn dùng.
- Analysis có menu mobile native details, Enter/Space mở, Escape đóng và đưa focus về summary,
  chọn link thì đóng. Desktop vẫn dùng sidebar cũ; cùng `VehicSimSidebar` giữ role/menu/profile/logout.
  Shell chỉ bật nhánh này cho /analysis/failures và route con, không áp dụng /analysis/carla hay AEB.
  Sidebar thêm aria-label cho logout và ẩn chevron trang trí khỏi tên truy cập.
- Bảng bỏ ghim cột ở màn dưới 768px để không che ô đang focus; bảng vẫn cuộn ngang bên trong.
  Breadcrumb/chip/nút xuống dòng ở màn hẹp. Khung `VehicSimPage` chỉ thêm hai class marker ổn định;
  CSS thay đổi tiêu đề/thao tác được scope dưới Analysis, không đổi bố cục ngoài module.
- Guard run ID nguyên dương an toàn ở detail và playback: ID lỗi có thông báo/tiêu đề rõ,
  không gọi API bằng NaN/Infinity/số không hợp lệ. Link returnTo vẫn chỉ nhận đường Analysis hợp lệ.
  ActionError detail gắn run ID như playback, không lộ thông báo thao tác của run trước khi đổi run.
- `analysisRouteTitles` là helper URL/tiêu đề thuần, dùng cùng định dạng #0001 của runCode.
  Dùng generateMetadata server ở trang danh sách và hai layout mỏng detail/playback, await params/
  searchParams theo Next.js local 16.4.1. Không dùng mutation document.title ở client.
  Đổi view trong dashboard qua router.replace; các filter/search/page vẫn dùng History API.
  Trang danh sách chuyển từ prerender tĩnh sang route động để metadata đúng view; server chỉ đọc URL,
  không gọi backend hoặc đọc dữ liệu/tài khoản. Auth/data API vẫn ở các component client như trước.
- Kiểm tra navigation giữa các mode, browser Back, detail/playback/list, frozen snapshot/AEB;
  giữ filter/page/search/returnTo và lựa chọn dataset. Không tự tạo optimization/candidate/regression.

## Files bàn giao

Modified:

- `frontend/src/app/analysis/failures/analysis.css`
- `frontend/src/app/analysis/failures/page.tsx`
- `frontend/src/app/analysis/failures/[runId]/page.tsx`
- `frontend/src/app/analysis/failures/[runId]/playback/page.tsx`
- `frontend/src/components/analysisUi.tsx`
- `frontend/src/components/AnalysisSelectionSummary.tsx`
- `frontend/src/components/BaselineAnalysisDashboard.tsx`
- `frontend/src/components/VehicSimPage.tsx`
- `frontend/src/components/VehicSimShell.tsx`
- `frontend/src/components/VehicSimSidebar.tsx`
- `frontend/src/components/analysis/AnalysisDatasetPreparation.tsx`
- `frontend/src/components/analysis/AnalysisFailureExplorer.tsx`
- `frontend/src/components/analysis/AnalysisRunExplorer.tsx`
- `frontend/tests/analysis-redesign.mjs`

Added:

- `frontend/src/app/analysis/failures/[runId]/layout.tsx`
- `frontend/src/app/analysis/failures/[runId]/playback/layout.tsx`
- `frontend/src/components/analysis/analysisRouteTitles.ts`
- Biên bản completed này.

Không deleted file tracked, không thêm dependency. Không sửa services/types API, backend, schema,
migration, worker/core, ngưỡng/chấm điểm, thuật toán tối ưu, dataset contract hoặc playback engine.

## Kiểm chứng thực tế

| Lệnh / việc | Kết quả |
| --- | --- |
| `npm.cmd run lint` (frontend) | PASS; kiểm lại sau chỉnh test cuối |
| `npx.cmd tsc --noEmit` (frontend) | PASS; build cuối cũng kiểm TypeScript PASS |
| `npm.cmd run build` (frontend) | PASS production Next.js 16.4.1, gồm metadata server/layout mới |
| `node --check frontend/tests/analysis-redesign.mjs` | PASS; script cuối được thực thi thành công |
| `.\mvnw.cmd -B "-Dtest=AnalysisServiceTest,AnalysisDatasetTest,AnalysisSnapshotTest,RepoDocsTest" test` | PASS 28/28 |
| `npm.cmd run start -- --hostname 127.0.0.1 --port 3100` | Chạy app production thành công; đã dừng sau kiểm chứng |
| `node tests/analysis-redesign.mjs` (frontend) | PASS toàn bộ Đợt 1–8 trên mã cuối |
| `git diff --check` | PASS |

Ma trận 8 màn: overview, runs, failures, dataset, run summary, telemetry, evidence và playback;
5 viewport: 1920×1080, 1366×768, 1024×768, 768×1024, 390×844. Có 40 ảnh ma trận,
ảnh menu mobile mở và các ảnh hồi quy cũ tại data/analysis-batch8-ui (gitignored).
`result.json`: PASS, BROWSER_FIXTURE_ONLY; liveBackendVerified/figmaVerified=false.
Đã xem ảnh summary/playback 390px, dataset 768px và ảnh chẩn đoán lỗi trước sửa;
assert không tràn ngang toàn trang PASS cả ma trận. Bảng rộng/tab vẫn cuộn bên trong.

Kiểm tra mới: control có nhãn và không trùng ID trong workspace; h1 duy nhất; aria-current;
menu Enter/Space/Escape/link đóng; logout tên rõ; focus/ArrowRight vùng cuộn snapshot;
landmark phân trang riêng; browser Back và chuỗi list/detail/playback/returnTo;
12 URL detail/playback ID lỗi không gọi API run, returnTo ngoài ứng dụng về fallback;
error download thuộc run nguồn, đổi run không giữ lỗi cũ; reduced-motion spinner;
không rò override shell sang AEB, bảng snapshot hoạt động khi mở AEB trong tab mới.
Tổng writes fixture vẫn đúng 3 POST selections của các ca chốt tập trước; không có write
optimization/candidate/regression. Java analysis contract tests và các ca Đợt 1–7 được giữ.

## Các lỗi tìm thấy và cách xác minh

- Lượt ma trận đầu bắt tràn summary ở 390px. Chẩn đoán DOM/ảnh chỉ ra selector :has cũ không
  khớp cấu trúc heading/action thực, ép tiêu đề quá hẹp. Thay bằng marker class; chạy lại ma trận PASS.
- Keyboard menu phát hiện tên link có chevron trang trí. Thêm aria-hidden cho chevron; kiểm lại PASS.
- Rà component tìm dependency ngầm của vùng cuộn snapshot vào CSS Analysis; thêm utility ngay tại
  wrapper, kiểm tab AEB mới (không tải Analysis stylesheet trước) có overflowX auto PASS.
- Client document.title có race với metadata mặc định của Next khi chuyển trang. Bỏ giải pháp client,
  dùng Metadata API server và kiểm tiêu đề sau navigation + khi rời Analysis sang AEB; PASS.
- Assertion download ban đầu mong JSON detail, trong khi apiBlob hiện dùng HTTP status. Test sửa
  sang API 503, không đổi API client để làm xanh. Khi kiểm lỗi cũ sau đổi run, test chờ cả heading
  và dữ liệu run mới, không chỉ URL. Chẩn đoán xác nhận workspace không có alert cũ; alert còn lại
  là __next-route-announcer__ hợp lệ của Next. Scope các assertion lỗi vào workspace để kiểm lỗi
  ứng dụng riêng với thông báo trợ năng, không tắt route announcer. Full regression sau sửa PASS.

## Giới hạn và điểm dừng

Browser dùng fixture API/token/user, không xác minh auth/backend/DB/CARLA thật hoặc đối chiếu Figma.
Chỉ kiểm DOM labels/IDs, keyboard/focus và responsive; chưa kiểm trình đọc màn hình/thiết bị thật hoặc
đánh giá WCAG toàn diện. Không thêm mock production, không đụng .env hoặc cấu hình/dữ liệu cá nhân.
Không chạy toàn bộ Java/worker suite vì chỉ sửa UI; nhóm Analysis hiện có đã chạy 28/28.
Màn AEB vẫn có giới hạn hiện hành: MOBO chưa lọc theo hai tập; đợt này không đổi thuật toán/phạm vi đó.

Nhánh chuvv; working tree sạch trước Đợt 8. Bàn giao 14 modified + 4 added, không deleted.
Không stage/commit/push/merge/reset/clean. Commit gợi ý:
`refactor(analysis): unify accessible navigation and responsive UI`.
Đã đến cuối kế hoạch 8 đợt; dừng để người dùng kiểm tra và tự commit, không mở đợt mới.
