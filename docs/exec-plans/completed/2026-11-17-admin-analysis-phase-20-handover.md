# Phase 20 — Final QA và bàn giao Admin / Analysis

Ngày 17/11/2026; nhánh `chuvv`; nền `9d315bb`, working tree sạch, Phase 19 đã commit.
Chỉ Phase 20, không stage/commit/push/PR, không thay nghiệp vụ, quyền, schema, AEB hoặc CARLA calibration.

## Kế hoạch và bằng chứng cần thu

1. Truy vết commit, diff, reports và tests của Phase 1–19; phân biệt thiếu phase với thiếu bằng chứng.
2. Đọc code Admin, Analysis, security/project/reviewer, metric/telemetry và CARLA identity; đối chiếu tài liệu.
3. Chạy lại lint, TypeScript, production build, hai lượt Admin/Analysis regression trên app riêng;
   toàn bộ Java offline và worker tests. Ghi log mới dưới `data/admin-analysis-phase20-2026-11-17/`.
4. Ghi rõ giới hạn live backend/DB/CARLA/Figma; không dùng fixture như full E2E hoặc thực nghiệm vật lý.
5. Sửa tối thiểu tài liệu sai đã có bằng chứng; tạo technical handover và final QA report có
   phase matrix, test matrix, issue severity, open debt và readiness có điều kiện.
6. Kiểm tra docs, links, whitespace, conflict markers, Git và tính nhất quán báo cáo; chuyển plan sang completed.

## 1. Executive summary và phạm vi kết luận

Hoàn tất Final QA offline/fixture và bộ tài liệu bàn giao. **READY FOR REVIEW** đối với
diff tài liệu Phase 20 cùng bằng chứng local ở source nền; chưa kết luận READY FOR QA/STAGING
cho toàn hệ thống, càng không kết luận production-ready hoặc đã xác minh an toàn thực tế.
Không sửa production code/tests/dependencies/CI; không có migration/API change.

18 commit thuộc chuỗi Phase 1–19 truy vết được sau merge nền `ba4d71b`.
Phase 5 không có bằng chứng riêng trong chuỗi này; Phase 13 có code/tests nhưng plan chưa đóng;
Phase 18 thiếu bảng validation lịch sử. Không đánh dấu toàn bộ 20 phase hoàn thiện.
QA mới: Java615 PASS/1 SKIP, critical repeat96 PASS; worker59 PASS;
Analysis48 unit ×2,9 browser ×2; Admin7 browser ×2. Lint/TS/build retry đạt.
Ruff chưa thực thi được; dependency audit vẫn có1 moderate Next. Không thay kết quả lỗi thành PASS.

## 2. Pre-flight và nguồn kiểm chứng

- Git lúc bắt đầu: chuvv sạch, HEAD `9d315bb`, không unmerged paths/MERGE_HEAD.
  Phase19 commit đó chứa producer/consumer contract, runner và Playback ID/validity guards.
- Nền trước Phase1: `ba4d71bd264fd1b023e2c83a0ae3077ce7585dcf`, merge main vào chuvv
  giữ Admin UI; không lấy các chuỗi redesign ngày03–07/11 làm phase của kế hoạch mới này.
- Đọc AGENTS/CLAUDE gốc và frontend, DESIGN, rename guide/mục7 naming, Next accessibility guide,
  architecture/schema/metric contract, ADR040/042/048/049/050/051, calibration plan11/11,
  báo cáo1–4/6–12/14–19 và plan13. Đối chiếu diff của từng commit với production/test hiện hành.
- Evidence inventory `phase-history.json` ghi full hash/changed files từng commit;
  `java-suites.json` giữ78 class/results từ lần clean test trước các lượt Maven chọn lọc.
- Không thấy listener2000/8001/3306/6379 lúc pre-flight; không có QA DB/account riêng được xác nhận.
  Không đọc hoặc sửa .env/DB cá nhân, không bật backend/Redis/MySQL/CARLA để chạy trên dữ liệu chưa phân loại.

## 3. Phase 1–20 completion matrix

