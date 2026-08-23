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
  User as UserIcon,
  UserPlus,
  ShieldCheck,
  Zap,
  Clock,
  ArrowLeft,
  AlertCircle,
  LogIn,
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [nameInput, setNameInput] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [roleInput, setRoleInput] = useState<Role>("creator");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingSuccess, setPendingSuccess] = useState(false);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !nameInput.trim()) return;
    setLoading(true);
    setErrorMsg(null);

    const username = usernameInput.trim() || (emailInput.includes("@") ? emailInput.split("@")[0] : emailInput);

    try {
      const result = await register({
        name: nameInput,
        full_name: nameInput,
        email: emailInput,
        username,
        password: roleInput === "reviewer" ? undefined : (passwordInput || "password123"),
        role: roleInput,
        reason: reasonInput,
      });

      if (result.status === "pending_approval" || result.status === "pending" || roleInput === "reviewer") {
        setPendingSuccess(true);
      } else {
        router.push("/");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Đăng ký không thành công. Vui lòng thử lại.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Pending Reviewer Success View
  if (pendingSuccess) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-2xl space-y-6 text-center">
          <div className="w-14 h-14 rounded-3xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto shadow-sm">
            <Clock className="w-7 h-7 animate-pulse" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-extrabold text-slate-900">Yêu Cầu Đã Được Ghi Nhận</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Đăng ký thành công! Đơn đăng ký Reviewer của bạn đã chuyển cho Admin phê duyệt. Sau khi duyệt, mật khẩu đăng nhập tạm thời sẽ được tự động gửi trực tiếp về email của bạn.
            </p>
          </div>

          <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200 text-left text-xs text-amber-900 space-y-1.5">
            <span className="font-bold block text-amber-950">Thông tin đã ghi nhận:</span>
            <p>Họ và tên: <strong>{nameInput}</strong></p>
            <p>Username: <strong>{usernameInput || emailInput.split("@")[0]}</strong></p>
            <p>Email: <strong>{emailInput}</strong></p>
            {reasonInput && <p>Lý do / Đơn vị: <strong>{reasonInput}</strong></p>}
            <p>Vai trò: <strong>Reviewer (Thẩm định kịch bản)</strong></p>
          </div>

          <Link
            href="/login"
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Quay lại trang Đăng nhập</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-2xl space-y-6">
        {/* Back Link */}
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại trang Đăng nhập</span>
        </Link>

        {/* Brand Logo & Title */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 p-0.5 shadow-lg shadow-blue-500/20 mx-auto flex items-center justify-center">
            <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center">
              <Navigation className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Tạo Tài Khoản Mới</h1>
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

        {/* Register Form */}
        <form onSubmit={handleRegisterSubmit} className="space-y-4">
          {/* Role Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Chọn vai trò đăng ký <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <button
                type="button"
                onClick={() => setRoleInput("creator")}
                className={`p-3 rounded-xl border text-left space-y-1 transition cursor-pointer ${
                  roleInput === "creator"
                    ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                }`}
              >
                <div className="font-bold text-blue-700 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" /> Creator (Kỹ sư AI)
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Tạo mật khẩu & Kích hoạt tài khoản ngay.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setRoleInput("reviewer")}
                className={`p-3 rounded-xl border text-left space-y-1 transition cursor-pointer ${
                  roleInput === "reviewer"
                    ? "border-purple-500 bg-purple-50/60 ring-2 ring-purple-500/20"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                }`}
              >
                <div className="font-bold text-purple-700 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Reviewer (Thẩm định)
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Không cần mật khẩu. Admin duyệt & gửi mật khẩu qua email.
                </p>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <UserIcon className="w-3.5 h-3.5 text-blue-600" /> Họ và tên người dùng <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              placeholder="Nguyễn Văn A"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <UserIcon className="w-3.5 h-3.5 text-blue-600" /> Username đăng nhập <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              placeholder="nguyenvana"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-blue-600" /> Email làm việc <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              placeholder="name@company.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
            />
          </div>

          {roleInput === "reviewer" ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" /> Lý do đăng ký / Đơn vị công tác <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 min-h-[70px]"
                  placeholder="Ví dụ: Kỹ sư Kiểm thử Mô phỏng ADAS - VinFast..."
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                />
              </div>

              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-900 text-[11px] leading-relaxed">
                ℹ️ <strong>Tài khoản Reviewer không cần tạo mật khẩu trước.</strong> Sau khi bạn gửi yêu cầu, Admin sẽ thẩm định đơn vị công tác, khởi tạo mật khẩu ngẫu nhiên và tự động gửi thông tin đăng nhập về email <strong>{emailInput || "của bạn"}</strong>.
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-blue-600" /> Mật khẩu đăng nhập <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>
              {loading
                ? "Đang đăng ký..."
                : roleInput === "reviewer"
                ? "Gửi Yêu Cầu Đăng Ký Reviewer"
                : "Tạo Tài Khoản Creator Ngay"}
            </span>
          </button>
        </form>

        {/* Login Navigation Link */}
        <div className="text-center text-xs text-slate-600 pt-2 border-t border-slate-100">
          Đã có tài khoản?{" "}
          <Link href="/login" className="font-bold text-blue-600 hover:underline">
            Đăng nhập tại đây
          </Link>
        </div>
      </div>
    </div>
  );
}
