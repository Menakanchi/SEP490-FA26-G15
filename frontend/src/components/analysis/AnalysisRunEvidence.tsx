"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { analysisLabel, metric } from "@/components/analysisUi";
import { vi } from "@/components/vehicsimI18n";
import type { ChainStage, FailureDetail } from "@/types/vehicsim";
import { finite, recordedRange, runMarkers } from "./analysisRunData";
import { PARAMETER_NAMES } from "./analysisFailurePresentation";
import { formatMeasurement, formatMetric } from "./analysisMetricFormat";
import { classificationPresentation, recordedChain } from "./analysisClassificationData";
import { evidenceGroups, evidenceCanSeek, evidenceHref } from "./analysisEvidenceData";
import styles from "./AnalysisRunEvidence.module.css";

type Evidence = ReturnType<typeof evidenceGroups>[number];
type Props = { detail: FailureDetail; returnTo: string; playbackAvailable: boolean };

/** Present stored rules and measurements together without assigning a new cause. */
export function AnalysisRunEvidence({ detail: d, returnTo, playbackAvailable }: Props) {
  const params = useSearchParams();
  const range = recordedRange(d);
  const chain = recordedChain(d.chain);
  const classification = classificationPresentation(d);
  const primary = chain.find(stage => stage.stage === d.failure_class && stage.passed === false);
  const evidence = evidenceGroups(d.stage_evidence);
  const unmatched = evidence.filter(group => !chain.some(stage => stage.stage === group.stage));
  const markers = runMarkers(d);
  const href = (time: number, playback: boolean) => evidenceHref(d.run_id, time, params.toString(), returnTo, playback);
  const links = (time: number, stage: string) => <div className={styles.links}>
    <Link href={href(time, false)} aria-label={`Xem telemetry khâu ${analysisLabel(stage)} tại ${formatMetric(time, 3)} s`}>Telemetry tại {formatMetric(time, 3)} s →</Link>
    {playbackAvailable && <Link href={href(time, true)} aria-label={`Playback khâu ${analysisLabel(stage)} tại ${formatMetric(time, 3)} s`}>Playback tại {formatMetric(time, 3)} s ↗</Link>}
  </div>;
  const measurements = (groups: Evidence[], stage: string) => <div className={styles.measurements}>
    <h4>Số đo từ kết quả đã lưu</h4>
    {!groups.length && <p className="analysis-caption">Chưa có số đo cho khâu này.</p>}
    {groups.map(group => <div key={group.index}>
      {!group.rows.some(row => row.value !== null) && <p className="analysis-caption">Chưa có số đo để đối chiếu.</p>}
      <dl className={styles.facts}>{group.rows.map(row => <div key={row.key} data-evidence-source={row.source}>
        <dt>{row.label}<small>{row.kind}</small></dt>
        <dd>{formatMeasurement(row.value, row.unit, 3)}
          <small>Nguồn: <code>{row.source}</code></small>
          <small>Giá trị nguồn: {finite(row.raw) ? String(row.raw) : "—"}{finite(row.raw) && row.unit ? ` ${row.unit}` : ""}</small>
          {row.value === null && <small>Chưa có giá trị hợp lệ; không thay bằng 0.</small>}
          {evidenceCanSeek(row.time, range) ? links(row.time, stage)
            : row.time !== null && <small>{range ? "Mốc ngoài vùng telemetry; không tạo liên kết thời gian." : "Không có vùng telemetry để đối chiếu mốc này."}</small>}
        </dd>
      </div>)}</dl>
    </div>)}
  </div>;
  return <div className={styles.stack} data-evidence-run={d.run_id}>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Dữ liệu và mốc đã ghi">
      <h2>Dữ liệu và mốc đã ghi</h2>
      <p className="analysis-caption">Run #{d.run_id} · thời gian mô phỏng (s). Mốc từ metrics và sự kiện được lưu riêng với chỉ số đã tính và nhận định theo luật bên dưới.</p>
      <p className="analysis-caption">brake_onset_t là mốc do producer ghi; response chưa có writer attribution để đối chiếu pedal thật. Không gán pedal onset thành lệnh AEB hoặc thời điểm phanh thực sự tác dụng. API chưa có mốc hazard onset, brake applied hay onset giảm tốc được xác minh; không tạo các mốc này từ TTC hoặc gia tốc. Camera/CSV có đồng hồ riêng, chưa được ghép thời gian tại đây.</p>
      {!markers.length && <p className="analysis-caption">API chưa có timestamp hợp lệ cho các mốc được hỗ trợ; không suy ra sự kiện từ giá trị thiếu.</p>}
      <ol className={styles.events}>{markers.map((marker, index) => <li key={`${marker.source}-${index}`} data-evidence-marker={marker.source}>
        <div><strong>{marker.label}</strong><small>{marker.source?.startsWith("metrics.") ? "Trường thời gian trong metrics" : marker.source === "events[kind=ttc_below].t" ? "Sự kiện dẫn xuất từ so sánh TTC (backend)" : "Sự kiện mô phỏng đã lưu"} · <code>{marker.source}</code></small></div>
        <div><span>{formatMetric(marker.t, 3)} s</span><small>Giá trị nguồn: {String(marker.t)} s</small>
          {evidenceCanSeek(marker.t, range) ? <div className={styles.links}><Link href={href(marker.t, false)} aria-label={`Xem mốc ${marker.label} trong telemetry tại ${formatMetric(marker.t, 3)} s`}>Xem telemetry →</Link></div>
            : <small>{range ? "Mốc ngoài vùng telemetry." : "Không có vùng telemetry."} Chưa thể đối chiếu theo thời gian.</small>}
        </div>
      </li>)}</ol>
      <p className="analysis-caption">Sự kiện collision ở đây do backend chiếu từ events, không phải collisions.json hay xác minh sensor contact độc lập. Các chỉ số tổng hợp như giảm tốc cực đại không có timestamp riêng trong API. Không gán thời điểm của mốc lệnh cho cực trị. Nguồn mô phỏng không phải dữ liệu đo xe thật.</p>
    </section>
    <section className={`analysis-panel ${styles.stack}`}>
      <h2>Bằng chứng và giới hạn nhận định</h2>
      <p className="analysis-caption">Chuỗi nguyên nhân là giả thuyết theo luật đánh giá, không chứng minh quan hệ nhân quả. Điểm confidence là điểm của luật, không phải xác suất đã hiệu chuẩn.</p>
      <div className={styles.primary} aria-label="Nhận định chính từ backend">
        <div><span className="analysis-caption">Khâu nghi ngờ đã lưu từ API · chưa xác nhận nguyên nhân</span><h3>{d.failure_class ? analysisLabel(d.failure_class) : "Chưa có khâu chính từ backend."}</h3><p>{primary?.summary ? vi(primary.summary) : "Chưa có mô tả nhận định chính để đối chiếu."}</p></div>
        <dl className={styles.meta}><div><dt>Điểm luật của nhận định chính</dt><dd>{metric(d.chain_confidence)}</dd></div><div><dt>Phiên bản tổng hợp</dt><dd>{d.evaluation_version || "—"}</dd></div></dl>
      </div>
      <p className="analysis-caption">Onset và trễ phanh là các trường đã lưu, chưa xác định writer của pedal hoặc thời điểm xe thực sự giảm tốc. Phiên bản tổng hợp không phải phiên bản luật chấm. Các khâu bên dưới giữ thứ tự từ API. Mỗi nhận định đi kèm số đo của chính khâu đó; — nghĩa là chưa có dữ liệu hợp lệ.</p>
    </section>
    <section className={styles.stack} aria-label="Chuỗi nhận định và số đo">
      <h2>Chuỗi nhận định nguyên nhân</h2>
      {!chain.length && <div className="analysis-state">Run không có chuỗi nhận định để hiển thị. Xem kết quả và dữ liệu nguồn trước khi kết luận.</div>}
      <div className={styles.grid}>{chain.map((stage, index) => <StageCard key={`${stage.stage}-${index}`} stage={stage} index={index + 1} primary={d.failure_class === stage.stage} trusted={classification.trusted} configuration={d.configuration}>
        {measurements(evidence.filter(group => group.stage === stage.stage), stage.stage)}
      </StageCard>)}</div>
    </section>
    {unmatched.length > 0 && <section className={`analysis-panel ${styles.stack}`} aria-label="Số đo chưa có nhận định"><h2>Số đo chưa có nhận định</h2><p className="analysis-caption">API có số đo nhưng chưa có khâu tương ứng trong chuỗi. Chưa thể gán nguyên nhân từ những số đo này.</p>{unmatched.map((group, index) => <article key={`${group.stage}-${index}`}><h3>{analysisLabel(group.stage)}</h3>{measurements([group], group.stage)}</article>)}</section>}
  </div>;
}

