# FE-R2 — Core user workflow & interaction simplification

Ngày 25/11/2026. FE-R2 nối tiếp worktree FE-R1 chưa commit, HEAD
`d712146c2ee03de8d751725c506eb1d4a814d2d8`. Phạm vi: frontend Failure Analysis,
đọc kết quả đã lưu và chuẩn bị dataset v2 bằng REST hiện có. Không triển khai
FE-R3/FE-R4 hoặc nối REST core V3.1/MOBO consumer.

## 1. Những tương tác đã sửa

| Trước FE-R2 | Sau FE-R2 |
|---|---|
| Dữ liệu/effect chủ yếu khóa theo filter/run ID | Local analysis subtree khóa theo account + project; đổi ownership bỏ state/effects cũ, giữ draft riêng từng account/project |
| Pending mutation có thể hoàn tất sau khi rời context | Mounted guard chặn success/error/navigation từ context cũ; kiểm dataset ID đang mở trước nhận response |
| Chọn/chuyển/bỏ run xóa liên kết snapshot đang mở | Chỉ sửa draft; snapshot ID, hai partition và nội dung đã lưu giữ nguyên cho đến lần chốt mới có chủ đích |
| Kiểm tra bàn giao đồng thời chuyển màn | Ba hành động tách rõ: **Chốt tập → Kiểm tra trước bàn giao → Mở module tối ưu**; không tự navigate sau POST/GET |
| Freeze response có `handoff_ready=true` dễ bị hiểu là current approval | Chỉ GET handoff chủ động, thành công và khớp cùng snapshot mới hiện action mở module; có thời điểm kiểm, không gọi MOBO ready |
| Busy state chỉ phụ thuộc render | Ref lock nhận thao tác ngay lập tức + disabled buttons; không double-submit, không tự retry POST |
| Không có run dùng một thông báo chung | Phân biệt baseline scope trống, không khớp server filters, không khớp tìm trong trang, loading, API lỗi và thiếu project context |
| Lỗi chốt ở cuối trang có thể khó tìm | Lỗi tại action, focus tới error region; mô tả lựa chọn/revision được giữ và bước rà lại phù hợp |
| Review chưa hiện revision từng run | Revision, execution/trace metadata và điều kiện metadata trong disclosure; metric/null vẫn lấy giá trị đã lưu |
| Đóng review chỉ đổi mode | Nút đóng rõ ràng + trả focus về trigger; mở bằng Enter hoặc deep link vẫn được |
| Unfinished run chỉ có thông báo thiếu kết quả | Status-only, giải thích chưa có kết luận và nút GET kiểm tra lại trạng thái; không tự dựng objective/PASS |

Không bớt các bước bắt buộc để xác minh hai partition. Bớt việc chọn lại draft,
quay lại tìm thông báo lỗi và phải dựng lại context/snapshot. Bộ lọc và một bảng
run của FE-R1 được giữ; không thêm primary tab hoặc ép chọn family.

## 2. Nguồn đã đọc và chênh lệch với blueprint

Đã đọc toàn bộ 01–09 và FE_R1_IMPLEMENTATION_REPORT trong thư mục này;
root AGENTS/CLAUDE, frontend AGENTS/CLAUDE, hướng dẫn FA/README/handover
ARCHITECTURE_AND_STATUS, analysis-metrics-contract/ADR-055, tests/README và Next16
installed navigation/useSearchParams guidance. Đối chiếu AnalysisController,
AnalysisService.freeze/handoff/inspection, API client/types/transport và các
provider auth/project thực tế trước sửa. Không thay shared providers/transport.

Blueprint 05 mô tả bỏ association khi draft đổi; yêu cầu FE-R2 mới yêu cầu giữ
snapshot đang mở. FE-R2 tuân theo yêu cầu mới: draft và immutable snapshot độc lập.
Các câu “chưa implement FE-R1” trong audit gốc là lịch sử; nguồn FE-R1 và báo cáo
đã được kiểm tra trực tiếp. Baseline:48/48 units, hai browser suites redesign và
integrity PASS trước sửa; kiểm aliases, canonical/null, route và stale responses.

## 3. Route và state preservation

