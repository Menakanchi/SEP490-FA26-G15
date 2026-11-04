"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, RefreshCw, Search, BookOpen, X } from "lucide-react";
import { adminApi, type AdminPageData, type AdminRow } from "@/services/admin";
import { readReferenceQuery, referenceListUrl, referenceQueryParams, REFERENCE_PAGE_SIZES, REFERENCE_KINDS, REFERENCE_SORTS, REFERENCE_STATUSES, type ReferenceListQuery } from "./adminReferences";
import styles from "./AdminTable.module.css";
import { AdminReferenceEditor } from "./AdminReferenceEditor";
import { workspaceDate } from "./adminWorkspacesQuery";

type Result = { key: string; data?: AdminPageData; error?: string };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Không thực hiện được thao tác. Hãy thử lại.";

function SearchForm({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [draft, setDraft] = useState(value);
  return <form className={styles.search} onSubmit={event => { event.preventDefault(); onSearch(draft.trim()); }}>
    <label htmlFor="admin-references-search">Tìm kiếm</label>
    <div><span className={styles.searchInput}><Search size={16} aria-hidden="true" /><input id="admin-references-search" aria-label="Từ khóa tìm kiếm" type="search" maxLength={100} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Tên hoặc mã" /></span><button type="submit" className={styles.button}>Tìm</button></div>
  </form>;
}

export function AdminReferencesTable() {
  const searchParams = useSearchParams(), raw = searchParams.toString();
  const query = useMemo(() => readReferenceQuery(new URLSearchParams(raw)), [raw]);
  const canonical = referenceQueryParams(query).toString(), request = referenceQueryParams(query, true).toString();
  const [result, setResult] = useState<Result>({ key: "" });
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<AdminRow | null | undefined>(undefined);
  const detailSequence = useRef(0);
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLButtonElement | null>(null);
  useEffect(() => () => { detailSequence.current++; }, []);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const key = `${request}|${revision}`;
  const current = result.key === key ? result : null;
  const loading = !current, data = current?.data;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / query.page_size));
  const filtered = !!(query.q || query.role || query.status);

  useEffect(() => {
    if (window.location.pathname === "/admin/tech-references" && raw !== canonical && new URLSearchParams(window.location.search).toString() === raw) {
      window.history.replaceState(null, "", `/admin/tech-references${canonical ? `?${canonical}` : ""}`);
    }
  }, [raw, canonical]);

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams(request), requested = readReferenceQuery(params);
    const isCurrent = () => live && window.location.pathname === "/admin/tech-references" && referenceQueryParams(readReferenceQuery(new URLSearchParams(window.location.search)), true).toString() === request;
    adminApi.list("tech-references", params).then(response => {
      if (!isCurrent()) return;
      if (!response || !Array.isArray(response.items) || !Number.isSafeInteger(response.total) || response.total < 0 || response.page !== requested.page || response.page_size !== requested.page_size || response.items.length > requested.page_size || response.items.length > response.total || response.items.some(row => !row || !Number.isSafeInteger(row.id) || row.id <= 0)) throw new Error("Dữ liệu danh sách không hợp lệ. Hãy thử tải lại.");
      const lastPage = Math.min(100000, Math.max(1, Math.ceil(response.total / requested.page_size)));
      if (requested.page > lastPage) {
        window.history.replaceState(null, "", referenceListUrl({ ...requested, page: lastPage }));
        return;
      }
      setResult({ key, data: response });
    }).catch(error => { if (isCurrent()) setResult({ key, error: errorMessage(error) }); });
    return () => { live = false; };
  }, [request, key]);

  function change(patch: Partial<ReferenceListQuery>) {
    const next = { ...readReferenceQuery(new URLSearchParams(window.location.search)), ...patch };
    const url = referenceListUrl(next);
    if (url !== window.location.pathname + window.location.search) window.history.pushState(null, "", url);
    setActionError(""); setNotice("");
  }
  function reset() { change({ q: "", role: "", status: "", page: 1 }); }
  async function edit(id: number) {
    setOpeningId(id); setActionError(""); setNotice("");
    const sequence = ++detailSequence.current, scope = request;
    const current = () => sequence === detailSequence.current && window.location.pathname === "/admin/tech-references" && referenceQueryParams(readReferenceQuery(new URLSearchParams(window.location.search)), true).toString() === scope;
    try {
      const detail = await adminApi.detail("tech-references", id);
      if (!current()) return;
      if (!detail || detail.id !== id || typeof detail.ref_code !== "string" || typeof detail.ref_name !== "string" || !Object.hasOwn(REFERENCE_KINDS, String(detail.ref_type)) || (detail.ref_value != null && typeof detail.ref_value !== "string") || ![true, false, 0, 1].includes(detail.is_active as boolean | number)) throw new Error("Thông tin tài liệu kỹ thuật không khớp hoặc không đầy đủ. Hãy tải lại danh sách.");
      setEditor(detail);
    }
    catch (error) { if (current()) setActionError(errorMessage(error)); }
    finally { if (sequence === detailSequence.current) setOpeningId(null); }
  }
  function saved() { setEditor(undefined); setNotice("Đã lưu thành công."); setRevision(value => value + 1); }

  return <div className={styles.list}>
    <section aria-labelledby="admin-references-list-title" className={styles.filters}>
      <div className={styles.listHeader}><div><h2 id="admin-references-list-title">Danh sách tài liệu kỹ thuật</h2><p>Tra cứu mã, tên, loại và trạng thái của tài liệu tham khảo.</p></div><button className={styles.primary} disabled={openingId !== null} onClick={event => { setReturnFocusTo(event.currentTarget); setEditor(null); setNotice(""); setActionError(""); }}><Plus size={16} aria-hidden="true" />Thêm mới</button></div>
      <div className={styles.toolbar}>
        <SearchForm key={query.q} value={query.q} onSearch={q => change({ q, page: 1 })} />
        <label><span id="admin-references-status-label">Trạng thái</span><select aria-labelledby="admin-references-status-label" value={query.status} onChange={event => change({ status: event.target.value, page: 1 })}><option value="">Tất cả trạng thái</option>{Object.entries(REFERENCE_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span id="admin-references-role-label">Loại</span><select aria-labelledby="admin-references-role-label" value={query.role} onChange={event => change({ role: event.target.value, page: 1 })}><option value="">Tất cả loại</option>{Object.entries(REFERENCE_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span id="admin-references-sort-label">Sắp xếp</span><select aria-labelledby="admin-references-sort-label" value={query.sort} onChange={event => change({ sort: event.target.value, page: 1 })}>{Object.entries(REFERENCE_SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {filtered && <div className={styles.chips} aria-label="Bộ lọc đang áp dụng">
        {query.q && <button onClick={() => change({ q: "", page: 1 })} aria-label={`Bỏ tìm kiếm: ${query.q}`}>Tìm: {query.q}<X size={13} aria-hidden="true" /></button>}
        {query.role && <button onClick={() => change({ role: "", page: 1 })} aria-label="Bỏ lọc loại">{REFERENCE_KINDS[query.role]}<X size={13} aria-hidden="true" /></button>}
        {query.status && <button onClick={() => change({ status: "", page: 1 })} aria-label="Bỏ lọc trạng thái">{REFERENCE_STATUSES[query.status]}<X size={13} aria-hidden="true" /></button>}
        <button onClick={reset} className={styles.reset}>Xóa bộ lọc</button>
      </div>}
    </section>
    {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
    {notice && <p role="status" className={styles.success}>{notice}</p>}
    <section aria-labelledby="admin-references-results-title" className={styles.results}>
      <div className={styles.resultsHeader}><h2 id="admin-references-results-title">Kết quả tra cứu</h2><button className={styles.button} disabled={loading} onClick={() => { setActionError(""); setRevision(value => value + 1); }}><RefreshCw size={14} aria-hidden="true" />Làm mới danh sách</button></div>
      {loading ? <p role="status" className={styles.state}>Đang tải dữ liệu tài liệu kỹ thuật…</p> : current?.error ? <div role="alert" className={styles.error}><p>{current.error}</p><button className={styles.button} onClick={() => setRevision(value => value + 1)}>Thử lại</button></div> : data && <>
        <p className={styles.scrollHint}>Cuộn ngang khi cần để xem đầy đủ các cột.</p>
        <div className={styles.tableRegion} role="region" aria-label="Bảng tài liệu kỹ thuật, cuộn ngang" tabIndex={0}>
          <table><caption className={styles.srOnly}>Danh sách tài liệu kỹ thuật theo bộ lọc hiện tại</caption><thead><tr><th scope="col">Tài liệu</th><th scope="col">Loại</th><th scope="col">Giá trị / Đơn vị</th><th scope="col">Trạng thái</th><th scope="col">Cập nhật</th><th scope="col" className={styles.actions}>Thao tác</th></tr></thead><tbody>
            {data.items.map(row => {
              const enabled = row.is_active === true || row.is_active === 1, disabled = row.is_active === false || row.is_active === 0;
              return <tr key={row.id}>
                <th scope="row"><span className={styles.name}>{String(row.ref_name || "Tài liệu #" + row.id)}</span><span className={styles.email}>{String(row.ref_code ?? "—")} · ID #{row.id}</span></th>
                <td>{REFERENCE_KINDS[String(row.ref_type)] ?? "Chưa rõ"}</td>
                <td><span className={styles.name}>{row.ref_value == null ? "—" : String(row.ref_value)}</span><small className={styles.email}>{String(row.unit ?? "—")}</small></td>
                <td><span className={styles.status + " " + (enabled ? styles.active : styles.inactive)}>{enabled ? "Đang bật" : disabled ? "Đã tắt" : "Chưa rõ"}</span></td>
                <td>{workspaceDate(row.updated_at)}</td>
                <td className={styles.actions}><button className={styles.button} aria-label={"Chỉnh sửa tài liệu " + row.ref_code} disabled={openingId !== null} onClick={event => { setReturnFocusTo(event.currentTarget); void edit(row.id); }}>{openingId === row.id ? "Đang mở…" : "Chỉnh sửa"}</button></td>
              </tr>;
            })}
          </tbody></table>
        </div>
        {data.items.length === 0 && <div className={styles.empty}><BookOpen size={28} aria-hidden="true" /><h3>{data.total > 0 ? "Trang này chưa có tài liệu kỹ thuật" : filtered ? "Không có dữ liệu phù hợp." : "Chưa có tài liệu kỹ thuật"}</h3><p>{data.total > 0 ? "Danh sách có thể vừa thay đổi. Hãy làm mới để kiểm tra lại." : filtered ? "Thử từ khóa khác hoặc xóa bộ lọc để mở rộng kết quả." : "Tạo tài liệu kỹ thuật mới bằng nút Thêm mới."}</p>{filtered && <button className={styles.button} onClick={reset}>Xóa bộ lọc</button>}</div>}
        <div className={styles.pagination}>
          <span role="status"><span>{data.total.toLocaleString("vi-VN")} kết quả · Trang {query.page}/{totalPages}</span>{data.items.length > 0 && <small>Hiển thị {(query.page - 1) * query.page_size + 1}–{(query.page - 1) * query.page_size + data.items.length}</small>}</span>
          <div><label><span id="admin-references-page-size-label">Số dòng mỗi trang</span><select aria-labelledby="admin-references-page-size-label" value={query.page_size} onChange={event => change({ page_size: Number(event.target.value), page: 1 })}>{REFERENCE_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label><nav aria-label="Phân trang tài liệu kỹ thuật"><button className={styles.button} disabled={query.page <= 1} onClick={() => change({ page: query.page - 1 })}>Trước</button><button className={styles.button} disabled={query.page >= totalPages || query.page >= 100000} onClick={() => change({ page: query.page + 1 })}>Sau</button></nav></div>
        </div>
      </>}
    </section>
    {editor !== undefined && <AdminReferenceEditor row={editor} returnFocusTo={returnFocusTo} onCancel={() => setEditor(undefined)} onSaved={saved} />}
  </div>;
}
