# 08 — Implementation plan và verification audit

**STOP sau audit/blueprint. Chưa triển khai FE-R1.** Plan chỉ áp dụng module Failure Analysis. Không chỉnh source physics/AEB/CARLA/calibration/MOBO/auth/shared shell/DB và không thay contracts/business rules/canonical metrics để render dễ hơn.

Các task sau cần được giao riêng. Khả năng API đang dùng là [01](01_BACKEND_CAPABILITY_AUDIT.md), blockers có owner ở [09](09_BACKEND_BLOCKERS_AND_DEPENDENCIES.md). Đừng coi hoàn tất FE-R1 là cho phép nối backend/M2.

## 1. Readiness và trình tự

Có thể thực hiện nhánh web **đọc kết quả baseline hiện có** bằng API thật. Nhánh **JSON intake → chạy core V3.1 → report/handoff mới** bị chặn cho tới backend owner giao endpoint, ownership/errors/versioning và tests. Cả hai dùng IA hai trang; không giải quyết blockers bằng mock API/FE re-scoring.

| Giai đoạn | Nội dung/deliverable task sau | Prerequisite / status hiện tại | Exit criteria kiểm được |
|---|---|---|---|
| FE-R1 Clean navigation/obsolete UI | merge primary modes, remove unused local v1 panel sau reference gate, queryaliases/metadata/deep links; giữ advanced legacy lookup | audit này; không phụ thuộc new core API |1workspace+result primary hierarchy; old links view/section/returnTo vẫn đi đúng; shared nav không diff; không mất CSV/selection guards; no unused imports |
| FE-R2 Core analysis flow | run filters/table/openinspection; role-scoped draft/review panel; loading/empty/error/context/race handling | C01/03/09 working; JSON execution B01/B02 **BLOCKED** | DB flow hoạt động không gọi Analyze giả; keyed stale responses; completed/incomplete/failed khác nhau; partition/revision business rules unchanged; JSON flow chưa có thì báo blocked, không ghi full V3 delivered |
| FE-R3 Results/investigation | simplify summary;3objectives+source/limitations; investigations/timeline/playback reuse; truthful profilecopy | existing detail available; V3 renderer cần B03; provenance conflicts B06/B07 cần owner | stored values/units/null unchanged; no-contact impactnull distinct aggregate0; chart vs canonical distinct; unknown/source conflicts visible; exact recorded seek; root not inferred; V3 screens chỉ enable sau contracttests |
| FE-R4 Reports/handoff/multi-run | grouped summaries/review/snapshot v1/v2 discriminator; CSV clear scope; exact checked dataset-v2 JSON download; separate core report/handoff exports khi backend có | C02/06/09–11 available; B04/B05/B08/B09 for core exports/consumer; no datasetlist API | no mixed identity aggregate/client score; freeze/recheck server; validationsealed; stale snapshots read-only; filenames/schema correct; navigation không được ghi dispatchready |
| FE-R5 Functional/UX regression | repeatable units/contracts/browser fixtures + authorized dev HTTP smoke/manual a11y/viewport tests | stable stages + test env; live/backend jobs còn blocked thì record scope | existing units/contracts pass; relevant browser fixtures pass; no pageerror/consolewarnings/action races; keyboard/zoom/mobile verified; report missing live gates honestly |

Nếu backend core chưa sẵn sàng, FE-R2/3/4 chỉ có thể nghiệm thu **subscope legacy/read-only**. Không ghi toàn bộ redesign evidence V3.1 hoàn tất hoặc xoay legacy data thành report giả. FE-R4 không bao gồm dispatch consumer/MOBO algorithm changes.

## 2. File scope cho task frontend sau

- FA routes/layout-scoped CSS: `frontend/src/app/analysis/failures/**`.
- FA containers: `BaselineAnalysisDashboard.tsx`, `LegacyFailureCases.tsx`, `AnalysisSelectionSummary.tsx`, unused `AnalysisDatasetPanel.tsx` sau reference gate; local `analysisUi.tsx`, `components/analysis/**`.
- Nếu cần sửa shared `services/vehicsim.ts`/`types/vehicsim.ts` để discriminate **existing** v1/v2 API: chỉ targeted FA methods/types, review cross-module project results/consumer; contract/API không tự thay. Có thể dùng local wrapper type nếu phù hợp, không interfaceframework mới chưa có use.
- Shared charts/ScenarioMap/UI/shell/context/auth: reuse read-only trong scope này. Issue shared không thể sửa bằng module-local composition → dependency ticket, không mở rộng task âm thầm.
- Không xóa v1 backend endpoint/type/client có externalcaller. Không xóa test fixtures/artifacts/history vì không có importer production.

