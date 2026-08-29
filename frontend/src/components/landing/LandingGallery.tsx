"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bike,
  CarFront,
  CloudFog,
  Layers,
  Play,
  Sun,
} from "lucide-react";
import { FadeIn } from "./FadeIn";

const cards = [
  {
    id: "sc_008",
    title: "Ô tô tông đít xe máy trên cao tốc trong sương mù",
    description: "ô tô đâm đít xe máy trên cao tốc trời sương mù, 30km",
    tags: ["Cao tốc", "Sương mù", "Ô tô", "Phanh gấp"],
    actorIcon: Bike,
    weatherIcon: CloudFog,
    weather: "Sương mù",
    tone: "from-orange-100 to-amber-50 text-orange-700",
  },
  {
    id: "sc_007",
    title: "Ô tô đâm đít xe máy trên cao tốc",
    description: "o to dam dit xe may tren cao toc",
    tags: ["Cao tốc", "Trời quang", "Ô tô", "Phanh gấp"],
    actorIcon: CarFront,
    weatherIcon: Sun,
    weather: "Trời quang",
    tone: "from-slate-200 to-blue-50 text-slate-700",
  },
  {
    id: "sc_001",
    title: "Ô tô phanh gấp trong mưa lớn trên cao tốc",
    description: "ô tô đâm đít xe máy trời mưa to",
    tags: ["Cao tốc", "Mưa lớn", "Ô tô", "Phanh gấp"],
    actorIcon: CarFront,
    weatherIcon: CloudFog,
    weather: "Mưa lớn",
    tone: "from-emerald-100 to-cyan-50 text-emerald-700",
  },
];

export function LandingGallery() {
  return (
    <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <FadeIn direction="up">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-2 text-left">
              <span className="text-xs font-bold font-mono text-blue-600 uppercase tracking-wider bg-blue-100 px-3 py-1 rounded-full border border-blue-200">
                Thư viện bằng chứng CARLA
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Kịch bản đã duyệt và chạy trên CARLA
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
                Các ví dụ dưới đây đến từ thư viện thật, có file `.xosc` và dữ
                liệu thực thi để xem lại.
              </p>
            </div>
            <Link
              href="/library"
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 rounded-xl shadow-sm flex items-center gap-1.5 shrink-0 transition"
            >
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Xem toàn bộ thư viện</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card, idx) => {
            const ActorIcon = card.actorIcon;
            const WeatherIcon = card.weatherIcon;
            return (
              <FadeIn key={card.id} direction="up" delay={150 * (idx + 1)}>
                <article className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4 hover:border-blue-400 hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 shadow-sm flex flex-col justify-between group h-full">
                  <div className="space-y-4">
                    <div
                      className={`relative h-40 rounded-2xl overflow-hidden border border-slate-200 bg-gradient-to-br ${card.tone}`}
                    >
                      <div className="absolute inset-0 opacity-30 road-grid" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-20 h-20 bg-white/80 border border-white rounded-3xl shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                          <ActorIcon className="w-10 h-10" />
                        </div>
                      </div>
                      <div className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-slate-950/75 text-white text-[10px] font-mono">
                        {card.id}
                      </div>
                      <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-white/85 text-slate-700 text-[10px] font-semibold flex items-center gap-1">
                        <WeatherIcon className="w-3 h-3" /> {card.weather}
                      </div>
                      <div className="absolute bottom-3 left-3 text-[10px] font-bold flex items-center gap-1 bg-emerald-600 text-white px-2 py-1 rounded-lg">
                        <BadgeCheck className="w-3 h-3" /> Đã duyệt
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-xs text-slate-600 leading-relaxed mt-2">
                        {card.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {card.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Link
                    href={`/library/${card.id}`}
                    className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 active:scale-95 border border-slate-200 hover:border-blue-200 text-xs font-bold text-slate-700 hover:text-blue-700 flex items-center justify-center gap-2 transition-all duration-200"
                  >
                    <Play className="w-3.5 h-3.5 text-blue-600" />
                    <span>Xem quỹ đạo và kết quả</span>
                  </Link>
                </article>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
