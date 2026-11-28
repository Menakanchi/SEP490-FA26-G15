"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TelemetryChart, type ChartMarker } from "@/components/TelemetryChart";
import { MotionTelemetryChart, MOTION_SIGNALS, type MotionSignal } from "@/components/MotionTelemetryChart";
import { formatMetric } from "./analysisMetricFormat";
import { recordedChain } from "./analysisClassificationData";
import { vi } from "@/components/vehicsimI18n";
import type { FailureDetail } from "@/types/vehicsim";
import { RunFact } from "./AnalysisRunSummary";
import { finite, recordedAt, recordedRange } from "./analysisRunData";
import styles from "./AnalysisRunDetail.module.css";

const MOTION_STATES: Record<string, string> = {
  STATIONARY: "Đứng yên", ACCELERATING: "Nhanh dần", DECELERATING: "Chậm dần", STEADY: "Tốc độ gần đều", UNKNOWN: "Chưa xác định",
};

export function AnalysisRunTimeline({ detail, cursor, onSeek, playbackHref }: {
  detail: FailureDetail; cursor: number; onSeek: (time: number) => void; playbackHref: string | null;
}) {
  const range = recordedRange(detail);
  const point = recordedAt(detail.motion_telemetry ?? [], cursor);
  return <section className={`analysis-panel ${styles.timeline}`} aria-label="Mốc thời gian phân tích">
    <div className={styles.timelineHeader}>
      <label htmlFor="run-analysis-time">Thời gian phân tích: <strong>{cursor.toFixed(2)} s</strong></label>
      <span>Trạng thái từ API: {MOTION_STATES[point?.motion_state ?? ""] ?? "—"}</span>
      {playbackHref && <Link href={playbackHref}>Mở playback tại thời điểm đang xem</Link>}
    </div>
    <input id="run-analysis-time" aria-label="Thời gian phân tích" type="range" min={range?.min ?? 0} max={range?.max ?? 0} step="any" value={cursor}
      disabled={!range || range.min === range.max} onChange={e => onSeek(Number(e.target.value))} />
    <p className="analysis-caption">{range ? `Khoảng đã ghi ${range.min.toFixed(2)}–${range.max.toFixed(2)} s. Đọc khung gần nhất trước hoặc tại mốc chọn; không nội suy tín hiệu thiếu.` : "Chưa có timestamp hợp lệ để xem telemetry."}</p>
  </section>;
}

export function AnalysisRunTelemetry({ detail: d, markers, cursor, signal, onSignal, nominalStep }: {
  detail: FailureDetail; markers: ChartMarker[]; cursor: number; signal: MotionSignal; onSignal: (signal: MotionSignal) => void; nominalStep?: number;
}) {
  const [hoverTime, onHoverTime] = useState<number | null>(null);
  const timeEnd = useMemo(() => recordedRange(d)?.max, [d]);
  const motion = useMemo(() => recordedAt(d.motion_telemetry ?? [], cursor), [d, cursor]);
  const telemetry = useMemo(() => recordedAt(d.telemetry, cursor), [d, cursor]);
  const selected = MOTION_SIGNALS.find(item => item.key === signal)!;
  const note = recordedChain(d.chain).find(stage => stage.passed === false)?.summary;
  return <div className={styles.stack}>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Số đo tại thời gian đang xem">
      <div><h2>Số đo tại khung đã ghi</h2><p className="analysis-caption">Telemetry: {telemetry ? `${telemetry.t.toFixed(2)} s` : "—"} · Chuyển động: {motion ? `${motion.t.toFixed(2)} s` : "—"}. Hai nguồn đọc riêng theo timestamp của API; đây là mẫu trước hoặc tại mốc chọn, có thể cũ khi thiếu khung. Timestamp mẫu không phải thời gian của cursor.</p></div>
      <div className={styles.currentValues}>
        <RunFact label="TTC nhận thức tại khung" value={formatMetric(telemetry?.ttc, 2, true)} note="s · telemetry.ttc; — = không xác định" />
        <RunFact label="Tốc độ tại khung" value={formatMetric(telemetry?.speed_kmh, 1, true)} note="km/h · telemetry.speed_kmh" />
        <RunFact label="Gia tốc ego tại khung" value={formatMetric(motion?.ego_accel_mps2)} note="m/s² · giữ nguyên dấu đã ghi" />
        <RunFact label="Khoảng cách tới vạch tại khung" value={formatMetric(motion?.crossing_distance_m, 2, true)} note="m · backend dẫn xuất từ tọa độ" />
      </div>
      <div className={styles.signalValue} aria-label="Số đo tín hiệu đang chọn"><span>{selected.label} · {motion ? `khung ${motion.t.toFixed(2)} s` : "chưa có khung"}</span><strong>{formatMetric(motion?.[signal], selected.unit === "m/s³" ? 3 : 2, ["ego_speed_mps", "ttc_perceived_s", "ttc_gt_s", "crossing_distance_m"].includes(signal))} {selected.unit}</strong></div>
    </section>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Biểu đồ TTC và tốc độ">
      <div><h2>Dữ liệu đo</h2><p className="analysis-caption">Nguồn: telemetry từ API của run. Trục TTC và tốc độ có thang riêng; số thiếu ngắt đường, không thay bằng 0.</p></div>
      <div className={styles.legend}><span><i style={{ background: "var(--color-vehicsim-ink)" }} />TTC nhận thức (s)</span><span><i style={{ background: "var(--color-vehicsim-decision)" }} />Tốc độ (km/h)</span>{finite(d.ttc_threshold_s) && d.ttc_threshold_s >= 0 && <span><i style={{ background: "var(--color-vehicsim-amber)" }} />Ngưỡng cấu hình {d.ttc_threshold_s} s</span>}</div>
      <TelemetryChart timeEnd={timeEnd} nominalStep={nominalStep} hoverTime={hoverTime} onHoverTime={onHoverTime} points={d.telemetry} threshold={d.ttc_threshold_s} markers={markers} cursor={cursor} impactT={d.events.find(event => event.kind === "collision")?.t} />
      {note && <p className={styles.source}>Nhận định từ backend: {vi(note)} <Link href="/aeb" className="font-semibold text-vehicsim-decision hover:underline">Tạo cấu hình ứng viên ở mục AEB →</Link></p>}
    </section>
    <MotionTelemetryChart timeEnd={timeEnd} nominalStep={nominalStep} hoverTime={hoverTime} onHoverTime={onHoverTime} points={d.motion_telemetry ?? []} markers={markers} cursor={cursor} selectedField={signal} onFieldChange={onSignal} />
    <p className="analysis-caption">Số liệu được dựng từ các khung đã lưu. TTC nhận thức dùng khoảng cách và tốc độ tiếp cận khi đủ điều kiện, không thay bằng TTC thực tế mô phỏng. Biểu đồ độ giật dùng để quan sát; chỉ số RMS ở Tổng quan là giá trị đã lưu, không tính lại từ biểu đồ.</p>
  </div>;
}
