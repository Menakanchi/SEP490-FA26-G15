"use client";

import { useMemo, useState } from "react";
import { formatMetric } from "./analysis/analysisMetricFormat";
import { chartEnd, finiteTime, nearestChartSample, prepareChartSeries } from "./analysis/telemetryChartData";
import { RecordedSeries, ChartQuality, ChartMarkerLegend, chartX, pointerTime, visibleChartMarkers, markerTitle } from "./analysis/TelemetryChartParts";
import styles from "./analysis/TelemetryChart.module.css";
import type { MotionTelemetryPoint } from "@/types/vehicsim";
import type { ChartMarker } from "./TelemetryChart";

export type MotionSignal = "ego_x_m"|"ego_speed_mps"|"ego_accel_mps2"|"target_y_m"|"target_vy_mps"|"perceived_y_m"|"ttc_perceived_s"|"ttc_gt_s"|"jerk_mps3"|"crossing_distance_m";
export const MOTION_SIGNALS: { key: MotionSignal; label: string; unit: string; source: string }[] = [
  { key: "jerk_mps3", label: "Jerk từ gia tốc đã lưu", unit: "m/s³", source: "Backend dẫn xuất bằng sai phân gia tốc theo timestamp đã lưu; chưa lọc, chỉ để phân tích, không thay objective RMS jerk." },
  { key: "crossing_distance_m", label: "Khoảng cách tới vạch băng qua", unit: "m", source: "Backend dẫn xuất từ tọa độ đã lưu; không phải khoảng cách radar tới target." },
  { key: "ego_accel_mps2", label: "Gia tốc ego", unit: "m/s²", source: "Gia tốc đã lưu trong kết quả run; có thể do lõi dẫn xuất, không mặc định là IMU thô." },
  { key: "ego_speed_mps", label: "Vận tốc ego", unit: "m/s", source: "Ground truth trong kết quả run." },
  { key: "ego_x_m", label: "Vị trí ego X", unit: "m", source: "Tọa độ X theo hệ mô phỏng của run." },
  { key: "target_y_m", label: "Vị trí target Y", unit: "m", source: "Ground truth mục tiêu theo trục Y trong hệ mô phỏng của run." },
  { key: "target_vy_mps", label: "Vận tốc target Y", unit: "m/s", source: "Thành phần vận tốc có hướng theo trục Y; không phải độ lớn vận tốc." },
  { key: "perceived_y_m", label: "Vị trí nhận thức Y", unit: "m", source: "Giá trị perceived_y do lõi ghi; không mặc định là đo từ sensor thật." },
  { key: "ttc_perceived_s", label: "TTC nhận thức", unit: "s", source: "TTC perception đã lưu; thiếu dữ liệu được để trống." },
  { key: "ttc_gt_s", label: "TTC ground truth", unit: "s", source: "TTC ground truth đã lưu; không thay thế TTC nhận thức bị thiếu." },
];


