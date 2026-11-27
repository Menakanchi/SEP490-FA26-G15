import { apiRequest, apiBlob, ApiError } from "./api";
import { FAError, uuid, source, execution, reportMetadata, handoff, approvedContext, campaignInput, page, diagnostic, errorMessage, type Resource } from "@/components/analysis/failureAnalysisV3Data";
import { databasePage, databaseInspection, databaseId, type DatabaseKind } from "@/components/analysis/failureAnalysisDatabaseData";

const base = "/vehicsim/analysis/v3";
const id = (value: string) => { if (!uuid(value)) throw new FAError("INVALID_RESOURCE_ID", "Liên kết tài nguyên không hợp lệ."); return value; };
const bound = <T extends Resource>(key: string, value: T): T => {
  if (value.id.toLowerCase() !== key.toLowerCase()) throw new FAError("IDENTITY_MISMATCH", "Tài nguyên trả về không khớp định danh được yêu cầu.");
  return value;
};
async function request<T>(path: string, parse: (body: unknown) => T, options?: RequestInit): Promise<T> {
  try { return parse(await apiRequest<unknown>(base + path, options)); }
  catch (error) {
    if (error instanceof FAError) throw error;
    if (error instanceof SyntaxError) throw new FAError("MALFORMED_RESOURCE", "Backend trả về JSON không hợp lệ; chưa thể đọc tài nguyên.");
    if (error instanceof ApiError) throw new FAError(error.code ?? "HTTP_REASON_UNAVAILABLE", errorMessage(error.status), error.status);
    throw new FAError("TRANSPORT_UNAVAILABLE", errorMessage());
  }
}
export type ExplorerMetric = { value: number | null; status: string; unit: string | null; applicability: string | null };
export type ExplorerScenario = { scenario_id: number; code: string; name: string; category: string; variant_count: number; analyzed_count: number; confirmed_count: number | null; suspected_count: number; no_failure_count: number | null; unknown_count: number };
export type ExplorerRun = { scenario_id: number; scenario_version_id: number; version_no: number; run_id: number; random_seed: number | null; repetition: number | null; attempt: number; simulator_type: string; simulator_version: string; aeb_mode: string; status: string; report_id: string | null; execution_id: string | null; analysis_status: string; classification: string; physical_outcome: string; failure_candidates: { type: string; status: string }[]; root_cause_hypotheses: { type: string; status: string }[]; objectives: Record<string, ExplorerMetric> };
export type ExplorerVariant = { scenario_id: number; scenario_version_id: number; version_no: number; run_count: number };
export type ExplorerPage<T> = { project_id: number; items: T[]; total: number; limit: number; offset: number; summary?: Record<string, number | null> };
function explorerPage<T>(v: unknown, project: number, scenario?: number): ExplorerPage<T> {
  const r = v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const validInt = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (r.project_id !== project || !Array.isArray(r.items) || !validInt(r.total) || !validInt(r.offset) || !validInt(r.limit) || Number(r.limit) < 1 || r.items.length > Number(r.limit))
    throw new FAError("MALFORMED_EXPLORER", "Dữ liệu danh sách không đúng phạm vi hoặc định dạng.");
  for (const item of r.items) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !validInt(item.scenario_id) || Number(item.scenario_id) < 1 || scenario !== undefined && item.scenario_id !== scenario)
      throw new FAError("EXPLORER_IDENTITY_MISMATCH", "Dữ liệu danh sách không khớp họ kịch bản.");
  }
  return r as ExplorerPage<T>;
}
export const failureAnalysisV3 = {
  explorerScenarios: (project: number, query: URLSearchParams) => request(`/explorer/scenarios?${query}`, v => explorerPage<ExplorerScenario>(v, project)),
  explorerRuns: (project: number, scenario: number, query: URLSearchParams) => request(`/explorer/scenarios/${databaseId(scenario)}/runs?${query}`, v => explorerPage<ExplorerRun>(v, project, scenario)),
  explorerVariants: (project: number, scenario: number, query: URLSearchParams) => request(`/explorer/scenarios/${databaseId(scenario)}/variants?${query}`, v => explorerPage<ExplorerVariant>(v, project, scenario)),
  createContext: (body: { dataset_id: number; dataset_digest: string; confirmed: true; reason: string; canonical_targets_only: true; calibration_not_applicable: true; nonhazard_run_ids: number[]; search_space?: Record<string, [number, number]> }) =>
    request("/contexts", approvedContext, { method: "POST", body: JSON.stringify(body) }),
  analyzeContext: (project: number, key: string) => request(`/contexts/${id(key)}/executions`, value => {
    const result = execution(value, project);
    if (result.context_id !== key) throw new FAError("CONTEXT_IDENTITY_MISMATCH", "Lần phân tích không khớp context đã xác nhận.");
    return result;
  }, { method: "POST" }),
  campaign: (project: number, key: string, digest: string) => {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new FAError("HANDOFF_DIGEST_REQUIRED", "Liên kết cần checksum handoff V3. Mở lại từ Phân tích lỗi.");
    return request(`/handoffs/${id(key)}/campaign?digest=${digest}`, value => campaignInput(value, project, key, digest));
  },
  databaseList: (project: number, kind: DatabaseKind, offset = 0) => request(`/database/${kind}?limit=20&offset=${offset}`, v => databasePage(v, project, kind)),
  databaseInspect: async (project: number, kind: DatabaseKind, key: number) => request(`/database/${kind}/${databaseId(key)}`, v => databaseInspection(v, project, kind, key)),
  databaseAnalyze: async (project: number, kind: DatabaseKind, key: number, hash: string) => {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new FAError("DATABASE_INSPECTION_REQUIRED", "Kiểm tra lại nguồn dữ liệu trước khi phân tích.");
    return request(`/database/${kind}/${databaseId(key)}/executions?source_sha256=${hash}`, v => execution(v, project), { method: "POST" });
  },
  sources: (project: number, offset = 0) => request(`/sources?limit=20&offset=${offset}`, v => page(v, x => source(x, project))),
  source: (project: number, key: string) => request(`/sources/${id(key)}`, v => bound(key, source(v, project))),
  upload: (project: number, file: File) => request("/sources", v => source(v, project), { method: "POST", body: file }),
  analyze: (project: number, key: string) => request(`/sources/${id(key)}/executions`, v => { const e = execution(v, project); if (e.source_id?.toLowerCase() !== key.toLowerCase()) throw new FAError("IDENTITY_MISMATCH", "Lần phân tích trả về không khớp nguồn đã chọn."); return e; }, { method: "POST" }),
  executions: (project: number, key: string, offset = 0) => request(`/executions?source_id=${id(key)}&limit=20&offset=${offset}`, v => page(v, x => execution(x, project))),
  execution: async (project: number, key: string) => request(`/executions/${id(key)}`, v => bound(key, execution(v, project))),
  reports: async (project: number, key: string, offset = 0) => request(`/executions/${id(key)}/reports?limit=20&offset=${offset}`, v => page(v, x => reportMetadata(x, project))),
  report: (key: string) => request(`/reports/${id(key)}`, diagnostic),
  handoff: (project: number, key: string) => request(`/handoffs/${id(key)}`, v => bound(key, handoff(v, project))),
  async download(kind: "sources" | "reports" | "handoffs", key: string): Promise<Blob> {
    try {
      const blob = await apiBlob(`${base}/${kind}/${id(key)}/download`);
      if (blob.type.split(";")[0].toLowerCase() !== "application/json" || !blob.size) throw new FAError("INVALID_DOWNLOAD", "Backend chưa trả về tệp JSON hợp lệ; không tạo tệp thay thế.");
      return blob;
    } catch (error) {
      if (error instanceof FAError) throw error;
      if (error instanceof ApiError) throw new FAError(error.code ?? "HTTP_REASON_UNAVAILABLE", errorMessage(error.status), error.status);
      throw new FAError("TRANSPORT_UNAVAILABLE", errorMessage());
    }
  },
};
