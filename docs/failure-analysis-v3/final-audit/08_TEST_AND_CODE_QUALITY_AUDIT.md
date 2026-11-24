# 08 — Tests và code quality

**Focused BUILD SUCCESS; full BUILD FAILURE.** Test counts không thay correctness:
negative verification tìm được lỗi report/evidence mà existing suite không bắt.
Không chỉnh production/test cũ để làm xanh.

## Commands và kết quả đã chạy

Repo root `F:\CodeVipChu\SEP490-FA26-G15`; JDK21.0.11; Maven wrapper3.9.9.
Các lệnh PowerShell dưới đây thực sự đã chạy, không chỉ là hướng dẫn dự kiến.

```powershell
.\mvnw.cmd -B '-Dtest=ConsumerCompatibilityValidatorTest,M1DConsumerCharacterizationTest,M1DGolden18IntegrationTest,CanonicalAggregationTest,MoboHandoffBuilderTest,ParameterHintsAndBoundsTest,M1CGolden18IntegrationTest,PhysicsFormulaTest,EvidenceAndAvoidabilityTest,M1BPartialEvidenceTest,M1BGolden18IntegrationTest,M1AEvidenceTest,Golden18IntegrationTest,M1AAuthorizedFixtureTest,CoreIsolationTest,AnalysisMetricsTest,RepoDocsTest,ArchitectureRulesTest' '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> docs/failure-analysis-v3/final-audit/evidence/focused-verify.log
.\mvnw.cmd -B '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> docs/failure-analysis-v3/final-audit/evidence/full-verify.log
```

| Execution | Total | Passed | Failures | Errors | Skipped | Build |
|---|---:|---:|---:|---:|---:|---|
| Focused verify |590 |588 |0 |0 |2 |SUCCESS, package/repackage chạy |
| Full verify |1317 |1312 |2 |0 |3 |FAILURE tại tests; không claim full package success |
| Independent numeric script |32 |32 |0 |0 |0 |Không phải Maven test count |
| Semantic digest reconstruction |74 |74 |0 |0 |0 |72reports+handoff+compatibility |

Logs: [focused](evidence/focused-verify.log), [full](evidence/full-verify.log).
PowerShell redirected logs là UTF-16; Python đọc bằng encoding=utf-16.

Full failures là hai Mockito expectation failures cùng tên đã ghi trong prior
M1D report, được tái xác minh ở audit này (DEP-05):

- OptimizationServiceTest.executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt.
- OptimizationServiceTest.executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor.

Hai focused skips là M1AAuthorizedFixtureTest HF-02/HF-03: thiếu authorized
baseline/frozen/freshness exports, test dùng assumptions thay vì fake fixture.
Full suite thêm disabled KinematicParityFullTest. SKIP không được tính PASS.
M1D135tests pass (37validator+19characterization+79Golden); physics45,
evidence/avoidability24, partial-evidence5, M1BGolden85 đều chạy thật.

## Test effectiveness — strength và blind spots

| Coverage | Evidence thực | Giới hạn audit tìm thấy |
|---|---|---|
| P02/P03 domain, ramp/zero/boundary |PhysicsFormulaTest và32independent calculations |Model-valid math không chứng nhận actual response/calibration hoặc2D avoidance |
| Full-body geometry, PET, missing clocks |Geometry fixtures+Golden026 |Fixed-heading/piecewise-linear scope; không arbitrary rotation/pose uncertainty |
| Golden72 diagnosis |Actual JSON assertions; independent CSV checks original oracle72/72 |Corpus không có multi-contact tick, identity conflict mutations, stale reconstruction |
| Canonical objectives/nulls |Golden integration, AnalysisMetricsTest, replay42breakdowns |Clock-invalid decomposition vẫn lọt; profile khácCARLA thiếu narrative coverage |
| Requirements/calibration |Positive helper unit tests |Không proof actual report pipeline nhận approved positive context (FA-007) |
| Hints positive/abstain |ParameterHintsAndBoundsTest, M1D positive/negative fixtures |Synthetic supplied gates; hypothesis_refs sai loại không bị test kiểm (FA-006) |
| Schema/hash/partition |M1D malformed/digest/leakage/source-drift tests |Presence-based EV heuristic bỏ sót malformed nested wrapper (FA-005) |
| Bound source/consumer helper parity |Real pure helper characterization, source hashes |Không campaign, DB freshness, frozen cohort execution hoặc bounds-enforcement proof |
| Source preservation/isolation |CoreIsolationTest, ArchitectureRulesTest, before/after hashes |Import boundaries không kiểm claim correctness/resource safety |

