"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { VehicSimShell } from "@/components/VehicSimShell";

/** Trang xác thực đứng độc lập (không sidebar, không cần đăng nhập). */
const STANDALONE_PATHS = ["/login", "/register", "/forgot-password"];

/**
 * Mọi trang còn lại (Tổng quan, kịch bản, AEB, phân tích, kiểm định, hồ sơ) dùng khung
 * `VehicSimShell`: sidebar Figma + kiểm tra đăng nhập.
 */
export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (STANDALONE_PATHS.includes(pathname)) {
    return (
      <main className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
        {children}
      </main>
    );
  }
  return <VehicSimShell>{children}</VehicSimShell>;
}
