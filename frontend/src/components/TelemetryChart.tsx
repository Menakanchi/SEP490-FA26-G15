"use client";

/**
 * Biểu đồ telemetry của màn 02: TTC (đen, trục trái), tốc độ (xanh, trục phải),
 * ngưỡng TTC (cam đứt nét), các mốc sự kiện dọc và vùng trễ kích hoạt tô đỏ nhạt.
 * Toạ độ và màu theo khối "Chart" của Figma (646 × 266 trong khung 706 × 330).
 */

import React from "react";

const W = 706;
const H = 330;
const L = 62;
const R = 680;
const TOP = 34;
const BOTTOM = 300;

export interface ChartMarker {
  t: number;
  label: string;
  color: string;
}

interface Props {
  cursor?: number;
  points: { t: number; ttc: number | null; speed_kmh: number | null }[];
  threshold: number | null;
  markers: ChartMarker[];
  shade?: [number, number] | null;
  impactT?: number | null;
}

export function TelemetryChart({ points, threshold, markers, shade, impactT, cursor }: Props) {
  const tMax = Math.max(0.01, points[points.length - 1]?.t ?? 1);
  const ttcMax = 5;
  const vMax = Math.max(70, Math.ceil(Math.max(...points.map((p) => p.speed_kmh ?? 0), 0) / 14) * 14);
  const x = (t: number) => L + (t / tMax) * (R - L);
  const yTtc = (v: number) => BOTTOM - (Math.min(v, ttcMax) / ttcMax) * (BOTTOM - TOP);
  const ySpd = (v: number) => BOTTOM - (v / vMax) * (BOTTOM - TOP);

  const ttcSegments: string[][] = [];
  let current: string[] = [];
  for (const p of points) {
    if (p.ttc === null) {
      if (current.length) ttcSegments.push(current);
      current = [];
    } else current.push(`${x(p.t).toFixed(1)},${yTtc(p.ttc).toFixed(1)}`);
  }
  if (current.length) ttcSegments.push(current);
  const speedSegments: string[][]=[];
  let speedSegment:string[]=[];
  for(const p of points) {
    if(p.speed_kmh===null) { if(speedSegment.length)speedSegments.push(speedSegment);speedSegment=[]; }
    else speedSegment.push(`${x(p.t)},${ySpd(p.speed_kmh)}`);
  }
  if(speedSegment.length)speedSegments.push(speedSegment);
  const ticks = Array.from({ length: 5 }, (_, i) => tMax * i / 4);
  const impactPoint = impactT != null ? points.find((p) => p.t >= impactT - 1e-6) : undefined;

  return (
    <div className="relative h-[330px] w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="Telemetry chart">
        {[0, 1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <rect x={L} y={yTtc(v)} width={R - L} height={1} fill="var(--color-vehicsim-line)" />
            <text x={18} y={yTtc(v) + 4} fontSize={11} fontWeight={500} fill="var(--color-vehicsim-faint)">
              {v}
            </text>
            <text x={690} y={yTtc(v) + 4} fontSize={11} fontWeight={500} fill="var(--color-vehicsim-decision)">
              {Math.round((vMax * v) / 5)}
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t} x={x(t) - 8} y={322} fontSize={11} fontWeight={500} fill="var(--color-vehicsim-faint)">
            {`${t.toFixed(2)}s`}
          </text>
        ))}
        {shade && shade[1] > shade[0] && (
          <rect x={x(shade[0])} y={TOP} width={x(shade[1]) - x(shade[0])} height={BOTTOM - TOP} fill="rgba(229,72,77,0.07)" />
        )}
        {threshold !== null && (
          <line x1={L} x2={R} y1={yTtc(threshold)} y2={yTtc(threshold)} stroke="var(--color-vehicsim-amber)" strokeWidth={1.5} strokeDasharray="5 4" />
        )}
        {markers.map((m) => (
          <line key={m.label} x1={x(m.t)} x2={x(m.t)} y1={TOP - 6} y2={BOTTOM} stroke={m.color} strokeWidth={1.2} strokeDasharray="4 3" />
        ))}
        {ttcSegments.map((seg, i) =>
          seg.length > 1 ? <polyline key={i} points={seg.join(" ")} fill="none" stroke="var(--color-vehicsim-ink)" strokeWidth={2} /> : null,
        )}
        {speedSegments.map((segment,index)=><polyline key={index} points={segment.join(" ")} fill="none" stroke="var(--color-vehicsim-decision)" strokeWidth={2.5} />)}
        {cursor !== undefined && <line x1={x(cursor)} x2={x(cursor)} y1={TOP} y2={BOTTOM} stroke="var(--color-vehicsim-ink)" strokeWidth={2}/>}
        {impactPoint?.speed_kmh != null && <circle cx={x(impactPoint.t)} cy={ySpd(impactPoint.speed_kmh)} r={5} fill="var(--color-vehicsim-danger)" />}
      </svg>
      {markers.map((m) => (
        <span
          key={m.label}
          className="absolute -translate-x-1/2 whitespace-nowrap rounded-full border border-solid border-vehicsim-line bg-white px-[7px] py-[3px] text-[10px] font-semibold"
          style={{ left: `${(x(m.t) / W) * 100}%`, top: 4, color: m.color }}
        >
          {m.label}
        </span>
      ))}
    </div>
  );
}
