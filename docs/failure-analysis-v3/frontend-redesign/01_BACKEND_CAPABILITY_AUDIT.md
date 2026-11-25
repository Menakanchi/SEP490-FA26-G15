# 01 — Backend capability audit cho Failure Analysis

Ngày kiểm tra: **25/11/2026**. Source baseline: `d712146c2ee03de8d751725c506eb1d4a814d2d8`, worktree sạch trước audit. Đây là audit source và blueprint; không triển khai frontend/backend.

**Kết luận:** backend web hiện phục vụ đọc kết quả baseline, telemetry, phân loại legacy và chốt dataset v2. Core evidence V3.1, adapter JSON/collection, Diagnostic Report và MOBO Handoff mới đã implement nhưng **chưa được nối vào REST**. Không thể thiết kế nút “Phân tích JSON” hoạt động chỉ bằng đổi frontend.

Đọc tiếp: [API/DB](02_API_AND_DATABASE_MAPPING.md), [inventory](03_FRONTEND_INVENTORY.md), [quyết định giữ/gộp/bỏ](04_KEEP_MERGE_REMOVE_MATRIX.md), [workflow](05_USER_WORKFLOW.md), [IA](06_NEW_INFORMATION_ARCHITECTURE.md), [screens](07_SCREEN_AND_COMPONENT_BLUEPRINT.md), [plan](08_IMPLEMENTATION_PLAN.md), [blockers](09_BACKEND_BLOCKERS_AND_DEPENDENCIES.md).

## 1. Phương pháp và ý nghĩa trạng thái

- WORKING: đường gọi production tồn tại và có kiểm chứng source/test tương ứng; không có nghĩa đã thử live HTTP/MySQL/CARLA.
- PARTIAL: có một phần phục vụ nghiệp vụ, giới hạn phải hiện rõ.
- OFFLINE_ONLY: có code chạy programmatic/CLI; không có đường gọi từ backend REST.
- NOT_IMPLEMENTED: chưa tìm được implementation của tính năng được nêu trong phạm vi source audit.
- DEPRECATED: chỉ dùng khi có bằng chứng đánh dấu deprecated. Không suy ra deprecated từ tên `Legacy` hay tuổi tài liệu.
- FE READY: FE có thể gọi API hiện có; BLOCKED: thiếu capability hoặc contract ở boundary cần dùng. “READY” này không phải quyền dispatch optimizer.

Audit đi từ controller/service/SQL/core rồi mới đọc frontend. Kiểm `rg -n 'core.failureanalysis|DiagnosticReport|MoboHandoffBuilder|JsonInputAdapter|OfflineDiagnosticAnalysis' src/main/java/com/vsos/backend -g '*.java'` không có match. Đây là bằng chứng không có direct reference trong backend hiện tại, kết hợp constructor/call graph bên dưới; không phải chứng minh về deployment bên ngoài repository.

## 2. Source evidence index

