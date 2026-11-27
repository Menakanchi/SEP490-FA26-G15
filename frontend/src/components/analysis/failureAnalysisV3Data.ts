/** Versioned REST boundary. Never normalizes evidence or recalculates metrics. */
export type RecordValue = Record<string, unknown>;
export type EvidenceValue = RecordValue & { value: unknown; status: string; unit: string | null };
export type Resource = RecordValue & { id: string; project_id: number; resource_kind: string; source_id: string | null; execution_id: string | null };
export type Source = Resource & { source_schema: string; status: string; created_at_utc: string; input_manifest: RecordValue; declared_member_identities: RecordValue[] };
export type Member = RecordValue & { member_index: number; run_key: string | null; status: string; reason_codes: string[]; report_id?: string };
export type Execution = Resource & { status: string; expected: number; accepted: number; analyzed: number; blocked: number; failed: number; missing: number; members: Member[]; handoff_id: string };
export type ReportMetadata = Resource & { member_index: number; run_key: string; run_identity: RecordValue; report_schema: string };
export type HandoffMetadata = Resource & { status: string; dispatch_allowed: boolean; content_digest: string | null; reason_codes: string[] };
export type ApprovedContext = { context_id: string; context_digest: string; source_id: string };
export type V3CampaignInput = {
  schema: "vehicsim.fa-v3-campaign/v1"; project_id: number; handoff_id: string; handoff_digest: string;
  scenario: { id: number; name: string; code?: string }; baseline: { id: number; label: string };
  reference: { vehicle_id: number; simulator: string; dt: number };
  optimization_run_ids: number[]; validation_run_ids: number[]; search_space: Record<string, [number, number]>;
};
export type ResourcePage<T> = { items: T[]; limit: number; offset: number };
export type DiagnosticReport = RecordValue & { schema_version: string; input: RecordValue & { run_key: string }; report: RecordValue & { physical_outcome: EvidenceValue; observed_behavior: EvidenceValue; objectives: Record<string, RecordValue & { canonical_value: EvidenceValue }> } };
export class FAError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) { super(message); }
}
export const object = (v: unknown): RecordValue => v !== null && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {};

