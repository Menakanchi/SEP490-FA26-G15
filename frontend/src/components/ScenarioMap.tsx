"use client";

/**
 * Bản đồ nhìn từ trên (bird's-eye) của một lần chạy — bố cục và màu theo khối
 * "Scenario map" của màn 02 Figma, nhưng vẽ từ dữ liệu thật của run.
 *
 * Hệ toạ độ simulator: ego chạy theo +x, tim làn ego ở y = 0, người đi bộ xuất
 * phát ở y âm (vỉa hè bên phải ego) và băng sang +y. Trên màn hình, làn ego nằm
 * nửa dưới mặt đường, người đi bộ đi từ vỉa hè dưới lên.
 */

import React from "react";

const W = 706;
const H = 280;
const ROAD_TOP = 98;
const ROAD_BOTTOM = 182;
const LANE_CENTER_Y = 161; // tim làn ego trên màn hình
const PX_PER_M_Y = 12;
const X_LEFT = 40;
const X_RIGHT = 676;

export interface MapLabel {
  x: number;
  y: number;
  text: string;
  color: string;
}

interface Props {
  crossingX: number;
  vehicleLengthM: number;
  vehicleWidthM: number;
  path: { t: number; x: number; ped_y: number }[];
  pedY: number[]; // y người đi bộ theo thời gian (để vẽ vệt đi)
  egoX: number; // vị trí mũi xe đang hiển thị
  pedYNow: number;
  aebX?: number | null;
  detectionX?: number | null;
  collision?: boolean;
  labels?: MapLabel[];
  pedestrianLabel?: string;
  egoLabel?: string;
  perceivedY?: number | null;
  showGroundTruth?: boolean;
  showPerception?: boolean;
  showTtcZone?: boolean;
  showTrajectories?: boolean;
  ttcZoneX?: [number, number] | null;
  height?: number;
  /** Màn 02 vẽ người đi bộ tím + khung perception xanh lá; màn 06 (Playback) đảo lại theo chú giải Figma. */
  groundTruthColor?: string;
  perceptionColor?: string;
  /** Màn 06 đặt nhãn ego phía trên mặt đường (như Figma) để chừa chỗ cho nhãn TTC zone bên dưới. */
  egoLabelAbove?: boolean;
}

