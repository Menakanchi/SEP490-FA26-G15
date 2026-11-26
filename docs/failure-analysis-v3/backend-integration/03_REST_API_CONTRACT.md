# BE-R1 — REST contract cho FE-R4

> **Cập nhật 26/11/2026 (khi gộp vào `main`, commit `f5f6b18`, [ADR-067](../../adr/ADR-067-api-failure-analysis-v3-va-4-bang-fa-json.md)):**
> dạng lỗi đổi từ `{"error":{"code","module","retryable"}}` sang `{"code","detail","retryable"}` ở cấp ngoài cùng, cùng
> dạng với `ApiExceptionHandler`. Lỗi chung (404/400 không thuộc module, 403/429 của `VehicSimAccess`) không còn đổi thành
> `FA_ACCESS_OR_REQUEST_REJECTED` / `FA_INTERNAL_ERROR` mà trả theo luật chung. Kiểu `FAError` và dòng "500 unexpected
> sanitized FA error" bên dưới là bản trước cập nhật; route và mã lỗi riêng của module giữ nguyên.

Base: `/api/v1/vehicsim/analysis/v3`. Tất cả route cần Bearer authentication và
project context hiện hành qua `ProjectAccess`/`X-VehicSim-Project`.
ADMIN/ENGINEER/EXPERIENCER được mutation, qua `requireEngineer` và `limitWrites`.
Các role được đọc trong project mà shared access policy cho phép. Không sửa auth.
Hai mutation còn yêu cầu project ACTIVE và workspace ACTIVE khi có workspace;
FA repository kiểm lại state với row locks trong transaction. Shared policy vẫn
quyết định quyền đọc lịch sử; đây không là thay đổi toàn cục về archived access.

| Method/path tương đối | Request | Response |
|---|---|---|
| GET `/sources` | limit 1..20 (default20), offset 0..10000 | ResourcePage<Source> |
| POST `/sources` | `application/json`, raw result/collection bytes; optional `X-Source-SHA256` lowercase64hex | 201 Source; exact duplicate cũng 201 với cùng ID |
| GET `/sources/{id}` | UUID | Source + current identity peers |
| GET `/sources/{id}/download` | UUID | Exact original JSON bytes |
| POST `/sources/{id}/executions` | **Không body**; optional `context_id` hiện bị chặn | 201 Execution đã commit; retry cùng determinants trả cùng ID |
| GET `/executions` | optional source_id; limit/offset | ResourcePage<Execution> |
| GET `/executions/{id}` | UUID | Stored Execution metadata |
| GET `/executions/{id}/reports` | limit/offset | ResourcePage<ReportMetadata> |
| GET `/reports/{id}` | UUID | Exact DiagnosticReport JSON |
| GET `/reports/{id}/download` | UUID | Cùng bytes, attachment |
| GET `/handoffs/{id}` | UUID | Stored HandoffMetadata/status/blockers/compatibility |
| GET `/handoffs/{id}/download` | UUID | Exact builder JSON; 409 nếu chưa tạo |

Downloads đặt application/json, private/no-store và filename do server tạo từ UUID;
không nhận filename/path/URL của client. Legacy routes và dataset-v2 handoff giữ nguyên.
GET không chạy lại adapter/core. Không có job/progress/cancel/optimizer endpoint.

Typed contract (các object evidence sâu giữ đúng schema core, không flatten):

