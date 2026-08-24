"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const { isCollapsed } = useSidebar();

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
    <div className="min-h-screen w-full relative flex bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] transition-colors duration-300">
      <Sidebar />
      <main
        className={`flex-1 ${
          isCollapsed ? "ml-[84px]" : "ml-[272px]"
        } p-3 min-h-screen transition-all duration-300 ease-in-out`}
      >
        {children}
      </main>
    </div>
  );
}
