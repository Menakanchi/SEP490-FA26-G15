"use client";

/**
 * Báo cáo chất lượng M1/M2/M3 — mục "Báo cáo tỷ lệ kịch bản hợp lệ" của đề bài.
 *
 * Số tính lại từ kho mỗi lần mở, không có bảng tổng hợp riêng: báo cáo lệch với
 * dữ liệu hệ thống là lỗi tệ nhất một báo cáo có thể mắc.
 *
 * Quy ước hiển thị: **chưa đo được thì ghi "chưa có dữ liệu", không ghi 0%.**
 * Hai câu đó khác nhau, mà 0% thì trông như thất bại.
 */

import { useEffect, useState } from "react";
import { BarChart3, Grid3x3, ShieldAlert } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { getQualityReport } from "@/services/api";
import type { QualityReport } from "@/types";

export default function MetricsPage() {
  return (
    <AuthGate>
      <MetricsContent />
    </AuthGate>
  );
}

function MetricsContent() {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getQualityReport()
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <Shell><p className="text-red-500 text-sm">Không tải được báo cáo: {error}</p></Shell>;
  if (!report) return <Shell><p className="text-slate-400 text-sm">Đang tính…</p></Shell>;

  const { m1_validity: m1, m2_coverage: m2, m3_hazard: m3 } = report;

  return (
    <Shell>
      <Section icon={<BarChart3 className="w-5 h-5 text-blue-400" />} title="M1 — Tỷ lệ kịch bản hợp lệ"
               note="Bốn mức không cộng thành một con số: “90% hợp lệ” mà không nói hợp lệ theo nghĩa nào là câu vô nghĩa. Một kịch bản qua L3 vẫn có thể vô dụng ở L4.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            ["L1", m1.l1_schema],
            ["L2", m1.l2_xosc],
            ["L3", m1.l3_runtime],
            ["L4", m1.l4_intent],
          ] as const).map(([tier, level]) => (
            <div key={tier} className="glass-card p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs font-bold text-blue-400">{tier}</span>
                <span className="text-2xl font-bold text-slate-100 tabular-nums">{pct(level.rate)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-snug">{level.label}</p>
              <p className="text-[11px] text-slate-500 mt-2 tabular-nums">
                {level.passed}/{level.total} lượt
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<Grid3x3 className="w-5 h-5 text-emerald-400" />} title="M2 — Độ phủ ODD"
               note="Hai con số trả lời hai câu khác nhau. Phủ THEO CẶP là chuẩn kiểm thử tổ hợp: phần lớn lỗi sinh ra từ tương tác giữa hai yếu tố, nên phủ hết cặp bắt được gần hết lỗi với một phần nhỏ số ca. Phủ TOÀN PHẦN mới là thứ cần khi muốn nói đã thử mọi tổ hợp. Mẫu số của cả hai là phạm vi converter dựng được, không phải 560 tổ hợp enum (ADR-016).">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat value={pct(m2.rate_pairwise.rate)} label="Phủ theo cặp (pairwise)"
                sub={`${m2.covered_pairs}/${m2.feasible_pairs} cặp trục`} />
          <Stat value={pct(m2.rate_supported.rate)} label="Phủ toàn phần"
                sub={`${m2.covered_supported}/${m2.supported_total} ô`} />
          <Stat value={String(m2.covered_any)} label="Ô ODD đã có kịch bản"
                sub={`trên ${m2.enum_total} tổ hợp enum`} />
          <Stat value={String(m2.covered_out_of_scope)} label="Ô ngoài phạm vi converter"
                sub="có kịch bản nhưng chưa mô phỏng được" tone="warn" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(m2.scenarios_per_maneuver).map(([maneuver, count]) => (
            <span key={maneuver}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300">
              <code className="text-emerald-400">{maneuver}</code> · {count}
            </span>
          ))}
        </div>
      </Section>

      <Section icon={<ShieldAlert className="w-5 h-5 text-amber-400" />} title="M3 — Tỷ lệ kích hoạt hành vi nguy hiểm"
               note="Đếm hai hình thái: va chạm và suýt va chạm. lane_drift cố ý không va chạm — đo nó bằng CollisionTest thì nó luôn trông như thất bại.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat value={pct(m3.rate.rate)} label="Dựng được nguy hiểm" sub={`${m3.collision + m3.near_miss}/${m3.executed} lượt`} />
          <Stat value={String(m3.collision)} label="Có va chạm" sub={`tỷ lệ ${pct(m3.collision_rate.rate)}`} />
          <Stat value={String(m3.near_miss)} label="Suýt va chạm" sub="khe hở < 1,0 m" />
          <Stat value={String(m3.no_hazard)} label="Chạy trót lọt, vô hại" sub="đây mới là thất bại" tone="warn" />
        </div>
      </Section>
    </Shell>
  );
}

function pct(rate: number | null) {
  return rate == null ? "chưa có dữ liệu" : `${(rate * 100).toFixed(1)}%`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 p-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">Báo cáo chất lượng</h1>
        <p className="text-sm text-slate-400 mt-1">
          Tính lại từ kho mỗi lần mở trang — không có bảng tổng hợp riêng để lệch.
        </p>
      </header>
      {children}
    </div>
  );
}

function Section({ icon, title, note, children }: {
  icon: React.ReactNode; title: string; note: string; children: React.ReactNode;
}) {
  return (
    <section className="glass-card p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">{icon}{title}</h2>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{note}</p>
      </div>
      {children}
    </section>
  );
}

function Stat({ value, label, sub, tone }: {
  value: string; label: string; sub: string; tone?: "warn";
}) {
  return (
    <div className="glass-card p-4">
      <span className={`text-2xl font-bold tabular-nums ${tone === "warn" ? "text-amber-400" : "text-slate-100"}`}>
        {value}
      </span>
      <p className="text-xs text-slate-300 mt-1">{label}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>
    </div>
  );
}