export function MotionTelemetryChart({ points, markers, cursor, selectedField, onFieldChange, timeEnd, nominalStep, hoverTime, onHoverTime }: {
  points: MotionTelemetryPoint[]; markers: ChartMarker[]; cursor?: number;
  selectedField?: MotionSignal; onFieldChange?: (field: MotionSignal) => void;
  timeEnd?: number; nominalStep?: number; hoverTime?: number | null; onHoverTime?: (time: number | null) => void;
}) {
  const [localHover, setLocalHover] = useState<number | null>(null);
  const [localField, setField] = useState<MotionSignal>("ego_accel_mps2");
  const field = selectedField ?? localField;
  const signal = MOTION_SIGNALS.find(s => s.key === field)!;
  const nonNegative = ["ego_speed_mps", "ttc_perceived_s", "ttc_gt_s", "crossing_distance_m"].includes(field);
  const end = useMemo(() => chartEnd(points, timeEnd), [points, timeEnd]);
  const limit = finiteTime(timeEnd) ? timeEnd : end;
  const data = useMemo(() => prepareChartSeries(points, p => p[field], limit, nominalStep, nonNegative), [points, field, limit, nominalStep, nonNegative]);
  const padding = Math.max((data.high - data.low) * 0.1, 0.1), yMin = data.low - padding, yMax = data.high + padding;
  const x = (t: number) => chartX(t, end), y = (v: number) => 235 - (v - yMin) / (yMax - yMin) * 205;
  const activeHover = onHoverTime ? hoverTime : localHover;
  const time = activeHover ?? cursor;
  const nearest = nearestChartSample(data.samples, time);
  const changeHover = onHoverTime ?? setLocalHover;
  const visibleMarkers = visibleChartMarkers(markers, limit);
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold text-vehicsim-ink">Chuyển động và nguồn dữ liệu</h2>
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-[12px] text-vehicsim-muted">
          Tín hiệu
          <select aria-label="Tín hiệu" className={`${styles.select} rounded-lg border border-vehicsim-line bg-vehicsim-surface p-2`} value={field}
            onChange={e => { const next = e.target.value as MotionSignal; if (onFieldChange) onFieldChange(next); else setField(next); }}>
            {MOTION_SIGNALS.map(s => <option key={s.key} value={s.key}>{s.label} ({s.unit})</option>)}
          </select>
        </label>
      </div>
      <p className={styles.note}>{signal.source}</p>
      {!data.count ? <p className="py-8 text-center text-[13px] text-vehicsim-muted">Run chưa có dữ liệu cho tín hiệu này.</p> : (
        <div className={styles.scroll} role="region" aria-label="Vùng cuộn biểu đồ chuyển động" tabIndex={0}>
        <svg viewBox="0 0 706 270" className={styles.svg} role="img"
          onPointerLeave={() => changeHover(null)} onPointerMove={e => changeHover(pointerTime(e, limit))}
          aria-label={`${signal.label} (${signal.unit}) theo thời gian (s)`}>
          <title>{signal.label} ({signal.unit}) theo thời gian</title>
          {Array.from({ length: 5 }, (_, i) => {
            const value = yMin + (yMax - yMin) * i / 4, t = end * i / 4;
            return <g key={i}>
              <line x1={62} x2={644} y1={y(value)} y2={y(value)} stroke="var(--color-vehicsim-line)" />
              <text x={55} y={y(value) + 4} textAnchor="end" fontSize={11} fill="var(--color-vehicsim-muted)">{formatMetric(value)}</text>
              <text x={x(t)} y={258} textAnchor="middle" fontSize={11} fill="var(--color-vehicsim-muted)">{formatMetric(t, 3)} s</text>
            </g>;
          })}
          {visibleMarkers.map((m, i) => <line key={i} x1={x(m.t)} x2={x(m.t)} y1={30} y2={235} stroke={m.color} strokeDasharray="4 3"><title>{markerTitle(m)}</title></line>)}
          {finiteTime(cursor) && cursor <= end && <line data-chart-cursor x1={x(cursor)} x2={x(cursor)} y1={30} y2={235} stroke="var(--color-vehicsim-ink)" strokeWidth={2}><title>Thời gian đang xem: {cursor} s</title></line>}
          <RecordedSeries data={data} end={end} min={yMin} max={yMax} top={30} bottom={235} signal={field} color="var(--color-vehicsim-decision)" />
          {finiteTime(activeHover) && activeHover <= end && <line data-chart-hover x1={x(activeHover)} x2={x(activeHover)} y1={30} y2={235} stroke="var(--color-vehicsim-muted)" strokeDasharray="2 2" />}
          <text x={62} y={18} fontSize={11} fill="var(--color-vehicsim-muted)">{signal.unit}</text>
        </svg></div>
      )}
      <p className={styles.note} data-chart-readout aria-live="off">
        Mốc xem {formatMetric(time, 3)} s · Mẫu gần nhất theo timestamp (hòa chọn mốc trước, không nội suy):
        {nearest ? ` t = ${formatMetric(nearest.t, 3)} s · ${signal.label}: ${formatMetric(nearest.value, signal.unit === "m/s³" ? 3 : 2, nonNegative)} ${signal.unit}` : " Chưa có mẫu trong khoảng đã ghi của nguồn."}
        {" "}Nguồn motion_telemetry.{field}. — = không có số đo hợp lệ tại mẫu.
      </p>
      <p className={styles.note}>Dùng thanh thời gian phía trên bằng phím mũi tên/Home/End hoặc chạm để xem mẫu. Di chuột để so timestamp; cuộn ngang vùng biểu đồ trên màn hẹp.</p>
      <ChartQuality data={data} />
      <ChartMarkerLegend markers={visibleMarkers} />
    </section>
  );
}
