"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, RefreshCw, Search, Users, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { initials } from "@/components/VehicSimUi";
import { adminApi, type AdminPageData, type AdminRow } from "@/services/admin";
import { readUserQuery, userListUrl, userQueryParams, USER_PAGE_SIZES, USER_ROLES, USER_SORTS, USER_STATUSES, type UserListQuery } from "./adminUsersQuery";
import styles from "./AdminTable.module.css";
import userStyles from "./AdminUsers.module.css";

type EditorProps = { row: AdminRow | null; actorId?: string; returnFocusTo?: HTMLElement | null; onCancel: () => void; onSaved: (email: string) => void };
type Result = { key: string; data?: AdminPageData; error?: string };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Không thực hiện được thao tác. Hãy thử lại.";

function SearchForm({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [draft, setDraft] = useState(value);
  return <form className={styles.search} onSubmit={event => { event.preventDefault(); onSearch(draft.trim()); }}>
    <label htmlFor="admin-users-search">Tìm kiếm</label>
    <div><span className={styles.searchInput}><Search size={16} aria-hidden="true" /><input id="admin-users-search" aria-label="Từ khóa tìm kiếm" type="search" maxLength={100} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Tên hoặc email" /></span><button type="submit" className={styles.button}>Tìm</button></div>
  </form>;
}


export function AdminUsersTable({ renderEditor }: { renderEditor: (props: EditorProps) => ReactNode }) {
  const { user } = useAuth();
  const searchParams = useSearchParams(), raw = searchParams.toString();
  const query = useMemo(() => readUserQuery(new URLSearchParams(raw)), [raw]);
  const canonical = userQueryParams(query).toString(), request = userQueryParams(query, true).toString();
  const [result, setResult] = useState<Result>({ key: "" });
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<AdminRow | null | undefined>(undefined);
  const detailSequence = useRef(0);
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLButtonElement | null>(null);
  useEffect(() => () => { detailSequence.current++; }, []);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const key = `${request}|${revision}`;
  const current = result.key === key ? result : null;
  const loading = !current, data = current?.data;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / query.page_size));
  const filtered = !!(query.q || query.role || query.status);

  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  useEffect(() => {
    if (window.location.pathname === "/admin/users" && raw !== canonical && new URLSearchParams(window.location.search).toString() === raw) {
      window.history.replaceState(null, "", `/admin/users${canonical ? `?${canonical}` : ""}`);
    }
  }, [raw, canonical]);

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams(request), requested = readUserQuery(params);
    const isCurrent = () => live && window.location.pathname === "/admin/users" && userQueryParams(readUserQuery(new URLSearchParams(window.location.search)), true).toString() === request;
    adminApi.list("users", params).then(response => {
      if (!isCurrent()) return;
      if (!response || !Array.isArray(response.items) || !Number.isSafeInteger(response.total) || response.total < 0 || response.page !== requested.page || response.page_size !== requested.page_size || response.items.length > requested.page_size || response.items.length > response.total || response.items.some(row => !row || !Number.isSafeInteger(row.id) || row.id <= 0)) throw new Error("Dữ liệu danh sách không hợp lệ. Hãy thử tải lại.");
      const lastPage = Math.min(100000, Math.max(1, Math.ceil(response.total / requested.page_size)));
      if (requested.page > lastPage) {
        window.history.replaceState(null, "", userListUrl({ ...requested, page: lastPage }));
        return;
      }
      setResult({ key, data: response });
    }).catch(error => { if (isCurrent()) setResult({ key, error: errorMessage(error) }); });
    return () => { live = false; };
  }, [request, key]);

  function change(patch: Partial<UserListQuery>) {
    const next = { ...readUserQuery(new URLSearchParams(window.location.search)), ...patch };
    const url = userListUrl(next);
    if (url !== window.location.pathname + window.location.search) window.history.pushState(null, "", url);
    setActionError(""); setNotice("");
  }
  function reset() { change({ q: "", role: "", status: "", page: 1 }); }
  async function edit(id: number) {
    setOpeningId(id); setActionError(""); setNotice("");
    const sequence = ++detailSequence.current, scope = request;
    const current = () => sequence === detailSequence.current && window.location.pathname === "/admin/users" && userQueryParams(readUserQuery(new URLSearchParams(window.location.search)), true).toString() === scope;
    try {
      const detail = await adminApi.detail("users", id);
      if (!current()) return;
      if (!detail || detail.id !== id || typeof detail.email !== "string" || typeof detail.last_name !== "string" || typeof detail.first_name !== "string" || !Object.hasOwn(USER_ROLES, String(detail.role)) || ![true, false, 0, 1].includes(detail.is_active as boolean | number)) throw new Error("Thông tin tài khoản không khớp hoặc không đầy đủ. Hãy tải lại danh sách.");
      setEditor(detail);
    }
    catch (error) { if (current()) setActionError(errorMessage(error)); }
    finally { if (sequence === detailSequence.current) setOpeningId(null); }
  }
  function saved(email: string) { setEditor(undefined); setNotice(email); setRevision(value => value + 1); }

  return <div className={styles.list}>
    <section aria-labelledby="admin-users-list-title" className={styles.filters}>
      <div className={styles.listHeader}><div><h2 id="admin-users-list-title">Danh sách tài khoản</h2><p>Tra cứu người dùng theo tên, email, vai trò và trạng thái.</p></div><button className={styles.primary} disabled={openingId !== null} onClick={event => { setReturnFocusTo(event.currentTarget); setEditor(null); setNotice(""); setActionError(""); }}><Plus size={16} aria-hidden="true" />Thêm mới</button></div>
      <div className={styles.toolbar}>
        <SearchForm key={query.q} value={query.q} onSearch={q => change({ q, page: 1 })} />
        <label><span id="admin-users-status-label">Trạng thái</span><select aria-labelledby="admin-users-status-label" value={query.status} onChange={event => change({ status: event.target.value, page: 1 })}><option value="">Tất cả trạng thái</option>{Object.entries(USER_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span id="admin-users-role-label">Vai trò</span><select aria-labelledby="admin-users-role-label" value={query.role} onChange={event => change({ role: event.target.value, page: 1 })}><option value="">Tất cả vai trò</option>{Object.entries(USER_ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span id="admin-users-sort-label">Sắp xếp</span><select aria-labelledby="admin-users-sort-label" value={query.sort} onChange={event => change({ sort: event.target.value, page: 1 })}>{Object.entries(USER_SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {filtered && <div className={styles.chips} aria-label="Bộ lọc đang áp dụng">
        {query.q && <button onClick={() => change({ q: "", page: 1 })} aria-label={`Bỏ tìm kiếm: ${query.q}`}>Tìm: {query.q}<X size={13} aria-hidden="true" /></button>}
        {query.role && <button onClick={() => change({ role: "", page: 1 })} aria-label="Bỏ lọc vai trò">{USER_ROLES[query.role]}<X size={13} aria-hidden="true" /></button>}
        {query.status && <button onClick={() => change({ status: "", page: 1 })} aria-label="Bỏ lọc trạng thái">{USER_STATUSES[query.status]}<X size={13} aria-hidden="true" /></button>}
        <button onClick={reset} className={styles.reset}>Xóa bộ lọc</button>
      </div>}
    </section>
    {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
    {notice && <p ref={noticeRef} tabIndex={-1} role="status" className={styles.success + " " + userStyles.feedback}><strong>Đã lưu thành công.</strong><span>Tài khoản: {notice}</span>{filtered && <span>Bộ lọc được giữ nguyên; tài khoản không còn khớp sẽ không xuất hiện trong kết quả.</span>}</p>}
    <section aria-labelledby="admin-users-results-title" className={styles.results}>
      <div className={styles.resultsHeader}><h2 id="admin-users-results-title">Kết quả tra cứu</h2><button className={styles.button} disabled={loading} onClick={() => { setActionError(""); setRevision(value => value + 1); }}><RefreshCw size={14} aria-hidden="true" />Làm mới danh sách</button></div>
      {loading ? <p role="status" className={styles.state}>Đang tải dữ liệu tài khoản…</p> : current?.error ? <div role="alert" className={styles.error}><p>{current.error}</p><button className={styles.button} onClick={() => setRevision(value => value + 1)}>Thử lại</button></div> : data && <>
        <p className={styles.scrollHint}>Cuộn ngang khi cần để xem đầy đủ các cột.</p>
        <div className={styles.tableRegion + " " + userStyles.table} role="region" aria-label="Bảng tài khoản, cuộn ngang" tabIndex={0}>
          <table><caption className={styles.srOnly}>Danh sách tài khoản theo bộ lọc hiện tại</caption><thead><tr><th scope="col">Tài khoản</th><th scope="col">Vai trò</th><th scope="col">Trạng thái</th><th scope="col" className={styles.actions}>Thao tác</th></tr></thead><tbody>
            {data.items.map(row => {
              const name = String(row.full_name || row.email || `Tài khoản #${row.id}`), email = String(row.email ?? "—");
              const enabled = row.is_active === true || row.is_active === 1, disabled = row.is_active === false || row.is_active === 0;
              return <tr key={row.id}>
                <th scope="row"><div className={styles.identity}><span className={styles.avatar} aria-hidden="true">{initials(name)}</span><span><span className={styles.name}>{name}{String(row.id) === user?.id && <small className={styles.you}>Bạn</small>}</span><span className={styles.email}>{email}</span></span></div></th>
                <td><span className={styles.role}>{USER_ROLES[String(row.role)] ?? String(row.role ?? "Chưa rõ")}</span></td>
                <td><span className={`${styles.status} ${enabled ? styles.active : styles.inactive}`}>{enabled ? "Đang hoạt động" : disabled ? "Đã khóa" : "Chưa rõ"}</span></td>
                <td className={styles.actions}><button className={styles.button} aria-label={`Chỉnh sửa tài khoản ${email}`} disabled={openingId !== null} onClick={event => { setReturnFocusTo(event.currentTarget); void edit(row.id); }}>{openingId === row.id ? "Đang mở…" : "Chỉnh sửa"}</button></td>
              </tr>;
            })}
          </tbody></table>
        </div>
        {data.items.length === 0 && <div className={styles.empty}><Users size={28} aria-hidden="true" /><h3>{data.total > 0 ? "Trang này chưa có tài khoản" : filtered ? "Không có dữ liệu phù hợp." : "Chưa có tài khoản"}</h3><p>{data.total > 0 ? "Danh sách có thể vừa thay đổi. Hãy làm mới để kiểm tra lại." : filtered ? "Thử từ khóa khác hoặc xóa bộ lọc để mở rộng kết quả." : "Tạo tài khoản mới bằng nút Thêm mới."}</p>{filtered && <button className={styles.button} onClick={reset}>Xóa bộ lọc</button>}</div>}
        <div className={styles.pagination}>
          <span role="status"><span>{data.total.toLocaleString("vi-VN")} kết quả · Trang {query.page}/{totalPages}</span>{data.items.length > 0 && <small>Hiển thị {(query.page - 1) * query.page_size + 1}–{(query.page - 1) * query.page_size + data.items.length}</small>}</span>
          <div><label><span id="admin-users-page-size-label">Số dòng mỗi trang</span><select aria-labelledby="admin-users-page-size-label" value={query.page_size} onChange={event => change({ page_size: Number(event.target.value), page: 1 })}>{USER_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label><nav aria-label="Phân trang tài khoản"><button className={styles.button} disabled={query.page <= 1} onClick={() => change({ page: query.page - 1 })}>Trước</button><button className={styles.button} disabled={query.page >= totalPages || query.page >= 100000} onClick={() => change({ page: query.page + 1 })}>Sau</button></nav></div>
        </div>
      </>}
    </section>
    {editor !== undefined && renderEditor({ row: editor, actorId: user?.id, returnFocusTo, onCancel: () => setEditor(undefined), onSaved: saved })}
  </div>;
}
