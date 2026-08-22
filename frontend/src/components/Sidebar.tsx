"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import {
  Zap,
  ClipboardCheck,
  Layers,
  ChevronRight,
  Compass,
  LogOut,
  Sun,
  Moon,
  Globe,
  User,
} from "lucide-react";
import type { Role } from "@/types/auth";

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
  allowedRoles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/landing",
    label: "Giới thiệu Platform",
    description: "Tổng quan & ODD Platform",
    icon: Compass,
    allowedRoles: ["creator", "reviewer", "admin"],
  },
  {
    href: "/",
    label: "Generator",
    description: "Sinh kịch bản mới",
    icon: Zap,
    allowedRoles: ["creator", "reviewer", "admin"],
  },
  {
    href: "/review",
    label: "HITL Review",
    description: "Duyệt kịch bản",
    icon: ClipboardCheck,
    allowedRoles: ["reviewer", "admin"],
  },
  {
    href: "/library",
    label: "Thư viện chung",
    description: "Kịch bản đã duyệt",
    icon: Globe,
    allowedRoles: ["creator", "reviewer", "admin"],
  },
  {
    href: "/library?tab=me",
    label: "Thư viện cá nhân",
    description: "Nháp & Kịch bản của tôi",
    icon: User,
    allowedRoles: ["creator", "reviewer", "admin"],
  },
];

function SidebarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { logout, user, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- avoid hydration mismatch on theme button
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const filteredNavItems = NAV_ITEMS.filter((item) => {
    if (!item.allowedRoles) return true;
    if (role) return item.allowedRoles.includes(role);
    return item.allowedRoles.includes("creator");
  });

  const currentTab = searchParams.get("tab");

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 z-50 shadow-sm font-sans transition-colors duration-200">
      {/* Logo */}
      <div className="px-5 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Scenario Forge
            </h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium font-mono">
              P-130 · OpenSCENARIO
            </p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-slate-200 dark:bg-slate-800" />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {filteredNavItems.map((item) => {
          let isActive = false;
          if (item.href === "/library?tab=me") {
            isActive = pathname === "/library" && currentTab === "me";
          } else if (item.href === "/library") {
            isActive = pathname === "/library" && currentTab !== "me";
          } else {
            isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                group flex items-center gap-3 px-3 py-2.5 rounded-xl
                text-sm font-semibold transition-all duration-200
                ${
                  isActive
                    ? "bg-blue-50/80 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 shadow-sm border border-blue-200/80 dark:border-blue-800/60 font-bold border-r-2 border-r-blue-600"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-sky-50/50 dark:hover:bg-slate-800/60"
                }
              `}
            >
              <item.icon
                className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                  isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="truncate">{item.label}</div>
                <div
                  className={`text-[10px] truncate font-normal ${
                    isActive ? "text-blue-600/80 dark:text-blue-400/80" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {item.description}
                </div>
              </div>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Profile, Theme Toggle & Logout */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-sky-50/30 dark:bg-slate-950/40 space-y-3">
        {/* Quick Theme Switch Row */}
        <div className="flex items-center justify-between px-1 text-xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Giao diện:</span>
          <button
            type="button"
            onClick={toggleTheme}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-sky-100 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1.5 shadow-sm hover:border-blue-500 transition cursor-pointer"
          >
            {!mounted ? (
              <>
                <Moon className="w-3.5 h-3.5 text-blue-600" />
                <span>Chế độ Tối</span>
              </>
            ) : theme === "light" ? (
              <>
                <Moon className="w-3.5 h-3.5 text-blue-600" />
                <span>Chế độ Tối</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Chế độ Sáng</span>
              </>
            )}
          </button>
        </div>

        {user && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/60 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0">
                {(user.name || user.username || "U").charAt(0).toUpperCase()}
              </div>
              <div className="truncate text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200 block truncate leading-tight">
                  {user.name || user.username}
                </span>
                <span className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400">({role})</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Đăng xuất"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition shrink-0 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

export function Sidebar() {
  return (
    <Suspense fallback={<aside className="fixed left-0 top-0 bottom-0 w-[260px] border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />}>
      <SidebarContent />
    </Suspense>
  );
}
