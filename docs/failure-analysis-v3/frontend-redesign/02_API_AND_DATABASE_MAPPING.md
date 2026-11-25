# 02 — API và database mapping

Audit ngày25/11/2026, cùng HEAD/phạm vi và source index ở [01](01_BACKEND_CAPABILITY_AUDIT.md). Mọi route dưới đây có prefix `/api/v1/vehicsim`. Controller trả `Map<String,Object>`; không có Java response DTO bảo đảm schema ở compile time. Request records có thật, không suy DTO từ màn hình.

## 1. Route registry thực tế

| Method / path | Java handler → service | Request thực | Response / tác dụng | FE client / trạng thái |
|---|---|---|---|---|
| GET `/analysis/runs` | `analysisRuns` → `AnalysisService.dashboard` | scenario_id,variant_id,aeb_version_id,vehicle_id,simulator,weather,time_of_day,status,failure_class; page=1,page_size=30 | `{total,counts,page,page_size,items,objective_groups,evaluation_version}` | `analysisRuns`: active |
| GET `/analysis/runs/{runId}` | `analysisInspection` → `inspection` | numeric runId | `{run: AnalysisRun, detail: legacy FailureDetail|null}` | `analysisInspection`: active detail page |
| GET `/failures` | `listFailures` → `views.failureList` | scenario_id,failure_class,outcome,weather,aeb_version_id,days,page=1,page_size=20 | `{kpis,families,total,page,page_size,pages,items}` | `failures`: active legacy query view |
| GET `/runs/{runId}` | `getRun` → `views.failureDetail` | numeric ID | legacy detail trực tiếp; completed required | `run`: client method; inspection hiện dùng wrapper mới |
| GET `/runs/{runId}/playback` | `getPlayback` → `views.playback` | numeric ID | header + duration_s,frames,events,motion_telemetry,related_runs,geometry | `playback`: active |
| GET `/failures.csv` | `exportFailures` → `views.failureList(...1,100000)` | filters giống lỗi, không page/search | file CSV,12 cột; cùng server filters, khác client local search | `exportFailures`: active |
| GET `/analysis/dataset` | `analysisDataset` → `views.analysisDataset` | scenario_id required; base_version_id optional | dataset **v1 preview**, preview_token; latest completed/variant | `analysisDataset`: còn dùng bởi project results ngoài scope |
| POST `/analysis/datasets` | `freezeDataset` → `views.freezeAnalysisDataset` | `{scenario_id,preview_token}` | INSERT snapshot **v1**, id,baseline_current | `freezeAnalysisDataset`: không thấy caller frontend |
| POST `/analysis/selections` | `saveAnalysisSelection` → `analysis.freeze` | selection body bên dưới | INSERT snapshot **v2**, id,baseline_current,handoff_ready | `createAnalysisSelection`: active |
| GET `/analysis/datasets/{datasetId}` | `savedDataset` → `views.savedAnalysisDataset` | datasetId | archive v1 **hoặc** v2 + id/current baseline/created_at | `savedAnalysisDataset`: active nhưng typed v1 |
| GET `/analysis/datasets/{datasetId}/handoff` | `analysisHandoff` → `analysis.handoff` | datasetId | v2 đã revalidate + handoff_ready; không M1C schema | `analysisHandoff`: active |

Registry có **11 route** (hai POST + chín GET). Không có list `/analysis/datasets`, upload JSON, analysis-job API, DiagnosticReport resource, V3.1 MOBO handoff download hoặc optimizer dispatch endpoint ở AnalysisController. Route kiểm handoff là GET read/check, không gọi optimizer.

Client source: [vehicsim.ts](../../../frontend/src/services/vehicsim.ts) L73–78,149–162. Transport: [api.ts](../../../frontend/src/services/api.ts). Types: [vehicsim.ts](../../../frontend/src/types/vehicsim.ts) L333–573,896–931. Source controller/service links và lines ở [01 §2](01_BACKEND_CAPABILITY_AUDIT.md).

### Selection request/validation chính xác

