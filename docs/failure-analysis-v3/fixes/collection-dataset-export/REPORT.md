# Dataset từ ba collection thật — xuất file và thử input MOBO

24/11/2026. Output chính:
[mobo_dataset_scenario26.json](D:/Downloads/mobo_dataset_scenario26.json),
2408884 bytes, SHA256
`554361ec8f1943c405f74b20d1f39e4cdcf34a426c529d5d44e73e1be229b52b`.
Content digest `fa-handoff-sorted-json/1`:
`f7596de3fb4110ca37e662872357e377a0f1a6413261f8aa38ed30edd6e0ac9c`.

**Đã xuất đủ toàn bộ sáu run trong ba collection người dùng cung cấp.** File có
identity thật, cấu hình, source collections nguyên nội dung, sáu Diagnostic Reports,
canonical values/nulls, ON/OFF controls, một đề xuất partition và các bounds lấy từ
source engine. **Chưa phải frozen operational dataset cho consumer hiện tại.**
Không có cách sửa vài field trong JSON để current consumer tự thực thi exact cohort.

## File có gì, đọc ở đâu

| JSON path | Nội dung |
|---|---|
| `/project_id`, `/scenario_id`, `/base_aeb_version_id` |4 /26 /33, observed declared export identity |
| `/variant_ids` |1032,1033,1034 |
| `/optimization_run_ids` |2499,2500 — proposed, chưa freeze |
| `/validation_run_ids` |2498 — proposed, chưa freeze |
| `/diagnostic_control_run_ids` |2510,2511,2512 — OFF, không training/regression scoring |
| `/members` |Đủ6 members; ID dạng decimal string theo M1C; seed/rep/attempt/mode/actual params và eligibility |
| `/collection_dataset/source_collections` |Cả3 tài liệu gốc nguyên semantic content, đủ6 result documents/raw streams và excluded-count declarations |
| `/collection_dataset/run_manifest` |Per-run canonical values/nulls, legacy labels, actual AnalysisService outcome và physical outcome tách biệt |
| `/collection_dataset/diagnostic_reports/{runId}` |Actual current Failure Analysis report, source refs/digests/candidates/unknown reasons |
| `/collection_dataset/proposed_selection` |Canonical aggregation hai tập và exhaustive6 nonempty variant-disjoint splits |
| `/search_space` |Actual loaded ParameterBounds defaults, **không** là diagnostic hint hoặc approved narrowed search range |
| `/search_ranges` |Sourced catalog/engine domains; suggested_range vẫn UNKNOWN khi thiếu approved scope |
| `/baseline`, `/baseline_objectives` |Authorized baseline/currentness và operational baseline scores vẫn UNKNOWN; không tự tạo score |
| `/handoff_ready`, `/partition_status` |false /PROPOSED_NOT_FROZEN |

Schema chính giữ `vehicsim.failure-analysis-mobo-handoff/v1`; collection payload là
explicit extension `vehicsim.collection-dataset-export/1`. Root convenience fields
không bổ sung magically các field vào OptimizationRequest. Unknown fields có thể
bị consumer bỏ qua; không dùng việc deserialize thành công để chứng minh cohort
được thực thi. File chứa tất cả **supplied** documents, không tuyên bố toàn bộ run/
variant của scenario26 trong DB. Mỗi source collection khai **3 run CARLA chưa
hoàn tất trên mỗi variant**; giữ nguyên declarations đó, không tạo run
giả cho phần không được export và không giả đã đọc chúng từ DB.

## Ba kết luận chặn chạy đã kiểm bằng source/class thực

### 1. MOBO DTO không đọc dataset/partition

Đã compile và chạy [ConsumerDtoProbe.java](ConsumerDtoProbe.java) với actual
`OptimizationController.OptimizationRequest` và dependencies từ Maven test classpath
đã có. Không khởi động server hoặc gọi createOptimization/createAndStartRun.

- Spring `Jackson2ObjectMapperBuilder` default đọc được scenario26, baseline33 và
  sourced search_space; Bean Validation0 violations.
- Roundtrip DTO **bỏ** optimization_run_ids,validation_run_ids,variant_ids,
  collection_dataset,members,content_digest,handoff_ready.
- Record chỉ có scenario_id,base_aeb_version_id,max_trials,n_initial_points,name,
  search_space,objective_config,simulator_type. Không dataset_id/frozen cohort.
- Plain strict ObjectMapper reject unknown `schema_version`. Probe thể hiện cả
  strict và Spring-builder-default behavior; không khẳng định config của server
  remote/nhánh đồng đội chưa được cung cấp.
- `MoboEngine.propose` nhận typed `List<MoboTrial>`; input là completed candidate
  trials có bốn params và ba scalars, không nhận baseline raw run/diagnostic JSON.
  Không tạo baseline trial0 hoặc gọi propose để giả đã tích hợp.

Kết quả thật: [actual-consumer-dto.json](actual-consumer-dto.json).
Current executeOptimization còn latest-run selection; không thay consumer trong
task xuất file. Posting file này vào current endpoint không đảm bảo chạy đúng cohort.

### 2. Không có split vượt current freeze gates

Đã dùng actual `AnalysisService.sample`, package-private `AnalysisService.outcome`
và `AnalysisMetrics` trên Rows projected từ source exports. COMPLETED là status
declared bởi collection filter, không phải fresh DB query. Six splits được enumerate
đúng ba ON variants, mỗi variant/seed một run; OFF giữ diagnostic-only.

| ON run | Legacy evaluation.outcome | false_activation | Actual AnalysisService.outcome |
|---|---|---|---|
|2498 /variant1032|SAFE|false|SAFE |
|2499 /variant1033|COLLISION|false|COLLISION |
|2500 /variant1034|SAFE|true|FALSE_BRAKING |

