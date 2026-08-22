"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types/auth";
import { ShieldAlert, Lock, ArrowRight } from "lucide-react";

interface RoleGateProps {
  allowedRoles: Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGate({ allowedRoles, children, fallback }: RoleGateProps) {
  const { isAuthenticated, role, user } = useAuth();

  // 1. Chưa đăng nhập -> Lời nhắc đăng nhập
  if (!isAuthenticated || !user) {
    if (fallback) return <>{fallback}</>;

    return (
      <div className="p-8 bg-white border border-slate-200 shadow-xl rounded-3xl text-center space-y-4 max-w-md mx-auto my-6 text-slate-900">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">Yêu Cầu Đăng Nhập</h3>
          <p className="text-slate-500 text-xs leading-relaxed">
            Vui lòng đăng nhập tài khoản để thực thi và truy cập tính năng này.
          </p>
        </div>
        <Link
          href="/login"
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 transition"
        >
          <span>Đăng Nhập Ngay</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  // 2. Đã đăng nhập nhưng Role không nằm trong danh sách cho phép
  if (role && !allowedRoles.includes(role)) {
    if (fallback) return <>{fallback}</>;

    return (
      <div className="p-8 bg-amber-50 border border-amber-200 rounded-3xl text-center space-y-3 max-w-md mx-auto my-6">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-amber-900">Bạn không có quyền thực hiện hành động này</h3>
        <p className="text-slate-700 text-xs leading-relaxed">
          Tính năng này yêu cầu vai trò:{" "}
          <span className="font-bold text-amber-700 uppercase">[{allowedRoles.join(", ")}]</span>.
          <br />
          Vai trò hiện tại của bạn là:{" "}
          <span className="font-bold text-slate-900 uppercase">&lsquo;{role}&rsquo;</span>.
        </p>
      </div>
    );
  }

  // 3. Đã xác thực & đủ quyền
  return <>{children}</>;
}
