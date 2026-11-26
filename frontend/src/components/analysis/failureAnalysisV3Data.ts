/** Versioned REST boundary. Never normalizes evidence or recalculates metrics. */
export type RecordValue = Record<string, unknown>;
export type EvidenceValue = RecordValue & { value: unknown; status: string; unit: string | null };
export type Resource = RecordValue & { id: string; project_id: number; resource_kind: string; source_id: string | null; execution_id: string | null };
export type Source = Resource & { source_schema: string; status: string; created_at_utc: string; input_manifest: RecordValue; declared_member_identities: RecordValue[] };
export type Member = RecordValue & { member_index: number; run_key: string | null; status: string; reason_codes: string[]; report_id?: string };
export type Execution = Resource & { status: string; expected: number; accepted: number; analyzed: number; blocked: number; failed: number; missing: number; members: Member[]; handoff_id: string };
export type ReportMetadata = Resource & { member_index: number; run_key: string; run_identity: RecordValue; report_schema: string };
export type HandoffMetadata = Resource & { status: string; dispatch_allowed: false; content_digest: string | null; reason_codes: string[] };
export type ResourcePage<T> = { items: T[]; limit: number; offset: number };
export type DiagnosticReport = RecordValue & { schema_version: string; input: RecordValue & { run_key: string }; report: RecordValue & { physical_outcome: EvidenceValue; observed_behavior: EvidenceValue; objectives: Record<string, RecordValue & { canonical_value: EvidenceValue }> } };
export class FAError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) { super(message); }
}
export const object = (v: unknown): RecordValue => v !== null && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {};
export const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const invalid = (what: string): never => { throw new FAError("MALFORMED_RESOURCE", `Dữ liệu ${what} không đúng hợp đồng; chưa thể hiển thị kết luận.`); };
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function evidence(v: unknown): EvidenceValue {
  const r = object(v);
  if (!Object.hasOwn(r, "value") || !["OBSERVED", "DERIVED", "CONDITIONAL", "UNKNOWN", "INVALID", "CONFLICTING", "NOT_APPLICABLE"].includes(String(r.status)) || !(r.unit === null || typeof r.unit === "string") || (typeof r.value === "number" && !Number.isFinite(r.value))) invalid("bằng chứng");
  return r as EvidenceValue;
}
export function resource(v: unknown, kind: string, project: number): Resource {
  const r = object(v);
  if (r.resource_schema !== "vehicsim.fa-rest-resource/v1" || r.resource_kind !== kind || !uuid(r.id) || r.project_id !== project) invalid("định danh/phạm vi dự án");
  if (![r.source_id, r.execution_id].every(id => id === null || uuid(id))) invalid("liên kết tài nguyên");
  return r as Resource;
}
export function source(v: unknown, project: number): Source {
  const r = resource(v, "SOURCE", project);
  if (!["vehicsim.run-collection/v1", "vehicsim.result/v1"].includes(String(r.source_schema)) || typeof r.status !== "string" || typeof r.created_at_utc !== "string" || !Array.isArray(r.declared_member_identities) || !r.declared_member_identities.every(v => v !== null && typeof v === "object" && !Array.isArray(v)) || !Object.keys(object(r.input_manifest)).length) invalid("nguồn");
  return r as Source;
}
export function execution(v: unknown, project: number): Execution {
  const r = resource(v, "EXECUTION", project);
  const keys = ["expected", "accepted", "analyzed", "blocked", "failed", "missing"];
  if (!keys.every(k => integer(r[k])) || !uuid(r.source_id) || !uuid(r.handoff_id) || !["COMPLETED", "PARTIAL", "BLOCKED"].includes(String(r.status)) || r.missing_is_subset_of_blocked !== true || !Array.isArray(r.members)) invalid("lần phân tích");
  const e = r as Execution;
  if (e.expected !== e.analyzed + e.failed + e.blocked || e.accepted !== e.analyzed + e.failed || e.missing > e.blocked || e.members.length !== e.expected) invalid("kiểm đếm thành viên");
  const indices = new Set<number>();
  const reports = new Set<string>();
  for (const item of e.members) {
    if (item === null || typeof item !== "object") invalid("thành viên");
    if (!integer(item.member_index) || indices.has(item.member_index) || !(item.run_key === null || typeof item.run_key === "string") || !["ANALYZABLE", "ANALYZED", "BLOCKED", "FAILED"].includes(item.status) || !Array.isArray(item.reason_codes) || (item.report_id !== undefined && !uuid(item.report_id))) invalid("thành viên");
    indices.add(item.member_index);
    if (item.status === "ANALYZED" && !uuid(item.report_id)) invalid("báo cáo thành viên");
    if (item.report_id) { if (reports.has(item.report_id)) invalid("báo cáo trùng thành viên"); reports.add(item.report_id); }
  }
  if (e.members.filter(m => m.status === "ANALYZED").length !== e.analyzed || e.members.filter(m => m.status === "FAILED").length !== e.failed || e.members.filter(m => m.status === "BLOCKED").length !== e.blocked) invalid("trạng thái thành viên/kiểm đếm");
  return e;
}
export function reportMetadata(v: unknown, project: number): ReportMetadata {
  const r = resource(v, "REPORT", project);
  if (!integer(r.member_index) || typeof r.run_key !== "string" || r.report_schema !== "vehicsim.failure-analysis/v1" || !uuid(r.execution_id) || !uuid(r.source_id)) invalid("tham chiếu báo cáo");
  return r as ReportMetadata;
}
export function handoff(v: unknown, project: number): HandoffMetadata {
  const r = resource(v, "HANDOFF", project);
  if (r.dispatch_allowed !== false || !["BLOCKED", "DIAGNOSTIC_ONLY"].includes(String(r.status)) || !(r.content_digest === null || typeof r.content_digest === "string") || !Array.isArray(r.reason_codes)) invalid("bàn giao");
  return r as HandoffMetadata;
}
export function page<T>(v: unknown, parse: (item: unknown) => T): ResourcePage<T> {
  const r = object(v);
  if (!integer(r.offset) || !integer(r.limit) || r.limit < 1 || r.limit > 20 || !Array.isArray(r.items) || r.items.length > r.limit) invalid("phân trang");
  return { items: (r.items as unknown[]).map(parse), limit: r.limit as number, offset: r.offset as number };
}
export const objectiveKeys = ["rms_jerk_mps3", "impact_speed_mps", "stopping_distance_m"] as const;
export function diagnostic(v: unknown): DiagnosticReport {
  const r = object(v);
  if (typeof r.schema_version !== "string") invalid("báo cáo");
  if (r.schema_version !== "vehicsim.failure-analysis/v1") throw new FAError("UNSUPPORTED_REPORT_SCHEMA", "Phiên bản báo cáo chưa được giao diện hỗ trợ. Có thể tải bản gốc để kiểm tra.");
  const input = object(r.input), report = object(r.report), objectives = object(report.objectives);
  if (typeof input.run_key !== "string" || input.metric_aggregation_version !== "adr040-stored-aggregation/1") invalid("metric/định danh báo cáo");
  evidence(report.physical_outcome); evidence(report.observed_behavior);
  for (const k of objectiveKeys) {
    const o = object(objectives[k]), canonical = evidence(o.canonical_value);
    if (o.aggregation_version !== "adr040-stored-aggregation/1" || !(canonical.value === null || typeof canonical.value === "number")) invalid("objective canonical");
  }
  if (![report.failure_candidates, report.root_cause_hypotheses, report.evidence_sufficiency, report.inconclusive_reasons].every(Array.isArray)) invalid("kết luận báo cáo");
  return r as DiagnosticReport;
}
export function matchReport(report: DiagnosticReport, meta: ReportMetadata, exec: Execution): void {
  if (report.input.run_key !== meta.run_key || meta.execution_id !== exec.id || meta.source_id !== exec.source_id || !exec.members.some(m => m.member_index === meta.member_index && m.run_key === meta.run_key && m.report_id === meta.id)) invalid("liên kết run/báo cáo");
}
export const errorMessage = (status?: number) => ({400:"Yêu cầu chưa hợp lệ. Kiểm tra liên kết hoặc tải lại dữ liệu.",401:"Phiên đăng nhập hết hạn. Đăng nhập lại để tiếp tục.",403:"Không được phép thực hiện thao tác. Kiểm tra quyền và trạng thái dự án/workspace; vẫn có thể xem lịch sử khi được phép.",404:"Không tìm thấy tài nguyên trong dự án đang chọn.",409:"Backend chặn thao tác do xung đột hoặc tài nguyên chưa sẵn sàng. Kiểm tra chi tiết nguồn/bàn giao.",413:"Dữ liệu vượt giới hạn tiếp nhận của backend. Nhờ Module 2 xuất gói nhỏ hơn.",422:"JSON hoặc bằng chứng đầu vào không hợp lệ. Kiểm tra bản xuất từ Module 2.",429:"Quá nhiều yêu cầu. Chờ rồi chủ động thử lại; hệ thống không tự gửi lại.",500:"Backend gặp lỗi nội bộ. Giữ nguyên dữ liệu và liên hệ người phụ trách.",503:"Kho dữ liệu hoặc dịch vụ chưa sẵn sàng. Thử tải lại sau."} as Record<number,string>)[status ?? 0] ?? "Chưa kết nối được dịch vụ. Kiểm tra kết nối rồi chủ động thử lại.";
export function evidenceText(v: unknown): string {
  const e = object(v);
  const value = e.value;
  return `${value === null || value === undefined ? "Chưa có giá trị" : typeof value === "object" ? JSON.stringify(value) : String(value)}${e.unit ? ` ${e.unit}` : ""} · ${typeof e.status === "string" ? e.status : "UNKNOWN"}`;
}
