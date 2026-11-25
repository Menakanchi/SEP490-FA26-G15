# FE-R3 — Results & Investigation UX

Ngày 25/11/2026. Nối tiếp worktree FE-R1/FE-R2 chưa commit; HEAD
`d712146c2ee03de8d751725c506eb1d4a814d2d8`. Phạm vi frontend Failure Analysis.
Không thay backend/API/types/DB/physics/producer/AEB/CARLA/MOBO/regression,
shared shell, selection/freeze hoặc thuật toán playback. Dừng sau FE-R3.

## 1. Before / after

| Trước FE-R3 | Sau FE-R3 |
|---|---|
| Headline legacy đứng trước objective, dễ hiểu thành kết luận nguyên nhân | Outcome đã ghi → ba objective → nhận định theo luật; headline trong disclosure |
| RMS generic dùng chung CARLA/động học; regex nhận cả version tương lai | Không xác nhận phép tính lịch sử từ tên simulator; nguồn tham khảo có phạm vi và trạng thái chưa xác minh |
| Mỗi giải thích mở nhiều khối kỹ thuật | Lớp ngắn: ý nghĩa, giá trị, phương pháp chưa xác minh; lớp sau: đầu vào, nguồn, giới hạn |
| PASS/nhãn lỗi và outcome/impact có thể bất đồng | Giữ cả hai trường, nêu bất đồng; không tự chọn collision authority |
| Mốc phanh trên summary dễ hiểu là phanh vật lý | Mốc trong Điều tra, kèm source và giới hạn writer/pedal/physical onset |
| Similarity có dấu % chưa rõ ý nghĩa | Độ gần theo tham số, không xác suất lỗi hoặc bằng chứng nhân quả |
| Response chỉ kiểm run ID | Rendering boundary kiểm cấu trúc/identity, lỗi hiện retry thay vì crash hoặc SAFE/0 |

Thứ tự: identity/status → kết quả đã ghi → RMS jerk/impact/stopping → nhận định
legacy → giới hạn → **Điều tra chuyên sâu** đóng → **Phát lại và tác vụ khác**
đóng. Giữ một workspace/result page, playback advanced route; không thêm màn.

## 2. Source của từng nội dung

| Nội dung | Field / source thực | Giới hạn |
|---|---|---|
| Run/family/variant/seed/status | GET analysis/runs/{id} → run; AnalysisService.inspection | Giữ account/project/run boundary và cleanup FE-R2 |
| Outcome | detail.outcome; AnalysisViewService.header | Header có thể ưu tiên false-positive; không phải sensor contact authority |
| Đạt/không đạt | detail.status/evaluation_valid/verdict | Luật đã lưu, chưa có phiên bản luật lịch sử đầy đủ |
| Legacy label | detail.failure_type | Không map sang V3 functional candidates |
| Headline/chain | detail.headline/chain/failure_class/chain_confidence | Giả thuyết theo luật, không confirmed root cause; confidence không xác suất |
| Ba objective | detail.metrics.rms_jerk_mps3/impact_speed_mps/stopping_distance_m | Stored canonical SI, formatter hiện có; không tính lại |
| Metric source | metrics.metric_source | AnalysisViewService gắn SIMULATOR_RESULT, không phải runtime producer certificate |
| Simulator/dt | detail.simulator, run.dt cùng run | Identifier và bước danh định; không chứng minh filter/window/source revision |
| Aggregation version | detail.evaluation_version | adr040-stored-aggregation/1 khác producer profile/phiên bản luật |
| Timeline | metrics timestamps, events | Không hazard onset/pedal writer/physical applied brake đã xác minh |
| Stage evidence | stage_evidence[*].values | Source path/giá trị nguồn, không missing→0 hoặc seek ngoài trace |
| Telemetry/motion/scene | AnalysisViewService.failureDetail, RecordedTelemetry.project từ frames | Đọc mẫu trước/tại cursor; không nội suy missing/clock-bind sensor bằng t=0 |
| Config/environment | configuration/environment, DB/IR projection | Configured deceleration khác achieved; không chứng minh artifact config lịch sử |
| Ca gần | similar[*], backend tính | Độ gần tham số, không causal proof hoặc matched ON/OFF pair |
| XOSC/CARLA/playback | API và routes hiện hữu | Mô phỏng mới khác chạy chẩn đoán; không thực thi CARLA trong kiểm thử |

