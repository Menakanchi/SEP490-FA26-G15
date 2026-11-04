"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, ShieldCheck, UserRound, X } from "lucide-react";
import { adminApi, type AdminRow } from "@/services/admin";
import { USER_ROLES } from "./adminUsersQuery";
import styles from "./AdminEditor.module.css";
import { useAdminDialog } from "./useAdminDialog";

type Values = { email: string; last_name: string; middle_name: string; first_name: string; role: string; password: string; is_active: boolean };
type UserBody = Omit<Values, "middle_name" | "password"> & { middle_name: string | null; password?: string };
type Phase = "form" | "review" | "discard";
const roles = ["MANAGER", "ENGINEER", "REVIEWER", "EXPERIENCER", "ADMIN"];
const roleHelp: Record<string, string> = {
  ADMIN: "Quản trị tài khoản, workspace và tài liệu kỹ thuật. Quyền duyệt khuyến nghị vẫn thuộc Reviewer.",
  MANAGER: "Quản lý workspace được giao và công việc cộng tác.",
  ENGINEER: "Thực hiện quy trình kỹ thuật và kiểm thử AEB theo quyền hệ thống.",
  REVIEWER: "Xem kết quả và duyệt khuyến nghị theo quyền Reviewer.",
  EXPERIENCER: "Vai trò tài khoản tự đăng ký, thao tác kỹ thuật theo hạn mức hệ thống.",
};
const textFields = [
  { key: "email", label: "Email", max: 255, required: true, type: "email" },
  { key: "last_name", label: "Họ", max: 80, required: true, type: "text" },
  { key: "middle_name", label: "Tên đệm", max: 80, required: false, type: "text" },
  { key: "first_name", label: "Tên", max: 80, required: true, type: "text" },
] as const;
function fromRow(row: AdminRow | null): Values {
  return { email: String(row?.email ?? ""), last_name: String(row?.last_name ?? ""), middle_name: String(row?.middle_name ?? ""), first_name: String(row?.first_name ?? ""), role: String(row?.role ?? "MANAGER"), password: "", is_active: row ? row.is_active === true || row.is_active === 1 : true };
}
function bodyOf(values: Values, creating: boolean): UserBody {
  return { email: values.email.trim().toLowerCase(), last_name: values.last_name.trim(), middle_name: values.middle_name.trim() || null, first_name: values.first_name.trim(), role: values.role, is_active: values.is_active, ...(creating ? { password: values.password } : {}) };
}
function createdDate(row: AdminRow) {
  const value = row.created_date;
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("vi-VN") : "—";
}

