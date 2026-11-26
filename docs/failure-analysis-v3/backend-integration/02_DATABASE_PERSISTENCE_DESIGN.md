# BE-R1 — Persistence và transaction

IMPLEMENTED: `FailureAnalysisStore` dùng `Db`/JdbcTemplate và TransactionTemplate.
Bốn bảng additive: `fa_json_sources`, `fa_json_executions`, `fa_json_reports`,
`fa_json_handoffs`. DDL ở migration 020 và cùng nội dung trong `01_schema.sql`.
Từ điển đầy đủ cột được đồng bộ ở `docs/vehicsim/database-schema.md`.

| Entity | Payload bất biến | Parent / key |
|---|---|---|
| Source | Original JSON bytes, không format lại | Project FK; UNIQUE(project_id, byte SHA) |
| Execution | Summary JSON; metadata chứa identity/version/context/counts/member results | Composite source FK; UNIQUE(project_id, full determinant SHA) |
| Report | Original generated DiagnosticReport JSON bytes | FK(project,execution,source); unique execution + member ordinal |
| Handoff | Original builder JSON hoặc NULL khi không thể tạo | Cùng parent FK; một handoff/status resource cho execution |

Mỗi hàng có metadata UTF-8 bytes, metadata SHA, payload bytes/SHA, resource UUID,
project/source/execution references, dedupe key, created_at. Source có identity digest
để nhận diện bản khác bytes của cùng declared identity. Metadata giữ producer
provenance, source schema/size, input manifest, context/schema/core versions,
report content digest, sufficiency, handoff compatibility và blockers.

Không dùng kiểu JSON của MySQL cho original/generated payload: byte representation
phải giữ nguyên, kể cả whitespace/BOM, null và numeric spelling của source.
Giới hạn DB: source 1 MiB; derived payload 8 MiB; metadata 256 KiB/hàng.
Handoff NULL payload bắt buộc NULL SHA. FK ON DELETE RESTRICT, không cascade xóa lịch sử.

CPU/core chạy ngoài transaction. `saveGraph` INSERT execution, mọi report và handoff
trong một transaction ngắn. Child write failure rollback toàn graph; source đã ingest
vẫn tồn tại để retry. Không publish success trước commit. UNIQUE constraint là lớp
chống race giữa nhiều process; loser rollback trước khi đọc committed winner.
In-process semaphore giới hạn compute, không thay UNIQUE constraint.

Idempotency:

- Cùng bytes + project: cùng source ID, bất kể filename.
- Cùng declared identity, khác byte SHA: resource mới; GET source trả peers/conflict.
  Identity thiếu bị đánh UNKNOWN, không khẳng định hai nguồn conflict từ identity rỗng.
- Cùng source UUID/SHA + core fingerprint + orchestration/policy/runtime version +
  default context digest: cùng execution ID và exact persisted report bytes.
- Core/version khác: execution mới, không UPDATE report cũ.
- Approved context khác: hiện API từ chối `context_id`; registry/authority adapter chưa có.
  Không âm thầm coi hai context là một. Future support phải đưa identity/digest vào key.

Repository không có UPDATE/DELETE API. Hash phát hiện corruption; hash không là
chứng minh producer authenticity hay chữ ký reviewer. Quyền DBA vẫn cần cơ chế
backup/retention của vận hành; BE-R1 không tạo policy retention tự động.

Migration không tự chạy khi app khởi động. Chỉ đã áp vào container MySQL test riêng;
database dev/production chưa được thay đổi. Deployment phải review/apply 020 theo quy
trình của nhóm trước khi FE gọi API. Rollback an toàn: ngừng caller V3, giữ bảng và
bytes; chỉ drop theo thứ tự handoffs → reports → executions → sources sau export và
quyết định quản trị dữ liệu. Không rollback bằng sửa historical simulation records.
