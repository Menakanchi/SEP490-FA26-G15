"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { Card, Tag } from "@/components/VehicSimUi";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/context/AuthContext";
import { adminApi, type AdminPageData, type AdminResource, type AdminRow } from "@/services/admin";

type Field = { key: string; label: string; type?: string; required?: boolean; max?: number; options?: string[] };
const roles = ["MANAGER", "ENGINEER", "REVIEWER", "EXPERIENCER", "ADMIN"];
const kinds = ["PRINCIPLE", "THEORY", "CONSTANT", "DEFINITION", "UNIT", "STANDARD"];
const roleLabels: Record<string, string> = { ADMIN: "Quản trị viên", MANAGER: "Quản lý", ENGINEER: "Kỹ sư", REVIEWER: "Người duyệt", EXPERIENCER: "Người trải nghiệm" };
const kindLabels: Record<string, string> = { PRINCIPLE: "Nguyên lý", THEORY: "Lý thuyết", CONSTANT: "Hằng số", DEFINITION: "Định nghĩa", UNIT: "Đơn vị", STANDARD: "Tiêu chuẩn" };
const labels = { ...roleLabels, ...kindLabels };
const titles: Record<AdminResource, string> = { users: "Tài khoản", workspaces: "Workspace", "tech-references": "Tài liệu kỹ thuật" };
const fields: Record<AdminResource, Field[]> = {
  users: [
    { key: "email", label: "Email", type: "email", required: true, max: 255 },
    { key: "last_name", label: "Họ", required: true, max: 80 },
    { key: "middle_name", label: "Tên đệm", max: 80 },
    { key: "first_name", label: "Tên", required: true, max: 80 },
    { key: "role", label: "Vai trò", options: roles, required: true },
    { key: "password", label: "Mật khẩu ban đầu", type: "password", required: true, max: 72 },
  ],
  workspaces: [
    { key: "name", label: "Tên workspace", required: true, max: 150 },
    { key: "description", label: "Mô tả", type: "textarea", max: 10000 },
  ],
  "tech-references": [
    { key: "ref_code", label: "Mã", required: true, max: 100 },
    { key: "ref_name", label: "Tên", required: true, max: 255 },
    { key: "ref_type", label: "Loại", options: kinds, required: true },
    { key: "ref_value", label: "Giá trị hằng số", type: "number" },
    { key: "unit", label: "Đơn vị", max: 30 },
    { key: "description", label: "Mô tả", type: "textarea", max: 10000 },
    { key: "source_type", label: "Loại nguồn", max: 50 },
    { key: "source_title", label: "Tên nguồn", max: 500 },
    { key: "author", label: "Tác giả", max: 255 },
    { key: "organization", label: "Tổ chức", max: 255 },
    { key: "publication_year", label: "Năm xuất bản", type: "number" },
    { key: "page", label: "Trang", max: 50 },
    { key: "url", label: "Đường dẫn nguồn", type: "url", max: 1024 },
    { key: "doi", label: "DOI", max: 255 },
  ],
};
const columns: Record<AdminResource, [string, string][]> = {
  users: [["full_name", "Họ và tên"], ["email", "Email"], ["role", "Vai trò"], ["is_active", "Trạng thái"], ["created_date", "Ngày tạo"]],
  workspaces: [["name", "Workspace"], ["manager_name", "Quản lý"], ["manager_email", "Email quản lý"], ["member_count", "Thành viên"], ["project_count", "Project"], ["status", "Trạng thái"], ["created_date", "Ngày tạo"]],
  "tech-references": [["ref_code", "Mã"], ["ref_name", "Tên"], ["ref_type", "Loại"], ["ref_value", "Giá trị"], ["unit", "Đơn vị"], ["is_active", "Trạng thái"], ["updated_at", "Cập nhật"]],
};
const inputClass = "w-full rounded-xl border border-vehicsim-line bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100";
const buttonClass = "rounded-xl border border-vehicsim-line px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50";
const primaryClass = "rounded-xl bg-vehicsim-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
function active(value: AdminRow[string]) { return value === true || value === 1; }
function message(error: unknown) { return error instanceof Error ? error.message : "Không thực hiện được thao tác. Hãy thử lại."; }