/** Presentation only: symptoms, outcome and root cause remain independent claims. */
export function diagnosticPresentation(report: RecordValue) {
  const outcome = object(report.physical_outcome), behavior = object(report.observed_behavior);
  const assessment = object(report.functional_assessment);
  const usable = (e: RecordValue) => ["OBSERVED", "DERIVED", "CONDITIONAL"].includes(String(e.status));
  const outcomeLabels: Record<string, string> = { COLLISION: "Có va chạm", NEAR_MISS: "Suýt va chạm", SAFE: "Không ghi nhận va chạm" };
  const behaviorLabels: Record<string, string> = { AEB_COMMAND_ENGAGED: "Đã ghi nhận lệnh phanh", AEB_DECISION_PENDING: "Đã có quyết định, chưa ghi nhận lệnh phanh", NO_RECORDED_AEB_COMMAND: "Chưa ghi nhận lệnh phanh", COMMAND_ENGAGEMENT_UNRESOLVED: "Chưa xác định được lệnh phanh", OFF_HYPOTHETICAL_ONLY: "AEB tắt" };
  const names: Record<string, string> = { NO_BRAKING: "Không phanh", INEFFECTIVE_BRAKING: "Phanh không hiệu quả", FALSE_BRAKING: "Phanh không cần thiết" };
  const candidates = (Array.isArray(report.failure_candidates) ? report.failure_candidates : []).map(object)
    .filter(c => names[String(c.type)] && ["SUSPECTED", "SUPPORTED"].includes(String(c.status)))
    .map(c => ({ label: names[String(c.type)], supported: c.status === "SUPPORTED" }));
  const hasUnknownCandidates = Array.isArray(report.failure_candidates) && report.failure_candidates.length > candidates.length;
  const conclusion = candidates.length > 1 ? "Có nhiều dấu hiệu cần kiểm tra"
    : candidates.length === 1 ? (candidates[0].supported ? candidates[0].label : `Nghi ngờ ${candidates[0].label.toLocaleLowerCase("vi")}`)
    : hasUnknownCandidates ? "Chưa đủ dữ liệu kết luận"
    : assessment.value === "NO_SUPPORTED_FAILURE" && usable(assessment) ? "Chưa phát hiện lỗi có đủ bằng chứng"
    : assessment.value === "NOT_APPLICABLE" || behavior.value === "OFF_HYPOTHETICAL_ONLY" ? "Không đánh giá lỗi khi AEB tắt" : "Chưa đủ dữ liệu kết luận";
  const outcomeText = usable(outcome) ? (outcomeLabels[String(outcome.value)] ?? "Chưa xác định va chạm") + (outcome.status === "CONDITIONAL" ? " (cần xác minh)" : "") : "Chưa xác định va chạm";
  const behaviorText = usable(behavior) ? (behaviorLabels[String(behavior.value)] ?? "Chưa xác định hoạt động AEB") + (behavior.status === "CONDITIONAL" ? " (cần xác minh)" : "") : "Chưa xác định hoạt động AEB";
  const number = (v: unknown, unit: string) => { const e = object(v); return usable(e) && e.unit === unit && typeof e.value === "number" && Number.isFinite(e.value) && e.value >= 0 ? { value: e.value, conditional: e.status === "CONDITIONAL" } : null; };
  const timeline = object(report.aeb_timeline), impact = object(report.impact_analysis), objectives = object(report.objectives);
  const recorded = timeline.hypothetical !== true && behavior.value !== "OFF_HYPOTHETICAL_ONLY";
  const objective = (key: string, unit: string) => { const metric = object(objectives[key]); return metric.canonical_applicability === "APPLICABLE" ? number(metric.canonical_value, unit) : null; };
  const metrics = [
    { label: "Phát hiện mục tiêu", data: recorded ? number(timeline.detection, "s") : null, unit: "s" },
    { label: "Lệnh phanh AEB", data: recorded ? number(timeline.command_onset, "s") : null, unit: "s" },
    ...(outcome.value === "COLLISION" && usable(outcome) ? [{ label: "Va chạm thực tế", data: number(impact.contact_time, "s"), unit: "s" }, { label: "Tốc độ va chạm tương đối", data: objective("impact_speed_mps", "m/s"), unit: "m/s" }] : []),
    { label: "Quãng đường dừng", data: objective("stopping_distance_m", "m"), unit: "m" },
  ].filter((entry): entry is { label: string; data: { value: number; conditional: boolean }; unit: string } => entry.data !== null);
  const contactClock = object(impact.contact_time).clock_id, coreClock = object(timeline.command_onset).clock_id ?? object(timeline.detection).clock_id;
  const differentClocks = metrics.some(m => m.label === "Va chạm thực tế") && metrics.some(m => m.label === "Lệnh phanh AEB" || m.label === "Phát hiện mục tiêu") && (!contactClock || !coreClock || contactClock !== coreClock);
  return { conclusion, outcomeText, behaviorText, candidates, hasUnknownCandidates, metrics, differentClocks };
}

/** Display canonical producer values as-is, including unavailable and conditional states. */
export function objectivePresentation(report: RecordValue) {
  const objectives = object(report.objectives);
  return [
    { key: "rms_jerk_mps3", label: "RMS Jerk", unit: "m/s³" },
    { key: "impact_speed_mps", label: "Tốc độ va chạm tương đối", unit: "m/s" },
    { key: "stopping_distance_m", label: "Quãng đường dừng", unit: "m" },
  ].map(metric => {
    const source = object(objectives[metric.key]), value = object(source.canonical_value);
    let text = "Chưa xác định";
    if (value.status === "INVALID") text = "Dữ liệu không hợp lệ";
    else if (value.status === "CONFLICTING") text = "Dữ liệu mâu thuẫn";
    else if (value.status === "NOT_APPLICABLE" || source.canonical_applicability === "NOT_APPLICABLE") text = "N/A — Không áp dụng";
    else if (["OBSERVED", "DERIVED", "CONDITIONAL"].includes(String(value.status)) && source.canonical_applicability === "APPLICABLE" && value.unit === metric.unit && typeof value.value === "number" && Number.isFinite(value.value))
      text = `${value.value.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} ${metric.unit}${value.status === "CONDITIONAL" ? " · có điều kiện" : ""}`;
    return { ...metric, text };
  });
}

