"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { MotionTelemetryChart, MOTION_SIGNALS, type MotionSignal } from "@/components/MotionTelemetryChart";
import { ErrorNote, PillButton, runCode } from "@/components/VehicSimUi";
import { AnalysisBadge, AnalysisLoading, analysisError, analysisReturn, analysisRunId } from "@/components/analysisUi";
import { PlaybackScene, PlaybackFacts } from "@/components/analysis/AnalysisPlaybackScene";
import { PlaybackTimeline, PlaybackEvents } from "@/components/analysis/AnalysisPlaybackTimeline";
import { PLAYBACK_LAYERS, eventName, eventColor, playbackPresentation, type PlaybackLayer } from "@/components/analysis/playbackPresentation";
import { finite } from "@/components/analysis/analysisRunData";
import { initialPlaybackClock, playbackClockReducer, playbackIndexAt } from "@/components/analysis/playbackClockData";
import styles from "@/components/analysis/AnalysisPlayback.module.css";
import { vehicsimApi } from "@/services/vehicsim";
import type { Frame, MotionTelemetryPoint, Playback, SimEvent } from "@/types/vehicsim";

const NO_FRAMES: Frame[] = [], NO_EVENTS: SimEvent[] = [];
type Result = { key: string; data: Playback | null; view: ReturnType<typeof playbackPresentation> | null; error: string | null };

