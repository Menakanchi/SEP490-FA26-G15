# 01 — Executive verdict

**Verdict: NOT_READY** cho backend integration theo đầy đủ contract Failure Analysis
V3.1. Có core vật lý và offline pipeline hoạt động thật; không phải chỉ serializer.
Golden18 conservative oracle được giữ đúng. Tuy nhiên audit độc lập reproduce được
các lỗi validity/clock/contact/schema/claim-reference mà suite đang xanh không bắt.
Đây là lý do thuộc Failure Analysis để chưa ký hoàn thiện, độc lập với việc module
MOBO của đồng đội chưa consume contract.

Audit read-only ngày2026-11-24: không sửa production/test cũ, tám specs, audit cũ,
calibration, database, API hoặc historical results; không CARLA/campaign/commit/stage.
Mọi code mới chỉ là verification trong thư mục audit. Không bắt đầu fixes hoặc M2.

## Trả lời tám câu hỏi bắt buộc

1. **Core có tính và dùng vật lý thật: CÓ, với scope.** DiagnosticReport gọi
   continuous fixed-heading OBB–disc geometry/full-body occupancy/PET, cap
   min(config,vehicle,adapter,μg), delay+ramp stopping/inverse/margin, timeline,
   GT-derived response, pre-contact impact và paired comparison. 32 checks độc lập
   xác nhận toán trên declared models. G02/projection primitives, positive
   calibration/requirement branches và tracking RMSE không được coi đã wired chỉ
   vì có helper. Certified P05 vẫn DEFERRED đúng yêu cầu.
2. **Ba nhóm failure: PARTIAL.** Golden18 có đúng6 NO_BRAKING,6 FALSE_BRAKING,
   14 INEFFECTIVE_BRAKING, đều SUSPECTED;18 OFF không functional candidates;
   không root confirmed. Nhưng mode CONFLICTING vẫn bị dùng như ON và time âm
   vẫn thành command evidence (FA-001); positive requirement path chưa vào report
   (FA-007). Không thể ký đầy đủ cho dữ liệu ngoài Golden18.
3. **Ba objectives: chưa đầy đủ.** Giữ nguyên72×3 canonical scalars/nulls, filter/
   window CARLA và42 stopping decompositions replay đúng. Contact impact tách
   canonical. Nhưng breakdown vượt invalid clock (FA-002), pre-contact support
   thiếu validation (FA-003), kinematic lineage/narrative chưa đúng (FA-008).
   Cross-objective explanations chủ yếu descriptive; không có validated matched
   baseline comparison để chứng minh các tradeoff thực tế trên3scalar cùng lúc.
4. **Diagnostic Report: hữu ích nhưng chưa đủ để sign-off từng run bất kỳ.**
   Có các trục/evidence/formulas/unknowns thật; UNKNOWN không tự thành SAFE/0.
   Hypotheses còn generic, thiếu mechanism/falsification plan (FA-009); positive
   context chưa wired và có lỗi source gates. Không được gọi đây là root-cause
   analyzer đã xác nhận nguyên nhân.
5. **MOBO output: schema/core mapping đã implement, operational population chưa.**
   Golden18 có đủ72manifest members/seed/actual parameters/report hashes và
   honest UNKNOWN cho DB IDs, baseline v1, scores, ranges. Đây là PASS về honesty,
   BLOCKED về operational data. Synthetic có valid baseline và SUSPECTED/ABSTAIN
   paths; positive hint có sai loại hypothesis_refs (FA-006). M1D còn nhận malformed
   EV là schema VERIFIED (FA-005). NOT_DIRECTLY_CONSUMABLE tự nó là external
   integration dependency, không bị tính là defect FA.
6. **Ownership:** FA-001…006/008/010 là producer/validation defects; FA-007/009 là
   missing wiring/explanation trong FA. DATA_PROVIDER cung cấp baseline/frozen
   identity; CALIBRATION cung cấp bound validation package; MOBO_CONSUMER và
   BACKEND_INTEGRATION xử lý consumer/metadata/full-build dependencies riêng.
7. **Chưa thể coi offline FA hoàn thiện.** Có thể dùng bản hiện tại để review
   Golden18 trong conservative scope cùng giới hạn đã công bố. Không mở rộng
   sự tin cậy đó sang mọi CARLA export hoặc operational post-fit dataset.
