"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { MotionTelemetryChart, MOTION_SIGNALS, type MotionSignal } from "@/components/MotionTelemetryChart";
import { ErrorNote, PillButton, runCode } from "@/components/VehicSimUi";
import { AnalysisBadge, AnalysisLoading, analysisError, analysisReturn } from "@/components/analysisUi";
import { PlaybackScene, PlaybackFacts } from "@/components/analysis/AnalysisPlaybackScene";
import { PlaybackTimeline, PlaybackEvents } from "@/components/analysis/AnalysisPlaybackTimeline";
import { PLAYBACK_LAYERS, PLAYBACK_SPEEDS, eventName, eventColor, playbackPresentation, type PlaybackLayer, type PlaybackSpeed } from "@/components/analysis/playbackPresentation";
import { finite } from "@/components/analysis/analysisRunData";
import styles from "@/components/analysis/AnalysisPlayback.module.css";
import { vehicsimApi } from "@/services/vehicsim";
import type { Frame, Playback, SimEvent } from "@/types/vehicsim";

const NO_FRAMES: Frame[] = [], NO_EVENTS: SimEvent[] = [];
type Result = { key: string; data: Playback | null; view: ReturnType<typeof playbackPresentation> | null; error: string | null };

export default function PlaybackPage() {
  const { runId } = useParams<{ runId: string }>();
  const params = useSearchParams();
  const returnTo = analysisReturn(params.get("returnTo"));
  const returnQuery = `returnTo=${encodeURIComponent(returnTo)}`;
  const signal = (MOTION_SIGNALS.some(item => item.key === params.get("signal")) ? params.get("signal") : "ego_accel_mps2") as MotionSignal;
  const [refresh, setRefresh] = useState(0);
  const requestKey = `${runId}:${refresh}`;
  const [result, setResult] = useState<Result | null>(null);
  const current = result?.key === requestKey ? result : null;
  const pb = current?.data ?? null;
  const view = current?.view;
  const error = current?.error ?? null;
  const loading = result?.key !== requestKey;
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(0.5);
  const [layers, setLayers] = useState<Set<PlaybackLayer>>(new Set(PLAYBACK_LAYERS));
  const last = useRef<number | null>(null);
  const frames = view?.frames ?? NO_FRAMES, events = view?.events ?? NO_EVENTS;
  const duration = view?.duration ?? 0;
  const frame = useMemo(() => frames.length && frames[0].t <= t + 1e-6 ? frameAt(frames, t) : null, [frames, t]);
  const activeEvent = useMemo(() => currentEvent(events, t), [events, t]);

  const replaceQuery = useCallback((values: Record<string, string | number>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) next.set(key, String(value));
    window.history.replaceState(null, "", `/analysis/failures/${runId}/playback?${next}`);
  }, [runId]);

  useEffect(() => {
    let active = true;
    vehicsimApi.playback(Number(runId)).then(data => {
      if (!active) return;
      const prepared = playbackPresentation(data);
      const query = new URLSearchParams(window.location.search);
      const rawTime = query.get("t"), requested = rawTime === null ? Number.NaN : Number(rawTime);
      const focus = finite(requested) ? requested : prepared.events.find(event => event.kind === "aeb_decision")?.t ?? prepared.duration;
      const rate = Number(query.get("rate"));
      setResult({ key: requestKey, data, view: prepared, error: null });
      setPlaying(false); setT(Math.max(0, Math.min(focus, prepared.duration)));
      setSpeed(PLAYBACK_SPEEDS.includes(rate as PlaybackSpeed) ? rate as PlaybackSpeed : 0.5);
    }).catch(err => { if (active) setResult({ key: requestKey, data: null, view: null, error: analysisError(err) }); });
    return () => { active = false; };
  }, [runId, requestKey]);

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

  // Store only paused positions; the animation clock never writes history every frame.
  useEffect(() => {
    if (pb && view?.durationValid && !playing) replaceQuery({ t });
  }, [pb, view, t, playing, replaceQuery]);

  const seek = useCallback((time: number) => {
    if (!finite(time)) return;
    setPlaying(false); setT(Math.max(0, Math.min(time, duration)));
  }, [duration]);
  const jump = useCallback((dir: 1 | -1) => {
    const times = events.map(event => event.t);
    const target = dir > 0 ? times.find(time => time > t + 1e-3) : [...times].reverse().find(time => time < t - 1e-3);
    if (target !== undefined) seek(target);
  }, [events, t, seek]);
  const toggle = (layer: PlaybackLayer) => setLayers(previous => {
    const next = new Set(previous); if (next.has(layer)) next.delete(layer); else next.add(layer); return next;
  });
  const path = useMemo(() => frames.filter(point => point.t <= t + 1e-6 && finite(point.ego_x) && finite(point.ped_y))
    .map(point => ({ t: point.t, x: point.ego_x, ped_y: point.ped_y })), [frames, t]);
  const xAt = (time: number | undefined) => {
    if (time === undefined || time > t || !frames.length || time < frames[0].t) return null;
    const x = frameAt(frames, time)?.ego_x; return finite(x) ? x : null;
  };
  // Match the actual recorded timestamp; missing projection values stay missing.
  const motion = frame ? pb?.motion_telemetry?.find(point => point.t === frame.t) : undefined;
  const related = pb?.related_runs?.find(run => run.config !== pb.config);
  const detailHref = `/analysis/failures/${runId}?section=telemetry&t=${t}&signal=${signal}&${returnQuery}`;
  const enabled = Boolean(view?.durationValid && frames.length);
  return <VehicSimPage step={4} title={`Phát lại · Lượt chạy ${runCode(Number(runId))}`}
    crumbs={[{ label: "Phân tích" }, { label: "Danh sách phân tích", href: returnTo }, { label: `Lượt chạy ${runCode(Number(runId))}`, href: detailHref }, { label: "Phát lại" }]}
    badges={pb && <><AnalysisBadge value={pb.status} />{pb.evaluation_valid !== false && <AnalysisBadge value={pb.outcome} />}{pb.failure_class && <AnalysisBadge value={pb.failure_class} />}</>}
    subtitle={pb ? `Nguồn API: ${pb.simulator ?? "Chưa có danh tính simulator"}. Phát lại khung đã ghi.` : "Đang đọc dữ liệu phát lại từ API."}
    actions={<>
      <PillButton disabled={!pb} title="Xuất OpenSCENARIO cùng cấu hình và seed của lượt này" onClick={() => {
        setActionError(null); void vehicsimApi.downloadRunXosc(Number(runId)).catch(err => setActionError({ id: runId, message: analysisError(err) }));
      }}>Tải .xosc</PillButton>
      {pb && <PillButton variant="dark" href={detailHref}>Xem phân tích run</PillButton>}
    </>}>
    <div><Link className="text-[13px] font-semibold text-vehicsim-decision" href={returnTo}>← Về danh sách đang xem</Link></div>
    <ErrorNote message={error ?? (actionError?.id === runId ? actionError.message : null)} />
    {error && <div><button className="analysis-button" onClick={() => setRefresh(value => value + 1)}>Thử tải lại</button></div>}
    {loading && <AnalysisLoading />}
    {pb && view && <>
      <section className={`analysis-panel ${styles.stack}`} aria-label="Nguồn dữ liệu playback">
        <dl className={styles.meta}><div><dt>Biến thể / seed</dt><dd>{pb.variant} · seed {pb.seed}</dd></div><div><dt>Cấu hình AEB</dt><dd>{pb.config}</dd></div><div><dt>Phương tiện</dt><dd>{pb.vehicle}</dd></div><div><dt>Khung / sự kiện hợp lệ</dt><dd>{frames.length} khung · {events.length} sự kiện</dd></div></dl>
        <p className={styles.source} data-carla={pb.simulator?.startsWith("carla")}>Cảnh dựng từ tọa độ API, không phải video cảm biến. Sự kiện và số đo dùng kết quả đã ghi; gia tốc/jerk có thể do lõi xử lý, không mặc định là IMU thô.
          {pb.simulator?.startsWith("carla") && " CARLA chưa hiệu chuẩn phanh; số liệu phục vụ quan sát/đối chiếu."}</p>
        {pb.evaluation_valid === false && <p role="status" className="analysis-caption">Dữ liệu run chưa đủ điều kiện để kết luận AEB. Playback chỉ hiển thị dữ liệu đã ghi.</p>}
        {!view.durationValid && <p role="status">Thời lượng từ API không hợp lệ. Chưa thể phát lại.</p>}
        {view.durationValid && !frames.length && <p role="status">Không có frame telemetry hợp lệ để phát lại.</p>}
        {view.invalidFrames > 0 && <p className="analysis-caption">{view.invalidFrames} khung có timestamp không hợp lệ hoặc nằm ngoài khoảng phát.</p>}
        {related && <div><PillButton href={`/analysis/failures/${related.run_id}/playback?${returnQuery}`}>Mở run liên quan · AEB {related.config}</PillButton><p className="analysis-caption mt-2">API xác nhận cùng biến thể. Cần đối chiếu seed, xe và simulator trước khi so sánh.</p></div>}
      </section>
      <div className={styles.layout}>
        <div className={styles.stack}>
          <PlaybackScene playback={pb} frame={frame} time={t} path={path} aebX={xAt(events.find(event => event.kind === "aeb_decision")?.t)} detectionX={xAt(events.find(event => event.kind === "detection")?.t)} events={events} layers={layers} onToggle={toggle} />
          <PlaybackTimeline duration={duration} time={t} frameTime={frame?.t} playing={playing} speed={speed} enabled={enabled} entries={view.entries} activeEvent={activeEvent}
            onSeek={seek} onJump={jump} onSpeed={rate => { setSpeed(rate); replaceQuery({ rate }); }} onPlayPause={() => {
              if (t >= duration - 1e-3) setT(0); setPlaying(previous => !previous);
            }} />
        </div>
        <div className={styles.stack}>
          <PlaybackFacts frame={frame} time={t} motion={motion} events={events} />
          <PlaybackEvents entries={view.entries} activeEvent={activeEvent} enabled={enabled} ignored={view.invalidEvents} onSeek={seek} />
        </div>
      </div>
      <MotionTelemetryChart points={pb.motion_telemetry ?? []} markers={events.map(event => ({ t: event.t, label: eventName(event), color: eventColor(event) }))} cursor={t}
        selectedField={signal} onFieldChange={signal => replaceQuery({ signal })} />
    </>}
  </VehicSimPage>;
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
