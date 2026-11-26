# BE-R1 — Security và resource boundary

Shared SecurityConfig/JWT/ProjectAccess/VehicSimAccess giữ nguyên. Mỗi request đều
resolve authenticated project; mọi SQL resource lookup/list có project predicate,
composite FK khóa children vào cùng project/source/execution. Read mutation permission
không suy từ producer project_id, filename, DB IDs trong source hoặc body JSON.

Write routes dùng shared requireEngineer và limitWrites. Read routes vẫn yêu cầu
principal và shared project scope. Cross-project trả404 như resource không tồn tại.
FA-only lifecycle gate yêu cầu project/workspace ACTIVE cho upload và analyze;
gate đọc state từ DB sau project authorization, kiểm lại bằng FOR SHARE trong
transaction ghi. Không sửa shared resolver vốn cho phép đọc archived history.
Lifecycle của legacy routes và default project ADMIN/MANAGER vẫn là FOLLOW_UP.
No arbitrary path, URL fetch, archive extraction, external command hay network input.
Source chỉ được ingest bằng raw application/json bytes, không nhận filesystem reference.
Không trả SQL/stack/exception message/server temp path trong FA error responses.

| Budget | Limit | Enforcement |
|---|---|---|
| Original upload | 1 MiB | Content-Length precheck + BoundedInput actual bytes, kể cả unknown length |
| Concurrent intake/analysis | 2/process | Shared nonblocking semaphore; excess429; không thay quota shared |
| Delivered runs / manifest members | 16 | Existing adapter InputResourcePolicy |
| Internal member/serialization upper bound | 8 MiB | Core policy; khác upload cap vì Python-compatible digest có conservative size estimate |
| JSON depth / string / token | 48 /262144chars /256chars | Existing bounded lexical preflight trước MiniJson |
| JSON values / array records | 200000 /20000 | Existing BoundedInput |
| Per-run record accounting | 60000 | Adapter budget |
| Retained charge / work | min(128MiB,heap/2) /128MiB | Existing allocation accounting, không tuyên bố là measured RSS bound |
| Derived payload / metadata | 8 MiB /256 KiB | Serialization boundary + MySQL CHECK |
| Persisted output graph | 32 MiB | Incremental report accounting + final graph check trước transaction |
| List | 1..20, offset0..10000 | Service validation; metadata-only SELECT |

Core policy còn giữ members256, row65536chars, columns128, compression ratio1;
REST không hỗ trợ archives/decompression. Heap phải đáp ứng constructor guards
(8MiB member cần heap ít nhất128MiB). Cần capacity/load test riêng trước tăng limits;
hai slots là giới hạn process, không distributed quota. Dung lượng toàn project,
retention và reverse-proxy/timeouts là quyết định vận hành chưa được chứng nhận ở BE-R1.

Input không hợp lệ/schema chưa hỗ trợ/digest mismatch được xử lý bằng controlled
reason codes. Collection member lỗi được cách ly theo adapter, không bỏ khỏi manifest;
valid member còn lại có thể phân tích. Missing fields không được đổi thành0/false/SAFE.
Header checksum và hash DB bảo vệ byte consistency, không xác thực scientific authority.

Tests: unchanged real security chain, tất cả routes unauthenticated, role mutation
matrix, source/report/handoff/execution cross-project, oversized/chunked-length intake,
malformed JSON/depth/token/duplicate keys qua core tests, schema/hash mismatch,
partial/missing member, concurrent duplicate, actual DB FK/rollback và corrupt payload.
HTTP project-membership resolution dùng mock; shared ProjectSecurity tests kiểm chính
policy hiện có. MySQL integration dùng DB test riêng, không application .env/datasource.

Test infrastructure không mở database ra public interface: container disposable,
localhost random port, tmpfs data, password random chỉ truyền qua process environment;
không chép vào report/log hoặc source. Không chạm container/volume/database hiện có.
