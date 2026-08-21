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
  ODDPayload,
  ValidationMode,
} from "@/types";

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
  /** Người tạo. Đề bài đòi hai vai trò tạo/duyệt — đây là vế thứ nhất. */
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
): Promise<{ ok: boolean; status: string; job_created: boolean }> {
  return request<{ ok: boolean; status: string; job_created: boolean }>(
    `/scenarios/${encodeURIComponent(payload.scenario_id)}/review`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

// ---------------------------------------------------------------------------
// GET /library/search — Danh sách kịch bản (có lọc ODD & keyword)
// ---------------------------------------------------------------------------

export interface GetScenariosParams {
  search?: string;
  odd?: ODDPayload;
  page?: number;
  limit?: number;
}

export async function getScenarios(
  params?: GetScenariosParams,
): Promise<{ items: ScenarioItem[]; total: number }> {
  const query = new URLSearchParams();

  if (params?.search) query.set("search", params.search);
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

/** Thay TOÀN BỘ tag của một kịch bản (không phải thêm vào). */
export async function updateTags(id: string, tags: string[]): Promise<{ tags: string[] }> {
  return request<{ tags: string[] }>(`/scenarios/${encodeURIComponent(id)}/tags`, {
    method: "PUT",
    body: JSON.stringify({ tags }),
  });
}
