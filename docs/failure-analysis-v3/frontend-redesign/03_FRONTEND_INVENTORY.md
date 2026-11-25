# 03 — Inventory frontend chỉ trong Failure Analysis

Audit source25/11/2026; không phải usability test với người dùng hay browser screenshot review. Backend truth đã lập trước ở [01](01_BACKEND_CAPABILITY_AUDIT.md). Phân loại feature/action đầy đủ ở [04](04_KEEP_MERGE_REMOVE_MATRIX.md).

## 1. Routes và entry points

Prefix file: [`frontend/src/app/analysis/failures/`](../../../frontend/src/app/analysis/failures/).

| File / route | Hành vi thực | Data/API | Nhận định |
|---|---|---|---|
| `page.tsx` → `/analysis/failures` | Server metadata từ searchParams; render BaselineAnalysisDashboard | client fetch ở dashboard | Một route chứa4 view; không phải4 backend analysis engines |
| `layout.tsx`, `analysis.css` | scope `.analysis-workspace`; CSS nav/table/focus/responsive/reduced motion | không fetch | giữ module scope, không sửa global shell |
| `[runId]/page.tsx` → `/analysis/failures/{runId}` | inspection; `section=summary|telemetry|evidence`; cursor t,signal,returnTo,compare | GET analysis/runs/{id} | một page có3tabs và timeline chung |
| `[runId]/layout.tsx` | generateMetadata run title | pure helper | giữ valid-ID title |
| `[runId]/playback/page.tsx` → `/analysis/failures/{id}/playback` | recorded playback/clock/rates/event seek/layers/related run | GET runs/{id}/playback | deep tool, không thêm primary navigation |
| `[runId]/playback/layout.tsx` | playback metadata | pure helper | giữ route/deep links |

Shared [`vehicsimFlow.ts`](../../../frontend/src/components/vehicsimFlow.ts) có một entry “Kết quả & phân tích” ở journey và MVP step tới `/analysis/failures`. [`VehicSimShell`](../../../frontend/src/components/VehicSimShell.tsx) nhận diện prefix này, có global run search và ProjectGate. Chỉ đọc để giữ link/context; **không chỉnh sidebar/layout/shell**. `/analysis/carla` thuộc module2 dù cùng `/analysis` prefix; `/projects/[projectId]/results` cũng ngoài phạm vi redesign.

## 2. Containers, forms và local state

| File | Vai trò/call graph | State/validation | Classification |
|---|---|---|---|
| [BaselineAnalysisDashboard.tsx](../../../frontend/src/components/BaselineAnalysisDashboard.tsx) | 4 view overview/runs/failures/dataset; fetch dashboard, freeze selection, load archive, revalidate handoff | URL filters/page/size/q/sort/dataset_id; keyed responses; draft role map in sessionStorage scoped account+project; canWrite; revision check server | REPLACE bố cục; KEEP selection guards/context |
| [LegacyFailureCases.tsx](../../../frontend/src/components/LegacyFailureCases.tsx) | active ở `view=failures`; fetch failures/CSV; render explorer | bộ query riêng f_*, key request/error, export error/scope | MERGE entry vào công cụ tra cứu; không xóa query contract |
| [AnalysisSelectionSummary.tsx](../../../frontend/src/components/AnalysisSelectionSummary.tsx) | snapshot v2 + ObjectiveSummary; dùng bởi DatasetPreparation | local page20, explicit opt/val roles, warning baseline/currentness | KEEP, đặt dưới export/review |
| [AnalysisDatasetPanel.tsx](../../../frontend/src/components/AnalysisDatasetPanel.tsx) | v1 preview table/pagination8 | local page; label legacy | REMOVE sau import/reference gate; hiện không có importer production |
| [analysisUi.tsx](../../../frontend/src/components/analysisUi.tsx) | AnalysisNav4views, badge/loading/pager/table region/errors, eligible, safe return links | permission labels; metadata eligibility only; returnTo nội bộ | MERGE nav; KEEP helpers; không dùng eligible như server proof |

Không thấy custom `useAnalysis*` hook hoặc Zustand/Redux store riêng trong scope. Hooks trực tiếp React (`useEffect/useState/useMemo/useCallback/useReducer`) nằm ở containers/charts; auth/project hooks là shared dependencies. Không cần tạo store/hook framework mới chỉ vì redesign. Không có modal nhập JSON hay analysis-job progress trong source hiện tại. Forms là filter/search/select/range, role assignment, freeze/retry/handoff; metric explanation dùng native `<details>`, không modal.

## 3. Toàn bộ thư mục components/analysis

Mỗi tên file dưới đây nằm trong [`frontend/src/components/analysis/`](../../../frontend/src/components/analysis/). CSS được ghi riêng để không bỏ sót inventory.

