import { apiRequest } from "@/services/api";

export type AdminResource = "users" | "workspaces" | "tech-references";
export type AdminRow = { id: number; [key: string]: string | number | boolean | null };
export type AdminPageData = { items: AdminRow[]; total: number; page: number; page_size: number };
const base = "/vehicsim/admin";
export const adminApi = {
  list(resource: AdminResource, query: URLSearchParams) {
    return apiRequest<AdminPageData>(`${base}/${resource}?${query}`);
  },
  detail(resource: AdminResource, id: number) {
    return apiRequest<AdminRow>(`${base}/${resource}/${id}`);
  },
  save(resource: AdminResource, id: number | null, body: Record<string, unknown>) {
    return apiRequest<AdminRow>(`${base}/${resource}${id === null ? "" : `/${id}`}`, {
      method: id === null ? "POST" : "PUT", body: JSON.stringify(body),
    });
  },
};