export function ScenarioMap({
  crossingX,
  vehicleLengthM,
  vehicleWidthM,
  path,
  pedY,
  egoX,
  pedYNow,
  aebX,
  detectionX,
  collision,
  labels = [],
  pedestrianLabel,
  egoLabel,
  perceivedY,
  showGroundTruth = true,
  showPerception = true,
  showTtcZone = false,
  showTrajectories = true,
  ttcZoneX,
  height = H,
  groundTruthColor = "var(--color-vehicsim-perception)",
  perceptionColor = "var(--color-vehicsim-ok)",
  egoLabelAbove = false,
}: Props) {
  const xStart = Math.min(0, ...path.map((p) => p.x - vehicleLengthM));
  const xEnd = crossingX + 14;
  const sx = (x: number) => X_LEFT + ((x - xStart) / (xEnd - xStart)) * (X_RIGHT - X_LEFT);
  const sy = (y: number) => LANE_CENTER_Y - y * PX_PER_M_Y;
  const carLen = Math.max(24, (vehicleLengthM / (xEnd - xStart)) * (X_RIGHT - X_LEFT));
  const carWid = vehicleWidthM * PX_PER_M_Y;
  const px = sx(crossingX);

  const egoPts = path.map((p) => `${sx(p.x).toFixed(1)},${LANE_CENTER_Y}`);
  const aebIdx = aebX == null ? -1 : path.findIndex((p) => p.x >= aebX);
  const beforeAeb = aebIdx >= 0 ? egoPts.slice(0, aebIdx + 1) : egoPts;
  const afterAeb = aebIdx >= 0 ? egoPts.slice(aebIdx) : [];
  const pedMin = Math.min(...pedY, pedYNow);

  return (
    <div className="relative w-full overflow-hidden rounded-[16px] bg-vehicsim-soft" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {/* đường ngang/dọc nền */}
        <rect x={0} y={40} width={W} height={10} fill="var(--color-vehicsim-road)" />
        <rect x={0} y={232} width={W} height={10} fill="var(--color-vehicsim-road)" />
        <rect x={110} y={0} width={10} height={H} fill="var(--color-vehicsim-road)" />
        <rect x={586} y={0} width={10} height={H} fill="var(--color-vehicsim-road)" />
        {/* mặt đường 2 làn */}
        <rect x={0} y={ROAD_TOP} width={W} height={ROAD_BOTTOM - ROAD_TOP} fill="white" />
        {Array.from({ length: 21 }, (_, i) => (
          <rect key={i} x={10 + i * 34} y={139} width={18} height={2} fill="var(--color-vehicsim-lane)" />
        ))}
        {/* vạch sang đường tại điểm băng qua */}
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} x={px - 13} y={ROAD_TOP + 4 + i * 9} width={26} height={5} rx={1} fill="var(--color-vehicsim-zebra)" />
        ))}
        {/* hành lang TTC */}
        {showTtcZone && ttcZoneX && (
          <rect
            x={sx(ttcZoneX[0])}
            y={LANE_CENTER_Y - carWid / 2 - 4}
            width={Math.max(0, sx(ttcZoneX[1]) - sx(ttcZoneX[0]))}
            height={carWid + 8}
            fill="rgba(229,72,77,0.12)"
          />
        )}
        {/* quỹ đạo ego: xanh trước AEB, đỏ đứt nét sau AEB */}
        {showTrajectories && beforeAeb.length > 1 && (
          <polyline points={beforeAeb.join(" ")} fill="none" stroke="var(--color-vehicsim-decision)" strokeWidth={3} strokeLinecap="round" />
        )}
        {showTrajectories && afterAeb.length > 1 && (
          <polyline points={afterAeb.join(" ")} fill="none" stroke="var(--color-vehicsim-danger)" strokeWidth={3} strokeDasharray="6 5" />
        )}
        {/* vệt đi của người đi bộ */}
        {showTrajectories && showGroundTruth && (
          <line x1={px} x2={px} y1={sy(pedMin)} y2={sy(pedYNow)} stroke={groundTruthColor} strokeWidth={2.5} strokeDasharray="4 4" />
        )}
        {detectionX != null && <circle cx={sx(detectionX)} cy={LANE_CENTER_Y} r={5} fill="var(--color-vehicsim-perception)" />}
        {aebX != null && <circle cx={sx(aebX)} cy={LANE_CENTER_Y} r={5} fill="var(--color-vehicsim-decision)" />}
        {/* xe ego */}
        <rect
          x={sx(egoX) - carLen}
          y={LANE_CENTER_Y - carWid / 2}
          width={carLen}
          height={carWid}
          rx={6}
          fill="var(--color-vehicsim-ink)"
        />
        {/* người đi bộ: ground truth (chấm) và vị trí perception (khung đứt nét) */}
        {collision && <circle cx={px} cy={sy(pedYNow)} r={20} fill="rgba(229,72,77,0.18)" />}
        {showGroundTruth && (
          <circle cx={px} cy={sy(pedYNow)} r={7} fill={collision ? "var(--color-vehicsim-danger)" : groundTruthColor} stroke="white" strokeWidth={2} />
        )}
        {showPerception && perceivedY != null && (
          <rect x={px - 12} y={sy(perceivedY) - 12} width={24} height={24} rx={4} fill="none" stroke={perceptionColor} strokeWidth={2} strokeDasharray="3 2" />
        )}
      </svg>

      {/* cây trang trí (asset Figma) */}
      {[
        [170, 74],
        [437, 20],
        [646, 74],
        [211, 250],
        [626, 250],
        [40, 250],
      ].map(([x, y]) => (
        // eslint-disable-next-line @next/next/no-img-element -- asset SVG trang trí từ Figma
        <img key={`${x}-${y}`} alt="" src="/vehicsim/map-tree.svg" width={9} height={9} className="absolute size-[9px]" style={{ left: `${(x / W) * 100}%`, top: y * (height / H) }} />
      ))}

      {egoLabel && (
        <Pill x={sx(egoX) - carLen} y={egoLabelAbove ? ROAD_TOP - 30 : ROAD_BOTTOM + 8} color="var(--color-vehicsim-ink)" text={egoLabel} height={height} />
      )}
      {pedestrianLabel && <Pill x={px + 14} y={sy(pedYNow) - 30} color="var(--color-vehicsim-ink)" text={pedestrianLabel} height={height} />}
      {labels.map((l) => (
        <Pill key={l.text} x={sx(l.x)} y={l.y} color={l.color} text={l.text} height={height} />
      ))}
    </div>
  );
}

function Pill({ x, y, color, text, height }: { x: number; y: number; color: string; text: string; height: number }) {
  return (
    <span
      className="absolute whitespace-nowrap rounded-full bg-white px-[9px] py-1 text-[11px] font-semibold drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]"
      style={{ left: `${Math.min(86, Math.max(0, (x / W) * 100))}%`, top: y * (height / H), color }}
    >
      {text}
    </span>
  );
}
