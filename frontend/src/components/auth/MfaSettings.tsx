"use client";

import { useEffect, useState, type FormEvent } from "react";
import { inputClass, labelClass } from "@/components/auth/AuthCard";
import { Card, CardTitle, ErrorNote, PillButton } from "@/components/VehicSimUi";
import { useAuth } from "@/context/AuthContext";
import { mfaDisable, mfaEnable, mfaReplaceRecovery, mfaSetup, mfaStatus } from "@/services/api";

export function MfaSettings() {
  const { acceptSecuritySession } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    mfaStatus().then((result) => { if (active) setEnabled(result.enabled); })
      .catch(() => { if (active) setError("Không tải được trạng thái xác thực hai bước. Hãy tải lại trang."); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      if (enabled) {
        acceptSecuritySession(await mfaDisable(password, code.trim()));
        setEnabled(false); setRecovery([]); setPassword(""); setCode("");
      } else if (!secret) {
        const setup = await mfaSetup(password);
        setSecret(setup.secret);
      } else {
        const result = await mfaEnable(password, code.trim());
        acceptSecuritySession(result.session);
        setEnabled(true); setRecovery(result.recoveryCodes); setSecret(""); setPassword(""); setCode("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể cập nhật xác thực hai bước.");
    } finally { setBusy(false); }
  }

  async function replaceRecovery() {
    if (!password || !code.trim()) { setError("Nhập mật khẩu hiện tại và mã xác thực hoặc mã khôi phục."); return; }
    setError(""); setBusy(true);
    try {
      const result = await mfaReplaceRecovery(password, code.trim());
      setRecovery(result.codes); setPassword(""); setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo lại mã khôi phục.");
    } finally { setBusy(false); }
  }

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <CardTitle>Xác thực hai bước</CardTitle>
      <p className="text-sm text-vehicsim-muted">Tùy chọn: dùng ứng dụng xác thực để bảo vệ tài khoản khi đăng nhập.</p>
      {enabled === null ? <p className="text-sm text-vehicsim-muted">{error || "Đang kiểm tra…"}</p> : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm font-semibold">Trạng thái: {enabled ? "Đã bật" : "Chưa bật"}</p>
          {secret && <div className="min-w-0 rounded-lg bg-vehicsim-soft p-3 text-sm">
            <p>Thêm tài khoản trong ứng dụng xác thực bằng khóa sau, rồi nhập mã 6 số:</p>
            <p className="mt-2 break-all font-mono font-semibold" aria-label="Khóa thiết lập">{secret}</p>
            <p className="mt-2 text-xs text-vehicsim-muted">Khóa có hiệu lực thiết lập trong 5 phút. Không chia sẻ khóa này.</p>
          </div>}
          {recovery.length > 0 && <div role="status" className="min-w-0 rounded-lg bg-vehicsim-soft p-3 text-sm">
            <p className="font-semibold">Lưu các mã khôi phục ở nơi an toàn</p>
            <p className="mt-1 text-xs text-vehicsim-muted">Mỗi mã dùng một lần. Các mã chỉ hiển thị lúc này; không chia sẻ với người khác.</p>
            <ul className="mt-2 space-y-1 font-mono text-xs">{recovery.map((item) => <li key={item} className="break-all">{item}</li>)}</ul>
          </div>}
          <div><label htmlFor="mfa-password" className={labelClass}>Mật khẩu hiện tại</label>
            <input id="mfa-password" type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          {(enabled || secret) && <div><label htmlFor="mfa-code" className={labelClass}>{enabled ? "Mã xác thực hoặc mã khôi phục" : "Mã xác thực 6 số"}</label>
            <input id="mfa-code" autoComplete="one-time-code" maxLength={64} className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} required /></div>}
          <p className="text-xs text-vehicsim-muted">Bật hoặc tắt sẽ kết thúc các phiên đăng nhập khác.</p>
          {enabled && <p className="text-xs text-vehicsim-muted">Tạo lại mã khôi phục sẽ vô hiệu toàn bộ mã cũ.</p>}
          {error && <ErrorNote message={error} />}
          <div className="flex flex-wrap gap-2">
            <PillButton type="submit" variant="dark" disabled={busy}>{busy ? "Đang xử lý…" : enabled ? "Tắt xác thực hai bước" : secret ? "Xác nhận bật" : "Bắt đầu thiết lập"}</PillButton>
            {enabled && <PillButton type="button" disabled={busy} onClick={replaceRecovery}>Tạo lại mã khôi phục</PillButton>}
            {secret && <PillButton type="button" onClick={() => { setSecret(""); setCode(""); setError(""); }}>Hủy thiết lập</PillButton>}
          </div>
        </form>
      )}
    </Card>
  );
}