```text
AnalysisSelectionBody
 scenario_id: positive long
 baseline_id: positive long
 optimization_run_ids: non-null List<Long>, 1..500
 validation_run_ids: non-null List<Long>, 1..500
 run_revisions: non-null Map<String,String>, <=1000 entries (keys run ID string)
```

Service kiểm IDs positive/non-null/unique; hai danh sách không giao nhau; baseline hiện hành; cùng project/scenario/baseline; mọi revision khớp `item(row).revision`; unique `(scenario_version_id,seed)` trong toàn selection; cùng AEB/vehicle/simulator/dt; không chia cùng variant sang hai partition dù seed khác; mỗi tập ít nhất một outcome SAFE theo luật hiện có. Run phải hợp lệ/có trace; validation không thiếu evidence/metric cần thiết; optimization có cả3 objective VALID. `validTrace` còn kiểm bảy field `t,ego_x,ego_v,ego_a,ped_x,ped_y,ped_vy` hữu hạn, t không âm/tăng nghiêm ngặt, ego_v không âm. Không nới gate cho UX.

Lưu response metadata `handoff_ready=true` từ freeze là trạng thái của **dataset v2** ở thời điểm đó; trước export/bàn giao vẫn gọi GET handoff để kiểm lại. Không ánh xạ sang `eligibility_manifest.consumer_dispatch_allowed` của M1C.

### Response fields quan trọng

- `AnalysisRun`: `revision,run_id,scenario_id,scenario_version_id,version_no,family,variant,seed,baseline_id,vehicle_id,simulator,dt,status,outcome,failure_class,weather,time_of_day,error,end_reason,trace_available,metrics{rms_jerk_mps3,impact_speed_mps,stopping_distance_m},created_at`.
- `objective_groups`: nhóm theo AEB/vehicle/simulator/dt, trả identity string, simulator,baseline_id,vehicle_id,objectives,carla_observational_only. **Không có field dt riêng của group**; không parse identity string làm public DTO mới.
- Mỗi aggregate objective: `{value:number|null,samples,missing,notApplicable,unit,status}`; status VALID/INCOMPLETE/NOT_APPLICABLE. `version=adr040-stored-aggregation/1`, `invalid_runs` ở object aggregate.
- Detail legacy: header + metrics,chain,chain_confidence,stage_evidence,evidence_policy,evaluation_version,configuration,environment,ttc_threshold_s,motion_telemetry,telemetry,events,scene,similar. **Không có EvidenceValue/status/reason_codes/source_refs đầy đủ của DiagnosticReport V3.1**.
- Snapshot v2: `schema,evaluation,scenario,baseline,reference,runs,optimization_run_ids,validation_run_ids,optimization_objectives,validation_objectives,manifests`; archive response thêmid/current/created_at. Manifest chứa scenario_config/case/params/vehicle/metric_source/evaluation_version/artifact_digest/config_digest. Không có search ranges/approved calibration/core diagnostic output.

### Hai API legacy không đồng nhất scope

`analysis/runs` đếm theo run BASELINE/GENERATED/ON; `failures` đếm hàng failure BASELINE/ON và có bộ lọc riêng. Một run có thể có nhiều loại failure theo schema; không dùng tổng lỗi làm tổng run. Không gộp hai KPI thành một mẫu số. `inspection` cho GENERATED/ON nhưng không khóa purpose BASELINE; direct `/runs/{id}` chỉ yêu cầu completed + project, vì vậy link từ regression có thể hoạt động ngoài baseline explorer. Giữ đường truy xuất này.

Lưu ý giới hạn của nhãn “đếm run”: dashboard hiện lấy `rows.size()` sau SQL left-join failures/root_causes, chưa deduplicate run_id. Với dữ liệu có nhiều failure_type trên cùng run, projection/aggregate có thể bị nhân bản. Đây là nguy cơ suy từ source/schema, chưa xác nhận occurrence trên DB; cần backend contract test riêng, không FE tự sửa mẫu số.

## 2. Database lineage/read-write mapping

