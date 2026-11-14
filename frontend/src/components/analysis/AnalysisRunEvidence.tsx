"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { analysisLabel, metric } from "@/components/analysisUi";
import { vi } from "@/components/vehicsimI18n";
import type { ChainStage, FailureDetail } from "@/types/vehicsim";
import { finite, recordedRange } from "./analysisRunData";
import { EVIDENCE_FIELDS, PARAMETER_NAMES } from "./analysisFailurePresentation";
import { formatMeasurement } from "./analysisMetricFormat";
import styles from "./AnalysisRunEvidence.module.css";

type Evidence = NonNullable<FailureDetail["stage_evidence"]>[number];
type Props = { detail: FailureDetail; returnTo: string; playbackAvailable: boolean };

/** Present stored rules and measurements together without assigning a new cause. */
export function AnalysisRunEvidence({ detail: d, returnTo, playbackAvailable }: Props) {
  const params = useSearchParams();
  const range = recordedRange(d);
  const primary = d.chain.find(stage => stage.stage === d.failure_class);
  const evidence = d.stage_evidence ?? [];
  const unmatched = evidence.filter(group => !d.chain.some(stage => stage.stage === group.stage));
  const href = (time: number, playback: boolean) => {
    const next = new URLSearchParams(params.toString());
    next.set("t", String(time)); next.set("returnTo", returnTo);
    if (playback) next.delete("section"); else next.set("section", "telemetry");
    return `/analysis/failures/${d.run_id}${playback ? "/playback" : ""}?${next}`;
  };
  const measurements = (groups: Evidence[], stage: string) => {
    const time = groups.flatMap(group => Object.entries(group.values))
      .find(([key, value]) => EVIDENCE_FIELDS[key]?.time && finite(value) && range && value >= range.min && value <= range.max)?.[1];
    return <div className={styles.measurements}>
      <h4>Số đo từ kết quả đã lưu</h4>
      {!groups.length && <p className="analysis-caption">Chưa có số đo cho khâu này.</p>}
      {groups.map((group, index) => <div key={`${group.stage}-${index}`}>
        {!Object.values(group.values).some(finite) && <p className="analysis-caption">Chưa có số đo để đối chiếu.</p>}
        <dl className={styles.facts}>{Object.entries(group.values).map(([key, value]) => <div key={key}>
          <dt>{EVIDENCE_FIELDS[key]?.label ?? key}</dt><dd>{formatMeasurement(value, EVIDENCE_FIELDS[key]?.unit ?? "", undefined, true)}</dd>
        </div>)}</dl>
      </div>)}
      {finite(time) && <div className={styles.links}>
        <Link href={href(time, false)} aria-label={`Xem telemetry khâu ${analysisLabel(stage)} tại ${time.toFixed(2)} s`}>Telemetry tại {time.toFixed(2)} s →</Link>
        {playbackAvailable && <Link href={href(time, true)} aria-label={`Playback khâu ${analysisLabel(stage)} tại ${time.toFixed(2)} s`}>Playback tại {time.toFixed(2)} s ↗</Link>}
      </div>}
    </div>;
  };
  return <div className={styles.stack}>
    <section className={`analysis-panel ${styles.stack}`}>
      <h2>Bằng chứng và giới hạn nhận định</h2>
      <p className="analysis-caption">Chuỗi nguyên nhân là giả thuyết theo luật đánh giá, không chứng minh quan hệ nhân quả. Điểm confidence là điểm của luật, không phải xác suất đã hiệu chuẩn.</p>
      <div className={styles.primary} aria-label="Nhận định chính từ backend">
        <div><span className="analysis-caption">Khâu chính do API trả về</span><h3>{d.failure_class ? analysisLabel(d.failure_class) : "Chưa có khâu chính từ backend."}</h3><p>{primary?.summary ? vi(primary.summary) : "Chưa có mô tả nhận định chính để đối chiếu."}</p></div>
        <dl className={styles.meta}><div><dt>Điểm luật của nhận định chính</dt><dd>{metric(d.chain_confidence)}</dd></div><div><dt>Phiên bản tổng hợp</dt><dd>{d.evaluation_version || "—"}</dd></div></dl>
      </div>
      <p className="analysis-caption">Onset và trễ phanh là mốc controller, chưa xác định thời điểm xe thực sự giảm tốc. Phiên bản tổng hợp không phải phiên bản luật chấm. Các khâu bên dưới giữ thứ tự từ API. Mỗi nhận định đi kèm số đo của chính khâu đó; — nghĩa là chưa có dữ liệu hợp lệ.</p>
    </section>
    <section className={styles.stack} aria-label="Chuỗi nhận định và số đo">
      <h2>Chuỗi nhận định nguyên nhân</h2>
      {!d.chain.length && <div className="analysis-state">Run không có chuỗi nhận định để hiển thị. Xem kết quả và dữ liệu nguồn trước khi kết luận.</div>}
      <div className={styles.grid}>{d.chain.map((stage, index) => <StageCard key={`${stage.stage}-${index}`} stage={stage} index={index + 1} primary={d.failure_class === stage.stage} configuration={d.configuration}>
        {measurements(evidence.filter(group => group.stage === stage.stage), stage.stage)}
      </StageCard>)}</div>
    </section>
    {unmatched.length > 0 && <section className={`analysis-panel ${styles.stack}`} aria-label="Số đo chưa có nhận định"><h2>Số đo chưa có nhận định</h2><p className="analysis-caption">API có số đo nhưng chưa có khâu tương ứng trong chuỗi. Chưa thể gán nguyên nhân từ những số đo này.</p>{unmatched.map((group, index) => <article key={`${group.stage}-${index}`}><h3>{analysisLabel(group.stage)}</h3>{measurements([group], group.stage)}</article>)}</section>}
  </div>;
}

function StageCard({ stage, index, primary, configuration, children }: { stage: ChainStage; index: number; primary: boolean; configuration: FailureDetail["configuration"]; children: React.ReactNode }) {
  const parameter = configuration.find(param => param.code === stage.parameter_code);
  return <article className={`${styles.card} ${primary ? styles.selected : ""}`} aria-label={`Khâu ${analysisLabel(stage.stage)}`}>
    <header className={styles.header}><h3><span className={styles.number}>{index}</span>{analysisLabel(stage.stage)}</h3><span className={stage.passed === false ? styles.failed : stage.passed === true ? styles.passed : styles.unknown}>{stage.passed === true ? "Đạt theo luật" : stage.passed === false ? "Không đạt theo luật" : "Chưa có kết luận"}</span></header>
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
