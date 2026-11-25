# FE-R1 — Failure Analysis UX simplification

Ngày 25/11/2026. Baseline source: `d712146c2ee03de8d751725c506eb1d4a814d2d8`.
Phạm vi: tổ chức lại frontend Failure Analysis đang dùng API hiện có. Không triển khai FE-R2, core V3.1 REST, export mới hoặc consumer MOBO.

## 1. Kết quả triển khai

Primary hierarchy còn **một workspace và một trang kết quả run**. Playback giữ route riêng như công cụ chuyên sâu. Không còn AnalysisNav bốn tab lớn; không còn bảng shortcut lặp lại.

| Trước | Sau FE-R1 |
|---|---|
| Overview, Runs, Failures, Dataset là 4 mode navigation ngang hàng | Workspace “Dữ liệu & kết quả”: filter → tổng quan gọn → một bảng run; legacy lookup/dataset là phần mở rộng |
| Overview có bảng 5 shortcut và Runs có bảng riêng | Một bảng chính có 3 objective, đơn vị và “Xem kết quả” |
|4 filter chính, nhiều thông tin nguồn ở các cột riêng | Họ + trạng thái là filter chính; phần còn lại mở rộng. Nguồn/cấu hình từng row nằm trong details |
| Trang mặc định 30 row; bảng8cột | Mặc định 10 row, vẫn chọn10/20/30/50;6 cột mặc định, thêm cột gán vai trò khi chuẩn bị bàn giao |
| Các phân bố/kỹ thuật/aggregate chiếm overview mặc định |3 KPI ngắn, thống kê đầy đủ và objective groups dưới disclosure; không gộp identity/metric ở client |
| Run detail mở tab summary/config, timeline luôn ở ngoài | Identity/status → kết quả/nhận định legacy →3objectives → giới hạn bằng chứng → Điều tra mở rộng |
| Timeline, scene, cấu hình, chỉ số bổ sung xuất hiện dày | Timeline/Telemetry/Bằng chứng ở Điều tra; scene/config/secondary metrics/ca gần nằm trong details |
| Classification lặp lại ở summary và evidence | Giữ một presentation đánh giá/phân loại ở summary; stage evidence vẫn ở Điều tra |
| XOSC/CARLA/playback là toolbar chính | “Phát lại và tác vụ khác”, giữ thao tác và lỗi thực; không gọi mô phỏng là chạy chẩn đoán |
| “Tối ưu toàn họ” có thể mặc định chọn family đầu | Link phụ khi người dùng đã chọn họ; ghi rõ không dùng bản nháp hiện tại |
| Bàn giao có thể tạo cảm giác receiver đã consume dataset | CTA “Kiểm tra tập và mở module tối ưu”, giữ server recheck; nêu rõ navigation chưa chứng minh consumer thực thi cohort |

Đã giữ các read/selection/freeze/handoff handlers, source guards và business rules. Không thêm upload/Analyze V3/download Diagnostic Report giả. Không tạo score, hint, range, xác nhận root cause hoặc baseline mới.

## 2. Route và deep-link mapping

| Link hiện có | FE-R1 |
|---|---|
| `/analysis/failures`, `?view=overview`, `?view=runs` | cùng workspace, bảng run hiện trực tiếp |
| `?view=failures&f_*` | workspace + legacy lookup mở; f_* vẫn là bộ lọc API failures riêng |
| `?view=dataset&dataset_id=...` | workspace + review/snapshot mở; main table vẫn dùng được để chọn run |
| `/{runId}?section=summary` hoặc không section | summary và 3 objectives; Điều tra đóng |
| `/{runId}?section=telemetry&t=...&signal=...` | summary vẫn có, Điều tra mở đúng Telemetry và recorded cursor |
| `/{runId}?section=evidence` | Điều tra mở đúng Bằng chứng |
| `/{runId}/playback?...` | giữ route/clock/rate/signal/compare/returnTo |
| `returnTo` từ danh sách/regression | giữ whitelist, filter/page/search/sort/compare context; browser Back còn hoạt động |

Không đổi REST endpoints/request/response. `vehicsim.analysis-dataset/v2` hiện có vẫn khác MOBO Handoff V3.1. Snapshot GET không được coi là current handoff approval; `proceed` vẫn gọi server kiểm lại trước navigation.

## 3. Các bất biến giữ nguyên