Services thực dùng [Db](../../../src/main/java/com/vsos/backend/repository/common/Db.java)/[Queries](../../../src/main/java/com/vsos/backend/repository/common/Queries.java) và SQL. Không tìm thấy dedicated `AnalysisRepository` ở call graph này. JPA entity tồn tại không có nghĩa service đang dùng repository JPA cho luồng đó.

| Table / entity | Data lineage | Reader trong FA | Writer thực / invariant |
|---|---|---|---|
| `simulation_runs` | status,IDs,seed,mode,dt,simulator,flags,3 stored metrics,telemetry_json,run_config_json | `dashboard`, `inspection`, `selected`, `failureDetail`, `playback`, v1 preview | RunService persistence (module2); audit không ghi hoặc re-score |
| `scenarios`, `scenario_versions` | family/code/category/config/source/version_no | SELECT joins; GENERATED filter; scenario/variant ownership | module1 dependency, read-only |
| `aeb_versions`, `aeb_parameter_values`, `aeb_parameters` | current baseline + parameter catalog/values | Queries.baselineVersion/aebValues, detail config, snapshot baseline binding by DB ID | AEB module dependency; không chỉnh 4 tham số |
| `carla_vehicle_models` | vehicle dimensions/config | runBundle/scene, reference IDs | module2/catalog dependency; không khẳng định applied physics từ catalog |
| `failures` / [Failure](../../../src/main/java/com/vsos/backend/entity/analysis/Failure.java) | legacy evaluation failure type/category/severity/description | list/failureRows/runBundle/dashboard join | `RunService.persist` từ evaluation; không V3 candidates |
| `root_causes` / [RootCause](../../../src/main/java/com/vsos/backend/entity/analysis/RootCause.java) | cause_code,parameter_id,confidence,is_primary | primary legacy metadata, list/headline | `RunService.persist`: failed chain stages; “primary” là first failed stage, không causal confirmation |
| `analysis_results` / [AnalysisResult](../../../src/main/java/com/vsos/backend/entity/analysis/AnalysisResult.java) | stored `config_json`/`summary_json`,BASELINE_DATASET/IMMUTABLE_SNAPSHOT | `savedAnalysisDataset`, `handoff` | v1/v2 freeze INSERT COMPLETED; no update historical evaluation |
| `collision_events` | canonical simulator persistence, impact fallback legacy | không phải source recorder-contact của V3 API (chưa có) | RunService.persist; không dùng rows để thay `collisions.json` evidence |
| `simulation_artifacts` | metadata file path/size/type | collection export qua module2 artifact loading | module2 persistence; FA REST chưa có V3 report artifact lifecycle |
| `projects` + membership/workspace | project scope/current baseline context | ProjectAccess / Queries | security/context dependency; không sửa |

[01_schema.sql](../../../database/mysql/01_schema.sql) L582+,674+,692+,712+,733+,753+ là nguồn cấu trúc; [database-schema.md](../../vehicsim/database-schema.md) là từ điển. `repetition`/`attempt` đã có ở run/collection producer nhưng không được đưa vào AnalysisRun projection. Scalar DB dùng DECIMAL(8,3); không hứa byte-for-byte raw producer precision từ API SQL. Raw JSON adapter giữ recorded value ở container; đó là boundary khác.

### Snapshot v1/v2 và tính hiện hành

V1 tự chọn latest completed một run/variant trong reference vehicle/simulator, không giải quyết nhiều seed/rep và hai partition. `freezeAnalysisDataset` tính preview lại không truyền base_version_id; cần owner xác nhận nếu muốn hỗ trợ freeze preview của base version cũ. Archive GET trả stored summary; **không tự refresh** snapshot bằng latest runs. Handoff v2 reload IDs, revision, validTrace và digest chuẩn hóa semantic JSON, từ chối nguồn thay đổi/baseline cũ. Digest này khác SHA256 file bytes/digest report core.

## 3. DTO drift và semantic drift đã xác nhận