| Context | Hành vi FE-R2 |
|---|---|
| `/analysis/failures`, bốn `view` aliases | Vẫn một workspace; legacy lookup có scope f_* riêng; dataset là task mở rộng |
| Filters/page/page_size/q/sort | URL giữ khi mở detail/quay lại/refresh; đổi server filter reset page, không xóa draft; q/sort chỉ loaded page |
| `dataset_id`, draft roles/revisions | Mở đúng snapshot; đổi filter/page/đóng panel/chỉnh draft không đổi ID hoặc sửa snapshot |
| `section=summary/telemetry/evidence` | Các alias và điều tra của FE-R1 được giữ |
| `t`, `signal`, `compare`, `returnTo` | Giữ trên detail/playback/return; regression whitelist không đổi |
| Account/project | Local keyed boundary không render dữ liệu cũ; GET cleanup và mutation mounted guard; storage keys cũ không bị chuyển sang owner mới |
| Rapid filter/run changes | Active request guards giữ nguyên; inner detail/playback keyed theo run ID; kết quả cũ không ghi đè hoặc điều hướng run mới |

Không tải toàn DB để làm global search. Family/version options dùng context thật;
manual advanced IDs còn cần khi không có catalog đầy đủ. Context không sẵn sàng
thì chưa mount data readers; dùng lại project/auth flow hiện có, không tạo selector
hay đăng nhập giả trong Failure Analysis.

## 4. Selection, freeze và handoff integrity

- Không đổi `selectionChecks`, `eligible`, AnalysisMetrics, contracts hoặc API types.
  Giữ cùng source identity, unique variant/seed, variant isolation, hai tập không
  giao nhau, SAFE mỗi tập, completed/trace/revision/current baseline,500/role.
- Server vẫn quyết định evidence/metric/eligibility. Bản nháp đủ metadata chỉ cho
  phép gửi kiểm tra; không tuyên bố đã đạt điều kiện vật lý hoặc MOBO.
- POST gửi đúng run IDs và revisions đã xem. Response phải là v2, đúng source,
  partition IDs/revisions trước khi mở snapshot mới. Không chuyển null thành0.
- `readSavedSelection` là rendering boundary local, giữ nguyên object/values,
  không thêm defaults/currentness. Archive thiếu handoff flag là bình thường.
  Unsupported v1 có thông báo archive/chốt lại; không convert v1 hoặc thêm renderer
  lịch sử/export thuộc FE-R4.
- GET check phải trả đúng ID/schema/current flags và cùng immutable payload đã
  mở. So sánh ổn định thứ tự object keys, bỏ response-time flags/created_at; không
  phải hash/digest/certificate hoặc kiểm chứng consumer. Khác role/run/seed/revision/
  scalar/manifest thì không hiện action mở module.
- Reload trang/snapshot, đổi ID/baseline/context hoặc check thất bại làm lần check
  trước không còn hiệu lực. Sửa draft không sửa snapshot, cũng không biến check của
  snapshot thành approval cho draft.
- GET check và mở `/aeb?dataset_id=...` là hai thao tác riêng. Không gọi optimizer,
  trial/campaign/regression; navigation không chứng minh frozen cohort consumption.

## 5. Feedback và scientific limits

Lỗi HTTP401/403/429 xử lý theo status thực; không phân tích câu English exception
để suy reason code hoặc eligibility. Các detail string khác dùng chuẩn hóa hiện
có, kèm next action tại panel. Network/400/409/429/500/403 không xóa draft/revision,
không auto retry POST. GET retry theo đúng panel và do người dùng chủ động.

Empty không chứng minh project hoàn toàn không có run: runs endpoint chỉ gồm
BASELINE/GENERATED/ON. UI ghi rõ baseline scope; lọc không khớp có nút xóa filter,
search trang không khớp có hướng chuyển trang/thay từ khóa. Không có source hợp lệ
thì không dựng0/SAFE/PASS/no failure. Ba objective/units/nulls và legacy provenance
giữ nguyên; không chỉnh producer/filter/window/aggregation hoặc diagnosis.

## 6. Files thay đổi so với FE-R1

