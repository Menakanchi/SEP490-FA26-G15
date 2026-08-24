"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useSidebar } from "@/context/SidebarContext";
import {
  Zap,
  ClipboardCheck,
  Library,
  Layers,
  ChevronRight,
  Compass,
  LogOut,
  Sun,
  Moon,
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
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
    label: "Thư viện",
    description: "Kịch bản ODD & Cá nhân",
    icon: Library,
    allowedRoles: ["creator", "reviewer", "admin"],
  },
  {
    href: "/admin",
    label: "Dashboard Quản Trị",
    description: "Thống kê & Quản lý User",
    icon: Shield,
    allowedRoles: ["admin"],
  },
];

function SidebarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- avoid hydration mismatch on theme button
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const filteredNavItems = useMemo(() => {
    if (role === "admin" || user?.role === "admin") {
      return [
        {
          href: "/admin",
          label: "Dashboard Quản Trị",
          description: "Thống kê & Quản lý User",
          icon: Shield,
          allowedRoles: ["admin" as Role],
        },
        {
          href: "/library",
          label: "Thư viện",
          description: "Kịch bản ODD & Cá nhân",
          icon: Library,
          allowedRoles: ["creator" as Role, "reviewer" as Role, "admin" as Role],
        },
      ];
    }
    return NAV_ITEMS.filter((item) => {
      if (item.href === "/admin") return false;
      if (!item.allowedRoles) return true;
      if (role) return item.allowedRoles.includes(role);
      return item.allowedRoles.includes("creator");
    });
  }, [role, user?.role]);

  return (
    <aside
      className={`fixed left-3 top-3 bottom-3 ${
        isCollapsed ? "w-[72px]" : "w-[260px]"
      } flex flex-col border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl text-slate-900 dark:text-slate-100 z-50 shadow-xl dark:shadow-2xl dark:shadow-black/50 rounded-3xl font-sans transition-all duration-300 ease-in-out`}
    >
      {/* Header & Toggle Button */}
      <div className={`px-4 py-5 flex items-center ${isCollapsed ? "justify-center" : "justify-between"}`}>
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <Layers className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <div className="truncate">
              <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate">
                Scenario Forge
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium font-mono truncate">
                P-130 · OpenSCENARIO
              </p>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            title="Thu gọn Sidebar"
            aria-label="Thu gọn Sidebar"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {isCollapsed && (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={toggleSidebar}
            title="Mở rộng Sidebar"
            aria-label="Mở rộng Sidebar"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Divider */}
      <div className="mx-3 h-px bg-slate-200 dark:bg-slate-800" />

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1.5 overflow-y-auto">
        {filteredNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={`
                group flex items-center rounded-xl transition-all duration-200
                ${isCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"}
                ${
                  isActive
                    ? "bg-blue-50/80 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 shadow-sm border border-blue-200/80 dark:border-blue-800/60 font-bold border-r-2 border-r-blue-600"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-sky-50/50 dark:hover:bg-slate-800/60"
                }
              `}
            >
              <item.icon
                className={`w-5 h-5 flex-shrink-0 transition-colors ${
                  isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                }`}
              />
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs font-semibold">{item.label}</div>
                  <div
                    className={`text-[10px] truncate font-normal ${
                      isActive ? "text-blue-600/80 dark:text-blue-400/80" : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {item.description}
                  </div>
                </div>
              )}
              {!isCollapsed && isActive && (
                <ChevronRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Profile, Theme Toggle & Logout */}
      <div className={`p-3 border-t border-slate-200 dark:border-slate-800 bg-sky-50/30 dark:bg-slate-950/40 space-y-3 ${isCollapsed ? "flex flex-col items-center" : ""}`}>
        {/* Quick Theme Switch Row */}
        <div className={`flex items-center text-xs ${isCollapsed ? "justify-center" : "justify-between px-1"}`}>
          {!isCollapsed && <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Giao diện:</span>}
          <button
            type="button"
            onClick={toggleTheme}
            title={isCollapsed ? (theme === "light" ? "Chuyển Chế độ Tối" : "Chuyển Chế độ Sáng") : undefined}
            aria-label="Chuyển đổi giao diện Sáng/Tối"
            className={`${
              isCollapsed ? "p-2" : "px-3 py-1.5"
            } rounded-xl bg-white dark:bg-slate-800 border border-sky-100 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-sm hover:border-blue-500 transition cursor-pointer`}
          >
            {!mounted ? (
              <Moon className="w-4 h-4 text-blue-600" />
            ) : theme === "light" ? (
              <Moon className="w-4 h-4 text-blue-600" />
            ) : (
              <Sun className="w-4 h-4 text-amber-400" />
            )}
            {!isCollapsed && <span>{theme === "light" ? "Chế độ Tối" : "Chế độ Sáng"}</span>}
          </button>
        </div>

        {user && (
          <div className={`flex items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80 ${isCollapsed ? "flex-col justify-center" : "justify-between"}`}>
            <div className="flex items-center gap-2 overflow-hidden" title={isCollapsed ? user.name || user.username : undefined}>
              <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/60 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0">
                {(user.name || user.username || "U").charAt(0).toUpperCase()}
              </div>
              {!isCollapsed && (
                <div className="truncate text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block truncate leading-tight">
                    {user.name || user.username}
                  </span>
                  <span className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400">({role})</span>
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              title="Đăng xuất"
              aria-label="Đăng xuất khỏi tài khoản"
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
    <Suspense fallback={<aside className="fixed left-3 top-3 bottom-3 w-[260px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-3xl" />}>
      <SidebarContent />
    </Suspense>
  );
}
