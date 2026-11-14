# Admin browser regression

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
