/**
 * API Client — Kết nối FastAPI Backend
 *
 * Base URL đọc từ env `NEXT_PUBLIC_API_URL`, mặc định `http://localhost:8000/api/v1`.
 */

import type { ApiUser, SessionResponse } from "@/types/auth";

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
