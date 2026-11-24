"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { VehicSimShell } from "@/components/VehicSimShell";
import { LandingPage } from "@/components/landing/LandingPage";
import { useAuth } from "@/context/AuthContext";

/** Trang đứng độc lập (không sidebar, không cần đăng nhập): xác thực và trang giới thiệu. */
const STANDALONE_PATHS = ["/login", "/register", "/forgot-password", "/gioi-thieu"];

/**
 * Mọi trang còn lại (Tổng quan, kịch bản, AEB, phân tích, kiểm định, hồ sơ) dùng khung
 * `VehicSimShell` để dùng chung điều hướng và kiểm tra đăng nhập.
 * Riêng "/": khách chưa đăng nhập thấy trang giới thiệu (tự bấm Đăng nhập / Tạo tài khoản để đi tiếp)
 * thay vì bị chuyển thẳng sang /login; đã đăng nhập thì vẫn là trang Tổng quan.
 */
export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  if (STANDALONE_PATHS.includes(pathname)) {
    return (
      <div className="min-h-dvh w-full bg-vehicsim-bg text-vehicsim-ink">
        {children}
      </div>
    );
  }
  if (pathname === "/" && !isAuthenticated) {
    // Đang đọc phiên đăng nhập: chờ, để người đã đăng nhập không thấy trang giới thiệu nháy lên rồi mới sang Tổng quan.
    if (isLoading) {
      return (
        <div className="flex min-h-dvh w-full items-center justify-center bg-[#07090d]">
          <Loader2 aria-label="Đang tải" className="size-6 text-white/50 motion-safe:animate-spin" />
        </div>
      );
    }
    return <LandingPage />;
  }
  return <VehicSimShell>{children}</VehicSimShell>;
}
