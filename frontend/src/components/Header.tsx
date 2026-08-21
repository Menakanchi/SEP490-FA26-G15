"use client";

import React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import {
  Zap,
  ClipboardCheck,
  Library,
  Search,
  Bell,
  LogOut,
  UserCheck,
  RefreshCw,
  Sun,
  Moon,
} from "lucide-react";

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const navItems = [
    { href: "/", label: "Generator", icon: Zap },
    { href: "/review", label: "HITL Review", icon: ClipboardCheck },
    { href: "/library", label: "Thư viện", icon: Library },
  ];

  const visibleNavItems = navItems.filter((item) => {
    if (item.href === "/review") {
      return role === "reviewer" || role === "admin";
    }
    return true;
  });

  return (
    <header className="w-full mb-4 shrink-0">
      <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl md:rounded-full px-4 py-2.5 shadow-sm flex items-center justify-between gap-2 text-slate-900 dark:text-slate-100 transition-colors">
        {/* Left: App Brand & Welcome */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-blue-500/20">
            SF
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">
              Scenario Forge
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {user ? `Xin chào, ${user.name || user.username || "User"}` : "OpenSCENARIO AI Generator"}
            </p>
          </div>
        </div>

        {/* Center: Navigation Pills */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-full border border-slate-200 dark:border-slate-700/60">
          {visibleNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right: User Profile & Theme Toggle */}
        <div className="flex items-center gap-2.5 shrink-0 pr-1">
          <div className="relative hidden xl:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm kịch bản..."
              className="w-40 pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
          </div>

          {/* Theme Switcher Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-amber-400 transition shrink-0 cursor-pointer"
            title={`Chuyển sang chế độ ${theme === "light" ? "Tối (Dark)" : "Sáng (Light)"}`}
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          <button
            type="button"
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition shrink-0"
            title="Thông báo"
          >
            <Bell className="w-4 h-4" />
          </button>

          {/* User Badge */}
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2.5 pl-2.5 border-l border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/60 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                  {(user.name || user.username || "U").charAt(0).toUpperCase()}
                </div>
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-none">
                    {user.name || user.username}
                  </div>
                  <span
                    className={`inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 mt-0.5 rounded-full border ${
                      role === "admin"
                        ? "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                        : role === "reviewer"
                        ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                        : role === "creator"
                        ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {role}
                  </span>
                </div>
              </div>

              {/* Quick Switch Role Link */}
              <Link
                href="/login"
                title="Đổi vai trò Demo / Đăng nhập"
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0 flex items-center gap-1 text-[11px] font-semibold"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Đổi vai trò</span>
              </Link>

              <button
                onClick={handleLogout}
                title="Đăng xuất"
                className="w-8 h-8 rounded-full hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center transition shrink-0 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-full shadow-sm flex items-center gap-1.5 transition"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Đăng Nhập</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
