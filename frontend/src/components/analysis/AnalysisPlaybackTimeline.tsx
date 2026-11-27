"use client";

import { eventColor, eventName, PLAYBACK_SPEEDS, type PlaybackAebMode, type PlaybackEvent, type PlaybackSpeed } from "./playbackPresentation";
import { formatMetric } from "./analysisMetricFormat";
import type { SimEvent } from "@/types/vehicsim";
import styles from "./AnalysisPlayback.module.css";

type Props = {
  duration: number; time: number; frameTime?: number; playing: boolean; speed: PlaybackSpeed; enabled: boolean; canPlay: boolean; start: number; backgroundPaused: boolean;
  entries: PlaybackEvent[]; activeEvent?: SimEvent; mode?: PlaybackAebMode; onSeek: (time: number) => void; onPlayPause: () => void;
  onSpeed: (speed: PlaybackSpeed) => void; onJump: (direction: 1 | -1) => void;
};
export function PlaybackTimeline({ duration, time, frameTime, playing, speed, enabled, canPlay, start, backgroundPaused, entries, activeEvent, mode, onSeek, onPlayPause, onSpeed, onJump }: Props) {
  const groups: { time: number; entries: PlaybackEvent[] }[] = [];
  for (const entry of entries) {
    const previous = groups.at(-1);
    if (previous && entry.record.t - previous.time < duration * 0.03) previous.entries.push(entry);
    else groups.push({ time: entry.record.t, entries: [entry] });
  }
  const stateLabel = !enabled ? "Chưa có dữ liệu hợp lệ để phát."
    : !canPlay ? "Chỉ có một timestamp; không đủ để phát chuyển động."
    : playing ? "Đang phát các khung đã ghi."
    : backgroundPaused ? "Đã tạm dừng ở tab nền. Nhấn Phát để tiếp tục."
    : time >= duration ? "Cuối dữ liệu đã ghi. Nhấn Phát để xem lại."
    : "Đang tạm dừng tại mốc đã chọn.";
  return <section className={`analysis-panel ${styles.stack}`} aria-label="Điều khiển playback">
    <div className={styles.controls}>
      <button type="button" className={styles.play} aria-label={playing ? "Tạm dừng" : "Phát"} disabled={!enabled || !canPlay || duration <= start} onClick={onPlayPause}>{playing ? "❚❚" : "▶"}</button>
      <button type="button" className="analysis-button" disabled={!enabled || time === start} onClick={() => onSeek(start)}>Về khung đầu</button>
      <button type="button" className="analysis-button" disabled={!enabled || !entries.some(entry => entry.record.t < time)} onClick={() => onJump(-1)}>‹ Sự kiện trước</button>
      <button type="button" className="analysis-button" disabled={!enabled || !entries.some(entry => entry.record.t > time)} onClick={() => onJump(1)}>Sự kiện sau ›</button>
      <div className={styles.rates} aria-label="Tốc độ phát">{PLAYBACK_SPEEDS.map(rate => <button key={rate} type="button" aria-label={`Tốc độ phát ${rate} lần`} aria-pressed={speed === rate} disabled={!enabled} onClick={() => onSpeed(rate)}>{rate}×</button>)}</div>
    </div>
    <p className={`analysis-caption ${styles.clockState}`} role="status" data-playback-state>{stateLabel}</p>
    <div className={styles.time}><label htmlFor="playback-time">Thời gian playback</label><output aria-label="Thời gian phát đang xem">{formatMetric(time, 3)} / {formatMetric(duration, 3)} s</output></div>
    <div className={styles.scrubber}>
      <input id="playback-time" aria-label="Thời gian playback" type="range" min={0} max={duration} step="any" value={time} disabled={!enabled || duration <= 0}
        aria-valuetext={`${formatMetric(time, 3)} giây trên ${formatMetric(duration, 3)} giây`} onChange={event => onSeek(Number(event.target.value))} />
      <div className={styles.ticks} aria-hidden="true">{[0, 1, 2, 3, 4].map(index => <span key={index}>{formatMetric(duration * index / 4, 3)} s</span>)}</div>
    </div>
    {groups.length > 0 && <div className={styles.markers} aria-label="Mốc sự kiện playback"><div className={styles.track} />
      {groups.map((group, index) => <button key={index} type="button" className={styles.marker}
        aria-label={`Mốc ${formatMetric(group.time, 3)} s: ${group.entries.map(entry => eventName(entry.record, mode)).join("; ")}`}
        title={group.entries.map(entry => `${formatMetric(entry.record.t, 3)} s · ${eventName(entry.record, mode)}`).join("\n")}
        aria-current={group.entries.some(entry => entry.record === activeEvent) ? true : undefined}
        style={{ left: `${duration > 0 ? group.time / duration * 100 : 0}%`, background: eventColor(group.entries[0].record) }}
        disabled={!enabled} onClick={() => onSeek(group.time)}>{group.entries.length > 1 ? group.entries.length : <span aria-hidden="true">·</span>}</button>)}
    </div>}
    <p className="analysis-caption">{frameTime !== undefined ? `Khung đang hiển thị: ${formatMetric(frameTime, 3)} s. ` : "Chưa có khung tại thời gian này. "}{frameTime !== undefined && time > frameTime && `Không có frame đúng mốc chọn; đang giữ khung trước đó, cách ${formatMetric(time - frameTime, 3)} s. Không nội suy vị trí hoặc trạng thái. `}Dùng phím mũi tên/Home/End trên thanh thời gian. Các mốc gần nhau được gom; nhật ký giữ từng sự kiện.</p>
  </section>;
}

export function PlaybackEvents({ entries, activeEvent, enabled, ignored, mode, onSeek }: {
  entries: PlaybackEvent[]; activeEvent?: SimEvent; enabled: boolean; ignored: number; mode?: PlaybackAebMode; onSeek: (time: number) => void;
}) {
  return <section className={`analysis-panel ${styles.stack}`} aria-label="Nhật ký sự kiện">
    <div className={styles.eventsHeading}><h2>Nhật ký sự kiện</h2><span>{entries.length} mốc đã ghi</span></div>
    {!entries.length && <p className="analysis-caption">Run không có sự kiện hợp lệ trong khoảng phát.</p>}
    {ignored > 0 && <p className="analysis-caption">{ignored} sự kiện có timestamp không hợp lệ hoặc nằm ngoài khoảng phát.</p>}
    <div className={styles.eventList}>{entries.map((entry, index) => <button key={entry.id} type="button" className={styles.event} data-event-id={entry.id}
      aria-label={`${index + 1}. ${eventName(entry.record, mode)} · ${formatMetric(entry.record.t, 3)} s`}
      aria-current={entry.record === activeEvent ? "step" : undefined} disabled={!enabled} onClick={() => onSeek(entry.record.t)} title={`events[kind=${entry.record.kind}].t = ${formatMetric(entry.record.t, 3)} s`}>
      <i style={{ background: eventColor(entry.record) }} /><time>{formatMetric(entry.record.t, 3)} s</time><span>{eventName(entry.record, mode)}</span>
    </button>)}</div>
  </section>;
}
