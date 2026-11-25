# Failure Analysis — đọc từ đây khi bàn giao

**Database-direct input,25/11/2026:** giao diện hiện ưu tiên chọn run/biến thể CARLA
trong DB, tự đọc `result.json` qua artifact reference và lưu report/handoff bằng
persistence BE-R1. Không cần upload JSON. Xem
[báo cáo và giới hạn kiểm thử](backend-integration/DB_DIRECT_INPUT_IMPLEMENTATION_REPORT.md).
FE-R4 và luồng chọn DB đã có source; chưa triển khai lên DB ứng dụng hay tích hợp M2.

**Cập nhật BE-R1,25/11/2026:** đã bổ sung JSON-first REST và immutable FA persistence.
Đọc [báo cáo BE-R1](backend-integration/09_IMPLEMENTATION_REPORT.md),
[API cho FE-R4](backend-integration/03_REST_API_CONTRACT.md) và
[test thực tế](backend-integration/08_TEST_REPORT.md). Migration020 chỉ được kiểm
trên MySQL test riêng, chưa áp DB ứng dụng. Handoff vẫn diagnostic-only/blocked;
approved context/cohort và consumer M2 chưa tích hợp. Trạng thái FE-R4 xem cập nhật trên.

**Hiện trạng 24/11/2026:** module Java chạy offline đã implement M1A–M1D,
Fix Batch01–04 và production JSON input adapter. Nhận JSON kết quả đã chạy từ
module2; xuất Diagnostic Report theo từng run và MOBO Handoff cho module4.
Đây là module3, không chạy CARLA và không chạy optimizer.

## Đường đọc cho từng người / AI

| Người nhận | Đọc trước | Sau đó |
|---|---|---|
| Module2 — xuất JSON CARLA | [MODULE_2_JSON_PRODUCER.md](handover/MODULE_2_JSON_PRODUCER.md) | [Input mapping chính xác](json-input-integration/INPUT_CONTRACT_MAPPING.md), input thật trong handover/examples/inputs |
| Module4 — đọc handoff.json | [MODULE_4_MOBO_CONSUMER.md](handover/MODULE_4_MOBO_CONSUMER.md) | [MOBO contract](MOBO_HANDOFF_CONTRACT_V1.md), [M2_CHANGE_PLAN](M2_CHANGE_PLAN.md), handoff thật trong handover/examples/outputs |
| AI tiếp nhận code | [ARCHITECTURE_AND_STATUS.md](handover/ARCHITECTURE_AND_STATUS.md) | [RUNBOOK.md](handover/RUNBOOK.md), source/test Java, [prompt khởi đầu](handover/AI_START_PROMPTS.md) |
| Kiểm chứng kết quả | [TEST_RESULTS.md](json-input-integration/TEST_RESULTS.md) | [sample index](handover/examples/SAMPLE_INDEX.json), [các dependency chưa đủ](json-input-integration/REMAINING_DEPENDENCIES.md) |

Source core: `src/main/java/com/vsos/core/failureanalysis/` —42 Java files.
Tests/fixtures core: `src/test/java/com/vsos/core/failureanalysis/` —24 Java files.
FA-owned backend controller/service/repository/codec/exception và tests BE-R1 được
liệt kê riêng trong báo cáo09; không nhầm với source snapshots hoặc core algorithms.
Giữ đủ cả hai thư mục. Các bản source trong `before-source/`, class probe và
report chạy lặp không phải implementation cần dùng.

## Chạy nhanh

Từ repository gốc, JDK21 và Maven wrapper:

```powershell
& .\docs\failure-analysis-v3\handover\run-offline.ps1 -Build `
  -InputPath .\docs\failure-analysis-v3\handover\examples\inputs\vsos-collections-2026-11-24\vehicsim-variant-1033-collection.json `
  -OutputDirectory .\target\fa-my-first-export
```

Output mới gồm `diagnostics/`, `handoff.json`, `compatibility.json`. Script không
ghi đè output cũ, không truy cập DB, không dispatch MOBO. Có thể dùng standalone
result JSON; ZIP/directory Golden18 cũ vẫn được hỗ trợ.

## Hiểu đúng kết quả

- Ba objective canonical giữ nguyên `adr040-stored-aggregation/1`; không thay
  bằng số sensor tính lại hay legacy failure labels.
- Actual JSON đã kiểm chứng:5file,8lần phân tích,6runID khác nhau; ba collection
  có tổng6run,3ON/3OFF. Run2499 xuất hiện trong ba export context, không phải
  ba observation độc lập.
- Schema/digest handoff hợp lệ không bằng được phép tối ưu. Mẫu thật hiện đều
  `NOT_DIRECTLY_CONSUMABLE`, `consumer_dispatch_allowed=false`, baseline/score
  UNKNOWN vì thiếu binding/freeze/quality/domain và consumer chưa tích hợp.
- Root cause/physical limit UNKNOWN là kết quả có chủ đích khi thiếu evidence.
  Không bật cờ true hoặc điền0 để tạo cảm giác hoàn thiện.

Kết quả lịch sử đợt JSON adapter24/11:50testJSON mới pass; focused912total/910pass/2skip,
BUILD SUCCESS. Full1639total/1634pass/2failure cũ/3skip, BUILD FAILURE.
Golden72 oracle,32math checks,74digests pass. Xem log thay vì suy từ số test có mặt.

## Tài liệu thiết kế và lịch sử

Tám contract gốc được giữ nguyên: DATA_CONTRACT, FORMULA_SPEC,
DIAGNOSIS_POLICY, GOLDEN18_EXPECTED_BEHAVIOR, OBJECTIVE_ANALYSIS_CONTRACT,
MOBO_HANDOFF_CONTRACT, OPEN_DECISIONS, REFACTOR_BLUEPRINT. Chúng mô tả yêu cầu và
có câu “DESIGN ONLY/chưa implement” tại thời điểm viết; không dùng các câu đó để
phủ nhận source hiện có. Hiện trạng mới đọc ở README này, handover và report JSON
integration. Không diễn giải tài liệu đề xuất M2 thành implementation đã hoàn thành.

M1A–D implementation reports, final-audit và FIX_BATCH reports là lịch sử giải
thích vì sao có các gate/test hiện tại. Không dùng sample cũ thay mẫu đã kiểm
chứng mới. `samples/m1c/GOLDEN18_OFFLINE-handoff.json` được giữ vì integration test
đọc trực tiếp; đó là fixture lịch sử, không phải output production-ready.

Gói ZIP bàn giao được tuyển chọn chỉ gồm source/test/contract/tổng kết/mẫu thật
và bằng chứng cuối. Bản lưu đầy đủ trước dọn ở ngoài repository. Xem
[CLEANUP_AND_PACKAGE.md](handover/CLEANUP_AND_PACKAGE.md) để phân biệt file trong
gói bàn giao, file dư còn trên workspace và bằng chứng đã lưu.

## Bằng chứng chạy lặp không đưa vào main

Khi gộp vào `main` (25/11/2026), các file bằng chứng không phải `.md` trong `fixes/`, `json-input-integration/` và
`final-audit/` (khoảng 1.380 file JSON/CSV/log, ~135 MB, có đường dẫn máy cá nhân) được bỏ để repo không phình vĩnh viễn.
Các báo cáo `.md`, `samples/` (test `M1DGolden18IntegrationTest` dùng) và `handover/` vẫn giữ. Link từ báo cáo tới file bằng
chứng đã bỏ có thể không còn mở được trên `main`; bản đầy đủ nằm ở nhánh `trungdam`, commit `d0bc9dc`.
