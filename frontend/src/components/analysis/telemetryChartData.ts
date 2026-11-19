/** Display-only preparation. Never sort/mutate the source trace or calculate AEB metrics. */
export const finiteTime = (t: unknown): t is number => typeof t === "number" && Number.isFinite(t) && t >= 0;
export const CHART_LEFT = 62, CHART_RIGHT = 644;
export type ChartSample = { t: number; value: number | null };
export type ChartSeriesData = ReturnType<typeof prepareChartSeries>;

export function prepareChartSeries<T extends { t: number }>(points: readonly T[], read: (point: T) => unknown,
  end: number, nominalStep?: number, nonNegative = false) {
  const maxGap = typeof nominalStep === "number" && Number.isFinite(nominalStep) && nominalStep > 0
    ? nominalStep * 1.5 + 0.001 : null;
  const samples: ChartSample[] = [], segments: ChartSample[][] = [];
  const quality = { invalidTime: 0, outside: 0, nonIncreasing: 0, invalidValue: 0, missing: 0, gaps: 0 };
  let line: ChartSample[] = [], previous: number | null = null;
  let low = 0, high = 0, count = 0;
  const flush = () => { if (line.length) segments.push(line); line = []; };
  for (const point of points) {
    if (!finiteTime(point.t)) { quality.invalidTime++; flush(); previous = null; continue; }
    if (point.t > end) { quality.outside++; flush(); previous = null; continue; }
    if (previous !== null && point.t <= previous) { quality.nonIncreasing++; flush(); }
    previous = point.t;
    const raw = read(point);
    const valid = typeof raw === "number" && Number.isFinite(raw) && (!nonNegative || raw >= 0);
    if (!valid) {
      if (raw == null) quality.missing++; else quality.invalidValue++;
      samples.push({ t: point.t, value: null }); flush(); continue;
    }
    const sample = { t: point.t, value: raw };
    samples.push(sample); count++; low = Math.min(low, raw); high = Math.max(high, raw);
    if (line.length && (maxGap === null || point.t - line[line.length - 1].t > maxGap + 1e-9)) {
      if (maxGap !== null) quality.gaps++;
      flush();
    }
    line.push(sample);
  }
  flush();
  // Separate lookup index only: paths retain recorded order, including discontinuities.
  samples.sort((a, b) => a.t - b.t);
  return { samples, segments, quality, low, high, count, maxGap };
}

/** Closest recorded timestamp (earlier on a tie); no extrapolation outside this source. */
export function nearestChartSample(samples: readonly ChartSample[], time: number | null | undefined) {
  if (!finiteTime(time) || !samples.length || time < samples[0].t || time > samples[samples.length - 1].t) return null;
  let lo = 0, hi = samples.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (samples[mid].t < time) lo = mid + 1; else hi = mid; }
  if (lo === 0) return samples[0];
  return time - samples[lo - 1].t <= samples[lo].t - time ? samples[lo - 1] : samples[lo];
}

export function chartEnd(points: readonly { t: number }[], supplied?: number) {
  if (finiteTime(supplied)) return supplied > 0 ? supplied : 0.01;
  return points.reduce((max, point) => finiteTime(point.t) ? Math.max(max, point.t) : max, 0.01);
}
