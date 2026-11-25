# 06 — Actual Diagnostic Report completeness

Verdict **PARTIAL**. Audit tạo72report mới qua public OfflineDiagnosticAnalysis,
không đọc sample cũ rồi tuyên bố pipeline đã chạy. Reports ở
[evidence/diagnostics](evidence/diagnostics), example
[007R1](evidence/diagnostics/FA-G1-007-R1.json),
[011R1](evidence/diagnostics/FA-G1-011-R1.json),
[125R1](evidence/diagnostics/FA-G5-125-R1.json).

Envelope: vehicsim.failure-analysis/v1; objective schema v1; design V3.1;
formula fa-formula/3.0.0; policy fa-diagnosis/1.0.0; implementation M1B;
build failure-analysis-m1b/1.0.0. Analysis status vẫn ANALYZED_PARTIAL, không READY.

| Required content | Actual source/call path | Value-level audit |
|---|---|---|
|Identity/provenance|EvidenceReport.analyze L86–94, RawArtifactAdapter|72unique run keys/seed/mode/hash registry; offline DB identities UNKNOWN đúng |
|Physical outcome|ImpactAnalyzer.extract + DiagnosisPolicy.outcome + DiagnosticReport L19–25|31positive/41UNKNOWN; no SAFE from[]; negative event gates FA-003/004 |
|AEB behavior/timeline|AebTimelineBuilder.build + report L26–28|D/Q/B,conditional schedule,censoring,pedal/writer/consumption gaps; FA-001 |
|Three objectives|CanonicalObjectiveReader + report L40–41|216canonical fields giữ nguyên/nulls; không sensor recompute replacement |
|Objective explanation|ObjectiveExplainer|Actual stopping decomposition và event/vector impact có giá trị; generic mechanism text không phải causal proof; FA-002/008 |
|Geometry|DiagnosticReport.geometry → GeometryEngine|2named nominal/applied models/run; full-body continuous translation/clearance/PET; assumptions, clocks/frames/unknown pose |
|Physics/feasibility|DiagnosticReport.feasibility → StoppingModel/AvoidabilityAnalyzer|Actual reference state + conditional cap/stop/inverse/margins/windows/screen; certified P05 UNKNOWN |
|Failure candidates|DiagnosisPolicy.assess|26symptoms với citations/missing/alternatives; không whole-run automatic failure |
|Root hypotheses|DiagnosisPolicy.claim|SUSPECTED/UNKNOWN; no confirmed root, no probability. Mechanism/falsification incomplete FA-009 |
|Sufficiency|EvidenceGates + report L55–61|Claim-local required/available/missing; positive contact không cần jerk calibration. Positive input contexts chưa wired FA-007 |
|Uncertainty/inconclusive|report L62–65|Bounds/clock/geometry/requirements/control/calibration reasons; không dùng solver tolerance như physical uncertainty |
|Calibration|report L50–54|UNKNOWN corrected response/NA raw kinematics; no inferred domain; actual-domain path missing |
|Formula/source refs|DiagnosticSupport.calculated, M1A source refs|0unregistered artifact refs ở72reports. This does not validate claim ID graph or temporal admissibility |
|Legacy/history|report L66, input artifact digests|Pointer đến original evaluation; không re-score/delete history |

`Observed` chỉ nói recorded fact, `CONDITIONAL` giữ model assumptions. Scalar
canonical có thể known trong cùng run physical/functional inconclusive; không
loại facts tốt vì một calibration field thiếu.

## Những phần chưa thực sự hoàn chỉnh

Report không ingest toàn bộ normalized context của DATA_CONTRACT: requirements,
policy thresholds, calibration domains, coverage/drain và binding/comparator chưa
được truyền như một approved package. Vì vậy positive SAFE/NEAR_MISS/SUPPORTED/
IN_DOMAIN/baseline-comparison branches chỉ có helpers hoặc placeholders. Với
Golden18 conservative điều này đúng; với mục tiêu general evidence-driven report
đây là FA-007, không thể ký bằng positive helper tests.

Physical tracking RMSE/onset/command-to-physical delay đúng là UNKNOWN khi thiếu
aligned demands/measurement policy. Certified avoidability/confirmed root được
defer có chủ đích. Không coi chúng là defect yêu cầu giả implementation.

Không chỉ kiểm field presence: audit thực sự đối chiếu72per-run oracle,42replays,
contact speeds/bindings và public CLI→handoff. Ngược lại, FA-001…004 chứng minh field
có thể trông đầy đủ nhưng dùng invalid evidence. Cần sửa tại gate/wiring, không
chỉ đổi wording hoặc schema version để che.

## Report contract/replay

Digest profile fa-report-sorted-json/1 sort keys/normalize numbers/giữ array order,
bỏ analysis_id/created_at_utc/content_digest. 72digests recompute match; fresh UUID
không làm đổi stable content. Report/input objects immutable; original byte hashes
được bảo vệ. Formula-spec artifact được ghi UNVERIFIED, không tuyên bố runtime
binary equivalence hoặc calibration authority chỉ từ file hash.

Giá trị computed trên actual reports khác placeholder branches được liệt kê ở
[report02](02_FORMULA_IMPLEMENTATION_AUDIT.md); không đánh implemented chỉ vì có
formula_id. Full finding records ở [register10](10_DEFECTS_AND_REMAINING_WORK.md).
