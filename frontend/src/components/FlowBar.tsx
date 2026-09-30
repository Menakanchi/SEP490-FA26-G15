"use client";

import React from "react";
import Link from "next/link";
import { MVP_STEPS } from "@/components/vehicsimFlow";
import { cx } from "@/components/VehicSimUi";

/** Thanh 6 bước của vòng MVP ở đầu mỗi màn: bước của màn hiện tại tô đen, bước khác bấm để chuyển. */
export function FlowBar({ active }: { active: number[] }) {
  return (
    <nav aria-label="Vòng MVP" className="flex w-full items-center gap-1 overflow-x-auto rounded-full border border-solid border-vehicsim-line bg-white p-1 print:hidden">
      <Link href="/" className="shrink-0 rounded-full px-3 py-[6px] text-[12px] font-semibold text-vehicsim-faint hover:bg-vehicsim-soft hover:text-vehicsim-ink">
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
              "flex min-w-0 flex-1 items-center justify-center gap-[6px] whitespace-nowrap rounded-full px-3 py-[6px] text-[12px] font-semibold",
              on ? "bg-vehicsim-ink text-white" : "text-vehicsim-muted hover:bg-vehicsim-soft",
            )}
          >
            <span className={cx("flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px]", on ? "bg-white/20" : "bg-vehicsim-soft")}>
              {s.n}
            </span>
            <span className="truncate" title={s.title}>{s.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
