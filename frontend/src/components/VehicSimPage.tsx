"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { FlowBar } from "@/components/FlowBar";
import { JourneyBar, TeamJourneyBar } from "@/components/project/ProjectShell";
import { useAuth } from "@/context/AuthContext";

export type Crumb = { label: string; href?: string };

interface VehicSimPageProps {
  crumbs: Crumb[];
  title: React.ReactNode;
  badges?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Bước của vòng MVP mà màn này thuộc về (xem components/vehicsimFlow.ts). */
  step?: number | number[];
  showContext?: boolean;
  children: React.ReactNode;
}

function ContextField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-vehicsim-line-strong pl-3 text-xs">
      <dt className="text-vehicsim-muted">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-vehicsim-ink">{value}</dd>
    </div>
  );
}

/** Khung nội dung trang và ngữ cảnh kiểm thử. */
export function VehicSimPage({ crumbs, title, badges, subtitle, actions, step, showContext = true, children }: VehicSimPageProps) {
  const { ctx, error, isExperiencer, canResetProject, selectProject } = useVehicSimContext();
  const { user } = useAuth();
  const reviewer = user?.roleCode === "REVIEWER";
  const baseline = ctx?.system.baseline;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1680px] flex-1 flex-col gap-5 px-4 pb-10 pt-5 sm:px-6 xl:px-8">
      <div className="border-b border-vehicsim-line pb-3 print:hidden">
        <nav aria-label="Đường dẫn" className="flex min-w-0 flex-wrap items-center gap-2 break-words text-[13px]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <React.Fragment key={c.label}>
                {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-vehicsim-faint" />}
                {c.href && !last ? (
                  <Link href={c.href} className="font-medium text-vehicsim-faint hover:text-vehicsim-ink">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={last ? "font-semibold text-vehicsim-ink" : "font-medium text-vehicsim-faint"}>{c.label}</span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {error && (
        <div role="alert" className="rounded-[16px] border border-solid border-vehicsim-danger/30 bg-vehicsim-danger-bg px-4 py-3 text-[13px] text-vehicsim-danger">
          {error}
          {canResetProject && <button type="button" onClick={() => selectProject(null)} className="ml-3 font-semibold underline">Chọn lại project</button>}
        </div>
      )}

      {reviewer && ctx && !ctx.reviewer_can_decide && (
        <p className="rounded-[14px] bg-vehicsim-warn-bg px-4 py-3 text-[13px] text-vehicsim-warn">
          Project hoặc workspace đã lưu trữ. Bạn có thể xem lịch sử.
        </p>
      )}

      {isExperiencer ? <JourneyBar /> : reviewer || user?.roleCode === "ENGINEER"
        ? <TeamJourneyBar reviewer={reviewer} />
        : step !== undefined && <FlowBar active={Array.isArray(step) ? step : [step]} />}

      <div className="vehicsim-page-heading flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-[300px] flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 break-words text-[28px] font-bold leading-[1.2] tracking-[-0.025em] text-vehicsim-ink sm:text-[34px]">{title}</h1>
            {badges}
          </div>
          {subtitle && <p className="max-w-[640px] text-[15px] leading-[1.5] text-vehicsim-muted">{subtitle}</p>}
        </div>
        {showContext && (ctx?.vehicle || baseline) && (
          <dl className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2">
            {ctx?.vehicle && <ContextField label="Phương tiện" value={ctx.vehicle.name} />}
            {baseline && <ContextField label="Bản cơ sở" value={`${ctx?.system.name ?? "AEB"} ${baseline.label}`} />}
          </dl>
        )}
        {actions && <div className="vehicsim-page-actions flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children}
    </div>
  );
}
