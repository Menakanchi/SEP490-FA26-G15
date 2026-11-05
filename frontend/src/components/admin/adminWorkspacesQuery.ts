import type { AdminRow } from "@/services/admin";

export const WORKSPACE_STATUSES: Record<string, string> = { ACTIVE: "Hoạt động", ARCHIVED: "Đã lưu trữ" };
export const WORKSPACE_SORTS: Record<string, string> = { newest: "Mới nhất", oldest: "Cũ nhất", name: "Tên workspace A–Z" };
export const WORKSPACE_PAGE_SIZES = [10, 20, 50, 100];
export type WorkspaceListQuery = { q: string; status: string; sort: string; page: number; page_size: number };

export function readWorkspaceQuery(params: Pick<URLSearchParams, "get">): WorkspaceListQuery {
  const page = Number(params.get("page") ?? 1), size = Number(params.get("page_size") ?? 20);
  const status = params.get("status") ?? "", sort = params.get("sort") ?? "newest";
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    status: Object.hasOwn(WORKSPACE_STATUSES, status) ? status : "",
    sort: Object.hasOwn(WORKSPACE_SORTS, sort) ? sort : "newest",
    page: Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1,
    page_size: WORKSPACE_PAGE_SIZES.includes(size) ? size : 20,
  };
}
export function workspaceQueryParams(query: WorkspaceListQuery, includeDefaults = false): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ["q", "status"] as const) if (includeDefaults || query[key]) params.set(key, query[key]);
  if (includeDefaults || query.sort !== "newest") params.set("sort", query.sort);
  if (includeDefaults || query.page !== 1) params.set("page", String(query.page));
  if (includeDefaults || query.page_size !== 20) params.set("page_size", String(query.page_size));
  return params;
}
export function workspaceListUrl(query: WorkspaceListQuery): string {
  const search = workspaceQueryParams(query).toString();
  return "/admin/workspaces" + (search ? "?" + search : "");
}

export function workspaceCount(value: AdminRow[string]) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString("vi-VN") : "—"; }
export function workspaceDate(value: AdminRow[string]) {
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("vi-VN") : "—";
}