Đối chiếu chín audit01–09, FE-R1/FE-R2 reports, root/frontend AGENTS/CLAUDE,
hướng dẫn tên gói, Next16 installed useSearchParams guidance, FA README/handover,
analysis-metrics-contract, ADR-055 và MetricProvenanceResolver. Kiểm source thực
AnalysisController/AnalysisService/AnalysisViewService, API client/types,
Simulator.brakePhaseMetrics và CarlaSession.finish. Các audit và báo cáo cũ giữ
nguyên byte-for-byte. “Chưa implement” trong blueprint là lịch sử, không thay
trạng thái FE-R1/R2 đã kiểm trên source.

## 3. Legacy / V3 boundary

AnalysisClassification là renderer chỉ cho FailureDetail legacy. Summary compose
outcome/objectives/legacy riêng. Không chuyển chain/flags/headline thành V3
report. REST hiện chưa cung cấp functional candidates, causal hypotheses hoặc
confirmed roots của lõi. Không fake DTO/report/endpoint/nút Analyze V3. Report
thật sau này cần versioned REST contract và renderer riêng.

PASS với failure_type/failed chain, collision với false_activation hoặc impact
số với outcome khác COLLISION đều được nêu để đối chiếu; không đổi các giá trị.
FALSE_BRAKING không được diễn giải thành đã xác minh không contact do precedence
của header backend. Không có failure label không có nghĩa đã xác minh an toàn.

## 4. Objective explanations

- Giữ stored SI/formatter/null/invalid. Thiếu lý do null trong API thì không tự
  gán NOT_APPLICABLE hoặc missing reason. Per-run no-contact impact giữ —;
  aggregate0 của run hợp lệ không phải contact đã đo. Khi outcome bất đồng với
  impact số, số thô vẫn truy xuất được trong nguồn mở rộng, chưa xác nhận contact.
- REST hiện tại luôn ghi **“Chưa xác minh phương pháp tính từ nguồn dữ liệu
  này”**; không có nghĩa số đo sai. Identifier được giữ nhưng thiếu engine/source
  revision/signal/filter/window/runtime equivalence.
- CARLA xosc9–15 là source reference tường minh: Butterworth bậc6 mỗi lượt
  xuôi/ngược,10Hz,T_AEB→end theo ADR-055. Không áp onset/unfiltered RMS động học
  cho CARLA hoặc tự nhận profile tương lai bằng regex.
- Động học1.4 có reference chưa lọc/dt danh định/brake_onset_t; legacy1.0 giữ
  số/identifier mà không nhận công thức current làm phương pháp lịch sử.
- Chart/sensor jerk không thay canonical RMS. RMS telemetry link không gán
  brake_onset_t làm T_AEB. Stopping/timeline chỉ link mốc có thật trong trace.
- Stopping có thể trace+ngoại suy; API chưa tách nên từng phần chưa xác định,
  không FE decomposition. Quãng ngắn hơn chưa chắc tốt hơn khi run bị cắt bởi
  va chạm/kết thúc. Không thay a_available bằng cấu hình hoặc achieved max.

Formula catalogs generic cũ không còn được trình bày như phương pháp đã xác minh
của run. Giữ ý nghĩa/inputs/source/assumptions/limits dưới disclosure.

## 5. Investigation và preservation

Giữ section=summary/telemetry/evidence và t/signal/compare/returnTo; tab bằng
chứng đổi nhãn “Nhận định & bằng chứng”. Native details mặc định đóng; deep link
mở đúng phần. Enter/Space cho disclosure, Home/End/arrows cho tab/range còn dùng
được. Source/giá trị mốc có thể đọc không cần hover.

GT/perceived độc lập, không fallback. Events và metrics là nguồn riêng, không
suy applied brake từ aeb=true/pedal hoặc physical onset từ gia tốc. Collision
event không được gọi là collisions.json/sensor contact authority. Scene người
đi bộ chỉ dựng khi có category CP_CROSSING và geometry hợp lệ; CCR/unknown không
dựng nhầm người. Không đổi shared map/solver; vẫn truy xuất cấu hình và trace.

ReturnTo whitelist, page/filter/q/sort, regression return/compare, draft revisions,
snapshot independence và explicit handoff check/open giữ nguyên. Selection/freeze,
playback page/reducer và shared charts không chỉnh. Test giữ response cũ, đổi
run/project bằng browser UI, giải phóng response sau khi context mới đã mở.

