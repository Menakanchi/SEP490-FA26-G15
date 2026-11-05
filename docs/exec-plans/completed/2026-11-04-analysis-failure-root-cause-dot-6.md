# Đợt 6 — Failure và Root Cause Analysis

Ngày 04/11/2026. Nhánh `chuvv`, working tree sạch khi bắt đầu.
Chỉ làm Đợt 6; không stage/commit/push/merge/reset/clean; dừng trước Đợt 7.

## Kế hoạch

- [x] Đọc AGENTS/CLAUDE/frontend, Next.js local và hợp đồng failures/detail/CSV.
- [x] Tách giao diện danh sách lỗi, KPI/phân bố khâu, bộ lọc/tìm trong trang/phân trang/CSV.
- [x] Ghép mỗi nhận định với số đo theo stage, giữ khâu chính/điểm luật/mã/tham số từ API.
- [x] Liên kết bằng chứng tới telemetry/playback đúng mốc, giữ returnTo và lựa chọn dataset.
- [x] Không đổi backend, schema, công thức, ngưỡng hoặc classification; không suy diễn nhân quả.
- [x] Lint, TypeScript, build, RepoDocsTest, browser fixtures/ảnh; bàn giao rồi dừng.

## Audit nguồn

`AnalysisViewService.failureList` hiện áp dụng mọi filter vào scope KPI/by_class/families và SQL
phân trang (comment lịch sử trong service khác code hiện tại). Không tính thống kê từ items.
`failureRows` trả nhận định chính từ root_causes hoặc mô tả failure, confidence, cause_code,
chỉ số km/h/TTC và cấu hình; không có trace_available/seed/simulator cho từng dòng.
`AnalysisController` nhận 4 failure_class, 3 outcome (COLLISION/NEAR_MISS/FALSE_BRAKING), days 1–3650.
CSV dùng cùng filters, không có q hoặc pagination; frontend không thay hợp đồng này.
Detail trả chain/stage_evidence/failure_class/chain_confidence/evaluation_version từ kết quả đã lưu.
UI không chọn lại khâu chính bằng !passed, không chuyển confidence thành xác suất nhân quả.

## Giới hạn ban đầu

Không thấy listener ở cổng chuẩn backend/DB/CARLA/frontend khi rà. Chưa có phiên đăng nhập thật
hoặc thiết kế Figma để đối chiếu; browser fixture chỉ kiểm UI/tiêu thụ API, không thêm mock production.


## Kết quả triển khai

- Tách `AnalysisFailureExplorer` và CSS module; `LegacyFailureCases` giữ điểm vào cũ,
  gọi API, quyền truy cập, request key và trạng thái lỗi. Không thêm cơ chế chạy/chấm điểm.
- Sáu bộ lọc máy chủ, chip bỏ từng lọc, tìm trong trang (f_q), phân trang và CSV.
  Giữ namespace f_* độc lập, cả sentinel f_scenario rỗng để bỏ phạm vi họ kế thừa.
  URL trang không hợp lệ dùng trang 1; trang vượt giới hạn chuyển về trang cuối từ API.
- KPI/by_class lấy nguyên tổng hợp máy chủ. Count thiếu không điền 0; tổng 0 không vẽ
  progress giả. Khâu null không còn bị hiển thị thành “Biên an toàn”.
- Bảng thêm điểm luật, mã nguyên nhân, điều kiện, đường vào evidence/telemetry/playback;
  cột run và thao tác ghim khi cuộn ngang. Không thêm seed/simulator không có trong list API.
- Evidence đặt từng nhận định cùng số đo theo stage; hiển thị khâu chính từ failure_class,
  chain_confidence, evaluation_version, mã/tham số và cấu hình đã lưu, không tính lại nguyên nhân.
  Trạng thái passed thiếu không bị coi là failed. Giữ số 0, số âm, số đo/stage chưa biết;
  không bỏ nhóm evidence chưa có chain tương ứng, không suy diễn quan hệ nhân quả.
- Link mốc detection/decision/brake chỉ dùng thời gian hữu hạn trong khoảng telemetry đã ghi;
  giữ signal và returnTo. Playback của khâu cần trace và trạng thái COMPLETED từ inspection.
  Danh sách không có trace_available nên vẫn dẫn vào trang playback có xử lý thiếu dữ liệu sẵn có.