| ID | Nguồn hiện tại | Điểm cần đối chiếu |
|---|---|---|
| B01 | [AnalysisController](../../../src/main/java/com/vsos/backend/controller/analysis/AnalysisController.java) L72–185 | 11 route thực; dependency chỉ `AnalysisService`, `AnalysisViewService`, `VehicSimAccess` |
| B02 | [AnalysisService](../../../src/main/java/com/vsos/backend/service/analysis/AnalysisService.java) | `sample`, `outcome`, `item`, `dashboard` L48–122; `inspection` L129; `freeze` L150; `handoff` L261 |
| B03 | [AnalysisViewService](../../../src/main/java/com/vsos/backend/service/analysis/AnalysisViewService.java) | `failureList`, `analysisDataset`, `freezeAnalysisDataset`, `savedAnalysisDataset`, `failureDetail`, `playback` |
| B04 | [AnalysisMetrics](../../../src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java) | `VERSION`, `valid`, `objective`, `aggregate`, `evidenceComplete`, `objectivesAvailable` |
| B05 | [RunService](../../../src/main/java/com/vsos/backend/service/simulation/RunService.java) L1324+ | `persist`: ghi outcome/evaluation legacy, không gọi core evidence V3.1 |
| B06 | [JsonInputAdapter](../../../src/main/java/com/vsos/core/failureanalysis/JsonInputAdapter.java), [FailureAnalysisInput](../../../src/main/java/com/vsos/core/failureanalysis/FailureAnalysisInput.java) | bounded result/collection intake, manifest, adapter dispatch |
| B07 | [DiagnosticReport](../../../src/main/java/com/vsos/core/failureanalysis/DiagnosticReport.java), [EvidenceReport](../../../src/main/java/com/vsos/core/failureanalysis/EvidenceReport.java) | `analyze` và report envelope/digest; không Spring/DB |
| B08 | [MoboHandoffBuilder](../../../src/main/java/com/vsos/core/failureanalysis/MoboHandoffBuilder.java), [ConsumerCompatibilityValidator](../../../src/main/java/com/vsos/core/failureanalysis/ConsumerCompatibilityValidator.java) | `build`, offline compatibility, permission gates |
| B09 | [SimulationController](../../../src/main/java/com/vsos/backend/controller/simulation/SimulationController.java) L100+, [RunCollectionService](../../../src/main/java/com/vsos/backend/service/simulation/RunCollectionService.java) | export collection module2; không phải import/analysis API |
| B10 | [VehicSimAccess](../../../src/main/java/com/vsos/backend/security/VehicSimAccess.java), [ProjectAccess](../../../src/main/java/com/vsos/backend/security/ProjectAccess.java), [ApiExceptionHandler](../../../src/main/java/com/vsos/backend/exception/ApiExceptionHandler.java) | role/project/rate limit và lỗi thực |
| B11 | [schema](../../../database/mysql/01_schema.sql), [entities analysis](../../../src/main/java/com/vsos/backend/entity/analysis/AnalysisResult.java) | `analysis_results`, `failures`, `root_causes`; có bảng không chứng minh có job/report API |
| B12 | [OptimizationController](../../../src/main/java/com/vsos/backend/controller/optimization/OptimizationController.java), [OptimizationService](../../../src/main/java/com/vsos/backend/service/optimization/OptimizationService.java) | dependency đọc để xác định điểm bàn giao; request không có dataset_id |

## 3. Actual call graph

```text
Authenticated request + X-VehicSim-Project
  AnalysisController
    AnalysisService.dashboard/inspection -> Db SQL -> AnalysisMetrics
      inspection(COMPLETED) -> AnalysisViewService.failureDetail
    AnalysisService.freeze -> verify selected runs/revisions -> INSERT analysis_results
    AnalysisService.handoff -> savedAnalysisDataset -> verify live run/config digests
    AnalysisViewService -> Db + Queries + project -> legacy views / archive / playback

Module2 persistence (read-only dependency of this audit)
  RunService.persist -> simulation_runs / collision_events / failures / root_causes / artifacts

Independent offline path
  OfflineDiagnosticAnalysis -> FailureAnalysisInput -> JsonInputAdapter | RawArtifactAdapter
    -> Evidence.Run -> DiagnosticReport.analyze -> source-backed diagnostic JSON
  OfflineMoboHandoff -> MoboHandoffBuilder.build -> handoff JSON
  OfflineConsumerCompatibility -> ConsumerCompatibilityValidator -> compatibility JSON
  NO discovered REST edge connecting AnalysisController/AnalysisService to this path
```

Orchestration web: synchronous read/aggregate/freeze/check requests. `simulation_runs.status` là trạng thái chạy simulator, không phải trạng thái một V3.1 analysis job. `analysis_results.status` có ENUM PENDING/RUNNING/COMPLETED/FAILED nhưng freeze ghi trực tiếp COMPLETED; chưa có create/poll/cancel job chẩn đoán mới.

## 4. Capability matrix

API trong bảng bỏ prefix chung `/api/v1/vehicsim`. Test viết tắt được định nghĩa ở §7. Input/output là hình dạng thật, không phải DTO dự kiến.

