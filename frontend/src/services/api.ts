/**
 * API Client — Kết nối FastAPI Backend
 *
 * Base URL đọc từ env `NEXT_PUBLIC_API_URL`, mặc định `http://localhost:8000/api/v1`.
 */

import type {
  GenerationStatus,
  ReviewRequest,
  ScenarioDetail,
  ScenarioItem,
  ScenarioStatus,
  ODDPayload,
  ValidationMode,
} from "@/types";
import type { LoginPayload, RegisterPayload, User } from "@/types/auth";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    let messageVi = "";
    try {
      const json = JSON.parse(bodyText);
      messageVi = json.detail || json.message_vi || json.message || "";
    } catch {
      messageVi = bodyText;
    }
    throw new Error(
      messageVi || `API ${res.status}: ${res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// POST /generate — Gửi prompt sinh kịch bản
// ---------------------------------------------------------------------------

export interface GeneratePayload {
  prompt: string;
  validation_mode: ValidationMode;
  limit?: number;
  created_by?: string;
}

export interface GenerateResponse {
  request_id: string;
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
  payload: ReviewRequest,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/scenarios/${encodeURIComponent(payload.scenario_id)}/review`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// GET /library/search — Danh sách kịch bản (có lọc ODD & keyword)
// ---------------------------------------------------------------------------

export interface GetScenariosParams {
  search?: string;
  odd?: ODDPayload;
  scope?: "public" | "me" | "all";
  user?: string;
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

export async function getPublicScenarios(): Promise<{ items: ScenarioItem[]; total: number }> {
  return request<{ items: ScenarioItem[]; total: number }>("/scenarios/public");
}

export async function getMyScenarios(
  user?: string,
): Promise<{ items: ScenarioItem[]; total: number }> {
  const query = user ? `?user=${encodeURIComponent(user)}` : "";
  return request<{ items: ScenarioItem[]; total: number }>(`/scenarios/me${query}`);
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

export async function postLogin(payload: LoginPayload): Promise<{ access_token: string; user: User }> {
  return request<{ access_token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function postRegister(payload: RegisterPayload): Promise<User> {
  return request<User>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getMe(): Promise<User> {
  return request<User>("/auth/me");
}
