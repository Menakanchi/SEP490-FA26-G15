# Phase 14/20 — AEB failure classification & evidence presentation

Ngày 15/11/2026. Nhánh `chuvv`, nền `1753867`, working tree sạch lúc bắt đầu.
Phase 13 đã được người dùng commit. Repo chỉ có [plan Phase 13](../active/2026-11-14-admin-analysis-phase-13-metrics.md),
chưa có báo cáo completed; đã đọc plan, diff và tests thực tế, không mặc định phase trước được kiểm chứng đầy đủ.
Chỉ Phase 14; không commit/push/stage hoặc chuyển Phase 15.

## 1. Nguồn và phạm vi

Đã đọc AGENTS.md, frontend/AGENTS.md, CLAUDE.md, frontend/CLAUDE.md, DESIGN.md,
hướng dẫn đổi package/mục 7 naming, Next installed accessibility guide;
[Phase 11](2026-11-14-admin-analysis-phase-11-audit.md), [Phase 12](2026-11-14-admin-analysis-phase-12-overview.md),
[architecture](../../vehicsim/architecture.md), [metric contract](../../vehicsim/analysis-metrics-contract.md),
[sổ công thức CP_CROSSING](../../vehicsim/cong-thuc-cp-crossing.md),
[ADR-040](../../adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md),
[ADR-042](../../adr/ADR-042-loi-aeb-mo-phong-cham-diem-chuyen-sang-java.md),
[ADR-043](../../adr/ADR-043-perception-tu-radar-chay-bong-truoc.md),
[ADR-050](../../adr/ADR-050-mo-category-xe-phia-truoc-bo-dong-hoc.md),
[ADR-051](../../adr/ADR-051-hieu-chuan-phanh-carla-xosc5.md).
Không kiểm tiêu chuẩn ngoài repo hoặc tuyên bố compliance.

Không đổi AEB, evaluator, thresholds, calibration, physics, API, types/schema, permission, Admin hay formatter Phase 13.
Không thêm taxonomy, filter API, chart/widget hoặc cơ chế chạy/chấm riêng.
Overview đã có nhãn theo luật và chú thích nguồn; giữ nguyên, chạy regression để kiểm ảnh hưởng.

## 2. Pipeline classification thực có

Các vị trí tính từ root repo. `core` = `src/main/java/com/vsos/core`,
`backend` = `src/main/java/com/vsos/backend`, `ui` = `frontend/src/components/analysis`.

| Bước / vị trí code | Input → output; nguồn/điều kiện | Missing/failure/storage |
|---|---|---|
| Run — core/simulation/Simulator, LeadVehicleSimulator, CarlaSession | Case/xe/AEB/seed → frames/events/metrics. Kinematic integration; CARLA actor GT qua worker/bridge; cùng AebStack | CP_CROSSING, CCRS/CCRM/CCRB runnable; CPLA/TURNING/CUT_IN chưa có simulator. Không coi schema category là evidence hỗ trợ |
| Telemetry — Frame, RecordedTelemetry; worker/sensor_recorder.py | Timestamp, ego_v/a, TTC perception/GT, flags aeb/fcw, collision events; sensor CSV là nhánh riêng | Canonical Frame chưa lưu pedal/decel_cmd/target_v dọc. AEB flag là decision latch, onset là command onset; không suy actual response |
| Metrics — Simulator.brakePhaseMetrics/summaryMetrics | RMS trong pha phanh, impact ego speed, stopping distance có thể ngoại suy; GT min TTC/geometry | Null khác 0; Phase 13 formatter/units giữ nguyên. Không dùng sensor recomputation thay canonical |
| Evaluation — core/evaluation/Evaluation.java:105/127/214 | Metrics + frames + params → outcome, verdict, failure_type, chain | Rules/heuristics, không causal proof; không evaluator lifecycle enum hoặc category-applicability status |
| Persist — backend/service/simulation/RunService.java:1038/1076 | evaluation.aeb_result → simulation_runs; failure → failures; stage fail/cause_code → root_causes; frames/events/chain/headline → telemetry_json | Primary là khâu đầu fail. Thiếu evaluation map bị từ chối ở result validation; không tự tạo failure trong frontend |
| List API — backend/service/analysis/AnalysisViewService.java:83/137 | failures + simulation_runs + primary root cause → failure_type, outcome, failure_class, cause_code, root_cause, confidence, metric scalars | root_cause fallback failure_description, chưa chắc có nguyên nhân riêng. Không verdict/evaluation_valid/trace/category/source trong list DTO; chỉ là lỗi đã lưu |
| Detail API — AnalysisViewService.java:275/480 | RunBundle đã COMPLETED → failure_type từ DB, verdict, evaluation_valid, chain, metrics, stage_evidence, simulator/IDs | evaluation_valid dùng AnalysisMetrics.valid + evidenceComplete; evaluation_version là aggregation, không historical rule ID |
| Dashboard/inspection — AnalysisService.java:48/59/65 | Status/end_reason/trace/completeness guard → TIMEOUT/ERROR/INCOMPLETE/NOT_FINISHED hoặc nhãn AEB; inspection có run + detail nullable | Backend guard không đồng nghĩa core evaluator đã sửa. Run chưa xong có detail=null, không fake SAFE |
| UI — AnalysisFailureExplorer:79; AnalysisRunSummary:26/45; AnalysisRunEvidence:22/51 | Hiển thị đúng failure_type; tách verdict, archive classification, suspected cause; units giữ nguyên | Không suy failure_type từ collision/command/metric. Thiếu/invalid dùng fallback trung tính, chain null không crash |

