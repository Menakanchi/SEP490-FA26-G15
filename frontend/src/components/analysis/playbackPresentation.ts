import type { Frame, Playback, SimEvent } from "@/types/vehicsim";
import { vi } from "@/components/vehicsimI18n";
import { finite } from "./analysisRunData";

export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2] as const;
export const PLAYBACK_LAYERS = ["Thực tế (GT)", "Nhận thức", "Quỹ đạo"] as const;
export type PlaybackLayer = typeof PLAYBACK_LAYERS[number];
export type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];
export type PlaybackEvent = { id: number; record: SimEvent };
export const EVENT_COLOR: Record<string, string> = {
  gt_start: "var(--color-vehicsim-ok)", detection: "var(--color-vehicsim-perception)",
  ttc_below: "var(--color-vehicsim-warn)", fcw: "var(--color-vehicsim-amber)",
  aeb_decision: "var(--color-vehicsim-decision)", brake_onset: "var(--color-vehicsim-decision)",
  gt_stop: "var(--color-vehicsim-faint)", collision: "var(--color-vehicsim-danger)", stopped: "var(--color-vehicsim-ok)",
};
export const eventName = (event: SimEvent) => vi(event.label || event.kind || "Sự kiện đã ghi");
export const eventColor = (event: SimEvent) => EVENT_COLOR[event.kind] ?? "var(--color-vehicsim-muted)";

/** Validate display timestamps only; preserve the recorded field values and event identity. */
export function playbackPresentation(data: Playback) {
  const durationValid = finite(data.duration_s) && data.duration_s >= 0;
  const duration = durationValid ? data.duration_s : 0;
  const rawFrames = Array.isArray(data.frames) ? data.frames : [];
  const rawEvents = Array.isArray(data.events) ? data.events : [];
  const frames = rawFrames.filter(frame => durationValid && finite(frame.t) && frame.t >= 0 && frame.t <= duration).sort((a, b) => a.t - b.t);
  const entries: PlaybackEvent[] = rawEvents.map((record, id) => ({ id, record }))
    .filter(({ record }) => durationValid && finite(record.t) && record.t >= 0 && record.t <= duration)
    .sort((a, b) => a.record.t - b.record.t);
  return { durationValid, duration, frames, entries, events: entries.map(entry => entry.record),
    invalidFrames: rawFrames.length - frames.length, invalidEvents: rawEvents.length - entries.length };
}

// Existing recorded-flag/event priority; no inference from speed, acceleration or TTC.
export function frameStatus(f: Frame, t: number, events: SimEvent[]) {
  const collision = events.find((e) => e.kind === "collision");
  if (collision && t >= collision.t - 1e-6) return { label: "VA CHẠM", cls: "bg-vehicsim-danger-bg text-vehicsim-danger" };
  const stopped = events.find(e => e.kind === "stopped");
  if (stopped && t >= stopped.t - 1e-6) return { label: "ĐÃ DỪNG", cls: "bg-vehicsim-ok-bg text-vehicsim-ok" };
  if (f.aeb) return { label: "AEB ĐANG PHANH", cls: "bg-vehicsim-decision-bg text-vehicsim-decision" };
  if (f.fcw) return { label: "CẢNH BÁO FCW", cls: "bg-vehicsim-warn-bg text-vehicsim-warn" };
  if (f.detected) return { label: "ĐANG BÁM", cls: "bg-vehicsim-perception-bg text-vehicsim-perception" };
  return { label: "CHƯA CÓ CỜ AEB/FCW", cls: "bg-vehicsim-soft text-vehicsim-muted" };
}