`AnalysisService.checkSet` đòi ít nhất1 SAFE **trong từng tập**. Vì chỉ có1 eligible
SAFE dưới classifier hiện tại, cả6 nonempty splits đều fail các available freeze
predicates; không duplicate2498 hoặc dùng OFF để bù. Đề xuất opt2499+2500 có đủ
3numeric aggregate, val2498 giữ1SAFE, nhưng opt không cóSAFE nên vẫn BLOCKED.

Đây là business-gate/legacy-label conflict, không phải xác nhận V3 false braking
hoặc physical SAFE. Core giữ physical outcome UNKNOWN cho nguồn no-contact chưa
có approved absence policy, COLLISION cho matching recorded contacts. Không sửa
raw flags, đổi legacy verdict hoặc ép Core UNKNOWN→SAFE để đạt gate.

Muốn freeze theo contract hiện tại cần additional genuine ON run/variant có SAFE
theo gate ở tập còn lại, và đủ objective/context/revisions. Hoặc team phải chốt
versioned change của freeze classifier/policy trong task riêng; không silently
loosen rule hoặc sửa archived result trong export này.

### 3. Current consumer làm đổi precision của aggregate

Actual private `OptimizationService.computeStats` và `evaluateCandidateRuns` đã
được gọi offline bằng reflection với hai Rows thật opt2499/2500. Service constructed
với null dependencies; hai pure helpers không truy cập chúng. Không gọi campaign,
DB, candidate creation, GP, engine hoặc simulator. Reference rates dùng **cùng Rows**
chỉ cho helper parity check, không là confirmed operational baseline.

| Objective | Canonical AnalysisMetrics | Current consumer helper |
|---|---:|---:|
|rms_jerk_mps3|19.6505|19.651 |
|impact_speed_mps|3.0335|3.034 |
|stopping_distance_m|17.072499999999998|17.072 |

Canonical có2 jerk/stop samples; impact denominator2, noncontact2500 đóng góp0
**chỉ trong aggregate**. Raw impact của2500 vẫn null. Không làm tròn/ghi đè canonical
để match consumer. Stopping rounding boundary thể hiện actual double/helper result.
Validation2498 jerk/stop NOT_APPLICABLE, giữ null; impact aggregate0 theo contract.
Những aggregate này nằm trong **proposed descriptive selection**, không được ghi
thành baseline_objectives đã verify. Baseline scores vẫn UNKNOWN.

## Verification và provenance

- [input-validation.json](input-validation.json): **219/219 checks PASS**. Gồm6
  document digests,24 embedded payload digests, identities/manifests, objective
  copies/OK/NA, actual missing git provenance, masks và recorder clocks/counts.
- [export-verification.json](export-verification.json): **89/89 checks PASS**:
  đủ6 documents/reports/members, canonical/null preservation, exhaustive splits,
  DTO data loss, helper divergence, external-action flags và preservation.
- [m1d-compatibility.json](m1d-compatibility.json): schema **VERIFIED**, integrity
  **VERIFIED**, no FAIL findings; overall **NOT_DIRECTLY_CONSUMABLE**, dispatch=false.
  Byte hash pin ở probe chứng minh exact exported bytes được kiểm, không xác minh
  user/DB authority. Source replay/baseline authority/current runtime còn UNKNOWN.
- 1256 pre-existing source/contracts/history paths khớp accepted hashes. Inputs không
  đổi. Không sửa production Java/tests, API/database/frontend/MOBO/AEB/calibration;
  không stage/commit/push hoặc chạy CARLA/campaign.

Initial generated output bị3 schema violations vì requested IDs dùng numbers ở
path M1C đòi decimal strings. Đã sửa exporter, regenerate và verify final file.
[Initial report](m1d-compatibility-initial.json) và initial rejected output giữ riêng;
không gọi lỗi serialization mới đó là pre-existing consumer failure.

No full Maven rerun vì task này không sửa production/test source. Các helper đã
compile thật và chạy bằng actual target classes/dependencies. Đọc AGENTS/CLAUDE,
metric contract/ADR-040/055, collection ADR-065, AnalysisService/Metrics,
OptimizationController/Service, ParameterBounds/MoboTrial/Engine và M2 plan. Các
câu docs cũ nói MOBO chưa triển khai không thắng actual source có optimizer nhưng
chưa consume frozen dataset. Không triển khai M2 trong task này.

## Reproduce (fresh output paths)

```powershell
python docs/failure-analysis-v3/fixes/collection-dataset-export/validate_inputs.py
javac '@docs/failure-analysis-v3/fixes/collection-dataset-export/compile.args'
java '@docs/failure-analysis-v3/fixes/collection-dataset-export/run.args'
$handoffHash = (Get-FileHash -LiteralPath 'D:\Downloads\mobo_dataset_scenario26.json' -Algorithm SHA256).Hash.ToLowerInvariant()
java -Xmx512m -cp target/classes com.vsos.core.failureanalysis.OfflineConsumerCompatibility D:/Downloads/mobo_dataset_scenario26.json $handoffHash . docs/failure-analysis-v3/fixes/collection-dataset-export/m1d-compatibility.json
javac '@docs/failure-analysis-v3/fixes/collection-dataset-export/dto-compile.args'
java '@docs/failure-analysis-v3/fixes/collection-dataset-export/dto-run.args'
python docs/failure-analysis-v3/fixes/collection-dataset-export/verify_export.py
```

Argfiles pin existing local test classpath from target Surefire XML. Export and
compatibility tools use CREATE_NEW; replay cần fresh paths và cập nhật paths trong
argfiles/verifier. Không overwrite accepted output để chạy lại. Source helper là
offline export utility trong docs, chưa phải backend/production input adapter.