Danh sách filter hiện hành gửi `scenario_id/failure_class/outcome/weather/aeb_version_id/days`
và pagination; không có filter failure_type hoặc unsupported category.
Không gộp outcome với failure_type: một run NEAR_MISS có thể PASS nhưng có failure_type LATE_BRAKING/NEAR_MISS;
MISSED_BRAKING có thể đi cùng raw outcome SAFE và verdict FAIL.
Danh sách/dashboard/detail không có đủ cùng metadata để tự đồng nhất mọi projection phía client.

## 3. Classification matrix

| Classification | Backend Code/Value | Evaluation Rule | Required Evidence | UI Label | Limitation |
|---|---|---|---|---|---|
| Va chạm | failure_type=COLLISION; outcome=COLLISION | collision flag trong metrics; priority sau nhánh false activation | Collision flag/event + run/source; impact ego speed nếu có | Va chạm được ghi nhận | Quan sát va chạm chưa chứng minh missed/ineffective hoặc tránh được |
| Phanh oan | FALSE_BRAKING | triggered=(aeb_decision_t!=null); hazard=entered_path hoặc collision; triggered && !hazard | Decision time + observed path/hazard flags, trace | Phanh oan theo luật | Closed-loop/path heuristic, chưa counterfactual; không dựa vào “không va chạm” đơn lẻ |
| Bỏ sót phanh | MISSED_BRAKING | hazard && idealTriggerT!=null && !triggered; idealT là frame GT TTC đầu <= ngưỡng cấu hình | GT TTC trace, hazard/path flags, decision absence trong hợp đồng có đủ dữ liệu | Bỏ sót phanh theo luật | Collision được ưu tiên; flag missed có thể còn tồn tại nhưng failure_type COLLISION. Chưa avoidability/counterfactual |
| Phanh muộn | LATE_BRAKING | Hazard branch không collision/missed; kết quả hazardChain | Stored chain/cause codes, decision/detection/GT timing | Phanh muộn theo luật | Không phải riêng kiểm chứng response yếu; có thể PASS và NEAR_MISS |
| Sát nút mọi khâu đạt | NEAR_MISS | min TTC/min distance theo ngưỡng core; primary không fail thì failure_type NEAR_MISS | Stored min metrics + chain | Suýt va chạm theo luật | Không tự coi PASS là an toàn tuyệt đối; frontend không tính lại ngưỡng |
| Không ghi nhận lỗi theo luật | failure_type=null, verdict=PASS, evaluation_valid=true, status=COMPLETED | Chỉ đọc tổ hợp do backend cung cấp | Explicit null và metadata hợp lệ | Không ghi nhận lỗi theo luật hiện hành | Không chứng nhận AEB chắc chắn an toàn; undefined không được coi là explicit null |
| Không đủ điều kiện kết luận | evaluation_valid=false/thiếu; verdict thiếu; execution chưa hoàn tất | Không có rule client; chỉ điều kiện trình bày | Metadata validity/status/verdict | Chưa đủ dữ liệu đánh giá / API chưa xác nhận điều kiện đánh giá / API chưa có verdict hợp lệ | Không tự biết thiếu field nào, evaluator chưa chạy hay lỗi |
| Phanh không hiệu quả | Không có enum INEFFECTIVE_BRAKING trong implementation audit | Chưa có classifier riêng | Command, applied pedal, achieved/available decel, response onset, avoidability | Không tạo nhãn phân loại mới | LATE_BRAKING/LOW_FRICTION là hướng điều tra theo luật hiện có, không đủ thay cho taxonomy này |
| Nguyên nhân | failure_class/cause_code + chain, confidence | Khâu đầu fail và heuristics Evaluation.hazardChain | Số đo từng khâu, trace/IDs; cần xác minh độc lập để confirmed | Khâu nghi ngờ đã lưu từ API · chưa xác nhận nguyên nhân | Điểm luật hằng không phải probability/calibrated confidence; không có confirmed-cause field |