| File(s) | Consumers / responsibility | Quyết định đề xuất |
|---|---|---|
| `AnalysisOverview.tsx`, `AnalysisOverview.module.css` | dashboard overview; KPI4, distribution bars/progress, technical counts, five run shortcuts, objective group accordions | MERGE summary vào workspace; bỏ bảng shortcut lặp nếu table ngay dưới |
| `analysisOverviewData.ts` | runtime guard/count/group/version/percentage; dùng production overview | KEEP guards; không suy null count bằng0 |
| `AnalysisRunExplorer.tsx`, `AnalysisRunExplorer.module.css` | runs view table, loaded-page search/sort, selection and detail/playback links | KEEP table logic, REPLACE hierarchy/columns; label local page search rõ |
| `AnalysisFailureExplorer.tsx`, `AnalysisFailureExplorer.module.css` | legacy failure KPI/stage distribution/filters/table/evidence/CSV context | MERGE advanced legacy lookup; không giả server outcome filter của runs API |
| `analysisFailurePresentation.ts` | stage/outcome/filter lists, unit dictionary, positiveId | KEEP boundary guards; taxonomy legacy để riêng |
| `AnalysisDatasetPreparation.tsx`, `AnalysisDatasetPreparation.module.css` | selected draft, two groups, validation checklist, freeze and archive/handoff; contains stepper + several panels | MERGE thành export review panel trên workspace; giữ hai partition bắt buộc |
| `analysisSelectionData.ts` | sourceIdentity/selectionChecks/restoreSelection | KEEP; metadata checks ≠ authoritative eligibility |
| `AnalysisRunSummary.tsx`, `AnalysisRunDetail.module.css` | detail summary, result/classification/objectives/explanations, scene/config/environment/similar cases; exports RunFact | REPLACE first-screen density; KEEP facts/guards; fix provenance copy in future task |
| `analysisRunData.ts` | finite/recordedAt/recordedRange/runMarkers; detail/telemetry/evidence helpers | KEEP exact source timestamps; do not infer physical onset |
| `AnalysisClassification.tsx`, `analysisClassificationData.ts` | legacy evaluation status vs failure label; used in summary/evidence/playback | MERGE repeated blocks; KEEP trusted gating; V3 candidates need separate future contract |
| `AnalysisMetricExplanation.tsx`, `AnalysisMetricExplanation.module.css` | native details per metric; deep links evidence/telemetry | KEEP progressive disclosure, REPLACE unsupported method claims |
| `analysisMetricExplanationData.ts` | static method dictionary7metrics; selects CP/lead/sim method; reads stored inputs, no recompute | REPLACE profile hardcodes with conservative version-backed copy; cannot stand in for core ObjectiveExplainer |
| `analysisMetricFormat.ts` | small/scientific/finite formatting, null/objective status guards, unit conversion | KEEP; display precision ≠ canonical aggregation rounding |
| `AnalysisRunTelemetry.tsx` | exports timeline + telemetry content; chart hover sync, cursor facts, signal selection | KEEP; move timeline only into investigation to reduce summary noise |
| `TelemetryChartParts.tsx`, `TelemetryChart.module.css` | recorded paths/markers/quality/readout shared by TTC/speed and motion chart | KEEP no bridging missing/invalid times; accessibility must be retested |
| `telemetryChartData.ts` | prepareChartSeries/nearestChartSample/chartEnd; discontinuity/quality counters | KEEP diagnostic display only; not physics/re-scoring |
| `AnalysisRunEvidence.tsx`, `AnalysisRunEvidence.module.css` | source timestamp list; legacy stage evidence cards, assumptions/confidence caveat | MERGE under investigation; don't label these V3 dossiers |
| `analysisEvidenceData.ts` | stage-specific fields/units/source path projections; seek validity/link construction | KEEP unknown units/time unresolved; no invented source refs |
| `AnalysisPlaybackTimeline.tsx` | exports PlaybackTimeline/PlaybackEvents; slider/rate/event grouping/keyboard buttons | KEEP advanced playback tool |
| `AnalysisPlaybackScene.tsx` | exports PlaybackScene/PlaybackFacts; source coordinates/layers/GT/perceived; shared ScenarioMap | KEEP declared reconstruction; do not call sensor video/contact proof |
| `AnalysisPlayback.module.css` | responsive playback layout/event focus/scene dimensions | KEEP scope, retest small targets/scroll |
| `playbackPresentation.ts` | filters invalid timestamps, sorted view copies, duplicate/backward counters, event labels/status, no inference from speed | KEEP source identity and quality disclosures |
| `playbackClockData.ts` | reducer/load/tick/seek/pause/rate, requestKey and recorded index; used by playback page | KEEP no autoplay/hidden-tab pause/stale request guard |
| `analysisRouteTitles.ts` | valid run ID + page/view document titles, server layouts/analysisUi | KEEP; migrate legacy query titles with aliases |

Adjacent chart/component dependencies: [TelemetryChart](../../../frontend/src/components/TelemetryChart.tsx), [MotionTelemetryChart](../../../frontend/src/components/MotionTelemetryChart.tsx), [ScenarioMap](../../../frontend/src/components/ScenarioMap.tsx), [VehicSimUi](../../../frontend/src/components/VehicSimUi.tsx), [VehicSimPage](../../../frontend/src/components/VehicSimPage.tsx), [VehicSimContext](../../../frontend/src/components/VehicSimContext.tsx), [AuthContext](../../../frontend/src/context/AuthContext.tsx), i18n. Read/reuse only; shared changes require separate scope. If a needed local presentation cannot be expressed by composition/props already supported, log dependency rather than expand FE-R1 into shared redesign.

