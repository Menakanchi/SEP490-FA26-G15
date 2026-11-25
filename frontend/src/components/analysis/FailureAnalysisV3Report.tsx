"use client";

import { object, evidenceText, objectiveKeys, type DiagnosticReport } from "./failureAnalysisV3Data";
import styles from "./FailureAnalysisV3.module.css";

export function TechnicalDetails({ title, value }: { title: string; value: unknown }) {
  return <details className={styles.details}><summary>{title}</summary><pre>{JSON.stringify(value, null, 2) ?? "UNKNOWN"}</pre></details>;
}
export function FailureAnalysisV3Report({ data }: { data: DiagnosticReport }) {
  const r = data.report;
  const names = ["RMS jerk", "Tốc độ impact canonical", "Quãng đường dừng canonical"];
  const candidates = r.failure_candidates as unknown[];
  const hypotheses = r.root_cause_hypotheses as unknown[];
  const sufficiency = r.evidence_sufficiency as unknown[];
  const qualityLabels: Record<string, string> = { SUFFICIENT: "Đủ bằng chứng", PARTIAL: "Còn thiếu một phần", INSUFFICIENT: "Chưa đủ bằng chứng", NOT_APPLICABLE: "Không áp dụng" };
  const quality = [...new Set(sufficiency.map(v => String(object(v).status)))];
  return <article className={styles.report} aria-label="Kết quả phân tích chuyên sâu V3.1">
    <header><h2>Kết quả run {data.input.run_key}</h2><p>Phân tích chuyên sâu V3.1 · {String(data.analysis_status)}</p><p>AEB: {evidenceText(data.input.mode)}</p></header>
    <section><h3>Kết quả vật lý</h3><p data-v3-outcome>{evidenceText(r.physical_outcome)}</p><p>Cơ sở: {({ RECORDED_MATCHING_CONTACT: "Có contact được ghi nhận và khớp đối tượng", GEOMETRY_ONLY: "Chỉ có bằng chứng hình học" } as Record<string,string>)[String(object(r.physical_outcome_basis).basis)] ?? "Xem nguồn bằng chứng trong phần điều tra"}.</p><p>Va chạm vật lý không tự xác nhận lỗi chức năng hoặc nguyên nhân AEB.</p></section>
    <section><h3>Hành vi AEB quan sát được</h3><p>{evidenceText(r.observed_behavior)}</p></section>
    <section><h3>Ba chỉ số đã ghi</h3><p>Giữ nguyên giá trị producer; không tính lại từ biểu đồ hoặc cấu hình.</p><div className={styles.metrics}>
      {objectiveKeys.map((key, i) => { const o = r.objectives[key]; return <section className={styles.metric} key={key} aria-label={names[i]}><h4>{names[i]}</h4><p data-v3-value>{evidenceText(o.canonical_value)}</p>
        {key === "impact_speed_mps" && <p>Impact theo contact: {o.physical_event_impact === null ? "Chưa có giá trị · UNKNOWN" : evidenceText(o.physical_event_impact)}</p>}
        {key === "stopping_distance_m" && <><p>Phần trace: {evidenceText(object(o.decomposition).trace_component)}</p><p>Phần ngoại suy: {evidenceText(object(o.decomposition).extrapolated_component)}</p></>}
        <TechnicalDetails title="Nguồn và giới hạn chỉ số" value={o} />
      </section>; })}
    </div></section>
    <section><h3>Dấu hiệu lỗi cần xem xét</h3>{candidates.length ? candidates.map((item, i) => { const c = object(item); return <div key={i} className={styles.metric}><strong>{String(c.type)} · {String(c.status)}</strong><p>{evidenceText(c.evidence)}</p><TechnicalDetails title="Bằng chứng, điều kiện còn thiếu và khả năng khác" value={c} /></div>; }) : <p>Backend không ghi nhận failure candidate trong báo cáo này. Không tự suy ra mọi điều kiện đều an toàn.</p>}
      <p>Nguyên nhân đã xác nhận: {evidenceText(r.confirmed_root_cause)}</p>
    </section>
    <section><h3>Giới hạn bằng chứng</h3><ul>{quality.map(status => <li key={status}>{qualityLabels[status] ?? status}: {sufficiency.filter(v => object(v).status === status).length} đánh giá</li>)}</ul><p>Đủ bằng chứng cho một nhận định không xác nhận mọi nguyên nhân hoặc khả năng tránh va chạm.</p><TechnicalDetails title="Lý do chưa thể kết luận" value={{ evidence_sufficiency: sufficiency, inconclusive_reasons: r.inconclusive_reasons, uncertainty_notes: r.uncertainty_notes, disagreements: r.disagreements }} /></section>
    <section><h3>Điều tra chuyên sâu</h3>
      <TechnicalDetails title="Timeline và hành vi" value={{ aeb_timeline: r.aeb_timeline, braking: r.braking, control_activity: r.control_activity }} />
      <TechnicalDetails title="Vật lý và khả năng tránh va chạm" value={{ geometry_results: r.geometry_results, feasibility_results: r.feasibility_results, physical_feasibility: r.physical_feasibility, physical_limit: r.physical_limit, impact_analysis: r.impact_analysis, paired_mitigation: r.paired_mitigation, calibration_applicability: r.calibration_applicability }} />
      <TechnicalDetails title="Bằng chứng và nguồn truy vết" value={{ input: data.input, collision_evidence: r.collision_evidence, validation: r.validation, physical_outcome_basis: r.physical_outcome_basis, content_digest: data.content_digest, formula_version: data.formula_version, policy_version: data.policy_version }} />
      <details className={styles.details}><summary>Giả thuyết nguyên nhân ({hypotheses.length})</summary><p>Kế hoạch phản chứng là đề xuất kiểm tra. Chỉ xem là đã kiểm chứng khi có kết quả thực thi được ghi rõ.</p>{hypotheses.map((v, i) => { const h = object(v); return <section key={i}><h4>{String(h.type)} · {String(h.status)}</h4><p>{String(h.technical_mechanism ?? "UNKNOWN")}</p><TechnicalDetails title="Bằng chứng hỗ trợ" value={h.supporting_evidence} /><TechnicalDetails title="Bằng chứng phản bác" value={h.counterevidence} /><TechnicalDetails title="Giả thuyết khác và bằng chứng thiếu" value={{ alternatives: h.alternatives, alternative_hypotheses: h.alternative_hypotheses, missing_evidence: h.missing_evidence }} /><TechnicalDetails title="Kế hoạch phản chứng (không tự coi đã thực thi)" value={h.falsification_tests} /><TechnicalDetails title="Phạm vi và nguồn cơ chế" value={h} /></section>; })}{!hypotheses.length && <p>Không có giả thuyết được backend cung cấp.</p>}</details>
    </section>
  </article>;
}
