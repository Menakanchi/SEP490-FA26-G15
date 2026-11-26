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
export const failureAnalysisV3 = {
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
