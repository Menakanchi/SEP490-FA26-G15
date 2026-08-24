"use client";

import React from "react";
import Link from "next/link";
import { Navigation, UserCheck, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function LandingHeader() {
  const { isAuthenticated, user, role } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-white/90 border-b border-slate-200/80 transition-all shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Logo */}
        <Link href="/landing" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 via-cyan-600 to-indigo-600 p-0.5 shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center">
              <Navigation className="w-4 h-4 text-blue-600 group-hover:rotate-45 transition-transform duration-300" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
              Scenario Forge
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                P-130
              </span>
            </span>
            <span className="text-[10px] text-slate-500 font-medium">
              ODD → OpenSCENARIO 1.0 → CARLA
            </span>
          </div>
        </Link>

        {/* Right: SINGLE Action Link */}
        <div>
          {isAuthenticated && user ? (
            <Link
              href={role === "reviewer" || role === "admin" ? "/review" : "/"}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 flex items-center gap-2 transition"
            >
              <span>Vào Workspace ({role})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <Link
              href="/login"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 flex items-center gap-2 transition"
            >
              <UserCheck className="w-4 h-4 text-blue-100" />
              <span>Đăng nhập để trải nghiệm</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
