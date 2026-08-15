"use client";

import React, { useMemo } from "react";
import type { ActorSpec, ManeuverSpec, VehicleCategory, ODDCell } from "@/types";
import { sanitizeActors } from "@/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SVG2DRendererProps {
  actors: ActorSpec[];
  odd?: ODDCell;
  maneuvers?: ManeuverSpec[];
  width?: number | string;
  height?: number | string;
  className?: string;
  showLabels?: boolean;
}

// ---------------------------------------------------------------------------
// Constants & OpenSCENARIO 1-Based Lane Math
// ---------------------------------------------------------------------------

const LANE_WIDTH = 50; // px per lane
const S_SCALE = 4; // px per meter (longitudinal)
const PADDING = 50; // viewBox padding
const ROAD_COLOR = "#1e293b";
const LANE_LINE_COLOR = "#475569";
const EGO_COLOR = "#22d3ee";
const ACTOR_COLOR = "#f97316";
const MANEUVER_ARROW_COLOR = "#ef4444";

/**
 * `lane_offset` trong ScenarioSpec là **độ lệch tương đối so với làn của ego**
 * (âm = trái, dương = phải, 0 = cùng làn với ego), không phải số thứ tự làn.
 * Đây là ràng buộc của hợp đồng dữ liệu — bộ chuyển đổi dịch nó sang lane tương
 * đối của OpenSCENARIO, nên không được đổi nghĩa để tiện cho việc vẽ.
 *
 * Quy đổi sang số làn để vẽ là việc của riêng lớp hiển thị, và nó nằm ở đây:
 * đặt ego vào một làn tham chiếu rồi cộng offset vào.
 *
 * Ví dụ với egoLane = 2:  offset -1 -> làn 1,  offset 0 -> làn 2,  offset +1 -> làn 3.
 */
export function laneNumber(laneOffset: number, egoLane: number): number {
  return Math.max(1, egoLane + Math.round(laneOffset || 0));
}

/** Toạ độ X tâm của một làn (1-based). */
export function getLaneCenterX(lane: number): number {
  return (Math.max(1, Math.round(lane)) - 1) * LANE_WIDTH + LANE_WIDTH / 2;
}

/**
 * Làn của ego trên hình vẽ. Chọn sao cho chủ thể lệch trái nhất vẫn nằm trong
 * khung: offset -2 thì ego phải ở làn 3 mới còn chỗ vẽ bên trái.
 */
export function egoLaneFor(offsets: number[]): number {
  const mostLeft = Math.min(0, ...offsets.map((o) => Math.round(o || 0)));
  return 1 - mostLeft;
}

// ---------------------------------------------------------------------------
// Actor icon by category
// ---------------------------------------------------------------------------