export function AdminManagement({ resource }: { resource: AdminResource }) {
  return <AuthGate allowedRoles={["admin"]}><Management key={resource} resource={resource} /></AuthGate>;
}
function Management({ resource }: { resource: AdminResource }) {
  const { user } = useAuth();
  const [data, setData] = useState<AdminPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState({ q: "", status: "", role: "", sort: "newest", page: 1 });
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<AdminRow | null | undefined>(undefined);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ ...query, page: String(query.page), page_size: "20" });
    adminApi.list(resource, params).then(result => {
      if (live) { setData(result); setError(""); }
    }).catch(err => { if (live) { setError(message(err)); setData(null); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [resource, query, revision]);
  const change = (next: Partial<typeof query>) => { setLoading(true); setQuery({ ...query, ...next }); };
  async function edit(id: number) {
    setOpening(true); setError(""); setNotice("");
    try { setEditor(await adminApi.detail(resource, id)); } catch (err) { setError(message(err)); }
    finally { setOpening(false); }
  }
  const saved = () => { setEditor(undefined); setNotice("Đã lưu thành công."); setLoading(true); setRevision(n => n + 1); };
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

  return <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-8">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm text-vehicsim-muted">Quản trị hệ thống</p><h1 className="text-2xl font-bold">{titles[resource]}</h1></div>
      <div className="flex items-center gap-3"><Link href="/profile" className="text-sm underline">Hồ sơ / Mật khẩu</Link><NotificationBell /></div>
    </header>
    <nav aria-label="Quản trị" className="flex flex-wrap gap-2">
      {(Object.keys(titles) as AdminResource[]).map(key => <Link key={key} href={`/admin/${key}`} aria-current={resource === key ? "page" : undefined}
        className={resource === key ? primaryClass : buttonClass}>{titles[key]}</Link>)}
    </nav>
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={e => { e.preventDefault(); change({ q: search.trim(), page: 1 }); }} className="flex min-w-0 flex-1 basis-full items-end gap-2 sm:basis-auto">
          <label className="min-w-0 flex-1 text-sm">Tìm kiếm<input aria-label="Từ khóa tìm kiếm" className={inputClass} maxLength={100} value={search} onChange={e => setSearch(e.target.value)} placeholder={resource === "workspaces" ? "Tên workspace, tên hoặc email Manager" : "Tên, mã hoặc email"} /></label>
          <button className={buttonClass}>Tìm</button>
        </form>
        <label className="text-sm">Trạng thái<select className={inputClass} value={query.status} onChange={e => change({ status: e.target.value, page: 1 })}>
          <option value="">Tất cả</option><option value="ACTIVE">{resource === "workspaces" ? "Hoạt động" : "Đang bật"}</option>
          <option value={resource === "workspaces" ? "ARCHIVED" : "INACTIVE"}>{resource === "workspaces" ? "Đã lưu trữ" : "Đã tắt / Khóa"}</option>
        </select></label>
        {resource !== "workspaces" && <label className="text-sm">{resource === "users" ? "Vai trò" : "Loại"}
          <select className={inputClass} value={query.role} onChange={e => change({ role: e.target.value, page: 1 })}>
            <option value="">Tất cả</option>{(resource === "users" ? roles : kinds).map(v => <option key={v} value={v}>{labels[v]}</option>)}
          </select></label>}
        <label className="text-sm">Sắp xếp<select className={inputClass} value={query.sort} onChange={e => change({ sort: e.target.value, page: 1 })}>
          <option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="name">Tên / Email A–Z</option>
        </select></label>
        <button className={primaryClass} onClick={() => { setEditor(null); setNotice(""); }}>Thêm mới</button>
      </div>
    </Card>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error} <button className="underline" onClick={() => { setLoading(true); setRevision(n => n + 1); }}>Thử lại</button></div>}
    {notice && <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{notice}</p>}
    <Card className="overflow-hidden">
      {loading ? <p role="status" className="p-8">Đang tải dữ liệu…</p> : data && <div className="overflow-x-auto">
        <table className="w-full text-left text-sm"><thead className="bg-vehicsim-soft text-[12px] font-bold uppercase tracking-[0.5px] text-vehicsim-ink"><tr>
          {columns[resource].map(([key, label]) => <th key={key} className="whitespace-nowrap p-4">{label}</th>)}<th className="p-4">Thao tác</th>
        </tr></thead><tbody>
          {data.items.length === 0 && <tr><td colSpan={columns[resource].length + 1} className="p-8 text-center text-vehicsim-muted">Không có dữ liệu phù hợp.</td></tr>}
          {data.items.map(row => <tr key={row.id} className="border-t border-vehicsim-line">
            {columns[resource].map(([key]) => <td key={key} className="max-w-72 break-words p-4">{renderCell(row, key, resource)}</td>)}
            <td className="p-4"><button className={buttonClass} disabled={opening || row.status === "ARCHIVED"} onClick={() => void edit(row.id)}>Chỉnh sửa</button></td>
          </tr>)}
        </tbody></table>
      </div>}
    </Card>
    {data && <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span>{data.total} kết quả · Trang {query.page}/{totalPages}</span><div className="flex gap-2">
        <button className={buttonClass} disabled={loading || query.page <= 1} onClick={() => change({ page: query.page - 1 })}>Trước</button>
        <button className={buttonClass} disabled={loading || query.page >= totalPages} onClick={() => change({ page: query.page + 1 })}>Sau</button>
      </div>
    </div>}
    {editor !== undefined && <Editor resource={resource} row={editor} actorId={user?.id} onCancel={() => setEditor(undefined)} onSaved={saved} />}
  </div>;
}
function renderCell(row: AdminRow, key: string, resource: AdminResource) {
  const value = row[key];
  if (key === "is_active") return <Tag tone={active(value) ? "ok" : "neutral"}>{active(value) ? "Đang bật" : resource === "users" ? "Đã khóa" : "Đã tắt"}</Tag>;
  if (key === "status") return <Tag tone={value === "ACTIVE" ? "ok" : "neutral"}>{value === "ACTIVE" ? "Hoạt động" : "Đã lưu trữ"}</Tag>;
  if (key === "created_date" || key === "updated_at") return value ? new Date(value as string | number).toLocaleString("vi-VN") : "—";
  return labels[String(value)] ?? String(value ?? "—");
}

