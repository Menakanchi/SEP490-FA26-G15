"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/types/auth";
import { Layers, ShieldCheck, Zap, UserCheck, KeyRound, UserPlus } from "lucide-react";

interface AuthViewProps {
  isModal?: boolean;
  onClose?: () => void;
}

export function AuthView({ isModal = false, onClose }: AuthViewProps) {
  const { login, register } = useAuth();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // Login form state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState<UserRole>("creator");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login({ username: loginUsername, password: loginPassword });
      if (onClose) onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await register({
        username: regUsername,
        password: regPassword,
        role: regRole,
      });
      if (onClose) onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đăng ký thất bại. Tên tài khoản có thể đã được sử dụng.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (presetUser: string, presetPass: string) => {
    setError("");
    setLoading(true);
    try {
      await login({ username: presetUser, password: presetPass });
      if (onClose) onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đăng nhập nhanh thất bại.");
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <div className="w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto bg-white border border-[#7BBDE8]/40 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-[#0A4174]/15 backdrop-blur-xl relative text-[#001D39]">
      {isModal && onClose && (
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-[#49769F] hover:text-[#001D39] p-1.5 rounded-full hover:bg-[#BDD8E9]/30 transition"
        >
          ✕
        </button>
      )}

      {/* Header Logo */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#0A4174] text-white mb-3 shadow-lg shadow-[#0A4174]/25">
          <Layers className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-[#001D39] tracking-tight">
          Scenario Forge
        </h2>
        <p className="text-xs text-[#49769F] font-medium mt-1">
          Hệ thống AI Sinh Kịch Bản OpenSCENARIO (RAV-03)
        </p>
      </div>

      {/* Quick Login Presets */}
      <div className="mb-6 p-4 bg-[#BDD8E9]/20 rounded-2xl border border-[#7BBDE8]/30">
        <p className="text-[11px] font-bold text-[#49769F] mb-2.5 uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-[#0A4174]" /> Đăng nhập nhanh tài khoản mẫu:
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleQuickLogin("creator", "creator123")}
            className="flex flex-col items-center py-2 px-1 bg-[#BDD8E9]/40 hover:bg-[#BDD8E9]/70 border border-[#7BBDE8]/50 rounded-xl transition text-center group"
          >
            <span className="text-xs font-bold text-[#0A4174]">Creator</span>
            <span className="text-[9px] text-[#49769F] font-mono mt-0.5">creator123</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickLogin("reviewer", "reviewer123")}
            className="flex flex-col items-center py-2 px-1 bg-[#4E8EA2]/15 hover:bg-[#4E8EA2]/30 border border-[#4E8EA2]/40 rounded-xl transition text-center group"
          >
            <span className="text-xs font-bold text-[#4E8EA2]">Reviewer</span>
            <span className="text-[9px] text-[#49769F] font-mono mt-0.5">reviewer123</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickLogin("admin", "admin123")}
            className="flex flex-col items-center py-2 px-1 bg-[#6EA2B3]/20 hover:bg-[#6EA2B3]/35 border border-[#6EA2B3]/40 rounded-xl transition text-center group"
          >
            <span className="text-xs font-bold text-[#001D39]">Admin</span>
            <span className="text-[9px] text-[#49769F] font-mono mt-0.5">admin123</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#BDD8E9]/25 p-1 rounded-2xl mb-6 border border-[#7BBDE8]/30">
        <button
          type="button"
          onClick={() => {
            setActiveTab("login");
            setError("");
          }}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
            activeTab === "login"
              ? "bg-[#0A4174] text-white shadow-md shadow-[#0A4174]/20"
              : "text-[#49769F] hover:text-[#001D39]"
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" /> Đăng Nhập
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("register");
            setError("");
          }}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
            activeTab === "register"
              ? "bg-[#0A4174] text-white shadow-md shadow-[#0A4174]/20"
              : "text-[#49769F] hover:text-[#001D39]"
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" /> Đăng Ký
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Login Form */}
      {activeTab === "login" && (
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-[#49769F] uppercase tracking-wider mb-1.5">
              Tên Tài Khoản
            </label>
            <input
              type="text"
              required
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              placeholder="Ví dụ: creator, reviewer..."
              className="w-full px-4 py-2.5 bg-white border border-[#BDD8E9] rounded-xl text-[#001D39] placeholder-[#49769F] focus:outline-none focus:border-[#7BBDE8] focus:ring-2 focus:ring-[#7BBDE8]/40 text-sm transition"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#49769F] uppercase tracking-wider mb-1.5">
              Mật Khẩu
            </label>
            <input
              type="password"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-white border border-[#BDD8E9] rounded-xl text-[#001D39] placeholder-[#49769F] focus:outline-none focus:border-[#7BBDE8] focus:ring-2 focus:ring-[#7BBDE8]/40 text-sm transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#0A4174] hover:bg-[#001D39] text-white font-bold text-sm rounded-xl shadow-lg shadow-[#0A4174]/25 transition disabled:opacity-50 mt-2"
          >
            {loading ? "Đang xác thực..." : "Xác Nhận Đăng Nhập"}
          </button>
        </form>
      )}

      {/* Register Form */}
      {activeTab === "register" && (
        <form onSubmit={handleRegisterSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-[#49769F] uppercase tracking-wider mb-1.5">
              Tên Tài Khoản Mới
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={regUsername}
              onChange={(e) => setRegUsername(e.target.value)}
              placeholder="Nhập tên tài khoản..."
              className="w-full px-4 py-2.5 bg-white border border-[#BDD8E9] rounded-xl text-[#001D39] placeholder-[#49769F] focus:outline-none focus:border-[#7BBDE8] focus:ring-2 focus:ring-[#7BBDE8]/40 text-sm transition"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#49769F] uppercase tracking-wider mb-1.5">
              Mật Khẩu (Ít nhất 6 ký tự)
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-white border border-[#BDD8E9] rounded-xl text-[#001D39] placeholder-[#49769F] focus:outline-none focus:border-[#7BBDE8] focus:ring-2 focus:ring-[#7BBDE8]/40 text-sm transition"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#49769F] uppercase tracking-wider mb-1.5">
              Vai Trò (Role)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs font-bold transition ${
                  regRole === "creator"
                    ? "bg-[#BDD8E9]/40 border-[#0A4174] text-[#0A4174]"
                    : "bg-white border-[#BDD8E9] text-[#49769F] hover:text-[#001D39]"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="creator"
                  checked={regRole === "creator"}
                  onChange={() => setRegRole("creator")}
                  className="hidden"
                />
                <UserCheck className="w-4 h-4 text-[#0A4174]" /> Creator (Tạo)
              </label>

              <label
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs font-bold transition ${
                  regRole === "reviewer"
                    ? "bg-[#4E8EA2]/20 border-[#4E8EA2] text-[#001D39]"
                    : "bg-white border-[#BDD8E9] text-[#49769F] hover:text-[#001D39]"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="reviewer"
                  checked={regRole === "reviewer"}
                  onChange={() => setRegRole("reviewer")}
                  className="hidden"
                />
                <ShieldCheck className="w-4 h-4 text-[#4E8EA2]" /> Reviewer (Duyệt)
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#0A4174] hover:bg-[#001D39] text-white font-bold text-sm rounded-xl shadow-lg shadow-[#0A4174]/25 transition disabled:opacity-50 mt-2"
          >
            {loading ? "Đang xử lý đăng ký..." : "Tạo Tài Khoản & Đăng Nhập"}
          </button>
        </form>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001D39]/60 backdrop-blur-md p-4 overflow-y-auto">
        {content}
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#BDD8E9]/25 p-4">
      {content}
    </div>
  );
}
