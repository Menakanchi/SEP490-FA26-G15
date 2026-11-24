# Chạy và kiểm thử trên máy đồng đội

Gói bàn giao là **overlay cho repository SEP490-FA26-G15**, không phải Maven
project độc lập. Giải nén vào root của checkout phù hợp sau khi review diff.
Giữ pom.xml/Maven wrapper và core/backend source hiện có; không copy đè module
2/4 bằng các bản source snapshot cũ. Xem FILE_MANIFEST cho hashes và base HEAD.

JDK21 + Maven wrapper đủ để chạy module3 offline. Không cần DB, Redis, CARLA,
Python worker hoặc API token. Full Maven tests có pre-existing failures được ghi
rõ; chúng không bị script tự sửa/ẩn.

## Chạy qua script bàn giao

Từ repository root:

```powershell
& .\docs\failure-analysis-v3\handover\run-offline.ps1 -Build `
  -InputPath .\docs\failure-analysis-v3\handover\examples\inputs\result_run2499_full_dataset_v2.json `
  -OutputDirectory .\target\fa-run2499-demo
```

Đổi input sang `examples/inputs/vsos-collections-2026-11-24/vehicsim-variant-1033-collection.json`
để đọc ON/OFF. OutputDirectory phải mới. -Build gọi Maven compile, không chạy
test. Bỏ -Build nếu đã compile. Script gọi đúng public Java CLIs; không chứa logic
diagnosis/aggregation riêng, không có bước dispatch.

| Output | Dùng để làm gì |
|---|---|
| diagnostics/<run_key>.json | One Diagnostic Report per analyzable run |
| diagnostics/_input_manifest.json | Identity/intake/membership/blocked reasons cho JSON; COMPLETE chỉ delivered members |
| diagnostics/FUNCTIONAL_TEST_SUMMARY.csv | Review values/status refs; blank cell là null/unknown, không0 |
| handoff.json | Versioned producer-output contract; actual examples unbound, dispatch=false |
| compatibility.json | Schema/digest/source capability gaps, không thực thi consumer |

Nếu intake PARTIAL, script dừng trước handoff để không đóng gói subset như đủ
population. Diagnostic facts và manifest đã xuất vẫn dùng để tìm lỗi. Nếu chỉ
cần partial diagnostic, chạy OfflineDiagnosticAnalysis trực tiếp.

## CLI trực tiếp, cả Windows và môi trường khác

```text
java -Xmx2g -cp target/classes com.vsos.core.failureanalysis.OfflineDiagnosticAnalysis INPUT.json NEW_DIAGNOSTICS [run_key]
java -Xmx2g -cp target/classes com.vsos.core.failureanalysis.OfflineMoboHandoff INPUT.json NEW_DIAGNOSTICS NEW_HANDOFF.json REPOSITORY_ROOT
java -Xmx2g -cp target/classes com.vsos.core.failureanalysis.OfflineConsumerCompatibility HANDOFF.json EXPECTED_BYTE_SHA256 REPOSITORY_ROOT NEW_COMPATIBILITY.json
```

INPUT cũng có thể là raw ZIP/directory. Expected hash cho compatibility có thể
tính bằng Get-FileHash/SHA256; nó kiểm bytes, không cấp baseline/reviewer authority.
OfflineFailureAnalysis là M1A evidence-only runner, không thay full diagnostics.

## Test với input thật đã đóng gói, không phụ thuộc Downloads máy tác giả

```powershell
$faSamples = (Resolve-Path .\docs\failure-analysis-v3\handover\examples\inputs).Path
.\mvnw.cmd -B '-Dtest=JsonInputAdapterTest,JsonInputIntegrationTest' "-Dfa.json.samples=$faSamples" test
```

Expected tại source bàn giao:39unit +11integration =50test, không skip khi đủ
bundled inputs. Test đổi dữ liệu chỉ là synthetic mutations trong TempDir, không
thay raw fixtures. Real integrations dùng public CLIs, kiểm source bytes/nulls,
ON/OFF, identity, contact/stopping và no dispatch.

## Focused module/regression và full suite

Test list đầy đủ912invocations trong
[TEST_RESULTS.md](../json-input-integration/TEST_RESULTS.md). Dùng cùng
`-Dfa.json.samples` và `-Dgolden18.zip=<path-to-golden18_raw_artifacts.zip>`.
Golden ZIP không kèm overlay vì là raw external dataset; manifest SHA mong đợi:
`22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339`.
Golden test chỉ được PASS khi có raw đúng; thiếu phải báo SKIPPED/BLOCKED.
Fixture samples/m1c/GOLDEN18_OFFLINE-handoff.json được giữ đúng bytes vì
M1DGolden18IntegrationTest đọc trực tiếp.

```powershell
.\mvnw.cmd -B '-Dtest=RepoDocsTest,CoreIsolationTest,ArchitectureRulesTest' test
.\mvnw.cmd -B "-Dfa.json.samples=$faSamples" '-Dgolden18.zip=PATH_TO_GOLDEN.zip' verify
```

Full run trước bàn giao có2existing OptimizationServiceTest failures:
executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt và
executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor.
HF-02/HF-03 thiếu actual authorized exports →2skip; full suite thêm existing
disabled KinematicParityFullTest. Không báo toàn bộ green hoặc tạo fixture giả.

## Khi nhận checkout khác revision

Kiểm git diff/source hashes trước import. ConsumerSourceInspection pin profile
source: thay đổi OptimizationService/AnalysisService/MoboEngine/bounds có thể
đúng là cần review compatibility lại, không xóa gate. File manifest là kiểm kê
nội dung bàn giao, không xác nhận baseline/calibration hiện tại của project.
Rerun generate output ở thư mục mới; không sửa digest/URI trong report cũ.
