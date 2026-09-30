"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { BackgroundProvider, useBackground } from "@/context/BackgroundContext";
import { BackgroundSettingsModal } from "@/components/BackgroundSettingsModal";
import { VehicSimShell } from "@/components/VehicSimShell";

/**
 * Trang VehicSim nằm thẳng trong `app/` (`app/page.tsx`, `app/scenarios`, `app/aeb`,
 * `app/analysis`, `app/validation`) và dùng khung riêng `VehicSimShell` (sidebar Figma,
 * kiểm tra đăng nhập) thay cho sidebar của Scenario Forge. Thêm trang VehicSim ở một
 * thư mục gốc mới thì thêm tiền tố URL vào đây.
 */
const VEHICSIM_PREFIXES = ["/scenarios", "/aeb", "/analysis", "/validation"];

function isVehicSimPath(pathname: string): boolean {
  return pathname === "/" || VEHICSIM_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { bgImage, bgBlur, overlayOpacity } = useBackground();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    if (saved !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial layout state load from localStorage
      setIsCollapsed(saved === "true");
    }
  }, []);

  const handleToggle = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  if (isVehicSimPath(pathname)) {
    return <VehicSimShell>{children}</VehicSimShell>;
  }

  // Trang độc lập (không sidebar): landing, đăng nhập, đăng ký, quên mật khẩu.
  const isStandalonePage =
    pathname === "/landing" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password";

  if (isStandalonePage) {
    return (
      <main className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
        {children}
      </main>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden font-sans">
      {/* Global System Background Image & Overlay Layer */}
      {bgImage && (
        <>
          <div
            className="fixed inset-0 z-0 bg-cover bg-center pointer-events-none transition-all duration-500"
            style={{
              backgroundImage: `url(${bgImage})`,
              filter: `blur(${bgBlur}px)`,
            }}
            suppressHydrationWarning
          />
          <div
            className="fixed inset-0 z-0 bg-slate-950 pointer-events-none transition-opacity duration-300"
            style={{ opacity: overlayOpacity }}
            suppressHydrationWarning
          />
        </>
      )}

      {/* Global Background Settings Modal */}
      <BackgroundSettingsModal />

      {/* Floating Glassmorphism Sidebar */}
      <Sidebar isCollapsed={isCollapsed} onToggle={handleToggle} />

      {/* Main Page Area */}
      <main
        className={`relative z-10 flex-1 min-h-screen transition-all duration-300 p-3 md:p-5 ${
          isCollapsed ? "ml-[84px]" : "ml-[276px]"
        }`}
      >
        {children}
      </main>
    </div>
  );
}

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <BackgroundProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </BackgroundProvider>
  );
}
