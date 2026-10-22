"use client";

import { useState } from "react";
import type { MotionTelemetryPoint } from "@/types/vehicsim";
import type { ChartMarker } from "@/components/TelemetryChart";

type Field = "ego_x_m"|"ego_speed_mps"|"ego_accel_mps2"|"target_y_m"|"target_vy_mps"|"perceived_y_m"|"ttc_perceived_s"|"ttc_gt_s"|"jerk_mps3"|"crossing_distance_m";
const SIGNALS: { key: Field; label: string; unit: string; source: string }[] = [
  { key: "jerk_mps3", label: "Jerk từ gia tốc đã lưu", unit: "m/s³", source: "Sai phân gia tốc theo timestamp đã lưu; chưa lọc, chỉ để phân tích, không thay objective RMS jerk." },
  { key: "crossing_distance_m", label: "Khoảng cách tới vạch băng qua", unit: "m", source: "Tính từ tọa độ đã lưu; không phải khoảng cách radar tới target." },
  { key: "ego_accel_mps2", label: "Gia tốc ego", unit: "m/s²", source: "Ground truth trong kết quả run; giữ nguyên tín hiệu đã lưu." },
  { key: "ego_speed_mps", label: "Vận tốc ego", unit: "m/s", source: "Ground truth trong kết quả run." },
  { key: "ego_x_m", label: "Vị trí ego X", unit: "m", source: "Tọa độ X theo hệ mô phỏng của run." },
  { key: "target_y_m", label: "Vị trí target Y", unit: "m", source: "Ground truth người đi bộ theo trục Y của run." },
  { key: "target_vy_mps", label: "Vận tốc target Y", unit: "m/s", source: "Thành phần vận tốc có hướng theo trục Y; không phải độ lớn vận tốc." },
  { key: "perceived_y_m", label: "Vị trí nhận thức Y", unit: "m", source: "Giá trị perceived_y do lõi ghi; không mặc định là đo từ sensor thật." },
  { key: "ttc_perceived_s", label: "TTC nhận thức", unit: "s", source: "TTC perception đã lưu; thiếu dữ liệu được để trống." },
  { key: "ttc_gt_s", label: "TTC ground truth", unit: "s", source: "TTC ground truth đã lưu; không thay thế TTC nhận thức bị thiếu." },
];

export function MotionTelemetryChart({ points, markers, cursor }: { points: MotionTelemetryPoint[]; markers: ChartMarker[]; cursor?:number }) {
  const [field, setField] = useState<Field>("ego_accel_mps2");
  const signal = SIGNALS.find((s) => s.key === field)!;
  const values = points.map((p) => p[field]).filter((v): v is number => v !== null && Number.isFinite(v));
  const times = points.map((p) => p.t).filter(Number.isFinite);
  const tMin = 0;
  const tMax = times.length ? Math.max(tMin + 0.01, ...times) : 1;
  const low = values.length ? Math.min(0, ...values) : 0;
  const high = values.length ? Math.max(0, ...values) : 1;
  const padding = Math.max((high - low) * 0.1, 0.1);
  const yMin = low - padding, yMax = high + padding;
  const x = (t: number) => 62 + (t - tMin) / (tMax - tMin) * 618;
  const y = (v: number) => 235 - (v - yMin) / (yMax - yMin) * 205;
  const segments: string[][] = [];
  let line: string[] = [];
  let previousT: number | null = null;
  for (const point of points) {
    const value = point[field];
    if (value == null || !Number.isFinite(value) || !Number.isFinite(point.t) || (previousT !== null && point.t <= previousT)) {
      if (line.length) segments.push(line);
      line = [];
    } else {
      line.push(`${x(point.t)},${y(value)}`);
    }
    previousT = point.t;
  }
  if (line.length) segments.push(line);
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold text-vehicsim-ink">Chuyển động và nguồn dữ liệu</h2>
        <label className="text-[12px] text-vehicsim-muted">
          Tín hiệu
          <select aria-label="Tín hiệu" className="ml-2 rounded-lg border border-vehicsim-line bg-white p-2" value={field} onChange={(e) => setField(e.target.value as Field)}>
            {SIGNALS.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.unit})</option>)}
          </select>
        </label>
      </div>
      <p className="text-[12px] text-vehicsim-muted">{signal.source}</p>
      {!values.length ? <p className="py-8 text-center text-[13px] text-vehicsim-muted">Run chưa có dữ liệu cho tín hiệu này.</p> : (
        <svg viewBox="0 0 706 270" className="h-64 w-full" role="img" aria-label={`${signal.label} (${signal.unit}) theo thời gian (s)`}>
          <title>{signal.label} ({signal.unit}) theo thời gian</title>
          {Array.from({ length: 5 }, (_, i) => {
            const value = yMin + (yMax - yMin) * i / 4;
            const t = tMin + (tMax - tMin) * i / 4;
            return <g key={i}>
              <line x1={62} x2={680} y1={y(value)} y2={y(value)} stroke="var(--color-vehicsim-line)" />
              <text x={55} y={y(value) + 4} textAnchor="end" fontSize={11} fill="var(--color-vehicsim-muted)">{value.toFixed(2)}</text>
              <text x={x(t)} y={258} textAnchor="middle" fontSize={11} fill="var(--color-vehicsim-muted)">{t.toFixed(2)} s</text>
            </g>;
          })}
          {markers.filter((m) => m.t >= tMin && m.t <= tMax).map((m, i) => (
            <line key={`${m.label}-${i}`} x1={x(m.t)} x2={x(m.t)} y1={30} y2={235} stroke={m.color} strokeDasharray="4 3"><title>{m.label} · {m.t} s</title></line>
          ))}
          {cursor !== undefined && <line x1={x(cursor)} x2={x(cursor)} y1={30} y2={235} stroke="var(--color-vehicsim-ink)" strokeWidth={2}><title>Thời gian đang xem: {cursor} s</title></line>}
          {segments.map((segment, i) => segment.length === 1
            ? <circle key={i} cx={Number(segment[0].split(",")[0])} cy={Number(segment[0].split(",")[1])} r={3} fill="var(--color-vehicsim-decision)" />
            : <polyline key={i} points={segment.join(" ")} fill="none" stroke="var(--color-vehicsim-decision)" strokeWidth={2} />)}
          <text x={62} y={18} fontSize={11} fill="var(--color-vehicsim-muted)">{signal.unit}</text>
        </svg>
      )}
      <div className="flex flex-wrap gap-3 text-[11px] text-vehicsim-muted">
        {markers.map((m, i) => <span key={`${m.label}-${i}`} style={{ color: m.color }}>{m.label}: {m.t.toFixed(2)} s</span>)}
      </div>
    </section>
  );
}