function StageCard({ stage, index, primary, trusted, configuration, children }: { stage: ChainStage; index: number; primary: boolean; trusted: boolean; configuration: FailureDetail["configuration"]; children: React.ReactNode }) {
  const parameter = configuration.find(param => param.code === stage.parameter_code);
  return <article className={`${styles.card} ${primary ? styles.selected : ""}`} aria-label={`Khâu ${analysisLabel(stage.stage)}`}>
    <header className={styles.header}><h3><span className={styles.number}>{index}</span>{analysisLabel(stage.stage)}</h3><span className={trusted && stage.passed === false ? styles.failed : trusted && stage.passed === true ? styles.passed : styles.unknown}>{!trusted ? "Chưa có kết luận hợp lệ" : stage.passed === true ? "Đạt theo luật" : stage.passed === false ? "Không đạt theo luật" : "Chưa có kết luận"}</span></header>
    {primary && <strong className={styles.primaryLabel}>Khâu chính từ backend</strong>}
    <p>{stage.summary ? vi(stage.summary) : "API chưa có mô tả nhận định."}</p>
    <dl className={styles.facts}>
      <div><dt>Điểm luật của khâu</dt><dd>{metric(stage.confidence)}</dd></div>
      <div><dt>Mã nguyên nhân</dt><dd><code>{stage.cause_code || "—"}</code></dd></div>
      <div><dt>Tham số được luật nhắc tới</dt><dd>{stage.parameter_code ? PARAMETER_NAMES[stage.parameter_code] ?? parameter?.name ?? stage.parameter_code : "—"}{stage.parameter_code && <small>{stage.parameter_code} · {metric(parameter?.value, 3)}{finite(parameter?.value) && parameter?.unit ? ` ${parameter.unit}` : ""}</small>}</dd></div>
    </dl>
    {children}
  </article>;
}
