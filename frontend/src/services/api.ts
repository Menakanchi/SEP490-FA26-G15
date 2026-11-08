/**
 * API Client — Kết nối backend Spring Boot (Java)
 *
 * Base URL đọc từ env `NEXT_PUBLIC_API_URL`, mặc định `http://localhost:8001/api/v1` (cổng backend Java).
 */

import type { ApiUser, SessionResponse } from "@/types/auth";

const getBaseUrl = (): string => {
  const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
  const trimmed = rawBaseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
};

const BASE_URL = getBaseUrl();

// ---------------------------------------------------------------------------
// Access token (JWT) — lưu trong localStorage, gắn vào MỌI request
// ---------------------------------------------------------------------------

const ACCESS_TOKEN_KEY = "vehicsim_access_token";
const REVIEW_PROJECT_KEY = "vehicsim_reviewer_project";
let selectedReviewerProject: number | null | undefined;

export function selectReviewerProject(id: number | null): void {
  selectedReviewerProject = id;
  if (typeof window === "undefined") return;
  try {
    if (id === null) sessionStorage.removeItem(REVIEW_PROJECT_KEY);
    else sessionStorage.setItem(REVIEW_PROJECT_KEY, String(id));
  } catch { /* Vẫn chốt project trong bộ nhớ khi trình duyệt chặn storage. */ }
}

function reviewerProjectHeader(path: string): Record<string, string> {
  if (typeof window === "undefined" || !path.startsWith("/vehicsim/")) return {};
  if (selectedReviewerProject === undefined) {
    try {
      const stored = Number(sessionStorage.getItem(REVIEW_PROJECT_KEY));
      selectedReviewerProject = Number.isSafeInteger(stored) && stored > 0 ? stored : null;
    } catch {
      selectedReviewerProject = null;
    }
  }
  return selectedReviewerProject ? { [PROJECT_HEADER]: String(selectedReviewerProject) } : {};
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string | null, preserveProject = false): void {
  if (typeof window === "undefined") return;
  try {
    if (!token || (!preserveProject && token !== getStoredToken())) selectReviewerProject(null);
    if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // Trình duyệt chặn storage (chế độ riêng tư): phiên chỉ sống trong tab này.
  }
}

const PROJECT_KEY = "vehicsim_project";
export const PROJECT_HEADER = "X-VehicSim-Project";

/**
 * Project đang mở thuộc về từng tab (sessionStorage) để hai tab mở hai project không ghi nhầm vào nhau;
 * localStorage chỉ giữ lựa chọn gần nhất làm giá trị mở đầu cho tab mới.
 */
export function getSelectedProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(PROJECT_KEY) ?? localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setSelectedProjectId(id: number | null): void {
  try {
    for (const store of [sessionStorage, localStorage]) {
      if (id) store.setItem(PROJECT_KEY, String(id));
      else store.removeItem(PROJECT_KEY);
    }
  } catch {
    return;
  }
}

/** Reviewer gửi project đã chốt trong workspace của mình; còn lại gửi project cá nhân đang mở (nếu có). */
function projectHeader(path: string): Record<string, string> {
  const reviewer = reviewerProjectHeader(path);
  if (Object.keys(reviewer).length) return reviewer;
  const project = getSelectedProjectId();
  return project ? { [PROJECT_HEADER]: project } : {};
}

function authHeaders(path: string): Record<string, string> {
  const token = getStoredToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...projectHeader(path),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Hết phiên giữa chừng
// ---------------------------------------------------------------------------

const SESSION_EXPIRED_EVENT = "vehicsim:session-expired";

/** Các route trả 401 vì sai thông tin đăng nhập chứ không phải vì hết phiên — không được đá người dùng ra. */
const CREDENTIAL_PATHS = ["/auth/login", "/auth/register", "/auth/password/forgot", "/auth/password/reset"];

function handleSessionExpired(): void {
  storeToken(null);
  setSelectedProjectId(null);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

/** Gọi `callback` khi backend từ chối token đang dùng (hết hạn / đã đổi mật khẩu ở máy khác). Trả hàm huỷ đăng ký. */
export function onSessionExpired(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(SESSION_EXPIRED_EVENT, callback);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, callback);
}

/** Lỗi HTTP có mã trạng thái, để nơi gọi phân biệt 401 (hết phiên) với lỗi khác. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Tải file (CSV…) từ API có kèm token rồi cho trình duyệt lưu. */
export async function apiBlob(path: string, options?: RequestInit): Promise<Blob> {
  const headers = new Headers(options?.headers);
  Object.entries(authHeaders(path)).forEach(([name, value]) => headers.set(name, value));
  if (options?.body) headers.set("Content-Type", "application/json");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) throw new ApiError(`API ${res.status}: ${res.statusText}`, res.status);
  return res.blob();
}