## 4. API client, data flow và action inventory

[`services/vehicsim.ts`](../../../frontend/src/services/vehicsim.ts) is business client; [`services/api.ts`](../../../frontend/src/services/api.ts) is transport. Exact mapping/DTO drift ở [02](02_API_AND_DATABASE_MAPPING.md).

| UI action | Actual operation | Có hoạt động theo source? / giới hạn |
|---|---|---|
| Filter/fetch/retry overview/runs | GET analysis/runs | Có; URL/server scope; query/sort bên trong table chỉ loaded page |
| Open detail | GET analysis/runs/{id} | Có; status-only khi chưa hoàn tất; not a new analysis execution |
| Change section/signal/time | local URL/state + recorded data | Có; không tự tạo signal/metric; timeline/seek retain context |
| Open evidence/metric explanation | same detail data + static copy | Có cho legacy evidence; không gọi V3 core |
| Playback/rates/layers/event seek | GET playback + local display clock | Có; reconstructed scene ≠ camera video |
| Similar/related run | links from detail/playback | Có lookup; not all pair identity returned; không causal/paired assurance chỉ từ label |
| Assign optimal/validation role | session draft | Có khi canWrite; chưa ghi DB; filters don't clear selection |
| Chốt hai tập | POST selections | Có; server gates/source revisions/immutable snapshot |
| Open snapshot via dataset_id | GET datasets/{id}, dashboard requires v2 | Có với v2; v1 archive đang bị dashboard từ chối, cần state riêng |
| Tiếp tục Tối ưu AEB | GET handoff check → router `/aeb?dataset_id=id` | Có check và navigation; receiver không có dataset consumption trong source kiểm; **không hứa chạy đúng frozen cohort** |
| Tối ưu toàn họ | link `/aeb/mobo?scenario_id=...&new=1` | navigation có thật; khác selected dataset; nguy cơ người dùng tưởng dùng selection hiện tại |
| Chạy trên CARLA | `runOnCarla` → module2 API + `/analysis/carla?run=...` | là mô phỏng có side effect, không “chạy FA”; để secondary action |
| Tải .xosc | downloadRunXosc | module2 dependency working; không Diagnostic Report |
| Xuất CSV | failures.csv | source legacy filters, không full canonical metrics/core reports |
| Upload result/collection; Analyze V3; download Diagnostic/Handoff V3 | **không có action hiện tại và không REST** | BLOCKED, không thêm mock/spinner giả |

## 5. Overlap, dead code và mocks

- Overview/run explorer lặp run shortcuts/identity/actions. Summary và evidence lặp classification; mỗi metric có một explanation `<details>` dài; scene cũng lặp playback. Đây là overlap bố cục, không bằng chứng các nghiệp vụ đó vô dụng.
- Four local navigation modes + three detail tabs + dedicated playback + separate query families làm tăng số quyết định. Legacy `f_*` và run filters không cùng data scope; không thể gộp bằng đổi tên query parameters.
- `AnalysisDatasetPanel` không importer production; client freezeAnalysisDataset không caller FE. Backend endpoint và v1 reader vẫn còn caller/tests. REMOVE component không đồng nghĩa xóa v1 contract/backend/shared types.
- Search `mock|fixture|dummy|Math.random` trong production FA scope không thấy fake result generator; `placeholder` là text input. Static dictionaries/formulas là copy giải thích, không mock metric. Không kết luận toàn frontend không có fixture ở nơi khác.
- [`frontend/tests/`](../../../frontend/tests/) có fixtures HTTP và golden contract, intentional test-only. Không xóa fixtures để “dọn code”; chúng giữ regression guards.

## 6. Coverage và UX hiện tại

Unit runner `npm run test:analysis` chạy8 files: classification,metric-format,explainability,evidence,telemetry,playback,api-contract,test-infra. **48/48 pass** sau npm ci trong lượt này. Browser harness hiện có9 suite: integrity,overview,classification,metrics,explainability,evidence,telemetry,playback,redesign; [`tests/README.md`](../../../frontend/tests/README.md) xác nhận BROWSER_FIXTURE_ONLY. Không chạy browser/live backend trong audit; không dùng tên harness để tuyên bố screen reader/touch đã đạt.

Đã có focus styles, table captions/regions, range labels, keyboard tabs, aria-live/status, responsive breakpoints và reduced-motion. Cần giữ các tính chất này; không mô tả UI hiện tại là hoàn toàn thiếu accessibility. Dense tables min-width950/1240 và marker20px cho thấy cần kiểm viewport/touch target trong FE-R5; không khẳng định vi phạm WCAG khi chưa đo runtime. Loading/error/empty state, keyed response race guards và archived/currentness warnings đã implement; cải tiến bố trí và lời giải thích, không viết lại tất cả state logic.
