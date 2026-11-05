# Đợt 5 — Playback

Ngày 04/11/2026, nhánh `chuvv`, working tree sạch khi bắt đầu.
Chỉ thực hiện Đợt 5; không stage/commit/push/merge/reset/clean, dừng trước Đợt 6.

## Kế hoạch

- [x] Đọc AGENTS/CLAUDE/frontend, Next.js local, hợp đồng Playback và API hiện tại.
- [x] Tách giao diện cảnh/số đo và timeline/nhật ký, dùng CSS Module riêng.
- [x] Một slider native có tên, điều khiển phát/dừng/tốc độ, mốc nhóm không chồng nhãn.
- [x] Đồng bộ cursor/khung/sự kiện/biểu đồ và URL khi dừng; giữ returnTo khi sang detail/run liên quan.
- [x] Giữ RAF clock, frameAt tìm nhị phân và cơ chế đọc frame; không thêm mô phỏng/sensor giả.
- [x] Kiểm dữ liệu thiếu/không hợp lệ, labels trùng, loading/error/retry và UI nhiều kích thước.
- [x] Lint, TypeScript, build, RepoDocsTest, browser regression và ảnh; ghi giới hạn rồi dừng.

## Audit nguồn

`AnalysisViewService.playback` trả frames/events đã lưu, duration từ timestamp cuối và projection
motion_telemetry từ RecordedTelemetry. Không có camera/RGB/LiDAR đồng bộ trong payload này.
Related runs chỉ xác nhận cùng biến thể, không đủ metadata để tự kết luận so sánh cùng seed/xe/source.
Khoảng cách dùng projection API đúng timestamp frame; không lấy crossing_x trừ ego_x tại frontend.
Trạng thái dừng/va chạm chỉ từ event đã ghi; AEB/FCW/detection lấy cờ frame.

## Giới hạn kiểm chứng

Cổng chuẩn backend/DB/CARLA/frontend không có listener khi rà ban đầu. Chưa có phiên đăng nhập
thật hoặc thiết kế Figma để đối chiếu. Browser fixture kiểm UI/tiêu thụ API, không thay tích hợp thật.

## Kết quả triển khai

- Tách Scene/Facts và Timeline/Events vào thư mục analysis, dùng CSS Module riêng.
  Bố cục desktop gồm cảnh/timeline và số đo/nhật ký; tablet xếp dọc, biểu đồ tín hiệu ở dưới.
- Giữ các layer GT/nhận thức/quỹ đạo. Thay nhóm nhãn camera/RGB/LiDAR không hoạt động bằng
  thông tin rõ rằng các nguồn này chưa được đồng bộ trong playback. Không bỏ API/sensor thật.
- Chỉ còn một slider native có tên, hỗ trợ phím mũi tên/Home/End và aria-valuetext.
  Nút phát/dừng, trước/sau sự kiện và tốc độ 0.25/0.5/1/2 giữ chức năng hiện có.
  Mốc gần nhau được gom trên thanh, có số lượng/title/tên truy cập; nhật ký giữ từng bản ghi.
- Sự kiện hiện hành so sánh theo bản ghi thay vì label; hai sự kiện trùng tên ở các thời điểm
  khác nhau không cùng được đánh dấu. Label/kind mở rộng từ API vẫn hiển thị.
- Cursor và thời gian frame được ghi riêng. Số đo/cảnh đọc cùng frame đã ghi; projection
  khoảng cách chỉ lấy khi trùng timestamp, thiếu thì —; TTC GT và perception tách riêng.
  Gia tốc giữ dấu, số 0 giữ nguyên. Không tự suy ra dừng/va chạm hoặc sự kiện TTC từ tín hiệu.
- Thiếu tọa độ/kích thước thì không dựng cảnh bằng fallback giả. Timestamp frame/event không hợp lệ
  hoặc ngoài duration bị loại ở lớp trình bày, có số lượng/lý do; mảng raw API không bị sửa.
  Frames được sắp trên bản sao trước khi đưa vào engine. Duration sai, frame rỗng hoặc snapshot
  duration=0 có trạng thái/điều khiển phù hợp, không gọi toFixed trên dữ liệu thiếu.
- RAF clock, frameAt binary search và currentEvent selector được giữ nguyên từng đoạn so với HEAD
  (đã assert trực tiếp bằng script đọc source). Không thay renderer ScenarioMap, core, worker hoặc AEB.
- Fetch theo request key; chuyển run/retry ẩn dữ liệu cũ. Thao tác xem không tải lại API playback.
  Lỗi tải và lỗi download tách riêng; lỗi download theo run ID tránh gắn sang run khác.
- Vị trí khi dừng được lưu vào query t; rate và signal lưu khi chọn. Reload mở đúng trạng thái đó,
  luôn tạm dừng. Không ghi history từng khung RAF. Lớp hiển thị giữ trong state của trang.
