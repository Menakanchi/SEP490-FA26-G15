"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types/auth";
import {
  ShieldCheck,
  UserCheck,
  Zap,
  X,
  Lock,
  Mail,
  User as UserIcon,
  Clock,
  CheckCircle2,
  AlertCircle,
  Crown,
  UserPlus,
} from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const router = useRouter();
  const { login, register, switchRole, pendingUsers, approveUser } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingSuccessMsg, setPendingSuccessMsg] = useState<string | null>(null);

  // Form states
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [roleInput, setRoleInput] = useState<Role>("creator");

  if (!isOpen) return null;

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
    setPendingSuccessMsg(null);
    try {
      await login({ username, password: `${username}123`, role, email: `${username}@forge.ai` });
      switchRole(role);
      onClose();
      navigateTarget(role);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        switchRole(role);
        onClose();
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
    setPendingSuccessMsg(null);

    const username = emailInput.includes("@") ? emailInput.split("@")[0] : emailInput;

    try {
      await login({ username, password: passwordInput || "password123", email: emailInput, role: roleInput });
      switchRole(roleInput);
      onClose();
      navigateTarget(roleInput);
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

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !nameInput.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    setPendingSuccessMsg(null);

    const username = emailInput.includes("@") ? emailInput.split("@")[0] : emailInput;

    try {
      const result = await register({
        name: nameInput,
        email: emailInput,
        username,
        password: passwordInput || "password123",
        role: roleInput,
      });

      if (result.status === "pending") {
        setPendingSuccessMsg(
          "Tài khoản Reviewer của bạn đã được ghi nhận. Vui lòng chờ Admin xác nhận kích hoạt qua email đăng ký trước khi đăng nhập.",
        );
      } else {
        onClose();
        navigateTarget(roleInput);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xl space-y-6 text-slate-900 max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center space-y-1 pt-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/20 mb-2">
            <Zap className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Scenario Forge Portal</h2>
          <p className="text-xs text-slate-500">
            Nền tảng Tự động sinh Kịch bản Kiểm thử Xe tự lái (P-130)
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setErrorMsg(null);
              setPendingSuccessMsg(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
              mode === "login"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Đăng Nhập
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setErrorMsg(null);
              setPendingSuccessMsg(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
              mode === "register"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Đăng Ký Tài Khoản
          </button>
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 font-medium animate-fade-in">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {pendingSuccessMsg && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5 font-medium animate-fade-in">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>{pendingSuccessMsg}</span>
          </div>
        )}

        {/* Form Content */}
        {mode === "login" ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-blue-600" /> Email hoặc Tên đăng nhập
              </label>
              <input
                type="text"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="creator@forge.ai"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-blue-600" /> Mật khẩu
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition"
            >
              <UserCheck className="w-4 h-4" />
              <span>{loading ? "Đang xử lý..." : "Đăng Nhập Hệ Thống"}</span>
            </button>

            {/* Quick Demo Accounts Selection */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block text-center">
                Hoặc chọn nhanh tài khoản Demo
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleQuickSelect("admin", "admin")}
                  className="p-2.5 rounded-xl border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-700 font-bold text-center flex flex-col items-center gap-1 transition"
                >
                  <Crown className="w-4 h-4 text-red-600" />
                  <span>Admin</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSelect("reviewer", "reviewer")}
                  className="p-2.5 rounded-xl border border-purple-200 bg-purple-50/50 hover:bg-purple-50 text-purple-700 font-bold text-center flex flex-col items-center gap-1 transition"
                >
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  <span>Reviewer</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSelect("creator", "creator")}
                  className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 text-blue-700 font-bold text-center flex flex-col items-center gap-1 transition"
                >
                  <Zap className="w-4 h-4 text-blue-600" />
                  <span>Creator</span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
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
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
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

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-blue-600" /> Mật khẩu <span className="text-red-500">*</span>
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

            {/* Role Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chọn vai trò đăng ký <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setRoleInput("creator")}
                  className={`p-3 rounded-xl border text-left space-y-1 transition ${
                    roleInput === "creator"
                      ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <div className="font-bold text-blue-700 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" /> Creator (Kỹ sư AI)
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Kích hoạt ngay. Sinh kịch bản và xem trước 2D layout.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRoleInput("reviewer")}
                  className={`p-3 rounded-xl border text-left space-y-1 transition ${
                    roleInput === "reviewer"
                      ? "border-purple-500 bg-purple-50/60 ring-2 ring-purple-500/20"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <div className="font-bold text-purple-700 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Reviewer (Thẩm định)
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Cần Admin phê duyệt qua email trước khi đăng nhập.
                  </p>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition"
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
        )}

        {/* Admin Approval Management Sub-panel */}
        {pendingUsers.length > 0 && (
          <div className="pt-4 border-t border-slate-100 space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1 text-amber-700">
                <Clock className="w-4 h-4" /> Yêu cầu Reviewer chờ duyệt ({pendingUsers.length})
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Simulate Email Approval</span>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
              {pendingUsers.map((pending) => (
                <div
                  key={pending.id}
                  className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900 block">{pending.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{pending.email}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => approveUser(pending.id)}
                    className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 transition"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Duyệt Email</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
