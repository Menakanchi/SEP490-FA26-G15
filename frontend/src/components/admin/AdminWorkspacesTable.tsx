"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Plus, RefreshCw, Search, X } from "lucide-react";
import { adminApi, type AdminPageData, type AdminRow } from "@/services/admin";
import { AdminWorkspaceEditor } from "./AdminWorkspaceEditor";
import { workspaceCount, readWorkspaceQuery, workspaceListUrl, workspaceQueryParams, WORKSPACE_PAGE_SIZES, WORKSPACE_SORTS, WORKSPACE_STATUSES, type WorkspaceListQuery } from "./adminWorkspacesQuery";
import styles from "./AdminTable.module.css";
import workspace from "./AdminWorkspaces.module.css";

const message = (error: unknown) => error instanceof Error ? error.message : "Không thực hiện được thao tác. Hãy thử lại.";
function SearchForm({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [search, setSearch] = useState({ applied: value, draft: value });
  // Sync history changes without remounting the input or replacing an unapplied draft on refresh.
  if (search.applied !== value) setSearch({ applied: value, draft: value });
  return <form className={styles.search} onSubmit={event => { event.preventDefault(); onSearch(search.draft.trim()); }}>
    <label htmlFor="admin-workspaces-search">Tìm kiếm</label><div><span className={styles.searchInput}><Search size={16} aria-hidden="true" /><input id="admin-workspaces-search" aria-label="Từ khóa tìm kiếm" type="search" maxLength={100} value={search.draft} onChange={event => setSearch({ applied: value, draft: event.target.value })} placeholder="Tên workspace, tên hoặc email Manager" /></span><button type="submit" className={styles.button}>Tìm</button></div>
  </form>;
}
export function AdminWorkspacesTable() {
  const searchParams = useSearchParams(), raw = searchParams.toString();
  const query = useMemo(() => readWorkspaceQuery(new URLSearchParams(raw)), [raw]);
  const canonical = workspaceQueryParams(query).toString(), request = workspaceQueryParams(query, true).toString();
  const [result, setResult] = useState<{ key: string; data?: AdminPageData; error?: string }>({ key: "" });
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<AdminRow | null | undefined>(undefined);
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLButtonElement | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  const [actionError, setActionError] = useState(""), [notice, setNotice] = useState("");
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const key = request + "|" + revision, current = result.key === key ? result : null;
  const loading = !current, data = current?.data, filtered = !!(query.q || query.status);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / query.page_size));

  useEffect(() => {
    if (notice && !loading) {
      noticeRef.current?.focus({ preventScroll: true });
      noticeRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [notice, loading]);

  useEffect(() => {
    if (window.location.pathname === "/admin/workspaces" && raw !== canonical && new URLSearchParams(window.location.search).toString() === raw) window.history.replaceState(null, "", "/admin/workspaces" + (canonical ? "?" + canonical : ""));
  }, [raw, canonical]);
  useEffect(() => {
    let live = true;
    const requested = readWorkspaceQuery(new URLSearchParams(request));
    const isCurrent = () => live && window.location.pathname === "/admin/workspaces" && workspaceQueryParams(readWorkspaceQuery(new URLSearchParams(window.location.search)), true).toString() === request;
    adminApi.list("workspaces", new URLSearchParams(request)).then(response => {
      if (!isCurrent()) return;
      if (!response || !Array.isArray(response.items) || !Number.isSafeInteger(response.total) || response.total < 0 || response.page !== requested.page || response.page_size !== requested.page_size || response.items.length > requested.page_size || response.items.length > response.total || response.items.some(row => !row || !Number.isSafeInteger(row.id) || row.id <= 0)) throw new Error("Dữ liệu danh sách không hợp lệ. Hãy thử tải lại.");
      const last = Math.min(100000, Math.max(1, Math.ceil(response.total / requested.page_size)));
      if (requested.page > last) { window.history.replaceState(null, "", workspaceListUrl({ ...requested, page: last })); return; }
      setResult({ key, data: response });
    }).catch(error => { if (isCurrent()) setResult({ key, error: message(error) }); });
    return () => { live = false; };
  }, [key, request]);
  function change(patch: Partial<WorkspaceListQuery>) {
    const next = { ...readWorkspaceQuery(new URLSearchParams(window.location.search)), ...patch }, url = workspaceListUrl(next);
    if (url !== window.location.pathname + window.location.search) window.history.pushState(null, "", url);
    setActionError(""); setNotice("");
  }
  function reset() { change({ q: "", status: "", page: 1 }); }
  function search(q: string) {
    if (q !== readWorkspaceQuery(new URLSearchParams(window.location.search)).q) change({ q, page: 1 });
  }
  async function edit(id: number) {
    const token = ++sequence.current, scope = request;
    const isCurrent = () => token === sequence.current && window.location.pathname === "/admin/workspaces" && workspaceQueryParams(readWorkspaceQuery(new URLSearchParams(window.location.search)), true).toString() === scope;
    setOpeningId(id); setActionError(""); setNotice("");
    try {
      const row = await adminApi.detail("workspaces", id);
      if (!isCurrent()) return;
      if (!row || row.id !== id || typeof row.name !== "string" || !Number.isSafeInteger(row.manager_id) || Number(row.manager_id) <= 0 || !Object.hasOwn(WORKSPACE_STATUSES, String(row.status))) throw new Error("Thông tin workspace không khớp hoặc không đầy đủ. Hãy tải lại danh sách.");
      setEditor(row);
    } catch (error) { if (isCurrent()) setActionError(message(error)); }
    finally { if (token === sequence.current) setOpeningId(null); }
  }
  function saved(name: string) { setEditor(undefined); setNotice(name); setRevision(value => value + 1); }
  return <div className={styles.list}>
    <section aria-labelledby="admin-workspaces-list-title" className={styles.filters}>
      <div className={styles.listHeader}><div><h2 id="admin-workspaces-list-title">Danh sách workspace</h2><p>Tra cứu workspace và Manager phụ trách. Workspace đã lưu trữ chỉ được xem.</p></div><button className={styles.primary} disabled={openingId !== null} onClick={event => { setReturnFocusTo(event.currentTarget); setEditor(null); setActionError(""); setNotice(""); }}><Plus size={16} aria-hidden="true" />Thêm mới</button></div>
      <div className={styles.toolbar + " " + workspace.toolbar}>
        <SearchForm value={query.q} onSearch={search} />
        <label><span id="admin-workspaces-status-label">Trạng thái</span><select aria-labelledby="admin-workspaces-status-label" value={query.status} onChange={event => change({ status: event.target.value, page: 1 })}><option value="">Tất cả trạng thái</option>{Object.entries(WORKSPACE_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span id="admin-workspaces-sort-label">Sắp xếp</span><select aria-labelledby="admin-workspaces-sort-label" value={query.sort} onChange={event => change({ sort: event.target.value, page: 1 })}>{Object.entries(WORKSPACE_SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {filtered && <div className={styles.chips} aria-label="Bộ lọc đang áp dụng">{query.q && <button onClick={() => change({ q: "", page: 1 })} aria-label={"Bỏ tìm kiếm: " + query.q}>Tìm: {query.q}<X size={13} aria-hidden="true" /></button>}{query.status && <button onClick={() => change({ status: "", page: 1 })} aria-label={"Bỏ lọc trạng thái: " + WORKSPACE_STATUSES[query.status]}>{WORKSPACE_STATUSES[query.status]}<X size={13} aria-hidden="true" /></button>}<button className={styles.reset} onClick={reset}>Xóa bộ lọc</button></div>}
    </section>
    {actionError && <p role="alert" className={styles.error}>{actionError}</p>}{notice && <p ref={noticeRef} tabIndex={-1} role="status" className={styles.success + " " + workspace.feedback}><strong>Đã lưu workspace thành công.</strong><span>Workspace: {notice}</span>{filtered && <span>Bộ lọc được giữ nguyên; workspace không còn khớp sẽ không xuất hiện trong kết quả.</span>}</p>}
    <section aria-labelledby="admin-workspaces-results-title" className={styles.results}>
      <div className={styles.resultsHeader}><h2 id="admin-workspaces-results-title">Kết quả tra cứu</h2><button className={styles.button} disabled={loading} onClick={() => { setActionError(""); setRevision(value => value + 1); }}><RefreshCw size={14} aria-hidden="true" />Làm mới danh sách</button></div>
      {loading ? <p role="status" className={styles.state}>Đang tải dữ liệu workspace…</p> : current?.error ? <div role="alert" className={styles.error}><p>{current.error}</p><button className={styles.button} onClick={() => setRevision(value => value + 1)}>Thử lại</button></div> : data && <>
        <p className={styles.scrollHint}>Cuộn ngang khi cần để xem đầy đủ các cột.</p>
        <div className={styles.tableRegion + " " + workspace.table} role="region" aria-label="Bảng workspace, cuộn ngang" tabIndex={0}>
          <table><caption className={styles.srOnly}>Danh sách workspace theo bộ lọc hiện tại</caption><thead><tr>{["Workspace", "Manager phụ trách", "Thành viên / Project", "Trạng thái"].map(label => <th scope="col" key={label}>{label}</th>)}<th scope="col" className={styles.actions}>Thao tác</th></tr></thead><tbody>
            {data.items.map(row => <tr key={row.id}><th scope="row"><span className={styles.name}>{String(row.name || "Workspace #" + row.id)}</span><small className={styles.email}>ID #{row.id}</small></th><td className={workspace.manager}><span className={styles.name}>{String(row.manager_name || "Manager #" + row.manager_id)}</span><span className={styles.email}>{String(row.manager_email ?? "—")}</span></td><td className={workspace.counts}><span>{workspaceCount(row.member_count)} thành viên</span><span>{workspaceCount(row.project_count)} project</span></td><td><span className={styles.status + " " + (row.status === "ACTIVE" ? styles.active : styles.inactive)}>{WORKSPACE_STATUSES[String(row.status)] ?? "Chưa rõ"}</span></td><td className={styles.actions}><button className={styles.button} disabled={openingId !== null} aria-label={(row.status === "ARCHIVED" ? "Xem chi tiết workspace " : "Chỉnh sửa workspace ") + row.name} onClick={event => { setReturnFocusTo(event.currentTarget); void edit(row.id); }}>{openingId === row.id ? "Đang mở…" : row.status === "ARCHIVED" ? "Xem chi tiết" : "Chỉnh sửa"}</button></td></tr>)}
          </tbody></table>
        </div>
        {data.items.length === 0 && <div className={styles.empty}><Building2 size={28} aria-hidden="true" /><h3>{data.total > 0 ? "Trang này chưa có workspace" : filtered ? "Không có dữ liệu phù hợp." : "Chưa có workspace"}</h3><p>{data.total > 0 ? "Danh sách có thể vừa thay đổi. Hãy làm mới để kiểm tra lại." : filtered ? "Thử từ khóa khác hoặc xóa bộ lọc để mở rộng kết quả." : "Tạo workspace và giao cho một Manager đang hoạt động."}</p>{filtered && <button className={styles.button} onClick={reset}>Xóa bộ lọc</button>}</div>}
        <div className={styles.pagination}><span role="status">{data.total.toLocaleString("vi-VN")} kết quả · Trang {query.page}/{totalPages}{data.items.length > 0 && <small>Hiển thị {(query.page - 1) * query.page_size + 1}–{(query.page - 1) * query.page_size + data.items.length}</small>}</span><div><label><span id="admin-workspaces-size-label">Số dòng mỗi trang</span><select aria-labelledby="admin-workspaces-size-label" value={query.page_size} onChange={event => change({ page_size: Number(event.target.value), page: 1 })}>{WORKSPACE_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label><nav aria-label="Phân trang workspace"><button className={styles.button} disabled={query.page <= 1} onClick={() => change({ page: query.page - 1 })}>Trước</button><button className={styles.button} disabled={query.page >= totalPages || query.page >= 100000} onClick={() => change({ page: query.page + 1 })}>Sau</button></nav></div></div>
      </>}
    </section>
    {editor !== undefined && <AdminWorkspaceEditor row={editor} returnFocusTo={returnFocusTo} onCancel={() => setEditor(undefined)} onSaved={saved} />}
  </div>;
}
