# Phase 18 — Run Detail & Evidence

Ngày 16/11/2026, nhánh `chuvv`, nền `bfb5b25`; working tree sạch, Phase 17 đã commit.
Chỉ frontend chi tiết run, evidence, mapping, regression và báo cáo. Không commit/push.

## Bằng chứng và phạm vi

- `analysisClassificationData.ts`: null + PASS đang trở thành “Không ghi nhận lỗi”; yêu cầu Phase 18 giữ null là thiếu phân loại.
- `AnalysisRunEvidence.tsx`: số đo không có đường dẫn nguồn/giá trị gốc; lấy mốc đầu tiên của cả khâu, nhãn thời gian 2 chữ số.
- Cùng file gọi Object.entries(group.values) không bảo vệ values null; một nhóm lỗi có thể làm mất toàn màn hình.
- Route detail bảo vệ callback cũ nhưng chưa kiểm ID của response; có thể render evidence không khớp URL nếu API trả sai ID.
- Header chưa ghi scenario ID/category; Evidence đặt giả thuyết trước dữ liệu, thiếu danh mục mốc có nguồn.

## Thực hiện

1. Truy vết source/frontend/backend/core/worker và tài liệu Phase 11–17; lập matrix trong báo cáo.
2. Chụp baseline 375/390/768/1024/1440 bằng production app và fixture API, đăng nhập qua form.
3. Sửa tối thiểu: phân loại null, identity guard/context, evidence rows và timeline nguồn; giữ evaluator/physics/backend.
4. Unit + browser regression cho source, null/partial, timestamps, links, ID mismatch, keyboard/responsive.
5. Lint, TypeScript, build, Analysis regressions và RepoDocsTest; ghi bằng chứng thực thi rồi chuyển completed.

## Giới hạn

Không có live CARLA/DB, calibration từng run hoặc Figma file để đối chiếu. TD58–61 và TD17 vẫn còn;
không tạo hazard onset/brake applied/confirmed cause hoặc clock offset từ số liệu hiện có.


## 1. Kiến trúc Run Detail và tài liệu đối chiếu

Rendering path: `app/analysis/failures/[runId]/page.tsx` → `vehicsimApi.analysisInspection`
→ `GET /api/v1/vehicsim/analysis/runs/{id}` → `AnalysisController.analysisInspection`
→ `AnalysisService.inspection` → `AnalysisViewService.failureDetail`.
Route render Summary/Telemetry/Evidence bằng ba tabpanel, chỉ panel được chọn hiển thị;
Timeline chung nằm ngoài tabs. Playback là route con và endpoint riêng `/runs/{id}/playback`.
`AnalysisRunEvidence` hiện được import trực tiếp ở route production; không chỉ là component kế hoạch.

Đã đối chiếu AGENTS gốc/frontend, CLAUDE gốc/frontend, DESIGN, hướng dẫn đổi package/mục7 naming,
hướng dẫn accessibility của Next cài trong node_modules, architecture và các báo cáo
[Phase11](2026-11-14-admin-analysis-phase-11-audit.md),
[Phase12](2026-11-14-admin-analysis-phase-12-overview.md),
[Phase13](../active/2026-11-14-admin-analysis-phase-13-metrics.md),
[Phase14](2026-11-15-admin-analysis-phase-14-classification.md),
[Phase15](2026-11-15-admin-analysis-phase-15-explainability.md),
[Phase16](2026-11-16-analysis-phase-16-telemetry.md),
[Phase17](2026-11-16-analysis-phase-17-playback.md).
Phase13 còn ở active trong repo; không coi vị trí file là bằng chứng chưa commit hoặc tự sửa phase cũ.

Căn cứ kiến trúc: [ADR040](../../adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md),
[ADR042](../../adr/ADR-042-loi-aeb-mo-phong-cham-diem-chuyen-sang-java.md),
[ADR050](../../adr/ADR-050-mo-category-xe-phia-truoc-bo-dong-hoc.md),
[ADR051](../../adr/ADR-051-hieu-chuan-phanh-carla-xosc5.md),
[sổ CP_CROSSING](../../vehicsim/cong-thuc-cp-crossing.md),
[hợp đồng chỉ số](../../vehicsim/analysis-metrics-contract.md),
[architecture](../../vehicsim/architecture.md).
Tên package cũ trong ADR lịch sử không được dùng để phục hồi code Python/AEB cũ.
Không kiểm lại tiêu chuẩn ngoài repo và không đưa ra chứng nhận an toàn.

