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
 * Calculates dead center X coordinate for OpenSCENARIO 1-based lane_offset (1, 2, 3...).
 * Lane 1: [0, LANE_WIDTH], center = 25px
 * Lane 2: [LANE_WIDTH, 2 * LANE_WIDTH], center = 75px
 * Lane k: [(k - 1) * LANE_WIDTH, k * LANE_WIDTH], center = (k - 1) * LANE_WIDTH + LANE_WIDTH / 2
 */
export function getLaneCenterX(laneOffset: number): number {
  const lane = Math.max(1, Math.round(laneOffset || 1));
  return (lane - 1) * LANE_WIDTH + LANE_WIDTH / 2;
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

function maneuverArrow(
  fromX: number,
  fromY: number,
  maneuverType: string,
  key: string,
) {
  let dx = 0;
  let dy = -30;

  switch (maneuverType) {
    case "cut_in":
      dx = -LANE_WIDTH * 0.8;
      dy = -20;
      break;
    case "lane_drift":
      dx = -LANE_WIDTH * 0.6;
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
      dx = LANE_WIDTH * 0.8;
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

  // Determine max lane count (minimum 2 lanes for realistic road background)
  const maxLane = useMemo(() => {
    if (actors.length === 0) return 2;
    const offsets = actors.map((a) => Math.max(1, Math.round(a.position?.lane_offset || 1)));
    return Math.max(2, ...offsets);
  }, [actors]);

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
        const x = getLaneCenterX(actor.position.lane_offset);
        const y = -actor.position.s_offset_m * S_SCALE;
        return maneuverArrow(x, y, m.maneuver, `man-${i}`);
      })}

      {/* Actors */}
      {actors.map((actor) => {
        const x = getLaneCenterX(actor.position.lane_offset);
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