export function AdminUserEditor({ row, actorId, returnFocusTo, onCancel, onSaved }: { row: AdminRow | null; actorId?: string; returnFocusTo?: HTMLElement | null; onCancel: () => void; onSaved: () => void }) {
  const [initial] = useState(() => fromRow(row));
  const [values, setValues] = useState(initial);
  const [phase, setPhase] = useState<Phase>("form");
  const [pending, setPending] = useState<UserBody | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null), errorRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null), reviewBackRef = useRef<HTMLButtonElement>(null), keepRef = useRef<HTMLButtonElement>(null);
  const saveLock = useRef(false);
  const self = !!row && String(row.id) === actorId;
  const dirty = JSON.stringify(bodyOf(values, !row)) !== JSON.stringify(bodyOf(initial, !row));
  const passwordBytes = new TextEncoder().encode(values.password).length;
  const before = bodyOf(initial, false), after = pending ?? bodyOf(values, !row);
  const changes = [
    ...textFields.map(field => ({ label: field.label, before: before[field.key], after: after[field.key] })),
    { label: "Vai trò", before: USER_ROLES[before.role] ?? before.role, after: USER_ROLES[after.role] ?? after.role },
    { label: "Trạng thái", before: before.is_active ? "Đang hoạt động" : "Đã khóa", after: after.is_active ? "Đang hoạt động" : "Đã khóa" },
  ].filter(change => !row || change.before !== change.after);
  const emailChanged = !!row && before.email !== after.email, roleChanged = !!row && before.role !== after.role, statusChanged = !!row && before.is_active !== after.is_active;

  const dialog = useAdminDialog({ returnFocusTo, onEscape: () => {
    if (saveLock.current) return;
    if (phase !== "form") setPhase("form"); else requestClose();
  } });
  useEffect(() => {
    if (phase === "review") reviewBackRef.current?.focus();
    else if (phase === "discard") keepRef.current?.focus();
    else if (error) errorRef.current?.focus();
    else firstRef.current?.focus();
  }, [phase, error]);

  function update<K extends keyof Values>(key: K, value: Values[K]) {
    setValues(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: "" }));
  }
  function requestClose() {
    if (saveLock.current) return;
    if (dirty) setPhase("discard");
    else onCancel();
  }
  function prepare(event: FormEvent) {
    event.preventDefault();
    if (saveLock.current) return;
    setError("");
    const invalid: Record<string, string> = {};
    for (const field of textFields) {
      const value = values[field.key].trim();
      if (field.required && !value) invalid[field.key] = `Vui lòng nhập ${field.label.toLowerCase()}.`;
      else if (value.length > field.max) invalid[field.key] = `${field.label} tối đa ${field.max} ký tự.`;
    }
    const emailInput = formRef.current?.elements.namedItem("email");
    if (values.email.trim() && emailInput instanceof HTMLInputElement && emailInput.validity.typeMismatch) invalid.email = "Email không đúng định dạng.";
    if (!Object.hasOwn(USER_ROLES, values.role)) invalid.role = "Chọn một vai trò hợp lệ.";
    if (!row && (values.password.length < 8 || passwordBytes > 72)) invalid.password = "Mật khẩu phải ít nhất 8 ký tự và tối đa 72 byte UTF-8.";
    if (self && (values.role !== initial.role || values.is_active !== initial.is_active)) { setError("Không được tự đổi vai trò hoặc khóa tài khoản của mình."); return; }
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      const name = Object.keys(invalid)[0];
      requestAnimationFrame(() => { const field = formRef.current?.elements.namedItem(name); if (field instanceof HTMLElement) field.focus(); });
      return;
    }
    if (row && !dirty) return;
    setPending(bodyOf(values, !row)); setShowPassword(false); setPhase("review");
  }
  async function save() {
    if (saveLock.current || !pending) return;
    saveLock.current = true; setBusy(true); setError("");
    try { await adminApi.save("users", row?.id ?? null, pending); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "Không thực hiện được thao tác. Hãy thử lại."); setPending(null); setPhase("form"); }
    finally { saveLock.current = false; setBusy(false); }
  }

  return <dialog {...dialog} className={styles.dialog} aria-modal="true" aria-busy={busy} aria-labelledby="admin-user-title" aria-describedby="admin-user-target">
    <div className={styles.shell}>
      <header className={styles.header}><div><p className={styles.eyebrow}>QUẢN LÝ TÀI KHOẢN</p><h2 id="admin-user-title">{row ? "Chỉnh sửa" : "Thêm mới"} · Tài khoản</h2><p id="admin-user-target">{row ? `${row.full_name || row.email} · ${row.email} · ID #${row.id}` : "Tạo tài khoản nội bộ và chọn vai trò trong hệ thống."}</p></div><button type="button" className={styles.close} aria-label="Đóng biểu mẫu" disabled={busy} onClick={requestClose}><X size={19} aria-hidden="true" /></button></header>
      <div className={styles.body}>
        {error && <div ref={errorRef} tabIndex={-1} role="alert" className={styles.error}>{error}</div>}
        {phase === "discard" ? <section aria-labelledby="admin-user-discard-title"><h3 id="admin-user-discard-title">Bỏ thay đổi chưa lưu?</h3><p className={styles.description}>Dữ liệu đang nhập cho tài khoản {row?.email || values.email || "mới"} sẽ bị bỏ khỏi biểu mẫu.</p></section> : phase === "review" ? <section aria-labelledby="admin-user-review-title">
          <h3 id="admin-user-review-title">{row ? "Xác nhận thay đổi" : "Xác nhận tạo tài khoản"}</h3><p className={styles.description}>{row ? `Kiểm tra thay đổi cho ${row.email} trước khi lưu.` : `Tài khoản ${after.email} sẽ được tạo với vai trò ${USER_ROLES[after.role]}.`}</p>
          <div className={styles.reviewTable} role="region" aria-label="Nội dung xác nhận tài khoản" tabIndex={0}><table><thead><tr><th scope="col">Thông tin</th>{row && <th scope="col">Hiện tại</th>}<th scope="col">Sau khi {row ? "lưu" : "tạo"}</th></tr></thead><tbody>{changes.map(change => <tr key={change.label}><th scope="row">{change.label}</th>{row && <td>{change.before || "—"}</td>}<td>{change.after || "—"}</td></tr>)}</tbody></table></div>
          {!row && <p className={styles.note}>Mật khẩu ban đầu đã được nhập và không hiển thị trong bước xác nhận.</p>}
          {emailChanged || roleChanged || statusChanged ? <div className={styles.impact} aria-label="Ảnh hưởng của thay đổi"><strong>Ảnh hưởng sau khi lưu</strong><ul>
            <li>{self && emailChanged ? "Phiên hiện tại của bạn sẽ hết hiệu lực. Hãy đăng nhập lại bằng email mới." : "Các phiên đăng nhập cũ của tài khoản sẽ hết hiệu lực."}</li>
            {statusChanged && <li>{after.is_active ? "Tài khoản có thể đăng nhập lại. Các phiên đã thu hồi không được khôi phục." : "Tài khoản sẽ không thể đăng nhập sau khi bị khóa."}</li>}
            {roleChanged && <li>Vai trò mới được áp dụng theo quyền hệ thống.</li>}
            {(roleChanged || !after.is_active) && <li>Nếu tài khoản còn quản lý workspace, cần giao workspace cho Manager khác trước khi đổi vai trò hoặc khóa. Các phụ thuộc khác được kiểm tra khi lưu.</li>}
          </ul></div> : row && <p className={styles.note}>Chỉ cập nhật thông tin họ tên; email, vai trò và trạng thái giữ nguyên.</p>}
        </section> : <>
          {row && <dl className={styles.summary} aria-label="Thông tin tài khoản hiện tại"><div><dt>Vai trò hiện tại</dt><dd>{USER_ROLES[initial.role] ?? initial.role}</dd></div><div><dt>Trạng thái hiện tại</dt><dd>{initial.is_active ? "Đang hoạt động" : "Đã khóa"}</dd></div><div><dt>Ngày tạo</dt><dd>{createdDate(row)}</dd></div></dl>}
          <form id="admin-user-form" ref={formRef} noValidate onSubmit={prepare}>
            {Object.values(errors).some(Boolean) && <p role="alert" className={styles.error}>Vui lòng kiểm tra các trường được đánh dấu bên dưới.</p>}
            <fieldset disabled={busy} className={styles.fieldset}><legend><UserRound size={16} aria-hidden="true" />Thông tin tài khoản</legend><p className={styles.hint}>Các trường có dấu * là bắt buộc.</p><div className={styles.fields}>
              {textFields.map((field, index) => <div key={field.key} className={field.key === "email" ? styles.wide : undefined}><label htmlFor={`admin-user-${field.key}`}>{field.label}{field.required ? " *" : ""}</label><input ref={index === 0 ? firstRef : undefined} id={`admin-user-${field.key}`} name={field.key} type={field.type} value={values[field.key]} required={field.required} maxLength={field.max} autoComplete="off" aria-invalid={!!errors[field.key]} aria-describedby={errors[field.key] ? `admin-user-${field.key}-error` : undefined} onChange={event => update(field.key, event.target.value)} />{errors[field.key] && <p id={`admin-user-${field.key}-error`} className={styles.fieldError}>{errors[field.key]}</p>}</div>)}
              {!row && <div className={styles.wide}><label htmlFor="admin-user-password">Mật khẩu ban đầu *</label><div className={styles.password}><input id="admin-user-password" name="password" type={showPassword ? "text" : "password"} value={values.password} required minLength={8} maxLength={72} autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby="admin-user-password-help admin-user-password-error" onChange={event => update("password", event.target.value)} /><button type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div><p id="admin-user-password-help" className={styles.hint}>Ít nhất 8 ký tự, tối đa 72 byte UTF-8 · Đã nhập {passwordBytes}/72 byte.</p><p id="admin-user-password-error" className={styles.fieldError}>{errors.password}</p></div>}
            </div></fieldset>
            <fieldset disabled={busy} className={styles.fieldset}><legend><ShieldCheck size={16} aria-hidden="true" />Vai trò và trạng thái</legend><label htmlFor="admin-user-role">Vai trò *</label><select id="admin-user-role" name="role" value={values.role} disabled={self} required aria-invalid={!!errors.role} aria-describedby="admin-user-role-help admin-user-role-error" onChange={event => update("role", event.target.value)}>{roles.map(role => <option key={role} value={role}>{USER_ROLES[role]}</option>)}</select><p id="admin-user-role-help" className={styles.hint}>{self ? "Bạn không thể tự đổi vai trò hoặc khóa tài khoản của mình." : roleHelp[values.role]}</p><p id="admin-user-role-error" className={styles.fieldError}>{errors.role}</p>
              <label className={styles.status}><input type="checkbox" aria-labelledby="admin-user-active-label" checked={values.is_active} disabled={self || !row} onChange={event => update("is_active", event.target.checked)} /><span><strong id="admin-user-active-label">Tài khoản đang hoạt động</strong><small>{values.is_active ? "Cho phép đăng nhập theo quyền được cấp." : "Tài khoản sẽ bị khóa sau khi xác nhận lưu."}</small></span></label>
              {!row && <p className={styles.hint}>Tài khoản mới được tạo ở trạng thái hoạt động.</p>}
            </fieldset>
            {row && <p className={styles.note}>Người dùng tự đổi mật khẩu qua hồ sơ hoặc luồng quên mật khẩu hiện có.</p>}
          </form>
        </>}
      </div>
      <footer className={styles.footer}>
        {phase === "discard" ? <><button ref={keepRef} type="button" className={styles.button} onClick={() => setPhase("form")}>Tiếp tục chỉnh sửa</button><button type="button" className={styles.danger} onClick={onCancel}>Bỏ thay đổi</button></> : phase === "review" ? <><button ref={reviewBackRef} type="button" className={styles.button} disabled={busy} onClick={() => setPhase("form")}>Quay lại</button><button type="button" className={statusChanged && !after.is_active ? styles.danger : styles.primary} disabled={busy} onClick={() => void save()}>{busy ? "Đang lưu…" : row ? "Xác nhận lưu" : "Xác nhận tạo"}</button></> : <><span className={styles.footerHint}>{row && !dirty ? "Chưa có thay đổi cần lưu" : "Kiểm tra thông tin trước khi xác nhận"}</span><button type="button" className={styles.button} disabled={busy} onClick={requestClose}>Hủy</button><button type="submit" form="admin-user-form" className={styles.primary} disabled={busy || (!!row && !dirty)}>{row ? "Lưu thay đổi" : "Tạo mới"}</button></>}
      </footer>
    </div>
  </dialog>;
}