## 2. Evidence pipeline kiểm từ code

Đường dẫn dưới tính từ `src/main/java/com/vsos/` trừ worker/frontend.
Mỗi hàng ghi input/output, nguồn, đơn vị/thời gian, biến đổi/guard/missing và ID truy vết.

| Giai đoạn / hàm | Input → output / nguồn | Unit và time domain | Biến đổi, validation, missing | Trace ID |
|---|---|---|---|---|
| Scenario: backend/service/scenario/ScenarioRules, FamilyService, LeadFamilySpec | IR + category → variant/config | km/h, m, m/s, μ; chưa có clock run | Validate category/range; CP_CROSSING/CCRS/CCRM/CCRB runnable; CPLA/TURNING/CUT_IN chưa runner | scenario_id, variant/version ID |
| Execution: backend/service/simulation/RunService | variant + AEB + xe + seed/profile → run/bundle/.xosc | dt s; queued_at là lịch, không simulation time | Project/quota/identity/seed; không đổi input khi review; failed run không sinh kết luận giả | run_id, seed, vehicle_id, aeb_version_id, simulator |
| Kinematic: core/bridge/Bundle; core/simulation/Simulator, LeadVehicleSimulator | case/params/vehicle → frames/events/metrics | SI; t từ đầu run, nominal dt | Integration/geometry model; frames round0,001; không đo xe thật; no brake → một số objective null | bundle seed/profile + run |
| CARLA: worker/run_xosc.py, vehicsim_aeb_control.py:111/140; core/simulation/CarlaSession.step:256 | Actor observations → Java bridge → command/pedal; frames/events | t=GameTime−started_at, round0,001; v chiếu trục run | Java bỏ tick lặp/lùi; adapter áp pedal; synthetic perception từ GT; physics/calibration có giới hạn | .xosc identity, seed/run/artifact |
| Sensor branch: worker/sensor_recorder.py:330–357 | Actor/control/IMU/radar/hit → CSV/RGB | CSV sim_time_s trừ frame đầu recorder | Clock origin khác controller; không tự ghép camera/CSV vào canonical timeline; không phải đầu vào Detail | artifact/run; frame của recorder |
| Recorded projection: core/simulation/RecordedTelemetry.project | raw frames → motion_telemetry | m, m/s, m/s², m/s³, TTC s, t gốc | Nonfinite→null; invalid time bỏ/reset derivative; jerk Δa/actualΔt, không phải objective RMS; không nội suy | run + raw frame.t |
| Canonical metrics: Simulator.summaryMetrics:233, brakePhaseMetrics:202; CarlaSession.finish | frames/controller/geometry → stored scalar metrics | SI; timestamps controller và event t | RMS dùng nominal dt từ onset tới cuối; stopping có ngoại suy; impact ego speed khi collision, không collision→null; thiếu input→null theo contract | run + metric_source, không có argmin timestamp |
| Evaluation: core/evaluation/Evaluation.evaluate:127 | outcome/metrics/params → verdict, failure, chain/headline | Boolean/code; confidence điểm luật | Rules; collision không chứng minh missed/ineffective; empty core có SAFE/PASS legacy (TD58), API có guard; không causal proof | failure_type, stage/cause_code, run |
| Storage: RunService.persist:1040 | evaluation/outcome → DB scalar + telemetry_json + failure/root_cause | SI; JSON giữ t tương đối run | Transaction; projection giữ case/params/frames/events/metrics/chain; chưa giữ đầy đủ immutable build/formula/calibration identity | simulation_runs.id, failure.run_id |
| API: AnalysisService.inspection:130; AnalysisViewService.header:271/failureDetail:480/playback:648 | DB/raw → inspection/detail/playback | speed×3,6 cho trường km/h; giữ canonical t | Project scope; non-COMPLETED→detail null; evaluation_valid dùng AnalysisMetrics guard; stage thiếu value→null; category có fallback CP legacy | run_id/scenario_id/variant_id/simulator |
| UI: route + Summary/Evidence/Telemetry + Phase17 Playback | API → facts, sources, classification, links | Không tính lại physics; chỉ format unit/số | Request-key + cleanup + ID guard mới; null classification→unavailable; nguồn/missing/unknown giữ riêng; không offset thời gian | URL runId + response IDs + returnTo/signal/t |

## 3. Source/evidence matrix