const missingLabels: Record<string, string> = {
  REQUIREMENT_UNAPPROVED: "Yêu cầu đánh giá chức năng đã được phê duyệt",
  APPROVED_REQUIREMENT: "Yêu cầu đánh giá chức năng đã được phê duyệt",
  PERFORMANCE_REQUIREMENT_UNAPPROVED: "Yêu cầu hiệu năng đã được phê duyệt",
  APPROVED_CLAIM_LOCAL_PREDICATES: "Các điều kiện đánh giá phù hợp với yêu cầu đã phê duyệt",
  ALL_REQUIRED_PREDICATES: "Đầy đủ các điều kiện để xác nhận lỗi",
  CALIBRATION_DOMAIN_UNKNOWN: "Xác nhận hiệu chuẩn cho điều kiện mô phỏng",
  VALIDATED_RESPONSE: "Đáp ứng phanh vật lý đã được xác thực",
  PHYSICAL_FEASIBILITY_UNCERTIFIED: "Chứng nhận khả năng tránh va chạm vật lý",
  P05_CERTIFICATE_MISSING: "Chứng nhận khả năng tránh va chạm vật lý",
  UNCERTAINTY_SET: "Phạm vi bất định đã được xác thực",
  EXHAUSTIVE_ACTION_CERTIFICATE: "Chứng nhận tập hành động hợp lệ",
  APPLIED_CONSUMED_COMMAND_MISSING: "Dấu vết lệnh thực sự được áp dụng",
  ATTRIBUTED_APPLIED_CONSUMED_COMMAND_TRACE: "Dấu vết lệnh thực sự được áp dụng và nguồn lệnh",
  CONTROL_WRITER_UNKNOWN: "Nguồn lệnh điều khiển thực sự",
  PHYSICS_CONSUMPTION_UNKNOWN: "Bằng chứng lệnh đã được áp dụng vào mô phỏng",
  OBSERVABILITY_UNPROVEN: "Bằng chứng mục tiêu có thể được phát hiện tại thời điểm liên quan",
  PRIMARY_EX_ANTE_DELIVERY_AND_REASON_TRACE: "Dấu vết phát hiện và lý do quyết định tại thời điểm can thiệp",
  PRIMARY_PREDICTION_INPUTS_MISSING: "Dữ liệu đầu vào dự đoán tại thời điểm ra quyết định",
  CAUTION_POLICY_UNAPPROVED: "Quy tắc đánh giá phanh nhầm đã được phê duyệt",
  ALL_ACTOR_REASON_COVERAGE_MISSING: "Dữ liệu đầy đủ về các mục tiêu và lý do phanh",
  CROSS_CLOCK_ACTOR_ALIGNMENT: "Đồng bộ đồng hồ và định danh đối tượng",
  APPROVED_CAUSAL_ADJUDICATION: "Đánh giá nguyên nhân đã được phê duyệt",
  CONTACT_COVERAGE_OR_APPROVED_ENCOUNTER_POLICY_MISSING: "Phạm vi ghi nhận tiếp xúc hoặc quy tắc đánh giá tình huống",
  FULL_BBOX_TRANSFORM: "Biến đổi hình học đầy đủ của phương tiện và mục tiêu",
  VALIDATED_GEOMETRY_UNCERTAINTY: "Độ bất định hình học đã được xác thực",
  CORE_BINARY_MISMATCH_OR_MISSING: "Thông tin phiên bản lõi phù hợp giữa hai lượt đối chứng",
};

/** Restrict UI to documented reason categories; leave unknown codes in the saved report. */
export function missingEvidencePresentation(report: RecordValue): string[] {
  const reasons: unknown[] = Array.isArray(report.inconclusive_reasons) ? [...report.inconclusive_reasons] : [];
  for (const candidate of [...(Array.isArray(report.failure_candidates) ? report.failure_candidates : []), ...(Array.isArray(report.root_cause_hypotheses) ? report.root_cause_hypotheses : []), ...(Array.isArray(report.evidence_sufficiency) ? report.evidence_sufficiency : [])]) {
    const item = object(candidate);
    for (const key of ["missing_evidence", "missing"]) if (Array.isArray(item[key])) reasons.push(...item[key]);
  }
  return [...new Set(reasons.filter((code): code is string => typeof code === "string").map(code => missingLabels[code]).filter(Boolean))];
}

