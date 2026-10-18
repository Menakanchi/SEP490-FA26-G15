"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getRegistrationMode, type RegistrationMode } from "@/services/api";
import { AuthCard, linkClass } from "@/components/auth/AuthCard";
import { OneStepRegisterForm } from "@/components/auth/OneStepRegisterForm";
import { OtpRegisterForm } from "@/components/auth/OtpRegisterForm";
import { Loader2 } from "lucide-react";

/**
 * Đăng ký. Backend quyết định luồng (`GET /auth/register/mode`, TD-35):
 * - `otp` (mặc định ở production): email -> mã 6 số -> tài khoản, nên chỉ chủ email mới đăng ký được;
 * - `one_step` (mặc định ở dev, chưa cần SMTP): tạo tài khoản và đăng nhập luôn, không xác minh email.
 */
export default function RegisterPage() {
  const [mode, setMode] = useState<RegistrationMode | "loading" | "error">("loading");

  useEffect(() => {
    let alive = true;
    getRegistrationMode()
      .then((m) => alive && setMode(m))
      .catch(() => alive && setMode("error"));
    return () => {
      alive = false;
    };
  }, []);

  if (mode === "otp") return <OtpRegisterForm />;
  if (mode === "one_step") return <OneStepRegisterForm />;

  return (
    <AuthCard
      title="Tạo tài khoản"
      subtitle={mode === "loading" ? "Đang tải..." : "Không kết nối được máy chủ. Vui lòng thử lại sau."}
      backHref="/login"
      backLabel="Quay lại trang Đăng nhập"
      footer={
        <>
          Đã có tài khoản?{" "}
          <Link href="/login" className={linkClass}>
            Đăng nhập tại đây
          </Link>
        </>
      }
    >
      {mode === "loading" && (
        <div className="flex justify-center py-6 text-vehicsim-faint">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
    </AuthCard>
  );
}