`raw` dưới đây là projection trong telemetry_json, không phải sensor CSV.
Bảng phản ánh code hiện tại, không đảm bảo immutable provenance cho run cũ.

| Evidence Field | Source | Transformation | API Field | UI Location | Reliability Limitation |
|---|---|---|---|---|---|
| Danh tính | simulation_runs + scenario/version joins | Labels/IDs | run.run_id/scenario_id/scenario_version_id; detail.run_id | Header/identity | ID guard không chứng minh historical reproducibility |
| Source / cadence | simulator_version, fixed_delta_seconds | Đổi tên field | run.simulator/dt | Identity; chart nominal step | dt là cấu hình, không đo sampling; unknown source giữ unknown |
| Category | run_config_json.category | Backend fallback CP nếu thiếu | environment.category | Identity | Fallback chưa có provenance flag; không khẳng định run lịch sử explicit CP |
| Vehicle/AEB | vehicle/version joins + catalog/queries.aebValues | Display name/value/unit | vehicle/config/aeb_version_id/configuration | Identity + cấu hình | Chưa snapshot calibration/build đầy đủ |
| Collision outcome | Evaluation + persisted DB/raw outcome | Header chọn raw/fallback; false-positive tách outcome | outcome | Summary “Va chạm theo outcome” | Đây là outcome backend; không phải physical root cause hoặc classification từ impact |
| Collision time | Simulator/CarlaSession ghi event collision | Giữ t s | events[kind=collision].t | Evidence timeline/chart/playback journal | API Detail không raw collision sensor stream; thiếu event không suy ra không va |
| First detection | AebStack + persisted first_detection_time_s | Projection | metrics.first_detection_t; stage_evidence[PERCEPTION].values.first_detection_t | Timeline/stage/Summary | Mốc nhận thức controller, không ground-truth hazard onset |
| Detection distance | Core gap tại phát hiện → DB | Scalar projection, m | stage_evidence[PERCEPTION].values.first_detection_distance_m | Stage facts | Khác radar range và min separation |
| FCW | Controller → DB fcw_time_s | Projection, s | metrics.fcw_t | Evidence timeline | Có timestamp mới hiện; không suy từ TTC |
| Decision | Controller aeb_decision_t → DB aeb_activation_time_s | Rename, giữ s | metrics.aeb_activation_t; stage_evidence[DECISION].values.decision_t | Timeline/stage/Summary | Latch quyết định, chưa phải command force/deceleration đo |
| Decision TTC | raw.metrics.aeb_decision_ttc_s | Projection, s | stage_evidence[DECISION].values.decision_ttc_s | Stage facts | Derived perceived TTC, không thay bằng GT khi null |
| Onset command | raw.metrics.brake_onset_t | Projection, s | metrics.brake_onset_t; stage_evidence[CONTROL].values.brake_onset_t | Summary/timeline/stage | Không physical applied onset hoặc T_AEB theo protocol |
| Command delay | DB braking_response_time_s từ core braking latency | Scalar projection, s | stage_evidence[CONTROL].values.response_time_s | Stage/explanation | Duration, không absolute timestamp; không tạo jump |
| Max deceleration | Canonical motion stats, CARLA DecelMeter processed | Magnitude scalar, m/s² | metrics.max_deceleration_mps2; stage_evidence[VEHICLE_DYNAMICS] | Stage/Summary | CARLA smoothing/clamp; không IMU thô, chưa có timestamp cực trị |
| Road friction | raw.case.road_friction | Projection, dimensionless | stage_evidence[VEHICLE_DYNAMICS].values.road_friction | Stage/môi trường | Config/assumption; không xác nhận actual tire-road braking force |
| TTC threshold event | AebStack ghi ttc_below khi so sánh TTC | Derived event từ backend, giữ t | events[kind=ttc_below].t | Timeline với nhãn “dẫn xuất” | Không gọi hazard onset/late braking |
| Stop event | Simulator/CarlaSession recorded condition | Event t s | events[kind=stopped].t | Timeline | Không tự suy event từ speed=0 hoặc decel |
| Impact speed | Core metrics → DB | Ego speed m/s; km/h field riêng×3,6 | metrics.impact_speed_mps | Summary + Phase15 explanation | Chỉ áp dụng collision hoàn tất; không relative impact; null≠0 |
| RMS jerk | Simulator.brakePhaseMetrics | sqrt(mean((Δa/nominal dt)²)) từ onset→cuối | metrics.rms_jerk_mps3 | Summary + explanation | Legacy unfiltered; khác displayed jerk actualΔt/sensor recomputed |
| Stopping distance | brakePhaseMetrics | x_last−x_onset + v_last²/(2a_available) | metrics.stopping_distance_m | Summary + explanation | Có ngoại suy, không luôn measured-to-stop; API thiếu decomposition |
| Min TTC / separation | Core GT geometry metrics → DB | min TTC GT / min box clearance | metrics.min_ttc_s/min_distance_m | Summary + explanation | Không có argmin t, không tạo link thời gian từ scalar |
| Motion/TTC sample | raw.frames → RecordedTelemetry/API loop | Field projection; speed m/s→km/h; jerk/crossing derived | motion_telemetry, telemetry | Telemetry/chart | Null độc lập; không GT fallback, không downsample evidence |
| Evaluation validity/verdict | DB + AnalysisMetrics.valid/evidenceComplete | Metadata gate | evaluation_valid/status/verdict | Classification + stage state | API không có lifecycle pending-vs-evaluation-crash riêng |
| Failure classification | Evaluation.failure → failures | Chỉ map 5 code thực có | failure_type | Classification | null luôn thiếu phân loại, kể cả PASS; không tự tạo INEFFECTIVE/INCONCLUSIVE code |
| Stage hypothesis | raw.chain + first failed stage | Giữ stage/cause/summary/confidence | chain, failure_class, chain_confidence | Evidence rules | Confidence hằng theo luật, không calibrated probability; chưa confirmed cause |
| Aggregation version | AnalysisMetrics.VERSION hiện tại | Chuỗi metadata | evaluation_version | Evidence/Summary | Không phải rule/formula version immutable tại thời điểm run |
| Hazard/applied/decel-onset/calibration ID/confirmed cause | Chưa có contract đủ trong Detail | Không tạo field/marker/fallback | Không có | Giới hạn nêu bằng chữ | TD59/61; không suy từ TTC, command, μ hoặc ADR lịch sử |