- 3 canonical values/nulls/units và `adr040-stored-aggregation/1` được đọc từ response, không re-score hoặc tổng hợp lại ở FE. Per-run impact thiếu/không va chạm vẫn “—”; aggregate0 chỉ từ backend contract.
- Classification vẫn là legacy theo luật; collision chưa chứng minh confirmed AEB failure. Jerk biểu đồ không thay RMS canonical, mốc lệnh không thành applied physical brake.
- `analysisSelectionData`/selection checks không thay: source identity, hai roles, variant isolation, unique variant+seed, safe mỗi tập, completed/trace/revision, current baseline và limit500/role.
- Session draft vẫn dùng account+project key và giữ revision nguồn; filter/page/đóng panel không xóa draft. Snapshot không bị sửa bởi chỉnh draft. Busy/error/read-only/currentness checks giữ nguyên.
- Timeline/trace/GT-vs-perception/quality/unknown/evidence/source references API đang có vẫn truy cập được qua Điều tra. Không tự tạo clock alignment, missing reasons hay causal certainty khi API thiếu.
- API/client/types, backend/source core, DB/schema, AEB/CARLA/MOBO, shared shell/sidebar/auth/visual components không đổi. Không commit/push/merge.

## 4. Files thay đổi

13 production files, đều thuộc frontend Failure Analysis:

| File | Thay đổi |
|---|---|
| [BaselineAnalysisDashboard.tsx](../../../frontend/src/components/BaselineAnalysisDashboard.tsx) | một workspace, filter chính, disclosure legacy/dataset; default10row; giữ draft/mutations/revisions |
| [LegacyFailureCases.tsx](../../../frontend/src/components/LegacyFailureCases.tsx) | embedded mode tránh lồng page/h1; CSV vẫn đúng scope |
| [analysisUi.tsx](../../../frontend/src/components/analysisUi.tsx) | gỡ AnalysisNav/ANALYSIS_VIEWS và imports không dùng; giữ guards/pager/return helpers |
| [analysisRouteTitles.ts](../../../frontend/src/components/analysis/analysisRouteTitles.ts) | các view aliases cùng workspace title; giữ signature metadata compatibility |
| [AnalysisOverview.tsx](../../../frontend/src/components/analysis/AnalysisOverview.tsx) |3 KPI, advanced distributions/groups, gỡ shortcut table |
| [AnalysisOverview.module.css](../../../frontend/src/components/analysis/AnalysisOverview.module.css) | compact summary responsive |
| [AnalysisRunExplorer.tsx](../../../frontend/src/components/analysis/AnalysisRunExplorer.tsx) | bảng chính6cột, source details, selection column theo task; empty-state link |
| [AnalysisRunExplorer.module.css](../../../frontend/src/components/analysis/AnalysisRunExplorer.module.css) | độ rộng/khoảng cách/label phù hợp table mới |
| [AnalysisDatasetPreparation.tsx](../../../frontend/src/components/analysis/AnalysisDatasetPreparation.tsx) | bỏ stepper lặp, sửa copy bàn giao; giữ checks/save/snapshot/currentness |
| [result page](../../../frontend/src/app/analysis/failures/[runId]/page.tsx) | summary luôn có; Điều tra/two internal tabs; source và tác vụ phụ mở rộng |
| [AnalysisRunSummary.tsx](../../../frontend/src/components/analysis/AnalysisRunSummary.tsx) | tách summary/objectives/limits khỏi context kỹ thuật trong cùng file |
| [AnalysisRunEvidence.tsx](../../../frontend/src/components/analysis/AnalysisRunEvidence.tsx) | bỏ classification block lặp; giữ stage measurements/score/source links |
| [analysis.css](../../../frontend/src/app/analysis/failures/analysis.css) | scope local, disclosures/focus/mobile và mật độ bố cục; không chỉnh shared shell |

Tests đã cập nhật: `analysis-integrity-ui.mjs`, `analysis-overview.mjs`, `analysis-classification-ui.mjs`, `analysis-metrics-ui.mjs`, `analysis-explainability-ui.mjs`, `analysis-evidence-ui.mjs`, `analysis-redesign.mjs`, `analysis-telemetry-ui.mjs`, `analysis-ui-smoke.mjs`. Thêm [analysis-disclosures.mjs](../../../frontend/tests/helpers/analysis-disclosures.mjs): test-only interactions bằng click/keyboard thật, không sửa DOM open flags để bỏ qua UI.