export async function apiDownload(path: string, filename: string, options?: RequestInit): Promise<void> {
  const url = URL.createObjectURL(await apiBlob(path, options));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { request as apiRequest };

/**
 * GET giống hệt (cùng đường dẫn, cùng token) đang bay thì dùng chung một lời gọi. Trang tổng quan có nhiều component
 * cùng cần `/vehicsim/context`, `/vehicsim/families`… và React Strict Mode (dev) chạy effect hai lần — nếu không gom,
 * mỗi API bị gọi 2–4 lần và backend làm lại cùng một truy vấn. Chỉ gom khi lời gọi còn đang chạy, không cache.
 */
const inflightGets = new Map<string, Promise<unknown>>();

function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  if (method !== "GET" || options?.body) return send<T>(path, options);
  const key = `${getStoredToken() ?? ""}|${JSON.stringify(projectHeader(path))}|${path}`;
  const running = inflightGets.get(key);
  if (running) return running as Promise<T>;
  const call = send<T>(path, options).finally(() => inflightGets.delete(key));
  inflightGets.set(key, call);
  return call;
}

async function send<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(path),
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) throw await apiErrorFrom(res, path, token);

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Đổi response lỗi thành {@link ApiError} (câu tiếng Việt của backend); 401 khi có token = hết phiên. */
async function apiErrorFrom(res: Response, path: string, token: string | null): Promise<ApiError> {
  // Có gửi token mà vẫn 401 = phiên hết hạn: xoá phiên để giao diện đưa người dùng về trang đăng nhập.
  if (res.status === 401 && token && !CREDENTIAL_PATHS.some((p) => path.startsWith(p))) handleSessionExpired();
  const bodyText = await res.text().catch(() => "");
  let messageVi = "";
  let code: string | undefined;
  try {
    const json = JSON.parse(bodyText);
    if (typeof json.code === "string") code = json.code;
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
  return new ApiError(
    messageVi || `API ${res.status}: ${res.statusText}`,
    res.status,
    code,
  );
}

/**
 * Mở một kênh Server-Sent Events có kèm token (EventSource của trình duyệt không gửi được header `Authorization`, còn đặt
 * token lên URL thì lộ vào log). Gọi `onEvent(tên, data)` cho từng sự kiện; promise kết thúc khi server đóng kênh, ném
 * {@link ApiError} khi server từ chối, và dừng khi `signal` bị huỷ. Dòng comment (`:ping`) chỉ giữ kết nối, bị bỏ qua.
 */
export async function apiEventStream(
  path: string,
  onEvent: (event: string, data: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: "text/event-stream, application/json", ...authHeaders(path) },
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await apiErrorFrom(res, path, token);
  if (!res.body) throw new ApiError("Trình duyệt không đọc được kênh realtime", 0);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += value;
      buffer = buffer.replace(/\r\n?/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of frame.split("\n")) {
          if (!line || line.startsWith(":")) continue;
          const colon = line.indexOf(":");
          const field = colon < 0 ? line : line.slice(0, colon);
          let val = colon < 0 ? "" : line.slice(colon + 1);
          if (val.startsWith(" ")) val = val.slice(1);
          if (field === "event") event = val;
          else if (field === "data") data.push(val);
        }
        if (data.length) onEvent(event, data.join("\n"));
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Auth Endpoints
// ---------------------------------------------------------------------------

// Đăng ký và quên mật khẩu đều 2 bước: xin mã 6 số qua email, rồi gửi mã kèm
// thông tin. Bước xin mã luôn trả cùng một câu, kể cả khi email không hợp lệ
// với luồng đó — không dựa vào response để đoán email đã đăng ký hay chưa.

/** Luồng đăng ký backend đang dùng: `otp` (xác minh email) hoặc `one_step` (không xác minh, dev). */
export type RegistrationMode = "otp" | "one_step";

export async function getRegistrationMode(): Promise<RegistrationMode> {
  const res = await request<{ mode: RegistrationMode }>("/auth/register/mode");
  return res.mode === "otp" ? "otp" : "one_step";
}

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

/** Đăng ký một bước của backend Java (`POST /auth/register`): tạo tài khoản EXPERIENCER và cấp phiên luôn. */
export interface RegisterPayload {
  email: string;
  password: string;
  lastName: string;
  middleName?: string;
  firstName: string;
  dateOfBirth?: string; // yyyy-MM-dd
  gender?: "MALE" | "FEMALE" | "OTHER";
  phoneNumber?: string;
  address?: string;
}

export async function postRegister(payload: RegisterPayload): Promise<SessionResponse> {
  return request<SessionResponse>("/auth/register", {
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
