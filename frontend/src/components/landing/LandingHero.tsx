"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Play, CheckCircle2, ShieldCheck, Map, Zap, Layers, Cpu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { FadeIn } from "./FadeIn";

export function LandingHero() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const handleStartCooperation = () => {
    if (isAuthenticated) {
      router.push("/");
    } else {
      router.push("/login");
    }
  };

  return (
    <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28 bg-gradient-to-b from-cyan-50/70 via-blue-50/40 to-white">
      {/* Glow Ambient Filter */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[380px] bg-cyan-400/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Hero Content */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <FadeIn direction="down" delay={100}>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-blue-200 text-blue-700 text-xs font-semibold shadow-sm hover:border-blue-300 transition-colors">
                <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                <span>Chuẩn ASAM OpenSCENARIO 1.0 & ISO 21448 (SOTIF)</span>
              </div>
            </FadeIn>

            {/* Main Title */}
            <FadeIn direction="up" delay={200}>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
                Nền tảng Tự động sinh <br />
                <span className="bg-gradient-to-r from-blue-600 via-cyan-600 to-indigo-600 bg-clip-text text-transparent">
                  Kịch bản Kiểm thử Xe tự lái
                </span>
              </h1>
            </FadeIn>

            {/* Subtitle */}
            <FadeIn direction="up" delay={300}>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl font-normal">
                Chuyển đổi mô tả tự nhiên tiếng Việt → Trích xuất miền vận hành ODD → Xuất file OpenSCENARIO 1.0 cho xe điện thông minh (VinFast VF 8 / VF 9).
              </p>
            </FadeIn>

            {/* CTA Buttons */}
            <FadeIn direction="up" delay={400}>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={handleStartCooperation}
                  className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-sm rounded-xl shadow-xl shadow-blue-600/20 flex items-center gap-2 group transition-all duration-200 cursor-pointer"
                >
                  <Zap className="w-4 h-4 text-blue-100 group-hover:scale-110 transition-transform" />
                  <span>Bắt đầu trải nghiệm ngay</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>

                <Link
                  href="/library"
                  className="px-6 py-3.5 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 font-bold text-sm rounded-xl border border-slate-200 shadow-sm flex items-center gap-2 transition-all duration-200 cursor-pointer"
                >
                  <Layers className="w-4 h-4 text-slate-400" />
                  <span>Thư viện mẫu ODD</span>
                </Link>
              </div>
            </FadeIn>

            {/* Key Value Micro Features */}
            <FadeIn direction="up" delay={500}>
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-200">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> 100% Tiếng Việt
                  </span>
                  <p className="text-[11px] text-slate-500">Tự bóc tách từ lóng & từ viết tắt ODD</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-600" /> HITL Reviewer
                  </span>
                  <p className="text-[11px] text-slate-500">Kiểm duyệt con người 2 Cổng nghiêm ngặt</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Map className="w-3.5 h-3.5 text-indigo-600" /> VinFast ADAS
                  </span>
                  <p className="text-[11px] text-slate-500">Thử nghiệm VF 8, VF 9, VF e34</p>
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Right Column: Floating VinFast VF 9 ADAS Preview Card */}
          <div className="lg:col-span-5">
            <FadeIn direction="left" delay={300}>
              <div className="relative animate-float">
                <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4 shadow-xl hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 sheen-card">
                  {/* Card Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse" />
                      <span className="text-xs font-bold text-slate-800 font-mono">
                        VinFast ADAS Test Suite (ADR-010)
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
                      VF 9 Highway Cut-In
                    </span>
                  </div>

                  {/* VinFast Visual Banner Image */}
                  <div className="relative h-44 rounded-2xl overflow-hidden border border-slate-200 group">
                    <Image
                      src="/images/vinfast_vf9.png"
                      alt="VinFast VF 9 ADAS Testing"
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                      priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex items-end p-3 opacity-90 group-hover:opacity-100 transition-opacity">
                      <span className="text-xs font-bold text-white font-mono flex items-center gap-1">
                        <Cpu className="w-3.5 h-3.5 text-cyan-400 animate-pulse" /> VF 9 LIDAR & Radar ADAS Telemetry
                      </span>
                    </div>
                  </div>

                  {/* Scenario Metadata Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between">
                      <span className="text-slate-500">Mẫu xe Ego:</span>
                      <span className="font-bold text-blue-600">VinFast VF 8 / VF 9</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between">
                      <span className="text-slate-500">Thời tiết ODD:</span>
                      <span className="font-bold text-cyan-600">Mưa lớn (Heavy Rain)</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between">
                      <span className="text-slate-500">Vận tốc thử nghiệm:</span>
                      <span className="font-bold text-indigo-600">65 km/h</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between">
                      <span className="text-slate-500">Ngưỡng TTC:</span>
                      <span className="font-bold text-green-600">1.8 giây</span>
                    </div>
                  </div>

                  {/* Bottom Action Button */}
                  <button
                    onClick={handleStartCooperation}
                    className="w-full py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 active:scale-95 border border-blue-200 text-blue-700 text-xs font-bold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-blue-600 text-blue-600" />
                    <span>Bắt đầu sinh kịch bản ngay</span>
                  </button>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>
    </section>
  );
}
