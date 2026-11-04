"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Building2, UserRound, X } from "lucide-react";
import { adminApi, type AdminPageData, type AdminRow } from "@/services/admin";
import { workspaceCount, workspaceDate, WORKSPACE_STATUSES } from "./adminWorkspacesQuery";
import styles from "./AdminUserEditor.module.css";
import workspace from "./AdminWorkspaces.module.css";

type Body = { name: string; description: string | null; manager_id: number };
type Manager = { id: number; name: string; email: string };
type Phase = "form" | "review" | "discard";
const message = (error: unknown) => error instanceof Error ? error.message : "Không thực hiện được thao tác. Hãy thử lại.";
function managerLabel(manager: Manager | null) { return manager ? manager.name + " · " + manager.email + " · ID #" + manager.id : "Chưa chọn Manager"; }
export function AdminWorkspaceEditor({ row, returnFocusTo, onCancel, onSaved }: { row: AdminRow | null; returnFocusTo?: HTMLElement | null; onCancel: () => void; onSaved: () => void }) {
  const readOnly = row?.status === "ARCHIVED";
  const [initial] = useState<Body>(() => ({ name: String(row?.name ?? "").trim(), description: String(row?.description ?? "").trim() || null, manager_id: Number(row?.manager_id ?? 0) }));
  const [initialManager] = useState<Manager | null>(() => row ? { id: Number(row.manager_id), name: String(row.manager_name || "Manager #" + row.manager_id), email: String(row.manager_email ?? "—") } : null);
  const [name, setName] = useState(String(row?.name ?? "")), [description, setDescription] = useState(String(row?.description ?? ""));
  const [selected, setSelected] = useState<Manager | null>(initialManager);
  const [phase, setPhase] = useState<Phase>("form"), [pending, setPending] = useState<Body | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({}), [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saveLock = useRef(false), dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null), errorRef = useRef<HTMLDivElement>(null), backRef = useRef<HTMLButtonElement>(null), keepRef = useRef<HTMLButtonElement>(null), closeRef = useRef<HTMLButtonElement>(null);
  const managerSearchRef = useRef<HTMLInputElement>(null);
  const [managerSearch, setManagerSearch] = useState("");
  const [managerQuery, setManagerQuery] = useState({ q: "", page: 1, revision: 0 });
  const managerKey = JSON.stringify(managerQuery);
  const [managerResult, setManagerResult] = useState<{ key: string; data?: AdminPageData; error?: string }>({ key: "" });
  const current = managerResult.key === managerKey ? managerResult : null;
  const managerLoading = !readOnly && !current, managerError = current?.error, managerData = current?.data;
  const body: Body = { name: name.trim(), description: description.trim() || null, manager_id: selected?.id ?? 0 };
  const dirty = JSON.stringify(body) !== JSON.stringify(initial), after = pending ?? body;
  const managerChanged = !!row && initial.manager_id !== after.manager_id;
  const changes = [
    { label: "Tên workspace", before: initial.name, after: after.name, changed: initial.name !== after.name },
    { label: "Mô tả", before: initial.description, after: after.description, changed: initial.description !== after.description },
    { label: "Manager phụ trách", before: managerLabel(initialManager), after: managerLabel(selected), changed: initial.manager_id !== after.manager_id },
  ].filter(change => !row || change.changed);

  useEffect(() => {
    const opener = returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null), dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); };
  }, [returnFocusTo]);
  useEffect(() => {
    if (phase === "review") backRef.current?.focus();
    else if (phase === "discard") keepRef.current?.focus();
    else if (error) errorRef.current?.focus();
    else if (readOnly) closeRef.current?.focus();
    else nameRef.current?.focus();
  }, [phase, error, readOnly]);
  useEffect(() => {
    if (readOnly) return;
    let live = true;
    const params = new URLSearchParams({ role: "MANAGER", status: "ACTIVE", sort: "name", page_size: "20", q: managerQuery.q, page: String(managerQuery.page) });
    adminApi.list("users", params).then(data => {
      if (!live) return;
      if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0 || data.page !== managerQuery.page || data.page_size !== 20 || data.items.length > 20 || data.items.length > data.total || data.items.some(item => !item || !Number.isSafeInteger(item.id) || item.id <= 0 || item.role !== "MANAGER" || ![true, 1].includes(item.is_active as boolean | number) || typeof item.email !== "string")) throw new Error("Danh sách Manager không hợp lệ. Hãy thử tải lại.");
      const last = Math.min(100000, Math.max(1, Math.ceil(data.total / 20)));
      if (managerQuery.page > last) { setManagerQuery(value => ({ ...value, page: last })); return; }
      setManagerResult({ key: managerKey, data });
    }).catch(error => { if (live) setManagerResult({ key: managerKey, error: message(error) }); });
    return () => { live = false; };
  }, [managerKey, managerQuery.page, managerQuery.q, readOnly]);

  function close() { if (saveLock.current) return; if (!readOnly && dirty) setPhase("discard"); else onCancel(); }
  function escape() { if (saveLock.current) return; if (phase !== "form") setPhase("form"); else close(); }
  function searchManagers() { setManagerQuery(value => ({ q: managerSearch.trim(), page: 1, revision: value.revision + 1 })); }
  function prepare(event: FormEvent) {
    event.preventDefault();
    if (saveLock.current || readOnly || managerLoading || managerError) return;
    setError("");
    const invalid: Record<string, string> = {};
    if (!body.name) invalid.name = "Vui lòng nhập tên workspace.";
    else if (body.name.length > 150) invalid.name = "Tên workspace tối đa 150 ký tự.";
    if (description.length > 10000) invalid.description = "Mô tả tối đa 10000 ký tự.";
    if (!Number.isSafeInteger(body.manager_id) || body.manager_id <= 0) invalid.manager = "Chọn một Manager đang hoạt động.";
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() => { if (invalid.name) nameRef.current?.focus(); else if (invalid.description) document.getElementById("admin-workspace-description")?.focus(); else managerSearchRef.current?.focus(); });
      return;
    }
    if (row && !dirty) return;
    setPending(body); setPhase("review");
  }
  async function save() {
    if (saveLock.current || readOnly || !pending) return;
    saveLock.current = true; setBusy(true); setError("");
    try { await adminApi.save("workspaces", row?.id ?? null, pending); onSaved(); }
    catch (error) { setError(message(error)); setPending(null); setPhase("form"); }
    finally { saveLock.current = false; setBusy(false); }
  }

  return <dialog ref={dialogRef} className={styles.dialog} aria-modal="true" aria-labelledby="admin-workspace-title" aria-describedby="admin-workspace-target" onCancel={event => { event.preventDefault(); escape(); }} onKeyDownCapture={event => {
    if (event.key === "Tab") {
      const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, input, textarea, select, [tabindex]")).filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
      const first = elements[0], last = elements.at(-1);
      if (first && last && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); escape(); }
  }}>
    <div className={styles.shell}>
      <header className={styles.header}><div><p className={styles.eyebrow}>QUẢN LÝ WORKSPACE</p><h2 id="admin-workspace-title">{readOnly ? "Chi tiết" : row ? "Chỉnh sửa" : "Thêm mới"} · Workspace</h2><p id="admin-workspace-target">{row ? String(row.name) + " · ID #" + row.id : "Tạo không gian làm việc và giao cho một Manager đang hoạt động."}</p></div><button type="button" className={styles.close} aria-label="Đóng biểu mẫu" disabled={busy} onClick={close}><X size={19} aria-hidden="true" /></button></header>
      <div className={styles.body}>
        {error && <div ref={errorRef} tabIndex={-1} role="alert" className={styles.error}>{error}</div>}
        {phase === "discard" ? <section><h3>Bỏ thay đổi chưa lưu?</h3><p className={styles.description}>Dữ liệu đang nhập cho workspace {row?.name || name || "mới"} sẽ bị bỏ khỏi biểu mẫu.</p></section> : phase === "review" ? <section>
          <h3>{row ? "Xác nhận thay đổi workspace" : "Xác nhận tạo workspace"}</h3><p className={styles.description}>{row ? "Kiểm tra thay đổi cho " + row.name + " trước khi lưu." : "Workspace " + after.name + " sẽ được tạo ở trạng thái hoạt động."}</p>
          <div className={styles.reviewTable} role="region" aria-label="Nội dung xác nhận workspace" tabIndex={0}><table><thead><tr><th scope="col">Thông tin</th>{row && <th scope="col">Hiện tại</th>}<th scope="col">Sau khi {row ? "lưu" : "tạo"}</th></tr></thead><tbody>{changes.map(change => <tr key={change.label}><th scope="row">{change.label}</th>{row && <td>{change.before || "—"}</td>}<td>{change.after || "—"}</td></tr>)}</tbody></table></div>
          {!row || managerChanged ? <div className={styles.impact} aria-label="Ảnh hưởng khi giao Manager"><strong>Giao Manager phụ trách</strong><p>{managerLabel(selected)} sẽ nhận thông báo được giao quản lý workspace sau khi lưu thành công.</p><p>Hệ thống kiểm tra lại tài khoản phải còn vai trò MANAGER và đang hoạt động khi lưu.</p></div> : <p className={styles.note}>Manager phụ trách giữ nguyên; thay đổi tên hoặc mô tả không gửi thông báo giao workspace.</p>}
        </section> : <>
          {row && <dl className={styles.summary} aria-label="Thông tin workspace hiện tại"><div><dt>Trạng thái</dt><dd>{WORKSPACE_STATUSES[String(row.status)]}</dd></div><div><dt>Thành viên</dt><dd>{workspaceCount(row.member_count)}</dd></div><div><dt>Project</dt><dd>{workspaceCount(row.project_count)}</dd></div></dl>}
          {readOnly ? <><p className={styles.note}>Workspace đã lưu trữ, chỉ được xem thông tin.</p><dl className={workspace.details}><dt>Manager phụ trách</dt><dd>{managerLabel(initialManager)}</dd><dt>Mô tả</dt><dd>{initial.description || "Chưa có mô tả."}</dd><dt>Ngày tạo</dt><dd>{workspaceDate(row?.created_date ?? null)}</dd><dt>Cập nhật</dt><dd>{workspaceDate(row?.updated_at ?? null)}</dd></dl></> : <form id="admin-workspace-form" noValidate onSubmit={prepare}>
            {Object.values(errors).some(Boolean) && <p role="alert" className={styles.error}>Vui lòng kiểm tra các trường được đánh dấu bên dưới.</p>}
            <fieldset className={styles.fieldset} disabled={busy}><legend><Building2 size={16} aria-hidden="true" />Thông tin workspace</legend>
              <label htmlFor="admin-workspace-name">Tên workspace *</label><input ref={nameRef} id="admin-workspace-name" name="name" value={name} required maxLength={150} aria-invalid={!!errors.name} aria-describedby="admin-workspace-name-error" onChange={event => { setName(event.target.value); setErrors(value => ({ ...value, name: "" })); }} /><p id="admin-workspace-name-error" className={styles.fieldError}>{errors.name}</p>
              <label htmlFor="admin-workspace-description" className={styles.hint}>Mô tả</label><textarea id="admin-workspace-description" name="description" className={workspace.textarea} value={description} maxLength={10000} rows={3} aria-invalid={!!errors.description} aria-describedby="admin-workspace-description-error" onChange={event => { setDescription(event.target.value); setErrors(value => ({ ...value, description: "" })); }} /><p id="admin-workspace-description-error" className={styles.fieldError}>{errors.description}</p>
            </fieldset>
            <fieldset className={styles.fieldset} disabled={busy}><legend><UserRound size={16} aria-hidden="true" />Manager phụ trách *</legend><p className={styles.hint}>Chọn tài khoản có vai trò MANAGER đang hoạt động. Tìm theo tên hoặc email; mỗi trang tối đa 20 kết quả.</p>
              <p className={styles.note} aria-label="Manager đang chọn">{managerLabel(selected)}</p>
              <div className={workspace.managerSearch}><div><label htmlFor="admin-workspace-manager-search">Tìm Manager theo tên/email</label><input ref={managerSearchRef} id="admin-workspace-manager-search" maxLength={100} value={managerSearch} onChange={event => setManagerSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); searchManagers(); } }} /></div><button type="button" className={styles.button} onClick={searchManagers}>Tìm Manager</button></div>
              <p id="admin-workspace-manager-error" className={styles.fieldError}>{errors.manager}</p>
              {managerLoading ? <p role="status" className={styles.hint}>Đang tải Manager…</p> : managerError ? <div role="alert" className={styles.error}>{managerError}<button type="button" className={styles.button} onClick={() => setManagerQuery(value => ({ ...value, revision: value.revision + 1 }))}>Thử tải lại Manager</button></div> : managerData && <>
                <div className={workspace.managerChoices} role="radiogroup" aria-label="Kết quả tìm Manager" aria-describedby="admin-workspace-manager-error" aria-invalid={!!errors.manager}>{managerData.items.map(item => <label key={item.id} className={workspace.managerChoice}><input type="radio" name="manager" value={item.id} checked={selected?.id === item.id} onChange={() => { setSelected({ id: item.id, name: String(item.full_name || item.email), email: String(item.email) }); setErrors(value => ({ ...value, manager: "" })); }} /><span>{String(item.full_name || item.email)}<small>{String(item.email)}</small></span></label>)}</div>
                {managerData.total === 0 && <p role="status" className={styles.hint}>Không có Manager phù hợp. Thử tên/email khác hoặc tạo tài khoản Manager trong mục Tài khoản.</p>}
                <div className={workspace.managerPages}><span role="status">{managerData.total.toLocaleString("vi-VN")} Manager · Trang {managerQuery.page}/{Math.max(1, Math.ceil(managerData.total / 20))}</span><div><button type="button" className={styles.button} disabled={managerQuery.page <= 1} onClick={() => setManagerQuery(value => ({ ...value, page: value.page - 1 }))}>Manager trước</button><button type="button" className={styles.button} disabled={managerQuery.page >= Math.ceil(managerData.total / 20) || managerQuery.page >= 100000} onClick={() => setManagerQuery(value => ({ ...value, page: value.page + 1 }))}>Manager sau</button></div></div>
              </>}
            </fieldset>
            {row && <p className={styles.hint}>Ngày tạo: {workspaceDate(row.created_date)} · Cập nhật: {workspaceDate(row.updated_at)}</p>}
          </form>}
        </>}
      </div>
      <footer className={styles.footer}>{readOnly ? <button ref={closeRef} type="button" className={styles.button} onClick={onCancel}>Đóng</button> : phase === "discard" ? <><button ref={keepRef} type="button" className={styles.button} onClick={() => setPhase("form")}>Tiếp tục chỉnh sửa</button><button type="button" className={styles.danger} onClick={onCancel}>Bỏ thay đổi</button></> : phase === "review" ? <><button ref={backRef} type="button" className={styles.button} disabled={busy} onClick={() => setPhase("form")}>Quay lại</button><button type="button" className={styles.primary} disabled={busy} onClick={() => void save()}>{busy ? "Đang lưu…" : row ? "Xác nhận lưu" : "Xác nhận tạo"}</button></> : <><span className={styles.footerHint}>{row && !dirty ? "Chưa có thay đổi cần lưu" : "Kiểm tra thông tin trước khi xác nhận"}</span><button type="button" className={styles.button} onClick={close}>Hủy</button><button type="submit" form="admin-workspace-form" className={styles.primary} disabled={busy || managerLoading || !!managerError || (!!row && !dirty)}>{row ? "Lưu thay đổi" : "Tạo mới"}</button></>}</footer>
    </div>
  </dialog>;
}
