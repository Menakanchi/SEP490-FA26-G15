/**
 * API Client — Kết nối FastAPI Backend
 *
 * Base URL đọc từ env `NEXT_PUBLIC_API_URL`, mặc định `http://localhost:8000/api/v1`.
 */

import type {
  GenerationStatus,
  ReviewRequest,
  ReviewResponse,
  ScenarioDetail,
  ScenarioItem,
  ScenarioStatus,
  ODDPayload,
  QualityReport,
  ControllerRunsResponse,

  CampaignDetail,
  CampaignControllerBatchResponse,
  CampaignControllerSummary,
  CampaignReviewResponse,
  CampaignSummary,
  LabelQueueItem,
  TuningSummary,
  TuneStepResponse,
} from "@/types";
import type { ApiUser, SessionResponse, User } from "@/types/auth";

const getBaseUrl = (): string => {
  const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const trimmed = rawBaseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
};

const BASE_URL = getBaseUrl();

// ---------------------------------------------------------------------------
// Access token (JWT) — lưu trong localStorage, gắn vào MỌI request
// ---------------------------------------------------------------------------

const ACCESS_TOKEN_KEY = "vehicsim_access_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // Trình duyệt chặn storage (chế độ riêng tư): phiên chỉ sống trong tab này.
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lỗi HTTP có mã trạng thái, để nơi gọi phân biệt 401 (hết phiên) với lỗi khác. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Tải file (CSV…) từ API có kèm token rồi cho trình duyệt lưu. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(`API ${res.status}: ${res.statusText}`, res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { request as apiRequest };

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    let messageVi = "";
    try {
      const json = JSON.parse(bodyText);
      if (typeof json.detail === "string") {
        messageVi = json.detail;
      } else if (Array.isArray(json.detail)) {
        messageVi = json.detail
          .map((d: Record<string, unknown> | string) => {
            if (typeof d === "string") return d;
            if (d && typeof d === "object") {
              const locArr = (d as { loc?: unknown[] }).loc;
              const field = Array.isArray(locArr) ? locArr.slice(1).join(".") : "";
              const msg = (d as { msg?: string }).msg || JSON.stringify(d);
              return field ? `${field}: ${msg}` : msg;
            }
            return String(d);
          })
          .join("; ");
      } else if (json.detail && typeof json.detail === "object") {
        messageVi = json.detail.msg || json.detail.message || JSON.stringify(json.detail);
      } else {
        messageVi = json.message_vi || json.message || "";
      }
    } catch {
      messageVi = typeof bodyText === "string" ? bodyText : "";
    }
    throw new ApiError(
      messageVi || `API ${res.status}: ${res.statusText}`,
      res.status,
    );
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// POST /generate — Gửi prompt sinh kịch bản
// ---------------------------------------------------------------------------

export interface GeneratePayload {
  prompt: string;
  limit?: number;
  created_by?: string;
  force_generate?: boolean;
  validation_mode?: "static" | "sim";
}

export interface GenerateDuplicateMatch {
  scenario_id?: string | null;
  scenario_status?: ScenarioStatus | null;
  title?: string | null;
  reason?: string | null;
  request_status?: string | null;
}

export interface GenerateResponse {
  request_id: string | null;
  duplicate?: GenerateDuplicateMatch | null;
}

export async function postGenerate(
  payload: GeneratePayload,
): Promise<GenerateResponse> {
  return request<GenerateResponse>("/scenarios/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// GET /status/{id} — Polling trạng thái sinh
// ---------------------------------------------------------------------------

export async function getStatus(requestId: string): Promise<GenerationStatus> {
  return request<GenerationStatus>(`/status/${encodeURIComponent(requestId)}`);
}

// ---------------------------------------------------------------------------
// POST /scenarios/{id}/review hoặc POST /review — Gửi quyết định duyệt
// ---------------------------------------------------------------------------

export async function postReview(
  payloadOrId: ReviewRequest | string,
  maybePayload?: Partial<ReviewRequest>,
): Promise<ReviewResponse> {
  const payload: ReviewRequest =
    typeof payloadOrId === "string"
      ? ({ scenario_id: payloadOrId, ...maybePayload } as ReviewRequest)
      : payloadOrId;

  const scenarioId = payload.scenario_id || (typeof payloadOrId === "string" ? payloadOrId : "");
  const notes = (payload as unknown as Record<string, unknown>).notes;
  const cleanBody: Record<string, unknown> = {
    scenario_id: scenarioId,
    gate: payload.gate,
    approved: Boolean(payload.approved),
    reviewer: payload.reviewer || "Reviewer",
    reason: payload.reason || (typeof notes === "string" ? notes : "") || "",
  };

  if (payload.force_simulate) {
    cleanBody.force_simulate = true;
  }
  if (payload.force_intent_override) {
    cleanBody.force_intent_override = true;
  }

  return request<ReviewResponse>(`/scenarios/${encodeURIComponent(scenarioId)}/review`, {
    method: "POST",
    body: JSON.stringify(cleanBody),
  });
}

export const reviewScenario = postReview;

// ---------------------------------------------------------------------------
// GET /library/search — Danh sách kịch bản (có lọc ODD & keyword)
// ---------------------------------------------------------------------------

export interface GetScenariosParams {
  search?: string;
  odd?: ODDPayload;
  scope?: "public" | "me" | "all";
  user?: string;
  reviewQueue?: boolean;
  page?: number;
  limit?: number;
}

export async function getScenarios(
  params?: GetScenariosParams,
): Promise<{ items: ScenarioItem[]; total: number }> {
  const query = new URLSearchParams();

  if (params?.search) query.set("search", params.search);
  if (params?.scope) query.set("scope", params.scope);
  if (params?.user) query.set("user", params.user);
  if (params?.reviewQueue) query.set("review_queue", "true");
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));

  if (params?.odd) {
    for (const [key, val] of Object.entries(params.odd)) {
      if (val) query.set(key, val);
    }
  }

  const qs = query.toString();
  return request<{ items: ScenarioItem[]; total: number }>(
    `/library/search${qs ? `?${qs}` : ""}`,
  );
}

// ---------------------------------------------------------------------------
// Draft & CRUD API
// ---------------------------------------------------------------------------

export interface DraftPayload {
  title?: string;
  description_vi: string;
  odd?: ODDPayload;
  spec?: Record<string, unknown>;
  xosc_content?: string;
  created_by?: string;
}

export async function postDraftScenario(
  payload: DraftPayload,
): Promise<{ ok: boolean; scenario_id: string; scenario: ScenarioDetail }> {
  return request<{ ok: boolean; scenario_id: string; scenario: ScenarioDetail }>(
    "/scenarios/draft",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateScenario(
  id: string,
  payload: Partial<ScenarioDetail> & { user?: string },
): Promise<{ ok: boolean; scenario: ScenarioDetail }> {
  return request<{ ok: boolean; scenario: ScenarioDetail }>(
    `/scenarios/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteScenario(
  id: string,
  user?: string,
): Promise<{ ok: boolean; scenario_id: string }> {
  const query = user ? `?user=${encodeURIComponent(user)}` : "";
  return request<{ ok: boolean; scenario_id: string }>(
    `/scenarios/${encodeURIComponent(id)}${query}`,
    {
      method: "DELETE",
    },
  );
}

export async function submitScenario(
  id: string,
): Promise<{ ok: boolean; scenario_id: string; status: string }> {
  return request<{ ok: boolean; scenario_id: string; status: string }>(
    `/scenarios/${encodeURIComponent(id)}/submit`,
    {
      method: "POST",
    },
  );
}

// ---------------------------------------------------------------------------
// GET /scenarios/{id} — Chi tiết kịch bản
// ---------------------------------------------------------------------------

export async function getScenarioById(
  id: string,
): Promise<ScenarioDetail> {
  return request<ScenarioDetail>(
    `/scenarios/${encodeURIComponent(id)}`,
  );
}

export async function getControllerRuns(
  id: string,
): Promise<ControllerRunsResponse> {
  return request<ControllerRunsResponse>(
    `/scenarios/${encodeURIComponent(id)}/controller-runs`,
  );
}

export async function postControllerRun(
  id: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/scenarios/${encodeURIComponent(id)}/controller-runs`,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// Dò biến thể tới hạn — POST sinh một bước, GET tóm tắt kết quả đã chạy
// ---------------------------------------------------------------------------

export async function getTuningSummary(id: string): Promise<TuningSummary> {
  return request<TuningSummary>(`/scenarios/${encodeURIComponent(id)}/tune`);
}

export async function postTuneStep(id: string): Promise<TuneStepResponse> {
  return request<TuneStepResponse>(
    `/scenarios/${encodeURIComponent(id)}/tune`,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// GET /scenarios/{id}/xosc — Tải file .xosc kèm status gate (HTTP 403)
// ---------------------------------------------------------------------------

export async function downloadXosc(id: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/scenarios/${encodeURIComponent(id)}/xosc`);
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    let messageVi = "";
    try {
      const json = JSON.parse(bodyText);
      messageVi = json.detail || json.message_vi || "";
    } catch {
      messageVi = bodyText;
    }
    throw new Error(messageVi || `Chặn tải file .xosc (Mã lỗi ${res.status})`);
  }
  return res.text();
}

// ---------------------------------------------------------------------------
// POST /scenarios/{id}/complete-simulation — Manual Simulation Verification
// ---------------------------------------------------------------------------

export interface CompleteSimulationPayload {
  passed: boolean;
  notes?: string;
}

export async function completeSimulation(
  scenarioId: string,
  payload: CompleteSimulationPayload,
): Promise<{ ok: boolean; scenario_id: string; status: ScenarioStatus }> {
  return request<{ ok: boolean; scenario_id: string; status: ScenarioStatus }>(
    `/scenarios/${encodeURIComponent(scenarioId)}/complete-simulation`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

// ---------------------------------------------------------------------------
// Auth Endpoints
// ---------------------------------------------------------------------------

// Đăng ký và quên mật khẩu đều 2 bước: xin mã 6 số qua email, rồi gửi mã kèm
// thông tin. Bước xin mã luôn trả cùng một câu, kể cả khi email không hợp lệ
// với luồng đó — không dựa vào response để đoán email đã đăng ký hay chưa.

export async function requestRegisterCode(email: string): Promise<{ message_vi: string }> {
  return request<{ message_vi: string }>("/auth/register/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyRegistration(payload: {
  email: string;
  code: string;
  full_name: string;
  password: string;
}): Promise<SessionResponse> {
  return request<SessionResponse>("/auth/register/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function requestPasswordResetCode(email: string): Promise<{ message_vi: string }> {
  return request<{ message_vi: string }>("/auth/password/forgot", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(payload: {
  email: string;
  code: string;
  new_password: string;
}): Promise<{ ok: boolean; message_vi: string }> {
  return request<{ ok: boolean; message_vi: string }>("/auth/password/reset", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function postLogin(email: string, password: string): Promise<SessionResponse> {
  return request<SessionResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/** Người đang đăng nhập, xác định bằng token trong header — không nhận username nào. */
export async function getMe(): Promise<ApiUser> {
  return request<ApiUser>("/auth/me");
}

export async function updateMyProfile(fullName: string): Promise<ApiUser> {
  return request<ApiUser>("/auth/me", {
    method: "PUT",
    body: JSON.stringify({ full_name: fullName }),
  });
}

/** Trả phiên MỚI: đổi mật khẩu làm mọi token cũ, kể cả token hiện tại, hết hiệu lực. */
export async function changeMyPassword(oldPassword: string, newPassword: string): Promise<SessionResponse> {
  return request<SessionResponse>("/auth/password/change", {
    method: "POST",
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
}

// ---------------------------------------------------------------------------
// Admin Subsystem Endpoints
// ---------------------------------------------------------------------------

export interface AdminStats {
  users: {
    total: number;
    creator: number;
    reviewer: number;
    admin: number;
    pending_approval: number;
  };
  scenarios: {
    total: number;
    draft: number;
    pending_sim_review: number;
    simulation_queued: number;
    pending_library_review: number;
    approved_library: number;
    approved_sim: number;
    rejected: number;
  };
}

export async function getAdminStats(): Promise<AdminStats> {
  return request<AdminStats>("/admin/stats");
}

export async function getPendingReviewers(): Promise<User[]> {
  return request<User[]>("/admin/pending-reviewers");
}

export async function getAdminUsers(params?: { role?: string; status?: string }): Promise<User[]> {
  const query = new URLSearchParams();
  if (params?.role) query.append("role", params.role);
  if (params?.status) query.append("status", params.status);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return request<User[]>(`/admin/users${qs}`);
}

export async function createAdminUser(
  payload: Partial<User> & { password?: string; reason?: string },
): Promise<{ ok: boolean; user: User }> {
  return request<{ ok: boolean; user: User }>("/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminUser(
  username: string,
  payload: Partial<User> & { password?: string; reason?: string },
): Promise<{ ok: boolean; user: User }> {
  return request<{ ok: boolean; user: User }>(`/admin/users/${encodeURIComponent(username)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminUser(username: string): Promise<{ ok: boolean; username: string }> {
  return request<{ ok: boolean; username: string }>(`/admin/users/${encodeURIComponent(username)}`, {
    method: "DELETE",
  });
}

export async function approveReviewer(
  username: string,
): Promise<{ ok: boolean; user: User & { temp_password?: string; email_sent?: boolean } }> {
  return request<{ ok: boolean; user: User & { temp_password?: string; email_sent?: boolean } }>(
    `/admin/users/${encodeURIComponent(username)}/approve`,
    {
      method: "POST",
    },
  );
}

export async function rejectReviewer(username: string): Promise<{ ok: boolean; user: User }> {
  return request<{ ok: boolean; user: User }>(`/admin/users/${encodeURIComponent(username)}/reject`, {
    method: "POST",
  });
}


// ---------------------------------------------------------------------------
// GET /metrics/quality — báo cáo M1/M2/M3
// ---------------------------------------------------------------------------

export async function getQualityReport(): Promise<QualityReport> {
  return request<QualityReport>("/metrics/quality");
}


// ---------------------------------------------------------------------------
// /campaigns — chiến dịch ODD (chế độ nâng cao)
// ---------------------------------------------------------------------------

export async function createCampaign(body: {
  cells: Array<Record<string, string>>;
  per_cell: number;
  max_scenarios: number;
  created_by: string;
}): Promise<{ campaign_id: string; planned: number }> {
  return request("/campaigns", { method: "POST", body: JSON.stringify(body) });
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  const data = await request<{ campaigns: CampaignSummary[] }>("/campaigns");
  return data.campaigns;
}

export async function getCampaign(id: string): Promise<CampaignDetail> {
  return request<CampaignDetail>(`/campaigns/${encodeURIComponent(id)}`);
}

export async function stopCampaign(id: string): Promise<{ ok: boolean }> {
  return request(`/campaigns/${encodeURIComponent(id)}/stop`, { method: "POST" });
}

export async function reviewCampaign(
  id: string,
  body: { reviewer: string; approved?: boolean; reason?: string; force_simulate?: boolean },
): Promise<CampaignReviewResponse> {
  return request<CampaignReviewResponse>(`/campaigns/${encodeURIComponent(id)}/review`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createCampaignControllerRuns(id: string): Promise<CampaignControllerBatchResponse> {
  return request<CampaignControllerBatchResponse>(`/campaigns/${encodeURIComponent(id)}/controller-runs`, {
    method: "POST",
  });
}

export async function getCampaignControllerRuns(id: string): Promise<CampaignControllerSummary> {
  return request<CampaignControllerSummary>(`/campaigns/${encodeURIComponent(id)}/controller-runs`);
}


// ---------------------------------------------------------------------------
// Chấm ý định bằng người — hợp thức hoá mức L4
// ---------------------------------------------------------------------------

export async function getLabelQueue(labeller: string): Promise<{ items: LabelQueueItem[]; count: number }> {
  return request<{ items: LabelQueueItem[]; count: number }>(
    `/intent-labels/queue?labeller=${encodeURIComponent(labeller)}`,
  );
}

export async function submitIntentLabel(
  scenarioId: string,
  body: { label: "correct" | "wrong" | "unsure"; reason: string; labeller: string },
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/scenarios/${scenarioId}/intent-label`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
