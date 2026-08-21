"use client";

import React, { useState } from "react";
import { Send, CheckCircle2, MessageSquare, Mail, User } from "lucide-react";
import { FadeIn } from "./FadeIn";

export function LandingContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSent(true);
      setName("");
      setEmail("");
      setMessage("");
      setTimeout(() => setSent(false), 5000);
    }, 1000);
  };

  return (
    <section className="py-16 lg:py-20 relative bg-white border-t border-slate-200 overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn direction="up">
          <div className="bg-white p-8 sm:p-10 rounded-3xl border border-slate-200 shadow-xl space-y-6 hover:shadow-2xl transition-shadow duration-300">
            <div className="text-center space-y-2">
              <span className="text-xs font-bold font-mono text-blue-600 uppercase tracking-wider bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                Liên Hệ Kỹ Thuật & Hợp Tác
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Đăng ký dùng thử & Gửi yêu cầu tích hợp
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
                Nhập thông tin đội ngũ phát triển của bạn để nhận tư vấn tích hợp nền tảng Scenario Forge và bộ giả lập CARLA.
              </p>
            </div>

            {sent && (
              <div className="p-4 rounded-2xl bg-green-50 border border-green-200 text-green-800 text-xs flex items-center justify-center gap-2 font-bold animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span>Yêu cầu của bạn đã được gửi thành công! Đội ngũ kỹ sư AI sẽ liên hệ lại trong thời gian sớm nhất.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-blue-600" /> Họ và tên người liên hệ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="Ví dụ: Nguyễn Văn A (Lead AV Engineer)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-blue-600" /> Email công ty / tổ chức <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-600" /> Nội dung câu hỏi / Yêu cầu tính năng ODD
                </label>
                <textarea
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[90px]"
                  placeholder="Mô tả cụ thể nhu cầu sử dụng hoặc loại phương tiện / quy chuẩn cần giả lập..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !name.trim() || !email.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? "Đang gửi..." : "Gửi yêu cầu tư vấn"}</span>
              </button>
            </form>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
