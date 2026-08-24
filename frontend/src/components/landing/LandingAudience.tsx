"use client";

import React from "react";
import { BarChart3, Building2, Code2, Route, TestTube2 } from "lucide-react";
import { FadeIn } from "./FadeIn";

const audiences = [
  {
    role: "Kỹ sư phát triển ADAS/AV",
    desc: "Tạo và tái hiện các tình huống cut-in, phanh gấp, lấn làn, đi ngược chiều và vượt đèn đỏ trên CARLA.",
    icon: Code2,
    badge: "Thiết kế kịch bản",
  },
  {
    role: "Đội ngũ QA & Test Automation",
    desc: "Xuất file OpenSCENARIO 1.0 và quản lý các ca đã duyệt thành một thư viện regression có thể chạy lại.",
    icon: TestTube2,
    badge: "Kiểm thử hồi quy",
  },
  {
    role: "Chuyên gia thẩm định",
    desc: "Đọc mô tả, preview và thông số động học trước khi quyết định đưa kịch bản vào thư viện hoặc chạy mô phỏng.",
    icon: Building2,
    badge: "Người thẩm định",
  },
  {
    role: "Nhóm nghiên cứu an toàn",
    desc: "Theo dõi độ phủ ODD, quỹ đạo, TTC, khoảng cách nhỏ nhất và so sánh phản ứng của các controller.",
    icon: BarChart3,
    badge: "Đánh giá",
  },
];

export function LandingAudience() {
  return (
    <section
      id="audience"
      className="py-16 lg:py-24 relative overflow-hidden bg-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <FadeIn direction="up">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold font-mono tracking-wider text-blue-600 uppercase bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              Người dùng mục tiêu
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Ai sử dụng Scenario Forge?
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              MVP tập trung vào vòng đời của kịch bản kiểm thử: tạo, thẩm định,
              thực thi và đọc bằng chứng.
            </p>
          </div>
        </FadeIn>

        <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-5 space-y-6">
            <AudienceCard
              audience={audiences[0]}
              direction="right"
              delay={100}
              tone="blue"
            />
            <AudienceCard
              audience={audiences[1]}
              direction="right"
              delay={200}
              tone="cyan"
            />
          </div>

          <div className="lg:col-span-2 flex flex-col items-center justify-center py-6 lg:py-0">
            <FadeIn direction="none" delay={200}>
              <div className="relative w-36 h-36 rounded-full bg-slate-50 border border-blue-200 flex items-center justify-center shadow-md group">
                <div className="absolute inset-0 rounded-full border border-blue-400/30 animate-radar-pulse" />
                <div className="absolute inset-2 rounded-full border border-blue-300/40" />
                <div className="absolute inset-6 rounded-full border border-indigo-400/40" />
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg text-white group-hover:rotate-12 transition-transform duration-300">
                  <Route className="w-8 h-8" />
                </div>
              </div>
            </FadeIn>
            <span className="text-[10px] font-mono font-bold text-blue-600 mt-3 tracking-widest uppercase flex items-center gap-1 text-center">
              ODD → XOSC → CARLA
            </span>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <AudienceCard
              audience={audiences[2]}
              direction="left"
              delay={300}
              tone="purple"
            />
            <AudienceCard
              audience={audiences[3]}
              direction="left"
              delay={400}
              tone="indigo"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

type Audience = (typeof audiences)[number];

function AudienceCard({
  audience,
  direction,
  delay,
  tone,
}: {
  audience: Audience;
  direction: "left" | "right";
  delay: number;
  tone: "blue" | "cyan" | "purple" | "indigo";
}) {
  const Icon = audience.icon;
  const tones = {
    blue: "bg-blue-50 text-blue-600 border-blue-200",
    cyan: "bg-cyan-50 text-cyan-600 border-cyan-200",
    purple: "bg-purple-50 text-purple-600 border-purple-200",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-200",
  };
  return (
    <FadeIn direction={direction} delay={delay}>
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-blue-400 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
        <div className="flex items-center justify-between">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${tones[tone]}`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <span
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${tones[tone]}`}
          >
            {audience.badge}
          </span>
        </div>
        <h3 className="text-base font-bold text-slate-900">{audience.role}</h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          {audience.desc}
        </p>
      </div>
    </FadeIn>
  );
}
