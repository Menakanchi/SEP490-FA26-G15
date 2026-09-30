"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { FlowBar } from "@/components/FlowBar";

export type Crumb = { label: string; href?: string };

interface VehicSimPageProps {
  crumbs: Crumb[];
  title: React.ReactNode;
  badges?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Bước của vòng MVP mà màn này thuộc về (xem components/vehicsimFlow.ts). */
  step?: number | number[];
  children: React.ReactNode;
}

function ContextChip({ label, value }: { label: string; value?: string | null }) {
  return (
    <span className="flex items-center gap-[6px] whitespace-nowrap rounded-full border border-solid border-vehicsim-line bg-white px-3 py-[7px] text-[12px]">
      <span className="font-medium text-vehicsim-faint">{label}</span>
      <span className="font-semibold text-vehicsim-ink">{value ?? "—"}</span>
    </span>
  );
}

/** Khung một trang VehicSim: thanh trên (breadcrumb + chip ngữ cảnh + tìm kiếm) và tiêu đề trang. */
export function VehicSimPage({ crumbs, title, badges, subtitle, actions, step, children }: VehicSimPageProps) {
  const { ctx, error } = useVehicSimContext();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const run = search.trim().replace(/^#/, "");
    if (/^\d+$/.test(run)) router.push(`/analysis/failures/${run}`);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 px-9 pb-10 pt-[22px]">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <nav className="flex items-center gap-2 whitespace-nowrap text-[13px]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <React.Fragment key={c.label}>
                {i > 0 && <span className="text-vehicsim-faint">/</span>}
                {c.href && !last ? (
                  <Link href={c.href} className="font-medium text-vehicsim-faint hover:text-vehicsim-ink">
                    {c.label}
                  </Link>
                ) : (
                  <span className={last ? "font-semibold text-vehicsim-ink" : "font-medium text-vehicsim-faint"}>{c.label}</span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ContextChip label="Không gian" value={ctx?.workspace?.name} />
          <ContextChip label="Phương tiện" value={ctx?.vehicle?.name} />
          <ContextChip
            label="Hệ thống"
            value={ctx ? `${ctx.system.name} ${ctx.system.baseline?.label ?? ""}`.trim() : undefined}
          />
          <form onSubmit={onSearch}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm lượt chạy, vd. #1023"
              aria-label="Tìm theo mã lượt chạy, ví dụ #1023"
              className="w-[200px] rounded-full border border-solid border-vehicsim-line bg-white px-[14px] py-2 text-[12px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
            />
          </form>
          {/* eslint-disable-next-line @next/next/no-img-element -- nút thông báo SVG từ Figma */}
          <img alt="" src="/vehicsim/notify.svg" width={34} height={34} className="size-[34px]" />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-[16px] border border-solid border-vehicsim-danger/30 bg-vehicsim-danger-bg px-4 py-3 text-[13px] text-vehicsim-danger">
          {error}
        </div>
      )}

      {step !== undefined && <FlowBar active={Array.isArray(step) ? step : [step]} />}

      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-[10px]">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[40px] font-extrabold leading-[1.1] tracking-[-1.2px] text-vehicsim-ink">{title}</h1>
            {badges}
          </div>
          {subtitle && <p className="max-w-[640px] text-[15px] leading-[1.5] text-vehicsim-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-[10px]">{actions}</div>}
      </div>

      {children}
    </div>
  );
}
