"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { ScenarioMap } from "@/components/ScenarioMap";
import { ErrorNote, OutcomeBadge, PillButton, cx, runCode } from "@/components/VehicSimUi";
import { vi } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { FailureClass, Frame, Playback, SimEvent } from "@/types/vehicsim";

const SPEEDS = [0.25, 0.5, 1, 2] as const;
const VIEWS = ["Nhìn từ trên", "Camera bám đuôi", "Camera RGB", "LiDAR"] as const;
const LAYERS = ["Thực tế (GT)", "Nhận thức", "Vùng TTC", "Quỹ đạo"] as const;
type Layer = (typeof LAYERS)[number];

const EVENT_COLOR: Record<string, string> = {
  gt_start: "var(--color-vehicsim-ok)",
  detection: "var(--color-vehicsim-perception)",
  ttc_below: "var(--color-vehicsim-warn)",
  fcw: "var(--color-vehicsim-amber)",
  aeb_decision: "var(--color-vehicsim-decision)",
  brake_onset: "var(--color-vehicsim-decision)",
  gt_stop: "var(--color-vehicsim-faint)",
  collision: "var(--color-vehicsim-danger)",
  stopped: "var(--color-vehicsim-ok)",
};
const EVENT_SHORT: Record<string, string> = {
  gt_start: "GT vào",
  detection: "Phát hiện",
  fcw: "FCW",
  aeb_decision: "AEB",
  collision: "Va chạm",
  stopped: "Dừng",
};
const CLASS_SHORT: Record<FailureClass, string> = {
  PERCEPTION: "Nhận thức",
  DECISION: "Quyết định / thời điểm",
  CONTROL: "Điều khiển",
  VEHICLE_DYNAMICS: "Động lực học",
};