/** The displayed hypotheses keep their backend status; candidates never establish a cause. */
export function hypothesisPresentation(report: RecordValue) {
  const labels: Record<string, string> = {
    NO_BRAKING_MECHANISM_INVESTIGATION: "Chuỗi phát hiện và can thiệp chưa ghi nhận phanh",
    INEFFECTIVE_BRAKING_MECHANISM_INVESTIGATION: "Thời điểm can thiệp và đáp ứng phanh",
    FALSE_BRAKING_MECHANISM_INVESTIGATION: "Dự đoán nguy cơ và quyết định phanh",
  };
  const statuses: Record<string, string> = { SUSPECTED: "Cần điều tra", INCONCLUSIVE: "Chưa đủ căn cứ", SUPPORTED: "Có bằng chứng hỗ trợ", CONFIRMED: "Đã xác nhận" };
  return (Array.isArray(report.root_cause_hypotheses) ? report.root_cause_hypotheses : []).map(object)
    .map(h => ({ label: labels[String(h.type)] ?? "Giả thuyết nguyên nhân cần điều tra", status: statuses[String(h.status)] ?? "Chưa xác định", type: String(h.type) }));
}
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
  if (typeof r.dispatch_allowed !== "boolean" || !["BLOCKED", "DIAGNOSTIC_ONLY", "READY"].includes(String(r.status))
      || r.dispatch_allowed !== (r.status === "READY")
      || !(r.content_digest === null || typeof r.content_digest === "string" && /^[a-f0-9]{64}$/.test(r.content_digest))
      || r.dispatch_allowed && (!r.content_digest || !uuid(r.context_id))
      || !Array.isArray(r.reason_codes) || !r.reason_codes.every(code => typeof code === "string")
      || r.dispatch_allowed && r.reason_codes.length !== 0) invalid("bàn giao");
  return r as HandoffMetadata;
}
export function approvedContext(v: unknown): ApprovedContext {
  const r = object(v);
  if (!uuid(r.context_id) || !uuid(r.source_id) || typeof r.context_digest !== "string" || !/^[a-f0-9]{64}$/.test(r.context_digest)) invalid("context đã xác nhận");
  return r as ApprovedContext;
}
/** Validate server projection; never replace missing V3 data with a V2 dataset or default domain. */
export function campaignInput(v: unknown, project: number, key: string, digest: string): V3CampaignInput {
  const r = object(v), scenario = object(r.scenario), baseline = object(r.baseline), reference = object(r.reference);
  const ids = (value: unknown): value is number[] => Array.isArray(value) && value.length > 0 && value.length <= 500 && value.every(x => integer(x) && x > 0);
  const opt = r.optimization_run_ids, val = r.validation_run_ids, bounds = object(r.search_space);
  const codes = ["TTC_THRESHOLD", "BRAKE_ACTIVATION_DELAY", "MAX_DECELERATION", "BRAKE_BUILDUP_RATE"];
  if (r.schema !== "vehicsim.fa-v3-campaign/v1" || r.project_id !== project || !uuid(key) || r.handoff_id !== key
      || !/^[a-f0-9]{64}$/.test(digest) || r.handoff_digest !== digest
      || !integer(scenario.id) || scenario.id < 1 || typeof scenario.name !== "string"
      || !integer(baseline.id) || baseline.id < 1 || typeof baseline.label !== "string"
      || !integer(reference.vehicle_id) || reference.vehicle_id < 1 || typeof reference.simulator !== "string"
      || !(reference.simulator.startsWith("carla-") || reference.simulator.startsWith("vehicsim-kinematic-"))
      || typeof reference.dt !== "number" || !Number.isFinite(reference.dt) || reference.dt <= 0
      || !ids(opt) || !ids(val) || new Set([...opt, ...val]).size !== opt.length + val.length
      || Object.keys(bounds).length !== codes.length || !codes.every(code => {
        const pair = bounds[code];
        return Array.isArray(pair) && pair.length === 2 && pair.every(x => typeof x === "number" && Number.isFinite(x)) && pair[0] < pair[1];
      })) invalid("nguồn campaign V3");
  return r as unknown as V3CampaignInput;
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
