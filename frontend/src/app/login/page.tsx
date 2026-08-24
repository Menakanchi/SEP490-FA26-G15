"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types/auth";
import {
  Navigation,
  Lock,
  Mail,
  UserCheck,
  Zap,
  ShieldCheck,
  Crown,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, switchRole } = useAuth();
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const navigateTarget = (r: Role) => {
    if (r === "reviewer" || r === "admin") {
      router.push("/review");
    } else {
      router.push("/");
    }
  };

  const handleQuickSelect = async (role: Role, username: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await login({ username, password: `${username}123`, role, email: `${username}@forge.ai` });
      switchRole(role);
      navigateTarget(role);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        switchRole(role);
        navigateTarget(role);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setLoading(true);
    setErrorMsg(null);

    const username = emailInput.includes("@") ? emailInput.split("@")[0] : emailInput;
    const roleGuess: Role = username.includes("admin")
      ? "admin"
      : username.includes("review")
      ? "reviewer"
      : "creator";

    try {
      await login({ username, password: passwordInput || "password123", email: emailInput, role: roleGuess });
      switchRole(roleGuess);
      navigateTarget(roleGuess);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Không thể đăng nhập. Vui lòng kiểm tra lại thông tin.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-2xl space-y-6">
        {/* Back Link */}
        <Link
          href="/landing"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại trang giới thiệu</span>
        </Link>

        {/* Brand Logo & Title */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 p-0.5 shadow-lg shadow-blue-500/20 mx-auto flex items-center justify-center">
            <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center">
              <Navigation className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Đăng Nhập Hệ Thống</h1>
          <p className="text-xs text-slate-500">
            Nền tảng Tự động sinh Kịch bản Kiểm thử Xe tự lái (P-130)
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 font-medium animate-fade-in">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-blue-600" /> Email hoặc Tên đăng nhập
            </label>
            <input
              type="text"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition"
              placeholder="creator@forge.ai"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-blue-600" /> Mật khẩu
            </label>
            <input
              type="password"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition"
              placeholder="••••••••"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          >
            <UserCheck className="w-4 h-4" />
            <span>{loading ? "Đang xử lý..." : "Đăng Nhập Workspace"}</span>
          </button>
        </form>

        {/* Register Navigation Link */}
        <div className="text-center text-xs text-slate-600">
          Chưa có tài khoản?{" "}
          <Link href="/register" className="font-bold text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
            Đăng ký tài khoản ngay
          </Link>
        </div>

        {/* Quick Demo Accounts */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block text-center">
            Hoặc đăng nhập nhanh tài khoản Demo
          </span>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickSelect("admin", "admin")}
              className="p-2.5 rounded-xl border border-red-200 bg-red-50/50 hover:bg-red-50 active:scale-[0.98] text-red-700 font-bold text-center flex flex-col items-center gap-1 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
            >
              <Crown className="w-4 h-4 text-red-600" />
              <span>Admin</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickSelect("reviewer", "reviewer")}
              className="p-2.5 rounded-xl border border-purple-200 bg-purple-50/50 hover:bg-purple-50 active:scale-[0.98] text-purple-700 font-bold text-center flex flex-col items-center gap-1 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none"
            >
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              <span>Reviewer</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickSelect("creator", "creator")}
              className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 active:scale-[0.98] text-blue-700 font-bold text-center flex flex-col items-center gap-1 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            >
              <Zap className="w-4 h-4 text-blue-600" />
              <span>Creator</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
