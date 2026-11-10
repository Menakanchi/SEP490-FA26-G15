"use client";

import React from "react";
import Link from "next/link";
import { jakarta } from "@/components/vehicsimFonts";
import { JOURNEY_STEPS } from "@/components/project/journey";

interface AuthCardProps {
  title: string;
  subtitle: string;
  /** Không có `backHref` lẫn `onBack` thì không hiện nút quay lại (vd. trang đăng nhập). */
  backHref?: string;
  backLabel?: string;
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
 * VehicSim (token `vehicsim-*`, Plus Jakarta Sans).
 */
export function AuthCard({ title, subtitle, backHref, backLabel, onBack, stepLabel, error, notice, children, footer }: AuthCardProps) {
  const backClass = "inline-flex w-fit items-center gap-1.5 text-[12px] font-semibold text-vehicsim-faint transition hover:text-vehicsim-ink";
  return (
    <div className={`${jakarta.className} flex min-h-dvh w-full bg-vehicsim-bg text-vehicsim-ink`}>
      <aside className="hidden w-[400px] shrink-0 flex-col justify-between gap-8 border-r border-vehicsim-line bg-vehicsim-surface px-10 py-9 lg:flex">
        <Link href="/" className="flex items-center gap-[10px]">
          <span className="flex size-8 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo SVG từ Figma */}
            <img alt="" src="/vehicsim/logo.svg" width={28} height={28} className="size-7" />
          </span>
          <span className="text-[20px] font-extrabold tracking-[-0.4px]">VehicSim</span>
        </Link>

        <div className="flex flex-col gap-4">
          <p className="text-[26px] font-bold leading-tight tracking-[-0.025em]">Kiểm thử phanh tự động</p>
          <p className="text-sm text-vehicsim-muted">Quy trình mô phỏng và kiểm chứng cấu hình AEB/FCW.</p>
          <ol className="divide-y divide-vehicsim-line border-t border-vehicsim-line">
            {JOURNEY_STEPS.map((s) => (
              <li key={s.key} className="flex items-center gap-3 py-3 text-sm font-semibold">
                <span className="text-xs tabular-nums text-vehicsim-primary">{s.n}</span>
                {s.title}
              </li>
            ))}
          </ol>
        </div>

        <p className="text-xs leading-relaxed text-vehicsim-muted">
          Kết quả mô phỏng dùng để phân tích và kiểm chứng cấu hình AEB.
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-[440px] flex-col gap-6 rounded-xl border border-vehicsim-line bg-vehicsim-surface p-5 sm:p-8">
          {onBack ? (
            <button type="button" onClick={onBack} className={backClass}>
              ← {backLabel}
            </button>
          ) : backHref ? (
            <Link href={backHref} className={backClass}>
              ← {backLabel}
            </Link>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- logo SVG từ Figma */}
              <img alt="" src="/vehicsim/logo.svg" width={24} height={24} className="size-6" />
              <span className="text-[16px] font-extrabold">VehicSim</span>
            </div>
            {stepLabel && <span className="text-[12px] font-semibold uppercase tracking-[0.6px] text-vehicsim-faint">{stepLabel}</span>}
            <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em] text-vehicsim-ink">{title}</h1>
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
  "h-11 w-full rounded-lg border border-vehicsim-line-strong bg-vehicsim-surface px-3.5 text-sm text-vehicsim-ink placeholder:text-vehicsim-faint focus:border-vehicsim-primary focus:outline-none focus:ring-2 focus:ring-vehicsim-primary-bg";

export const labelClass = "mb-[6px] flex items-center gap-1.5 text-[13px] font-medium text-vehicsim-muted [&>svg]:text-vehicsim-faint";

export const primaryButtonClass =
  "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-vehicsim-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-vehicsim-primary-hover disabled:cursor-not-allowed disabled:opacity-50";

export const linkClass = "font-semibold text-vehicsim-ink underline-offset-2 hover:underline";
