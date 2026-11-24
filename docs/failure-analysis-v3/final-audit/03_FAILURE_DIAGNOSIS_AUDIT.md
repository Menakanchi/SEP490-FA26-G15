# 03 — Failure diagnosis và Golden18

Verdict **PARTIAL**: conservative Golden18 behavior đúng; tổng quát hóa ra input
conflict/invalid chưa đúng (FA-001/004), approved requirement path chưa wired
(FA-007), hypothesis explanation chưa đủ (FA-009). Full finding metadata ở
[register10](10_DEFECTS_AND_REMAINING_WORK.md), không dùng legacy labels làm oracle.

## Predicate review

Source `DiagnosisPolicy.java` L66–99, gọi từ DiagnosticReport L19–20.

| Candidate | Predicate thực tế | Evidence và giới hạn |
|---|---|---|
|NO_BRAKING|ON-like behavior, no Q/B, không pending, có admissible contact hoặc nominal actual conflict |Symptom NO_RECORDED_AEB_COMMAND. Missing observability/duty/command coverage/actionability ghi rõ; không dùng legacy missed_activation |
|FALSE_BRAKING|B recorded, terminal target stationary outside, complete nominal geometry và không lateral occupancy |Hindsight unnecessary symptom hẹp; không ex-ante policy violation.061/064 caution/track alternatives giữ mở |
|INEFFECTIVE_BRAKING|B recorded + matching contact |Command+contact symptom, không automatically functional failure/failed mitigation. Requirement/consumption/feasibility/calibration thiếu |

Không collision→automatic SUPPORTED; không priority physical_limit→late_detect→weak
brake; không first-failed legacy stage làm root. OFF thật thoát trước candidates.
`applyRequirements` L28–51 kiểm APPROVED requirement ID/version/type/citations và
từng nonconditional supported predicate trước SUPPORTED, nhưng `assess` luôn truyền
Map.of(). Positive unit tests không chứng minh positive report path.

Observed outcome tách khỏi functional assessment:31 COLLISION as-recorded và41
UNKNOWN; INCONCLUSIVE có thể đi cùng collision. Empty candidate list không positive
compliance PASS. Source mode conflict chưa chặn predicate là FA-001, không được
che bằng việc18clean OFF tests pass.

## Toàn72run, không chỉ aggregate counts

[verify_independent.py](verification/verify_independent.py) parse trực tiếp matrix
của **original** GOLDEN18_EXPECTED_BEHAVIOR §2 và đối chiếu từng run: outcome,
contact count,end reason,D/Q/B và candidate types theo §3. **72/72 match.**
Không sửa oracle. [golden72-review.csv](evidence/golden72-review.csv) có từng run,
seed/mode/objectives/candidate/geometry/source hash/report digest; không gộp reps.

| Invariant | Actual |
|---|---:|
|Cases / ON / OFF|18 /54 /18|
|Recorded contact-positive / physical UNKNOWN|31 /41|
|Legacy-vs-sensor disagreements|12|
|NO_BRAKING / FALSE_BRAKING / INEFFECTIVE candidates|6 /6 /14|
|SUPPORTED functional failures / confirmed roots|0 /0|
|OFF functional candidates|0|

Counts là symptoms/evidence counts, không failure prevalence hay independent
reliability samples. Legacy43collision và labels FA/MA không bị re-score.

## Review sâu12case yêu cầu

`C/U` là recorded collision / UNKNOWN. Tuples theo R1,R2,R3,OFF.

| Case | Actual outcomes | Actual report review / UNKNOWN cần giữ |
|---|---|---|
|FA-G1-002|U/U/U/U|No candidates; nominal no-conflict, clearance R1≈1.0882208m, disjoint PET. Legacy missed activation không được dùng để ép no-braking. Duty/absence authority UNKNOWN |
|FA-G1-007|C/C/C/C|3ON NO_BRAKING SUSPECTED; D/Q/B null. Recorded impact13.935 khác canonical13.900 R1; radar opening/delivery/occlusion chưa causal-isolated |
|FA-G1-011|U/U/U/U|Q4.90, command due5.15, core end5.09; pending/right-censored, candidates[]. Nominal clearance≈.0626141m không bị force0 hoặc gọi SAFE |
|FA-G1-012|C/C/C/C|3ON NO_BRAKING SUSPECTED; pedal pulses CONTROL_ACTIVITY_UNATTRIBUTED, OFF giữ readback. Không planner/actuator confirmed root |
|FA-G2-026|C/C/C/C|3ON ineffective SUSPECTED; front đã qua vẫn xét full body. Applied-dimension model conflict=true dù nominal clearance≈.03m; geometry không thay contact authority. Jerk null/B2.85 có |
|FA-G2-028|C/C/C/U|3ON command2.40+contact; OFF contact chưa admissible nên mitigation UNKNOWN, không lấy legacy OFF impact làm physical comparator |
|FA-G2-029|C/C/C/C|Q2.20/B2.45; paired R1 recorded reduction≈6.348m/s, observational only. Ineffective symptom không chứng minh mitigation goal thất bại |
|FA-G3-061|U/U/U/U|3ON false-braking SUSPECTED; target còn đi ởQ2.15, acceptable caution có thể hợp lý. Clearance≈.98m không thành confirmed FP |
|FA-G3-064|U/U/U/U|3ON false-braking SUSPECTED; Q2.45/B2.70; stale velocity hypothesis. Recorder2.44 không được so trực tiếp với Q; no validated common clock |
|FA-G4-091|U/U/U/C|Actual TTC.6 giữ nguyên, Q3.60/B3.85. No forced ineffective candidate ởON vì authority disagreement; physical impact null dù canonical có số |
|FA-G5-125|C/C/U/C|R1/R2 ineffective SUSPECTED; R3 không forced failure. μ.65→conditional6.3765 cap; canonical tail dùng stored6.377. Không PHYSICAL_LIMIT/LOW_FRICTION confirmed |
|FA-G6-168|U/C/U/C|ChỉR2 ineffective SUSPECTED; canonical2.820 vs recorder2.811; observed pair reduction11.176m/s có scope. Không gộp3rep hoặc quy50ms là confirmed cause |

Sáu case còn lại cũng nằm trong72per-run oracle checks:001 chỉR1 ineffective;
003/004/010 không forced failure;027 chỉR1 recorded contact/ineffective, giữ3
disagreements;144ON đều UNKNOWN, R1 legacy-only disagreement. Không lấy tên case
làm ground truth. Không case nào là confirmed root-cause golden label.

## Root hypotheses: phần có và phần thiếu

Existing hypotheses có status SUSPECTED, evidence refs, alternatives và missing
prerequisites. Không confidence probability; confirmed_root_cause luôn UNKNOWN.
Nhưng templates primary-perception/caution-or-prediction thiếu source mechanism
refs và falsification plan cụ thể. Ineffective cases thường chỉ có alternatives,
không một causal dossier đầy đủ; [] không bị coi lỗi nếu evidence chưa support.

Cần phân biệt: hypothesis chưa confirmed là kết quả đúng; absence của một đường
đưa approved evidence/context vào pipeline và thiếu điều tra/falsification details
là remaining work. Không sửa controller/tracker hoặc tạo parameter culprit trong audit.

Acceptance trước sign-off: invalid/conflicting mode/time không sinh functional
candidate như ON thật; multi-event không xóa matching contact; approved requirement
positive path qua report với full citations; Golden18 vẫn giữ mọi conservative
UNKNOWN và exact72matrix/canonical values.