| ID / Nghiệp vụ | Classes / methods | REST thực | Input → output | DB / validation chính | Status / FE | Test / source |
|---|---|---|---|---|---|---|
| C01 Tìm run baseline | B02 `dashboard`, `item` | GET `/analysis/runs` | filters/page → counts/items/objective_groups | project, BASELINE, GENERATED, ON; page1+, size1..100 | WORKING / READY | AS, AC; B01/02 |
| C02 Tổng hợp nhiều run | B04 `aggregate`; B02 `dashboard` | cùng C01 | toàn scope filter → 3 objective/nhóm + missing/NA/sample counts | nhóm AEB/xe/simulator/dt; không trộn profile; invalid giữ riêng | WORKING / READY | AS, AC; B02/04 |
| C03 Inspection trạng thái run | B02 `inspection` | GET `/analysis/runs/{id}` | DB ID → `{run,detail}`; detail null khi chưa COMPLETED | project + GENERATED + ON; bỏ điều kiện purpose BASELINE so với C01 | WORKING / READY | AS, AC; B02 |
| C04 Số đo/chuỗi nhận định legacy | B03 `failureDetail`, `header` | GET `/runs/{id}`; lồng trong C03 | DB ID → metrics, chain, stage_evidence, config, environment, scene | scoped completed run; chain rule-based, không causal proof | PARTIAL / READY cho legacy, BLOCKED cho V3 | AC, SN; B03 |
| C05 Tra cứu lỗi legacy | B03 `failureList`, `failureRows` | GET `/failures` | bộ lọc lỗi riêng → kpis/families/items/pages | chỉ rows đã lưu trong failures; BASELINE/ON; không đồng nhất scope C01 | WORKING / READY | AC, SF; B01/03 |
| C06 Export CSV lỗi | B01 `exportFailures` | GET `/failures.csv` | filters C05 → 12 cột CSV | tối đa100000 rows; không search/sort trang client; không 3 objective đầy đủ | PARTIAL / READY với nhãn đúng phạm vi | MVC security + source; B01 |
| C07 Telemetry/playback | B03 `failureDetail`, `playback` | GET `/runs/{id}/playback` | DB ID → frames/events/motion projection/related_runs | completed/project; không video sensor, không clock alignment recorder | PARTIAL / READY | AC, SN, SF; B03 |
| C08 Ca tương tự | B03 `similarFailures` | lồng trong detail | run context → tối đa3 ca xếp hạng khoảng cách tham số | cùng scenario/mode; không matched causal pair, score không probability | PARTIAL / READY ở điều tra | SF; B03 |
| C09 Chọn/chốt hai tập | B02 `freeze`, `checkSet`, `validTrace` | POST `/analysis/selections` | IDs + revisions → dataset v2 bất biến + id | role/write limit; baseline current, no variant leakage, unique variant/seed, safe mỗi tập, trace/metric đầy đủ | WORKING / READY | AS, AC; B01/02 |
| C10 Mở snapshot lưu | B03 `savedAnalysisDataset` | GET `/analysis/datasets/{id}` | dataset ID → stored v1 hoặc v2 + baseline_current/created_at | project/type/status; không rebuild bằng latest runs | WORKING / READY, cần discriminate schema | DS, SN; B03 |
| C11 Kiểm tra bàn giao dataset v2 | B02 `handoff` | GET `/analysis/datasets/{id}/handoff` | ID → snapshot v2 + handoff_ready | v2/current baseline, same rows/revisions, trace/config/semantic digests | PARTIAL / READY đọc; không optimizer dispatch | AS; B02/B12 |
| C12 Preview/freeze v1 | B03 `analysisDataset`, `freezeAnalysisDataset` | GET `/analysis/dataset`; POST `/analysis/datasets` | scenario/base_version?/token → dataset v1 | latest completed run/variant; preview token; không hai partition | PARTIAL / archive/compatibility, không đưa thành flow mới | DS, SN; B03 |
| C13 Export result collection | B09 `getVariantCollection`, `variantCollection` | GET `/variants/{variantId}/collection` | variant DB ID → `vehicsim.run-collection/v1` bytes | current project, completed CARLA, mọi purpose, ON/OFF/rep/seed riêng; missing accounted | WORKING / external dependency READY để tải, không phân tích | RunCollectionServiceTest; B09 |
| C14 Nhập result/collection JSON V3.1 | B06 `JsonInputAdapter`, `runs/manifest/complete` | **không có** | `vehicsim.result/v1` hoặc `vehicsim.run-collection/v1` → evidence/manifest/issues | bounded parse; schema/identity/hash/manifest validation; raw immutable | OFFLINE_ONLY / BLOCKED web | JA, JI; B06 |
| C15 Nhập ZIP/directory Golden | `RawArtifactAdapter`, `ArchiveIndex`, `ArtifactCsv` | **không có** | ZIP/folder → per-run artifacts | safety/size/schema/run key; không gộp repetition | OFFLINE_ONLY / BLOCKED web | Golden18IntegrationTest; B06 dispatch |
| C16 Evidence/canonical/provenance | `EvidenceValidator`, `CanonicalObjectiveReader`, `MetricProvenanceResolver`, `BaselineBindingResolver` | **không có** | Evidence.Run → values/status/reasons/source refs | no null→0, copy disagreement, missing baseline UNKNOWN | OFFLINE_ONLY / BLOCKED web | M1AEvidenceTest, JA/JI; B07 |
| C17 Physics/functional candidates | `GeometryEngine`, `StoppingModel`, `AebTimelineBuilder`, `PhysicalBrakingAnalyzer`, `ImpactAnalyzer`, `DiagnosisPolicy`, `EvidenceGates` | **không có** | validated evidence + scoped context → conditional physics/candidates | sensor ≠ geometry ≠ canonical; OFF no enacted functional blame; no P05 certificate => UNKNOWN | OFFLINE_ONLY / BLOCKED web | PhysicsFormulaTest, M1BGolden18IntegrationTest; B07 |
| C18 Diagnostic Report/objective explanation | B07 `DiagnosticReport.analyze`; `ObjectiveExplainer`, `HypothesisInvestigator` | **không có** | run/pairedOFF/context → versioned envelope/report/content_digest | claim-local sufficiency, hypotheses/missing/limits; not forced root | OFFLINE_ONLY / BLOCKED web | JA/JI, Batch03DossierRegressionTest; B07 |
| C19 MOBO Handoff V3.1 | B08 `MoboHandoffBuilder.build`, `CanonicalAggregation`, `ParameterHintBuilder`, `SearchRangeResolver` | **không có** | members + pinned selection/quality/binding/domain artifacts → `vehicsim.failure-analysis-mobo-handoff/v1` | authorized cohort/baseline gates; no fabricated score/range | OFFLINE_ONLY / BLOCKED web | MoboHandoffBuilderTest, M1CGolden18IntegrationTest, JI; B08 |
| C20 Consumer compatibility | B08 validator/source inspection/schema validator | **không có** | handoff + consumer source → compatibility/blockers | schema/digest valid không cho dispatch; validation sealed | OFFLINE_ONLY / BLOCKED web | ConsumerCompatibilityValidatorTest, M1DGolden18IntegrationTest, JI; B08 |
| C21 Job create/status/retry/cancel cho V3.1 | chưa có backend orchestrator | **không có** | chưa có wire contract | không dùng status simulator hay analysis_results ENUM làm bằng chứng | NOT_IMPLEMENTED / BLOCKED | negative route/call search; B01/02 |
| C22 List/store/download V3 reports | CLI ghi file; chưa REST storage/resource service | **không có** | chưa có HTTP envelope/download permissions | chưa có report ownership/lifecycle/currentness HTTP contract | NOT_IMPLEMENTED ở REST / BLOCKED | B01/07; offline files có JI |
| C23 Thực thi optimizer đúng frozen cohort | B12 request/service hiện không consume handoff/dataset | **không có FA adapter** | consumer hiện nhận scenario/config, không DiagnosticReport JSON | latest baseline selection, defaults bounds và cohort gaps; không sửa trong audit | NOT_IMPLEMENTED cho contract này / BLOCKED | B08/source consumer; dependency module4 |

