"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";
import { requestRegisterCode } from "@/services/api";
import { AuthCard, inputClass, labelClass, linkClass, primaryButtonClass } from "@/components/auth/AuthCard";
import { OtpCodeField } from "@/components/auth/OtpCodeField";
import { Lock, Loader2, Mail, Send, User as UserIcon, UserPlus } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Đăng ký 2 bước có xác minh email (TD-35): (1) email -> mã 6 số; (2) mã + họ tên + mật khẩu -> tài khoản EXPERIENCER và đăng nhập
 * luôn. Chỉ ai nhận được thư mới tạo được tài khoản; bước xin mã luôn trả cùng một câu nên không lộ email nào đã đăng ký.
 * Là luồng mặc định ở production (backend `REGISTRATION_MODE=auto`).
 */
export function OtpRegisterForm() {
  const router = useRouter();
  const { registerWithCode } = useAuth();

  const [step, setStep] = useState<"email" | "verify">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sendCode = async () => {
    setError(null);
    const res = await requestRegisterCode(email.trim());
    setNotice(res.message_vi);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendCode();
      setStep("verify");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không gửi được mã. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    setLoading(true);
    try {
      // Backend tách họ tên theo thói quen tiếng Việt: từ đầu là họ, từ cuối là tên, phần giữa là tên đệm.
      const fullName = [lastName, middleName, firstName].map((part) => part.trim()).filter(Boolean).join(" ");
      const user = await registerWithCode({ email: email.trim(), code, full_name: fullName, password });
      router.push(homeFor(user.role));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đăng ký không thành công. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <>
      Đã có tài khoản?{" "}
      <Link href="/login" className={linkClass}>
        Đăng nhập tại đây
      </Link>
    </>
  );

  if (step === "email") {
    return (
      <AuthCard
        stepLabel="Bước 1/2 · Email"
        title="Tạo tài khoản"
        subtitle="Nhập email để nhận mã xác minh 6 số. Chỉ người nhận được thư mới tạo được tài khoản."
        backHref="/login"
        backLabel="Quay lại trang Đăng nhập"
        error={error}
        footer={footer}
      >
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="register-email" className={labelClass}>
              <Mail className="size-3.5" /> Email <span className="text-vehicsim-danger">*</span>
            </label>
            <input
              id="register-email"
              type="email"
              required
              maxLength={255}
              autoComplete="email"
              className={inputClass}
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading} className={primaryButtonClass}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            <span>{loading ? "Đang gửi mã..." : "Gửi mã xác minh"}</span>
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      stepLabel="Bước 2/2 · Hoàn tất"
      title="Hoàn tất đăng ký"
      subtitle="Nhập mã trong email, họ tên và mật khẩu. Đăng ký xong bạn được đăng nhập luôn."
      backHref="/register"
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
      <form onSubmit={handleVerifySubmit} className="flex flex-col gap-4">
        <OtpCodeField email={email.trim()} value={code} onChange={setCode} onResend={sendCode} />

        <div>
          <span className={labelClass}>
            <UserIcon className="size-3.5" /> Họ và tên <span className="text-vehicsim-danger">*</span>
          </span>
          <div className="grid grid-cols-3 gap-2">
            <input
              aria-label="Họ"
              type="text"
              required
              maxLength={80}
              autoComplete="family-name"
              className={inputClass}
              placeholder="Họ"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
            <input
              aria-label="Tên đệm"
              type="text"
              maxLength={80}
              autoComplete="additional-name"
              className={inputClass}
              placeholder="Đệm"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
            />
            <input
              aria-label="Tên"
              type="text"
              required
              maxLength={80}
              autoComplete="given-name"
              className={inputClass}
              placeholder="Tên"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="register-password" className={labelClass}>
            <Lock className="size-3.5" /> Mật khẩu <span className="text-vehicsim-danger">*</span>
          </label>
          <input
            id="register-password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={72}
            autoComplete="new-password"
            className={inputClass}
            placeholder={`Ít nhất ${MIN_PASSWORD_LENGTH} ký tự`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="register-confirm" className={labelClass}>
            <Lock className="size-3.5" /> Nhập lại mật khẩu <span className="text-vehicsim-danger">*</span>
          </label>
          <input
            id="register-confirm"
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
          {loading ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          <span>{loading ? "Đang tạo tài khoản..." : "Tạo tài khoản"}</span>
        </button>
      </form>
    </AuthCard>
  );
}