| File | Phần sửa trong FE-R2 |
|---|---|
| [analysisUi.tsx](../../../frontend/src/components/analysisUi.tsx) | AnalysisScope, focused action error,429 copy |
| [BaselineAnalysisDashboard.tsx](../../../frontend/src/components/BaselineAnalysisDashboard.tsx) | scoped subtree/mutation guards; independent draft/snapshot; explicit check/open; focus return |
| [AnalysisDatasetPreparation.tsx](../../../frontend/src/components/analysis/AnalysisDatasetPreparation.tsx) | review revisions/metadata; actionable errors; freeze/check/open state labels |
| [AnalysisDatasetPreparation.module.css](../../../frontend/src/components/analysis/AnalysisDatasetPreparation.module.css) | wrap long revisions |
| [AnalysisSelectionSummary.tsx](../../../frontend/src/components/AnalysisSelectionSummary.tsx) | local SavedSelection type permits absent archive response flags |
| [analysisSnapshotData.ts](../../../frontend/src/components/analysis/analysisSnapshotData.ts) | new local rendering boundary / same immutable payload comparison |
| [AnalysisRunExplorer.tsx](../../../frontend/src/components/analysis/AnalysisRunExplorer.tsx) | visible page search scope; filter/no-baseline empty states, reset action/trigger ID |
| [LegacyFailureCases.tsx](../../../frontend/src/components/LegacyFailureCases.tsx) | export lock / unmounted error guard |
| [detail page](../../../frontend/src/app/analysis/failures/[runId]/page.tsx) | account/project/run scope, unfinished next action, secondary mutation guard |
| [playback page](../../../frontend/src/app/analysis/failures/[runId]/playback/page.tsx) | account/project/run scoped subtree; clock semantics unchanged |
| [analysis.css](../../../frontend/src/app/analysis/failures/analysis.css) | local action error region |
| [analysis-workflow.mjs](../../../frontend/tests/analysis-workflow.mjs) |4 new unit cases for snapshot/null/identity/response comparison |
| [analysis-workflow-ui.mjs](../../../frontend/tests/analysis-workflow-ui.mjs) | new real-event browser workflow suite |
| [run-analysis.mjs](../../../frontend/tests/run-analysis.mjs) | include new units/browser suite in repeatable runner |
| Existing overview/redesign/live smoke tests | update changed labels/states and separate check/open interaction; keep value/negative-rule assertions |

FE-R2 changes10 existing production files +1 new production helper,4 existing
test files +2 new tests. Worktree also contains earlier FE-R1 changes, which are
not all attributable to this phase. Existing untracked17 files (audit/FE-R1/docs/
screenshots/helper) preserved byte-for-byte against FE-R2 baseline fingerprints.

## 7. Tests và accessibility

| Gate | Kết quả thực chạy |
|---|---|
| Baseline trước sửa |48/48 units +2 browser suites (redesign/integrity) PASS |
| Final units |52/52 mỗi lượt ×2,104 executions,0 fail/skip |
| Final browser |10/10 suite mỗi lượt ×2,20/20 executions PASS; gồm9 FE-R1 +1 FE-R2 |
| Fresh manifests |22/22 runner rows PASS;20 browser manifests đều BROWSER_FIXTURE_ONLY/PASS/errors=[]; runtimeWarnings=[] ở FE-R2 |
| Lint |exit0,0 errors/warnings; `target/fa-fe-r2-lint-release.log`, kiểm lại harness cuối ở `target/fa-fe-r2-lint-final.log` |
| TypeScript |exit0,0 diagnostics; `target/fa-fe-r2-typescript-release.log` |
| Production build |exit0; `target/fa-fe-r2-build-release.log` |
| Java API/service/snapshot contracts |26/26 pass,0 failure/error/skip, BUILD SUCCESS; `target/fa-fe-r2-api-contract.log` |
| Repository documentation |5/5 pass,0 failure/error/skip, BUILD SUCCESS; `target/fa-fe-r2-repodocs.log` |
| Live DB smoke/native accessibility/Figma |BLOCKED hoặc NOT_RUN theo phạm vi mô tả dưới đây |

Đã kiểm riêng toàn bộ20 fresh child manifests và exit0 của runner; không cộng
các artifacts cũ/focused runs vào số final. Summary bền vững tại
[regression-summary.json](fe-r2-evidence/regression-summary.json); logs/screenshots
đầy đủ tại `data/analysis-fe-r2/release-final/`.

Hai lỗi harness trong quá trình mở rộng tests: selector sidebar khớp cả parent và
nút mở rộng; assertion snapshot trống khớp nhầm static heading. Đã chọn accessible
name cụ thể/heading có ID, không đổi fixture scalar hoặc bỏ assertion. Một lint
warning ternary statement đã sửa bằng if/else. Lần gọi `tsc` nhầm từ root không
nạp compiler frontend; đã chạy đúng lại trong frontend và pass. Lượt
`regression-first/` FAIL được giữ nguyên làm lịch sử, không trình bày là PASS.

Commands from frontend:

```powershell
npm.cmd run test:analysis -- --repeat=1
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3142
$env:ANALYSIS_UI_URL = 'http://127.0.0.1:3142'
$env:ANALYSIS_TEST_OUTPUT = 'F:\CodeVipChu\SEP490-FA26-G15\data\analysis-fe-r2\release-final'
npm.cmd run test:analysis -- --browser --repeat=2
```