Overview/redesign harness được tổ chức lại theo hierarchy mới. Các assertion về shortcut/bốn tab được thay bằng single table/disclosures; vẫn kiểm scalar/null/unit/source, lỗi/role/context và draft/revision/freeze/currentness. Các suite chuyên telemetry/playback/evidence/contract tiếp tục chạy. Live smoke cập nhật navigation nhưng chưa thực thi vì thiếu môi trường isolated bên dưới.

Không xóa APIs/types/routes legacy có caller khác. `AnalysisDatasetPanel.tsx` không có importer production nhưng được giữ nguyên byte-for-byte vì còn historical source links trong inventory; không có surface v1 này trong workspace mới. Không tạo archive renderer mới thuộc FE-R4.

## 5. Verification

Đã đọc cả9 blueprint, AGENTS/CLAUDE/frontend guidance, current FA handover, metric contract/ADR-055 và Next16 installed navigation guidance. Recheck source xác nhận controller hiện vẫn gọi AnalysisService/AnalysisViewService, không new core REST.

Baseline trước sửa:48/48 frontend units pass; TypeScript exit0. Trong quá trình đổi layout, một số browser assertions cũ thất bại vì tìm tab đã gỡ/nội dung đã thu gọn; đã cập nhật thao tác disclosure và chờ state commit, không sửa giá trị metric/fixtures để ép PASS. Một lint warning unused compatibility parameter đã xử lý.

