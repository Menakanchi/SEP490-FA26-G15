"use client";

import React, { useState } from "react";
import { CheckCircle2, ChevronDown, HelpCircle } from "lucide-react";
import { FadeIn } from "./FadeIn";

const faqs = [
  {
    q: "ODD là gì và Scenario Forge sử dụng nó như thế nào?",
    a: "ODD là miền điều kiện vận hành của phép thử. Trong MVP, một ô ODD gồm loại đường, thời tiết, loại tác nhân và hành vi. Người dùng có thể mô tả bằng tiếng Việt hoặc chọn trực tiếp các trục này trong chiến dịch ODD.",
  },
  {
    q: "Hệ thống xuất những định dạng nào?",
    a: "Mỗi kịch bản có ScenarioSpec dạng JSON để review và file OpenSCENARIO 1.0 XML (`.xosc`) để tải xuống hoặc gửi tới worker CARLA.",
  },
  {
    q: "Con người kiểm soát chất lượng ở đâu?",
    a: "Cổng Before Library cho phép duyệt hoặc từ chối trước khi kịch bản vào thư viện. Cổng Before Sim quyết định có cấp job cho worker CARLA hay không. Lý do từ chối được lưu lại để truy vết và tạo biến thể sửa lỗi.",
  },
  {
    q: "Luồng nào cần GPU?",
    a: "Generator, validation, review, thư viện và tải `.xosc` chạy được không cần CARLA. Chỉ bước mô phỏng và BehaviorAgent cần một worker kết nối tới CARLA trên máy có GPU phù hợp.",
  },
];

export function LandingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-16 lg:py-24 relative bg-slate-50 border-t border-slate-200 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-6 text-left">
            <FadeIn direction="right">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold font-mono">
                <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Thông tin kỹ thuật</span>
              </div>

              <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-snug mt-3">
                Những điều cần biết <br />
                trước khi <span className="text-blue-600">chạy thử</span>
              </h2>

              <p className="text-sm text-slate-600 leading-relaxed mt-2">
                Phân biệt rõ luồng tĩnh, cổng người duyệt và bước mô phỏng GPU
                giúp người dùng chọn đúng cách vận hành.
              </p>

              <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3 mt-4 hover:border-blue-300 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      Phạm vi MVP công khai
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      Town04 · 6 maneuver · 72 ô ODD hỗ trợ
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed pt-1">
                  Các tổ hợp ngoài support matrix được báo chưa hỗ trợ thay vì
                  âm thầm sinh file không thể chạy.
                </p>
              </div>
            </FadeIn>
          </div>

          <div className="lg:col-span-7 space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openIndex === idx;
              return (
                <FadeIn key={faq.q} direction="left" delay={100 * (idx + 1)}>
                  <div
                    className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden ${isOpen ? "border-blue-500 shadow-md ring-1 ring-blue-500/20" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenIndex(isOpen ? null : idx)}
                      className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-slate-900 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      <span>{faq.q}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-blue-600 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 pt-3 text-xs text-slate-600 leading-relaxed border-t border-slate-100 animate-fade-in">
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