Status là đánh giá phạm vi và bằng chứng, không suy từ commit title. `A/` =
frontend/src/components/admin; `N/` = frontend/src/components/analysis; `T/` = frontend/tests.
Link scope dẫn tới report gốc; inventory local liệt kê đầy đủ files thay đổi, bảng chọn file quan trọng.
Validation mới là lần Phase20; validation lịch sử chỉ tham chiếu report và không thay lần chạy mới.

| Phase | Scope / báo cáo | Commit | Implemented changes / files | Validation hiện tại / giới hạn | Status |
|---|---|---|---|---|---|
| 1 | [Admin audit](2026-11-13-admin-analysis-phase-01-admin-ui-audit.md) | ef3f046 | Chỉ audit doc, ADM findings/code locations | Artifact audit tồn tại; không coi audit là sửa toàn bộ lỗi | Completed & Verified |
| 2 | [Layout](2026-11-13-admin-analysis-phase-02-layout.md) | ff2ecd1 | A/AdminEditor.module.css: low-height dialog scroll; giữ sidebar/tokens | Admin redesign ×2, thấp320×256 và tablet/mobile; không Figma | Completed with Limitations |
| 3 | [User table](2026-11-13-admin-analysis-phase-03-user-table.md) | 60286d0 | A/AdminUsersTable: chip accessible name, null/whitespace identity/action ID | users-table/forms/redesign ×2; HTTP fixture | Completed with Limitations |
| 4 | [Search](2026-11-13-admin-analysis-phase-04-user-search.md) | 86c270a | Giữ DOM/focus/caret, cùng query no-op, stale protections; T/admin-user-search | Search ×2: history/refresh/races; submit-based, không debounce | Completed with Limitations |
| 5 | Không có report/yêu cầu riêng tìm được trong chuỗi | — | Pagination hiện có trong AdminUsersTable, nhưng không suy ra Phase5 đã được thực hiện | Pagination được tests hiện tại kiểm; không chứng minh scope/acceptance của Phase5 | Not Verifiable |
| 6 | [User form](2026-11-14-admin-analysis-phase-06-user-form.md) | d8f0fe0 | A/AdminUserEditor: phân loại lỗi lưu, giữ validation/dirty/draft/lock | forms ×2 + AdminService13/AdminSecurity5; không live persistence | Completed with Limitations |
| 7 | [Modal](2026-11-14-admin-analysis-phase-07-modal.md) | f421416 | A/useAdminDialog, AdminEditor CSS: scroll lock/restore/focus | Native modality/Tab/Escape/dirty/busy/background assertions ×2; chưa screen reader/touch | Completed with Limitations |
| 8 | [Workspace](2026-11-14-admin-analysis-phase-08-workspace.md) | a24cdbf | A/AdminWorkspacesTable: query/focus/chips/refresh/guards | Workspace browser ×2; Java WorkspaceService19/Security7; membership thuộc Manager | Completed with Limitations |
| 9 | [References](2026-11-14-admin-analysis-phase-09-references.md) | be23ec4 | A/adminReferences, Editor/Table/CSS: metadata/DECIMAL/errors/focus | consistency ×2; Java AdminService; chưa live DB | Completed with Limitations |
| 10 | [Admin hardening](2026-11-14-admin-analysis-phase-10-regression.md) | 3027692 | AdminSecurityTest, T/run-admin/helper, strict IDs/modal/pending assertions, Playwright pin |14 browser suite runs + Java security; CI browser chưa provision | Completed with Limitations |
| 11 | [Analysis audit](2026-11-14-admin-analysis-phase-11-audit.md) | ce250e2 | Audit report, core characterization tests TD58–61 | FailureAnalysisAuditTest2 + entire Java gate mới; audit không đóng evaluator/calibration debt | Completed & Verified |
| 12 | [Overview](2026-11-14-admin-analysis-phase-12-overview.md) | 8eab3c4 | N/AnalysisOverview, overviewData/CSS: source/aggregation/metric guards và run links | overview/redesign ×2; không live HTTP/DB | Completed with Limitations |
| 13 | [Metric plan còn active](../active/2026-11-14-admin-analysis-phase-13-metrics.md) | 1753867 | N/analysisMetricFormat, Summary/Explorer/Dataset/Evidence, CARLA CSV labels | metric-format5 + metrics-ui ×2 và Java anchors mới; thiếu completed inventory/report gốc | Partially Completed |
| 14 | [Classification](2026-11-15-admin-analysis-phase-14-classification.md) | 4ca0a93 | N/analysisClassificationData, Classification, neutral missing evaluation | classification7 + UI ×2, FailureAnalysisAuditTest; ineffective/avoidability chưa contract | Completed with Limitations |
| 15 | [Explainability](2026-11-15-admin-analysis-phase-15-explainability.md) | 2301898 | N/AnalysisMetricExplanation/data/CSS, source/category gating, disclosures | explainability7 + UI ×2, MetricExplanationContract3; TD59 | Completed with Limitations |
| 16 | [Telemetry](2026-11-16-analysis-phase-16-telemetry.md) | 0f3e080 | TelemetryChartParts/data, two charts: timestamps/gaps/markers/scroll | telemetry6 + UI ×2 với20k mẫu; không sensor clock/runtime validation | Completed with Limitations |
| 17 | [Playback](2026-11-16-analysis-phase-17-playback.md) | bfb5b25 | playback route, clockData/presentation/Scene/Timeline: elapsed RAF, source frame/events | playback9 + UI ×2; CCR geometry/t0 metadata còn thiếu | Completed with Limitations |
| 18 | [Run detail/evidence](2026-11-16-analysis-phase-18-evidence.md) | 1649771 | detail route, Summary/Evidence/data/CSS: identity/raw/source/time context | evidence7 + UI/integrity ×2 PASS mới; §10 report gốc vẫn placeholder, không gán PASS hồi tố | Completed with Limitations |
| 19 | [Analysis hardening](2026-11-17-analysis-phase-19-regression.md) | 9d315bb | Playback ID/trusted guard, Java golden/Node shared contract, runner/helper/CI units |48 unit ×2,18 browser suite runs, Java producer; fixture≠live E2E | Completed with Limitations |
| 20 | Final QA/documentation, tài liệu này | Chưa commit | Handover, test instructions, targeted stale docs, debt synchronization | Matrices bên dưới; không thực hiện phase tiếp theo | Completed with Limitations |

