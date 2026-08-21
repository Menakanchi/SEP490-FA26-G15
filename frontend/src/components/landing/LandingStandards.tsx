"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Award, FileText } from "lucide-react";
import { FadeIn } from "./FadeIn";

export function LandingStandards() {
  const tags = [
    { title: "Độ chính xác làn đường (Waypoints)", desc: "Chuẩn hóa vị trí s_offset_m và lane_offset chính xác" },
    { title: "Khoảng cách an toàn (TTC < 2.0s)", desc: "Tính toán khoảng cách va chạm tối thiểu cho xe tự lái" },
    { title: "Thử nghiệm mưa lớn / ban đêm", desc: "Giả lập điều kiện thời tiết khắc nghiệt hạ tầng Việt Nam" },
    { title: "Kiểm tra tĩnh Hình học (Geometry)", desc: "Loại bỏ lỗi quặt đuôi và trùng làn giữa các tác nhân" },
  ];

  return (
    <section id="standards" className="py-16 lg:py-20 relative bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn direction="up">
          <div className="relative bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-8 sm:p-12 rounded-3xl overflow-hidden text-white shadow-xl">
            {/* Background Ambient Glow */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Copy */}
              <div className="lg:col-span-7 space-y-5 text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/20 text-cyan-200 border border-cyan-400/30 text-xs font-bold font-mono">
                  <Award className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Top Tiêu Chuẩn An Toàn Quốc Tế</span>
                </div>

                <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-snug">
                  Tuân thủ tiêu chuẩn an toàn <br />
                  <span className="text-cyan-300">ASAM OpenSCENARIO 1.0</span> & <span className="text-blue-300">ISO 21448 (SOTIF)</span>
                </h2>

                <p className="text-sm text-slate-200 leading-relaxed max-w-xl">
                  Đảm bảo mọi kịch bản sinh ra cho các dòng xe điện thông minh VinFast VF 8 / VF 9 đều vượt qua các tiêu chuẩn an toàn công nghiệp khắt khe nhất trước khi đưa vào mô phỏng thực tế.
                </p>

                {/* Classification Tags */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {tags.map((tag) => (
                    <div
                      key={tag.title}
                      className="p-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 space-y-1 hover:bg-white/15 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-white">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                        <span>{tag.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 pl-5.5">{tag.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Action Link */}
                <div className="pt-3">
                  <Link
                    href="/library"
                    className="px-5 py-3 bg-cyan-400 hover:bg-cyan-300 active:scale-95 text-slate-950 font-bold text-xs rounded-xl shadow-lg inline-flex items-center gap-2 transition-all duration-200 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Xem tài liệu quy chuẩn</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {/* Right Metric Stat Box */}
              <div className="lg:col-span-5">
                <div className="p-6 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 space-y-4">
                  <h3 className="text-xs font-bold text-cyan-200 uppercase tracking-wider font-mono">
                    Chỉ số an toàn kiểm thử (System Health)
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 hover:border-cyan-400/40 transition-colors">
                      <span className="text-2xl font-black text-cyan-300 font-mono">100%</span>
                      <span className="text-[11px] text-slate-300 block mt-1">Chuẩn ASAM XML</span>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 hover:border-blue-400/40 transition-colors">
                      <span className="text-2xl font-black text-blue-300 font-mono">250+</span>
                      <span className="text-[11px] text-slate-300 block mt-1">Tests Suite Passing</span>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 hover:border-indigo-400/40 transition-colors">
                      <span className="text-2xl font-black text-indigo-300 font-mono">2 Cổng</span>
                      <span className="text-[11px] text-slate-300 block mt-1">HITL Review Gate</span>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 hover:border-green-400/40 transition-colors">
                      <span className="text-2xl font-black text-green-300 font-mono">0.1s</span>
                      <span className="text-[11px] text-slate-300 block mt-1">Static Geometry Check</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