Stage source trên UI dùng **index thật của response**, ví dụ
`stage_evidence[3].values.max_deceleration_mps2`. Không dùng index nhóm sau lọc;
index này là đường dẫn JSON, tuyệt đối không được dùng làm timestamp.
Field lạ giữ tên và giá trị số gốc, không tự gán unit/event semantics.

## 4. Finding có bằng chứng và thay đổi trước/sau

| Ưu tiên | Code ở nền / bằng chứng | Trước → sau |
|---|---|---|
| P1 | analysisClassificationData.ts:24–27; unit/browser null+PASS | Null được diễn giải “không ghi nhận lỗi” → “API chưa có phân loại lỗi”; verdict PASS vẫn nguyên. Điều chỉnh rõ quy ước Phase14 theo yêu cầu Phase18 |
| P1 | AnalysisRunEvidence Object.entries(group.values); explanationData find(e.stage).values; fixture null group | Null nhóm/value có thể ném lỗi, kể cả Summary đang hidden → skip nhóm sai, giữ nhóm có values thiếu với cảnh báo; sibling hợp lệ vẫn xem được |
| P1 phòng vệ | Route chỉ guard callback; fixture wrong-run/wrong-detail | Response ID khác URL vẫn có thể render → từ chối toàn response, hiện lỗi và retry; không trộn facts |
| P2 | Evidence không source path/raw value và lấy time đầu cả khâu | Mỗi item có type/unit/source/exact raw; chỉ item timestamp đã xác định mới có link của chính nó; duration/extrema không nhận timestamp |
| P2 | Nhãn links 2 decimals, API time 0,251/0,252 | Nhãn 3 decimals + raw string; URL giữ đúng number, không round/offset. Source scalar vẫn nguyên |
| P2 | Header thiếu scenario ID/category; Evidence mở đầu bằng hypotheses | Context IDs/category/unknown/unsupported → observed outcome/command → evaluation; Evidence có timeline nguồn trước chain |

Không xác nhận P0 từ frontend. ID sai là tình huống phòng vệ tái hiện bằng fixture,
không phải cáo buộc backend hiện tại đã trả sai run trong production.

## 5. File thay đổi và phạm vi giữ nguyên