Ba nhóm mục tiêu: FALSE/MISSED có luật hiện có với giới hạn nêu trên;
INEFFECTIVE chưa classifier độc lập. Phase 14 không triển khai thêm bất kỳ nhóm nào.

## 4. Vấn đề UI đã xác nhận và xử lý

| ID / mức / vị trí trước sửa | Trước | Sau / lý do |
|---|---|---|
| C14-01 / P1 — AnalysisFailureExplorer.tsx:79 | Bỏ failure_type có trong API; chỉ thấy outcome và khâu | Thêm nhãn + mã failure_type ngay cột hiện có; outcome ghi rõ là nhãn API, khâu là khâu luật nhắc tới |
| C14-02 / P1 — AnalysisRunEvidence.tsx:83 | evaluation_valid=false vẫn hiện stage đỏ/xanh “Đạt/Không đạt theo luật” | Chỉ hiện verdict/stage pass/fail khi status COMPLETED, validity explicit true và verdict hợp lệ; còn lại “Chưa có kết luận hợp lệ”. Không thay passed hoặc rescore |
| C14-03 / P1 — AnalysisRunSummary.tsx:42; Detail page:73 | Headline không có verdict/failure_type riêng; validity thiếu vẫn hiện như hợp lệ | Shared section trong panel hiện có tách đánh giá và phân loại đã lưu; headline/badge không nâng kết luận khi metadata thiếu |
| C14-04 / P2 — Explorer cause/action | root_cause fallback failure_description nhưng link gọi “Nguyên nhân” | Ghi rõ giả thuyết chưa xác nhận; thiếu cause_code thì nói chưa có giả thuyết riêng; link “Bằng chứng” giữ route/aria-label/context |
| C14-05 / P1 runtime — Summary/Telemetry/Evidence dùng d.chain.filter/find/map | Chain null có thể crash, dù chỉ thiếu evidence | recordedChain guard cho cả ba consumer; null/empty không có nghĩa mọi khâu đạt |
| C14-06 / P2 — empty list | Không có ca lỗi dễ bị hiểu là toàn bộ run an toàn | Chú thích list chỉ gồm lỗi đã lưu; empty theo filter không chứng minh an toàn, metadata thiếu phải mở Detail |

Không thêm card trang trí: shared component là dl hai cột trong panel hiện hữu, xuống một cột trên mobile.
Tokens/breakpoint shell, bảng nội bộ, navigation, nghiệp vụ dataset/runs/CARLA/permission giữ nguyên.
Stage order từ API giữ nguyên; chỉ khâu có passed=false mới được lấy mô tả làm suspected primary.
Metric values/conversion/formatters và cách đọc recorded frames giữ nguyên.

## 5. Trạng thái chưa thể kết luận và traceability

- Null/undefined failure_type: không suy loại lỗi từ impact/TTC/brake time; undefined không đồng nhất “không lỗi”.
- evaluation_valid=false: giữ nhãn phân loại đã lưu kèm “chưa đủ điều kiện kết luận”; stage badges trung tính.
- evaluation_valid thiếu hoặc verdict null: không suy evaluator đã chạy/chưa chạy/thất bại.
- PENDING/RUNNING/FAILED với detail=null: trạng thái run và thông báo không có kết quả AEB hợp lệ hiện hành.
- HTTP 503: error/retry hiện có, không hiện evaluation giả. Đây là kiểm lỗi API, không chứng minh evaluator lifecycle handling riêng.
- CPLA/TURNING/CUT_IN: không có explicit applicability status trong DTO. Fixture có category CPLA + metadata thiếu
  chỉ kiểm fallback trung tính; không coi đó là run category unsupported thực sự đã chạy.
- Canonical API không đủ applied pedal/actual braking onset/limiting factor/calibration ID;
  không tính command từ decel và không kết luận đáp ứng yếu/unavoidable.
