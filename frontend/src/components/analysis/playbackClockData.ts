/** Display clock only. Frame coordinates, discrete flags and metrics are never generated here. */
export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2] as const;
export type PlaybackRate = typeof PLAYBACK_SPEEDS[number];
export type PlaybackClock = {
  key: string; time: number; start: number; end: number; canPlay: boolean;
  playing: boolean; speed: PlaybackRate; backgroundPaused: boolean;
};
export const initialPlaybackClock: PlaybackClock = {
  key: "", time: 0, start: 0, end: 0, canPlay: false, playing: false, speed: 0.5, backgroundPaused: false,
};
type Action =
  | { type: "load"; key: string; time: number; start: number; end: number; canPlay: boolean; speed: number }
  | { type: "toggle"; key: string }
  | { type: "seek"; key: string; time: number }
  | { type: "rate"; key: string; speed: number }
  | { type: "pause"; key: string; background?: boolean }
  | { type: "tick"; key: string; elapsed: number };
const finite = (value: number) => Number.isFinite(value);
const clamp = (time: number, end: number) => Math.max(0, Math.min(time, end));
const validRate = (speed: number): speed is PlaybackRate => PLAYBACK_SPEEDS.includes(speed as PlaybackRate);

export function playbackClockReducer(state: PlaybackClock, action: Action): PlaybackClock {
  if (action.type === "load") {
    const end = finite(action.end) && action.end >= 0 ? action.end : 0;
    const start = finite(action.start) ? clamp(action.start, end) : 0;
    return { key: action.key, time: finite(action.time) ? clamp(action.time, end) : start, start, end,
      canPlay: action.canPlay && end > start, playing: false, speed: validRate(action.speed) ? action.speed : 0.5,
      backgroundPaused: false };
  }
  if (action.key !== state.key) return state; // Ignore callbacks belonging to a previous run/refresh.
  switch (action.type) {
    case "toggle":
      if (!state.canPlay) return state;
      return { ...state, playing: !state.playing, backgroundPaused: false,
        time: !state.playing && (state.time >= state.end || state.time < state.start) ? state.start : state.time };
    case "seek":
      return finite(action.time) ? { ...state, time: clamp(action.time, state.end), playing: false, backgroundPaused: false } : state;
    case "rate":
      return validRate(action.speed) ? { ...state, speed: action.speed } : state;
    case "pause":
      return state.playing ? { ...state, playing: false, backgroundPaused: Boolean(action.background) } : state;
    case "tick": {
      if (!state.playing || !finite(action.elapsed) || action.elapsed < 0) return state;
      const time = Math.min(state.end, state.time + action.elapsed * state.speed);
      return { ...state, time, playing: time < state.end };
    }
  }
}

/** Upper bound on a prepared, timestamp-sorted source; no rounding, epsilon or interpolation. */
export function playbackIndexAt<T extends { t: number }>(points: readonly T[], time: number) {
  if (!finite(time)) return -1;
  let lo = 0, hi = points.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (points[mid].t <= time) lo = mid + 1; else hi = mid; }
  return lo - 1;
}
