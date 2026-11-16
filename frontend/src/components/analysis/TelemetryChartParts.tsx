"use client";

import { memo, type PointerEvent } from "react";
import { formatMetric } from "./analysisMetricFormat";
import { CHART_LEFT, CHART_RIGHT, finiteTime, type ChartSeriesData } from "./telemetryChartData";
import type { ChartMarker } from "../TelemetryChart";
import styles from "./TelemetryChart.module.css";

export const chartX = (time: number, end: number) => CHART_LEFT + time / end * (CHART_RIGHT - CHART_LEFT);
export function pointerTime(event: PointerEvent<SVGSVGElement>, end: number) {
  const svg = event.currentTarget, matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  const local = point.matrixTransform(matrix.inverse());
  return Math.max(0, Math.min(1, (local.x - CHART_LEFT) / (CHART_RIGHT - CHART_LEFT))) * end;
}

/** Static SVG geometry stays mounted during hover/playback ticks; batch isolated dots at scale. */
export const RecordedSeries = memo(function RecordedSeries({ data, end, min, max, top, bottom, signal, color, dashed = false }: {
  data: ChartSeriesData; end: number; min: number; max: number; top: number; bottom: number;
  signal: string; color: string; dashed?: boolean;
}) {
  const xy = (p: { t: number; value: number | null }) => [chartX(p.t, end), bottom - (p.value! - min) / (max - min) * (bottom - top)];
  const singles = data.segments.filter(segment => segment.length === 1);
  return <>
    {data.segments.filter(segment => segment.length > 1).map((segment, i) => <polyline key={i} data-signal={signal}
      points={segment.map(p => xy(p).join(",")).join(" ")} fill="none" stroke={color} strokeWidth={2} strokeDasharray={dashed ? "6 3" : undefined} />)}
    {singles.length > 1000 ? <path data-signal={signal} data-recorded-dots={singles.length}
      d={singles.map(([p]) => { const [x, y] = xy(p); return `M${x},${y}h0.01`; }).join(" ")}
      fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
      : singles.map(([p], i) => { const [cx, cy] = xy(p); return <circle key={i} data-signal={signal} cx={cx} cy={cy} r={3} fill={color} />; })}
  </>;
});

export function ChartQuality({ data, label, policy = true }: { data: ChartSeriesData; label?: string; policy?: boolean }) {
  const q = data.quality, anomalies = q.invalidTime + q.nonIncreasing + q.invalidValue + q.outside;
  if (!policy && !anomalies && !q.missing && !q.gaps) return null;
  return <p className={styles.note} data-chart-quality>
    {label && `${label}: `}
    {policy && (data.maxGap === null ? "Chưa có dt danh định: chỉ vẽ mẫu rời, không đoán nhịp lấy mẫu." : `Ngắt đường khi khoảng mẫu > ${formatMetric(data.maxGap, 3)} s theo dt danh định; đây là quy tắc hiển thị, không xác nhận mất mẫu.`)}
    {q.gaps > 0 && ` ${q.gaps} khoảng dài không nối.`}
    {q.missing > 0 && ` ${q.missing} số đo thiếu; không thay bằng 0.`}
    {anomalies > 0 && ` Chất lượng dữ liệu: ${q.invalidTime} timestamp không hợp lệ, ${q.nonIncreasing} mốc trùng/lùi, ${q.invalidValue} số đo ngoài hợp đồng, ${q.outside} mẫu ngoài miền thời gian. Dữ liệu gốc không đổi.`}
  </p>;
}

export function visibleChartMarkers(markers: ChartMarker[], end: number) {
  return markers.filter(marker => finiteTime(marker.t) && marker.t <= end);
}
export const markerTitle = (marker: ChartMarker) => `${marker.label} · ${formatMetric(marker.t, 3)} s${marker.source ? ` · ${marker.source}` : ""}`;
export function ChartMarkerLegend({ markers }: { markers: ChartMarker[] }) {
  return <div className={styles.legend} aria-label="Mốc đã ghi trên biểu đồ">{markers.map((marker, i) =>
    <span key={i} style={{ color: marker.color }} title={markerTitle(marker)}>{marker.label} · {formatMetric(marker.t, 3)} s{marker.source && <span className={styles.source}> · {marker.source}</span>}</span>)}</div>;
}