Không có feature nào được gắn DEPRECATED chính thức trong source đã kiểm. C12 là compatibility legacy còn callable; không tự xóa backend.

## 5. Method tồn tại nhưng không ở đường sử dụng hiện tại

- `AnalysisViewService.motionTelemetry(List<Object>)` L553: wrapper static chỉ thấy tests gọi. Production detail/playback gọi thẳng `RecordedTelemetry.project`. Đây là helper test-covered không nằm trên đường REST hiện tại, không phải lý do bỏ projection đang chạy.
- `AnalysisDatasetPanel` frontend không có importer production. API client `freezeAnalysisDataset` không có call site frontend. Phân biệt với backend `freezeAnalysisDataset` vẫn được controller gọi và có tests.
- `analysisDataset` v1 vẫn có caller ở `frontend/src/app/projects/[projectId]/results/page.tsx` — ngoài module đang redesign; không xóa client/type/API chung.
- Các public core methods/CLI V3.1 có caller nội bộ/tests/offline nhưng không có backend caller. Gắn OFFLINE_ONLY, không gắn dead code.

Đối chiếu thiết kế cũ: `CalibrationScopeResolver`, `UncertaintyPropagator`, backend orchestrator trong blueprint gốc không phải tên class REST hiện có. Calibration gates hiện nằm trong `EvidenceGates`/`AnalysisContextValidator`; không tự tạo màn theo từng class đề xuất. Các mục M2 trong [M2_CHANGE_PLAN](../M2_CHANGE_PLAN.md) là kế hoạch, không implementation. Physics certificate/confirmed root còn UNKNOWN khi thiếu evidence là giới hạn hợp lệ, không feature UI phải lấp bằng suy đoán.

