"use client";

import React from "react";
import type { ODDCell } from "@/types";

interface FallbackScenarioThumbnailProps {
  odd?: ODDCell;
  title?: string;
  width?: number | string;
  height?: number | string;
}

/**
 * Modern Oceanic Blue Fallback Thumbnail for Scenarios without full spec.actors
 * Renders an aesthetic 2D road canvas vector with Ego car, Adversary actor, and Maneuver arrow
 */
export function FallbackScenarioThumbnail({
  odd,
  width = "100%",
  height = 160,
}: FallbackScenarioThumbnailProps) {
  const actorType = typeof odd?.actor_type === "string" ? odd.actor_type : (odd?.actor_type as { category?: string } | undefined)?.category || "car";
  const maneuver = typeof odd?.maneuver === "string" ? odd.maneuver : (odd?.maneuver as { category?: string } | undefined)?.category || "cut_in";

  // Calculate adversary position and icon type based on maneuver & actor_type
  const isCutIn = maneuver.includes("cut_in");
  const isBrake = maneuver.includes("brake");
  const isJaywalk = maneuver.includes("jaywalk") || actorType === "pedestrian";

  // Vehicle colors from Oceanic palette
  const ROAD_COLOR = "#001D39";
  const LANE_LINE_COLOR = "#49769F";
  const EGO_COLOR = "#0A4174";
  const ADV_COLOR = "#4E8EA2";
  const MANEUVER_COLOR = "#6EA2B3";

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#001D39] flex items-center justify-center">
      <svg
        width={width}
        height={height}
        viewBox="0 0 280 160"
        className="w-full h-full object-cover"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Road Surface */}
        <rect x="40" y="0" width="200" height="160" fill={ROAD_COLOR} />
        
        {/* Road Edges */}
        <line x1="40" y1="0" x2="40" y2="160" stroke="#7BBDE8" strokeWidth="2" opacity="0.6" />
        <line x1="240" y1="0" x2="240" y2="160" stroke="#7BBDE8" strokeWidth="2" opacity="0.6" />

        {/* Lane Dividers */}
        <line x1="106" y1="0" x2="106" y2="160" stroke={LANE_LINE_COLOR} strokeWidth="1.5" strokeDasharray="8 6" opacity="0.7" />
        <line x1="173" y1="0" x2="173" y2="160" stroke={LANE_LINE_COLOR} strokeWidth="1.5" strokeDasharray="8 6" opacity="0.7" />

        {/* Lane Labels */}
        <text x="73" y="18" fill="#BDD8E9" fontSize="8" fontWeight="bold" opacity="0.5" textAnchor="middle">LÀN 1</text>
        <text x="140" y="18" fill="#BDD8E9" fontSize="8" fontWeight="bold" opacity="0.5" textAnchor="middle">LÀN 2</text>
        <text x="206" y="18" fill="#BDD8E9" fontSize="8" fontWeight="bold" opacity="0.5" textAnchor="middle">LÀN 3</text>

        {/* Ego Vehicle (Lane 2 / Center) */}
        <g id="ego-car">
          <circle cx="140" cy="115" r="14" fill={EGO_COLOR} opacity="0.25" />
          <rect x="131" y="98" width="18" height="34" rx="4" fill={EGO_COLOR} stroke="#7BBDE8" strokeWidth="1.5" />
          <rect x="134" y="103" width="12" height="7" rx="1.5" fill="#7BBDE8" opacity="0.8" />
          <text x="140" y="142" fill="#7BBDE8" fontSize="8" fontWeight="bold" textAnchor="middle">EGO</text>
        </g>

        {/* Adversary Actor & Maneuver Vector */}
        {isJaywalk ? (
          /* Pedestrian Jaywalk Cross */
          <g id="pedestrian-adversary">
            <line x1="50" y1="65" x2="135" y2="65" stroke={MANEUVER_COLOR} strokeWidth="2" strokeDasharray="4 3" />
            <polygon points="135,61 143,65 135,69" fill={MANEUVER_COLOR} />
            <circle cx="85" cy="65" r="6" fill={ADV_COLOR} stroke="#BDD8E9" strokeWidth="1" />
            <text x="85" y="53" fill="#BDD8E9" fontSize="8" fontWeight="bold" textAnchor="middle">Nhiệm vụ: Sang đường</text>
          </g>
        ) : isCutIn ? (
          /* Cut In Maneuver (Lane 1 -> Lane 2) */
          <g id="cut-in-adversary">
            <path d="M 73 45 Q 73 70 135 85" fill="none" stroke={MANEUVER_COLOR} strokeWidth="2" strokeDasharray="4 3" />
            <polygon points="131,88 141,87 137,79" fill={MANEUVER_COLOR} />
            <rect x="64" y="32" width="18" height="30" rx="4" fill={ADV_COLOR} stroke="#BDD8E9" strokeWidth="1.5" />
            <text x="73" y="25" fill="#BDD8E9" fontSize="8" fontWeight="bold" textAnchor="middle">Xe phụ (Cut In)</text>
          </g>
        ) : isBrake ? (
          /* Sudden Brake Maneuver (In front of Ego) */
          <g id="sudden-brake-adversary">
            <line x1="140" y1="35" x2="140" y2="65" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 2" />
            <polygon points="136,65 140,73 144,65" fill="#ef4444" />
            <rect x="131" y="25" width="18" height="32" rx="4" fill={ADV_COLOR} stroke="#ef4444" strokeWidth="1.5" />
            <text x="140" y="18" fill="#ef4444" fontSize="8" fontWeight="bold" textAnchor="middle">Phanh Gấp</text>
          </g>
        ) : (
          /* Generic Lane Drift / Traffic */
          <g id="generic-adversary">
            <line x1="206" y1="35" x2="145" y2="75" stroke={MANEUVER_COLOR} strokeWidth="2" strokeDasharray="4 3" />
            <polygon points="142,70 142,79 150,76" fill={MANEUVER_COLOR} />
            <rect x="197" y="25" width="18" height="30" rx="4" fill={ADV_COLOR} stroke="#BDD8E9" strokeWidth="1.5" />
            <text x="206" y="18" fill="#BDD8E9" fontSize="8" fontWeight="bold" textAnchor="middle">Tác nhân {actorType}</text>
          </g>
        )}

        {/* Decorative Watermark Overlay */}
        <text x="272" y="152" fill="#7BBDE8" fontSize="7" fontWeight="bold" opacity="0.4" textAnchor="end">
          SCENARIO FORGE 2D
        </text>
      </svg>

      {/* Maneuver Pill Tag */}
      <div className="absolute bottom-2 left-2 bg-[#0A4174]/80 backdrop-blur-md border border-[#7BBDE8]/40 px-2.5 py-0.5 rounded-full text-[9px] font-bold text-white shadow-sm flex items-center gap-1">
        <span>⚡</span>
        <span>{maneuver.toUpperCase()}</span>
      </div>
    </div>
  );
}
