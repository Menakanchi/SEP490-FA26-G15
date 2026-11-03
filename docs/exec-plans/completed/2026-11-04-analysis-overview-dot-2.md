# Đợt 2 — Analysis Overview

Ngày 04/11/2026, nhánh chuvv. Working tree sạch khi bắt đầu; Đợt 1 đã ở HEAD.
Chỉ làm Đợt 2. Không git add/commit/push/merge/reset/clean; không tự làm Đợt 3.

## Audit và quyết định

- Đọc lại AGENTS/CLAUDE, frontend/AGENTS, quy tắc gói/naming hiện tại,
  hợp đồng analysis-metrics và báo cáo Đợt 1.
- API GET /analysis/runs hiện trả total/counts/objective_groups/evaluation_version.
  AnalysisService đếm 11 outcome và tách group theo baseline + xe + simulator + dt.
- Counts/objective_groups là toàn scope bộ lọc; items chỉ là một trang.
  Overview không được dùng items để dựng tổng số hoặc metric toàn tập.
- UI hiện có bốn KPI, 11 hàng outcome liền nhau, nhóm objective trong một panel dài.
  Chưa thể hiện đủ rõ khác biệt giữa kết quả AEB, lỗi kỹ thuật và thiếu kết quả.
- Tách component AnalysisOverview theo thư mục chức năng; chỉ đổi render Overview.
- Bốn KPI gọn, phân bố sáu kết quả AEB riêng, năm trạng thái kỹ thuật/dữ liệu riêng.
- Đưa nhóm CARLA lên trước, có nhãn quan sát/đối chiếu; giữ mọi group và identity,
  không cộng/trung bình metric giữa các nhóm. Không mặc định run động học là CARLA.
- Tỷ lệ chỉ là trình bày count/total API; thiếu count/metric hiển thị —, số 0 thật vẫn giữ.
- Trạng thái tải/lỗi/rỗng thể hiện riêng; không dựng chart giả khi không có dữ liệu.
- Giữ URL/filter/draft và mutation hiện có. Không sửa Run Explorer/Detail/Playback,
  dataset workflow, shared summary, backend, worker, API contract, database hay AEB.

## Thực hiện

- [x] Rà source/API và chọn bố cục Overview.
- [x] Tách component và cải thiện KPI/phân bố/group/source.
- [x] Lint, typecheck, production build, browser fixture/responsive và tài liệu.
- [x] Ghi kết quả, Git status, commit gợi ý; dừng chờ người dùng.

## Giới hạn xác minh

Chưa có backend/CARLA lắng nghe tại các cổng app khi kiểm tra, chưa có URL/node Figma.
Browser fixture chỉ kiểm UI và cách tiêu thụ dữ liệu API, không thay thế tích hợp DB/CARLA thật.
Không có mock production hoặc metric mới.

## Đợt tiếp theo (chưa bắt đầu)

Đợt 3 — Run Explorer theo kế hoạch đã chốt. Chỉ làm khi có lệnh tiếp tục.

## Kết quả triển khai

- Component Overview riêng, không nắm logic API/mutation/dataset.
- Bốn KPI gọn có count, tỷ lệ trên total scope và nhãn ý nghĩa.
- Sáu kết quả AEB tách khỏi năm trạng thái kỹ thuật/dữ liệu, không thay classification backend.
- Nhóm CARLA lên trước, có nhãn nguồn và lưu ý quan sát; giữ nhóm bộ động học/nguồn khác.
  Mỗi identity vẫn có objective/missing/notApplicable riêng; không gộp các dt khác nhau.
- Nút lọc profile dùng đúng simulator filter đã có, giữ scenario_id và reset page như bộ lọc cũ.
- Empty không vẽ chart 0 giả; missing khác 0; loading/error không giữ chart cũ.
- CSS Module chỉ cho Overview; không đổi CSS chung, shared summary hoặc trang module khác.

## Files để commit riêng

Modified:
- `frontend/src/components/BaselineAnalysisDashboard.tsx` — thay block Overview bằng component mới,
  bỏ import/hằng chỉ phục vụ render cũ; giữ toàn bộ luồng Explorer/dataset/API.
- `frontend/tests/analysis-redesign.mjs` — thêm test Đợt 2, giữ test Đợt 1 và các workflow trước.

Added:
- `frontend/src/components/analysis/AnalysisOverview.tsx`
- `frontend/src/components/analysis/AnalysisOverview.module.css`
- `docs/exec-plans/completed/2026-11-04-analysis-overview-dot-2.md`

Deleted: không có file. Không migration, không API mới, không đổi dependency/lockfile.

## Kiểm chứng thực tế

- `npm.cmd run lint`: PASS.
- `npx.cmd tsc --noEmit`: PASS.
- `npm.cmd run build`: PASS, mọi route frontend build được.
- `mvnw.cmd -B "-Dtest=RepoDocsTest" test`: PASS, 5 test, 0 failure/error/skip.
- `node tests/analysis-redesign.mjs`: PASS trên production frontend và Edge headless.
  Fixture có total 250 nhưng items chỉ là một trang: KPI giữ total/count API;
  hai nhóm CARLA khác dt + một nhóm động học vẫn độc lập, không tính lại objective;
  thiếu count/metric hiện —, count 0 giữ 0; loading/error/retry và empty đúng trạng thái.
  Filter profile giữ scenario_id và gửi simulator vào API; các test chọn tập/handoff/detail/playback
  của đợt trước vẫn qua, không có mutation optimizer/candidate/regression ngoài yêu cầu.
- Ảnh overview thường và nhiều nhóm ở 1920×1080, 1366×768, 1024×768;
  assertions không overflow ngang. Đã xem ảnh overview 1366 và nhiều nhóm ở tablet.
- Bằng chứng riêng: `data/analysis-batch2-ui/result.json` và PNG (gitignored).
  Có nhãn BROWSER_FIXTURE_ONLY; không phải kết quả chạy CARLA hoặc dữ liệu DB thật.
- `git diff --check`: PASS. Diff backend/worker/schema/API client/types/trang route/shared summary rỗng.

## Git và điểm dừng

Nhánh chuvv; không có thay đổi chưa commit khi bắt đầu. Chỉ năm file kể trên thuộc Đợt 2.
Không git add/commit/push/merge/reset/clean, không sửa báo cáo hoặc code Đợt 1 đã commit.
Frontend tạm được dừng sau kiểm thử. Chưa xác minh login/backend/DB/CARLA thật hoặc Figma.
Không có lỗi check còn lại đã phát hiện trong phạm vi đợt này.

Đợt 2 hoàn thành ở phạm vi source và browser fixture. Commit gợi ý:
`refactor(analysis): improve baseline overview and source grouping`.
Dừng hẳn để người dùng kiểm tra/commit; Đợt 3 chưa được triển khai.