- `frontend/src/app/analysis/failures/[runId]/page.tsx`: ID guard/error, identity/category từ API và giới hạn category.
- `frontend/src/components/analysis/AnalysisRunSummary.tsx`: hai facts outcome/command từ field sẵn có trước evaluation.
- `AnalysisRunEvidence.tsx`: timeline nguồn, giới hạn, row-level links/type/raw/source, missing nhóm.
- `analysisEvidenceData.ts` mới: mapping 4 stage/8 field; chỉ projection/validation presentation và URL.
- `analysisClassificationData.ts`: bỏ null→no-failure fallback; `analysisMetricExplanationData.ts`: guard partial evidence dùng chung Summary.
- `AnalysisRunDetail.module.css` / `AnalysisRunEvidence.module.css`: grids/word wrapping/focus theo token, scope Analysis.
- Tests mới `frontend/tests/analysis-evidence.mjs` / `analysis-evidence-ui.mjs`; cập nhật classification unit/browser,
  explainability partial-group regression, precision selectors trong analysis-redesign.
- Báo cáo này thay active plan sau khi validation hoàn tất.

Giữ nguyên API/DTO contract, dữ liệu backend, Evaluation/AEB/CARLA/calibration/schema/permissions.
Giữ các scalar/đơn vị SI/precision raw, formulas Phase15, chart nguồn/domain/nearest lookup Phase16,
clock/controls/gap/frame/path guards Phase17, cấu hình/scene/similar-run links hiện có.
Không thêm chỉnh kết luận/Reviewer decision hoặc gán severity/confidence mới.

## 6. Information architecture trước/sau

Trước: Identity (simulator/baseline/xe/ngày) → tabs/timeline;
Summary mở bằng headline/assessment rồi objectives; Evidence mở bằng assessment/hypothesis rồi stage facts.

Sau: Identity thêm run/scenario/version/category, giữ source limits → tabs/timeline;
Summary mở bằng collision theo outcome + command onset, tiếp assessment/classification rồi chỉ số/config;
Evidence mở bằng danh mục mốc thực có/source/giới hạn → assessment/primary hypothesis → stage facts/extra unknown groups.
Không biến năm cấp logic thành năm card, không thêm chart/widget hoặc field điều tra chưa có API.
Dữ liệu recorded, derived metric, config và rule hypothesis có nhãn khác nhau.

## 7. Traceability và data quality

Mỗi stage field hiện label/unit/type, value formatted, source path, raw number để kiểm precision,
association theo stage backend và link nếu chính field là timestamp hợp lệ trong vùng trace.
`response_time_s` là duration; `max_deceleration_mps2` không có argmax time; μ là config:
không dùng time của field bên cạnh làm time của chúng.

Null/nonfinite/negative field có semantics không âm → “—”, không zero; số0 hợp lệ giữ0.
Field số lạ có thể âm và không bị xóa chỉ vì frontend chưa biết tên/unit.
Nhóm null/values null/array/object sai được xử lý bảo thủ; source index của siblings giữ nguyên.
Không tuyên bố đây là schema validator cho mọi payload sai: các object/array bắt buộc khác vẫn theo API contract.

Evaluation gate/status giữ Phase14. API không cung cấp evaluation_pending/evaluation_failed riêng,
nên UI không bịa lifecycle: technical run RUNNING/FAILED hiện status/end_reason/error như trước,
evaluation_valid=false hiện thiếu dữ liệu; verdict FAIL hợp lệ là rule FAIL, không phải engine crashed.
Unknown failure code giữ code; null không thành SAFE/No failure.
Unknown simulator/category thiếu vẫn ghi chưa có; category ngoài4 runnable cảnh báo rõ.

## 8. Evidence ↔ Telemetry ↔ Playback

Detail và Playback cùng đọc `runBundle(...).raw.frames/events/metrics`; source inspection xác nhận
cùng simulation t cho canonical endpoints. Không áp mapping này cho CSV/RGB/sensor recorder.
Link truyền exact t, run ID, signal, returnTo và query context; Playback bỏ section; Telemetry chọn section=telemetry.
Không tạo offset hoặc array-index time. Trong gap, Phase17 vẫn đọc sample trước và hiển thị tuổi frame;
link không có nghĩa tồn tại sample đúng thời điểm.

Link stage không xuất hiện khi null/invalid/outside/no telemetry; unknown stage không mượn semantics
decision_t để tạo event. Playback link còn phụ thuộc completed+trace_available.
Điều hướng telemetry cùng route không fetch lại inspection (full regression kiểm số request).
No state update loop; không đổi chart/downsample/frame data hoặc tự tái tính classification.