export default function PlaybackPage() {
  const { runId } = useParams<{ runId: string }>();
  const [pb, setPb] = useState<Playback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(0.5);
  const [layers, setLayers] = useState<Set<Layer>>(new Set(LAYERS));
  const last = useRef<number | null>(null);

  useEffect(() => {
    vehicsimApi.playback(Number(runId))
      .then((data) => {
        setPb(data);
        // Mở ở sự kiện AEB (hoặc cuối lần chạy) như ảnh chụp của Figma.
        const focus = data.events.find((e) => e.kind === "aeb_decision")?.t ?? data.duration_s;
        setT(focus);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được dữ liệu phát lại"));
  }, [runId]);

  const events = useMemo(() => (pb ? withTtcEvent(pb) : []), [pb]);
  const peakDecel = useMemo(() => (pb ? Math.max(0, ...pb.frames.filter((f) => f.aeb).map((f) => -f.ego_a)) : 0), [pb]);
  const frame = useMemo(() => (pb ? frameAt(pb.frames, t) : null), [pb, t]);

  useEffect(() => {
    if (!playing || !pb) return;
    let raf = 0;
    const step = (now: number) => {
      const prev = last.current ?? now;
      last.current = now;
      setT((cur) => {
        const next = cur + ((now - prev) / 1000) * speed;
        if (next >= pb.duration_s) {
          setPlaying(false);
          return pb.duration_s;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      last.current = null;
    };
  }, [playing, speed, pb]);

  const jump = useCallback(
    (dir: 1 | -1) => {
      const times = events.map((e) => e.t);
      const target = dir > 0 ? times.find((x) => x > t + 1e-3) : [...times].reverse().find((x) => x < t - 1e-3);
      if (target !== undefined) {
        setPlaying(false);
        setT(target);
      }
    },
    [events, t],
  );

  const toggle = (layer: Layer) =>
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });

  const code = runCode(Number(runId));
  const compareWith = pb?.related_runs.find((r) => r.config !== pb.config);
  const pathSoFar = pb ? pb.frames.filter((f) => f.t <= t + 1e-6).map((f) => ({ t: f.t, x: f.ego_x, ped_y: f.ped_y })) : [];
  const aebT = events.find((e) => e.kind === "aeb_decision")?.t;
  const detT = events.find((e) => e.kind === "detection")?.t;
  const xAt = (time: number | undefined) => (time === undefined || !pb || time > t ? null : frameAt(pb.frames, time)?.ego_x ?? null);
  const status = frame ? frameStatus(frame, t, events) : null;
  const distance = frame && pb ? Math.max(0, pb.crossing_x - frame.ego_x) : null;
  const ttcZone: [number, number] | null =
    frame && pb?.ttc_threshold_s ? [frame.ego_x, frame.ego_x + frame.ego_v * pb.ttc_threshold_s] : null;

  return (
    <VehicSimPage
      step={4}
      crumbs={[
        { label: "Phân tích" },
        { label: "Ca lỗi", href: "/analysis/failures" },
        { label: `Lượt chạy ${code}`, href: `/analysis/failures/${runId}` },
        { label: "Phát lại" },
      ]}
      title={`Phát lại · Lượt chạy ${code}`}
      badges={
        pb && (
          <>
            <span className="[&>span]:px-3 [&>span]:py-[6px] [&>span]:text-[13px]">
              <OutcomeBadge outcome={pb.outcome} />
            </span>
            {pb.failure_class && (
              <span className="inline-flex items-center gap-[6px] rounded-full bg-vehicsim-decision-bg px-3 py-[6px] text-[13px] font-semibold text-vehicsim-decision">
                <span className="size-[6px] rounded-full bg-current" />
                {CLASS_SHORT[pb.failure_class]}
              </span>
            )}
          </>
        )
      }
      subtitle="Phát lại ca lỗi từng khung hình. So sánh thực tế (ground truth) với những gì khâu nhận thức ghi nhận."
      actions={
        <>
          <PillButton
            title={`Xem lượt này trong cửa sổ CARLA (và quay video với --video): python worker/run_variant.py vehicsim-run-${runId}.json`}
            onClick={() => void vehicsimApi.downloadRunBundle(Number(runId)).catch((e) => setError(e.message))}
          >
            Tải JSON chạy CARLA
          </PillButton>
          <PillButton
            variant="dark"
            href={compareWith ? `/analysis/failures/${compareWith.run_id}/playback` : undefined}
            disabled={!compareWith}
            title={compareWith ? `Mở cùng biến thể chạy với AEB ${compareWith.config}` : "Chưa có lượt chạy nào khác của biến thể này"}
          >
            {compareWith ? `So sánh với ${compareWith.config}` : "So sánh"}
          </PillButton>
        </>
      }
    >
      <ErrorNote message={error} />
      {pb && frame && (
        <div className="flex w-full items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="flex w-full flex-col gap-[14px] rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1 rounded-full bg-vehicsim-soft p-1">
                  {VIEWS.map((v, i) => (
                    <span
                      key={v}
                      title={i === 0 ? undefined : "Cần cảm biến từ CARLA — chưa có với simulator động học"}
                      className={cx(
                        "whitespace-nowrap rounded-full px-3 py-[7px] text-[12px] font-semibold",
                        i === 0 ? "bg-vehicsim-ink text-white" : "cursor-not-allowed text-vehicsim-muted opacity-60",
                      )}
                    >
                      {v}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-[10px]">
                  {LAYERS.map((layer) => (
                    <button key={layer} type="button" onClick={() => toggle(layer)} className="flex items-center gap-[6px]">
                      <span
                        className={cx(
                          "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-[11px] font-bold text-white",
                          layers.has(layer) ? "bg-vehicsim-ink" : "border border-solid border-vehicsim-check bg-white",
                        )}
                      >
                        {layers.has(layer) ? "✓" : ""}
                      </span>
                      <span className="whitespace-nowrap text-[12px] font-medium text-vehicsim-muted">{layer}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <ScenarioMap
                  height={430}
                  crossingX={pb.crossing_x}
                  vehicleLengthM={pb.vehicle_length_m}
                  vehicleWidthM={pb.vehicle_width_m}
                  path={pathSoFar.length ? pathSoFar : [{ t: 0, x: pb.frames[0].ego_x, ped_y: pb.frames[0].ped_y }]}
                  pedY={pathSoFar.map((p) => p.ped_y)}
                  egoX={frame.ego_x}
                  pedYNow={frame.ped_y}
                  perceivedY={frame.perceived_y}
                  aebX={xAt(aebT)}
                  detectionX={xAt(detT)}
                  collision={t >= (events.find((e) => e.kind === "collision")?.t ?? Infinity)}
                  showGroundTruth={layers.has("Thực tế (GT)")}
                  showPerception={layers.has("Nhận thức")}
                  showTtcZone={layers.has("Vùng TTC")}
                  showTrajectories={layers.has("Quỹ đạo")}
                  ttcZoneX={ttcZone}
                  egoLabelAbove
                  groundTruthColor="var(--color-vehicsim-ok)"
                  perceptionColor="var(--color-vehicsim-perception)"
                  egoLabel={`Xe ${pb.vehicle} · ${(frame.ego_v * 3.6).toFixed(0)} km/h`}
                  labels={[
                    ...(layers.has("Nhận thức") && frame.detected
                      ? [{ x: pb.crossing_x - 4, y: 68, text: `người đi bộ · tin cậy ${frame.confidence.toFixed(2)}`, color: "var(--color-vehicsim-perception)" }]
                      : []),
                    ...(layers.has("Thực tế (GT)")
                      ? [{ x: pb.crossing_x + 1, y: 196, text: `GT · ${Math.abs(frame.ped_vy).toFixed(1)} m/s`, color: "var(--color-vehicsim-ok)" }]
                      : []),
                    ...(layers.has("Vùng TTC") && frame.ttc !== null
                      ? [{ x: frame.ego_x + 2, y: 196, text: `Vùng TTC · ${frame.ttc.toFixed(1)} s`, color: "var(--color-vehicsim-danger)" }]
                      : []),
                  ]}
                />
                <div className="absolute left-[14px] top-[14px] flex items-center gap-[14px] rounded-[12px] bg-white px-3 py-2 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
                  <LegendDash color="bg-vehicsim-ok" label="Thực tế (GT)" />
                  <LegendDash color="bg-vehicsim-perception" label="Nhận thức" />
                  <LegendDash color="bg-vehicsim-danger" label="Vùng TTC" />
                  <LegendDash color="bg-vehicsim-decision" label="Quỹ đạo xe" />
                </div>
              </div>
            </section>

            <section className="flex w-full flex-col gap-[14px] rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
              <div className="flex items-center gap-[14px]">
                <button
                  type="button"
                  aria-label={playing ? "Tạm dừng" : "Phát"}
                  onClick={() => {
                    if (t >= pb.duration_s - 1e-3) setT(0);
                    setPlaying((p) => !p);
                  }}
                  className="flex size-11 items-center justify-center rounded-[22px] bg-vehicsim-ink text-[14px] font-bold text-white"
                >
                  {playing ? "❚❚" : "▶"}
                </button>
                <PillButton className="px-[14px] py-2 text-[12px]" onClick={() => jump(-1)}>
                  ‹ Sự kiện trước
                </PillButton>
                <PillButton className="px-[14px] py-2 text-[12px]" onClick={() => jump(1)}>
                  Sự kiện sau ›
                </PillButton>
                <span className="flex-1 text-center text-[15px] font-bold text-vehicsim-ink">
                  {t.toFixed(2)} s / {pb.duration_s.toFixed(2)} s
                </span>
                <div className="flex gap-1 rounded-full bg-vehicsim-soft p-1">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      className={cx("rounded-full px-[14px] py-[7px] text-[12px] font-semibold", s === speed ? "bg-vehicsim-ink text-white" : "text-vehicsim-muted")}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
              <Timeline duration={pb.duration_s} t={t} events={events} onSeek={(x) => { setPlaying(false); setT(x); }} />
            </section>
          </div>

          <div className="flex w-[320px] shrink-0 flex-col gap-4">
            <section className="flex w-full flex-col gap-[10px] rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-bold text-vehicsim-ink">Tại t = {t.toFixed(2)} s</h2>
                {status && (
                  <span className={cx("rounded-full px-2 py-[3px] text-[11px] font-semibold", status.cls)}>{status.label}</span>
                )}
              </div>
              <Stat label="Tốc độ xe ego" value={`${(frame.ego_v * 3.6).toFixed(1)} km/h`} />
              <Stat label="Khoảng cách tới người đi bộ" value={distance === null ? "—" : `${distance.toFixed(1)} m`} />
              <Stat
                label="TTC"
                value={frame.ttc === null ? "—" : `${frame.ttc.toFixed(1)} s`}
                tone={frame.ttc !== null && pb.ttc_threshold_s !== null && frame.ttc <= pb.ttc_threshold_s ? "danger" : undefined}
              />
              <Stat
                label="Lệnh phanh"
                value={brakeText(frame, peakDecel)}
                tone={frame.aeb ? "info" : undefined}
              />
              <Stat label="Độ tin cậy phát hiện" value={frame.detected ? frame.confidence.toFixed(2) : "chưa phát hiện"} />
              <Stat
                label="Lệch vị trí GT – nhận thức"
                value={frame.perceived_y === null ? "—" : `Δ ${Math.abs(frame.perceived_y - frame.ped_y).toFixed(2)} m`}
              />
            </section>

            <section className="flex w-full flex-col gap-3 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
              <h2 className="text-[16px] font-bold text-vehicsim-ink">Nhật ký sự kiện</h2>
              {events.map((e) => {
                const current = currentEvent(events, t)?.label === e.label;
                return (
                  <button
                    key={`${e.kind}-${e.t}`}
                    type="button"
                    onClick={() => { setPlaying(false); setT(e.t); }}
                    className={cx("flex w-full items-center gap-[10px] rounded-[10px] px-[10px] py-[6px] text-left", current && "bg-vehicsim-soft")}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ background: EVENT_COLOR[e.kind] ?? "var(--color-vehicsim-faint)" }} />
                    <span className="text-[12px] font-bold text-vehicsim-ink">{e.t.toFixed(2)} s</span>
                    <span className="min-w-0 flex-1 text-[12px] font-medium text-vehicsim-muted">{vi(e.label)}</span>
                  </button>
                );
              })}
            </section>
          </div>
        </div>
      )}
    </VehicSimPage>
  );
}

function withTtcEvent(pb: Playback): SimEvent[] {
  const events = [...pb.events];
  const thr = pb.ttc_threshold_s;
  const below = thr === null ? undefined : pb.frames.find((f) => f.ttc !== null && f.ttc <= thr);
  if (below && thr !== null) events.push({ t: below.t, kind: "ttc_below", label: `TTC xuống dưới ${thr} s` });
  return events.sort((a, b) => a.t - b.t);
}

function frameAt(frames: Frame[], t: number): Frame | null {
  if (!frames.length) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t + 1e-6) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo];
}

function currentEvent(events: SimEvent[], t: number): SimEvent | undefined {
  return [...events].reverse().find((e) => e.t <= t + 1e-6);
}

function frameStatus(f: Frame, t: number, events: SimEvent[]) {
  const collision = events.find((e) => e.kind === "collision");
  if (collision && t >= collision.t - 1e-6) return { label: "VA CHẠM", cls: "bg-vehicsim-danger-bg text-vehicsim-danger" };
  if (f.aeb && f.ego_v < 0.05) return { label: "ĐÃ DỪNG", cls: "bg-vehicsim-ok-bg text-vehicsim-ok" };
  if (f.aeb) return { label: "AEB ĐANG PHANH", cls: "bg-vehicsim-decision-bg text-vehicsim-decision" };
  if (f.fcw) return { label: "CẢNH BÁO FCW", cls: "bg-vehicsim-warn-bg text-vehicsim-warn" };
  if (f.detected) return { label: "ĐANG BÁM", cls: "bg-vehicsim-perception-bg text-vehicsim-perception" };
  return { label: "ĐANG CHẠY", cls: "bg-vehicsim-soft text-vehicsim-muted" };
}

function Timeline({ duration, t, events, onSeek }: { duration: number; t: number; events: SimEvent[]; onSeek: (t: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = (x: number) => `${(Math.min(Math.max(x, 0), duration) / duration) * 100}%`;
  const labelled = events.filter((e) => EVENT_SHORT[e.kind] || e.kind === "ttc_below");
  // Sự kiện gần như cùng lúc (FCW + AEB + TTC↓) gộp thành một nhãn; các nhãn xen kẽ 2 hàng.
  const groups: { t: number; items: SimEvent[] }[] = [];
  for (const e of labelled) {
    const last = groups[groups.length - 1];
    if (last && e.t - last.t < duration * 0.03) last.items.push(e);
    else groups.push({ t: e.t, items: [e] });
  }
  return (
    <div
      ref={ref}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={t}
      tabIndex={0}
      onClick={(e) => {
        const box = ref.current?.getBoundingClientRect();
        if (box) onSeek(((e.clientX - box.left) / box.width) * duration);
      }}
      className="relative mx-6 h-16 cursor-pointer"
    >
      <div className="absolute left-0 right-0 top-10 h-[6px] rounded-[3px] bg-vehicsim-line" />
      <div className="absolute left-0 top-10 h-[6px] rounded-[3px] bg-vehicsim-ink" style={{ width: pct(t) }} />
      {labelled.map((e) => (
        <span
          key={`${e.kind}-${e.t}`}
          className="absolute top-[37px] size-3 -translate-x-1/2 rounded-full border-2 border-solid border-white"
          style={{ left: pct(e.t), background: EVENT_COLOR[e.kind] }}
        />
      ))}
      {groups.map((g, i) => (
        <span
          key={g.t}
          className="absolute flex -translate-x-1/2 gap-1 whitespace-nowrap text-[11px] font-semibold"
          style={{ left: pct(g.t), top: i % 2 ? 16 : 0 }}
        >
          {g.items.map((e, j) => (
            <span key={e.kind} style={{ color: EVENT_COLOR[e.kind] }}>
              {j > 0 && <span className="text-vehicsim-faint">· </span>}
              {e.kind === "ttc_below" ? "TTC↓" : EVENT_SHORT[e.kind]}
            </span>
          ))}
        </span>
      ))}
      <span className="absolute top-[34px] size-[18px] -translate-x-1/2 rounded-full border-[3px] border-solid border-vehicsim-ink bg-white" style={{ left: pct(t) }} />
    </div>
  );
}

/** Lệnh phanh: đang ramp thì hiện "hiện tại → mức đạt tối đa" như Figma (0 → 8.0 m/s²). */
function brakeText(f: Frame, peak: number): string {
  if (!f.aeb) return "0 m/s²";
  const cur = Math.max(0, -f.ego_a);
  return peak - cur > 0.05 ? `${cur.toFixed(1)} → ${peak.toFixed(1)} m/s²` : `${cur.toFixed(1)} m/s²`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "info" }) {
  return (
    <div className="flex items-start justify-between border-b border-solid border-vehicsim-line py-[7px] text-[13px]">
      <span className="font-medium text-vehicsim-muted">{label}</span>
      <span className={cx("font-bold", tone === "danger" ? "text-vehicsim-danger" : tone === "info" ? "text-vehicsim-decision" : "text-vehicsim-ink")}>{value}</span>
    </div>
  );
}

function LegendDash({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-[6px] text-[11px] font-medium text-vehicsim-muted">
      <span className={cx("h-1 w-3 rounded-[2px]", color)} />
      {label}
    </span>
  );
}
