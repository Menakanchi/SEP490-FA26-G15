"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/context/AuthContext";

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  // Ẩn Sidebar trên các trang độc lập hoặc khi chưa đăng nhập tại trang chủ
  const isStandalonePage =
    pathname === "/landing" ||
    pathname === "/login" ||
    pathname === "/register" ||
    (!isAuthenticated && pathname === "/");

  if (isStandalonePage) {
    return (
      <main className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
        {children}
      </main>
    );
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 ml-[260px] min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
        {children}
      </main>
    </>
  );
}
