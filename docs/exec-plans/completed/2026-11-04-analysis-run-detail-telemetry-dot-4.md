# Đợt 4 — Run Detail và Telemetry

Ngày 04/11/2026. Nhánh `chuvv`; working tree sạch khi bắt đầu.
Chỉ làm Đợt 4; không git add/commit/push/merge/reset/clean, dừng trước Đợt 5.

## Phạm vi và kế hoạch

- [x] Đọc hướng dẫn repo/frontend, Next.js local, source API và RecordedTelemetry.
- [x] Tách UI chi tiết: danh tính run/nguồn, chỉ số chính, cấu hình/môi trường, cảnh đã ghi.
- [x] Ba tab có ngữ nghĩa truy cập, giữ URL returnTo/section/t/signal và không fetch lại khi xem tín hiệu.
- [x] Telemetry: số đo tại khung đã ghi, đường ngắt tại dữ liệu thiếu, trục/đơn vị đúng nguồn.
- [x] Giữ nguyên backend/scoring/schema/API, scene renderer, engine playback và evidence theo luật.
- [x] Lint, TypeScript, build, RepoDocsTest, browser fixtures, ảnh và ghi giới hạn kiểm chứng.
- [x] Chuyển completed, bàn giao một đợt rồi dừng.

## Audit nguồn và điểm nối

`AnalysisService.inspection` trả run cùng detail chỉ khi COMPLETED. `AnalysisViewService.failureDetail`
đọc scalar DB, frames/events/metrics đã lưu; tốc độ km/h là backend chuyển đơn vị.
`RecordedTelemetry.project` dẫn xuất jerk bằng sai phân, khoảng cách tới vạch và motion_state ở backend;
không phải tất cả tín hiệu trực tiếp từ sensor CARLA. UI chỉ chiếu/định dạng/chọn timestamp.
`TelemetryChart` chỉ được render ở detail; `MotionTelemetryChart` dùng chung với playback, nên mọi
điều khiển mới cho detail phải tùy chọn, giữ cách dùng mặc định của playback.

## Giới hạn

Chưa có phiên backend/auth/DB/CARLA thật hoặc thiết kế Figma được cung cấp. Browser fixture
chỉ kiểm UI/tiêu thụ API, không thêm mock vào production và không thay thế tích hợp thật.

## Kết quả triển khai

- Trang chi tiết giữ vai trò fetch/navigation/action; tách Summary, Telemetry/Timeline và Evidence
  vào thư mục chức năng, dùng CSS Module riêng. Nội dung evidence, confidence và luật nguyên nhân
  được chuyển nguyên từ trang cũ; chưa redesign Failure/Root Cause của Đợt 6.
- Danh tính run có simulator/dt, baseline, xe và thời điểm; nguồn kết quả đã lưu được ghi rõ.
  Run CARLA có lưu ý quan sát/đối chiếu theo bất biến hiện có. Không đổi nguồn động học thành CARLA.
- Ba chỉ số chính dùng SI: RMS jerk, tốc độ va chạm, quãng phanh; các số đo phụ vẫn được giữ.
  Null/không hữu hạn là —; số 0 giữ 0.00; phiên bản đánh giá theo API, thiếu thì ghi lý do.
- Cấu hình bốn tham số có tên tiếng Việt và thứ tự ổn định; giữ giá trị/đơn vị API và thông số
  được chain nhắc tới. Môi trường không tự suy ra hành vi khi boolean bị thiếu.
- Cảnh dùng frame đã ghi trước/tại cursor; thiếu tọa độ/kích thước thì hiển thị lý do.
  Bỏ fallback vẽ xe ở 0/cuối run khi thiếu điểm hiện tại; annotation vị trí detection/AEB chỉ
  dùng tọa độ path khớp timestamp. Renderer ScenarioMap dùng chung không thay đổi.
- Ba tab có tablist/tab/tabpanel, aria-selected/controls và điều khiển phím trái/phải/Home/End.
  URL giữ section/t/signal/returnTo; thời gian clamp theo khoảng timestamp hợp lệ ở hai mảng API.
  Đổi tab/tín hiệu/thời gian không fetch lại inspection. Link playback giữ thời điểm và returnTo.
- Timeline giữ motion_state từ API, không suy ra từ vận tốc/gia tốc; thiếu trạng thái hiện —.
- Telemetry có số đo tại timestamp thực của từng nguồn riêng; TTC nhận thức không lấy từ GT,
  tín hiệu thiếu không lấy từ khung trước có số. Jerk/khoảng cách dẫn xuất có mô tả nguồn backend.
  Jerk biểu diễn không thay objective RMS jerk đã lưu.
- Biểu đồ TTC/tốc độ có trục riêng theo dữ liệu, giữ giá trị TTC trên 5 s và giá trị có dấu.
  Ngắt đường tại số thiếu/timestamp không hợp lệ hoặc không tăng; vẫn vẽ điểm đơn lẻ.
  Mốc chỉ từ event/metric API. Không tái tạo sự kiện TTC/trễ phanh từ đường biểu diễn.
- MotionTelemetryChart hỗ trợ field có điều khiển tùy chọn cho detail, giữ selector mặc định
  khi playback không truyền props mới. Sửa cách ngắt đường và dùng reduce cho giới hạn trục,
  tránh spread mảng lớn. Không đổi engine playback hoặc route playback.