## 6. Những bất đồng ảnh hưởng UX

1. Dataset API v2 dùng key `schema`; M1C dùng `schema_version` và schema khác hoàn toàn. Không đổi tên file thành handoff.json để coi là cùng contract.
2. `AnalysisService.freeze` hardcode `evaluation.impact=EGO_SPEED_NOT_RELATIVE` trong khi ADR-055/current profiles dùng relative impact. Ba scalar không được FE sửa; provenance label mâu thuẫn phải hiển thị/đưa owner xác nhận.
3. Legacy `AnalysisViewService.outcomeOf` ưu tiên false-positive trước collision; `AnalysisService.outcome` ưu tiên collision trước false-positive. Raw detail còn dùng outcome đã lưu. Khi flags đồng thời, list/detail có thể khác; không thống nhất bằng client classifier.
4. Detail TS và service dùng Map chưa khớp nullability/metadata (§3 của file02). UI explanation RMS hiện hardcode onset/unfiltered method cho nhiều CARLA profile, không phải report explanation từ core; phải sửa copy theo provenance có bằng chứng trong một task sau.
5. C01 không trả OFF/repetition/attempt; đây không phải collection intake và không được quảng cáo bao phủ Golden72 hay toàn bộ run của variant.
6. Dashboard SELECT left-join failures/root_causes không DISTINCT. Nếu một run có nhiều failure rows (schema cho phép nhiều failure_type), rows/total/counts có thể lặp run. Chưa truy vấn DB nên tần suất thực UNKNOWN; không client-dedup để che mâu thuẫn server aggregate.

## 7. Kiểm chứng trong lượt audit

| Ký hiệu | Test source / phạm vi | Kết quả chạy mới |
|---|---|---|
| AS | [AnalysisServiceTest](../../../src/test/java/com/vsos/backend/service/analysis/AnalysisServiceTest.java) | 14 pass |
| DS | [AnalysisDatasetTest](../../../src/test/java/com/vsos/backend/service/analysis/AnalysisDatasetTest.java) | 4 pass |
| SN | [AnalysisSnapshotTest](../../../src/test/java/com/vsos/backend/service/analysis/AnalysisSnapshotTest.java) | 6 pass |
| SF | [SimilarFailuresTest](../../../src/test/java/com/vsos/backend/service/analysis/SimilarFailuresTest.java) | 5 pass |
| AC | [AnalysisApiContractTest](../../../src/test/java/com/vsos/backend/service/analysis/AnalysisApiContractTest.java) | 2 pass; producer/service mocks + frozen fixture, không live DB |
| SEC | [VehicSimSecurityTest](../../../src/test/java/com/vsos/backend/security/VehicSimSecurityTest.java) | 14 pass; MVC security/services mocked |
| JA | [JsonInputAdapterTest](../../../src/test/java/com/vsos/core/failureanalysis/JsonInputAdapterTest.java) | 39 pass; includes negative/synthetic intake |
| JI | [JsonInputIntegrationTest](../../../src/test/java/com/vsos/core/failureanalysis/JsonInputIntegrationTest.java) | xem kết quả/lệnh mới trong [08](08_IMPLEMENTATION_PLAN.md); real bundled inputs |

AS+DS+SN+SF+AC+SEC+JA: **84 tests, 0 failure/error/skip, BUILD SUCCESS**. Tên `JsonInputEndToEndTest` đã có trong pattern lệnh đầu nhưng không có class tương ứng và không được tính test coverage; JI được chạy riêng đúng class. Test suites core khác trong matrix là coverage source hiện có, không được gộp thành số test vừa chạy.

Đã đọc AGENTS/CLAUDE và hướng dẫn FA/frontend, README/handover current status, hợp đồng chỉ số + ADR-055, DB schema/từ điển liên quan; đối chiếu các contract/blueprint gốc với implementation. README/CLAUDE có mô tả MOBO chưa triển khai nhưng source hiện có optimizer classes; audit này chỉ xác nhận chúng **chưa consume dataset/core handoff**, không kết luận toàn bộ MOBO chưa tồn tại. Không chạy optimizer, DB, CARLA hay browser trong lượt audit này.
