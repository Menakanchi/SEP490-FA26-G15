"use client";

import { useMemo } from "react";
import { formatMetric } from "./analysis/analysisMetricFormat";
import { chartEnd, nearestChartSample, prepareChartSeries, finiteTime } from "./analysis/telemetryChartData";
import { RecordedSeries, ChartQuality, ChartMarkerLegend, chartX, pointerTime, visibleChartMarkers, markerTitle } from "./analysis/TelemetryChartParts";
import styles from "./analysis/TelemetryChart.module.css";

/** Independent value axes, shared simulation-time axis. No metric calculation. */
const W = 706, H = 330, L = 62, R = 644, TOP = 34, BOTTOM = 296;
export interface ChartMarker { t: number; label: string; color: string; source?: string }
interface Point { t: number; ttc: number | null; speed_kmh: number | null }
interface Props {
  cursor?: number; hoverTime?: number | null; onHoverTime?: (time: number | null) => void;
  timeEnd?: number; nominalStep?: number;
  points: Point[]; threshold: number | null; markers: ChartMarker[];
  shade?: [number, number] | null; impactT?: number | null;
}

export function TelemetryChart({ points, threshold, markers, shade, impactT, cursor, timeEnd, nominalStep, hoverTime, onHoverTime }: Props) {
  const end = useMemo(() => chartEnd(points, timeEnd), [points, timeEnd]);
  const limit = finiteTime(timeEnd) ? timeEnd : end;
  const ttc = useMemo(() => prepareChartSeries(points, p => p.ttc, limit, nominalStep, true), [points, limit, nominalStep]);
  const speed = useMemo(() => prepareChartSeries(points, p => p.speed_kmh, limit, nominalStep, true), [points, limit, nominalStep]);
  const visibleMarkers = visibleChartMarkers(markers, limit);
  const thresholdValue = finiteTime(threshold) ? threshold : null;
  const ttcHigh = Math.max(5, ttc.high, thresholdValue ?? 0), speedHigh = Math.max(1, speed.high);
  const x = (t: number) => chartX(t, end);
  const yTtc = (v: number) => BOTTOM - v / ttcHigh * (BOTTOM - TOP);
  const ySpeed = (v: number) => BOTTOM - v / speedHigh * (BOTTOM - TOP);
  const time = hoverTime ?? cursor;
  const nearestTtc = nearestChartSample(ttc.samples, time), nearestSpeed = nearestChartSample(speed.samples, time);
  const impactPoint = useMemo(() => finiteTime(impactT) ? speed.samples.find(p => p.t === impactT && p.value !== null) : null, [speed, impactT]);
  if (!ttc.count && !speed.count) return <div><p className="py-8 text-center text-[13px] text-vehicsim-muted">Run chưa có telemetry để vẽ biểu đồ.</p><ChartQuality data={ttc} /><ChartQuality data={speed} /></div>;
  return <div className="min-w-0 space-y-3">
    <p className={styles.note}>TTC: nét liền, trục trái · Tốc độ ego: nét đứt, trục phải. Cuộn ngang vùng biểu đồ trên màn hẹp.</p>
    <div className={styles.scroll} role="region" aria-label="Vùng cuộn biểu đồ TTC và tốc độ" tabIndex={0}>
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label="TTC nhận thức (s) và tốc độ xe (km/h) theo thời gian (s)"
      onPointerMove={e => onHoverTime?.(pointerTime(e, limit))} onPointerLeave={() => onHoverTime?.(null)}>
      <title>TTC nhận thức (s), trục trái; tốc độ xe (km/h), trục phải; thời gian (s)</title>
      <text x={L} y={20} fontSize={11} fill="var(--color-vehicsim-muted)">TTC (s)</text>
      <text x={R} y={20} textAnchor="end" fontSize={11} fill="var(--color-vehicsim-decision)">Tốc độ (km/h)</text>
      {Array.from({ length: 6 }, (_, i) => {
        const ratio = i / 5, y = BOTTOM - ratio * (BOTTOM - TOP);
        return <g key={i}>
          <line x1={L} x2={R} y1={y} y2={y} stroke="var(--color-vehicsim-line)" />
          <text x={L - 10} y={y + 4} textAnchor="end" fontSize={11} fill="var(--color-vehicsim-muted)">{formatMetric(ratio * ttcHigh, 1)}</text>
          <text x={R + 10} y={y + 4} fontSize={11} fill="var(--color-vehicsim-decision)">{formatMetric(ratio * speedHigh, 1)}</text>
        </g>;
      })}
      {Array.from({ length: 5 }, (_, i) => <text key={i} x={x(end * i / 4)} y={322} textAnchor="middle" fontSize={11} fill="var(--color-vehicsim-muted)">{formatMetric(end * i / 4, 3)} s</text>)}
      {shade && finiteTime(shade[0]) && finiteTime(shade[1]) && shade[1] > shade[0] && shade[0] < end &&
        <rect x={x(shade[0])} y={TOP} width={x(Math.min(end, shade[1])) - x(shade[0])} height={BOTTOM - TOP} fill="rgba(229,72,77,0.07)" />}
      {thresholdValue !== null && <line x1={L} x2={R} y1={yTtc(thresholdValue)} y2={yTtc(thresholdValue)} stroke="var(--color-vehicsim-amber)" strokeWidth={1.5} strokeDasharray="5 4"><title>Ngưỡng TTC cấu hình: {formatMetric(thresholdValue, 3)} s</title></line>}
      {visibleMarkers.map((m, i) => <line key={i} x1={x(m.t)} x2={x(m.t)} y1={TOP} y2={BOTTOM} stroke={m.color} strokeDasharray="4 3"><title>{markerTitle(m)}</title></line>)}
      <RecordedSeries data={ttc} end={end} min={0} max={ttcHigh} top={TOP} bottom={BOTTOM} signal="ttc" color="var(--color-vehicsim-ink)" />
      <RecordedSeries data={speed} end={end} min={0} max={speedHigh} top={TOP} bottom={BOTTOM} signal="speed_kmh" color="var(--color-vehicsim-decision)" dashed />
      {finiteTime(cursor) && cursor <= end && <line data-chart-cursor x1={x(cursor)} x2={x(cursor)} y1={TOP} y2={BOTTOM} stroke="var(--color-vehicsim-ink)" strokeWidth={2}><title>Thời gian đang xem: {cursor} s</title></line>}
      {finiteTime(hoverTime) && hoverTime <= end && <line data-chart-hover x1={x(hoverTime)} x2={x(hoverTime)} y1={TOP} y2={BOTTOM} stroke="var(--color-vehicsim-muted)" strokeDasharray="2 2" />}
      {impactPoint?.value != null && <circle data-collision-sample cx={x(impactPoint.t)} cy={ySpeed(impactPoint.value)} r={5} fill="var(--color-vehicsim-danger)" />}
    </svg></div>
    <p className={styles.note} data-chart-readout>
      Mốc xem {formatMetric(time, 3)} s · Mẫu gần nhất theo timestamp (hòa chọn mốc trước, không nội suy):
      TTC {formatMetric(nearestTtc?.value, 2, true)} s tại {formatMetric(nearestTtc?.t, 3)} s · Tốc độ {formatMetric(nearestSpeed?.value, 1, true)} km/h tại {formatMetric(nearestSpeed?.t, 3)} s.
      Số liệu lấy từ lượt chạy đã lưu. — = thiếu hoặc ngoài khoảng dữ liệu đã ghi.
    </p>
    <ChartQuality data={ttc} label="TTC" /><ChartQuality data={speed} label="Tốc độ" policy={false} />
    <ChartMarkerLegend markers={visibleMarkers} />
  </div>;
}
