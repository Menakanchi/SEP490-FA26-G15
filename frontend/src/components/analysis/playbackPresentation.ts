import type { Frame, Playback, SimEvent } from "@/types/vehicsim";
import { vi } from "@/components/vehicsimI18n";
import { finite } from "./analysisRunData";
import { PLAYBACK_SPEEDS } from "./playbackClockData";

export { PLAYBACK_SPEEDS };
export const PLAYBACK_LAYERS = ["GT mô phỏng", "Nhận thức", "Quỹ đạo"] as const;
export type PlaybackLayer = typeof PLAYBACK_LAYERS[number];
export type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];
export type PlaybackEvent = { id: number; record: SimEvent };
export const EVENT_COLOR: Record<string, string> = {
  gt_start: "var(--color-vehicsim-ok)", detection: "var(--color-vehicsim-perception)",
  ttc_below: "var(--color-vehicsim-warn)", fcw: "var(--color-vehicsim-amber)",
  aeb_decision: "var(--color-vehicsim-decision)", brake_onset: "var(--color-vehicsim-decision)",
  gt_stop: "var(--color-vehicsim-faint)", collision: "var(--color-vehicsim-danger)", stopped: "var(--color-vehicsim-ok)",
};
export type PlaybackAebMode = Playback["aeb_mode"];
export const eventName = (event: SimEvent, mode?: PlaybackAebMode) => {
  if (event.kind === "aeb_decision") {
    if (mode === "OFF") return "Tín hiệu AEB giả lập (không tác động phanh)";
    if (mode !== "ON") return "Tín hiệu AEB đã ghi (chưa rõ chế độ AEB)";
    return "Quyết định AEB";
  }
  if (event.kind === "brake_onset") {
    if (mode === "OFF") return "Mốc phanh đã ghi (AEB tắt; chưa rõ nguồn)";
    if (mode !== "ON") return "Mốc phanh đã ghi (chưa rõ chế độ AEB)";
    return "Bắt đầu lệnh phanh";
  }
  if (event.kind === "fcw" && mode === "OFF") return "Mốc FCW tính toán (shadow)";
  if (event.kind === "fcw" && mode !== "ON") return "Tín hiệu FCW đã ghi (chưa xác nhận chế độ)";
  return vi(event.label || event.kind || "Sự kiện đã ghi");
};
export const eventColor = (event: SimEvent) => EVENT_COLOR[event.kind] ?? "var(--color-vehicsim-muted)";

/** Validate display timestamps only; preserve the recorded field values and event identity. */
export function playbackPresentation(data: Playback) {
  const durationValid = finite(data.duration_s) && data.duration_s >= 0;
  const duration = durationValid ? data.duration_s : 0;
  const rawFrames = Array.isArray(data.frames) ? data.frames : [];
  const rawEvents = Array.isArray(data.events) ? data.events : [];
  const frames = rawFrames.filter(frame => frame && durationValid && finite(frame.t) && frame.t >= 0 && frame.t <= duration).sort((a, b) => a.t - b.t);
  const entries: PlaybackEvent[] = rawEvents.map((record, id) => ({ id, record }))
    .filter(({ record }) => record && durationValid && finite(record.t) && record.t >= 0 && record.t <= duration)
    .sort((a, b) => a.record.t - b.record.t);
  const seen = new Set<number>(), ambiguousTimes = new Set<number>();
  let duplicateFrames = 0, backwardFrames = 0, previous: number | null = null;
  for (const frame of rawFrames) {
    if (!frame || !durationValid || !finite(frame.t) || frame.t < 0 || frame.t > duration) continue;
    if (seen.has(frame.t)) { duplicateFrames++; ambiguousTimes.add(frame.t); }
    if (previous !== null && frame.t < previous) backwardFrames++;
    seen.add(frame.t); previous = frame.t;
  }
  return { durationValid, duration, frames, entries, events: entries.map(entry => entry.record), ambiguousTimes,
    duplicateFrames, backwardFrames, canPlay: seen.size >= 2,
    invalidFrames: rawFrames.length - frames.length, invalidEvents: rawEvents.length - entries.length };
}

// Existing recorded-flag/event priority; no inference from speed, acceleration or TTC.
export function frameStatus(f: Frame, t: number, events: SimEvent[], mode?: PlaybackAebMode) {
  const collision = events.find((e) => e.kind === "collision");
  if (collision && t >= collision.t) return { label: "VA CHẠM", cls: "bg-vehicsim-danger-bg text-vehicsim-danger" };
  const stopped = events.find(e => e.kind === "stopped");
  if (stopped && t >= stopped.t) return { label: "ĐÃ DỪNG", cls: "bg-vehicsim-ok-bg text-vehicsim-ok" };
  if (mode === "OFF") return { label: "AEB TẮT", cls: "bg-vehicsim-soft text-vehicsim-muted" };
  if (f.aeb && mode === "ON") return { label: "AEB ĐÃ RA QUYẾT ĐỊNH", cls: "bg-vehicsim-decision-bg text-vehicsim-decision" };
  if (f.aeb) return { label: "TÍN HIỆU AEB · CHƯA RÕ CHẾ ĐỘ", cls: "bg-vehicsim-soft text-vehicsim-muted" };
  if (f.fcw && mode === "ON") return { label: "CẢNH BÁO FCW", cls: "bg-vehicsim-warn-bg text-vehicsim-warn" };
  if (f.fcw) return { label: "TÍN HIỆU FCW · CHƯA RÕ CHẾ ĐỘ", cls: "bg-vehicsim-soft text-vehicsim-muted" };
  if (f.detected) return { label: "ĐANG BÁM", cls: "bg-vehicsim-perception-bg text-vehicsim-perception" };
  return { label: "CHƯA CÓ CỜ AEB/FCW", cls: "bg-vehicsim-soft text-vehicsim-muted" };
}
