"use client";

import React, { useState } from "react";
import Link from "next/link";
import { requestPasswordResetCode, resetPassword } from "@/services/api";
import { AuthCard, inputClass, labelClass, linkClass, primaryButtonClass } from "@/components/auth/AuthCard";
import { OtpCodeField } from "@/components/auth/OtpCodeField";
import { Mail, Lock, Send, KeyRound, Loader2, LogIn, CheckCircle2 } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Quên mật khẩu 2 bước: (1) email -> mã 6 số; (2) mã + mật khẩu mới.
 * Đặt lại xong mọi phiên đăng nhập cũ của tài khoản đều hết hiệu lực, nên người
 * dùng đăng nhập lại bằng mật khẩu mới thay vì được đăng nhập tự động.
 */
export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "reset" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sendCode = async () => {
    setError(null);
    const res = await requestPasswordResetCode(email.trim());
    setNotice(res.message_vi);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendCode();
      setStep("reset");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không gửi được mã. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    setLoading(true);
    try {
      await resetPassword({ email: email.trim(), code, new_password: password });
      setStep("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không đặt lại được mật khẩu. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <>
      Nhớ ra mật khẩu?{" "}
      <Link href="/login" className={linkClass}>
        Đăng nhập
      </Link>
    </>
  );

  if (step === "done") {
    return (
      <AuthCard
        title="Đã đặt lại mật khẩu"
        subtitle="Các phiên đăng nhập cũ của tài khoản này đã bị đăng xuất."
        backHref="/login"
        backLabel="Về trang Đăng nhập"
      >
        <div className="flex items-start gap-2.5 rounded-[14px] bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>Mật khẩu mới đã có hiệu lực. Hãy đăng nhập lại bằng mật khẩu mới.</span>
        </div>
        <Link href="/login" className={primaryButtonClass}>
          <LogIn className="w-4 h-4" />
          <span>Đăng nhập</span>
        </Link>
      </AuthCard>
    );
  }

  if (step === "email") {
    return (
      <AuthCard
        stepLabel="Bước 1/2 · Email"
        title="Quên mật khẩu"
        subtitle="Nhập email tài khoản để nhận mã xác minh 6 số."
        backHref="/login"
        backLabel="Quay lại trang Đăng nhập"
        error={error}
        footer={footer}
      >
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div>
            <label htmlFor="forgot-email" className={labelClass}>
              <Mail className="size-3.5" /> Email tài khoản <span className="text-vehicsim-danger">*</span>
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              autoComplete="email"
              className={inputClass}
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading} className={primaryButtonClass}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>{loading ? "Đang gửi mã..." : "Gửi mã xác minh"}</span>
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      stepLabel="Bước 2/2 · Mật khẩu mới"
      title="Đặt mật khẩu mới"
      subtitle="Nhập mã trong email và mật khẩu mới."
      backHref="/forgot-password"
      backLabel="Dùng email khác"
      onBack={() => {
        setStep("email");
        setCode("");
        setError(null);
        setNotice(null);
      }}
      error={error}
      notice={notice}
      footer={footer}
    >
      <form onSubmit={handleResetSubmit} className="space-y-4">
        <OtpCodeField email={email} value={code} onChange={setCode} onResend={sendCode} />

        <div>
          <label htmlFor="reset-password" className={labelClass}>
            <Lock className="size-3.5" /> Mật khẩu mới <span className="text-vehicsim-danger">*</span>
          </label>
          <input
            id="reset-password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={128}
            autoComplete="new-password"
            className={inputClass}
            placeholder={`Ít nhất ${MIN_PASSWORD_LENGTH} ký tự`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="reset-confirm" className={labelClass}>
            <Lock className="size-3.5" /> Nhập lại mật khẩu mới <span className="text-vehicsim-danger">*</span>
          </label>
          <input
            id="reset-confirm"
            type="password"
            required
            autoComplete="new-password"
            className={inputClass}
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <button type="submit" disabled={loading || code.length !== 6} className={primaryButtonClass}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          <span>{loading ? "Đang cập nhật..." : "Đặt lại mật khẩu"}</span>
        </button>
      </form>
    </AuthCard>
  );
}
