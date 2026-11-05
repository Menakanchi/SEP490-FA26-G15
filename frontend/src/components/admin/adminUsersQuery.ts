export const USER_ROLES: Record<string, string> = {
  ADMIN: "Quản trị viên", MANAGER: "Quản lý", ENGINEER: "Kỹ sư", REVIEWER: "Người duyệt", EXPERIENCER: "Người trải nghiệm",
};
export const USER_STATUSES: Record<string, string> = { ACTIVE: "Đang hoạt động", INACTIVE: "Đã khóa" };
export const USER_SORTS: Record<string, string> = { newest: "Mới nhất", oldest: "Cũ nhất", name: "Email A–Z" };
export const USER_PAGE_SIZES = [10, 20, 50, 100];
export type UserListQuery = { q: string; status: string; role: string; sort: string; page: number; page_size: number };

export function readUserQuery(params: Pick<URLSearchParams, "get">): UserListQuery {
  const page = Number(params.get("page") ?? 1);
  const size = Number(params.get("page_size") ?? 20);
  const role = params.get("role") ?? "", status = params.get("status") ?? "", sort = params.get("sort") ?? "newest";
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    role: Object.hasOwn(USER_ROLES, role) ? role : "",
    status: Object.hasOwn(USER_STATUSES, status) ? status : "",
    sort: Object.hasOwn(USER_SORTS, sort) ? sort : "newest",
    page: Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1,
    page_size: USER_PAGE_SIZES.includes(size) ? size : 20,
  };
}

export function userQueryParams(query: UserListQuery, includeDefaults = false): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ["q", "status", "role"] as const) if (includeDefaults || query[key]) params.set(key, query[key]);
  if (includeDefaults || query.sort !== "newest") params.set("sort", query.sort);
  if (includeDefaults || query.page !== 1) params.set("page", String(query.page));
  if (includeDefaults || query.page_size !== 20) params.set("page_size", String(query.page_size));
  return params;
}

export function userListUrl(query: UserListQuery): string {
  const search = userQueryParams(query).toString();
  return `/admin/users${search ? `?${search}` : ""}`;
}