8. **Trước tích hợp backend:** sửa/gate FA-001…006, harden bounded ingestion,
   xử lý profile/context wiring theo scope; thêm pipeline regressions cho các
   counterexamples; thống nhất operational inputs/quality từ owners và chạy lại
   full gates. Không cần viết optimizer hoặc ép P05/roots thành known để làm việc này.

## Bằng chứng tái thực thi

| Evidence | Kết quả thật |
|---|---|
| Golden18 original ZIP, hash được bảo vệ |18cases/72runs =54ON+18OFF;18clusters, không72 independent scenarios |
| Offline ingestion→physics→diagnosis→objective→report→handoff |72new reports;31 COLLISION/41 UNKNOWN;12source disagreements |
| Canonical preservation |216scalar/null values giữ nguyên;72 M/evaluation copies match;42stopping replay differences=0 |
| Physical/causal restraint |18OFF functionalNA;0confirmed roots;0certified physical limits |
| Independent numeric verification |32/32PASS, tolerances riêng trong report02; không measurement uncertainty |
| Focused Maven verify |590total:588pass/0fail/0error/2skip;BUILD SUCCESS/package |
| Full Maven verify |1317total:1312pass/2fail/0error/3skip;BUILD FAILURE, cùng2OptimizationServiceTest failures có trước |
| Digest reconstruction |74/74report/handoff/compatibility digests match; new Golden18 handoff digest trùng sample M1C cũ |
| Negative verification |Reproduced mode/time, breakdown, stale/future contact, multi-contact, nested EV và dangling hypothesis defects; resource probe OOM |

Tests pass không thay thế các counterexamples. Verification probes dùng synthetic
mutations có nhãn; không thay raw hoặc gọi chúng là dữ liệu CARLA thật. Single
kinematic fixture được actual Simulator tạo offline để kiểm profile, không campaign.

## Decision matrix

| Area | PASS / PARTIAL / FAIL / BLOCKED | Evidence | Required action | Owner |
|---|---|---|---|---|
| P01–P03 math, fixed-heading geometry/occupancy | PASS trong declared model |32independent checks; report02/source call graph |Giữ scope/assumptions; không physical certification |FAILURE_ANALYSIS |
| Evidence-to-diagnosis gates | FAIL |FA-001/003/004 |Mode/time/event-local validation và pipeline regressions |FAILURE_ANALYSIS |
| Canonical read/aggregation | PASS |216preserved values; unchanged AnalysisMetrics |Không đổi canonical producer/math |FAILURE_ANALYSIS |
| Objective explanation | PARTIAL |FA-002/008;42valid replays |Clock gates, per-profile lineage, matched comparison scope |FAILURE_ANALYSIS |
| Requirement/calibration/absence positive paths | PARTIAL |FA-007; positive tests chỉ helpers |Verified context vào actual report, giữ unknown defaults |FAILURE_ANALYSIS |
| Certified avoidability/confirmed causes | BLOCKED có chủ đích |P05/OD-03/04;missing certificates |Giữ UNKNOWN; chỉ mở khi có approved evidence/model |CALIBRATION |
| Handoff producer/schema validation | PARTIAL |FA-005/006;72member manifest đủ |Typed EV/claim refs; bảo toàn partition/digest |FAILURE_ANALYSIS |
| Real baseline/post-fit operational data | BLOCKED |DEP-01/02 |Authorized source/baseline/domain/quality snapshots |DATA_PROVIDER / CALIBRATION |
| Current consumer execution | BLOCKED, external |DEP-03;NOT_DIRECTLY_CONSUMABLE |Separate authorized adapter của đồng đội; không sửa algorithm |MOBO_CONSUMER |
| Existing freeze metadata/full build | FAIL, pre-existing external |DEP-04/05 |Versioned descriptor và xử lý2test failures riêng |BACKEND_INTEGRATION |
| Untrusted artifact resource safety | FAIL |FA-010;bounded32MiB JVM reproduction |Input quotas/bounded readers trước backend intake |FAILURE_ANALYSIS |

Chi tiết finding đầy đủ severity/method/lines/repro/expected/actual/impact/fix/owner:
[10_DEFECTS_AND_REMAINING_WORK.md](10_DEFECTS_AND_REMAINING_WORK.md).
Các báo cáo02…09 tách từng area và limits. Chỉ có new audit artifacts;
immutability/git evidence ở report09. Dừng sau final audit.
