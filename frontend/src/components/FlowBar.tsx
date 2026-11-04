"use client";

import React from "react";
import Link from "next/link";
import { MVP_STEPS } from "@/components/vehicsimFlow";
import { cx } from "@/components/VehicSimUi";

/** Thanh 6 bước của vòng MVP ở đầu mỗi màn: bước của màn hiện tại tô đen, bước khác bấm để chuyển. */
export function FlowBar({ active }: { active: number[] }) {
  return (
    <nav aria-label="Vòng MVP" className="flex w-full items-center gap-1 overflow-x-auto rounded-md border border-solid border-vehicsim-line bg-white p-1 shadow-2xs print:hidden">
      <Link href="/" className="shrink-0 rounded px-2.5 py-1 text-[12px] font-semibold text-vehicsim-faint hover:bg-vehicsim-soft hover:text-vehicsim-ink">
        Vòng MVP
      </Link>
      {MVP_STEPS.map((s) => {
        const on = active.includes(s.n);
        return (
          <Link
            key={s.n}
            href={s.href}
            aria-current={on ? "step" : undefined}
            className={cx(
              "flex min-w-0 flex-1 items-center justify-center gap-[6px] whitespace-nowrap rounded px-2.5 py-1 text-[12px] font-medium",
              on ? "bg-vehicsim-ink text-white" : "text-vehicsim-muted hover:bg-vehicsim-soft",
            )}
          >
            <span className={cx("flex size-[18px] shrink-0 items-center justify-center rounded-sm text-[10px]", on ? "bg-white/20" : "bg-vehicsim-soft")}>
              {s.n}
            </span>
            <span className="truncate" title={s.title}>{s.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
