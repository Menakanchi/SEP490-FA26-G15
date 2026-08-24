"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Layers, PlayCircle, ShieldCheck } from "lucide-react";
import { FadeIn } from "./FadeIn";

export function LandingContactForm() {
  return (
    <section className="py-16 lg:py-20 relative bg-white border-t border-slate-200 overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn direction="up">
          <div className="bg-gradient-to-br from-white to-blue-50 p-8 sm:p-10 rounded-3xl border border-blue-200 shadow-xl space-y-7 text-center">
            <div className="space-y-3">
              <span className="text-xs font-bold font-mono text-blue-600 uppercase tracking-wider bg-white px-3 py-1 rounded-full border border-blue-200">
                Demo P-130
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Sẵn sàng thử luồng sinh kịch bản?
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl mx-auto leading-relaxed">
                Bắt đầu bằng Generator để tạo và review một file `.xosc` mà
                không cần GPU. Khi cần bằng chứng mô phỏng, gửi kịch bản đã
                duyệt tới worker CARLA.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              <Step
                number="1"
                title="Sinh"
                desc="Mô tả tiếng Việt hoặc ma trận ODD"
              />
              <Step
                number="2"
                title="Duyệt"
                desc="Kiểm tra preview, schema và hình học"
              />
              <Step
                number="3"
                title="Chạy"
                desc="CARLA + BehaviorAgent khi có worker"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/login"
                className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all"
              >
                <PlayCircle className="w-4 h-4" />
                <span>Đăng nhập và mở Generator</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/library"
                className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 flex items-center justify-center gap-2 transition-all"
              >
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Xem thư viện công khai</span>
              </Link>
            </div>

            <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Kịch bản chỉ vào thư viện hoặc chạy GPU sau quyết định của người
              duyệt.
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function Step({
  number,
  title,
  desc,
}: {
  number: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
          {number}
        </span>
        <span className="text-sm font-bold text-slate-900">{title}</span>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}