From repository root:

```powershell
.\mvnw.cmd -B '-Dtest=AnalysisApiContractTest,AnalysisServiceTest,AnalysisDatasetTest,AnalysisSnapshotTest' test
.\mvnw.cmd -B '-Dtest=RepoDocsTest' test
```

Measured/browser scope: native disclosures and real select/click/keyboard events;
focus return/error focus/visible focus; table captions and scroll region; status
names/text;320/375/768/1280/1440px; reduced-motion.200% CDP pinch plus720px reflow
check are recorded separately from native browser zoom. No WCAG certification,
screen-reader or native touch claim. HTTP fixtures do not prove live authorization.

Negative variant-isolation path adds an explicitly UI-only metadata sibling with
another seed; original parity file/scalars unchanged. It is not a new recorded
physical observation or Golden18 ground truth. API contract fixtures are checked
by Java service tests; source/DB dependencies are mocked there.

## 8. Screenshots và evidence

Bảy ảnh được tuyển từ fresh baseline FE-R1 trước sửa và FE-R2 pass2 trên build
cuối; không dựng ảnh before giả. Dùng tên/UI fixture rõ ràng, không phải actual
CARLA run vừa được chạy. Hash/kích thước/nguồn từng ảnh trong
[screenshots-manifest.json](fe-r2-evidence/screenshots-manifest.json);
[workflow-result.json](fe-r2-evidence/workflow-result.json) giữ12 nhóm kiểm tra
thực chạy của suite mới, errors/runtimeWarnings rỗng.

| Minh họa | Ảnh |
|---|---|
| Workspace trước FE-R2 |[Desktop](fe-r2-evidence/before-workspace-1440.png) |
| Rà soát trước FE-R2 |[Review](fe-r2-evidence/before-dataset-review.png) |
| Workspace sau FE-R2 |[Desktop](fe-r2-evidence/after-workspace-1440.png), [mobile](fe-r2-evidence/after-workspace-375.png) |
| Lỗi chốt, giữ draft/revision |[Action error](fe-r2-evidence/after-freeze-rejected.png) |
| Kiểm tra thành công, mở tối ưu là action riêng |[Checked snapshot](fe-r2-evidence/after-snapshot-checked.png) |
| Snapshot stale chỉ đọc |[Stale snapshot](fe-r2-evidence/after-snapshot-stale.png) |
All screenshots are production Next build + Edge with HTTP fixtures; not a live
CARLA/DB campaign. Evidence folder: [fe-r2-evidence](fe-r2-evidence/).

## 9. Remaining blockers và dừng FE-R2

- BLOCKED/live E2E: no isolated backend/test DB or `data/analysis-integration/evidence.json`.
  Owner QA + backend/security. Live `analysis-ui-smoke.mjs` adapted, not run; no DB
  provisioning/migration or production data writes to make tests pass.
- B01–B05: JSON intake/core execution/report/M1C export still lack REST. Owner
  module3 backend/contracts; FE-R2 adds no Analyze V3 button/resource/mock API.
- B06/B07/B12/B15: provenance/legacy outcome/count-denominator issues remain with
  backend/metric owners. No FE recomputation/dedup/scientific explanation rewrite.
- B08: optimizer frozen-cohort consumer execution remains module4/M2; UI navigation
  and GET validation are not a ready-to-run certificate.
- B10/B11/B13: global search, full v1/archive renderer/export/dataset history need
  their scoped follow-up/backend capabilities. No new history/export API invented.
- Figma/native browser zoom/screen reader/native touch not verified; no design
  link or dedicated manual accessibility environment supplied.

Do not proceed to FE-R3, FE-R4 or backend integration. No branch change,
commit/push/merge. Commands/counts và log hashes tại
[verification-manifest.json](fe-r2-evidence/verification-manifest.json).

Source-scope evidence:
[source-scope.json](fe-r2-evidence/source-scope.json). Baseline2446 tracked +17
untracked files;14 tracked files đổi so FE-R1,2432 tracked giữ nguyên;17 existing
untracked giữ nguyên byte-for-byte. Zero changes ngoài frontend scope đã giao.
Thêm report/ảnh/exec-plan theo yêu cầu; index không staged, HEAD không đổi.

## 10. Acceptance mapping