## 3. Acceptance tests cần bảo toàn/bổ sung khi implement

| Gate | Cases |
|---|---|
| Routing/navigation | mặc định workspace và cả4 view aliases cũ; các detail sections; invalid ID; whitelist quay về regression; refresh/back/share deep link; shared sidebar không đổi |
| Data scope | page/reset theo filters; run counts khác failure counts; search/sort trong trang có nhãn; không trộn objective groups; response thiếu/schema unsupported khác kết quả rỗng hợp lệ |
| Async/auth/project | response cũ đến muộn; refresh/đổi run/đổi project/logout; draft riêng theo account+project;403 chỉ đọc;401 hết phiên; save400/429 giữ draft; không auto-retry POST tạo snapshot trùng |
| Scientific semantics |3canonical values giữ nguyên; null/invalid/số rất nhỏ; impact từng run không contact không thành0; aggregate0 chỉ do backend; không đoán RMS profile/filter/window; tách stopping measured/extrapolated; không lấy GT thay perception; confidence không là xác suất |
| Selection/snapshot | unique variant+seed; variant disjoint giữa roles; safe case mỗi tập; không thêm OFF; metadata ready không bằng server valid; revision/baseline/hash cũ; v1 không handoff; v2 archive có thể thiếu freshness flag; draft không sửa snapshot |
| Handoff boundary | schema v2 khác M1C; GET freshness trước export; CTA của FA không launch optimizer; không fake hints/ranges/verified baseline; future V3 viewer giữ consumer_dispatch_allowed=false khi nguồn trả false |
| Investigation/playback | clocks thiếu/gap/trùng/đi lùi; exact time và disable seek ngoài khoảng; warning khi pair identity chưa xác minh; pause tab ẩn; không nội suy signal thiếu; event đã lưu khác physical onset |
| Accessibility/UX | keyboard với filters/table/sections/disclosures; focus return/error summary; captions/status text không chỉ màu; text alternative cho chart; target size/zoom200%/viewport320..1440px; reduced motion |
| Future core endpoint only | resource auth/project/upload budget/schema/hash/partial manifest; offline key không thành DB ID giả; report version/digest/source pointers; giữ ON/OFF/rep/attempt; UNKNOWN/collision disagreement không bị FE phân loại lại |

Các dòng “future” chưa phải tests implement trong audit. Chỉ bật chúng khi backend capability có thật; SKIPPED/BLOCKED có lý do, không markPASS vì fixture tự chế JSON phù hợp.

## 4. Lệnh và kết quả đã chạy trong audit25/11/2026

Từ root repository, dùng JDK21/Maven wrapper. Source/test không đổi; logs ở `target/` là local artifacts, không là deliverable production.

```powershell
.\mvnw.cmd -B '-Dtest=AnalysisServiceTest,AnalysisDatasetTest,AnalysisSnapshotTest,SimilarFailuresTest,AnalysisApiContractTest,VehicSimSecurityTest,JsonInputAdapterTest,JsonInputEndToEndTest' test
.\mvnw.cmd -B '-Dtest=JsonInputIntegrationTest' '-Dfa.json.samples=docs/failure-analysis-v3/handover/examples/inputs' test
```

Lệnh thứ nhất: **84 tests,84pass,0failure,0error,0skip — BUILD SUCCESS**. `JsonInputEndToEndTest` trong pattern không có class và không chạy; không được tính thêm test. Class đúng là JsonInputIntegrationTest, đã chạy lệnh thứhai: **11 tests,11pass,0failure,0error,0skip — BUILD SUCCESS**, dùng5producer files thật trong bundled examples, gồm standalone2499 và collection1032/1033/1034. Các tests này chứng minh offline CLI/report/handoff và negative paths; không chứng minh REST core integration.