Existing closed-form test expected values có ích, nhưng audit không chỉ lặp lại
expected từ implementation. Independent Python dựng acceleration theo delay/ramp,
bisection stop time và quadrature velocity, đối chiếu Java output; geometry expected
từ hình học tay. Numeric tolerance khai báo ở report02, không measurement bounds.
Digest recomputation dùng cùng production digest profile chỉ kiểm integrity;
không được trình bày là independent physics oracle.

## Audit-only negative verification

[FinalAuditProbe.java](verification/FinalAuditProbe.java) gọi actual pipeline trên
in-memory mutations có nhãn, không sửa raw. Ten observations gồm mode conflict,
negative event times, backwards trace, stale pre-contact, future contact time,
multi-contact cùng world frame, actual kinematic producer profile, positive hint
claim refs, malformed nested EV và wrong typed canonical control.

Các observation **không phải10PASS**: wrong-type canonical bị BLOCKED đúng là control;
các reproductions khác cung cấp evidence của FA-001…006/008. Exact JSON ở
[latest probe](evidence/independent-probes-final-v2.json). Independent numeric32PASS
tách khỏi negative observations, không cộng thành Maven test count.

## Code quality và input safety

- **Architecture:** module core dùng core/JDK; không DB/API mutation/optimizer calls.
  Few concrete classes, không thêm abstraction chỉ để pass review. Maven isolation
  và repo architecture tests pass trong focused run.
- **Fallbacks:** canonical reader giữ null/status/reasons, không zero-fill. Unknown
  baseline không dùng AebParams.DEFAULT để verified v1. P05 finite screening không
  trả certificate/UNAVOIDABLE/PHYSICAL_LIMIT. Những đường này là strengths thật.
- **Validity duplication:** clock/blocked checks phân tán giữa validator, impact,
  geometry và objective explainer; mỗi caller dùng khác nhau tạo FA-001…004.
  Recommendation là claim-specific validated evidence reuse, không global drop
  mọi evidence vì một field xấu. Không refactor trong audit.
- **Unwired capabilities:** G02/projection và tracking RMSE helpers chưa dùng trong
  report; positive requirements/calibration chỉ test riêng. Coverage report02 ghi
  IMPLEMENTED_NOT_WIRED/PARTIAL thay vì IMPLEMENTED_AND_USED.
- **Exceptions:** parse errors có thể fail ingestion, trong khi reader EV phân biệt
  missing/invalid. Không coi mọi parse failure là complete schema validation.
  Resource allocation không được controlled error handling bảo vệ (FA-010).
- **Determinism:** new Golden18 handoff semantic digest trùng sample M1C cũ dù
  created_at/IDs có thể đổi; byte hashes và semantic hashes là hai loại khác nhau.
 74documents tái tính digest match; không chứng minh unpinned external state fresh.
- **Units/frames:** GT relative speed vector đúng math, nhưng support snapshot/time
  chưa chặt. Configured cap chỉ conditional bound, không achieved deceleration.
  Report02 nêu model/frame/assumptions riêng, không từ helper suy physical truth.

## ZIP, JSON/CSV và resource reproduction

RawArtifactAdapter không extract ZIP ra filesystem; source có path traversal guard
và reads theo artifact paths. Đây là **source inspection**, không claim audit đã
fuzz mọi ZIP traversal/duplicate member/nesting case. Full in-memory
readAllBytes/JSON/CSV hiện không có explicit per-entry/total/ratio/row budgets.

[Resource probe](verification/verify_resource_limit.py) tạo archive **synthetic**
65415bytes, một result member67108866bytes, chạy child JVM `-Xmx32m` để tái hiện
bounded process OOM. Actual exit1, OutOfMemoryError tại RawArtifactAdapter.bytes
L125. Script assertion xác nhận defect được reproduce, **không phải security PASS**.
[Log](evidence/resource-limit-probe.log) và [observation](evidence/resource-limit-probe.json).
Không upload server, không tuyên bố exploit production. Chọn quotas production là
product/data decision; cần controlled rejection trước backend nhận untrusted input.

Post-fit operational calibration acceptance data chưa có: DEP-01/02. Không lấy
Golden18 hoặc positive synthetic fixtures làm bằng chứng calibration đã hoàn tất.
Full source/method/line-range/repro/fix/ownership của findings trong
[register10](10_DEFECTS_AND_REMAINING_WORK.md); không sửa gì trong task audit.
