"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import SVG2DRenderer from "@/components/SVG2DRenderer";
import type { ActorSpec, ODDCell } from "@/types";
import { Play, Layers, ArrowRight } from "lucide-react";
import { FadeIn } from "./FadeIn";

export function LandingGallery() {
  const cards: {
    id: string;
    title: string;
    description: string;
    imageSrc: string;
    odd: ODDCell;
    actors: ActorSpec[];
  }[] = [
    {
      id: "sc_vinfast_vf9",
      title: "VinFast VF 9 - Thử nghiệm Cao tốc & Cut-In khi trời mưa",
      description: "Xe khách tạt đầu ô tô điện VinFast VF 9 trên cao tốc 3 làn đường trong điều kiện thời tiết mưa lớn tầm nhìn giảm.",
      imageSrc: "/images/vinfast_vf9.png",
      odd: { road_type: "highway", weather: "heavy_rain", actor_type: "truck", maneuver: "cut_in" },
      actors: [
        { name: "Ego_VinFast_VF9", category: "car", is_ego: true, position: { lane_offset: 2, s_offset_m: 10 }, initial_speed_kmh: 85 },
        { name: "Adversary_Truck", category: "truck", is_ego: false, position: { lane_offset: 1, s_offset_m: 40 }, initial_speed_kmh: 95 },
      ],
    },
    {
      id: "sc_vinfast_vf8",
      title: "VinFast VF 8 - Giao cắt đô thị & Điểm mù người đi bộ",
      description: "Hệ thống phanh tự động khẩn cấp AEB trên VinFast VF 8 phát hiện người đi bộ cắt ngang ngã tư khi sương mù dày đặc.",
      imageSrc: "/images/vinfast_vf8.png",
      odd: { road_type: "intersection", weather: "fog", actor_type: "pedestrian", maneuver: "jaywalk" },
      actors: [
        { name: "Ego_VinFast_VF8", category: "car", is_ego: true, position: { lane_offset: 1, s_offset_m: 5 }, initial_speed_kmh: 45 },
        { name: "Pedestrian_Cross", category: "pedestrian", is_ego: false, position: { lane_offset: 1, s_offset_m: 25 }, initial_speed_kmh: 5 },
      ],
    },
    {
      id: "sc_vinfast_vfe34",
      title: "VinFast VF 5 / VF e34 - Phanh khẩn cấp tránh xe máy tạt đầu",
      description: "Xe máy di chuyển phía trước phanh đột ngột và chuyển làn bất ngờ trong điều kiện hạ tầng đường đô thị hẹp.",
      imageSrc: "/images/vinfast_vfe34.png",
      odd: { road_type: "urban_straight", weather: "clear", actor_type: "motorcycle", maneuver: "sudden_brake" },
      actors: [
        { name: "Ego_VinFast_e34", category: "car", is_ego: true, position: { lane_offset: 1, s_offset_m: 5 }, initial_speed_kmh: 50 },
        { name: "Front_Motorcycle", category: "motorcycle", is_ego: false, position: { lane_offset: 1, s_offset_m: 22 }, initial_speed_kmh: 20 },
      ],
    },
  ];

  return (
    <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <FadeIn direction="up">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-2 text-left">
              <span className="text-xs font-bold font-mono text-blue-600 uppercase tracking-wider bg-blue-100 px-3 py-1 rounded-full border border-blue-200">
                Gallery & VinFast Test Catalog
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Thư viện Kịch bản & Tác nhân Thực tế
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                Tổng hợp kịch bản kiểm thử chuẩn OpenSCENARIO cho các dòng xe điện thông minh VinFast VF 9, VF 8, VF 5 / VF e34.
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

        {/* 3 Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card, idx) => (
            <FadeIn key={card.id} direction="up" delay={150 * (idx + 1)}>
              <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4 hover:border-blue-400 hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 shadow-sm flex flex-col justify-between group sheen-card">
                <div className="space-y-3">
                  {/* Vehicle Visual Header Image */}
                  <div className="relative h-44 rounded-2xl overflow-hidden border border-slate-200">
                    <Image
                      src={card.imageSrc}
                      alt={card.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    />
                  </div>

                  {/* 2D Canvas Preview */}
                  <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-950">
                    <SVG2DRenderer actors={card.actors} odd={card.odd} height={140} />
                  </div>

                  {/* Info */}
                  <h3 className="text-sm font-bold text-slate-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{card.description}</p>
                </div>

                {/* Action Button */}
                <Link
                  href="/login"
                  className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 active:scale-95 border border-slate-200 hover:border-blue-200 text-xs font-bold text-slate-700 hover:text-blue-700 flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-blue-600" />
                  <span>Xem chi tiết kịch bản</span>
                </Link>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