Phase5 ngày07/11 thuộc chuỗi **Admin refinement** (commit431eb80), không phải Phase5/20 này;
đã kiểm report và lịch sử, không dùng nó để lấp ô thiếu. Phase13 vẫn giữ active, Phase18 giữ nguyên
placeholder lịch sử; QA mới ở đây không được backdate thành QA đã chạy trong các phase đó.

## 4. Final Admin audit

| Phần | Code thực tế đã đối chiếu | Kết quả / giới hạn |
|---|---|---|
| Navigation/layout | AdminShell, VehicSimShell/Sidebar, AdminTokens/Table/Editor CSS, globals | Ba trang hiện hành; /admin redirect; không có Overview cũ. Active/menu/skip/breadcrumb/focus/region scroll được browser kiểm |
| User table/search/page | AdminUsersTable, adminUsersQuery, adminApi/apiRequest |4 cột, long/null identity, loading/empty/filter-no-result/API errors/paging. Enter/nútTìm mới apply, không API trên từng phím, không debounce cần kiểm giả |
| Form/mutations | AdminUserEditor/useAdminDialog, AdminRequests/AdminService |Validation, dirty/review/error-draft/busy/ref-lock, payload và refetch; guard role/self/dependencies; thành công sau API, không success giả |
| Async | List key/live/query/pathname; detail sequence |Stale success/error/changed-query/unmount trong browser fixtures; actual network timeout chưa được chứng minh |
| Workspace | AdminWorkspacesTable/Editor; WorkspaceController/Service riêng |Admin list/search/page/Manager assignment/read-only archive; Manager exact-email EXPERIENCER/add/remove/duplicates/permission qua Java tests, không thêm member UI Admin |
| References | ReferencesTable/Editor/adminReferences; AdminService |Metadata/URL safety/DECIMAL precision/filter/empty/errors/toggle, keyboard/focus; không DELETE |

