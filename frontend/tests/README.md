# Admin và Analysis regression

Hướng dẫn cập nhật ngày 17/11/2026. [Final QA](../../docs/exec-plans/completed/2026-11-17-admin-analysis-phase-20-handover.md)
ghi lệnh, số test và giới hạn của lần chạy Phase 20; hướng dẫn này không thay thế kết quả thực thi.

## Admin browser

Bảy harness dùng Playwright hiện có, production frontend và HTTP fixtures.
Không cần backend/DB, không dùng tài khoản thật. Mock route guard không chứng minh quyền backend;
kiểm thêm AdminSecurityTest/WorkspaceSecurityTest/VehicSimSecurityTest/ReviewerScopeTest phía Java.

Từ frontend, Node.js 22:

    npm ci
    npm run build
    npm run start -- --hostname 127.0.0.1 --port 3122

Giữ server chạy, terminal thứ hai trong frontend:

    $env:ADMIN_UI_URL = 'http://127.0.0.1:3122'
    $env:ADMIN_UI_OUTPUT = 'data/admin-regression'
    npm run test:admin -- --repeat=2

Trên PowerShell chặn npm.ps1, dùng npm.cmd/npx.cmd.
Runner chạy từng suite bằng process/browser/context mới; lượt chẵn đảo thứ tự.
Bất kỳ suite exit khác 0, thiếu result hoặc result không PASS đều dừng, trả exit 1,
ghi summary.json FAIL. Runner xóa result.json cũ của suite trước khi chạy.
Chỉ coi summary.json hiện tại là kết luận cả lượt; artifact suite cũ chưa chạy không phải PASS mới.
Server do người gọi quản lý; runner không bật/tắt server hoặc backend.

Browser: BROWSER_EXECUTABLE chọn binary rõ ràng. Windows dùng Edge cài ở đường dẫn
chuẩn nếu tìm thấy; môi trường khác dùng Chromium của Playwright. Nếu chưa có:

    npx playwright install chromium

Linux CI có thể cần chuẩn bị browser/system dependencies trên runner riêng.
Không đổi máy hoặc cài gói hệ thống tự động từ test. Phiên bản Playwright đã pin trong package-lock.

Mặc định npm run test:admin không chụp ảnh để tránh ảnh trùng ở các lượt ổn định.
Hành vi scroll/focus/viewport assertions vẫn chạy. Muốn ảnh cho một trạng thái cần xem,
chạy harness tương ứng trực tiếp (mặc định giữ ảnh) hoặc đặt ADMIN_UI_SCREENSHOTS=1.
ADMIN_UI_OUTPUT của harness trực tiếp là thư mục kết quả cụ thể; của runner là thư mục cha,
bên dưới có run-1/<suite>, run-2/<suite> và summary.json.

Không sửa assertions để làm suite xanh. Loading/race tests dùng response được giữ rồi release;
200ms trong wheel check chờ browser xử lý wheel, không phải giả lập latency API.
Khi test lỗi: xem output/summary và assertions, phân biệt test lỗi thời với lỗi production.
Các bản ghi, token và diagnostics trong fixtures là dữ liệu kiểm thử, không phải dữ liệu thật.

## Analysis unit, contract và browser

Trong frontend (Node.js 22, dependencies từ npm ci), không cần app/backend cho unit:

    npm run test:analysis -- --repeat=2

48 tests hiện tại nạp helpers production và golden API đã được Java producer kiểm.
Lượt hai đảo thứ tự; không dùng baseline mode để tạo PASS.
Để chạy thêm chín browser suites, dùng production app local đã khởi động như phần Admin:

    $env:ANALYSIS_UI_URL = 'http://127.0.0.1:3122'
    $env:ANALYSIS_TEST_OUTPUT = Join-Path (Split-Path (Get-Location).Path -Parent) 'data/analysis-regression/manual-review'
    npm run test:analysis -- --browser --repeat=2

ANALYSIS_TEST_OUTPUT nên là đường dẫn tuyệt đối tới thư mục con của data ở repo root.
Đường dẫn tương đối được resolve từ cwd (frontend), khác ADMIN_UI_OUTPUT của Admin runner.
Không truyền data/analysis-regression từ frontend vì nó trỏ sang frontend/data và sẽ bị chặn.
Omit biến output thì runner tự tạo thư mục timestamp-pid trong data/analysis-regression.
Không tái sử dụng output của phase trước. Browser URL phải local; runner không tự bật app/CARLA.

Mỗi lượt có unit.log; mỗi suite có browser.log, result.json và ảnh trong thư mục riêng.
Chỉ summary PASS cùng exit 0 và child result mới hợp lệ được tính là đạt.
FAIL/BASELINE/kết quả thiếu hoặc page errors không được dùng làm PASS. Không sửa test/fixture
để khớp thay đổi ngoài ý muốn. Lượt đảo thứ tự kiểm isolation cục bộ, không chứng minh hết flaky trên CI.

Contract: từ root chạy Maven `-Dtest=AnalysisApiContractTest test` để so production read services
với src/test/resources/analysis/analysis-api-contract.json.gz. Golden có bốn run động học từ core,
đầy đủ 321 frames; persistence là mock, không phải dữ liệu CARLA hoặc live HTTP/MySQL.
Normal test/CI không viết golden. Khi sai khác, review target/analysis-contract/actual.json trước;
không tự dùng -Danalysis.contract.update=true để bỏ qua failure.

CI hiện chạy Analysis unit/contract; Admin/Analysis browser chưa provision trong CI (TD-57).
Live account/JWT/DB persistence, CARLA runtime, screen reader, native touch và Figma là các kiểm tra riêng,
chưa được chứng minh bởi các harness này. Xem [technical handover](../../docs/vehicsim/admin-analysis-handover.md)
để chuẩn bị QA dev riêng và tránh ghi dữ liệu production.
