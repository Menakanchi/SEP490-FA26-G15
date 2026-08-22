"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Cpu, FileCode, CheckCircle2, Layers } from "lucide-react";
import { FadeIn } from "./FadeIn";

export function LandingWorkflow() {
  const [activeStep, setActiveStep] = useState<number>(0);

  const steps = [
    {
      id: 1,
      title: "1. Tự động hóa trích xuất ODD từ ngôn ngữ tự nhiên",
      desc: "Hệ thống kết hợp bộ quy tắc Rule-based tra cứu nhanh từ điển Tiếng Việt (xử lý từ lóng, từ viết tắt như 'xe may', 'tat dau') kết hợp mô hình LLM dự phòng để phân tích chính xác 4 trục ODD (Road Type, Weather, Actor Type, Maneuver).",
      tag: "Node 1: Parse Intent",
    },
    {
      id: 2,
      title: "2. Định danh và gán tác nhân (Ego Vehicle VF 8 / Obstacles)",
      desc: "Truy vấn cơ sở dữ liệu vector/SQLite lấy Top-K kịch bản mẫu đã qua kiểm duyệt. Tác nhân chính Ego được gán các thông số động học và hệ thống cảm biến tiêu chuẩn xe điện thông minh VinFast VF 8 / VF 9.",
      tag: "Node 2: Retrieve & Match",
    },
    {
      id: 3,
      title: "3. HITL Reviewer (Quy trình thẩm định và phê duyệt)",
      desc: "Quy trình kiểm duyệt 2 cổng nghiêm ngặt: Cổng 1 (Before Library) quyết định lưu trữ kịch bản vào thư viện; Cổng 2 (Before Sim) cho phép thực thi mô phỏng trên CARLA / SVL Simulator.",
      tag: "HITL Audit Gate",
    },
  ];

  return (
    <section id="workflow" className="py-16 lg:py-24 bg-slate-50 border-y border-slate-200 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <FadeIn direction="up">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold font-mono tracking-wider text-blue-600 uppercase bg-blue-100 px-3 py-1 rounded-full border border-blue-200">
              Hệ Thống AI Agentic Multi-Node
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Quy trình sinh kịch bản tự động đa tầng cho hệ thống ADAS
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Kết hợp mô hình ngôn ngữ lớn (LLM), RAG Vector similarity matching và kiểm tra tĩnh hình học trước khi chuyển đổi sang mã nguồn OpenSCENARIO 1.0.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: 3 Feature Visual Cards */}
          <div className="lg:col-span-6 grid grid-cols-1 gap-4">
            <FadeIn direction="right" delay={100}>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 hover:border-blue-400 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold shrink-0">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">1. Trích xuất ODD đa biến (Thời tiết, hạ tầng VN)</h3>
                    <span className="text-[11px] text-slate-500">Tự bóc tách từ lóng, sương mù, mưa lớn & ngã tư đô thị</span>
                  </div>
                </div>
              </div>
            </FadeIn>

            <FadeIn direction="right" delay={200}>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 hover:border-cyan-400 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-100 flex items-center justify-center font-bold shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">2. RAG Vector Matching kịch bản tương đồng</h3>
                    <span className="text-[11px] text-slate-500">Truy vấn kịch bản tham chiếu từ cơ sở dữ liệu đã kiểm duyệt</span>
                  </div>
                </div>
              </div>
            </FadeIn>

            <FadeIn direction="right" delay={300}>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 hover:border-indigo-400 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center font-bold shrink-0">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">3. Mô phỏng 2D đa tác nhân (Ego VinFast vs Adversary)</h3>
                    <span className="text-[11px] text-slate-500">Xem trước vị trí làn đường, khoảng cách TTC & xuất OpenSCENARIO XML</span>
                  </div>
                </div>

                <div className="relative h-32 rounded-xl overflow-hidden border border-slate-200 mt-2">
                  <Image
                    src="/images/vinfast_vf8.png"
                    alt="VinFast VF 8 ADAS Intersection Test"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                  />
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Right Column: 3 Accordion Blocks */}
          <div className="lg:col-span-6 space-y-4">
            {steps.map((step, idx) => {
              const isActive = activeStep === idx;
              return (
                <FadeIn key={step.id} direction="left" delay={150 * (idx + 1)}>
                  <div
                    onClick={() => setActiveStep(idx)}
                    className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                      isActive
                        ? "bg-white border-blue-500 shadow-md ring-2 ring-blue-500/10 scale-[1.01]"
                        : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-colors duration-300 ${
                            isActive ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {step.id}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900">{step.title}</h4>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                        {step.tag}
                      </span>
                    </div>

                    {isActive && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 animate-fade-in transition-all duration-300">
                        <p className="text-xs text-slate-600 leading-relaxed">{step.desc}</p>
                        <div className="flex items-center gap-2 text-[11px] text-blue-600 font-semibold pt-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Đã tích hợp vào Langgraph Multi-Node Pipeline</span>
                        </div>
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
