# Đợt 7 — Dataset Preparation

Ngày 04/11/2026; nhánh chuvv, working tree sạch trước khi bắt đầu.
Chỉ Đợt 7, không stage/commit/push/merge/reset/clean; dừng trước Đợt 8.

## Kế hoạch

- [x] Đọc AGENTS/CLAUDE/frontend, hướng dẫn đổi package và Next.js local.
- [x] Audit draft, snapshot v2, freeze/handoff API và nơi nhận /aeb.
- [x] Tách UI chuẩn bị tập; phân biệt bản nháp và snapshot, hiển thị hai vai trò/nguồn/seed.
- [x] Validation metadata, sửa lựa chọn kể cả run không còn hợp lệ; giữ quyền và session scope.
- [x] Tải snapshot theo request key, retry riêng; bàn giao bằng ID qua API kiểm tra lại nguồn.
- [x] Kiểm thử lint/types/build, browser regression/ảnh, Java analysis/docs phù hợp.
- [x] Ghi bằng chứng, chuyển completed và dừng để người dùng commit.

## Audit và bất biến

Draft nằm trong sessionStorage theo user/project; filter/page không làm mất lựa chọn.
POST /analysis/selections nhận IDs hai tập và revision; service giới hạn 1–500 run mỗi tập,
cùng họ/baseline hiện hành/xe/simulator/dt, không trùng biến thể giữa tập hoặc biến thể/seed,
mỗi tập giữ ca SAFE; backend còn xác minh telemetry, objective và manifests.
GET /analysis/datasets/:id đọc bằng chứng cũ; baseline_current do server cập nhật.
handoff_ready chỉ được thêm sau freeze/handoff, không có sẵn trong snapshot đọc từ DB.
GET /analysis/datasets/:id/handoff kiểm lại baseline, run và artifact rồi /aeb tự tải lại ID.
Không coi kiểm tra metadata phía UI là kiểm chứng đầy đủ, không tính objective hoặc tạo telemetry.
Không đổi backend/API/schema/worker/core/thuật toán tối ưu. AnalysisDatasetPanel v1 không phải
màn chuẩn bị v2 hiện tại; giữ nguyên các consumers cũ. Summary snapshot dùng chung với AEB giữ API.

## Giới hạn kiểm chứng ban đầu

Không có listener backend/DB/CARLA ở cổng chuẩn khi rà. Không đọc cấu hình/tài khoản cá nhân;
UI browser dùng fixture riêng. Chưa có Figma để đối chiếu, không tuyên bố đã kiểm thiết kế.


## Kết quả triển khai

- `AnalysisDatasetPreparation` thay phần JSX dataset trong dashboard; CSS module không đổi
  khung UI dùng chung. Hiển thị tiến trình, hai tập, số run/ca SAFE, nguồn/seed và số đo đã lưu.
- Hai bảng bản nháp có tìm kiếm riêng (d_q URL, giữ q/page/filter baseline), phân trang từng tập,
  chuyển vai trò qua select hiện có, bỏ từng run hoặc toàn bộ bản nháp. Có thể bỏ run đã mất
  điều kiện chọn. Thao tác sửa/chốt/clear tôn trọng quyền ghi và trạng thái đang xử lý.
- Giữ bản nháp trong sessionStorage theo user/project. Cache hỏng có thông báo, giữ phần đọc được;
  bỏ entry thiếu metadata cấu trúc thay vì crash. Chưa tải xong không hiển thị lựa chọn rỗng giả.
- `analysisSelectionData` chỉ kiểm tra metadata: hai vai trò, nguồn đồng nhất, không trùng biến thể
  giữa hai tập/không lặp biến thể-seed, SAFE mỗi tập, eligible/revision, baseline trong context và
  1–500 run/tập theo hợp đồng hiện có. Không tự tính objective/telemetry hoặc kết luận safety.
  Backend tiếp tục quyết định validity, metric completeness, trace, revision và manifests.
- Snapshot tách khỏi bản nháp, load theo user/project + dataset ID + retry key, có loading/error/retry
  đúng endpoint; không gọi danh sách baseline chỉ để xem bản nháp/snapshot. URL ID không hợp lệ,
  schema v1 và ID phản hồi không khớp có lỗi rõ. Response cũ không ghi đè tập đang xem.
- Chỉnh bản nháp gỡ dataset_id đang mở, không sửa snapshot đã lưu. Deep link vẫn đọc snapshot
  được với bản nháp rỗng. Giữ `AnalysisSelectionSummary` dùng chung ở Analysis/Overview/AEB nguyên file.
- Freeze vẫn gửi scenario/baseline, hai mảng run IDs và run_revisions; không gửi chỉ số tự tổng hợp.
  Lỗi chốt giữ nguyên lựa chọn; trạng thái chốt và bàn giao có nhãn riêng, khóa thao tác trong khi xử lý.
- Handoff giữ GET kiểm tra lại server rồi chuyển /aeb?dataset_id=ID; yêu cầu phản hồi đúng schema/ID,
  baseline_current và handoff_ready. Snapshot GET không bắt buộc handoff_ready vì DB không lưu cờ đó.
  Baseline đã đổi/chưa xác nhận không có nút bàn giao khả dụng. MANAGER có thể đọc và theo GET handoff,
  không sửa/chốt/clear bản nháp. Không tự tạo optimization/candidate/regression hoặc quyết định phê duyệt.
