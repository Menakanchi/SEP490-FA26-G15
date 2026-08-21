"use client";

import React from "react";
import { Code2, ShieldCheck, Microchip, Building2, Navigation, Radio } from "lucide-react";
import { FadeIn } from "./FadeIn";

export function LandingAudience() {
  const audiences = [
    {
      role: "Kỹ sư phát triển ADAS/AV",
      desc: "Thử nghiệm corner-case và các tình huống khẩn cấp cho xe điện thông minh (VinFast VF 8 / VF 9 / VF e34).",
      icon: Code2,
      badge: "AV Software Team",
    },
    {
      role: "Đội ngũ QA & Test Automation",
      desc: "Xuất bộ test case OpenSCENARIO 1.0 chạy trực tiếp trên các bộ giả lập công nghiệp CARLA / SVL Simulator.",
      icon: ShieldCheck,
      badge: "QA & Verification",
    },
    {
      role: "Chuyên gia Thẩm định (Reviewers)",
      desc: "Rà soát tham số vật lý, duyệt kịch bản đạt chuẩn an toàn trước khi lưu trữ vào kho dữ liệu chính thức.",
      icon: Building2,
      badge: "HITL Audit Team",
    },
    {
      role: "Nhà nghiên cứu An toàn Giao thông",
      desc: "Mô phỏng các tình huống xe máy tạt đầu, ngã tư khuất tầm nhìn trong điều kiện giao thông phức tạp tại Việt Nam.",
      icon: Microchip,
      badge: "R&D Research",
    },
  ];

  return (
    <section id="audience" className="py-16 lg:py-24 relative overflow-hidden bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Header */}
        <FadeIn direction="up">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold font-mono tracking-wider text-blue-600 uppercase bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              Target Audience & Ecosystem
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Hệ thống Scenario Forge dành cho ai?
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Giải pháp chuyên biệt đáp ứng toàn diện nhu cầu từ nghiên cứu phát triển thuật toán xe tự lái đến kiểm định chất lượng phần mềm công nghiệp.
            </p>
          </div>
        </FadeIn>

        {/* 4 Cards around Center Icon Graphic */}
        <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 items-center">
          {/* Left Column / Card 1 & 2 */}
          <div className="lg:col-span-5 space-y-6">
            <FadeIn direction="right" delay={100}>
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-blue-400 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <Code2 className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {audiences[0].badge}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900">{audiences[0].role}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{audiences[0].desc}</p>
              </div>
            </FadeIn>

            <FadeIn direction="right" delay={200}>
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-cyan-400 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200">
                    {audiences[1].badge}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900">{audiences[1].role}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{audiences[1].desc}</p>
              </div>
            </FadeIn>
          </div>

          {/* Center Column: Radar Scanner Graphic */}
          <div className="lg:col-span-2 flex flex-col items-center justify-center py-6 lg:py-0">
            <FadeIn direction="none" delay={200}>
              <div className="relative w-36 h-36 rounded-full bg-slate-50 border border-blue-200 flex items-center justify-center shadow-md group">
                <div className="absolute inset-0 rounded-full border border-blue-400/30 animate-radar-pulse" />
                <div className="absolute inset-2 rounded-full border border-blue-300/40" />
                <div className="absolute inset-6 rounded-full border border-indigo-400/40" />

                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg text-white group-hover:rotate-12 transition-transform duration-300">
                  <Navigation className="w-8 h-8 fill-white stroke-white" />
                </div>
              </div>
            </FadeIn>
            <span className="text-[10px] font-mono font-bold text-blue-600 mt-3 tracking-widest uppercase flex items-center gap-1">
              <Radio className="w-3 h-3 animate-pulse text-blue-600" /> LIDAR & ADAS Scan
            </span>
          </div>

          {/* Right Column / Card 3 & 4 */}
          <div className="lg:col-span-5 space-y-6">
            <FadeIn direction="left" delay={300}>
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-purple-400 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                    {audiences[2].badge}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900">{audiences[2].role}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{audiences[2].desc}</p>
              </div>
            </FadeIn>

            <FadeIn direction="left" delay={400}>
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3 hover:border-indigo-400 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <Microchip className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {audiences[3].badge}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900">{audiences[3].role}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{audiences[3].desc}</p>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>
    </section>
  );
}
