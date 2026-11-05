"use client";

/** Display recorded TTC/speed on independent axes; never calculate AEB metrics. */
const W = 706, H = 330, L = 62, R = 644, TOP = 34, BOTTOM = 296;
export interface ChartMarker { t: number; label: string; color: string }
interface Point { t: number; ttc: number | null; speed_kmh: number | null }
interface Props {
  cursor?: number; points: Point[]; threshold: number | null; markers: ChartMarker[];
  shade?: [number, number] | null; impactT?: number | null;
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function TelemetryChart({ points, threshold, markers, shade, impactT, cursor }: Props) {
  const timed = points.filter(point => finite(point.t) && point.t >= 0);
  if (!timed.length || !timed.some(point => finite(point.ttc) || finite(point.speed_kmh)))
    return <p className="py-8 text-center text-[13px] text-vehicsim-muted">Run chưa có telemetry để vẽ biểu đồ.</p>;
  const tMax = timed.reduce((max, point) => Math.max(max, point.t), 0.01);
  const ttcLow = timed.reduce((min, point) => finite(point.ttc) ? Math.min(min, point.ttc) : min, 0);
  const ttcHigh = timed.reduce((max, point) => finite(point.ttc) ? Math.max(max, point.ttc) : max, finite(threshold) ? Math.max(5, threshold) : 5);
  const speedLow = timed.reduce((min, point) => finite(point.speed_kmh) ? Math.min(min, point.speed_kmh) : min, 0);
  const speedHigh = timed.reduce((max, point) => finite(point.speed_kmh) ? Math.max(max, point.speed_kmh) : max, 1);
  const x = (t: number) => L + t / tMax * (R - L);
  const yTtc = (value: number) => BOTTOM - (value - ttcLow) / (ttcHigh - ttcLow) * (BOTTOM - TOP);
  const ySpeed = (value: number) => BOTTOM - (value - speedLow) / (speedHigh - speedLow) * (BOTTOM - TOP);
  const segments = (field: "ttc" | "speed_kmh", y: (value: number) => number) => {
    const lines: string[][] = [];
    let line: string[] = [], last: number | null = null;
    for (const point of points) {
      const value = point[field];
      if (!finite(point.t) || point.t < 0 || !finite(value)) {
        if (line.length) lines.push(line);
        line = []; last = null; continue;
      }
      if (last !== null && point.t <= last) { if (line.length) lines.push(line); line = []; }
      line.push(`${x(point.t)},${y(value)}`); last = point.t;
    }
    if (line.length) lines.push(line);
    return lines;
  };
  const visibleMarkers = markers.filter(marker => finite(marker.t) && marker.t >= 0 && marker.t <= tMax);
  // Only mark the collision sample when this timestamp is actually present.
  const impactPoint = finite(impactT) ? timed.find(point => point.t === impactT && finite(point.speed_kmh)) : undefined;
  return <div className="space-y-3">
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="TTC nhận thức (s) và tốc độ xe (km/h) theo thời gian (s)">
      <title>TTC nhận thức (s), trục trái; tốc độ xe (km/h), trục phải; thời gian (s)</title>
      <text x={L} y={20} fontSize={11} fill="var(--color-vehicsim-muted)">TTC (s)</text>
      <text x={R} y={20} textAnchor="end" fontSize={11} fill="var(--color-vehicsim-decision)">Tốc độ (km/h)</text>
      {Array.from({ length: 6 }, (_, i) => {
        const ratio = i / 5, y = BOTTOM - ratio * (BOTTOM - TOP);
        return <g key={i}>
          <line x1={L} x2={R} y1={y} y2={y} stroke="var(--color-vehicsim-line)" />
          <text x={L - 10} y={y + 4} textAnchor="end" fontSize={11} fill="var(--color-vehicsim-muted)">{(ttcLow + ratio * (ttcHigh - ttcLow)).toFixed(1)}</text>
          <text x={R + 10} y={y + 4} fontSize={11} fill="var(--color-vehicsim-decision)">{(speedLow + ratio * (speedHigh - speedLow)).toFixed(1)}</text>
        </g>;
      })}
      {Array.from({ length: 5 }, (_, i) => <text key={i} x={x(tMax * i / 4)} y={322} textAnchor="middle" fontSize={11} fill="var(--color-vehicsim-muted)">{(tMax * i / 4).toFixed(2)} s</text>)}
      {shade && finite(shade[0]) && finite(shade[1]) && shade[1] > shade[0] && <rect x={x(shade[0])} y={TOP} width={x(shade[1]) - x(shade[0])} height={BOTTOM - TOP} fill="rgba(229,72,77,0.07)" />}
      {finite(threshold) && <line x1={L} x2={R} y1={yTtc(threshold)} y2={yTtc(threshold)} stroke="var(--color-vehicsim-amber)" strokeWidth={1.5} strokeDasharray="5 4"><title>Ngưỡng TTC cấu hình: {threshold} s</title></line>}
      {visibleMarkers.map((marker, i) => <line key={i} x1={x(marker.t)} x2={x(marker.t)} y1={TOP} y2={BOTTOM} stroke={marker.color} strokeDasharray="4 3"><title>{marker.label}: {marker.t} s</title></line>)}
      {([ ["ttc", yTtc, "var(--color-vehicsim-ink)"], ["speed_kmh", ySpeed, "var(--color-vehicsim-decision)"] ] as const).map(([field, y, color]) =>
        segments(field, y).map((line, i) => line.length === 1
          ? <circle key={`${field}-${i}`} data-signal={field} cx={Number(line[0].split(",")[0])} cy={Number(line[0].split(",")[1])} r={3} fill={color} />
          : <polyline key={`${field}-${i}`} data-signal={field} points={line.join(" ")} fill="none" stroke={color} strokeWidth={2} />))}
      {finite(cursor) && cursor >= 0 && cursor <= tMax && <line x1={x(cursor)} x2={x(cursor)} y1={TOP} y2={BOTTOM} stroke="var(--color-vehicsim-ink)" strokeWidth={2}><title>Thời gian đang xem: {cursor} s</title></line>}
      {impactPoint && finite(impactPoint.speed_kmh) && <circle cx={x(impactPoint.t)} cy={ySpeed(impactPoint.speed_kmh)} r={5} fill="var(--color-vehicsim-danger)" />}
    </svg>
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px]" aria-label="Mốc đã ghi trên biểu đồ">
      {visibleMarkers.map((marker, i) => <span key={i} style={{ color: marker.color }}><span>{marker.label}</span> · {marker.t.toFixed(2)} s</span>)}
    </div>
  </div>;
}