Logs mới: `target/fa-frontend-audit-backend-tests.log`, `target/fa-frontend-audit-json-integration.log`; Surefire XML theo class tương ứng trong target/surefire-reports. Không trích tổng tất cả XML trong thư mục để tránh cộng stale reports của lượt trước.

Trong frontend:

```powershell
npm.cmd run test:analysis -- --repeat=1
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run test:analysis -- --repeat=1
```

Lượt đầu: **FAIL**, TAP10entries/3pass/7fail/0skip:7test modules không load vì `ERR_MODULE_NOT_FOUND: typescript`, chưa chạy assertions của chúng; đây là môi trường thiếu node_modules, không sửa assertions/source để pass. Sau npmci theo lockfile (365packages), lượt mới **48 tests/48pass/0fail/0skip**, runnerPASS.

Artifacts:

- failure summary: `data/analysis-regression/2026-11-25T04-21-39-257Z-21484/summary.json`, `pass-1/unit.log`;
- successful summary: `data/analysis-regression/2026-11-25T04-25-27-071Z-17664/summary.json`, `pass-1/unit.log`.

Tổng backend thực chạy mới **95pass/95tests**,0failure/error/skip. Frontend lần chuẩn bị xong **48/48pass**. Không dùng historical912/1639counts từ README làm kết quả lượt này. Npmci chỉ chuẩn bị dependency, không đổi lockfile/production source. Chưa chạy full backend suite, Next build, browser fixture suites, live HTTP/MySQL, screenreader/native touch, CARLA hoặc optimizer; audit không tuyên bố những gate này đãPASS.

Kiểm tài liệu thêm: `.\mvnw.cmd -B '-Dtest=RepoDocsTest' test` → **5/5 pass,0failure/error/skip, BUILD SUCCESS**, log `target/fa-frontend-audit-doc-tests.log`. Như vậy tổng Java chạy trong audit là **100/100 pass** (95 focused analysis/security/JSON +5 repository documentation). RepoDocsTest không tự bao phủ toàn thư mục blueprint mới; đã kiểm riêng toàn bộ88local Markdown references của chín file:0đường dẫn thiếu. Snapshot SHA256 của626tracked files trong `src`, `frontend`, `database`, `pom.xml` trước/sau:0file thay đổi.

## 5. Lệnh validation cho từng implementation phase sau

```powershell
# root: khi chạm đường FA service/contract (nếu task khác cho phép)
.\mvnw.cmd -B '-Dtest=AnalysisServiceTest,AnalysisDatasetTest,AnalysisSnapshotTest,SimilarFailuresTest,AnalysisApiContractTest,VehicSimSecurityTest' test

# frontend: module-local production changes
npm.cmd run test:analysis -- --repeat=2
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build

# browser fixture gate: production app local phải chạy trước, theo frontend/tests/README.md
$env:ANALYSIS_UI_URL = 'http://127.0.0.1:3122'
npm.cmd run test:analysis -- --browser --repeat=2
```

Browser harness là HTTP fixtures, không thay test authorization/live backend. Môi trường live QA và core endpoint là prerequisite riêng, không tự tạo/ghi DB để chứng minh trong phase audit. Không cập nhật golden với `analysis.contract.update=true` để che regression. Tests fail ngoài scope phải báo trước, không ghi toàn suite thành công.

## 6. Rollout/rollback đề xuất

Mỗi phase giới hạn diff vào local composition/helpers/tests; review query aliases/deep links trước đưa vào app. Giữ các APIs và snapshots lịch sử, không migration. Rollback frontend bằng revert riêng change đã review trong task sau; không đụng raw results/evaluations/snapshot data. Không yêu cầu commit/push trong audit này. Backend blockers phải được giải quyết bởi owner ở task độc lập trước mở capability V3; status gates trong UI lấy từ nguồn thực, không hardcode true theo môi trườngdemo.

## 7. Audit completion gate

Chín deliverables ở frontend-redesign, mọi local Markdown link được kiểm; gitdiff chỉ tài liệu audit và exec-plan bắt buộc theo root AGENTS. Đối chiếu SHA256 các tracked files trong src/frontend/database/pom.xml trước/sau để xác nhận production không đổi. Gitstatus cuối được ghi trong báo cáo trả người dùng. Dừng trước mọi bước FE-R1; không stage/commit/push/merge.
