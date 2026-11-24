# Batch04 executed commands

Repository `F:\CodeVipChu\SEP490-FA26-G15`; PowerShell/JDK21/Maven wrapper.
Redirected Maven logs UTF-16. CREATE_NEW exports require fresh paths on replay.

```powershell
$FOCUSED = 'Batch04ResourceTest,Batch03ContextTest,Batch03DossierRegressionTest,Batch02RegressionTest,HighSeverityFindingsRegressionTest,ConsumerCompatibilityValidatorTest,M1DConsumerCharacterizationTest,M1DGolden18IntegrationTest,CanonicalAggregationTest,MoboHandoffBuilderTest,ParameterHintsAndBoundsTest,M1CGolden18IntegrationTest,PhysicsFormulaTest,EvidenceAndAvoidabilityTest,M1BPartialEvidenceTest,M1BGolden18IntegrationTest,M1AEvidenceTest,Golden18IntegrationTest,M1AAuthorizedFixtureTest,CoreIsolationTest,AnalysisMetricsTest,RepoDocsTest,ArchitectureRulesTest'
# Baseline: same test list with Batch04ResourceTest omitted, clean verify.
.\mvnw.cmd -B clean "-Dtest=$FOCUSED" '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> docs/failure-analysis-v3/fixes/batch-04-evidence/focused-accepted.log
.\mvnw.cmd -B '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> docs/failure-analysis-v3/fixes/batch-04-evidence/full-final.log
python docs/failure-analysis-v3/fixes/batch-04-evidence/size_golden.py

javac -encoding UTF-8 -cp 'target/classes;target/test-classes' -d docs/failure-analysis-v3/fixes/batch-04-evidence/probe-classes docs/failure-analysis-v3/fixes/batch-04-evidence/IngestionProbe.java docs/failure-analysis-v3/fixes/batch-04-evidence/verification/VerifyReportDigests.java docs/failure-analysis-v3/final-audit/verification/FinalAuditProbe.java
javac -encoding UTF-8 -cp target/classes -d docs/failure-analysis-v3/fixes/batch-04-evidence/before-classes docs/failure-analysis-v3/fixes/batch-04-evidence/before-source/main/RawArtifactAdapter.java docs/failure-analysis-v3/fixes/batch-04-evidence/before-source/main/ArtifactCsv.java
python docs/failure-analysis-v3/fixes/batch-04-evidence/verify_resource_limit.py *> docs/failure-analysis-v3/fixes/batch-04-evidence/resource-and-memory.log

java -cp target/classes com.vsos.core.failureanalysis.OfflineDiagnosticAnalysis D:/Downloads/golden18_raw_artifacts.zip docs/failure-analysis-v3/fixes/batch-04-evidence/final-confirmation/diagnostics *> docs/failure-analysis-v3/fixes/batch-04-evidence/rebuild-diagnostics.log
java -cp target/classes com.vsos.core.failureanalysis.OfflineMoboHandoff D:/Downloads/golden18_raw_artifacts.zip docs/failure-analysis-v3/fixes/batch-04-evidence/final-confirmation/diagnostics docs/failure-analysis-v3/fixes/batch-04-evidence/final-confirmation/GOLDEN18-audited-handoff.json . *> docs/failure-analysis-v3/fixes/batch-04-evidence/rebuild-handoff.log
$handoffHash = (Get-FileHash docs/failure-analysis-v3/fixes/batch-04-evidence/final-confirmation/GOLDEN18-audited-handoff.json -Algorithm SHA256).Hash.ToLowerInvariant()
java -cp target/classes com.vsos.core.failureanalysis.OfflineConsumerCompatibility docs/failure-analysis-v3/fixes/batch-04-evidence/final-confirmation/GOLDEN18-audited-handoff.json $handoffHash . docs/failure-analysis-v3/fixes/batch-04-evidence/final-confirmation/GOLDEN18-audited-compatibility.json *> docs/failure-analysis-v3/fixes/batch-04-evidence/rebuild-compatibility.log
java -cp 'target/classes;target/test-classes;docs/failure-analysis-v3/fixes/batch-04-evidence/probe-classes' com.vsos.core.failureanalysis.FinalAuditProbe D:/Downloads/golden18_raw_artifacts.zip docs/failure-analysis-v3/fixes/batch-04-evidence/final-confirmation/independent-probes-after.json *> docs/failure-analysis-v3/fixes/batch-04-evidence/independent-probe.log
python docs/failure-analysis-v3/fixes/batch-04-evidence/verification/verify_batch04.py *> docs/failure-analysis-v3/fixes/batch-04-evidence/independent-math-and-golden.log
java -cp 'target/classes;docs/failure-analysis-v3/fixes/batch-04-evidence/probe-classes' VerifyReportDigests *> docs/failure-analysis-v3/fixes/batch-04-evidence/digest-verification.log
python docs/failure-analysis-v3/fixes/batch-04-evidence/verification/verify_state.py *> docs/failure-analysis-v3/fixes/batch-04-evidence/preservation-and-results.log
git status --short
git diff --check
```

Before OOM used the same original audit archive and `java -Xmx32m -cp target/classes
com.vsos.core.failureanalysis.OfflineFailureAnalysis` before edits; only the output
directory changed to `batch-04-evidence/red-oversized-output`. Original probe/script
outputs were not overwritten. All process probes have explicit heap/time limits.