- Dữ liệu hiện trong UI là mô phỏng (kinematic hoặc CARLA), không measured real-world.
- Run/scenario/seed/xe/simulator IDs, returnTo, timestamps và metric source vẫn từ API.
- evaluation_version vẫn được gọi đúng “Phiên bản tổng hợp”; không gán thành rule/formula version của lịch sử.
- List API không trả verdict/validity/trace; mọi nhãn list là archive theo API, không hứa evidence đầy đủ.

## 6. File thay đổi

| File | Mục đích |
|---|---|
| ui/analysisClassificationData.ts (mới) | Mapping năm failure_type thật; validity presentation; chain null guard; không metric heuristic |
| ui/AnalysisClassification.tsx (mới) | Shared verdict/classification section trong Summary và Evidence |
| ui/AnalysisFailureExplorer.tsx | Hiện failure_type/mã, tách suspected cause, empty/scope note, action text |
| ui/AnalysisRunSummary.tsx | Tách kết quả đánh giá khỏi observed metrics, headline/parameter highlight chỉ khi metadata cho phép |
| ui/AnalysisRunEvidence.tsx | Suspected primary, validity gate stage badges, missing chain |
| ui/AnalysisRunTelemetry.tsx | Guard chain null khi đọc nhận định; không đổi metric mapping |
| ui/AnalysisRunEvidence.module.css | Dl responsive theo tokens hiện có, không global overrides |
| frontend/src/app/analysis/failures/[runId]/page.tsx | Chỉ hiện outcome badge khi đánh giá hợp lệ; không badge khâu gây nhầm với classification |
| frontend/tests/analysis-classification.mjs (mới) | 7 nhóm tests cho production mapping/validity/no inference |
| frontend/tests/analysis-classification-ui.mjs (mới) | Login form/fixtures, API mapping/states/context/filter/keyboard/responsive và screenshots |
| frontend/tests/analysis-redesign.mjs | Sửa assertion precision còn sót từ Phase 13; fixture zero impact phải explicit COLLISION, giữ assertion zero |
| Báo cáo này | Thay plan active khi hoàn tất, kèm matrix và bằng chứng |

Không sửa production backend/core/worker/schema/API types/services, Admin hoặc format helper Phase 13.
Không tạo issue trên dịch vụ ngoài vì chưa được yêu cầu; những lỗi backend đã có [TD-58/59/60](../tech-debt-tracker.md).

## 7. Before/after cụ thể

| Input API | Trước | Sau |
|---|---|---|
| failure_type=MISSED_BRAKING, outcome=SAFE, verdict=FAIL | List/Detail không có riêng loại lỗi; outcome dễ chi phối cách hiểu | “Bỏ sót phanh theo luật” và FAIL riêng; không suy classification từ SAFE |
| failure_type=COLLISION, cause_code/root_cause null | Chỉ badge Va chạm và mô tả thiếu | “Va chạm được ghi nhận”; chưa có giả thuyết nguyên nhân riêng, không tự gán missed/ineffective |
| completed + validity=true + PASS + failure_type=null, có command | Headline không tách thiếu failure record | “Không ghi nhận lỗi theo luật hiện hành”; không tự đổi thành false braking |
| completed + evaluation_valid=false + chain.passed=false | Stage “Không đạt theo luật” màu đỏ | “Chưa có kết luận hợp lệ”, nhãn archive vẫn giữ nhưng được giới hạn |
| evaluation_valid undefined, verdict null | Thiếu metadata có thể vẫn dùng headline/badge như hợp lệ | API chưa xác nhận điều kiện đánh giá; không PASS/FAIL suy đoán |
| chain=null, metrics/trace khác hợp lệ | Có thể crash trong các panel cùng mount | Empty evidence trung tính, metrics Phase 13 không đổi |
| Empty failure list theo filter | Có thể đọc thành không lỗi toàn bộ run | Chỉ không có lỗi đã lưu khớp filter, không chứng minh an toàn |

## 8. Tests, browser QA và validation

Artifact local gitignored: `data/analysis-phase14-2026-11-15/`.
Next production tại 127.0.0.1:3126, Edge headless, actor .invalid và API interception.
Đăng nhập qua form thật với response fixture, không đăng nhập tài khoản/backend thật hoặc sửa DB.
7 ảnh baseline, 11 ảnh after. Đã xem evidence mobile375 và list desktop1440.
Before/after fixture được căn lại weather RAIN cho phù hợp query; thay đổi weather text không phải kết quả sửa production.