Browser Edge headless, production bundle Next16.4.1 tại127.0.0.1:3132, authentication/API intercept bằng
fixtures .invalid. Hai lượt đảo thứ tự, process/context riêng. 448 screenshots được harness ghi
(224 mỗi lượt); đã mở xem Users1440, Workspace768, References375 và Analysis Evidence375,
Telemetry1440, Summary768. Không gọi448 ảnh là448 kiểm tra thị giác thủ công.
Regression còn kiểm375/390/768/1024/1440 và Admin1920/1366/320, dialog thấp.
Không thấy document-level horizontal overflow trong ca đã assert; table/chart scroll riêng là chủ đích.
Không chạy lại axe hoặc screen reader, native touch/virtual keyboard, browser zoom thật, Firefox/Safari hay Figma.

## 5. Final Analysis audit và data integrity

Metric inventory, source/unit/formula/precision và giới hạn chi tiết nằm ở
[technical handover](../../vehicsim/admin-analysis-handover.md#5-metric-glossary-và-provenance-thực-tế).
Đã đối chiếu Simulator/LeadVehicleSimulator/CarlaSession/DecelMeter/Evaluation/AnalysisMetrics,
RunService RESULT_COLUMNS/persist, AnalysisService/ViewService, Frame/RecordedTelemetry,
frontend format/classification/explainability/evidence/telemetry/clock helpers và renderers.

| Yêu cầu | Kết quả / bằng chứng mới |
|---|---|
| Overview context/status/source/partial/errors | overview/redesign ×2; objective status/unit/sample/invalid values guards, identity links, no fake KPI |
| TTC/speed/distance/sign/null/precision | metric-format + shared Java API fixture; perceived≠GT, m/s→km/h một lần, collision-only impact; NaN/Infinity direct-helper tests, wire JSON null |
| Brake command/onset/delay/deceleration | Không có numeric brake command/pedal trong canonical API. Activation/onset là controller mốc, delay là duration; max decel≠available≠signed a. Không vẽ tín hiệu chưa có |
| RMS/stopping/impact/min separation | Java anchors và Analysis tests; nominal-dt canonical RMS khác actual-Δt chart jerk; observed+extrapolated stopping; impact ego≠relative, no-brake null, thiếu argmin time không tạo marker |
| Classification |5 codes backend; trusted cần COMPLETED + evaluation_valid===true + PASS/FAIL. Collision rule FAIL không chứng minh AEB causal failure; missing evaluation/classification không safe; hypothesis≠confirmed cause |
| Unsupported taxonomy |False/Missed có rule contract; ineffective/avoidability/inconclusive theo khâu chưa có. Không thêm thresholds hoặc suy outcome từ command/no collision |
| Telemetry |Timestamp/unit/signal mapping, invalid/missing/duplicate/gaps/events/focus, full20k samples và không GT fallback; suite ×2. Không chứng minh đồng bộ sensor/camera |
| Playback |Play/pause/seek/restart/rate/end/background/cleanup/run switching; floor recorded frame, no fabricated physics. Wrong response ID/missing validity và stale104→101 được integrity browser kiểm cùng document |
| Detail/evidence |run/scenario/seed/source/raw field/unit/stage/time links, missing/partial, cross-run keys; source provenance/rule immutable version còn TD59 |

Shared golden có4 run động học từ production Simulator/Evaluation → mocked persisted Rows → read services thật,
321 full frames → JSON → frontend. Java compare golden và frontend consumer cùng đạt;
**không đi qua RunService.persist/MySQL/JWT/HTTP thật**, không đại diện CARLA dataset.

Telemetry fixture20k: render934ms/pointer max20ms ở lượt1,455ms/8ms lượt2,9 DOM nodes cho chart samples;
local Edge với máy hiện tại và hai runner đồng thời ở phần đầu. Đây là số harness đo, không SLA,
không bảo đảm60fps/low-end/long-running memory. Không đo coverage percentage.

## 6. Cross-module và quality của mô phỏng

AdminService revoke → AdminRepository auth_version → JwtService.isTokenValid → API401 →
AuthContext clearSession được đối chiếu code; AdminService/Jwt/Security tests PASS, có critical repeat.
Không có full two-account JWT/DB test mới: UI có thể còn menu role cũ trước request401;
không tuyên bố realtime role synchronization hoặc persistence đã được xác minh live.
ProjectAccess/Scope/ReviewerScope tests đạt; runBundle SQL có project_id. Backend là nơi kiểm quyền,
không dựa AuthGate. **Engineer vẫn project nhóm chung TD30**, nên yêu cầu cách ly mọi workspace
chưa được đáp ứng; chỉ Reviewer/personal scope có contract riêng. Không sửa permission model ở đây.

ReviewDecision/RegressionPairing tests kiểm seed/config/source, active membership/archive, explicit header,
self approval/FAILED/outdated baseline/reason/confirmation; fixture navigation giữ context/runID không mở quyền backend.
Không có thao tác auto Accept hoặc chạy regression trên DB thật.

Theoretical Reference, deterministic kinematic/config, CARLA Simulation Result và Real-world Measurement
được tách trong handover. Không có bằng chứng Phase20 để gọi bộ động học “calibrated” theo đo xe thật.
ADR051 Accepted có historical CARLA e-tron measurement08/11, xosc5 torque1800 N·m/full-brake metadata;
TD17 vẫn low-speed/friction/other-vehicle limits. Sourceprofile/version/dt/vehicle/seed/weather/physics
không được trộn giữa run; bổ sung weather/decel trong cùng v5 chưa cung cấp immutable build lineage (TD59).
CARLA0.9.16/ScenarioRunner0.9.16, xosc5 step0,01s và physics/telemetry adapter được unit/roundtrip kiểm;
không có server listener2000, không tạo world/actor hay calibration mới. Historical ADR evidence
không được đổi thành runtime PASS17/11 hoặc real-world validation.

## 7. Test result matrix — thực chạy Phase20

Tất cả evidence dưới `data/admin-analysis-phase20-2026-11-17/` (gitignored, local), không commit artifact.
Lệnh frontend chạy trong frontend, Java/worker từ root. Passed là test count nếu có,
không phải coverage %. Các subset Java có overlap, không cộng thành unique tests mới.

| Suite | Command | Passed | Failed | Skipped / Not run | Evidence | Limitation |
|---|---|---|---|---|---|---|
| Frontend ESLint | npm.cmd run lint | exit0 |0|0|lint.log|Source/tests hiện hành; chỉ docs đổi sau đó |
| TypeScript | npx.cmd tsc --noEmit |exit0|0|0|types.log|Sau production build |
| Production build lượt1 | npm.cmd run build |—|exit1|—|build.log|SecurityFatalError/security advisory, không bỏ qua lỗi |
| Production build retry nguyên lệnh | npm.cmd run build |exit0|0|0|build-retry.log|Không nâng Next hoặc bypass; advisory vẫn mở |
| Admin browser | npm.cmd run test:admin -- --repeat=2 |14/14 suite runs|0|0|admin.log; admin/summary.json + run-1/run-2/result.json|HTTP fixtures;448 ảnh, không live auth/DB |
| Analysis unit | npm.cmd run test:analysis -- --browser --repeat=2 |48 ×2|0|0|analysis-retry.log; analysis/pass-1,2/unit.log|8 Node files, production helpers/golden |
| Analysis browser cùng runner | như trên |18/18 suite runs|0|0|analysis/summary.json + pass-1/pass-2 child result.json|9 suites ×2, fixture;422452ms accumulated browser time |
| Java entire repo | .\mvnw.cmd -B clean test |615|0 failures/errors|1|java-full.log; java-suites.json|78 classes,82s; offline/mocks, không DB/CARLA |
| Java critical repeat | Maven -Dtest=12 classes bên dưới test |96|0|0|java-critical-repeat.log|13,299s; overlap với full run |
| Worker | python -m pytest worker/tests -q |59|0|0|worker.log|4,65s; adapter mocks/bridge Java; không CARLA runtime |
| Worker lint | python -m ruff check worker |—|tool exit1|NOT RUN: module ruff thiếu|worker-lint.log|Python3.15 hiện tại; không cài vào môi trường cá nhân |
| npm audit mặc định | npm.cmd audit --omit=dev --json |—|exit1,1 moderate|0 high/critical|audit.json|Next16.4.1, TD62 chưa sửa |
| Audit theo threshold CI | npm.cmd audit --omit=dev --audit-level=high --json |exit0|0 ở threshold high|1 moderate còn mở|audit-ci.json|Không gọi là “không lỗ hổng” |
| RepoDocs cuối | .\mvnw.cmd -B -Dtest=RepoDocsTest test |5|0|0|docs-final.log|Sau khi chuyển plan completed;2,979s |
| Git/UTF8/links/markers/artifact freshness | python data/admin-analysis-phase20-2026-11-17/verify.py + git diff --check |PASS exit0|0|0|final-check.json|8 files,85 local links,32 fresh browser results,768 PNG hợp lệ; staging rỗng |

Java critical repeat: AdminSecurityTest, JwtServiceTest, ReviewerScopeTest, ProjectScopeTest,
ProjectSecurityTest, VehicSimSecurityTest, AnalysisApiContractTest, AnalysisServiceTest,
AnalysisSnapshotTest, RegressionDecisionTest, RegressionPairingTest, MetricExplanationContractTest.
PowerShell cần quote cả `'-Dtest=ClassA,ClassB'` để tránh parser coi dấu phẩy là tham số shell.
Lần gõ không quote bị ParserError trước Maven (không test chạy), sau đó lệnh quote đạt96;
không sửa test để làm xanh. Full Java còn gồm AdminService13, WorkspaceService19/Security7,
ArchitectureRules6/CoreIsolation1, XoscExport30/XoscReadParity3/OpenScenarioSchema,
AEB/core/kinematic/parity, Analysis/dataset và Regression suites; full inventory giữ trong java-suites.json.

SKIP duy nhất: KinematicParityFullTest.wholeGridMatchesThePythonCore, @EnabledIfSystemProperty
vsos.parity.full chưa được cung cấp external1296-case fixture; không tự tạo nó từ code mới để “match”.
KinematicParityTest nhỏ và kinematic execution tests vẫn PASS.
Analysis runner attempt đầu exit1 trước test do relative output trỏ frontend/data (`analysis.log`);
đổi tham số sang absolute root/data, giữ nguyên production/tests; lần actual có20 child runs PASS.
Không xóa logs thất bại, không dùng kết quả Phase19 thay số Phase20.

## 8. Workflow validation và giới hạn E2E

| Workflow | Đã kiểm | Chưa kiểm / trạng thái |
|---|---|---|
| A: Admin login→edit→save→refresh→persistence |Form UI thật với auth/API fixture; payload/refresh/guards; Java controller/service/JWT unit |Live login/JWT + MySQL persistence/transaction chưa chạy: NOT RUN |
| B: Workspace→members→Engineer/Reviewer access |Admin list/reassign fixture; exact-email/duplicates/membership/scope qua Java mock/security |Hai tài khoản thật và DB QA chưa có; Engineer isolation chưa contract TD30 |
| C: Scenario→simulation→overview→explorer→detail→evidence→playback |Offline core→read-service golden + browser navigation/clock/context/integrity |Actual simulation HTTP/persist→browser/CARLA pipeline chưa chạy: NOT RUN |

Không gọi workflow fixtures này là full E2E. Chưa screen reader/native touch/Firefox/Safari/Figma,
deployment proxy/CI self-hosted runtime, real timeout/long-session performance, CARLA runtime hoặc đo xe thật.
Không có dữ liệu QA production được thay đổi. Browser server3132 do phiên này bật và đã dừng bằng Ctrl-C;
exit1 của server khi dừng có chủ đích không phải test FAIL. Không dừng tiến trình bên ngoài.

## 9. Findings và release conditions

P0: không xác nhận bypass quyền, cross-run data leak, mất dữ liệu Admin hoặc evidence giả mới
trong code/tests/fixture đã kiểm; không suy ra hệ thống không thể có P0 ở deployment chưa kiểm.
Các mục dưới dùng ID tracker hiện hành, **không tạo bản sao issue**. Owner/deadline chưa có thông tin
cho các việc này, không tự gán. Status Open trừ dòng tài liệu TD56 đã giải quyết.

| ID / severity | Module / file | Tái kiểm; expected → actual; evidence | Impact / remediation / status |
|---|---|---|---|
| TD-30 / P1, blocker khi cần nhiều workspace độc lập | security/ProjectScope.java: resolve; ProjectAccess |Engineer thuộc workspace khác → kỳ vọng scope riêng theo yêu cầu handover; code trả firstActiveTeamProject. ProjectScope/ReviewerScope tests và code review, chưa live exploit |Không cam kết tenant isolation. Chốt permission model/project membership rồi triển khai/test riêng; Open, owner chưa có |
| TD-58 / P1 | core/evaluation/Evaluation; FailureAnalysisAuditTest |Core evaluate evidence rỗng/vehicle-limited case → kỳ vọng insufficient/limiting factor đúng; characterization vẫn SAFE/PASS hoặc LOW_FRICTION heuristic. API có validity gate |Không coi chain là causal proof. Taxonomy/validity/version change cần scope riêng; Open, chưa xác nhận sai SAFE đầu cuối |
| TD-59 / P1 | Frame.java, RunService.persist, AnalysisViewService |Inspect trace/source → kỳ vọng command/applied/target_v và immutable rule/build/calibration identity; canonical/API thiếu, aggregation version không là rule version |Không phân tách nguyên nhân vật lý hoặc tái hiện lịch sử đầy đủ. Versioned trace contract, giữ original metadata, legacy unknown; Open |
| TD-60 / P1 | AnalysisPlaybackScene / shared scenario map |Mở shared scene với CCR target → kỳ vọng lead geometry; renderer còn pedestrian-centric/annotation clip mobile; CCR contract fixture/code review |Có thể hiểu sai cảnh. Sửa presentation theo category + geometry tests trong việc riêng; Open |
| TD-61 / P1–P2 | playback API, worker controller/recorder clock |Đối chiếu t0/cadence → kỳ vọng mapping đã chứng minh; controller GameTime−started_at, recorder snapshot−first-frame, Playback thiếu dt/loss metadata |Không khẳng định đồng bộ IMU/camera/radar. Contract t0/cadence/loss có version + runtime QA; Open |
| TD-17 / P1 theo mục tiêu validation vật lý | CarlaSession/DecelMeter, ADR051 |Yêu cầu phanh đúng trên mọi xe/friction/speed → ADR051 chỉ e-tron/range đo; low-speed/friction/4 xe chưa đủ calibration |Không dùng số như chứng nhận. Đo QA có seed/physics/artifact, không sửa calibration Phase20; Open |
| TD-54 / P2 | AnalysisViewService.relatedRuns |Related link → kỳ vọng đủ seed/xe/profile để so sánh; API chỉ cùng variant/completed, chưa đủ identity |Mở để xem, không khẳng định A/B hợp lệ. Bổ sung metadata/filter; Open |
| TD-62 / P2 (advisory Moderate) | frontend/package.json Next16.4.1 |npm audit → kỳ vọng không affected dependency;1 moderate GHSA, default audit exit1; build nudge exit1/retry0 |Upgrade dependency riêng + Admin/Analysis/build/audit. Không xác nhận app exploit hoặc downgrade thành vô hại; Open |
| TD-57 / P2 | .github/workflows/ci.yml |Kỳ vọng interaction regression tự chạy CI → chỉ Analysis unit được nối; chưa browser/app provisioning |Local PASS không là CI PASS. Provision CI browser/server/artifacts; Open |
| QA-history / P2 | Phase5/13/18 docs |Đối chiếu20 phase → thiếu Phase5,13 active,18 validation placeholder; history inventory và links ở matrix |Không ghi20/20 completed. Cần đối chiếu scope/nguồn gốc và bổ sung hồ sơ có chứng cứ; Open, không sửa lịch sử |
| TD-56 / P2 tài liệu | database-schema.md: tech_references |Mô tả chưa có API/màn → thực có AdminController/Service/References |Đã sửa3 vị trí, giữ DECIMAL/schema; remove khỏi open tracker theo quy ước; Resolved in Phase20, không nhận là sửa nghiệp vụ |

Severity QA là ảnh hưởng trong phạm vi này; không tự thay mức tracker. Nếu cần release có
multi-workspace isolation hoặc chứng minh chẩn đoán/physics, các TD30/58–61/17 là điều kiện chặn;
không hạ mức yêu cầu để gọi staging-ready. Chưa có critical test failure cần sửa production trong Phase20.

## 10. Documentation review và thay đổi

| File | Vấn đề / thay đổi / trạng thái |
|---|---|
| README.md |Sửa Node22, adapter/Java xosc,30 bảng đếm từ SQL, Reviewer decision, link handover/QA/tests |
| docs/vehicsim/architecture.md |Sửa scope4 category, Java xosc, remove route cancel chưa có khỏi flow, đúng bundle/xosc và Reviewer regression; thêm current handover notice; không viết lại lịch sử Python |
| docs/vehicsim/database-schema.md |tech_references đã có API/màn/DECIMAL string; sửa trạng thái cộng tác, project scope và torque calibration theo code; không đổi DDL |
| docs/vehicsim/analysis-metrics-contract.md |Sửa blanket “CARLA chưa hiệu chuẩn phanh”: ADR051 có e-tron xosc5 torque calibration nhưng TD17/real-world còn mở |
| frontend/tests/README.md |Thêm Analysis unit/browser/golden/outputs/fail-closed và CI/live limits, sửa cách dùng absolute output để tránh lỗi đã gặp |
| docs/vehicsim/admin-analysis-handover.md |Architecture/components/APIs/flow/roles, metric glossary/taxonomy/telemetry/playback/provenance/data readiness/setup/tests/troubleshooting/maintenance |
| docs/exec-plans/tech-debt-tracker.md |TD62 cập nhật audit mới; TD56 remove vì đã sửa, evidence giữ ở report này; IDs/rủi ro khác giữ nguyên |
| Tài liệu Phase20 này |Plan, phase/test matrices, final QA/evidence/limits/findings/readiness và điểm dừng; chuyển completed khi checks cuối đạt |

ADR040/044/046/047/048 còn Proposed theo chính file, ADR042/049/051 Accepted; code có thể đã triển khai
một Proposed ADR nhưng không tự đổi thành Accepted. Không đổi ADR status, không đóng calibration plan11/11
hoặc Phase13 khi chưa có hồ sơ tương ứng. Forge/Python paths trong architecture là Deprecated/historical;
CPLA/TURNING/CUT_IN và taxonomy ineffective chưa implemented. Sensor-filtered jerk experiment không thay
canonical RMS. Các tuyên bố optimizer/cộng tác cũ ngoài đoạn đã đối chiếu vẫn cần module owner review;
không tuyên bố đã đồng bộ mọi tài liệu toàn repo chỉ bằng sửa tám file.

## 11. Readiness, bàn giao và điểm dừng

**READY FOR REVIEW**: source nền có QA offline/fixture đạt và diff tài liệu nhỏ, review được.
Chưa có đủ bằng chứng cho READY FOR QA/STAGING toàn hệ thống hoặc nghiệm thu20/20.
Chưa READY cho release đòi hỏi tenant isolation/physical safety proof; cần công việc riêng theo mục9.
Không dùng “production-ready”. Không thay formula/threshold/authorization để đáp ứng nhãn readiness.

Trước QA/staging: review scope các phase thiếu hồ sơ; bố trí DB/accounts dev riêng,
kiểm live workflows A/B/C và JWT revocation; xử lý dependency advisory; provision browser CI;
nghiệm thu các release criteria về scope, geometry/provenance/clocks và calibration có bằng chứng.
Không tự thực hiện các bước phát triển đó trong Phase20 hoặc mở PR/deploy.

Commit đề xuất: `docs(vehicsim): finalize admin analysis QA and technical handover`.
Đã kiểm8 file UTF8/newline/whitespace/conflict markers và85 local links;32 child browser results và768
PNG đều mới hơn final build.391 tracked files production/config/dependency fingerprint được ghi trong
final-check.json; git diff ở các nguồn sản phẩm/DB/worker/dependency/CI rỗng.
HEAD vẫn `9d315bb24c2d39a198244610a175e5997a81f46f`, staging rỗng.
Stage thủ công đúng8 file trong bảng mục10, không stage data/target/.env.
Không commit/push/stage/main/merge/rebase/reset, không Phase21; dừng để người dùng review.
