"use client";

import { eventColor, eventName, PLAYBACK_SPEEDS, type PlaybackEvent, type PlaybackSpeed } from "./playbackPresentation";
import type { SimEvent } from "@/types/vehicsim";
import styles from "./AnalysisPlayback.module.css";

type Props = {
  duration: number; time: number; frameTime?: number; playing: boolean; speed: PlaybackSpeed; enabled: boolean;
  entries: PlaybackEvent[]; activeEvent?: SimEvent; onSeek: (time: number) => void; onPlayPause: () => void;
  onSpeed: (speed: PlaybackSpeed) => void; onJump: (direction: 1 | -1) => void;
};
export function PlaybackTimeline({ duration, time, frameTime, playing, speed, enabled, entries, activeEvent, onSeek, onPlayPause, onSpeed, onJump }: Props) {
  const groups: { time: number; entries: PlaybackEvent[] }[] = [];
  for (const entry of entries) {
    const previous = groups.at(-1);
    if (previous && entry.record.t - previous.time < duration * 0.03) previous.entries.push(entry);
    else groups.push({ time: entry.record.t, entries: [entry] });
  }
  return <section className={`analysis-panel ${styles.stack}`} aria-label="Điều khiển playback">
    <div className={styles.controls}>
      <button type="button" className={styles.play} aria-label={playing ? "Tạm dừng" : "Phát"} disabled={!enabled || duration <= 0} onClick={onPlayPause}>{playing ? "❚❚" : "▶"}</button>
      <button type="button" className="analysis-button" disabled={!enabled || !entries.some(entry => entry.record.t < time - 1e-3)} onClick={() => onJump(-1)}>‹ Sự kiện trước</button>
      <button type="button" className="analysis-button" disabled={!enabled || !entries.some(entry => entry.record.t > time + 1e-3)} onClick={() => onJump(1)}>Sự kiện sau ›</button>
      <div className={styles.rates} aria-label="Tốc độ phát">{PLAYBACK_SPEEDS.map(rate => <button key={rate} type="button" aria-label={`Tốc độ phát ${rate} lần`} aria-pressed={speed === rate} disabled={!enabled} onClick={() => onSpeed(rate)}>{rate}×</button>)}</div>
    </div>
    <div className={styles.time}><label htmlFor="playback-time">Thời gian playback</label><output aria-label="Thời gian phát đang xem">{time.toFixed(2)} / {duration.toFixed(2)} s</output></div>
    <div className={styles.scrubber}>
      <input id="playback-time" aria-label="Thời gian playback" type="range" min={0} max={duration} step={0.01} value={time} disabled={!enabled || duration <= 0}
        aria-valuetext={`${time.toFixed(2)} giây trên ${duration.toFixed(2)} giây`} onChange={event => onSeek(Number(event.target.value))} />
      <div className={styles.ticks} aria-hidden="true">{[0, 1, 2, 3, 4].map(index => <span key={index}>{(duration * index / 4).toFixed(2)} s</span>)}</div>
    </div>
    {groups.length > 0 && <div className={styles.markers} aria-label="Mốc sự kiện playback"><div className={styles.track} />
      {groups.map((group, index) => <button key={index} type="button" className={styles.marker}
        aria-label={`Mốc ${group.time.toFixed(2)} s: ${group.entries.map(entry => eventName(entry.record)).join("; ")}`}
        title={group.entries.map(entry => `${entry.record.t.toFixed(2)} s · ${eventName(entry.record)}`).join("\n")}
        aria-current={group.entries.some(entry => entry.record === activeEvent) ? true : undefined}
        style={{ left: `${duration > 0 ? group.time / duration * 100 : 0}%`, background: eventColor(group.entries[0].record) }}
        disabled={!enabled} onClick={() => onSeek(group.time)}>{group.entries.length > 1 ? group.entries.length : <span aria-hidden="true">·</span>}</button>)}
    </div>}
    <p className="analysis-caption">{frameTime !== undefined ? `Khung đang hiển thị: ${frameTime.toFixed(2)} s. ` : "Chưa có khung tại thời gian này. "}Dùng phím mũi tên/Home/End trên thanh thời gian. Các mốc gần nhau được gom; nhật ký giữ từng sự kiện.</p>
  </section>;
}

export function PlaybackEvents({ entries, activeEvent, enabled, ignored, onSeek }: {
  entries: PlaybackEvent[]; activeEvent?: SimEvent; enabled: boolean; ignored: number; onSeek: (time: number) => void;
}) {
  return <section className={`analysis-panel ${styles.stack}`} aria-label="Nhật ký sự kiện">
    <div className={styles.eventsHeading}><h2>Nhật ký sự kiện</h2><span>{entries.length} mốc đã ghi</span></div>
    {!entries.length && <p className="analysis-caption">Run không có sự kiện hợp lệ trong khoảng phát.</p>}
    {ignored > 0 && <p className="analysis-caption">{ignored} sự kiện có timestamp không hợp lệ hoặc nằm ngoài khoảng phát.</p>}
    <div className={styles.eventList}>{entries.map((entry, index) => <button key={entry.id} type="button" className={styles.event} data-event-id={entry.id}
      aria-label={`${index + 1}. ${eventName(entry.record)} · ${entry.record.t.toFixed(2)} s`}
      aria-current={entry.record === activeEvent ? "step" : undefined} disabled={!enabled} onClick={() => onSeek(entry.record.t)}>
      <i style={{ background: eventColor(entry.record) }} /><time>{entry.record.t.toFixed(2)} s</time><span>{eventName(entry.record)}</span>
    </button>)}</div>
  </section>;
}
