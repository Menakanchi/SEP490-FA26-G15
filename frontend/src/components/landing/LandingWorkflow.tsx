"use client";

import React, { useState } from "react";
import { Braces, CheckCircle2, FileCode2, Layers } from "lucide-react";
import { FadeIn } from "./FadeIn";

const steps = [
  {
    id: 1,
    title: "Chuẩn hóa yêu cầu thành 4 trục ODD",
    desc: "Bộ quy tắc tiếng Việt xử lý các cách nói như ‘xe may’, ‘tat dau’; LLM chỉ được gọi khi quy tắc chưa đủ dữ kiện. Kết quả được chuẩn hóa thành loại đường, thời tiết, tác nhân và hành vi.",
    tag: "Hiểu yêu cầu",
  },
  {
    id: 2,
    title: "Truy xuất mẫu đã duyệt và sinh bản nháp",
    desc: "Retriever tìm Top-K kịch bản tương đồng trong thư viện đã duyệt. Agent dùng ngữ cảnh đó để sinh ScenarioSpec có actor, tốc độ, vị trí tương đối và trigger trong schema đóng.",
    tag: "Truy xuất + Sinh",
  },
  {
    id: 3,
    title: "Kiểm tra, duyệt và chạy CARLA",
    desc: "Validator kiểm tra schema và hình học trước khi biên dịch sang OpenSCENARIO 1.0. Hai cổng người duyệt kiểm soát việc đưa vào thư viện và cấp job cho worker CARLA.",
    tag: "Kiểm tra + Duyệt",
  },
];

export function LandingWorkflow() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section
      id="workflow"
      className="py-16 lg:py-24 bg-slate-50 border-y border-slate-200 relative overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <FadeIn direction="up">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold font-mono tracking-wider text-blue-600 uppercase bg-blue-100 px-3 py-1 rounded-full border border-blue-200">
              Quy trình AI đa bước
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Một luồng có kiểm soát từ mô tả đến mô phỏng
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              LLM không tự do xuất XML. Mỗi bản nháp phải đi qua retrieval,
              schema, kiểm tra hình học và quyết định của người duyệt trước khi
              dùng tài nguyên CARLA.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 grid grid-cols-1 gap-4">
            <Feature
              delay={100}
              icon={<Braces className="w-4 h-4" />}
              title="1. Trích xuất ODD từ tiếng Việt"
              desc="Road Type · Weather · Actor Type · Maneuver"
              tone="blue"
            />
            <Feature
              delay={200}
              icon={<Layers className="w-4 h-4" />}
              title="2. RAG trên thư viện đã duyệt"
              desc="Embedding SQLite và cosine similarity lấy kịch bản tham chiếu"
              tone="cyan"
            />

            <FadeIn direction="right" delay={300}>
              <div className="bg-white p-5 rounded-2xl border border-indigo-300 shadow-sm space-y-3 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
                    <FileCode2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      3. Biên dịch OpenSCENARIO 1.0
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      Converter deterministic tạo file `.xosc`
                    </span>
                  </div>
                </div>
                <pre className="text-[10px] leading-relaxed bg-slate-950 text-cyan-200 rounded-xl border border-slate-800 p-4 overflow-hidden">
                  {`<OpenSCENARIO>
  <Entities>ego · adversary</Entities>
  <Storyboard>trigger · action</Storyboard>
</OpenSCENARIO>`}
                </pre>
              </div>
            </FadeIn>
          </div>

          <div className="lg:col-span-6 space-y-4">
            {steps.map((step, idx) => {
              const isActive = activeStep === idx;
              return (
                <FadeIn key={step.id} direction="left" delay={150 * (idx + 1)}>
                  <button
                    type="button"
                    onClick={() => setActiveStep(idx)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                      isActive
                        ? "bg-white border-blue-500 shadow-md ring-2 ring-blue-500/10 scale-[1.01]"
                        : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${isActive ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}
                        >
                          {step.id}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900">
                          {step.title}
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                        {step.tag}
                      </span>
                    </div>

                    {isActive && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 animate-fade-in">
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {step.desc}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-blue-600 font-semibold pt-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            Đã triển khai trong quy trình LangGraph 7 nút
                          </span>
                        </div>
                      </div>
                    )}
                  </button>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Feature({
  delay,
  icon,
  title,
  desc,
  tone,
}: {
  delay: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tone: "blue" | "cyan";
}) {
  const color =
    tone === "blue"
      ? "bg-blue-50 text-blue-600 border-blue-100"
      : "bg-cyan-50 text-cyan-600 border-cyan-100";
  return (
    <FadeIn direction="right" delay={delay}>
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center ${color}`}
          >
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <span className="text-[11px] text-slate-500">{desc}</span>
          </div>
        </div>
      </div>
    </FadeIn>
  );
}
