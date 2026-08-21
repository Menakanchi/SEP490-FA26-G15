"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types/auth";
import { Loader2, ShieldAlert, Lock, LogIn } from "lucide-react";

interface AuthGateProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
  fallback?: React.ReactNode;
}

export function AuthGate({ children, allowedRoles, fallback }: AuthGateProps) {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[300px] w-full flex flex-col items-center justify-center text-slate-500 gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="text-xs font-bold tracking-wider uppercase text-slate-400">
          Đang kiểm tra phiên làm việc...
        </span>
      </div>
    );
  }

  // 1. Chưa đăng nhập
  if (!isAuthenticated) {
    if (fallback) return <>{fallback}</>;

    return (
      <div className="min-h-[400px] w-full flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-xl text-center space-y-4 text-slate-900">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Yêu Cầu Đăng Nhập</h3>
          <p className="text-slate-500 text-xs leading-relaxed">
            Bạn cần đăng nhập tài khoản hệ thống Scenario Forge để truy cập và xem nội dung này.
          </p>
          <Link
            href="/login"
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 transition"
          >
            <LogIn className="w-4 h-4" />
            <span>Chuyển Sang Trang Đăng Nhập</span>
          </Link>
        </div>
      </div>
    );
  }

  // 2. Đã đăng nhập nhưng không đủ quyền Role
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    if (fallback) return <>{fallback}</>;

    return (
      <div className="min-h-[300px] w-full flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-amber-50 p-8 rounded-3xl text-center border border-amber-200 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-amber-900">Quyền Hạn Không Đủ</h3>
          <p className="text-slate-700 text-xs leading-relaxed">
            Tính năng này yêu cầu vai trò:{" "}
            <span className="font-bold text-amber-700 uppercase">[{allowedRoles.join(", ")}]</span>.
            <br />
            Vai trò hiện tại của bạn là:{" "}
            <span className="font-bold text-slate-900 uppercase">&lsquo;{role}&rsquo;</span>.
          </p>
        </div>
      </div>
    );
  }

  // 3. Đã xác thực & đủ quyền
  return <>{children}</>;
}