- Link sang detail mang section=telemetry, t, signal, returnTo. Detail bổ sung đúng một tham số signal
  vào link playback để giữ tín hiệu hai chiều. Run liên quan giữ returnTo, không tự ghép so sánh,
  không mang cursor/tốc độ từ run hiện tại sang run khác; có lưu ý kiểm seed/xe/simulator.
- Dùng AnalysisBadge cho các outcome API, kể cả MISSED_BRAKING; không hiện badge an toàn
  khi evaluation_valid=false. Không tạo metric, dữ liệu, chức năng chạy hoặc kết quả AEB mới.

## Files để commit riêng

Modified:
- `frontend/src/app/analysis/failures/[runId]/playback/page.tsx`
- `frontend/src/app/analysis/failures/[runId]/page.tsx` — chỉ link signal sang playback.
- `frontend/tests/analysis-redesign.mjs`

Added:
- `frontend/src/components/analysis/AnalysisPlaybackScene.tsx`
- `frontend/src/components/analysis/AnalysisPlaybackTimeline.tsx`
- `frontend/src/components/analysis/AnalysisPlayback.module.css`
- `frontend/src/components/analysis/playbackPresentation.ts`
- `docs/exec-plans/completed/2026-11-04-analysis-playback-dot-5.md`

Deleted: không có file/route. Bỏ timeline phụ và render inline sau khi tách component;
không xóa chức năng sensor/backend. Không migration, API mới, dependency hoặc lockfile thay đổi.

## Kiểm chứng đã chạy

- Frontend `npm.cmd run lint`: PASS.
- Frontend `npx.cmd tsc --noEmit`: PASS.
- Frontend `npm.cmd run build`: PASS, production build và các route hoàn tất.
- Gốc repo `mvnw.cmd -B "-Dtest=RepoDocsTest" test`: PASS, 5 test, không lỗi/bỏ qua.
- Frontend `node tests/analysis-redesign.mjs`: PASS trên production frontend và Edge headless.
  Kiểm tra một slider có tên, seek bằng phím/marker/nhật ký, prev/next, play/pause/restart,
  chọn rate, các lớp và tín hiệu không gọi lại API. Nhãn sự kiện trùng chỉ chọn đúng một record;
  marker nhóm đến đúng timestamp, không bị click bubbling từ track phụ.
- Browser kiểm frame 0.50 s tại cursor 0.75 s; distance API 777.7 không tính từ tọa độ;
  gia tốc -1.25 giữ dấu; TTC perception thiếu không lấy GT 42; projection lệch timestamp hiện —.
  Chỉ stopped event mới hiện ĐÃ DỪNG. Backend event label/kind mở rộng được giữ.
- Browser kiểm t/rate/signal/returnTo qua reload, detail hai chiều, và run liên quan; chuyển run
  đang phát có loading/không giữ số đo cũ, run mới không tự phát. Kiểm frame rỗng, snapshot 0 s,
  tọa độ/số đo thiếu, duration không hợp lệ, frame/event ngoài khoảng, outcome MISSED_BRAKING,
  evaluation_valid=false; 503/403/404 và retry. Các checks Đợt 1–4 vẫn PASS; mutation vẫn đúng một
  lần chốt dataset trong bộ test, không có mutation AEB/optimization/regression ngoài yêu cầu.
- Đã chụp 1920×1080, 1366×768, 1024×768 và assert không overflow ngang toàn trang.
  Đã xem ảnh Playback mới 1366 và 1024; các sự kiện sát nhau được gom trên thanh và giữ riêng ở log.
- Bằng chứng gitignored: `data/analysis-batch5-ui/result.json` (`BROWSER_FIXTURE_ONLY`) và PNG.
  Các số biên và metadata CARLA trong test chỉ là fixture trình duyệt, không phải run CARLA thật.
- `git diff --check`: PASS. Diff backend/worker/schema/API client/types/shared MotionTelemetryChart,
  ScenarioMap, Overview/Explorer và các component Detail/Evidence của Đợt 4 rỗng.

## Giới hạn và điểm dừng

Chưa xác minh backend/auth/DB/CARLA thật hoặc đối chiếu Figma. Browser dùng token/role/API fixture,
không thay thế đăng nhập/tích hợp thật. Không có mock production. Chưa kiểm tải .xosc với backend thật.
Camera/RGB/LiDAR không được thêm vào engine hoặc giả lập đồng bộ; đây vẫn là playback tọa độ đã ghi.

Nhánh `chuvv`; ban đầu sạch, cuối đợt chỉ 3 modified + 5 added kể trên.
Không stage/commit/push/merge/reset/clean. Frontend tạm cổng 3100 đã được dừng sau kiểm thử.
Đợt 5 hoàn thành ở phạm vi source và browser fixture. Commit gợi ý:
`refactor(analysis): redesign playback timeline and recorded event views`.

Dừng để người dùng kiểm tra và tự commit. Đợt 6 — Failure và Root Cause Analysis chưa bắt đầu.
