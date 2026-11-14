"use client";

import { ScenarioMap } from "@/components/ScenarioMap";
import type { Frame, MotionTelemetryPoint, Playback, SimEvent } from "@/types/vehicsim";
import { finite } from "./analysisRunData";
import { PLAYBACK_LAYERS, frameStatus, type PlaybackLayer } from "./playbackPresentation";
import { formatMeasurement, speedKmh } from "./analysisMetricFormat";
import styles from "./AnalysisPlayback.module.css";

const measured = formatMeasurement;

export function PlaybackScene({ playback: pb, frame, time, path, aebX, detectionX, events, layers, onToggle }: {
  playback: Playback; frame: Frame | null; time: number; path: { t: number; x: number; ped_y: number }[];
  aebX: number | null; detectionX: number | null; events: SimEvent[]; layers: Set<PlaybackLayer>; onToggle: (layer: PlaybackLayer) => void;
}) {
  const canDraw = frame && finite(frame.ego_x) && finite(frame.ped_y) && finite(pb.crossing_x)
    && finite(pb.vehicle_length_m) && pb.vehicle_length_m > 0 && finite(pb.vehicle_width_m) && pb.vehicle_width_m > 0 && path.length > 0;
  return <section className={`analysis-panel ${styles.stack}`} aria-label="Cảnh playback đã ghi">
    <div className={styles.sceneHeader}><div><h2>Nhìn từ trên</h2><p className="analysis-caption">{frame ? `Khung đã ghi: ${frame.t.toFixed(2)} s` : "Chưa có khung tại mốc này"}</p></div>
      <div className={styles.layers} aria-label="Lớp hiển thị">{PLAYBACK_LAYERS.map(layer => <button key={layer} type="button" aria-pressed={layers.has(layer)} onClick={() => onToggle(layer)}>{layer}</button>)}</div>
    </div>
    {canDraw ? <ScenarioMap height={360} crossingX={pb.crossing_x} vehicleLengthM={pb.vehicle_length_m} vehicleWidthM={pb.vehicle_width_m}
      path={path} pedY={path.map(point => point.ped_y)} egoX={frame.ego_x} pedYNow={frame.ped_y}
      perceivedY={finite(frame.perceived_y) ? frame.perceived_y : null} aebX={aebX} detectionX={detectionX}
      collision={events.some(event => event.kind === "collision" && time >= event.t)}
      showGroundTruth={layers.has("GT mô phỏng")} showPerception={layers.has("Nhận thức")} showTrajectories={layers.has("Quỹ đạo")}
      egoLabelAbove groundTruthColor="var(--color-vehicsim-ok)" perceptionColor="var(--color-vehicsim-perception)"
      egoLabel={`Xe ${pb.vehicle} · ${measured(speedKmh(frame.ego_v), "km/h")}`}
      labels={[
        ...(layers.has("Nhận thức") && frame.detected && finite(frame.confidence) ? [{ x: pb.crossing_x - 4, y: 68, text: `Nhận thức · tin cậy ${frame.confidence.toFixed(2)}`, color: "var(--color-vehicsim-perception)" }] : []),
        ...(layers.has("GT mô phỏng") && finite(frame.ped_vy) ? [{ x: pb.crossing_x + 1, y: 196, text: `GT vY · ${formatMeasurement(frame.ped_vy, "", 2)} m/s`, color: "var(--color-vehicsim-ok)" }] : []),
      ]} /> : <div className="analysis-state">{frame ? "Khung này chưa đủ tọa độ hoặc kích thước xe để dựng cảnh." : "Chưa có khung đã ghi tại hoặc trước thời gian đang xem."}</div>}
    <div className={styles.legend}><span><i style={{ background: "var(--color-vehicsim-ok)" }} />GT mô phỏng</span><span><i style={{ background: "var(--color-vehicsim-perception)" }} />Nhận thức</span><span><i style={{ background: "var(--color-vehicsim-decision)" }} />Quỹ đạo xe</span></div>
    <p className="analysis-caption">Cảnh từ tọa độ đã ghi. Camera/RGB và LiDAR chưa được đồng bộ trong màn phát lại này.</p>
  </section>;
}

export function PlaybackFacts({ frame, time, motion, events }: { frame: Frame | null; time: number; motion?: MotionTelemetryPoint; events: SimEvent[] }) {
  const status = frame ? frameStatus(frame, time, events) : null;
  return <section className="analysis-panel" aria-label="Số đo khung playback">
    <div className={styles.factHeading}><h2>Số đo tại khung</h2>{status && <span className={status.cls}>{status.label}</span>}</div>
    <p className="analysis-caption mt-2">{frame ? `Khung ${frame.t.toFixed(2)} s · cursor ${time.toFixed(2)} s` : "Chưa có khung để đọc số đo."}</p>
    <div className={styles.facts}>
      <Stat label="Tốc độ xe ego" value={measured(speedKmh(frame?.ego_v), "km/h")} />
      <Stat label="Khoảng cách tới vạch băng qua" value={measured(motion?.crossing_distance_m, "m", 2, true)} />
      <Stat label="TTC nhận thức" value={measured(frame?.ttc, "s", 2, true)} />
      <Stat label="TTC ground truth" value={measured(frame?.ttc_gt, "s", 2, true)} />
      <Stat label="Gia tốc ego đã ghi" value={measured(frame?.ego_a, "m/s²")} />
      <Stat label="Độ tin cậy phát hiện" value={frame?.detected === false ? "Chưa phát hiện" : frame?.detected && finite(frame.confidence) ? frame.confidence.toFixed(2) : "—"} />
      <Stat label="Vị trí target Y (GT)" value={measured(frame?.ped_y, "m")} />
      <Stat label="Vị trí nhận thức Y" value={measured(frame?.perceived_y, "m")} />
    </div>
    <p className="analysis-caption mt-3">GT là ground truth trong mô phỏng, không phải đo thực địa. TTC thiếu giữ nguyên —; không lấy GT thay nhận thức. Khoảng cách tới vạch không phải khoảng cách tương đối tới xe mục tiêu. Trạng thái dừng/va chạm lấy từ sự kiện đã ghi.</p>
  </section>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className={styles.fact}><span>{label}</span><strong>{value}</strong></div>;
}