- Loading/error theo request key: chuyển run/retry ẩn dữ liệu cũ; run chưa có detail có trạng thái
  riêng, không dựng KPI an toàn giả. Giữ actions tải .xosc/chạy CARLA/playback và role hiện có;
  lỗi thao tác tách khỏi lỗi fetch. Không API, business rule, migration hoặc dependency mới.

## Files để commit riêng

Modified:
- `frontend/src/app/analysis/failures/[runId]/page.tsx`
- `frontend/src/components/MotionTelemetryChart.tsx`
- `frontend/src/components/TelemetryChart.tsx`
- `frontend/tests/analysis-redesign.mjs`

Added:
- `frontend/src/components/analysis/AnalysisRunSummary.tsx`
- `frontend/src/components/analysis/AnalysisRunTelemetry.tsx`
- `frontend/src/components/analysis/AnalysisRunEvidence.tsx`
- `frontend/src/components/analysis/AnalysisRunDetail.module.css`
- `frontend/src/components/analysis/analysisRunData.ts`
- `docs/exec-plans/completed/2026-11-04-analysis-run-detail-telemetry-dot-4.md`

Deleted: không có file/route. Bỏ render/helper inline cũ sau khi chuyển sang component chức năng.

## Kiểm chứng đã chạy

- Frontend: `npm.cmd run lint`: PASS.
- Frontend: `npx.cmd tsc --noEmit`: PASS.
- Frontend: `npm.cmd run build`: PASS, production build và các route hoàn tất.
- Gốc repo: `mvnw.cmd -B "-Dtest=RepoDocsTest" test`: PASS, 5 test, không lỗi/bỏ qua.
- Frontend: `node tests/analysis-redesign.mjs`: PASS trên production frontend và Edge headless.
  Bổ sung kiểm tra nguồn/simulator/dt; objective RMS 77.777 giữ 77.78 dù jerk tín hiệu là 500;
  impact 0 giữ 0.00, quãng phanh thiếu giữ —; gia tốc giữ dấu; khoảng cách dùng API 777.7;
  TTC perception thiếu không lấy GT 42 và không lấy số đo cũ của timestamp trước;
  motion_state dùng nguyên API kể cả khi dấu gia tốc khác với nhãn trạng thái.
- Browser kiểm tra tab bằng chuột/bàn phím, chỉ panel chọn được expose; URL t/signal/returnTo
  còn sau reload, không gọi lại inspection khi xem dữ liệu; clamp thời gian; thiếu telemetry/scene;
  đường ngắt tại null/timestamp lùi ở cả hai chart, điểm đơn lẻ và TTC 12/8 không bị cắt ở 5.
  Chuyển run có loading và không hiện số liệu cũ; run RUNNING không có KPI/tab giả;
  evaluation_valid=false không có badge an toàn; 503/403/404 và retry; MANAGER chỉ đọc,
  không được chạy CARLA nhưng vẫn đọc telemetry/tải .xosc. Tổng số mutation vẫn đúng 1 lần
  chốt dataset của bộ test, không có mutation optimizer/candidate/regression ngoài yêu cầu.
- Các checks Đợt 1–3 về Overview, Explorer, lựa chọn dataset, lưu/handoff và playback vẫn PASS.
  Ảnh mới ở 1920×1080, 1366×768, 1024×768; assertions không overflow ngang toàn trang.
  Đã xem ảnh bản cuối Summary 1366 và Telemetry 1024, cùng các ảnh tablet/telemetry trước đó.
- Các lượt browser trung gian có hai lỗi selector cũ: chọn ghi chú ở panel đang ẩn và đếm nhãn
  cấu hình đã Việt hóa như ghi chú trễ tự tính. Đã scope assertions vào panel telemetry đang mở;
  bản cuối chạy đầy đủ PASS. Không thay dữ liệu hay logic chấm điểm để hợp thức hóa test.
- Bằng chứng gitignored: `data/analysis-batch4-ui/result.json` (`BROWSER_FIXTURE_ONLY`) và PNG.
  Số biên và identity CARLA trong test chỉ là fixture của trình duyệt, không phải chạy CARLA thật.
- `git diff --check`: PASS. Diff backend/worker/schema/API client/types/Overview/Explorer,
  ScenarioMap, analysisUi và route playback rỗng. Không có lỗi check còn lại đã phát hiện.

## Giới hạn và điểm dừng

Chưa kiểm chứng backend/auth/DB/CARLA thật, chưa đối chiếu Figma. Token/role/API trong browser test
là fixture riêng, không thay thế đăng nhập/tích hợp thật. Không có dữ liệu giả trong production.
Các hành động thực thi chạy CARLA/tải artifact chưa được kiểm với backend thật trong đợt này.

Nhánh `chuvv`; working tree sạch lúc bắt đầu, cuối đợt chỉ 4 modified + 6 added kể trên.
Không git add/commit/push/merge/reset/clean. Frontend tạm cổng 3100 đã được dừng sau kiểm thử.
Đợt 4 hoàn thành ở phạm vi source và browser fixture. Commit gợi ý:
`refactor(analysis): redesign run detail and recorded telemetry views`.

Dừng để người dùng kiểm tra và tự commit. Đợt 5 — Playback chưa bắt đầu.