```ts
type UUID = string;
type SHA256 = string;
interface Resource {
  resource_schema: 'vehicsim.fa-rest-resource/v1';
  resource_kind: 'SOURCE'|'EXECUTION'|'REPORT'|'HANDOFF';
  id: UUID; project_id: number; source_id: UUID|null; execution_id: UUID|null;
  created_at_utc: string; byte_sha256: SHA256|null;
}
interface ResourcePage<T> { items: T[]; limit: number; offset: number }
interface Source extends Resource {
  source_schema: 'vehicsim.result/v1'|'vehicsim.run-collection/v1';
  source_sha256: SHA256; size_bytes: number; uploaded_by: number;
  status: 'COMPLETE'|'PARTIAL_OR_BLOCKED'; producer_authenticity: 'UNVERIFIED';
  freshness: 'UNKNOWN_NO_AUTHORITATIVE_COHORT'; reason_codes: string[];
  input_manifest: object; declared_member_identities: object[];
  producer_metadata: object[]; transport_expected_sha256: SHA256|null;
  identity_disagreement?: 'NONE_DETECTED'|'UNKNOWN_IDENTITY_INCOMPLETE'|
    'SAME_DECLARED_IDENTITY_DIFFERENT_BYTES'; other_source_ids?: UUID[];
}
interface Execution extends Resource {
  status: 'COMPLETED'|'PARTIAL'|'BLOCKED'; core_version: string;
  source_sha256: SHA256; context_id: null; context_digest: SHA256;
  context_policy: 'UNKNOWN_DEFAULT_NO_AUTHORITY';
  expected: number; accepted: number; analyzed: number;
  blocked: number; failed: number; missing: number;
  missing_is_subset_of_blocked: true;
  members: Array<{member_index:number; run_key:string|null;
    json_pointer:string; status:'ANALYZABLE'|'BLOCKED'|'ANALYZED'|'FAILED';
    reason_codes:string[]; issues:object[]; report_id?:UUID}>;
  input_manifest: object; handoff_id: UUID; runtime_ms: number;
  completeness_scope: 'DELIVERED_MANIFEST_ONLY_NOT_FROZEN_SCENARIO_COHORT';
}
interface ReportMetadata extends Resource {
  member_index:number; run_key:string; run_identity:object;
  report_schema:'vehicsim.failure-analysis/v1'; content_digest:SHA256;
  status:'GENERATED'; evidence_sufficiency:object[];
  core_version:string; context_id:null; context_digest:SHA256; source_sha256:SHA256;
}
interface HandoffMetadata extends Resource {
  status:'BLOCKED'|'DIAGNOSTIC_ONLY'; dispatch_allowed:false;
  handoff_schema:'vehicsim.failure-analysis-mobo-handoff/v1'|null;
  content_digest:SHA256|null; reason_codes:string[];
  consumer_compatibility:object|null;
  core_version:string; context_id:null; context_digest:SHA256; source_sha256:SHA256;
}
interface FAError {error:{code:string;module:'FAILURE_ANALYSIS';retryable:boolean}}
```

Source list returns persisted metadata; optional identity_disagreement/peers are
resolved on source detail/ingest. Error resource codes: 400 bad hash/pagination/body,
401 unauthenticated, 403 role/project policy, 404 absent/cross-project/invalid UUID,
409 stored integrity/version/context unavailable or handoff absent, 413 resource
budget, 422 unsupported/malformed input or supplied hash mismatch, 429 write/compute
capacity, 503 storage/IO unavailable, 500 unexpected sanitized FA error.
Shared security/project errors can retain the shared transport envelope; callers
must also handle ordinary HTTP status. No stack trace/absolute server path returned.
`FA_PROJECT_OR_WORKSPACE_READ_ONLY` là403 cho hai mutation khi state thiếu/khác ACTIVE.

Actual HTTP responses from tests are in `evidence/examples/http-*.json`, not invented
sample values. Request sequence: POST sources with real collection1033 raw bytes;
POST sources/{source.id}/executions with empty body; GET executions/{id}/reports;
GET reports/{report.id}; GET handoffs/{execution.handoff_id} and `/download`.
IDs/timestamps are test resources, not DB IDs to reuse in another environment.

FE-R4 integration: retain current shared authenticated transport/project header;
do not use producer project_id as authorization. Select source → POST execution →
list reports → fetch selected report. Show input/execution completion separately
from claim sufficiency and handoff readiness. Render objective canonical_value.value
with unit/status; preserve null, separate contact impact and legacy collision.
Use source/report UUID download routes for evidence; never open producer file paths.
Do not submit a baseline/approval/partition form to this API. `context_id` returns
409 until an independently authorized registry is implemented in a separate task.
Do not call legacy optimization endpoints to bypass dispatch_allowed=false.
FE-R4 itself is NOT_IMPLEMENTED by BE-R1.
