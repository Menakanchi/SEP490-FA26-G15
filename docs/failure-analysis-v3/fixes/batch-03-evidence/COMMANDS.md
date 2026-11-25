# Batch03 executed commands

Working directory: `F:\CodeVipChu\SEP490-FA26-G15`. PowerShell, JDK21, Maven wrapper.
Use fresh output paths for CREATE_NEW exports; these are the original executed
paths, not commands to overwrite accepted evidence.

```powershell
$FOCUSED = 'Batch03ContextTest,Batch03DossierRegressionTest,Batch02RegressionTest,HighSeverityFindingsRegressionTest,ConsumerCompatibilityValidatorTest,M1DConsumerCharacterizationTest,M1DGolden18IntegrationTest,CanonicalAggregationTest,MoboHandoffBuilderTest,ParameterHintsAndBoundsTest,M1CGolden18IntegrationTest,PhysicsFormulaTest,EvidenceAndAvoidabilityTest,M1BPartialEvidenceTest,M1BGolden18IntegrationTest,M1AEvidenceTest,Golden18IntegrationTest,M1AAuthorizedFixtureTest,CoreIsolationTest,AnalysisMetricsTest,RepoDocsTest,ArchitectureRulesTest'
# Baseline used the same list with the two new Batch03 classes omitted, without clean.
.\mvnw.cmd -B '-Dtest=Batch03DossierRegressionTest' test *> docs/failure-analysis-v3/fixes/batch-03-evidence/red-dossiers.log
.\mvnw.cmd -B clean "-Dtest=$FOCUSED" '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> docs/failure-analysis-v3/fixes/batch-03-evidence/focused-final-context-guards.log
.\mvnw.cmd -B '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' '-Dbatch03.evidence=docs/failure-analysis-v3/fixes/batch-03-evidence/final-confirmation/synthetic-final' verify *> docs/failure-analysis-v3/fixes/batch-03-evidence/full-final.log

java -cp target/classes com.vsos.core.failureanalysis.OfflineDiagnosticAnalysis D:/Downloads/golden18_raw_artifacts.zip docs/failure-analysis-v3/fixes/batch-03-evidence/final-confirmation/diagnostics *> docs/failure-analysis-v3/fixes/batch-03-evidence/rebuild-diagnostics.log
java -cp target/classes com.vsos.core.failureanalysis.OfflineMoboHandoff D:/Downloads/golden18_raw_artifacts.zip docs/failure-analysis-v3/fixes/batch-03-evidence/final-confirmation/diagnostics docs/failure-analysis-v3/fixes/batch-03-evidence/final-confirmation/GOLDEN18-audited-handoff.json . *> docs/failure-analysis-v3/fixes/batch-03-evidence/rebuild-handoff.log
$handoffHash = (Get-FileHash -LiteralPath 'docs/failure-analysis-v3/fixes/batch-03-evidence/final-confirmation/GOLDEN18-audited-handoff.json' -Algorithm SHA256).Hash.ToLowerInvariant()
java -cp target/classes com.vsos.core.failureanalysis.OfflineConsumerCompatibility docs/failure-analysis-v3/fixes/batch-03-evidence/final-confirmation/GOLDEN18-audited-handoff.json $handoffHash . docs/failure-analysis-v3/fixes/batch-03-evidence/final-confirmation/GOLDEN18-audited-compatibility.json *> docs/failure-analysis-v3/fixes/batch-03-evidence/rebuild-compatibility.log

javac -encoding UTF-8 -cp 'target/classes;target/test-classes' -d docs/failure-analysis-v3/fixes/batch-03-evidence/verification/classes docs/failure-analysis-v3/final-audit/verification/FinalAuditProbe.java docs/failure-analysis-v3/fixes/batch-03-evidence/verification/VerifyReportDigests.java
java -cp 'target/classes;target/test-classes;docs/failure-analysis-v3/fixes/batch-03-evidence/verification/classes' com.vsos.core.failureanalysis.FinalAuditProbe D:/Downloads/golden18_raw_artifacts.zip docs/failure-analysis-v3/fixes/batch-03-evidence/final-confirmation/independent-probes-after.json *> docs/failure-analysis-v3/fixes/batch-03-evidence/independent-probe.log
python docs/failure-analysis-v3/fixes/batch-03-evidence/verification/verify_batch03.py *> docs/failure-analysis-v3/fixes/batch-03-evidence/independent-math-and-golden.log
java -cp 'target/classes;docs/failure-analysis-v3/fixes/batch-03-evidence/verification/classes' VerifyReportDigests *> docs/failure-analysis-v3/fixes/batch-03-evidence/digest-verification.log
python docs/failure-analysis-v3/fixes/batch-03-evidence/verification/verify_batch03_state.py *> docs/failure-analysis-v3/fixes/batch-03-evidence/preservation-and-results.log
git status --short
```

Focused packaging succeeds; full verify fails at tests with precisely two known
OptimizationServiceTest failures. No `-DskipTests` or ignored failures used.
