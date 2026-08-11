"use client";

import React, { useMemo } from "react";
import type { ActorSpec, ManeuverSpec, VehicleCategory } from "@/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SVG2DRendererProps {
  actors: ActorSpec[];
  maneuvers?: ManeuverSpec[];
  width?: number | string;
  height?: number | string;
  className?: string;
  showLabels?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANE_WIDTH = 40; // px per lane
const S_SCALE = 4; // px per meter (longitudinal)
const PADDING = 60; // viewBox padding
const ROAD_COLOR = "#1e293b";
const LANE_LINE_COLOR = "#475569";
const EGO_COLOR = "#22d3ee";
const ACTOR_COLOR = "#f97316";
const MANEUVER_ARROW_COLOR = "#ef4444";

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
        /* car / truck */
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
          y={cy - size - 8}
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
  // Arrow direction hints based on maneuver type
  let dx = 0;
  let dy = -30;

  switch (maneuverType) {
    case "cut_in":
      dx = -LANE_WIDTH;
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
      dx = LANE_WIDTH * 1.5;
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
        opacity={0.8}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SVG2DRenderer({
  actors,
  maneuvers = [],
  width = "100%",
  height = 320,
  className = "",
  showLabels = true,
}: SVG2DRendererProps) {
  // Auto-scale viewBox
  const viewBox = useMemo(() => {
    if (actors.length === 0) return "-100 -100 200 200";

    const xs = actors.map((a) => a.position.lane_offset * LANE_WIDTH);
    const ys = actors.map((a) => -a.position.s_offset_m * S_SCALE); // invert Y

    const minX = Math.min(...xs) - PADDING;
    const maxX = Math.max(...xs) + PADDING;
    const minY = Math.min(...ys) - PADDING;
    const maxY = Math.max(...ys) + PADDING;

    const w = Math.max(maxX - minX, 120);
    const h = Math.max(maxY - minY, 120);

    return `${minX} ${minY} ${w} ${h}`;
  }, [actors]);

  // Determine lane range for road drawing
  const laneRange = useMemo(() => {
    if (actors.length === 0) return { min: -1, max: 1 };
    const offsets = actors.map((a) => a.position.lane_offset);
    return {
      min: Math.min(...offsets) - 1,
      max: Math.max(...offsets) + 1,
    };
  }, [actors]);

  // Determine s range for road length
  const sRange = useMemo(() => {
    if (actors.length === 0) return { min: -50, max: 50 };
    const ss = actors.map((a) => a.position.s_offset_m);
    return {
      min: Math.min(...ss) - 20,
      max: Math.max(...ss) + 20,
    };
  }, [actors]);

  // Map maneuver actor_name → actor position for arrows
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
        x={laneRange.min * LANE_WIDTH - LANE_WIDTH / 2}
        y={-(-sRange.min * S_SCALE) - PADDING / 2}
        width={(laneRange.max - laneRange.min + 1) * LANE_WIDTH}
        height={(-sRange.min + sRange.max) * S_SCALE + PADDING}
        fill={ROAD_COLOR}
        rx={4}
      />

      {/* Lane dividers */}
      {Array.from(
        { length: laneRange.max - laneRange.min },
        (_, i) => {
          const x = (laneRange.min + i + 1) * LANE_WIDTH - LANE_WIDTH / 2;
          return (
            <line
              key={`lane-${i}`}
              x1={x}
              y1={-(-sRange.min * S_SCALE) - PADDING / 2}
              x2={x}
              y2={-(-sRange.min * S_SCALE) + (-sRange.min + sRange.max) * S_SCALE + PADDING / 2}
              stroke={LANE_LINE_COLOR}
              strokeWidth={1.5}
              strokeDasharray="8 6"
              opacity={0.6}
            />
          );
        },
      )}

      {/* Center line (dashed yellow) */}
      <line
        x1={-LANE_WIDTH / 2}
        y1={-(-sRange.min * S_SCALE) - PADDING / 2}
        x2={-LANE_WIDTH / 2}
        y2={-(-sRange.min * S_SCALE) + (-sRange.min + sRange.max) * S_SCALE + PADDING / 2}
        stroke="#eab308"
        strokeWidth={2}
        strokeDasharray="12 6"
        opacity={0.5}
      />

      {/* Direction arrow on road */}
      <text
        x={laneRange.min * LANE_WIDTH}
        y={0}
        textAnchor="middle"
        fill="#64748b"
        fontSize={16}
        opacity={0.4}
      >
        ▲
      </text>

      {/* Maneuver arrows */}
      {maneuvers.map((m, i) => {
        const actor = actorMap.get(m.actor_name);
        if (!actor) return null;
        const x = actor.position.lane_offset * LANE_WIDTH;
        const y = -actor.position.s_offset_m * S_SCALE;
        return maneuverArrow(x, y, m.maneuver, `man-${i}`);
      })}

      {/* Actors */}
      {actors.map((actor) => {
        const x = actor.position.lane_offset * LANE_WIDTH;
        const y = -actor.position.s_offset_m * S_SCALE;
        const color = actor.is_ego ? EGO_COLOR : ACTOR_COLOR;
        return actorIcon(actor.category, x, y, color, actor.name, showLabels);
      })}

      {/* Legend */}
      <g transform={`translate(${(laneRange.max + 1) * LANE_WIDTH + 10}, ${-(-sRange.min * S_SCALE)})`}>
        <rect x={0} y={0} width={8} height={8} rx={2} fill={EGO_COLOR} />
        <text x={14} y={7} fill="#94a3b8" fontSize={7} fontFamily="Inter, system-ui, sans-serif">
          Ego
        </text>
        <rect x={0} y={14} width={8} height={8} rx={2} fill={ACTOR_COLOR} />
        <text x={14} y={21} fill="#94a3b8" fontSize={7} fontFamily="Inter, system-ui, sans-serif">
          Actor
        </text>
        {maneuvers.length > 0 && (
          <>
            <line x1={0} y1={32} x2={8} y2={32} stroke={MANEUVER_ARROW_COLOR} strokeWidth={2} strokeDasharray="3 1" />
            <text x={14} y={35} fill="#94a3b8" fontSize={7} fontFamily="Inter, system-ui, sans-serif">
              Hành vi
            </text>
          </>
        )}
      </g>
    </svg>
  );
}
