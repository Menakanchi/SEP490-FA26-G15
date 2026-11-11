"use client";

import React from "react";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types/auth";
import { Loader2 } from "lucide-react";
import { Card, PillButton, ROLE_LABELS } from "@/components/VehicSimUi";

interface AuthGateProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
  fallback?: React.ReactNode;
}

export function AuthGate({ children, allowedRoles, fallback }: AuthGateProps) {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) {
    return (
      <div role="status" className="flex min-h-[300px] w-full items-center justify-center gap-2 text-sm text-vehicsim-muted">
        <Loader2 aria-hidden className="size-5 text-vehicsim-primary motion-safe:animate-spin" />
        Đang kiểm tra phiên làm việc…
      </div>
    );
  }

  // 1. Chưa đăng nhập
  if (!isAuthenticated) {
    if (fallback) return <>{fallback}</>;

    return (
      <div className="min-h-[400px] w-full flex items-center justify-center p-4">
        <Card className="flex w-full max-w-md flex-col items-start gap-3 p-5">
          <h2 className="text-lg font-bold">Yêu cầu đăng nhập</h2>
          <p className="text-sm text-vehicsim-muted">Đăng nhập VehicSim để truy cập trang này.</p>
          <PillButton href="/login" variant="dark">Đăng nhập</PillButton>
        </Card>
      </div>
    );
  }

  // 2. Đã đăng nhập nhưng không đủ quyền Role
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    if (fallback) return <>{fallback}</>;

    return (
      <div className="min-h-[300px] w-full flex items-center justify-center p-4">
        <Card className="flex w-full max-w-md flex-col items-start gap-3 p-5">
          <h2 className="text-lg font-bold">Trang này yêu cầu quyền truy cập</h2>
          <p className="text-sm leading-relaxed text-vehicsim-muted">
            Vai trò cần có <strong>{allowedRoles.map((item) => ROLE_LABELS[item] ?? item).join(", ")}</strong>.
            Vai trò hiện tại của bạn là <strong>{ROLE_LABELS[role] ?? role}</strong>.
          </p>
          <PillButton href="/">Về tổng quan</PillButton>
        </Card>
      </div>
    );
  }

  // 3. Đã xác thực & đủ quyền
  return <>{children}</>;
}