| Vị trí | Khác biệt source thật | Ảnh hưởng / hướng xử lý task sau |
|---|---|---|
| `savedAnalysisDataset` client | typed AnalysisDataset(v1); backend trả v1 hoặc v2; dashboard cast unknown sang AnalysisSelection | discriminated response handling với validation schema, không bỏ support archive v1 |
| `AnalysisSelection` TS | yêu cầu `handoff_ready:boolean`; archive GET không bảo đảm key này, vì flag response-time không lưu snapshot | phân biệt archived snapshot với freshness check; không tự mặc định true |
| `AnalysisSelection.evaluation` TS | chỉ version/carla flag; service còn impact/filter/source/identity/stopping metadata, `manifests` cũng không typed | typed boundary giữ metadata để report mâu thuẫn, không cast coi core handoff |
| `FailureDetail.metrics.false_activation/missed_activation` | TS boolean; backend `run.bool(...)` có thể null | nullable display, missing ≠ false |
| `RunHeader.verdict`/environment/config | TS hẹp PASS/FAIL và nhiều numeric required; source có DB/JSON null hoặc thiếu | runtime boundary check và missing labels; không suy enum từ type assertion |
| `evidence_policy`, `Playback.source` và scene target metadata | backend trả nhưng interface chưa biểu diễn đầy đủ (`target_kind/length/width` trong detail scene) | giữ display source/category, tránh map pedestrian mặc định cho CCR; không thay shared ScenarioMap ở audit này |
| RMS explanation | frontend METHODS.rms cố định onset/unfiltered; ADR-055/current CARLA profile có T_AEB/EuroNCAP | chỉ hiển thị phương pháp theo bằng chứng version; thiếu thì chưa xác nhận, không recompute canonical |
| Dataset provenance | backend v2 impact label EGO_SPEED_NOT_RELATIVE luôn; current profile relative | backend owner B06 trong file09; FE không “sửa hộ” stored metadata |
| Outcome precedence | dashboard collision-first vs legacy failure-list FP-first, detail raw outcome | show source-specific legacy labels; không unify thành V3 physical outcome |

## 4. Quyền, transport và lỗi

- [SecurityConfig](../../../src/main/java/com/vsos/backend/config/SecurityConfig.java): authenticated cho API này. Reads không có requireEngineer riêng. Freeze POST gọi requireEngineer cho ADMIN/ENGINEER/EXPERIENCER + `limitWrites(uid,"analysis_dataset")`. MANAGER/REVIEWER đọc; không ghi snapshot.
- ProjectAccess resolve project của request qua `X-VehicSim-Project`; ENGINEER/REVIEWER theo membership workspace, EXPERIENCER theo project cá nhân, ADMIN/MANAGER theo cơ chế chung hiện có. Record không thuộc project thường404. Không triển khai selector/security mới ở module FA.
- `api.ts` thêm Bearer và project header, dedupe in-flight GET theo token/project/path; 401 JSON phát sự kiện hết phiên; không cache completed responses. Blob path có error handling đơn giản hơn JSON, không hứa thông báo chi tiết tương đương.
- Lỗi chủ yếu `{detail:string}`; ProjectException thêm `code`. 400 invalid input/business/stale/revision; 401 auth;403 role;404 missing/not completed;409 integrity constraint;429 write limit;503 Redis down;500 generic. Không có structured reason-code DTO toàn diện cho freeze errors. Không parse câu tiếng Anh để tự quyết eligibility.
- UI phải giữ lựa chọn khi lỗi và báo lỗi tại action, nhưng không dùng cached snapshot như currentness approval. No-project/context error giữ hành động ghi disabled, dùng shared context hiện có.

## 5. Dependency module khác, chỉ đọc

Collection: GET `/variants/{id}/collection` từ SimulationController/RunCollectionService là **export** của module2; không thay thế upload/analyze route. XOSC download và POST `/runs/{id}/carla` có thật ở module2; nút chạy CARLA đang mở flow mô phỏng chứ không re-run Failure Analysis. Blueprint chỉ đặt các link này dưới “Tác vụ khác”, không sửa endpoint hoặc trang CARLA.

Consumer: OptimizationRequest chưa nhận dataset_id/frozen partitions; service còn tự baseline selection. Navigation `/aeb?dataset_id=...` không chứng minh receiver tiêu thụ cohort. Backend M2 adapter là dependency module4 riêng; chưa được giao triển khai trong lượt này.