## 6. Files changed so với đầu FE-R3

9 production files có sẵn:

- frontend/src/app/analysis/failures/[runId]/page.tsx: render guard/source/tab.
- frontend/src/components/analysis/AnalysisRunSummary.tsx: hierarchy, disagreement,
  limitations, similarity và scene category guard.
- AnalysisClassification.tsx và analysisClassificationData.ts cùng thư mục:
  legacy boundary và “theo luật đã lưu”.
- AnalysisMetricExplanation.tsx, analysisMetricExplanationData.ts và CSS cùng
  thư mục: progressive disclosure, unverified profile, source references/link.
- AnalysisRunEvidence.tsx: source/writer/clock/contact attribution.
- AnalysisRunDetail.module.css: limits layout.

Production file mới: frontend/src/components/analysis/analysisResultData.ts,
pure rendering guard/presentation helpers, không schema backend hoặc solver.

10 test/runner files cũ điều chỉnh nhãn/disclosure/source assertion: classification
units/UI, API contract label, explainability units/UI, evidence, integrity,
redesign, live smoke và runner. Giữ canonical scalar/null, role/freeze/revisions,
routes/ownership/negative assertions. Thêm analysis-results.mjs (11 units),
analysis-results-ui.mjs (16 browser groups), helpers/analysis-result-fixture.mjs
(nguyên scalars explainability fixture, chỉ UI/HTTP fixture, không ground truth).

## 7. Verification

Final gate `data/analysis-fe-r3/release-complete/` đạt PASS trên build
`CaoDUP0pfMlBj0XDvZUd-`. Hai lượt, lượt hai đảo thứ tự suites.

| Gate | Kết quả thực chạy |
|---|---|
| Units, toàn bộ FE-R1/R2/R3 |63/63 mỗi lượt ×2;126 executions,0 fail/skip |
| Browser fixtures |11/11 suites mỗi lượt ×2;22 executions,0 fail/skip |
| FE-R3 mới |16/16 acceptance groups mỗi lượt, cả hai lượt PASS |
| Fresh manifests |24/24 runner rows PASS;22 child manifests được kiểm riêng |
| Lint |exit0,0 errors/warnings; fa-fe-r3-lint-complete.log |
| TypeScript |exit0,0 diagnostics; fa-fe-r3-typescript-accepted.log |
| Production build |exit0; fa-fe-r3-build-accepted.log |
| RepoDocsTest |5/5 pass,0 failure/error/skip; fa-fe-r3-repodocs.log |
| Live backend/test DB |BLOCKED; browser fixtures không chứng minh live E2E |
| Figma/native screen reader/touch/zoom/full backend suite |NOT_RUN hoặc NOT_VERIFIED |

[regression-summary.json](fe-r3-evidence/regression-summary.json) giữ kết quả
runner; [results-acceptance.json](fe-r3-evidence/results-acceptance.json) giữ16
nhóm FE-R3, errors/runtimeWarnings rỗng và không business write của suite đó.
[verification-manifest.json](fe-r3-evidence/verification-manifest.json) có
commands, log hashes và22 child manifests. Không cộng focused/baseline hoặc
intermediate failures vào số final.

Commands từ frontend:

```powershell
npm.cmd run test:analysis -- --repeat=1
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3143
$env:ANALYSIS_UI_URL = 'http://127.0.0.1:3143'
$env:ANALYSIS_TEST_OUTPUT = 'F:\CodeVipChu\SEP490-FA26-G15\data\analysis-fe-r3\release-complete'
npm.cmd run test:analysis -- --browser --repeat=2
```

Từ repository root: `.\mvnw.cmd -B '-Dtest=RepoDocsTest' test`.

Baseline52/52 units và hai browser suites explainability/workflow PASS trước sửa.
Focused62/62 units và16/16 nhóm FE-R3 PASS trước refinement cuối về raw impact. Harness đầu có expectation precision
impact sai (10.00 thay formatter có sẵn10.000), locator onset ở summary cũ và
q filter che row của race test. Sửa expectation/interaction, không đổi scalar.
Các lượt regression-first/release-final/release-verified/release-accepted FAIL
được giữ nguyên, không cộng thành PASS. Chúng ghi các locator/regex cũ, một
refinement raw-impact chưa có trong build đang chạy, và race của test khi page2
được FE-R2 đưa về page1. Fixture phân trang đã khớp source, test chờ redirect
và bấm Xóa tìm kiếm bằng browser events; canonical scalars không đổi.
Một warning fixture aggregate không sử dụng đã được dọn; lint được chạy lại. Invocation Python
sai cwd dừng trước sửa; đã chạy đúng từ root. Không dùng lệnh lỗi làm evidence
build/test thành công.