export default function PlaybackPage() {
  const { runId } = useParams<{ runId: string }>();
  const validId = analysisRunId(runId);
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
  const error = validId === null ? "Mã lượt chạy không hợp lệ." : current?.error ?? null;
  const loading = validId !== null && result?.key !== requestKey;
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [clock, dispatch] = useReducer(playbackClockReducer, initialPlaybackClock);
  const t = clock.key === requestKey ? clock.time : 0;
  const playing = clock.key === requestKey && clock.playing;
  const speed = clock.key === requestKey ? clock.speed : 0.5;
  const [layers, setLayers] = useState<Set<PlaybackLayer>>(new Set(PLAYBACK_LAYERS));
  const frames = view?.frames ?? NO_FRAMES, events = view?.events ?? NO_EVENTS;
  const duration = view?.duration ?? 0;
  const frameIndex = useMemo(() => playbackIndexAt(frames, t), [frames, t]);
  const frame = frames[frameIndex] ?? null;
  const activeEvent = events[playbackIndexAt(events, t)];

  const replaceQuery = useCallback((values: Record<string, string | number>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) next.set(key, String(value));
    window.history.replaceState(null, "", `/analysis/failures/${runId}/playback?${next}`);
  }, [runId]);

  useEffect(() => {
    if (validId === null) return;
    let active = true;
    vehicsimApi.playback(validId).then(data => {
      if (!active) return;
      const prepared = playbackPresentation(data);
      const query = new URLSearchParams(window.location.search);
      const rawTime = query.get("t"), requested = rawTime === null ? Number.NaN : Number(rawTime);
      const focus = finite(requested) ? requested : prepared.events.find(event => event.kind === "aeb_decision")?.t ?? prepared.duration;
      const rate = Number(query.get("rate"));
      setResult({ key: requestKey, data, view: prepared, error: null });
      dispatch({ type: "load", key: requestKey, time: focus, start: prepared.frames[0]?.t ?? 0,
        end: prepared.duration, canPlay: prepared.canPlay, speed: rate });
    }).catch(err => { if (active) setResult({ key: requestKey, data: null, view: null, error: analysisError(err) }); });
    return () => { active = false; };
  }, [runId, validId, requestKey]);

  useEffect(() => {
    if (!playing || !pb) return;
    let raf = 0, previous: number | null = null;
    const step = (now: number) => {
      if (document.hidden) { dispatch({ type: "pause", key: requestKey, background: true }); return; }
      const elapsed = previous === null ? 0 : (now - previous) / 1000;
      previous = now;
      dispatch({ type: "tick", key: requestKey, elapsed });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); };
  }, [playing, speed, pb, requestKey]);

  useEffect(() => {
    if (!pb) return;
    const hidden = () => { if (document.hidden) dispatch({ type: "pause", key: requestKey, background: true }); };
    document.addEventListener("visibilitychange", hidden);
    hidden();
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [pb, requestKey]);

  // Store only paused positions; the animation clock never writes history every frame.
  useEffect(() => {
    if (pb && view?.durationValid && clock.key === requestKey && !playing) replaceQuery({ t });
  }, [pb, view, t, playing, replaceQuery, clock.key, requestKey]);

  const seek = useCallback((time: number) => {
    if (!finite(time)) return;
    dispatch({ type: "seek", key: requestKey, time });
  }, [requestKey]);
  const jump = useCallback((dir: 1 | -1) => {
    const times = events.map(event => event.t);
    const target = dir > 0 ? times.find(time => time > t) : [...times].reverse().find(time => time < t);
    if (target !== undefined) seek(target);
  }, [events, t, seek]);
  const toggle = (layer: PlaybackLayer) => setLayers(previous => {
    const next = new Set(previous); if (next.has(layer)) next.delete(layer); else next.add(layer); return next;
  });
  const recordedPath = useMemo(() => frames.map(point => finite(point.ego_x) && finite(point.ped_y)
    ? { t: point.t, x: point.ego_x, ped_y: point.ped_y } : null), [frames]);
  const path = useMemo(() => recordedPath.slice(0, frameIndex + 1)
    .filter((point): point is NonNullable<typeof point> => point !== null), [recordedPath, frameIndex]);
  const trajectoryComplete = useMemo(() => recordedPath.every(point => point !== null) && view?.invalidFrames === 0
    && view.duplicateFrames === 0 && view.backwardFrames === 0, [recordedPath, view]);
  const xAt = (time: number | undefined) => {
    if (time === undefined || time > t) return null;
    const sample = frames[playbackIndexAt(frames, time)];
    return sample?.t === time && finite(sample.ego_x) ? sample.ego_x : null;
  };
  const motionIndex = useMemo(() => {
    const index = new Map<number, MotionTelemetryPoint | null>();
    for (const point of pb?.motion_telemetry ?? []) {
      if (!finite(point.t) || point.t < 0 || point.t > duration) continue;
      index.set(point.t, index.has(point.t) || view?.ambiguousTimes.has(point.t) ? null : point);
    }
    return index;
  }, [pb, view, duration]);
  // Ambiguous duplicate timestamps cannot establish an exact frame/projection join.
  const motion = frame ? motionIndex.get(frame.t) ?? undefined : undefined;
  const chartMarkers = useMemo(() => events.map(event => ({ t: event.t, label: eventName(event), color: eventColor(event),
    source: `events[kind=${event.kind}].t` })), [events]);
  const related = pb?.related_runs?.find(run => run.config !== pb.config);
  const detailHref = `/analysis/failures/${runId}?section=telemetry&t=${t}&signal=${signal}&${returnQuery}`;
  const enabled = Boolean(view?.durationValid && frames.length);
  return <VehicSimPage step={4} title={validId === null ? "Lượt chạy không hợp lệ" : `Phát lại · Lượt chạy ${runCode(validId)}`}
    crumbs={[{ label: "Phân tích" }, { label: "Danh sách phân tích", href: returnTo }, { label: validId === null ? "Mã không hợp lệ" : `Lượt chạy ${runCode(validId)}`, href: detailHref }, { label: "Phát lại" }]}
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
          {pb.simulator?.startsWith("carla") && " Hiệu chuẩn CARLA phụ thuộc xe/profile; API chưa xác nhận calibration từng run; số liệu phục vụ quan sát/đối chiếu."}</p>
        {pb.evaluation_valid === false && <p role="status" className="analysis-caption">Dữ liệu run chưa đủ điều kiện để kết luận AEB. Playback chỉ hiển thị dữ liệu đã ghi.</p>}
        {!view.durationValid && <p role="status">Thời lượng từ API không hợp lệ. Chưa thể phát lại.</p>}
        {view.durationValid && !frames.length && <p role="status">Không có frame telemetry hợp lệ để phát lại.</p>}
        {view.invalidFrames > 0 && <p className="analysis-caption">{view.invalidFrames} khung có timestamp không hợp lệ hoặc nằm ngoài khoảng phát.</p>}
        {(view.duplicateFrames > 0 || view.backwardFrames > 0) && <p className="analysis-caption" data-playback-quality>
          Chất lượng timestamp: {view.duplicateFrames} khung trùng, {view.backwardFrames} mốc lùi. Lookup sắp theo thời gian, giữ nguyên giá trị gốc;
          cùng timestamp chọn bản ghi sau cùng. Projection trùng timestamp không được gắn như số đo duy nhất.
        </p>}
        {related && <div><PillButton href={`/analysis/failures/${related.run_id}/playback?${returnQuery}`}>Mở run liên quan · AEB {related.config}</PillButton><p className="analysis-caption mt-2">API xác nhận cùng biến thể. Cần đối chiếu seed, xe và simulator trước khi so sánh.</p></div>}
      </section>
      <div className={styles.layout}>
        <div className={styles.stack}>
          <PlaybackScene playback={pb} frame={frame} time={t} path={path} trajectoryComplete={trajectoryComplete} aebX={xAt(events.find(event => event.kind === "aeb_decision")?.t)} detectionX={xAt(events.find(event => event.kind === "detection")?.t)} events={events} layers={layers} onToggle={toggle} />
          <PlaybackTimeline duration={duration} time={t} frameTime={frame?.t} playing={playing} speed={speed} enabled={enabled} canPlay={view.canPlay} start={frames[0]?.t ?? 0} backgroundPaused={clock.backgroundPaused} entries={view.entries} activeEvent={activeEvent}
            onSeek={seek} onJump={jump} onSpeed={rate => { dispatch({ type: "rate", key: requestKey, speed: rate }); replaceQuery({ rate }); }} onPlayPause={() => {
              if (!document.hidden) dispatch({ type: "toggle", key: requestKey });
            }} />
        </div>
        <div className={styles.stack}>
          <PlaybackFacts frame={frame} time={t} motion={motion} events={events} />
          <PlaybackEvents entries={view.entries} activeEvent={activeEvent} enabled={enabled} ignored={view.invalidEvents} onSeek={seek} />
        </div>
      </div>
      <MotionTelemetryChart key={pb.run_id} timeEnd={duration} points={pb.motion_telemetry ?? []} markers={chartMarkers} cursor={t}
        selectedField={signal} onFieldChange={signal => replaceQuery({ signal })} />
    </>}
  </VehicSimPage>;
}
