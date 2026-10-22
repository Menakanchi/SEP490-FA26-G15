# Tích hợp chuvv và trungdam
Trạng thái: bản tích hợp đã qua các cổng kiểm chứng bên dưới; nhánh đích là chuvv.

## Mốc và khôi phục
- Local chuvv: 23849f4; origin/chuvv: 17868b6; trungdam: 040f751.
- Backup đầy đủ file/index/Git bundle: thư mục sibling SEP490-FA26-G15-merge-backup-20261022-213929.
- Giữ nguyên stash gốc và tạo nhánh recovery cho HEAD/stash.
- Tích hợp và kiểm chứng tại worktree riêng; đưa về chuvv bằng fast-forward sau khi lưu thêm stash khôi phục, không reset/force push.

## Phạm vi và rủi ro
- chuvv đưa phần phân tích người 3 lên nền Python cũ, kèm conflict markers và build output.
- trungdam chứa chuyển đổi kiến trúc đã Accepted (ADR-032/039/042), CARLA/baseline mới và regression tách tầng.
- Dùng nền nội dung 5da0c17 để hợp nhất thay đổi người 3 và trungdam ở từng file Java/frontend; giữ nguyên lịch sử hai nhánh.
- Giữ toàn bộ API phân tích, dataset v2, chỉ số/provenance và playback; giữ hủy family/run, CARLA radar shadow, regression/review/export.
- Không phục hồi Forge/FastAPI đã được supersede; không thêm cách chạy/chấm điểm riêng.
- Schema 29 bảng chỉ thêm BASELINE_DATASET + migration009; không chỉnh DB đang có trên máy.
- Giữ datasource lấy từ biến môi trường; không xuất bản thông tin máy cá nhân.
- Bỏ theo dõi target/ (build artifacts đã bị đưa nhầm vào chuvv); không xóa bản sao khôi phục.
- Kiểm tra controller không trùng route, enum/schema, DTO/API/types, seed/simulator identity, quyền/quota, dữ liệu thiếu.

## Kiểm chứng cần hoàn tất
- Backend clean test, worker lint/pytest, frontend lint/typecheck/production build.
- Integration MySQL/Redis riêng và browser thật cho luồng baseline → phân tích → AEB.
- Regression pairing/Reviewer/decision/export và CARLA route/worker tests.
- Review diff, scan conflict/secrets, xác minh hai parent ancestry và nhánh đích chuvv.


## Kết quả kiểm tra đã có
- Backend: mvnw -B clean test: 309 tests, 0 failure/error, 1 skip (fixture full-grid parity ngoài repo).
- Worker: ruff check worker đạt; pytest worker/tests -q: 52 passed. Worker khớp trungdam.
- Frontend: lint, tsc --noEmit, build -- --webpack đạt. Webpack dùng do worktree dùng junction node_modules; không đổi dependency/scripts.
- MySQL 8.0.46/Redis disposable: schema 29 bảng + migration009 đạt.
- API thật: 18 baseline (11 SAFE, 2 COLLISION, 1 FALSE_BRAKING, 2 NEAR_MISS, 2 TIMEOUT), snapshot/seed/digest và missing-artifact guards đạt.
- Rà soát 59 file mới/sửa của trungdam giữ nguyên byte nội dung; các file dùng chung còn lại chỉ ghép bổ sung phần3.
- Giữ toàn bộ33 API frontend và46 kiểu dữ liệu trungdam; thêm7 API và8 kiểu phân tích.
- Hai test phần3 cập nhật import RegressionService mới; playback giữ default focus của trungdam và seek query của phần3.
- Git conflict marker scan và index đã giải quyết hết conflict. Không có thay đổi local chưa giải thích khi đối chiếu snapshot ban đầu.
- Chưa kiểm CARLA server thật/Figma; adapter/JVM bridge và lifecycle được test bằng fixtures.
- Không đổi datasource DB người dùng; mật khẩu TCP test riêng đã chỉnh cho đúng test environment, không đổi code vì lỗi môi trường.


## Toàn luồng và rà soát cuối
- Browser thật: đăng nhập, family filter ở cả hai tab, KPI, chọn tập qua phân trang, handoff ID sang AEB, jerk/evidence, nút CARLA/xosc, phát/dừng/tua và default focus đạt. Không mock API; không phát sinh POST tạo candidate/optimizer. Ảnh tại data/analysis-integration/ui.
- scripts/test_merge_integration.py đạt trên MySQL riêng: tập xác minh dataset1 → regression custom variants15/17; test1 Reject, test2 Accept, test3 stale bị chặn.
- Ghép cặp kiểm trực tiếp SQL: seed/variant/xe/simulator/dt đồng nhất; candidate bằng tham số baseline; các cặp không regression.
- JSON/CSV export, auth401/403, lý do/xác nhận, lịch sử quyết định đều đạt.
- Accept baseline1→4 chỉ trong DB thử; archive dataset vẫn giữ nguyên, handoff trả400 vì baseline cũ.
- Evidence: data/analysis-integration/evidence.json, merge-evidence.json và các export (gitignored).
- Công thức AEB/simulator, code worker và service regression mới giữ nguyên trungdam; dependency/lock/config dùng nền trungdam.
- Kiểm tra diff mới so trungdam không có whitespace lỗi. Một số whitespace đã có trong lịch sử trungdam (đặc biệt context patch ScenarioRunner) được giữ nguyên.
- Datasource cá nhân được giữ ở cấu hình local gitignored khi đưa kết quả về thư mục gốc; không đưa credential mới vào commit.
- Không truy cập hay migrate mysql-container/redis hiện có. DB thật của người dùng cần migration009 nếu chưa có BASELINE_DATASET.
- CARLA server thật và Figma không khả dụng trong phiên kiểm chứng; không tuyên bố đã kiểm vật lý/thiết kế.