Lệnh từ `frontend/`:

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3141
$env:ANALYSIS_UI_URL = 'http://127.0.0.1:3141'
$env:ANALYSIS_TEST_OUTPUT = 'F:\CodeVipChu\SEP490-FA26-G15\data\analysis-fe-r1\release-final'
npm.cmd run test:analysis -- --browser --repeat=2
```

| Gate | Kết quả |
|---|---|
| Unit suites bản cuối |48/48 pass mỗi lượt,2 lượt (96 executions),0 fail/skip |
| Browser suites bản cuối |9/9 suite mỗi lượt,2 lượt đảo thứ tự,18/18 executions PASS;0 suite fail |
| Focused screenshot run |analysis-redesign PASS; logged-in UI qua HTTP fixtures |
| Lint |PASS exit0,0 errors/warnings; `target/fa-fe-r1-lint-release.log` |
| TypeScript |PASS exit0,0 diagnostics; `target/fa-fe-r1-typescript-release.log` |
| Production build |PASS exit0 sau compact spacing cuối; `target/fa-fe-r1-build-release.log` |
| Release regression sau compact spacing |PASS exit0;20/20 result rows (2 unit runs +18 browser runs); mọi fresh browser manifest là `BROWSER_FIXTURE_ONLY`, `errors=[]` |
| Repository documentation check |5/5 pass,0 failure/error/skip; BUILD SUCCESS; `target/fa-fe-r1-repodocs.log` |

Bằng chứng cuối: `data/analysis-fe-r1/release-final/summary.json`, mỗi suite có fresh result.json/log và screenshots. Runner đã xác nhận exit0, hai lượt đều PASS; đã kiểm riêng đủ18 manifest, không có BASELINE capture được tính PASS. Lượt trước compact cũng pass tại `data/analysis-fe-r1/final/summary.json`, không cộng thêm vào số kiểm tra cuối. Lượt `release/` sau chỉnh spacing đã phát hiện một timing race trong telemetry harness: URL đã đổi nhưng React chưa commit readout. Test được sửa để chờ readout/cursor thực sự cập nhật và rời hover trước keyboard; không thay giá trị/assertion hay shared chart. Kết quả rerun độc lập bên dưới mới là gate cuối.

Coverage thực: login UI qua intercepted HTTP fixtures; routing/aliases/Back; loaded-page search/sort; keyboard/native disclosures/tabs/table focus;320/375/390/768/1024/1280/1440viewport tùy suite; source/null/zero/signed metrics; malformed/empty/loading/network/403/503/retry; stale response/run switching; draft/roles/revisions; mixed-source/variant/seed/safe/trace/limit/corrupt-cache gates; snapshot reload/stale baseline/handoff refusal; XOSC error/recorded playback. Các scope này không chứng minh live authorization hoặc consumer execution.

Chưa chạy live `analysis-ui-smoke.mjs`: thiếu `data/analysis-integration/evidence.json` và backend/test DB isolated được provision cho smoke. Không tự tạo DB/schema hoặc sửa module khác để chạy. Không chạy CARLA/MOBO, full Java suite, screen reader/native touch hoặc đối chiếu Figma (không có design link). Không tuyên bố WCAG certification/live DB integration.

Lệnh từ root cho documentation check:

```powershell
.\mvnw.cmd -B '-Dtest=RepoDocsTest' test
```

Đã kiểm riêng107 local Markdown/image links trong10 tài liệu frontend-redesign:0 thiếu. `git diff --check` sạch.

## 6. Before/after và screenshots

Before được mô tả trong §1 và9 audit gốc; không dựng ảnh “before” giả. After dùng production Next build + Edge, HTTP fixtures kiểm thử có ghi rõ danh tính fixture, không phải Golden18/CARLA mới chạy. Bốn ảnh viewport được giữ cùng report; ảnh full-page/expanded/error states nằm trong test artifacts. Bốn ảnh cuối được chụp riêng sau compact spacing, có capture manifest `data/analysis-fe-r1/curated-release/capture.json` với `UI_CAPTURE_ONLY`, không coi capture là test PASS.

| Surface | Desktop | Mobile |
|---|---|---|
| Dữ liệu & kết quả |[1440px](screenshots/fe-r1-workspace-1440.png) |[375px](screenshots/fe-r1-workspace-375.png) |
| Kết quả run |[1440px](screenshots/fe-r1-result-1440.png) |[375px](screenshots/fe-r1-result-375.png) |

## 7. Remaining blockers / dừng ở FE-R1

- B01–B05: JSON intake, V3.1 execution/report resource và M1C handoff chưa có REST; FE-R1 không bổ sung các capability này.
- B06/B07/B12: metadata/provenance/legacy outcome semantics còn giới hạn đã audit. FE không sửa canonical values hoặc hợp thức hóa legacy classification thành V3 diagnosis. Giải thích/formula chuyên sâu vẫn cần task/version provenance riêng.
- B08/B14: MOBO frozen-cohort consumption, calibration/physical-limit/root-cause authority chưa được xác nhận bởi UI/navigation. Không bật dispatch/điền score/range.
- Snapshot v1 archive handling/report export đầy đủ vẫn thuộc task sau; không convert snapshot ở client.
- B15: nguy cơ SQL join nhiều failure rows/run ở dashboard vẫn là vấn đề backend có điều kiện; FE không tự deduplicate và đổi denominator. Chi tiết các owner ở [09](09_BACKEND_BLOCKERS_AND_DEPENDENCIES.md).

Chỉ implementation FE-R1 về composition/navigation/disclosure và regression tương ứng. Không tự triển khai FE-R2/R3/R4/R5, backend API hoặc MOBO integration. Những tests đã chạy ở đây là kiểm chứng bắt buộc của FE-R1, không phải tuyên bố hoàn thành phase FE-R5.

## 8. Scope và git

Worktree ban đầu đã có9 audit documents và audit execution record chưa tracked; giữ nguyên. Thêm report này,4 screenshots và exec-plan theo root AGENTS. Fingerprint 626 tracked files trước/sau được kiểm; 22 files thay đổi (13 production +9 browser test files),604 files giữ nguyên; mọi thay đổi thuộc frontend scope cho phép, backend/schema/shared modules không đổi. Helper mới không nằm trong626file baseline này. Index không có staged changes. Git status cuối được ghi dưới đây cùng completion record; không commit/push/merge. Server production kiểm thử riêng tại3141 đã được dừng sau verification.

`git status --short` sau khi hoàn tất (9 audit docs và audit plan đã có từ đầu nằm trong untracked directory):

```text
 M frontend/src/app/analysis/failures/[runId]/page.tsx
 M frontend/src/app/analysis/failures/analysis.css
 M frontend/src/components/BaselineAnalysisDashboard.tsx
 M frontend/src/components/LegacyFailureCases.tsx
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
?? docs/exec-plans/completed/2026-11-25-failure-analysis-frontend-backend-first-audit.md
?? docs/exec-plans/completed/2026-11-25-fe-r1-failure-analysis-ux-simplification.md
?? docs/failure-analysis-v3/frontend-redesign/
?? frontend/tests/helpers/analysis-disclosures.mjs
```
