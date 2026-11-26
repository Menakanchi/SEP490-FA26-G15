# BE-R1 — Test evidence

Baseline trước khi code: 213 tests, 213 pass,0 fail/error/skip, BUILD SUCCESS.
Log: `evidence/fa-be-r1-baseline.log`.

Kết quả cuối ngày25/11/2026 (không cộng các lượt chạy trùng nhau):

| Lượt | Total | Pass | Fail/error | Skip | Kết quả |
|---|---:|---:|---:|---:|---|
| Baseline focused trước sửa |213|213|0|0|BUILD SUCCESS|
| Focused + actual MySQL |527|527|0|0|BUILD SUCCESS|
| Full clean verify + package |1729|1720|0|9|BUILD SUCCESS|
| Frontend regression không sửa source |63|63|0|0|PASS|

Focused includes40 tests BE-R1:10 actual MySQL invocations,14 service,7 HTTP,
4 store/transaction,4 integration findings,1 core facade. Golden suites cũng chạy:
82 Golden18/M1A,85 M1B,84 M1C,79 M1D (test counts khác số72run trong corpus).
JSON adapter39, JSON integration11, Physics45, MoboHandoffBuilder20, legacy
AnalysisService14 và AnalysisApiContract2 đều pass trong lượt focused.
Suite-by-suite counts ở `evidence/focused-results.json`; full counts/skip names ở
`evidence/full-results.json`. Binary build đã chạy Spring Boot repackage thành công.

Chín skips full suite:6 JUnit nodes của opt-in Mysql class vì không đặt env trong
lượt full (parameterized node mở thành5invocations trong lượt MySQL riêng);
2 authorized fixture integrations HF-02/HF-03 bị BLOCKED vì thiếu authorized
project/version/frozen-v2/current-baseline export;1 full1296-case Python parity
không có vsos.parity.full fixture. Không ghi các phần này thành PASS.
MySQL test riêng không làm hai authorized fixture integrations trở thành đủ evidence.

Phân biệt mức kiểm chứng:

- FailureAnalysisRestTest: actual unchanged Spring SecurityConfig/VehicSimAccess,
  real controller/service/core; project resolver và persistence test doubles.
- FailureAnalysisServiceTest: actual JSON/core, explicit in-memory store double;
  không gọi đây là live DB E2E.
- FailureAnalysisStoreTest: real SQL/TransactionTemplate, mocked DB/manager;
  kiểm commit/rollback sequencing, không chứng minh durability bằng mock.
- FailureAnalysisMysqlTest: actual MySQL8.4, fresh full34-table schema, drop chỉ bốn
  FA tables mới trong DB trống rồi apply migration020 để kiểm upgrade; source/report/
  handoff reload, race/FK/corruption/trigger rollback và archived workspace test.
  Chỉ disposable localhost container/tmpfs, không application database.
- IntegrationFindingsTest: characterization của legacy provenance/shared resolver
  và negative boundary fixtures; PASS không nghĩa producer/legacy bug được sửa.

Inputs thật:2499 original/v2 + collections1032/1033/1034. Source hashes trước/sau,
canonical parity và null, per-member output và handoff blocked được kiểm bằng code.
Các negative mutations được đánh dấu synthetic và không ghi vào fixture gốc.

Lệnh baseline:

```powershell
.\mvnw.cmd -B '-Dtest=JsonInputAdapterTest,JsonInputIntegrationTest,PhysicsFormulaTest,Golden18*Test,MoboHandoffBuilderTest,AnalysisServiceTest,AnalysisApiContractTest' '-Dfa.json.samples=docs/failure-analysis-v3/handover/examples/inputs' test
```

Focused cuối (env chỉ trỏ container disposable, credentials không ghi vào tài liệu):

```powershell
.\mvnw.cmd -B '-Dtest=FailureAnalysis*Test,RestJsonAnalysisTest,*Golden18*Test,JsonInput*Test,PhysicsFormulaTest,MoboHandoffBuilderTest,AnalysisServiceTest,AnalysisApiContractTest,ArchitectureRulesTest,CoreIsolationTest,RepoDocsTest,ProjectSecurityTest,EngineerWorkspaceSecurityTest' '-Dfa.json.samples=docs/failure-analysis-v3/handover/examples/inputs' test
```

Full suite/build: `mvnw.cmd -B clean -Dfa.json.samples=docs/failure-analysis-v3/handover/examples/inputs verify`
với MySQL opt-in env không đặt. Mysql tests có lượt chạy riêng; skip ở full suite
không được trình bày như live DB PASS trong chính lượt đó.

Frontend unchanged regression: `npm.cmd run test:analysis`, 63/63 pass,0fail/skip;
`data/analysis-be-r1-regression/summary.json`. Browser UI/lint/TypeScript/Next build
không chạy lại trong BE-R1; không có frontend/shared UI edits. Prior FE-R3 results
không được cộng vào BE-R1 pass count.

Lỗi gặp trong quá trình làm: test assertions ban đầu dùng Integer thay Long sau
JSON reload và broad temp-prefix assertion nhầm adapter version; đã sửa assertions.
Core serialization conservative bound khác upload limit; đã tách limits.
Empty consumer Profile không đủ cho existing validator refs; dùng existing inspector
missing-source profile, không sửa validator. Initial full discovery có stale compiled
class; clean test chạy được. Full clean đầu phát hiện repository import service là
vi phạm architecture do BE-R1 tạo; đã chuyển FA codec/exception về đúng tầng, không
nới architecture test. Một lượt MySQL bị connection failure sau Docker restart đổi
dynamic localhost port; preserved log, rerun lấy port hiện tại từ container inspect.

Chưa kiểm chứng: production deployment/migration, live producer export lỗi mà nhóm
báo (chưa có export tái hiện riêng), approved context/cohort registry, deployed MOBO
consumer, production capacity/SLA, full HTTP+DB+frontend session. Xem09 dependency tickets.