| Yêu cầu kiểm tra tối thiểu | Bằng chứng |
|---|---|
|1 Filter → detail → return |workflow-ui, redesign URL/filter/page/q/sort assertions |
|2 Rapid filter responses |workflow-ui giữ/release response RUNNING sau COMPLETED; integrity stale-run probes |
|3 Project/account isolation |workflow-ui chọn project thật qua shared UI, logout/login; giữ/release cả old GET và old POST |
|4 Page-only search/sort |workflow-ui/redesign/overview; search không sinh global query |
|5 Empty/no match/API error |workflow-ui: baseline trống, filter trống, search trang trống, network/403/503/malformed; retry |
|6 Not-completed detail |workflow-ui status-only, không objective panel; GET kiểm tra lại |
|7 Close/reopen draft |workflow-ui đóng/Enter mở, focus return và storage equality; redesign reload |
|8 Role/variant isolation |workflow-ui gán lại role và UI-only sibling variant khác seed; FE-R1 negative source/seed/SAFE/limit cases |
|9 Double-click mutation |workflow-ui held POST, disabled/lock, chỉ1 request |
|10 Freeze rejection |400/409/429/500/403 giữ draft/revisions; error focus và không tự POST |
|11 Archive/current |workflow-ui v2 baseline_current false vs true; absent handoff flag không tự ready; v1 renderer vẫn follow-up |
|12 Stale handoff |409/403/notready/payload mismatch; không mở optimizer action |
|13 Read-only403 |workflow-ui role MANAGER disabled; server403 reads/actions; FE-R1 read-only regression |
|14 Session401 |workflow-ui shared expiry event, token cleared, về login và không rows cũ |
|15 No retry429 |workflow-ui đổi filter sau rejection không phát POST; draft giữ |
|16 Playback return/time |workflow-ui recorded1.25s, signal/compare/regression return; dedicated playback/telemetry suites |
|17 Deep links |FE-R1 four view aliases/three sections; integrity/regression return whitelist |
|18 Responsive/focus/zoom |5 widths, local table scroll/keyboard focus-visible; reduce motion; CDP pinch200% +720px reflow; native zoom/manual a11y NOT_RUN |

Không tuyên bố live E2E, consumer execution, full backend suite hoặc WCAG certified.
Dừng sau FE-R2. Server production kiểm thử riêng3142 được dừng sau kiểm chứng.

## 11. Git status cuối

Các thay đổi FE-R1/audit có sẵn vẫn nằm trong status; bảng §6 chỉ tính delta FE-R2.

```text
 M frontend/src/app/analysis/failures/[runId]/page.tsx
 M frontend/src/app/analysis/failures/[runId]/playback/page.tsx
 M frontend/src/app/analysis/failures/analysis.css
 M frontend/src/components/AnalysisSelectionSummary.tsx
 M frontend/src/components/BaselineAnalysisDashboard.tsx
 M frontend/src/components/LegacyFailureCases.tsx
 M frontend/src/components/analysis/AnalysisDatasetPreparation.module.css
 M frontend/src/components/analysis/AnalysisDatasetPreparation.tsx
 M frontend/src/components/analysis/AnalysisOverview.module.css
 M frontend/src/components/analysis/AnalysisOverview.tsx
 M frontend/src/components/analysis/AnalysisRunEvidence.tsx
 M frontend/src/components/analysis/AnalysisRunExplorer.module.css
 M frontend/src/components/analysis/AnalysisRunExplorer.tsx
 M frontend/src/components/analysis/AnalysisRunSummary.tsx
 M frontend/src/components/analysis/analysisRouteTitles.ts
 M frontend/src/components/analysisUi.tsx
 M frontend/tests/analysis-classification-ui.mjs
 M frontend/tests/analysis-evidence-ui.mjs
 M frontend/tests/analysis-explainability-ui.mjs
 M frontend/tests/analysis-integrity-ui.mjs
 M frontend/tests/analysis-metrics-ui.mjs
 M frontend/tests/analysis-overview.mjs
 M frontend/tests/analysis-redesign.mjs
 M frontend/tests/analysis-telemetry-ui.mjs
 M frontend/tests/analysis-ui-smoke.mjs
 M frontend/tests/run-analysis.mjs
?? docs/exec-plans/completed/2026-11-25-failure-analysis-frontend-backend-first-audit.md
?? docs/exec-plans/completed/2026-11-25-fe-r1-failure-analysis-ux-simplification.md
?? docs/exec-plans/completed/2026-11-25-fe-r2-failure-analysis-workflow.md
?? docs/failure-analysis-v3/frontend-redesign/
?? frontend/src/components/analysis/analysisSnapshotData.ts
?? frontend/tests/analysis-workflow-ui.mjs
?? frontend/tests/analysis-workflow.mjs
?? frontend/tests/helpers/analysis-disclosures.mjs
```
