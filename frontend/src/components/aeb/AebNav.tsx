"use client";

import React from "react";
import Link from "next/link";
import {
  BarChart3,
  CheckSquare,
  GitCompare,
  Layers,
  Sliders,
} from "lucide-react";
import { cx } from "@/components/VehicSimUi";

export type AebTabKey =
  | "hub"
  | "mobo_new"
  | "mobo"
  | "mobo_pareto"
  | "mobo_trials"
  | "manual"
  | "candidates"
  | "versions"
  | "compare";

type CoreTabKey = "hub" | "mobo" | "manual" | "versions" | "compare";

const TAB_MAPPING: Record<AebTabKey, CoreTabKey> = {
  hub: "hub",
  mobo_new: "mobo",
  mobo: "mobo",
  mobo_pareto: "mobo",
  mobo_trials: "mobo",
  manual: "manual",
  candidates: "versions",
  versions: "versions",
  compare: "compare",
};

const TABS: {
  key: CoreTabKey;
  label: string;
  href: string;
  badge?: string;
  icon: React.ReactNode;
}[] = [
  { key: "hub", label: "Tổng quan cải tiến", href: "/aeb", icon: <Layers className="size-4" /> },
  { key: "mobo", label: "Tối ưu tự động (MOBO)", href: "/aeb/mobo", badge: "AI qEHVI", icon: <BarChart3 className="size-4" /> },
  { key: "manual", label: "Chỉnh tay tham số", href: "/aeb/manual", icon: <Sliders className="size-4" /> },
  { key: "versions", label: "Danh sách phiên bản", href: "/aeb/versions", icon: <CheckSquare className="size-4" /> },
  { key: "compare", label: "So sánh 2 phiên bản", href: "/aeb/compare", icon: <GitCompare className="size-4" /> },
];

export function AebNav({ active }: { active: AebTabKey }) {
  const currentCoreKey = TAB_MAPPING[active] ?? "hub";

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-solid border-vehicsim-line pb-1 scrollbar-none">
      {TABS.map((tab) => {
        const isSelected = currentCoreKey === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={cx(
              "flex items-center gap-2 whitespace-nowrap rounded-t-[12px] px-4 py-2.5 text-[13px] font-bold transition",
              isSelected
                ? "border-b-2 border-vehicsim-primary bg-vehicsim-surface text-vehicsim-ink shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="rounded-full bg-vehicsim-decision-bg px-2 py-0.5 text-[10px] font-semibold text-vehicsim-decision">
                {tab.badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
