"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Layers,
  Play,
  Route,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { FadeIn } from "./FadeIn";

export function LandingHero() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const handleStart = () => {
    router.push(isAuthenticated ? "/" : "/login");
  };

  return (
    <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28 bg-gradient-to-b from-cyan-50/70 via-blue-50/40 to-white">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[380px] bg-cyan-400/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6 text-left">
            <FadeIn direction="down" delay={100}>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-blue-200 text-blue-700 text-xs font-semibold shadow-sm">
                <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                <span>OpenSCENARIO 1.0 · CARLA 0.9.15</span>
              </div>
            </FadeIn>

            <FadeIn direction="up" delay={200}>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
                Từ điều kiện vận hành đến <br />
                <span className="bg-gradient-to-r from-blue-600 via-cyan-600 to-indigo-600 bg-clip-text text-transparent">
                  Kịch bản Kiểm thử ADAS
                </span>
              </h1>
            </FadeIn>

            <FadeIn direction="up" delay={300}>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl font-normal">
                Mô tả tình huống bằng tiếng Việt hoặc chọn miền điều kiện vận
                hành (ODD), sau đó sinh, kiểm tra và duyệt kịch bản OpenSCENARIO
                trước khi chạy trên CARLA.
              </p>
            </FadeIn>

            <FadeIn direction="up" delay={400}>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={handleStart}
                  className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-sm rounded-xl shadow-xl shadow-blue-600/20 flex items-center gap-2 group transition-all duration-200 cursor-pointer"
                >
                  <Zap className="w-4 h-4 text-blue-100 group-hover:scale-110 transition-transform" />
                  <span>Mở Generator</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>

                <Link
                  href="/library"
                  className="px-6 py-3.5 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 font-bold text-sm rounded-xl border border-slate-200 shadow-sm flex items-center gap-2 transition-all duration-200"
                >
                  <Layers className="w-4 h-4 text-slate-400" />
                  <span>Xem thư viện đã duyệt</span>
                </Link>
              </div>
            </FadeIn>

            <FadeIn direction="up" delay={500}>
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-200">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> Tiếng
                    Việt
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Chuẩn hóa mô tả thành 4 trục ODD
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-600" /> 2 cổng
                    người duyệt
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Duyệt trước thư viện và mô phỏng
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Route className="w-3.5 h-3.5 text-indigo-600" /> CARLA vòng
                    kín
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Quỹ đạo, TTC và va chạm
                  </p>
                </div>
              </div>
            </FadeIn>
          </div>

          <div className="lg:col-span-5">
            <FadeIn direction="left" delay={300}>
              <div className="relative animate-float">
                <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4 shadow-xl hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 sheen-card">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-bold text-slate-800 font-mono">
                        Minh họa bài toán ADAS
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
                      Cao tốc · Trời mưa
                    </span>
                  </div>

                  <div className="relative h-56 rounded-2xl overflow-hidden border border-slate-200 group/image">
                    <Image
                      src="/images/vinfast_vf9.png"
                      alt="Ảnh minh họa xe VinFast trên cao tốc trong điều kiện trời mưa"
                      fill
                      priority
                      className="object-cover group-hover/image:scale-105 transition-transform duration-500 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                    <span className="absolute left-3 bottom-3 text-[11px] font-semibold text-white bg-slate-950/45 border border-white/20 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
                      Ảnh minh họa bối cảnh kiểm thử ADAS
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <Metric label="Bộ điều khiển" value="BehaviorAgent" />
                    <Metric label="Mô phỏng" value="CARLA 0.9.15" />
                    <Metric label="Đầu ra" value=".xosc + JSON" />
                    <Metric label="Bằng chứng" value="Quỹ đạo + TTC" />
                  </div>

                  <button
                    onClick={handleStart}
                    className="w-full py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 active:scale-95 border border-blue-200 text-blue-700 text-xs font-bold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-blue-600 text-blue-600" />
                    <span>Thử sinh một kịch bản</span>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}:</span>
      <span className="font-bold text-blue-700 text-right flex items-center gap-1">
        {label === "Bằng chứng" && <Activity className="w-3 h-3" />}
        {value}
      </span>
    </div>
  );
}
