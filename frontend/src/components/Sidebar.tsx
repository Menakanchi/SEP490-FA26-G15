"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useBackground } from "@/context/BackgroundContext";
import {
  BarChart3,
  Zap,
  ClipboardCheck,
  Library,
  Layers,
  ChevronRight,
  ChevronLeft,
  Compass,
  LogOut,
  Sun,
  Moon,
  Shield,
  CheckCircle2,
  Sparkles,
  Settings,
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
    href: "/admin",
    label: "Quản trị hệ thống",
    description: "Thống kê & Quản lý User",
    icon: Shield,
    allowedRoles: ["admin"],
  },
  {
    href: "/landing",
    label: "Giới thiệu Platform",
    description: "Tổng quan & ODD Platform",
    icon: Compass,
    allowedRoles: ["creator", "reviewer"],
  },
  {
    href: "/",
    label: "Generator",
    description: "Sinh kịch bản mới",
    icon: Zap,
    allowedRoles: ["creator", "reviewer"],
  },
  {
    href: "/campaign",
    label: "Chiến dịch ODD",
    description: "Agent sinh lô phủ ma trận",
    icon: Layers,
    allowedRoles: ["creator", "reviewer"],
  },
  {
    href: "/review",
    label: "HITL Review",
    description: "Duyệt kịch bản 2 cổng",
    icon: ClipboardCheck,
    allowedRoles: ["reviewer"],
  },
  {
    href: "/library",
    label: "Thư viện",
    description: "Kịch bản ODD & Cá nhân",
    icon: Library,
    allowedRoles: ["creator", "reviewer", "admin"],
  },
  {
    href: "/label",
    label: "Chấm ý định",
    description: "Người chấm tay để đo lại L4",
    icon: CheckCircle2,
    allowedRoles: ["creator", "reviewer"],
  },
  {
    href: "/metrics",
    label: "Báo cáo chất lượng",
    description: "M1 hợp lệ · M2 phủ ODD · M3 nguy hiểm",
    icon: BarChart3,
    allowedRoles: ["admin"],
  },
];

interface SidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
}

