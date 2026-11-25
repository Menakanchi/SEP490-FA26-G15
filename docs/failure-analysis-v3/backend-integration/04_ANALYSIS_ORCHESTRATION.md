# BE-R1 — Orchestration từ bytes tới core

`FailureAnalysisController` → `FailureAnalysisService` → `RestJsonAnalysis` →
existing JsonInputAdapter/Evidence.Run/DiagnosticReport. Core formula/diagnosis,
canonical producers và legacy AnalysisService không bị sửa.

Intake dùng BoundedInput.read trực tiếp servlet input stream, không Jackson-bind
JSON mô phỏng. Facade ghi bytes vào temp file do server sở hữu vì adapter hiện nhận
Path; adapter đọc/validate bằng parser đã có. Temp file luôn được dọn trong finally.
Không có client path/URL. Trước khi gọi core, facade đổi **artifact locator** của
server temp file sang `urn:vehicsim:failure-analysis:sha256:<container SHA>`; data,
hash, source pointers, issue/provenance không đổi. Report được tạo/digest sau bước
này; không sửa report đã tạo để che đường dẫn.

Input source được parse lại từ **original stored bytes** khi analyze, không từ
metadata hoặc telemetry projection. Storage SHA được xác minh trước đó. Header
checksum của uploader chỉ kiểm consistency vận chuyển, không truyền như independent
producer trust anchor; adapter giữ container/external authenticity UNVERIFIED.

Mỗi adapter Entry giữ ordinal/run_key/pointer/issues. Blocked entry vẫn nằm trong
accounting. Entry có Run gọi `DiagnosticReport.analyze(run, comparator, emptyContext)`.
Comparator dùng chính `FailureAnalysisInput.comparator`: unique OFF cùng case và
declared seed/simulator/vehicle/AEB version + params; ImpactAnalyzer kiểm thêm tính
so sánh. Không tự ghép chỉ theo variant, không chọn best repetition. Pair source
registry và mitigation reasons của core được giữ nguyên trong report.

| Counter | Nghĩa |
|---|---|
| expected | Số Entry của adapter, gồm delivered runs và manifest members thiếu document |
| accepted | Entry có Evidence.Run; chưa phải claim sufficient |
| analyzed | Core đã tạo report và đưa vào graph commit |
| blocked | Entry không có Run |
| failed | Có Run nhưng core không tạo được report; không tự tạo report rỗng |
| missing | Subset blocked có MANIFEST_RUN_DOCUMENT_MISSING |

`expected = analyzed + failed + blocked`; `accepted = analyzed + failed`.
Collection-level invalid manifest rows/duplicates/status issues còn được giữ ở
input_manifest. expected không tuyên bố đếm được một frozen scenario population chưa
được cung cấp. Invalid manifest declarations không có unique run identity được giữ
như issues trong original source/manifest, không được tự sinh run ID.

COMPLETED: adapter complete và không member analysis failure. PARTIAL: chưa complete
nhưng có report. BLOCKED: không report và chưa complete. Đây là execution status,
khác simulation status và khác report.analysis_status (có thể ANALYZED_PARTIAL vì
evidence thiếu). Per-member unexpected errors có reason CORE_MEMBER_ANALYSIS_FAILED;
không lộ exception text; valid reports còn lại vẫn được persist trong partial graph.
Resource/storage errors không trả success giả.

Chọn synchronous bounded processing: input thật lớn nhất 594409 bytes, hai member
mỗi collection; giới hạn REST 1 MiB và16members, hai compute slots/process. Source
parse/report generation ngoài transaction. `runtime_ms` đo composition từ sau parse
đến trước saveGraph; **không** là total HTTP latency/DB SLA. Số đo test nằm trong các
execution examples; không dùng benchmark này tuyên bố production capacity.
Không tạo queue, background progress, cancellation hoặc auto retry campaign.

Execution key pin source UUID/SHA, REST orchestration/facade versions, SHA registry
toàn bộ loaded `com/vsos/core/**/*.class`, InputResourcePolicy và Java runtime identity,
default context digest. Loaded bytecode fingerprint không giả làm git revision hay
producer JAR hash. Release thay orchestration phải tăng VERSION. Missing/duplicate
classpath registry làm service fail closed, không reuse version không biết.

Default AnalysisContext.empty() không cấp baseline/requirements/calibration/no-contact
authority. BE-R1 chưa có approved context/cohort registry; context_id bị409 thay vì
đọc nhãn APPROVED từ input. Operational context integration vẫn BLOCKED theo báo cáo09.
