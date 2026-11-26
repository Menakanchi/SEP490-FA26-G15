# BE-R1 — Diagnostic Report bất biến

Một report resource cho mỗi analyzable member được core xử lý thành công. Payload
là chính `MiniJson.write(DiagnosticReport.analyze(...))` bytes, không translate legacy
classification thành V3. Source/member pointer, clocks, provenance, canonical null,
physical/candidate/hypothesis/sufficiency/missing reasons giữ nguyên.

Report metadata liên kết project → source → execution → member ordinal/run key;
giữ declared run identity riêng với verified baseline identity. Core project_id có
thể UNKNOWN trong khi resource ownership project đã được auth kiểm tra: đây là
hai ý nghĩa khác nhau, không dùng storage project để tự xác nhận producer DB binding.
Không tạo simulation_runs DB ID cho offline source.

Hai digest độc lập:

- `byte_sha256`: SHA-256 chính xác generated JSON bytes, gồm analysis ID/timestamp.
- `content_digest`: profile `fa-report-sorted-json/1`, core loại các field theo
  EvidenceReport.contentDigest; không thay bằng Jackson digest hay source SHA.

GET/download kiểm project, UUID/kind/parent references trong metadata, metadata SHA,
payload SHA, supported schema, semantic digest và report run_key/container SHA so
với persisted source reference. Corrupt/unsupported resource trả409, không regenerate
để tự sửa. GET list chỉ tải metadata giới hạn; full content integrity được kiểm khi
fetch/download resource, không ngầm chạy core cho từng row.

Core hiện xuất schema `vehicsim.failure-analysis/v1`, objective schema
`vehicsim.objective-analysis/v1`; formula/policy/build IDs nằm trong original envelope.
REST metadata schema riêng `vehicsim.fa-rest-resource/v1`. Đừng gọi schema v1 của
envelope là AEB baseline v1. HTTP response giữ original bytes; bộ list trả metadata,
không phải một report bị flatten.

Không rewrite historical `simulation_runs`, `failures`, `root_causes`, legacy
`analysis_results` hay dataset-v2 snapshots. Một source/core/context mới tạo resource
mới, không update report trước. Refresh đọc exact bytes đã persist.

Test đã kiểm canonical_value của cả ba objective so với actual CanonicalObjectiveReader,
bao gồm typed null, M/evaluation disagreements theo core; confirmed_root_cause UNKNOWN;
không file URI/server temp path; duplicate execution trả cùng report; reload qua một
service/repository mới đọc cùng bytes. MySQL test còn kiểm corruption, FK và rollback.
Xem08 để phân biệt HTTP test-double và live JDBC verification.
