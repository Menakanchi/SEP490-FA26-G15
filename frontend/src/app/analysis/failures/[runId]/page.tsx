"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { ErrorNote, runCode } from "@/components/VehicSimUi";
import { AnalysisScope, AnalysisLoading, analysisError, analysisOrigin, analysisReturn, analysisRunId } from "@/components/analysisUi";
import { assertInspection, legacyDisagreements } from "@/components/analysis/analysisResultData";
import { classificationPresentation } from "@/components/analysis/analysisClassificationData";
import { formatMeasurement, formatRunImpact } from "@/components/analysis/analysisMetricFormat";
import { vehicsimApi } from "@/services/vehicsim";
import type { AnalysisRun, FailureDetail } from "@/types/vehicsim";
import styles from "@/components/analysis/AnalysisRunDetail.module.css";

type Inspection = { run: AnalysisRun; detail: FailureDetail | null };
export default function FailureDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  return <AnalysisScope><Content key={runId} /></AnalysisScope>;
}
function Content() {
  const { runId } = useParams<{ runId: string }>(), params = useSearchParams();
  const id = analysisRunId(runId), returnTo = analysisReturn(params.get("returnTo")), origin = analysisOrigin(returnTo);
  const playbackQuery = new URLSearchParams({ returnTo });
  for (const key of ["t", "signal", "compare"]) { const value = params.get(key); if (value !== null) playbackQuery.set(key, value); }
  const [refresh, setRefresh] = useState(0);
  const requestKey = `${runId}:${refresh}`;
  const [result, setResult] = useState<{ key: string; data: Inspection | null; error: string | null } | null>(null);
  useEffect(() => {
    if (id === null) return;
    let active = true;
    vehicsimApi.analysisInspection(id).then(data => { assertInspection(data, id); if (active) setResult({ key: requestKey, data, error: null }); })
      .catch(error => { if (active) setResult({ key: requestKey, data: null, error: analysisError(error) }); });
    return () => { active = false; };
  }, [id, requestKey]);
  const loading = id !== null && result?.key !== requestKey;
  const inspection = result?.key === requestKey ? result.data : null;
  const error = id === null ? "Mã lượt chạy không hợp lệ." : result?.key === requestKey ? result.error : null;
  const d = inspection?.detail, run = inspection?.run;
  const isReference = run?.aeb_mode === "OFF";
  const state = d ? classificationPresentation(d) : null;
  const disagreements = d ? legacyDisagreements(d) : [];
  const conclusion = isReference ? "Lượt đối chứng AEB tắt" : !state?.trusted ? "Chưa đủ dữ liệu kết luận" : disagreements.length ? "Kết quả cần đối chiếu" : d?.verdict === "PASS" ? "Chưa phát hiện lỗi theo đánh giá đã lưu" : "Có dấu hiệu cần kiểm tra";
  const collision = d?.outcome === "COLLISION" ? "Có ghi nhận va chạm" : d?.outcome === "SAFE" || d?.outcome === "NEAR_MISS" ? "Không ghi nhận va chạm theo kết quả đã lưu" : "Chưa xác định va chạm";
  const activation = d && !isReference ? formatMeasurement(d.metrics.aeb_activation_t, "s", 2, true) : "—";
  const impact = d?.evaluation_valid === true ? formatRunImpact(d.metrics.impact_speed_mps, d) : "—";
  const stopping = d?.evaluation_valid === true && d.status === "COMPLETED" ? formatMeasurement(d.metrics.stopping_distance_m, "m", 2, true) : "—";
  const contact = d?.outcome === "COLLISION" ? d.events.find(event => event.kind === "collision" && typeof event.t === "number" && Number.isFinite(event.t) && event.t >= 0) : undefined;
  return <VehicSimPage step={origin.testId !== null ? 5 : 3} title={id === null ? "Lượt chạy không hợp lệ" : `Kết quả ${runCode(id)}`} crumbs={[...origin.crumbs, { label: id === null ? "Mã không hợp lệ" : `Lượt chạy ${runCode(id)}` }]}>
    <div><Link className="text-[13px] font-semibold text-vehicsim-decision" href={returnTo}>{origin.back}</Link></div>
    <ErrorNote message={error} />{error && id !== null && <div><button className="analysis-button" onClick={() => setRefresh(n => n + 1)}>Thử lại</button></div>}
    {loading && <AnalysisLoading />}
    {run && !d && <section className="analysis-panel" aria-label="Run chưa có kết quả phân tích"><h2>Chưa có kết quả phân tích</h2><p>{run.end_reason || "Lượt chạy chưa có dữ liệu để kết luận."}</p>{run.error && <p role="alert">{run.error}</p>}<button className="analysis-button" onClick={() => setRefresh(n => n + 1)}>Kiểm tra lại trạng thái</button></section>}
    {d && <div className={styles.stack}>
      <section className={`analysis-panel ${styles.stack}`} aria-label="Kết luận phân tích">
        <p>{run?.family} · {run?.variant}</p><h2>{conclusion}</h2><p>{collision}.</p>
        {!isReference && state?.trusted && d.failure_type && <p>Phân loại đã lưu: {state.classification}.</p>}
        {!isReference && disagreements.length > 0 && <p role="status">Các thông tin đã lưu chưa thống nhất; chưa thể đưa ra kết luận chắc chắn.</p>}
        {isReference && <p>Lượt này chỉ dùng để đối chiếu, không tham gia đánh giá hoặc bàn giao tối ưu AEB.</p>}
        <p className="analysis-caption">Va chạm và lỗi AEB là hai kết quả khác nhau.</p>
      </section>
      {(activation !== "—" || impact !== "—" || stopping !== "—" || contact) && <section className={`analysis-panel ${styles.stack}`} aria-label="Thông tin quan trọng"><h2>Thông tin quan trọng</h2><dl className={styles.rows}>
        {activation !== "—" && <div className={styles.row}><dt>Quyết định kích hoạt AEB</dt><dd>{activation}</dd></div>}
        {contact && <div className={styles.row}><dt>Va chạm thực tế</dt><dd>{formatMeasurement(contact.t, "s", 2, true)}</dd></div>}
        {impact !== "—" && <div className={styles.row}><dt>Tốc độ va chạm tương đối</dt><dd>{impact} m/s</dd></div>}
        {stopping !== "—" && <div className={styles.row}><dt>Quãng đường dừng</dt><dd>{stopping} <small>(có thể ngoại suy)</small></dd></div>}
      </dl></section>}
      <section className="analysis-panel"><h2>Nguyên nhân</h2><p>Chưa đủ dữ liệu để xác định nguyên nhân.</p></section>
      {run?.status === "COMPLETED" && run.trace_available && <div><Link className="analysis-button" href={`/analysis/failures/${runId}/playback?${playbackQuery}`}>Phát lại mô phỏng</Link></div>}
    </div>}
  </VehicSimPage>;
}
