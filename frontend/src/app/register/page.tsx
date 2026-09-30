"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";
import { requestRegisterCode } from "@/services/api";
import { AuthCard, inputClass, labelClass, linkClass, primaryButtonClass } from "@/components/auth/AuthCard";
import { OtpCodeField } from "@/components/auth/OtpCodeField";
import { Mail, Lock, User as UserIcon, Send, UserPlus, Loader2 } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Đăng ký 2 bước: (1) email -> backend gửi mã 6 số; (2) mã + họ tên + mật khẩu
 * -> tạo tài khoản ENGINEER và đăng nhập luôn. Tài khoản chỉ được tạo khi mã
 * đúng, tức email đã được chứng minh là của người đăng ký.
 */
export default function RegisterPage() {
  const router = useRouter();
  const { completeRegistration } = useAuth();
  const [step, setStep] = useState<"email" | "verify">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
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
      const user = await completeRegistration(email, code, fullName, password);
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
        subtitle="Nhập email làm việc, VehicSim sẽ gửi mã xác minh 6 số."
        backHref="/login"
        backLabel="Quay lại trang Đăng nhập"
        error={error}
        footer={footer}
      >
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div>
            <label htmlFor="register-email" className={labelClass}>
              <Mail className="size-3.5" /> Email làm việc <span className="text-vehicsim-danger">*</span>
            </label>
            <input
              id="register-email"
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
      stepLabel="Bước 2/2 · Xác minh"
      title="Hoàn tất đăng ký"
      subtitle="Nhập mã trong email, họ tên và mật khẩu. Xong là vào thẳng vòng MVP."
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
      <form onSubmit={handleVerifySubmit} className="space-y-4">
        <OtpCodeField email={email} value={code} onChange={setCode} onResend={sendCode} />

        <div>
          <label htmlFor="register-name" className={labelClass}>
            <UserIcon className="size-3.5" /> Họ và tên <span className="text-vehicsim-danger">*</span>
          </label>
          <input
            id="register-name"
            type="text"
            required
            maxLength={150}
            autoComplete="name"
            className={inputClass}
            placeholder="Nguyễn Văn A"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
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
            maxLength={128}
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
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          <span>{loading ? "Đang tạo tài khoản..." : "Tạo tài khoản"}</span>
        </button>
      </form>
    </AuthCard>
  );
}
