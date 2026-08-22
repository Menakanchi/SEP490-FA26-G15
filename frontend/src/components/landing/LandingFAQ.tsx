"use client";

import React, { useState } from "react";
import { HelpCircle, ChevronDown, ShieldCheck } from "lucide-react";
import { FadeIn } from "./FadeIn";

export function LandingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: "Hệ thống hỗ trợ những định dạng xuất file nào?",
      a: "Scenario Forge xuất ra mã nguồn chuẩn quốc tế ASAM OpenSCENARIO 1.0 XML (.xosc), dữ liệu cấu hình JSON Spec, và sơ đồ làn đường 2D SVG layout tương thích với các phần mềm mô phỏng xe tự lái hàng đầu (CARLA, SVL, LGSVL).",
    },
    {
      q: "Độ chính xác của việc trích xuất ODD từ tiếng Việt là bao nhiêu?",
      a: "Hệ thống kết hợp bộ quy tắc Rule-based tra cứu nhanh từ điển (xử lý từ lóng, viết tắt như 'o to', 'xe may', 'tat dau') kết hợp mô hình ngôn ngữ lớn (LLM) dự phòng, đạt độ chính xác cao trên cả 4 trục ODD (Road Type, Weather, Actor Type, Maneuver).",
    },
    {
      q: "Tôi có thể can thiệp chỉnh sửa kịch bản trước khi xuất file không?",
      a: "Có. Hệ thống tích hợp quy trình HITL Reviewer (Human-In-The-Loop) với 2 Cổng kiểm duyệt nghiêm ngặt: Cổng 1 (Before Library) quyết định lưu kho thư viện và Cổng 2 (Before Sim) cho phép phê duyệt mô phỏng.",
    },
    {
      q: "Chế độ Zero-Shot hoạt động như thế nào khi không tìm thấy mẫu tương đồng?",
      a: "Khi thư viện dữ liệu chưa có kịch bản mẫu phù hợp, Node 2 tự động fallback chuyển sang chế độ Zero-Shot, tự tổng hợp thông số động học từ bộ mẫu bản đồ chuẩn (TEMPLATE_CATALOG) mà không làm crash hệ thống.",
    },
  ];

  return (
    <section className="py-16 lg:py-24 relative bg-slate-50 border-t border-slate-200 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column */}
          <div className="lg:col-span-5 space-y-6 text-left">
            <FadeIn direction="right">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold font-mono">
                <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Hỗ Trợ Kỹ Thuật</span>
              </div>

              <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-snug mt-3">
                Các câu hỏi thường gặp <br />
                về <span className="text-blue-600">Scenario Forge</span>
              </h2>

              <p className="text-sm text-slate-600 leading-relaxed mt-2">
                Giải đáp thắc mắc về chuẩn OpenSCENARIO 1.0, quy trình bóc tách ODD tiếng Việt và cổng duyệt HITL Reviewer.
              </p>

              <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3 mt-4 hover:border-blue-300 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Hỗ trợ kỹ thuật 24/7</h3>
                    <span className="text-[11px] text-slate-500">Đội ngũ kỹ sư AI & Xe tự lái</span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed pt-1">
                  Cần thêm tư vấn tích hợp bộ mô phỏng CARLA hoặc tùy biến từ điển ODD cho doanh nghiệp? Hãy liên hệ với chúng tôi bên dưới.
                </p>
              </div>
            </FadeIn>
          </div>

          {/* Right Column: Accordion List */}
          <div className="lg:col-span-7 space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openIndex === idx;
              return (
                <FadeIn key={faq.q} direction="left" delay={100 * (idx + 1)}>
                  <div
                    className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden ${
                      isOpen ? "border-blue-500 shadow-md ring-1 ring-blue-500/20" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenIndex(isOpen ? null : idx)}
                      className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-slate-900 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      <span>{faq.q}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-blue-600 shrink-0 transition-transform duration-300 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 pt-1 text-xs text-slate-600 leading-relaxed border-t border-slate-100 animate-fade-in transition-all duration-300">
                        {faq.a}
                      </div>
                    )}
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
