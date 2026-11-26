"use client";

import { diagnosticPresentation, object, type DiagnosticReport } from "./failureAnalysisV3Data";
import styles from "./FailureAnalysisV3.module.css";

export function FailureAnalysisV3Report({ data }: { data: DiagnosticReport }) {
  const result = diagnosticPresentation(data.report);
  const mode = object(data.input.mode);
  const modeText = ["OBSERVED", "DERIVED", "CONDITIONAL"].includes(String(mode.status)) && (mode.value === "ON" || mode.value === "OFF") ? `AEB ${mode.value === "ON" ? "bật" : "tắt"}${mode.status === "CONDITIONAL" ? " (cần xác minh)" : ""}. ` : "";
  return <article className={styles.report} aria-label="Kết quả phân tích">
    <header>
      <p>Lượt chạy {data.input.run_key}</p>
      <h2>Kết luận: {result.conclusion}</h2>
      <p>{result.outcomeText}. {modeText}{result.behaviorText}.</p>
      <p className="analysis-caption">Kết quả va chạm và đánh giá AEB là hai thông tin riêng.</p>
    </header>
    {result.candidates.length > 1 && <section><h3>Dấu hiệu cần xem xét</h3><ul className={styles.findings}>
      {result.candidates.map((candidate, i) => <li key={i}><strong>{candidate.label}</strong><span>{candidate.supported ? "Có bằng chứng hỗ trợ" : "Nghi ngờ"}</span></li>)}
    </ul></section>}
    {result.hasUnknownCandidates && <p role="status">Một dấu hiệu chưa thể diễn giải; cần kiểm tra thêm.</p>}
    {result.metrics.length > 0 && <section aria-label="Thông tin quan trọng"><h3>Thông tin quan trọng</h3><dl className={styles.summaryGrid}>
      {result.metrics.map(metric => <div key={metric.label} className={styles.summaryCard}><dt>{metric.label}</dt><dd><strong>{metric.data.value.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} {metric.unit}</strong>{metric.data.conditional && " · cần xác minh"}</dd>{metric.label === "Quãng đường dừng" && <small>Có thể gồm phần ngoại suy.</small>}</div>)}
    </dl>{result.differentClocks && <p className="analysis-caption">Các mốc được ghi bằng đồng hồ khác nhau, chưa thể so sánh trực tiếp.</p>}</section>}
    <section><h3>Nguyên nhân</h3><p>Chưa đủ dữ liệu để xác định nguyên nhân.</p></section>
  </article>;
}
