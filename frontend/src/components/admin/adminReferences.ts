import { ApiError } from "@/services/api";

export const REFERENCE_KINDS: Record<string, string> = { PRINCIPLE: "Nguyên lý", THEORY: "Lý thuyết", CONSTANT: "Hằng số", DEFINITION: "Định nghĩa", UNIT: "Đơn vị", STANDARD: "Tiêu chuẩn" };
export const REFERENCE_STATUSES: Record<string, string> = { ACTIVE: "Đang bật", INACTIVE: "Đã tắt" };
export const REFERENCE_SORTS: Record<string, string> = { newest: "Mới nhất", oldest: "Cũ nhất", name: "Tên tài liệu A–Z" };
export const REFERENCE_PAGE_SIZES = [10, 20, 50, 100];
export type ReferenceListQuery = { q: string; status: string; role: string; sort: string; page: number; page_size: number };

export function readReferenceQuery(params: Pick<URLSearchParams, "get">): ReferenceListQuery {
  const page = Number(params.get("page") ?? 1);
  const size = Number(params.get("page_size") ?? 20);
  const role = params.get("role") ?? "", status = params.get("status") ?? "", sort = params.get("sort") ?? "newest";
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    role: Object.hasOwn(REFERENCE_KINDS, role) ? role : "",
    status: Object.hasOwn(REFERENCE_STATUSES, status) ? status : "",
    sort: Object.hasOwn(REFERENCE_SORTS, sort) ? sort : "newest",
    page: Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1,
    page_size: REFERENCE_PAGE_SIZES.includes(size) ? size : 20,
  };
}

export function referenceQueryParams(query: ReferenceListQuery, includeDefaults = false): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ["q", "status", "role"] as const) if (includeDefaults || query[key]) params.set(key, query[key]);
  if (includeDefaults || query.sort !== "newest") params.set("sort", query.sort);
  if (includeDefaults || query.page !== 1) params.set("page", String(query.page));
  if (includeDefaults || query.page_size !== 20) params.set("page_size", String(query.page_size));
  return params;
}

export function referenceListUrl(query: ReferenceListQuery): string {
  const search = referenceQueryParams(query).toString();
  return `/admin/tech-references${search ? `?${search}` : ""}`;
}

export const referenceFields = [
  { key: "ref_code", label: "Mã", max: 100, required: true },
  { key: "ref_name", label: "Tên", max: 255, required: true },
  { key: "ref_type", label: "Loại", required: true },
  { key: "ref_value", label: "Giá trị hằng số" },
  { key: "unit", label: "Đơn vị", max: 30 },
  { key: "description", label: "Mô tả", max: 10000 },
  { key: "source_type", label: "Loại nguồn", max: 50 },
  { key: "source_title", label: "Tên nguồn", max: 500 },
  { key: "author", label: "Tác giả", max: 255 },
  { key: "organization", label: "Tổ chức", max: 255 },
  { key: "publication_year", label: "Năm xuất bản" },
  { key: "page", label: "Trang", max: 50 },
  { key: "url", label: "Đường dẫn nguồn", max: 1024 },
  { key: "doi", label: "DOI", max: 255 },
] as const;

export function referenceErrorMessage(error: unknown, operation: "load" | "save"): string {
  if (error instanceof ApiError) {
    if (error.status < 500) return error.message;
    return operation === "save"
      ? "Máy chủ chưa thể xác nhận kết quả lưu tài liệu. Hãy tải lại danh sách để kiểm tra trước khi thử lại. Dữ liệu nhập được giữ lại."
      : "Máy chủ chưa thể tải tài liệu. Hãy thử lại sau.";
  }
  if (error instanceof TypeError) return "Không thể kết nối đến máy chủ. Kiểm tra kết nối mạng rồi thử lại." + (operation === "save" ? " Dữ liệu nhập được giữ lại." : "");
  if (operation === "save") return "Không thể xác nhận kết quả lưu. Hãy tải lại danh sách để kiểm tra trước khi thử lại. Dữ liệu nhập được giữ lại.";
  if (error instanceof SyntaxError) return "Phản hồi tài liệu không hợp lệ. Hãy thử tải lại.";
  return error instanceof Error ? error.message : "Không thể tải tài liệu. Hãy thử lại.";
}
