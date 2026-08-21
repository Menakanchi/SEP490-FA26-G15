"use client";

import React from "react";
import Link from "next/link";
import { Navigation, Shield } from "lucide-react";

export function LandingFooter() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-12 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-slate-800">
          {/* Logo Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 p-0.5 shadow-md">
              <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center">
                <Navigation className="w-3.5 h-3.5 text-blue-400" />
              </div>
            </div>
            <div>
              <span className="text-sm font-extrabold text-slate-100 tracking-tight block">
                AV-Scenario Gen (P-130)
              </span>
              <span className="text-[10px] text-slate-500">
                Nền tảng Tự động sinh Kịch bản Kiểm thử Xe tự lái
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex flex-wrap items-center gap-6 font-medium text-slate-300">
            <Link href="/" className="hover:text-blue-400 transition">
              Creator Flow
            </Link>
            <Link href="/library" className="hover:text-blue-400 transition">
              Thư viện kịch bản
            </Link>
            <Link href="/review" className="hover:text-blue-400 transition">
              Cổng Duyệt HITL
            </Link>
            <a href="#standards" className="hover:text-blue-400 transition">
              Chuẩn ASAM OpenSCENARIO
            </a>
          </div>
        </div>

        {/* Bottom Credits & Copyright */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <p>© 2026 Scenario Forge — VINAI_PRJ (P-130). Đã bảo lưu mọi quyền.</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-slate-400">
              <Shield className="w-3.5 h-3.5 text-blue-400" /> Chuẩn mã hóa ASAM OpenSCENARIO 1.0
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
