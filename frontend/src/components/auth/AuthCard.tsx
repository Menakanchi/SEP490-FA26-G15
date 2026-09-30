"use client";

import React from "react";
import Link from "next/link";
import { jakarta } from "@/components/vehicsimFonts";
import { MVP_STEPS } from "@/components/vehicsimFlow";

interface AuthCardProps {
  title: string;
  subtitle: string;
  backHref: string;
  backLabel: string;
  /** Có thì nút quay lại gọi hàm này (vd. về bước trước) thay vì chuyển trang. */
  onBack?: () => void;
  /** Nhãn tiến trình nhỏ phía trên tiêu đề, vd. "Bước 1/2". */
  stepLabel?: string;
  error?: string | null;
  notice?: string | null;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Khung chung cho đăng nhập / đăng ký / quên mật khẩu, theo ngôn ngữ thiết kế
 * VehicSim (token `vehicsim-*`, Plus Jakarta Sans). Panel trái giới thiệu vòng MVP mà
 * người dùng sẽ đi qua sau khi đăng nhập.
 */
export function AuthCard({ title, subtitle, backHref, backLabel, onBack, stepLabel, error, notice, children, footer }: AuthCardProps) {
  const backClass = "inline-flex w-fit items-center gap-1.5 text-[12px] font-semibold text-vehicsim-faint transition hover:text-vehicsim-ink";
  return (
    <div className={`${jakarta.className} flex min-h-screen w-full bg-vehicsim-bg text-vehicsim-ink`}>
      <aside className="hidden w-[460px] shrink-0 flex-col justify-between bg-vehicsim-ink px-10 py-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-[10px]">
          <span className="flex size-8 items-center justify-center rounded-full bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo SVG từ Figma */}
            <img alt="" src="/vehicsim/logo.svg" width={28} height={28} className="size-7" />
          </span>
          <span className="text-[20px] font-extrabold tracking-[-0.4px]">VehicSim</span>
        </Link>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-semibold uppercase tracking-[0.8px] text-white/50">Vòng kiểm định AEB · FCW</span>
            <p className="text-[30px] font-extrabold leading-[1.15] tracking-[-0.9px]">
              Mô tả → Sinh biến thể → Mô phỏng → Lỗi → Học → Kiểm định
            </p>
          </div>
          <ol className="flex flex-col gap-[10px]">
            {MVP_STEPS.map((s) => (
              <li key={s.n} className="flex items-start gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-bold">{s.n}</span>
                <span className="flex flex-col">
                  <span className="text-[14px] font-semibold">{s.title}</span>
                  <span className="text-[12px] leading-[1.4] text-white/55">{s.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="text-[11px] leading-[1.5] text-white/40">
          Khuyến nghị dựa trên mô phỏng — không thay thế kiểm thử vật lý hay chứng nhận an toàn. Mọi thay đổi cấu hình đều cần kỹ sư duyệt.
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-[440px] flex-col gap-6 rounded-[20px] border border-solid border-vehicsim-line bg-white p-8 shadow-vehicsim-card">
          {onBack ? (
            <button type="button" onClick={onBack} className={backClass}>
              ← {backLabel}
            </button>
          ) : (
            <Link href={backHref} className={backClass}>
              ← {backLabel}
            </Link>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- logo SVG từ Figma */}
              <img alt="" src="/vehicsim/logo.svg" width={24} height={24} className="size-6" />
              <span className="text-[16px] font-extrabold">VehicSim</span>
            </div>
            {stepLabel && <span className="text-[12px] font-semibold uppercase tracking-[0.6px] text-vehicsim-faint">{stepLabel}</span>}
            <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.9px] text-vehicsim-ink">{title}</h1>
            <p className="text-[14px] leading-[1.5] text-vehicsim-muted">{subtitle}</p>
          </div>

          {error && (
            <div role="alert" className="rounded-[14px] border border-solid border-vehicsim-danger/30 bg-vehicsim-danger-bg px-4 py-3 text-[13px] text-vehicsim-danger">
              {error}
            </div>
          )}
          {notice && !error && (
            <div role="status" className="rounded-[14px] bg-vehicsim-decision-bg px-4 py-3 text-[13px] text-vehicsim-decision">
              {notice}
            </div>
          )}

          {children}

          {footer && <div className="border-t border-solid border-vehicsim-line pt-4 text-center text-[13px] text-vehicsim-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export const inputClass =
  "h-[44px] w-full rounded-[12px] border border-solid border-vehicsim-line-strong bg-white px-[14px] text-[14px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:border-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-line";

export const labelClass = "mb-[6px] flex items-center gap-1.5 text-[13px] font-medium text-vehicsim-muted [&>svg]:text-vehicsim-faint";

export const primaryButtonClass =
  "flex w-full items-center justify-center gap-2 rounded-full bg-vehicsim-ink py-3 text-[14px] font-semibold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-50";

export const linkClass = "font-semibold text-vehicsim-ink underline-offset-2 hover:underline";
