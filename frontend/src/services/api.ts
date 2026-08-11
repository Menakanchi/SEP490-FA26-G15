/**
 * API Client — Kết nối FastAPI Backend
 *
 * Base URL đọc từ env `NEXT_PUBLIC_API_URL`, mặc định `http://localhost:8000`.
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
    const body = await res.text().catch(() => "");
    throw new Error(
      `API ${res.status}: ${res.statusText}${body ? ` — ${body}` : ""}`,
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
}

export interface GenerateResponse {
  request_id: string;
}

export async function postGenerate(
  payload: GeneratePayload,
): Promise<GenerateResponse> {
  return request<GenerateResponse>("/generate", {
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
// POST /review — Gửi quyết định duyệt
// ---------------------------------------------------------------------------

export async function postReview(
  payload: ReviewRequest,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/review", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// GET /scenarios — Danh sách kịch bản (có lọc ODD)
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
    `/scenarios${qs ? `?${qs}` : ""}`,
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
