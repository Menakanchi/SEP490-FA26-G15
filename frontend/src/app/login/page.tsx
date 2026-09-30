"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";
import { AuthCard, inputClass, labelClass, linkClass, primaryButtonClass } from "@/components/auth/AuthCard";
import { Lock, Mail, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const user = await login(email, password);
      router.push(homeFor(user.role));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Không thể đăng nhập. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Đăng nhập"
      subtitle="Tiếp tục vòng kiểm thử AEB / FCW của bạn trên VehicSim."
      backHref="/landing"
      backLabel="Trang giới thiệu"
      error={errorMsg}
      footer={
        <>
          Chưa có tài khoản?{" "}
          <Link href="/register" className={linkClass}>
            Đăng ký bằng email
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="login-email" className={labelClass}>
            <Mail className="size-3.5" /> Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className={labelClass}>
              <Lock className="size-3.5" /> Mật khẩu
            </label>
            <Link href="/forgot-password" className={`${linkClass} mb-[6px] text-[12px]`}>
              Quên mật khẩu?
            </Link>
          </div>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading && <Loader2 className="size-4 animate-spin" />}
          {loading ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </AuthCard>
  );
}
