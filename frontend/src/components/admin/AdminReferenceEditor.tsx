"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, Link as LinkIcon, X } from "lucide-react";
import { adminApi, type AdminRow } from "@/services/admin";
import { referenceErrorMessage, referenceFields, REFERENCE_KINDS } from "./adminReferences";
import { workspaceDate } from "./adminWorkspacesQuery";
import { useAdminDialog } from "./useAdminDialog";
import styles from "./AdminEditor.module.css";
import reference from "./AdminReferences.module.css";

type Values = Record<string, string>;
type Body = Record<string, string | number | boolean | null>;
type Phase = "form" | "review" | "discard";
function valuesOf(row: AdminRow | null): Values { return Object.fromEntries(referenceFields.map(field => [field.key, String(row?.[field.key] ?? (field.key === "ref_type" ? "PRINCIPLE" : ""))])); }
function bodyOf(values: Values, enabled: boolean): Body {
  const body: Body = Object.fromEntries(referenceFields.map(field => [field.key, values[field.key].trim() || null]));
  body.ref_value = values.ref_type === "CONSTANT" ? values.ref_value.trim() : null;
  body.publication_year = values.publication_year.trim() ? Number(values.publication_year) : null;
  body.is_active = enabled;
  return body;
}
function display(value: Body[string]) { return value == null || value === "" ? "—" : String(value); }
export function AdminReferenceEditor({ row, returnFocusTo, onCancel, onSaved }: { row: AdminRow | null; returnFocusTo?: HTMLElement | null; onCancel: () => void; onSaved: (label: string) => void }) {
  const [initial] = useState(() => valuesOf(row)), [values, setValues] = useState(initial);
  const initialEnabled = row ? row.is_active === true || row.is_active === 1 : true;
  const [enabled, setEnabled] = useState(initialEnabled), [phase, setPhase] = useState<Phase>("form");
  const [pending, setPending] = useState<Body | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [errors, setErrors] = useState<Record<string, string>>({});
  const saveLock = useRef(false), formRef = useRef<HTMLFormElement>(null), firstRef = useRef<HTMLInputElement>(null), errorRef = useRef<HTMLDivElement>(null), backRef = useRef<HTMLButtonElement>(null), keepRef = useRef<HTMLButtonElement>(null);
  const before = bodyOf(initial, initialEnabled), after = pending ?? bodyOf(values, enabled);
  const dirty = JSON.stringify(bodyOf(values, enabled)) !== JSON.stringify(before);
  const dialog = useAdminDialog({ returnFocusTo, onEscape: () => { if (saveLock.current) return; if (phase !== "form") setPhase("form"); else close(); } });
  useEffect(() => {
    if (phase === "review") backRef.current?.focus();
    else if (phase === "discard") keepRef.current?.focus();
    else if (error) errorRef.current?.focus();
    else firstRef.current?.focus();
  }, [phase, error]);
  const changes = [...referenceFields.map(field => ({ label: field.label, before: field.key === "ref_type" ? REFERENCE_KINDS[String(before.ref_type)] : before[field.key], after: field.key === "ref_type" ? REFERENCE_KINDS[String(after.ref_type)] : after[field.key] })), { label: "Trạng thái", before: before.is_active ? "Đang bật" : "Đã tắt", after: after.is_active ? "Đang bật" : "Đã tắt" }].filter(change => !row || change.before !== change.after);
  function close() { if (saveLock.current) return; if (dirty) setPhase("discard"); else onCancel(); }
  function update(key: string, value: string) { setValues(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: "" })); }
  function prepare(event: FormEvent) {
    event.preventDefault(); if (saveLock.current) return; setError("");
    const invalid: Record<string, string> = {};
    for (const field of referenceFields) {
      const value = values[field.key].trim();
      if ("required" in field && field.required && !value) invalid[field.key] = "Vui lòng nhập " + field.label.toLowerCase() + ".";
      else if ("max" in field && value.length > field.max) invalid[field.key] = field.label + " tối đa " + field.max + " ký tự.";
    }
    if (!Object.hasOwn(REFERENCE_KINDS, values.ref_type)) invalid.ref_type = "Chọn một loại tài liệu hợp lệ.";
    if (values.ref_type === "CONSTANT" && !/^[+-]?(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(values.ref_value.trim())) invalid.ref_value = "Nhập giá trị số hợp lệ cho hằng số.";
    if (values.publication_year.trim() && (!Number.isInteger(Number(values.publication_year)) || Number(values.publication_year) < 1 || Number(values.publication_year) > 9999)) invalid.publication_year = "Năm xuất bản là số nguyên từ 1 đến 9999.";
    if (values.url.trim()) {
      try { const url = new URL(values.url.trim()); if (!["http:", "https:"].includes(url.protocol) || !url.hostname) throw new Error(); }
      catch { invalid.url = "URL phải là địa chỉ http hoặc https hợp lệ."; }
    }
    setErrors(invalid);
    if (Object.keys(invalid).length) { const key = Object.keys(invalid)[0]; requestAnimationFrame(() => { const field = formRef.current?.elements.namedItem(key); if (field instanceof HTMLElement) field.focus(); }); return; }
    if (row && !dirty) return;
    setPending(bodyOf(values, enabled)); setPhase("review");
  }
  async function save() {
    if (saveLock.current || !pending) return;
    saveLock.current = true; setBusy(true); setError("");
    try { await adminApi.save("tech-references", row?.id ?? null, pending); onSaved(String(pending.ref_code) + " · " + String(pending.ref_name)); }
    catch (error) { setError(referenceErrorMessage(error, "save")); setPending(null); setPhase("form"); }
    finally { saveLock.current = false; setBusy(false); }
  }
  function renderFields(keys: string[]) {
    return referenceFields.filter(field => keys.includes(field.key)).sort((a,b) => keys.indexOf(a.key) - keys.indexOf(b.key)).map(field => {
      const required = ("required" in field && field.required) || (field.key === "ref_value" && values.ref_type === "CONSTANT");
      const maxLength = "max" in field ? field.max : undefined;
      const props = { id: "admin-reference-" + field.key, name: field.key, value: values[field.key], required, maxLength, "aria-invalid": !!errors[field.key], "aria-describedby": "admin-reference-" + field.key + "-error" + (field.key === "ref_value" ? " admin-reference-value-help" : ""), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => update(field.key, event.target.value) };
      return <div key={field.key} className={["ref_name","description","source_title","url","doi"].includes(field.key) ? styles.wide : undefined}>
        <label htmlFor={props.id}>{field.label}{required ? " *" : ""}</label>
        {field.key === "ref_type" ? <select {...props}>{Object.entries(REFERENCE_KINDS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select> : field.key === "description" ? <textarea {...props} rows={3} className={reference.textarea} /> : <input {...props} ref={field.key === "ref_code" ? firstRef : undefined} type={field.key === "url" ? "url" : "text"} inputMode={field.key === "ref_value" ? "decimal" : field.key === "publication_year" ? "numeric" : undefined} disabled={field.key === "ref_value" && values.ref_type !== "CONSTANT"} autoComplete="off" />}
        {field.key === "ref_value" && <p id="admin-reference-value-help" className={styles.hint}>Chỉ dành cho Hằng số; tối đa 18 chữ số phần nguyên và 12 chữ số thập phân.</p>}
        <p id={"admin-reference-" + field.key + "-error"} className={styles.fieldError}>{errors[field.key]}</p>
      </div>;
    });
  }
  return <dialog {...dialog} className={styles.dialog} aria-modal="true" aria-busy={busy} aria-labelledby="admin-reference-title" aria-describedby="admin-reference-target">
    <div className={styles.shell}>
      <header className={styles.header}><div><p className={styles.eyebrow}>QUẢN LÝ TÀI LIỆU KỸ THUẬT</p><h2 id="admin-reference-title">{row ? "Chỉnh sửa" : "Thêm mới"} · Tài liệu kỹ thuật</h2><p id="admin-reference-target">{row ? String(row.ref_code) + " · " + row.ref_name + " · ID #" + row.id : "Bổ sung tài liệu và thông tin nguồn tham khảo."}</p></div><button type="button" className={styles.close} aria-label="Đóng biểu mẫu" disabled={busy} onClick={close}><X size={19} aria-hidden="true" /></button></header>
      <div className={styles.body}>
        {error && <div ref={errorRef} tabIndex={-1} role="alert" className={styles.error}>{error}</div>}
        {phase === "discard" ? <section><h3>Bỏ thay đổi chưa lưu?</h3><p className={styles.description}>Dữ liệu đang nhập cho tài liệu {row?.ref_code || values.ref_code || "mới"} sẽ bị bỏ khỏi biểu mẫu.</p></section> : phase === "review" ? <section><h3>{row ? "Xác nhận thay đổi tài liệu" : "Xác nhận tạo tài liệu"}</h3><p className={styles.description}>Kiểm tra mã, nội dung và thông tin nguồn trước khi lưu.</p><div className={styles.reviewTable} role="region" aria-label="Nội dung xác nhận tài liệu" tabIndex={0}><table><thead><tr><th scope="col">Thông tin</th>{row && <th scope="col">Hiện tại</th>}<th scope="col">Sau khi {row ? "lưu" : "tạo"}</th></tr></thead><tbody>{changes.map(change => <tr key={change.label}><th scope="row">{change.label}</th>{row && <td>{display(change.before)}</td>}<td>{display(change.after)}</td></tr>)}</tbody></table></div>{before.is_active !== after.is_active && row && <p className={styles.impact}>{after.is_active ? "Tài liệu sẽ được bật lại sau khi lưu thành công." : "Tài liệu sẽ được tắt sau khi lưu thành công; bản ghi vẫn được giữ lại."}</p>}</section> : <>
          {row && <dl className={styles.summary}><div><dt>Loại hiện tại</dt><dd>{REFERENCE_KINDS[initial.ref_type]}</dd></div><div><dt>Trạng thái hiện tại</dt><dd>{initialEnabled ? "Đang bật" : "Đã tắt"}</dd></div><div><dt>Cập nhật</dt><dd>{workspaceDate(row.updated_at)}</dd></div></dl>}
          <form id="admin-reference-form" ref={formRef} noValidate onSubmit={prepare}>
            {Object.values(errors).some(Boolean) && <p role="alert" className={styles.error}>Vui lòng kiểm tra các trường được đánh dấu bên dưới.</p>}
            <fieldset disabled={busy} className={styles.fieldset}><legend><BookOpen size={16} aria-hidden="true" />Thông tin tài liệu</legend><p className={styles.hint}>Các trường có dấu * là bắt buộc.</p><div className={styles.fields + " " + reference.fields}>{renderFields(["ref_code","ref_type","ref_name","ref_value","unit","description"])}</div></fieldset>
            <fieldset disabled={busy} className={styles.fieldset}><legend><LinkIcon size={16} aria-hidden="true" />Nguồn tham khảo</legend><div className={styles.fields + " " + reference.fields}>{renderFields(["source_type","source_title","author","organization","publication_year","page","url","doi"])}</div></fieldset>
            <label className={styles.status}><input type="checkbox" aria-labelledby="admin-reference-active-label" checked={enabled} disabled={!row || busy} onChange={event => setEnabled(event.target.checked)} /><span><strong id="admin-reference-active-label">Tài liệu đang bật</strong><small>{row ? "Trạng thái được áp dụng sau khi xác nhận lưu." : "Tài liệu mới luôn ở trạng thái bật."}</small></span></label>
          </form>
        </>}
      </div>
      <footer className={styles.footer}>{phase === "discard" ? <><button ref={keepRef} type="button" className={styles.button} onClick={() => setPhase("form")}>Tiếp tục chỉnh sửa</button><button type="button" className={styles.danger} onClick={onCancel}>Bỏ thay đổi</button></> : phase === "review" ? <><button ref={backRef} type="button" className={styles.button} disabled={busy} onClick={() => setPhase("form")}>Quay lại</button><button type="button" className={row && before.is_active !== after.is_active && !after.is_active ? styles.danger : styles.primary} disabled={busy} onClick={() => void save()}>{busy ? "Đang lưu…" : row ? "Xác nhận lưu" : "Xác nhận tạo"}</button></> : <><span className={styles.footerHint}>{row && !dirty ? "Chưa có thay đổi cần lưu" : "Kiểm tra thông tin trước khi xác nhận"}</span><button type="button" className={styles.button} disabled={busy} onClick={close}>Hủy</button><button type="submit" form="admin-reference-form" className={styles.primary} disabled={busy || (!!row && !dirty)}>{row ? "Lưu thay đổi" : "Tạo mới"}</button></>}</footer>
    </div>
  </dialog>;
}