## 8. Acceptance và giới hạn

16 nhóm mới: completed/null/profile/contradictory/unfinished/malformed, technical
disclosure, timeline/signal, source warning, return/deep link, similar, mobile/
keyboard, pending run/project, legacy/V3 boundary, no recomputation, playback.
Suites cũ giữ account isolation/draft/snapshot/explicit check-open/permissions,
missing/network/errors, chart quality và clock/playback assertions.

Browser dùng production Next build + Edge, đăng nhập bằng browser events qua HTTP
fixtures. Không chứng minh auth/DB live, clock sync sensor, calibration, V3 REST,
diagnosis vật lý hoặc MOBO execution. Figma/native screen reader/touch/browser
zoom chưa kiểm; không tuyên bố WCAG certified. Reflow/keyboard/focus kiểm đúng
các viewport ghi trong manifests.

## 9. Remaining dependencies

- BLOCKED live backend/test DB: thiếu môi trường cô lập/artifact evidence cho
  live smoke; không provision DB hoặc ghi dữ liệu thật để đạt test.
- B01–B05: backend REST intake/execution/report/export/compatibility chưa có.
- B07: FE đã thận trọng; verified producer/filter/window/source revision,
  calibration và stopping decomposition vẫn cần backend/producer.
- B12/B14: collision authority, policy và adjudicated roots vẫn chưa xác định.
- Mode AEB, pedal writer/contact raw resource/clock binding không có trong
  detail REST. Không suy ON/OFF hoặc physical applied brake từ flags.
- CCR scene cần renderer đúng target; không đổi shared map/solver trong FE-R3.
- B06/B08/B09/B10/B11/B13/B15 và export/history/consumer giữ scope cũ.

Không commit/push/merge. Không tự chuyển FE-R4/FE-R5/M2/V3 REST.


## 10. Scope và evidence

Fingerprint baseline:2446 tracked +34 existing untracked files.19 tracked files
đổi riêng FE-R3 (9 production,10 test/runner);2427 tracked và34 untracked có sẵn
nguyên byte-for-byte. Thêm1 production helper +3 test files. Không xóa file,
không staged diff, HEAD không đổi. Có sẵn thay đổi audit/FE-R1/FE-R2 nên full
`git diff` không phải chỉ delta FE-R3.

[source-scope.json](fe-r3-evidence/source-scope.json) lưu before/after hashes;
[git-diff-stat.txt](fe-r3-evidence/git-diff-stat.txt) là full worktree vs HEAD;
[git-status.txt](fe-r3-evidence/git-status.txt) giữ status đầy đủ. Không thay
selection/freeze, shared auth/project provider, playback hoặc source ngoài scope.

Ảnh được chụp bằng production build + Edge, HTTP fixtures. Before và after có
cùng ba canonical scalars2.123/10/33.25, account/project kiểm thử khác nhau;
không phải cặp run thực hoặc phép so sánh nhân quả. Before là capture baseline
thực trước sửa, không dựng lại bằng CSS. Figma chưa được đối chiếu.

| Ảnh | Desktop / mobile |
|---|---|
| Trước FE-R3 | [Desktop](fe-r3-evidence/before-result-desktop.png), [mobile](fe-r3-evidence/before-result-mobile.png) |
| Sau FE-R3 | [Desktop](fe-r3-evidence/after-result-desktop.png), [mobile](fe-r3-evidence/after-result-mobile.png) |
| Điều tra / provenance | [Điều tra mobile](fe-r3-evidence/after-investigation-mobile.png), [metric provenance](fe-r3-evidence/after-metric-provenance.png) |

[screenshots-manifest.json](fe-r3-evidence/screenshots-manifest.json) giữ kích
thước, nguồn và SHA-256 của6ảnh; baseline build ID không được capture nên giữ
UNKNOWN_NOT_CAPTURED. Không dùng intermediate FAIL để xác nhận release.
Không chạy CARLA/optimizer,
không sửa historical results hoặc nối V3 REST. Dừng sau FE-R3.