## 9. Regression và browser evidence

`analysis-evidence.mjs`:7 nhóm production mapping/source-unit-type, null sibling/index/no mutation,
unknown signed field, invalid/zero/tiny timestamps, seek range và exact context links, source-only markers.
`analysis-explainability.mjs` thêm1 nhóm partial evidence; total các suites liên quan41 tests.
Null+PASS assertions đổi theo yêu cầu explicit Phase18, đồng thời giữ assertion PASS/trusted/no false braking.
Legacy full suite cập nhật3 chỗ thời gian Evidence 2→3 decimals; term selector của field lạ
nay chứa thêm type nên kiểm đúng dt và bổ sung assertion raw field vẫn có giá trị7.
Không bỏ source/zero/missing assertions. Giữ cảnh báo cấp nhóm khi tất cả row đều thiếu.

Browser suite mới dùng Edge headless + production app, đăng nhập qua form với API fixture `example.invalid`.
Không tài khoản thật, không DB/backend/CARLA runtime. 10 ảnh baseline +13 ảnh after:
`data/analysis-phase18-2026-11-16/{before,after}/`. `after/result.json` chỉ được ghi khi các assertions PASS.
Các ảnh375/768/1440 đã được mở để kiểm bố cục; đủ375/390/768/1024/1440 có overflow/focus/tab keyboard assertions.
Native links Enter, focus-visible, Home/End tabs, exact0,251s, sibling metric null,
partial stage, unknown source/category, pending/failed technical run, missing classification/cause,
no telemetry, wrong IDs, API503/retry và response cũ khi chuyển run đều được kiểm.
Mới suite không phát sinh business write; không suy ra live safety validity.

## 10. Validation thực thi

Bảng kết quả sẽ được chốt sau lượt cuối. Logs nằm ở `data/analysis-phase18-2026-11-16/` (gitignored).
Không đánh dấu PASS cho kiểm tra chưa chạy.

## 11. Hạn chế dữ liệu và yêu cầu API còn lại

Theo [tech debt tracker](../tech-debt-tracker.md):
TD59 cần command/pedal/target longitudinal speed, applied-response evidence và immutable build/formula/calibration identity;
TD61 cần cadence/frame-loss metadata và verified recorder/controller/camera time mapping.
Backend category fallback cần provenance flag để tách explicit category và legacy assumption.
Các trường này là yêu cầu bổ sung API, không được frontend tự tạo trong phase này.

TD58 còn core empty SAFE/PASS, LOW_FRICTION có thể quy nhầm giới hạn xe và thiếu avoidability/counterfactual taxonomy;
TD60 cảnh CCR còn đồ họa người đi bộ/geometry cũ; TD54 similar/related-run không tự là ca so sánh tương đương;
TD17 calibration lệch tốc độ thấp/ma sát/xe khác. Không ghi đè metric hoặc sửa evaluator để che các giới hạn đó.
False/Missed/Late/Collision/NearMiss chỉ hiển thị code backend thực có; “ineffective braking” chưa có
classification tương ứng, không được suy từ va chạm+decel.

## 12. Rủi ro và phần chưa kiểm chứng

Không chạy live backend/MySQL/CARLA/physics/calibration hoặc đo xe ngoài thực tế.
Chưa có Figma file/key để đối chiếu, chưa screen reader thật, Safari/Firefox/native touch hoặc
kiểm full WCAG bằng chuyên gia. Browser viewport/keyboard checks chỉ chứng minh phạm vi fixtures.
Source paths dài tăng chiều cao mobile nhưng wrap trong panel, không thay raw data bằng downsample.
Stage source paths là projection API; metadata historical provenance vẫn có giới hạn backend ở trên.
Timeline dùng các mốc hỗ trợ của runMarkers (first event từng kind), không tự nhận là nhật ký mọi event;
API và Playback journal vẫn giữ event gốc. Không dùng tọa độ Scene rút gọn làm evidence chart.
Các debt đã có được tham chiếu, không tạo mục trùng hoặc sửa backend ngoài phạm vi.

## 13. Git và điểm dừng

Chỉ Phase18; không stage/commit/push, không sửa main/backend/worker/schema hoặc Phase19.
Hoàn tất Phase18, dừng để người dùng review/commit/push thủ công. App test port3130 đã dừng.
Commit đề xuất: `feat(analysis): improve failure run detail and evidence traceability`.
