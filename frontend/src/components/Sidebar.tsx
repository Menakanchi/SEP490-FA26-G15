"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Zap,
  ClipboardCheck,
  Library,
  Layers,
  ChevronRight,
} from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Generator",
    description: "Sinh kịch bản mới",
    icon: Zap,
  },
  {
    href: "/review",
    label: "HITL Review",
    description: "Duyệt kịch bản",
    icon: ClipboardCheck,
  },
  {
    href: "/library",
    label: "Thư viện",
    description: "Kịch bản đã duyệt",
    icon: Library,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] flex flex-col border-r border-white/5 bg-[#0a0e1a]/95 backdrop-blur-xl z-50">
      {/* Logo */}
      <div className="px-5 py-6 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Layers className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight">
            Scenario Forge
          </h1>
          <p className="text-[10px] text-slate-500 font-medium">
            P-130 · OpenSCENARIO
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                group flex items-center gap-3 px-3 py-2.5 rounded-xl
                text-sm font-medium transition-all duration-200
                ${
                  isActive
                    ? "bg-blue-500/10 text-blue-400 shadow-sm shadow-blue-500/5"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                }
              `}
            >
              <item.icon
                className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                  isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-400"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="truncate">{item.label}</div>
                <div
                  className={`text-[10px] truncate ${
                    isActive ? "text-blue-400/60" : "text-slate-600"
                  }`}
                >
                  {item.description}
                </div>
              </div>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 text-blue-400/50" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/5">
        <div className="text-[10px] text-slate-600 font-medium">
          RAV-03 · AI20K Build Phase 3
        </div>
      </div>
    </aside>
  );
}