function SidebarContent({ isCollapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { openModal } = useBackground();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- avoid hydration mismatch on theme button
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  // RBAC Menu Filtering by User Role:
  // Role 'admin': ONLY display /admin, /library, /metrics (3 items)
  // Role 'creator': display /landing, /, /campaign, /library, /label (hide /review, /metrics, /admin)
  // Role 'reviewer': display /landing, /, /campaign, /review, /library, /label (hide /metrics, /admin)
  const filteredNavItems = useMemo(() => {
    const currentRole: Role = role || user?.role || "creator";
    return NAV_ITEMS.filter((item) =>
      item.allowedRoles ? item.allowedRoles.includes(currentRole) : true
    );
  }, [role, user?.role]);

  return (
    <aside
      className={`fixed left-3 top-3 bottom-3 flex flex-col rounded-[32px] border border-white/40 dark:border-slate-800/60 bg-white/75 dark:bg-slate-900/85 text-slate-900 dark:text-slate-100 z-50 backdrop-blur-xl shadow-2xl font-sans transition-all duration-300 overflow-hidden ${
        isCollapsed ? "w-[70px]" : "w-[250px]"
      }`}
    >
      {/* Header & Logo Section */}
      <div
        className={
          isCollapsed
            ? "px-2 py-4 flex flex-col items-center justify-center gap-3"
            : "px-4 py-4.5 flex items-center justify-between gap-2"
        }
      >
        <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <Layers className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 truncate">
              <h1 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight truncate">
                Scenario Forge
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold font-mono truncate">
                P-130 · OpenSCENARIO
              </p>
            </div>
          )}
        </div>

        {/* Toggle Collapse Button */}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="w-7 h-7 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer shrink-0 shadow-xs"
            title={isCollapsed ? "Mở rộng Sidebar" : "Thu gọn Sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-slate-200/60 dark:bg-slate-800/60" />

      {/* Navigation Links */}
      <nav className="flex-1 px-2.5 py-4 space-y-1.5 overflow-y-auto overflow-x-hidden">
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
                group flex items-center rounded-xl text-sm font-semibold transition-all duration-200
                ${isCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"}
                ${
                  isActive
                    ? "bg-blue-50/90 dark:bg-blue-950/70 text-blue-600 dark:text-blue-300 shadow-sm border border-blue-200/80 dark:border-blue-800/60 font-bold border-r-2 border-r-blue-600"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-sky-50/50 dark:hover:bg-slate-800/60"
                }
              `}
            >
              <item.icon
                className={`w-5 h-5 flex-shrink-0 transition-colors ${
                  isActive
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                }`}
              />
              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{item.label}</div>
                    <div
                      className={`text-[10px] truncate font-normal ${
                        isActive
                          ? "text-blue-600/80 dark:text-blue-400/80"
                          : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                  {isActive && (
                    <ChevronRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Profile, Theme Toggle, Background Settings & Logout */}
      <div className="p-3 border-t border-slate-200/60 dark:border-slate-800/60 bg-white/40 dark:bg-slate-950/40 space-y-2.5">
        {/* Background & Theme Switchers */}
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={openModal}
              className="w-9 h-9 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-blue-600 dark:text-cyan-400 flex items-center justify-center shadow-xs hover:bg-blue-600 hover:text-white dark:hover:bg-cyan-500 dark:hover:text-slate-950 transition cursor-pointer"
              title="Cài đặt Hình nền System"
            >
              <Sparkles className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 flex items-center justify-center shadow-xs hover:border-blue-500 transition cursor-pointer"
              title={`Giao diện: ${theme === "light" ? "Tối" : "Sáng"}`}
            >
              {!mounted || theme === "light" ? (
                <Moon className="w-4 h-4 text-blue-600" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" />
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={openModal}
              className="w-full px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-slate-800 dark:text-slate-200 font-extrabold text-[11px] flex items-center justify-between shadow-xs hover:bg-blue-600 hover:text-white dark:hover:bg-cyan-500 dark:hover:text-slate-950 transition cursor-pointer group"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 group-hover:text-current" />
                <span>Hình nền System</span>
              </span>
              <span className="text-[9px] font-mono opacity-70">Custom</span>
            </button>

            <div className="flex items-center justify-between px-1 text-xs">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Giao diện:</span>
              <button
                type="button"
                onClick={toggleTheme}
                className="px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-slate-800 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1.5 shadow-xs hover:border-blue-500 transition cursor-pointer"
              >
                {!mounted || theme === "light" ? (
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
          </div>
        )}

        {/* User Info, Profile Link & Logout */}
        {user && (
          <div className={`pt-2 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center ${isCollapsed ? "flex-col gap-2 justify-center" : "justify-between gap-2"}`}>
            <Link
              href="/profile"
              className="flex items-center gap-2 overflow-hidden hover:opacity-80 transition cursor-pointer group text-left min-w-0"
              title="Quản lý tài khoản (/profile)"
            >
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt={user.full_name || user.name || user.username}
                  className="w-8 h-8 rounded-full object-cover border border-blue-400 dark:border-cyan-400 shrink-0 shadow-xs"
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 border border-blue-300 dark:border-cyan-400 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs"
                >
                  {(user.full_name || user.name || user.username || "U").charAt(0).toUpperCase()}
                </div>
              )}
              {!isCollapsed && (
                <div className="truncate text-xs min-w-0">
                  <span className="font-extrabold text-slate-800 dark:text-slate-100 block truncate leading-tight group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition">
                    {user.full_name || user.name || user.username}
                  </span>
                  <span className="text-[9px] uppercase font-bold text-blue-600 dark:text-cyan-400">({role})</span>
                </div>
              )}
            </Link>
            <div className="flex items-center gap-0.5 shrink-0">
              <Link
                href="/profile"
                title="Quản lý tài khoản"
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer flex items-center justify-center"
              >
                <Settings className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                title="Đăng xuất"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  return (
    <Suspense
      fallback={
        <aside
          className={`fixed left-0 top-0 bottom-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${
            isCollapsed ? "w-[72px]" : "w-[260px]"
          }`}
        />
      }
    >
      <SidebarContent isCollapsed={isCollapsed} onToggle={onToggle} />
    </Suspense>
  );
}
