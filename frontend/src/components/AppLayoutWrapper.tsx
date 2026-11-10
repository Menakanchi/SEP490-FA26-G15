"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { VehicSimShell } from "@/components/VehicSimShell";

/** Trang xác thực đứng độc lập (không sidebar, không cần đăng nhập). */
const STANDALONE_PATHS = ["/login", "/register", "/forgot-password"];

/**
 * Mọi trang còn lại (Tổng quan, kịch bản, AEB, phân tích, kiểm định, hồ sơ) dùng khung
 * `VehicSimShell` để dùng chung điều hướng và kiểm tra đăng nhập.
 */
export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (STANDALONE_PATHS.includes(pathname)) {
    return (
      <div className="min-h-dvh w-full bg-vehicsim-bg text-vehicsim-ink">
        {children}
      </div>
    );
  }
  return <VehicSimShell>{children}</VehicSimShell>;
}