function actorIcon(
  category: VehicleCategory,
  cx: number,
  cy: number,
  color: string,
  label: string,
  showLabels: boolean,
) {
  const size = category === "pedestrian" ? 8 : category === "motorcycle" || category === "bicycle" ? 10 : 14;

  return (
    <g key={label}>
      {/* Glow effect */}
      <circle cx={cx} cy={cy} r={size + 4} fill={color} opacity={0.15} />

      {category === "pedestrian" ? (
        <>
          <circle cx={cx} cy={cy - 4} r={4} fill={color} />
          <line x1={cx} y1={cy} x2={cx} y2={cy + 8} stroke={color} strokeWidth={2} />
          <line x1={cx - 4} y1={cy + 3} x2={cx + 4} y2={cy + 3} stroke={color} strokeWidth={2} />
        </>
      ) : category === "motorcycle" || category === "bicycle" ? (
        <>
          <ellipse cx={cx} cy={cy} rx={size / 2} ry={size} fill={color} opacity={0.9} />
          <line x1={cx} y1={cy - size} x2={cx} y2={cy + size} stroke={color} strokeWidth={1.5} />
        </>
      ) : (
        /* car / truck / bus */
        <rect
          x={cx - size / 2}
          y={cy - size}
          width={size}
          height={size * 2}
          rx={3}
          fill={color}
          opacity={0.9}
        />
      )}

      {showLabels && (
        <text
          x={cx}
          y={cy - size - 6}
          textAnchor="middle"
          fill={color}
          fontSize={9}
          fontWeight={600}
          fontFamily="Inter, system-ui, sans-serif"
        >
          {label}
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Maneuver arrow
// ---------------------------------------------------------------------------

/**
 * Mũi tên mô tả hành vi sắp xảy ra.
 *
 * `laneOffset` là làn của chính chủ thể, so với làn ego. Nó quyết định **chiều
 * ngang** của mũi tên, và đó là chỗ bản trước sai: `dx` bị gán cứng sang trái
 * cho mọi trường hợp. Một xe đứng ở làn trái (`lane_offset = -1`) tạt đầu thì
 * phải chạy sang **phải** để cắt vào làn ego; vẽ nó rẽ trái là vẽ một chiếc xe
 * đang tránh xa ego — ngược hẳn ý nghĩa kịch bản, và người xem preview để duyệt
 * sẽ thấy một thứ không phải thứ họ đang duyệt.
 */
function maneuverArrow(
  fromX: number,
  fromY: number,
  maneuverType: string,
  laneOffset: number,
  key: string,
) {
  // Hướng cắt vào làn ego: đứng bên trái ego thì cắt sang phải, và ngược lại.
  // Cùng làn với ego (offset 0) thì không có chiều ngang nào hợp lý — mặc định
  // sang trái cho khỏi vẽ đè lên chính nó.
  const towardEgo = laneOffset === 0 ? -1 : -Math.sign(laneOffset);
  let dx = 0;
  let dy = -30;

  switch (maneuverType) {
    case "cut_in":
      dx = towardEgo * LANE_WIDTH * 0.8;
      dy = -20;
      break;
    case "lane_drift":
      dx = towardEgo * LANE_WIDTH * 0.6;
      dy = -30;
      break;
    case "wrong_way":
      dx = 0;
      dy = 30;
      break;
    case "sudden_brake":
    case "stop_in_lane":
      dx = 0;
      dy = 5;
      break;
    case "jaywalk":
      // Người đi bộ băng NGANG đường, cũng đi về phía ego.
      dx = towardEgo * LANE_WIDTH * 0.8;
      dy = 0;
      break;
    default:
      dy = -25;
  }

  const toX = fromX + dx;
  const toY = fromY + dy;

  return (
    <g key={key}>
      <defs>
        <marker
          id={`arrowhead-${key}`}
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill={MANEUVER_ARROW_COLOR} />
        </marker>
      </defs>
      <line
        x1={fromX}
        y1={fromY}
        x2={toX}
        y2={toY}
        stroke={MANEUVER_ARROW_COLOR}
        strokeWidth={2}
        strokeDasharray="4 2"
        markerEnd={`url(#arrowhead-${key})`}
        opacity={0.85}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SVG2DRenderer({
  actors: rawActors,
  odd,
  maneuvers = [],
  width = "100%",
  height = 320,
  className = "",
  showLabels = true,
}: SVG2DRendererProps) {
  const actors = useMemo(() => sanitizeActors(rawActors, odd), [rawActors, odd]);

  // Làn tham chiếu của ego, đủ rộng để chủ thể lệch trái nhất vẫn hiện ra.
  const egoLane = useMemo(
    () => egoLaneFor(actors.map((a) => a.position?.lane_offset ?? 0)),
    [actors],
  );

  // Số làn cần vẽ (tối thiểu 2 làn cho ra hình con đường thật).
  const maxLane = useMemo(() => {
    if (actors.length === 0) return 2;
    const lanes = actors.map((a) => laneNumber(a.position?.lane_offset ?? 0, egoLane));
    return Math.max(2, ...lanes);
  }, [actors, egoLane]);

  // Determine longitudinal s-range for road length
  const sRange = useMemo(() => {
    if (actors.length === 0) return { min: -40, max: 40 };
    const ss = actors.map((a) => a.position?.s_offset_m || 0);
    return {
      min: Math.min(...ss) - 20,
      max: Math.max(...ss) + 20,
    };
  }, [actors]);

  // Auto-scale viewBox to fit all lanes, road, and legend
  const viewBox = useMemo(() => {
    const minX = -PADDING;
    const maxX = maxLane * LANE_WIDTH + PADDING + 90; // room for legend on right
    const ys = actors.length > 0 ? actors.map((a) => -a.position.s_offset_m * S_SCALE) : [-40, 40];

    const minY = Math.min(...ys) - PADDING;
    const maxY = Math.max(...ys) + PADDING;

    const w = Math.max(maxX - minX, 220);
    const h = Math.max(maxY - minY, 140);

    return `${minX} ${minY} ${w} ${h}`;
  }, [actors, maxLane]);

  const roadY = -sRange.max * S_SCALE - PADDING / 2;
  const roadHeight = (sRange.max - sRange.min) * S_SCALE + PADDING;

  // Map maneuver actor_name → actor for arrows
  const actorMap = useMemo(() => {
    const m = new Map<string, ActorSpec>();
    for (const a of actors) m.set(a.name, a);
    return m;
  }, [actors]);

  return (
    <svg
      viewBox={viewBox}
      width={width}
      height={height}
      className={className}
      style={{ background: "#0f172a", borderRadius: 12 }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Road surface */}
      <rect
        x={0}
        y={roadY}
        width={maxLane * LANE_WIDTH}
        height={roadHeight}
        fill={ROAD_COLOR}
        rx={4}
      />

      {/* Outer left border (solid line) */}
      <line
        x1={0}
        y1={roadY}
        x2={0}
        y2={roadY + roadHeight}
        stroke="#64748b"
        strokeWidth={3}
      />

      {/* Outer right border (solid line) */}
      <line
        x1={maxLane * LANE_WIDTH}
        y1={roadY}
        x2={maxLane * LANE_WIDTH}
        y2={roadY + roadHeight}
        stroke="#64748b"
        strokeWidth={3}
      />

      {/* Lane dividers (dashed lines separating lanes) */}
      {Array.from({ length: maxLane - 1 }, (_, i) => {
        const x = (i + 1) * LANE_WIDTH;
        return (
          <line
            key={`lane-divider-${i}`}
            x1={x}
            y1={roadY}
            x2={x}
            y2={roadY + roadHeight}
            stroke={LANE_LINE_COLOR}
            strokeWidth={1.5}
            strokeDasharray="8 6"
            opacity={0.7}
          />
        );
      })}

      {/* Lane Labels at top of road */}
      {Array.from({ length: maxLane }, (_, i) => {
        const laneX = i * LANE_WIDTH + LANE_WIDTH / 2;
        return (
          <text
            key={`lane-label-${i}`}
            x={laneX}
            y={roadY + 16}
            textAnchor="middle"
            fill="#64748b"
            fontSize={9}
            fontWeight={600}
            fontFamily="Inter, system-ui, sans-serif"
            opacity={0.7}
          >
            LÀN {i + 1}
          </text>
        );
      })}

      {/* Maneuver arrows */}
      {maneuvers.map((m, i) => {
        const actor = actorMap.get(m.actor_name);
        if (!actor) return null;
        const x = getLaneCenterX(laneNumber(actor.position.lane_offset, egoLane));
        const y = -actor.position.s_offset_m * S_SCALE;
        return maneuverArrow(x, y, m.maneuver, actor.position.lane_offset, `man-${i}`);
      })}

      {/* Actors */}
      {actors.map((actor) => {
        const x = getLaneCenterX(laneNumber(actor.position.lane_offset, egoLane));
        const y = -actor.position.s_offset_m * S_SCALE;
        const color = actor.is_ego ? EGO_COLOR : ACTOR_COLOR;
        return actorIcon(actor.category, x, y, color, actor.name, showLabels);
      })}

      {/* Legend */}
      <g transform={`translate(${maxLane * LANE_WIDTH + 15}, ${roadY + 20})`}>
        <rect x={0} y={0} width={8} height={8} rx={2} fill={EGO_COLOR} />
        <text x={14} y={7} fill="#94a3b8" fontSize={8} fontFamily="Inter, system-ui, sans-serif">
          Hero (Xe chính)
        </text>
        <rect x={0} y={14} width={8} height={8} rx={2} fill={ACTOR_COLOR} />
        <text x={14} y={21} fill="#94a3b8" fontSize={8} fontFamily="Inter, system-ui, sans-serif">
          Adversary (Xe phụ)
        </text>
        {maneuvers.length > 0 && (
          <>
            <line x1={0} y1={32} x2={8} y2={32} stroke={MANEUVER_ARROW_COLOR} strokeWidth={2} strokeDasharray="3 1" />
            <text x={14} y={35} fill="#94a3b8" fontSize={8} fontFamily="Inter, system-ui, sans-serif">
              Quỹ đạo hành vi
            </text>
          </>
        )}
      </g>
    </svg>
  );
}