- Không đổi backend, schema, migration, API contract, services/types dùng chung, worker/core,
  timeline/playback engine hoặc dataset/optimization. Không thêm dependency.
  CSV giữ endpoint và giới hạn backend hiện có (tối đa 100.000 dòng), không tự tổng hợp frontend.

## Files bàn giao

Modified:

- `frontend/src/components/LegacyFailureCases.tsx`
- `frontend/src/components/analysis/AnalysisRunEvidence.tsx`
- `frontend/src/app/analysis/failures/[runId]/page.tsx` — chỉ truyền returnTo và khả năng playback.
- `frontend/tests/analysis-redesign.mjs`

Added:

- `frontend/src/components/analysis/AnalysisFailureExplorer.tsx`
- `frontend/src/components/analysis/AnalysisFailureExplorer.module.css`
- `frontend/src/components/analysis/AnalysisRunEvidence.module.css`
- `frontend/src/components/analysis/analysisFailurePresentation.ts`
- Biên bản completed này.

Không xóa file tracked.

## Kiểm chứng thực tế

| Lệnh / việc | Kết quả |
| --- | --- |
| `npm.cmd run lint` (frontend) | PASS |
| `npx.cmd tsc --noEmit` (frontend) | PASS |
| `npm.cmd run build` (frontend) | PASS; production Next.js 16.4.1 |
| `node --check frontend/tests/analysis-redesign.mjs` | PASS |
| `.\mvnw.cmd -B "-Dtest=RepoDocsTest" test` | PASS, 5/5; chạy lại sau khi hoàn tất biên bản |
| `npm.cmd run start -- --hostname 127.0.0.1 --port 3100` | App production chạy được; dừng sau kiểm chứng |
| `node tests/analysis-redesign.mjs` (frontend) | PASS, cả kiểm thử Đợt 1–6; API interception riêng browser |
| `git diff --check` | PASS |

Ca mới: tổng API khác items, số lượng thiếu/0; six server filters/chips/reset/clear inherited
family; URL invalid page/last page/size; local search trim/case/code/no fetch; CSV đúng server
filters và bỏ q/page; link run/detail/playback/returnTo; loading không giữ số cũ, 503/403/retry/empty;
primary khác khâu failed đầu tiên; score 0/null, passed thiếu, tham số chỉ đọc;
stage evidence thiếu/unknown/orphan; timestamp 0 hợp lệ, 999 ngoài khoảng không có seek link;
seek không fetch lại detail; playback guard trace. Các kiểm thử role chỉ đọc, dataset và không có
mutation ngoài freeze fixture của đợt cũ vẫn PASS.

Lần browser đầu dừng ở assertion tìm thẻ Nhận thức vì SAFE parity fixture có chain rỗng.
Đã xác minh dữ liệu gốc và sửa ca biên kiểm thử để khai báo rõ bốn stage cần đối chiếu;
không sửa production để tạo thêm chain. Chạy lại toàn bộ script đã PASS.

Ảnh và kết quả ở `data/analysis-batch6-ui/` (gitignored), gồm failures/evidence 1920×1080,
1366×768, 1024×768 và các ảnh regression đợt cũ; `result.json` có status PASS,
kind BROWSER_FIXTURE_ONLY. Đã xem ảnh failure 1024/1366 và evidence 1024/1920;
assert không tràn ngang toàn trang PASS cả ba kích thước. Bảng cuộn ngang bên trong panel.

Giới hạn: đăng nhập bằng token/user fixture trong browser, không xác minh auth/backend/DB/CARLA
thật; chưa có thiết kế Figma để đối chiếu. Không thêm mock production. Không chạy lại toàn bộ
Java/worker tests vì không sửa hai phần đó. Chưa có lỗi trong các checks đã chạy.

## Git và điểm dừng

Nhánh `chuvv`; working tree sạch trước Đợt 6, các đợt trước đã nằm trong HEAD.
Bàn giao 4 modified + 5 added, không deleted. Không stage/commit/push/merge/reset/clean.
Commit gợi ý: `refactor(analysis): redesign failure explorer and root cause evidence`.
Đợt 7 tiếp theo: Dataset Preparation (chọn tập, trạng thái, validation, handoff); chưa bắt đầu.