function Editor({ resource, row, actorId, onCancel, onSaved }: { resource: AdminResource; row: AdminRow | null; actorId?: string; onCancel: () => void; onSaved: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields[resource].map(f => [f.key, String(row?.[f.key] ?? f.options?.[0] ?? "")])));
  const [enabled, setEnabled] = useState(row ? active(row.is_active) : true);
  const [manager, setManager] = useState(String(row?.manager_id ?? ""));
  const [managerSearch, setManagerSearch] = useState("");
  const [managers, setManagers] = useState<AdminRow[]>([]);
  const [managerLoading, setManagerLoading] = useState(resource === "workspaces");
  const [managerError, setManagerError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const self = resource === "users" && String(row?.id) === actorId;
  const loadManagers = useCallback(async (q: string) => {
    setManagerLoading(true); setManagerError("");
    try {
      const result = await adminApi.list("users", new URLSearchParams({ role: "MANAGER", status: "ACTIVE", q, page_size: "100", sort: "name" }));
      setManagers(result.items);
    } catch (err) { setManagerError(message(err)); }
    finally { setManagerLoading(false); }
  }, []);
  useEffect(() => {
    if (resource === "workspaces") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch valid manager accounts for this form
      void loadManagers("");
    }
  }, [resource, loadManagers]);
  function prepare(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const body: Record<string, unknown> = { ...values };
    for (const f of fields[resource]) {
      if (f.type !== "password") body[f.key] = values[f.key]?.trim() || null;
    }
    if (resource === "users") {
      if (!row && (values.password.length < 8 || new TextEncoder().encode(values.password).length > 72)) { setError("Mật khẩu phải ít nhất 8 ký tự và tối đa 72 byte UTF-8."); return; }
      if (row) delete body.password;
      body.is_active = enabled;
    }
    if (resource === "workspaces") {
      if (!manager) { setError("Chọn Manager đang hoạt động."); return; }
      body.manager_id = Number(manager);
    }
    if (resource === "tech-references") {
      body.ref_value = values.ref_type === "CONSTANT" ? values.ref_value : null;
      const year = values.publication_year;
      body.publication_year = year ? Number(year) : null;
      body.is_active = enabled;
    }
    if (row) setPending(body);
    else void save(body);
  }
  async function save(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try { await adminApi.save(resource, row?.id ?? null, body); onSaved(); }
    catch (err) { setError(message(err)); setPending(null); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-editor-title"
    onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}
    className="m-auto max-h-[92vh] w-[calc(100%_-_24px)] max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 text-vehicsim-ink shadow-xl backdrop:bg-black/40">
      <h2 id="admin-editor-title" className="mb-4 text-xl font-bold">{row ? "Chỉnh sửa" : "Thêm mới"} · {titles[resource]}</h2>
      {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
      {pending ? <div className="space-y-4">
        <p>Xác nhận lưu thay đổi? {resource === "users" && "Thay đổi email, quyền hoặc trạng thái sẽ kết thúc các phiên đăng nhập cũ."}
          {resource === "workspaces" && "Nếu đổi Manager, người được giao sẽ nhận thông báo."}
          {resource === "tech-references" && "Trạng thái bật/tắt sẽ được áp dụng sau khi lưu."}</p>
        <div className="flex justify-end gap-2"><button autoFocus className={buttonClass} disabled={busy} onClick={() => setPending(null)}>Quay lại</button>
          <button className={primaryClass} disabled={busy} onClick={() => void save(pending)}>{busy ? "Đang lưu…" : "Xác nhận lưu"}</button></div>
      </div> : <form onSubmit={prepare}>
        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
          {fields[resource].filter(f => !(resource === "users" && row && f.key === "password")).map(f => {
            const disabled = (self && f.key === "role") || (f.key === "ref_value" && values.ref_type !== "CONSTANT");
            const props = { id: `admin-${f.key}`, name: f.key, className: inputClass, value: values[f.key] ?? "", required: f.required || (f.key === "ref_value" && values.ref_type === "CONSTANT"), disabled,
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues({ ...values, [f.key]: e.target.value }) };
            return <label key={f.key} htmlFor={props.id} className={f.type === "textarea" ? "text-sm md:col-span-2" : "text-sm"}>
              {f.label}{f.required ? " *" : ""}
              {f.options ? <select {...props}>{f.options.map(v => <option key={v} value={v}>{labels[v]}</option>)}</select> :
                f.type === "textarea" ? <textarea {...props} rows={3} maxLength={f.max} /> :
                <input {...props} type={f.type ?? "text"} maxLength={f.max} minLength={f.type === "password" ? 8 : undefined}
                  step={f.key === "publication_year" ? 1 : "any"} min={f.key === "publication_year" ? 1 : undefined} max={f.key === "publication_year" ? 9999 : undefined} autoComplete={f.type === "password" ? "new-password" : "off"} />}
            </label>;
          })}
          {resource === "workspaces" && <div className="space-y-2 md:col-span-2">
            <label className="block text-sm">Tìm Manager theo tên/email
              <span className="flex gap-2"><input className={inputClass} value={managerSearch} maxLength={100} onChange={e => setManagerSearch(e.target.value)} />
                <button type="button" className={buttonClass} disabled={managerLoading} onClick={() => void loadManagers(managerSearch)}>Tìm</button></span>
            </label>
            {managerError && <p role="alert" className="text-sm text-red-700">{managerError}</p>}
            <label className="block text-sm">Manager phụ trách *
              <select required className={inputClass} value={manager} onChange={e => setManager(e.target.value)}>
                <option value="">Chọn tài khoản MANAGER đang hoạt động</option>
                {manager && !managers.some(m => String(m.id) === manager) && <option value={manager}>{row?.manager_name ?? `Manager #${manager}`} (kiểm tra lại khi lưu)</option>}
                {managers.map(m => <option key={m.id} value={m.id}>{m.full_name} · {m.email}</option>)}
              </select>
            </label>
            <p role="status" className="text-xs text-vehicsim-muted">{managerLoading ? "Đang tải Manager…" : managers.length ? "Tối đa 100 kết quả. Nhập tên/email để thu hẹp tìm kiếm." : "Chưa có Manager phù hợp. Tạo tài khoản Manager hoặc tìm lại."}</p>
          </div>}
          {resource !== "workspaces" && <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={enabled} disabled={self || !row} onChange={e => setEnabled(e.target.checked)} />
            {resource === "users" ? "Tài khoản đang hoạt động" : "Tài liệu đang bật"}
          </label>}
        </fieldset>
        <div className="mt-6 flex justify-end gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={onCancel}>Hủy</button>
          <button className={primaryClass} disabled={busy || managerLoading || !!managerError}>{busy ? "Đang lưu…" : row ? "Lưu thay đổi" : "Tạo mới"}</button></div>
      </form>}
  </dialog>;
}