| Kiểm tra thực thi | Kết quả |
|---|---|
| Git branch/status trước sửa | chuvv, sạch, Phase 13 commit1753867 |
| node --test tests/analysis-classification.mjs tests/analysis-metric-format.mjs | PASS 12 nhóm (7 classification + 5 metric); chạy lại sau đổi tên module |
| npm.cmd run lint | PASS exit0, không warning ở lượt cuối |
| npx.cmd tsc --noEmit | PASS exit0 sau đổi tên helper |
| npm.cmd run build | PASS exit0 ở build-final.log |
| node tests/analysis-classification-ui.mjs | PASS exit0: năm failure types thật, no inference, missing validity/chain/trace/verdict/classification, pending/failed/API error/empty, filters/context/keyboard/375/768/1440 |
| node tests/analysis-overview.mjs | PASS exit0, 5 viewport/context/units/states/menu/focus fixtures |
| node tests/analysis-metrics-ui.mjs | PASS exit0, formatter/mapping/CSV fixtures Phase 13 giữ nguyên |
| node tests/analysis-redesign.mjs | PASS exit0, suite đầy đủ overview/runs/failures/dataset/detail/telemetry/evidence/playback, keyboard/menu và 5 viewport |
| Java nhóm dưới | PASS 62 tests, 0 failures/errors/skips |
| RepoDocsTest sau khi chuyển report completed | PASS 5 tests, 0 failures/errors/skips; docs-check.log |
| git diff --check và kiểm file mới/link docs | PASS; kiểm cả file mới chưa stage |

Regression mới không tạo backend enum để thử: dùng failure_type thực emit bởi Evaluation.
Trường unsupported/lifecycle chưa có contract chỉ kiểm neutral fallback, ghi gap thay vì tạo trạng thái mới.
Hai characterization tests FailureAnalysisAuditTest vẫn chứng minh lỗi evaluator cũ, không chứng minh thuật toán đã sửa.

```powershell
$env:MAVEN_OPTS='-Xmx512m -XX:ActiveProcessorCount=2'
.\mvnw.cmd -B '-Dtest=FailureAnalysisAuditTest,AnalysisMetricsTest,AnalysisServiceTest,AnalysisSnapshotTest,SimulatorBehaviorTest,LeadVehicleSimulatorTest,RepoDocsTest' test
```

Lỗi phát triển được giữ log: build.log bị trùng tên helper/component khác casing trên Windows,
đã đổi helper thành analysisClassificationData; build-final.log PASS.
Browser baseline gặp lỗi home fixture thiếu regression response; đã bổ sung đúng DTO fixture, không sửa Home production.
Test cuộn phím ban đầu assert trước browser scroll hoàn tất; đổi thành focus sau resize và chờ scrollLeft tăng.
Suite rộng còn assertion 777.7 thay vì precision Phase 13 777.70, đã sửa expected display;
zero impact fixture ban đầu là non-collision, đã explicit COLLISION để giữ kiểm tra số 0 hợp lệ.
Không đổi production units/physics để làm test xanh.

Chưa chạy live backend/MySQL/Redis, CARLA/ScenarioRunner, đo xe thực, screen reader, Firefox/Safari/native touch.
Không có Figma truy cập được để đối chiếu; không tuyên bố fidelity hoặc accessibility conformance đầy đủ.
Kết quả browser là fixture-only; unit tests không chứng minh phân loại chính xác thực địa.

## 9. Rủi ro còn lại và điểm dừng

- TD-58: core thiếu gate evidence rỗng; LOW_FRICTION có thể nhầm giới hạn xe; taxonomy/avoidability/counterfactual chưa đủ.
  Không sửa evaluator hoặc rescore archive. Cần phase backend riêng với ADR/fixtures và identity tương ứng.
- TD-59: command/pedal/target_v dọc, build/formula/calibration identity và rule version còn thiếu.
  Chưa đủ evidence để confirmed cause hoặc phân biệt controller với vật lý.
- TD-60: geometry CCR ở Detail/Playback còn dùng crossing/pedestrian; Phase 14 không redesign scene.
- List không trả đủ validity/trace/verdict; chỉ hiện classification đã lưu và dẫn đến Detail.
  Có thể cần contract bổ sung ở phase phù hợp, không tự thêm cột/filter ở đây.
- Strict validity presentation làm payload legacy thiếu metadata hiển thị trung tính; metric/archive vẫn truy xuất được.
- Báo cáo completed Phase 13 chưa có trong repo; không sửa tài liệu phase trước trong commit này.

Dừng sau Phase 14 để người dùng review, commit/push thủ công.
Commit đề xuất: `feat(analysis): improve AEB failure classification presentation`.
