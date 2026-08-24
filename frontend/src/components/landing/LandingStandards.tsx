"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, FileText } from "lucide-react";
import { FadeIn } from "./FadeIn";

const checks = [
  {
    title: "Schema có kiểu dữ liệu",
    desc: "Pydantic chặn actor, maneuver và trigger sai contract",
  },
  {
    title: "Kiểm tra hình học tĩnh",
    desc: "Bắt lỗi spawn, làn, hướng và thời điểm trigger trước CARLA",
  },
  {
    title: "OpenSCENARIO 1.0",
    desc: "Converter deterministic tạo XML `.xosc` trong phạm vi hỗ trợ",
  },
  {
    title: "Bằng chứng CARLA",
    desc: "Thu quỹ đạo, TTC, khe hở nhỏ nhất và sự kiện va chạm",
  },
];

export function LandingStandards() {
  return (
    <section
      id="standards"
      className="py-16 lg:py-20 relative bg-white overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn direction="up">
          <div className="relative bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-8 sm:p-12 rounded-3xl overflow-hidden text-white shadow-xl">
            <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5 text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/20 text-cyan-200 border border-cyan-400/30 text-xs font-bold font-mono">
                  <BarChart3 className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Kết quả đánh giá · 24/08/2026</span>
                </div>

                <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-snug">
                  Kiểm tra nhiều tầng từ bản nháp <br />
                  <span className="text-cyan-300">đến thực thi CARLA</span>
                </h2>

                <p className="text-sm text-slate-200 leading-relaxed max-w-xl">
                  Scenario Forge công bố kết quả theo từng mức thay vì gộp thành
                  một tuyên bố “an toàn”. Các số dưới đây là snapshot đo được
                  của phạm vi MVP, không phải chứng nhận sản phẩm.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {checks.map((check) => (
                    <div
                      key={check.title}
                      className="p-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 space-y-1"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-white">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                        <span>{check.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 pl-5.5">
                        {check.desc}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-3">
                  <Link
                    href="/metrics"
                    className="px-5 py-3 bg-cyan-400 hover:bg-cyan-300 active:scale-95 text-slate-950 font-bold text-xs rounded-xl shadow-lg inline-flex items-center gap-2 transition-all duration-200"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Xem báo cáo chất lượng</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="p-6 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 space-y-4">
                  <h3 className="text-xs font-bold text-cyan-200 uppercase tracking-wider font-mono">
                    Bằng chứng hiện có
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <Evidence
                      value="31/31"
                      label="Biên dịch `.xosc` trong scope"
                      tone="cyan"
                    />
                    <Evidence
                      value="30/32"
                      label="ScenarioRunner hoàn tất"
                      tone="blue"
                    />
                    <Evidence
                      value="2 cổng"
                      label="Cổng người duyệt"
                      tone="indigo"
                    />
                    <Evidence
                      value="483"
                      label="Kiểm thử tự động"
                      tone="green"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Mẫu số và giới hạn được công khai trong báo cáo đánh giá;
                    kịch bản thất bại không bị loại khỏi báo cáo.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function Evidence({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: "cyan" | "blue" | "indigo" | "green";
}) {
  const colors = {
    cyan: "text-cyan-300 hover:border-cyan-400/40",
    blue: "text-blue-300 hover:border-blue-400/40",
    indigo: "text-indigo-300 hover:border-indigo-400/40",
    green: "text-green-300 hover:border-green-400/40",
  };
  return (
    <div
      className={`p-4 rounded-xl bg-slate-900/60 border border-white/10 transition-colors ${colors[tone]}`}
    >
      <span className="text-2xl font-black font-mono">{value}</span>
      <span className="text-[11px] text-slate-300 block mt-1 leading-snug">
        {label}
      </span>
    </div>
  );
}