- 1366 px ban đầu có cột thao tác cần cuộn ngang do hai bảng cạnh nhau. Sau xem ảnh đã đổi breakpoint
  sang một cột ở cỡ này; thêm assertion cột chọn/bỏ run nằm trong khung ở 1920/1366/1024, chạy lại PASS.
- Không đổi backend, API contract, schema/migration, worker/core, ngưỡng hay thuật toán tối ưu.
  Không thêm dependency. Không sửa dataset v1 hoặc màn AEB ngoài việc kiểm tra consumer hiện có.

## Files bàn giao

Modified:

- `frontend/src/components/BaselineAnalysisDashboard.tsx`
- `frontend/tests/analysis-redesign.mjs`

Added:

- `frontend/src/components/analysis/AnalysisDatasetPreparation.tsx`
- `frontend/src/components/analysis/AnalysisDatasetPreparation.module.css`
- `frontend/src/components/analysis/analysisSelectionData.ts`
- Biên bản completed này.

Không xóa file tracked. Bỏ phần giao diện dataset ghép chung cũ và nút retry gọi nhầm baseline;
giữ chức năng chọn, lưu, đọc, bàn giao và các điểm nối hiện có.

## Kiểm chứng thực tế

| Lệnh / việc | Kết quả |
| --- | --- |
| `npm.cmd run lint` (frontend) | PASS trên mã cuối |
| `npx.cmd tsc --noEmit` (frontend) | PASS sau sửa null guards; production build cuối cũng kiểm TypeScript PASS |
| `npm.cmd run build` (frontend) | PASS; chạy lại sau sửa breakpoint/câu chữ |
| `node --check frontend/tests/analysis-redesign.mjs` | PASS; script cuối được thực thi thành công |
| `.\mvnw.cmd -B "-Dtest=AnalysisServiceTest,AnalysisDatasetTest,AnalysisSnapshotTest,RepoDocsTest" test` | PASS 28/28 (14 + 4 + 5 + 5) |
| `npm.cmd run start -- --hostname 127.0.0.1 --port 3100` | App production chạy được; đã dừng sau kiểm chứng |
| `node tests/analysis-redesign.mjs` (frontend) | PASS hai lượt, lượt cuối gồm assertion thao tác không bị khuất; toàn bộ Đợt 1–7 |
| `git diff --check` | PASS |

Lần kiểm tra tĩnh đầu báo baseline/error có thể null và setState thừa khi restore notice.
Đã thêm null guards và gộp notice vào state bản nháp; lint/types/build sau sửa PASS.
Không nới test/lint rule hoặc sửa backend để làm checks xanh.

Ca browser mới: source/seed/role; tìm trim/case/URL/return không fetch baseline; chuyển/bỏ run;
metrics 0/null giữ nguyên; overlap/double seed/mixed vehicle/simulator/dt/no SAFE/baseline cũ/trace thiếu;
giới hạn 501 bị chặn, 500 đủ metadata; phân trang/size; lỗi revision freeze giữ draft/retry payload;
đang xử lý khóa thao tác; snapshot GET không cờ handoff; 503/403/404/retry/legacy/invalid ID;
loading xóa snapshot cũ, response trễ không ghi đè ID mới; baseline cũ chặn handoff;
handoff lỗi source/baseline/403/flag chưa đủ không điều hướng, retry thành công đến AEB theo ID;
clear không xóa snapshot, draft rỗng vẫn đọc snapshot; cache JSON hỏng/entry lỗi và project scope;
MANAGER chỉ đọc. Tổng writes fixture đúng 3 POST selections (một freeze cũ, một reject revision,
một retry thành công), không có write tối ưu/regression/candidate.

Ảnh và kết quả ở `data/analysis-batch7-ui/` (gitignored), `result.json` có PASS,
BROWSER_FIXTURE_ONLY, liveBackendVerified=false, figmaVerified=false. Có ảnh dataset-ready
1920×1080, 1366×768, 1024×768; đã xem cả ba kích thước và ảnh 1366 sau sửa.
Assertion không tràn ngang toàn trang và cột thao tác nằm trong bảng PASS cả ba.
Các kiểm thử và ảnh Đợt 1–6 vẫn được giữ trong cùng script.

## Giới hạn và điểm dừng

Browser dùng fixture API/token/user riêng, không xác minh đăng nhập thật/backend/DB/CARLA.
Chưa có Figma để đối chiếu. Không mock dữ liệu production; không đụng .env/cấu hình cá nhân.
Không chạy lại toàn bộ Java/worker suite vì chỉ sửa frontend; nhóm tests Analysis hiện có đã PASS.
AEB consumer hiện còn thông báo MOBO chạy toàn họ, chưa giới hạn theo hai tập; Đợt 7 chỉ
bàn giao snapshot qua ID, không tuyên bố đã đổi phạm vi/thuật toán tối ưu theo dataset.

Nhánh chuvv; working tree sạch trước Đợt 7, các đợt trước nằm trong HEAD.
Bàn giao 2 modified + 4 added, không deleted, không stage/commit/push/merge/reset/clean.
Commit gợi ý: `refactor(analysis): improve dataset preparation and snapshot handoff`.
Đợt 8 kế tiếp: UI Consistency và Regression Testing; chưa bắt đầu. Dừng để người dùng commit.
