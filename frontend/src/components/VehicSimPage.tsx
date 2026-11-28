"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { useAuth } from "@/context/AuthContext";

export type Crumb = { label: string; href?: string };

interface VehicSimPageProps {
  crumbs: Crumb[];
  title?: React.ReactNode;
  badges?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Bước của vòng MVP mà màn này thuộc về (xem components/vehicsimFlow.ts). */
  step?: number | number[];
  showContext?: boolean;
  hideMissingProjectError?: boolean;
  children: React.ReactNode;
}

export function VehicSimPage({ crumbs, title, badges, subtitle, actions, showContext = true, hideMissingProjectError = false, children }: VehicSimPageProps) {
  const { ctx, error, canResetProject, noProjectInScope, selectProject } = useVehicSimContext();
  const { user } = useAuth();
  const pathname = usePathname();
  const viewedProjectId = pathname.match(/^\/projects\/(\d+)(?:\/|$)/)?.[1];
  const showCurrentContext = showContext && (!viewedProjectId || Number(viewedProjectId) === ctx?.project.id);
  const reviewer = user?.roleCode === "REVIEWER";
  const baseline = ctx?.system.baseline;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1680px] flex-1 flex-col gap-5 px-4 pb-10 pt-5 sm:px-6 xl:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-vehicsim-line pb-3 print:hidden">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          <nav aria-label="Đường dẫn" className="flex min-w-0 flex-wrap items-center gap-2 break-words text-[13px]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <React.Fragment key={c.label}>
                {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-vehicsim-faint" />}
                {c.href && !last ? (
                  <Link href={c.href} className="font-medium text-slate-500 hover:text-slate-900 transition-colors">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={last ? "font-bold text-slate-900" : "font-medium text-slate-500"}>{c.label}</span>
                )}
              </React.Fragment>
            );
          })}
          </nav>
          {badges && <div className="flex min-w-0 flex-wrap items-center gap-2">{badges}</div>}
        </div>
        {actions && (
          <div className="vehicsim-page-actions flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      <h1 className="sr-only">{title ?? crumbs.at(-1)?.label ?? "VehicSim"}</h1>

      {subtitle && <div className="-mt-2 min-w-0 break-words text-[13px] leading-relaxed text-vehicsim-muted">{subtitle}</div>}

      {error && !(hideMissingProjectError && noProjectInScope) && (
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

      {/* Thanh ngữ cảnh Dự án, Phương tiện & Bản cơ sở thay cho thanh hành trình cũ */}
      {showCurrentContext && (ctx?.vehicle || baseline) && (
        <div className="flex flex-wrap items-center gap-6 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface px-4 py-2.5 text-[13px] shadow-xs print:hidden">
          {ctx?.project && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-vehicsim-muted">Dự án:</span>
              <span className="font-bold text-vehicsim-ink">{ctx.project.name}</span>
            </div>
          )}
          {ctx?.vehicle && (
            <div className="flex items-center gap-2 border-l border-solid border-vehicsim-line pl-4">
              <span className="font-medium text-vehicsim-muted">Phương tiện:</span>
              <span className="font-bold text-vehicsim-ink">{ctx.vehicle.name}</span>
            </div>
          )}
          {baseline && (
            <div className="flex items-center gap-2 border-l border-solid border-vehicsim-line pl-4">
              <span className="font-medium text-vehicsim-muted">Bản cơ sở:</span>
              <span className="font-bold text-vehicsim-primary">{ctx?.system.name ?? "AEB"} {baseline.label}</span>
            </div>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
