"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { ErrorNote, runCode } from "@/components/VehicSimUi";
import { vi } from "@/components/vehicsimI18n";
import { AnalysisScope, AnalysisLoading, analysisError, analysisOrigin, analysisReturn, analysisRunId } from "@/components/analysisUi";
import { assertInspection, legacyDisagreements } from "@/components/analysis/analysisResultData";
import { classificationPresentation } from "@/components/analysis/analysisClassificationData";
import { diagnosticPresentation, hypothesisPresentation, object, type DiagnosticReport } from "@/components/analysis/failureAnalysisV3Data";
import { formatMeasurement, formatRunImpact } from "@/components/analysis/analysisMetricFormat";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { failureAnalysisV3 } from "@/services/failureAnalysisV3";
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
  const { ctx } = useVehicSimContext();
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
  const projectId = ctx?.project.id, scenarioId = run?.scenario_id;
  const [diagnosis, setDiagnosis] = useState<{ key: string; data: DiagnosticReport | null; error: string | null } | null>(null);
  const diagnosisKey = `${projectId}:${scenarioId}:${runId}:${refresh}`;
  useEffect(() => {
    if (!projectId || !scenarioId || id === null || run?.status !== "COMPLETED" || run.aeb_mode === "OFF") return;
    let active = true;
    const query = new URLSearchParams({ run_id: String(id), limit: "1", offset: "0", sort: "id_desc" });
    failureAnalysisV3.explorerRuns(projectId, scenarioId, query).then(async page => {
      const item = page.items.find(row => row.run_id === id && row.scenario_version_id === run.scenario_version_id);
      const report = item?.report_id ? await failureAnalysisV3.report(item.report_id) : null;
      if (active) setDiagnosis({ key: diagnosisKey, data: report, error: null });
    }).catch(error => { if (active) setDiagnosis({ key: diagnosisKey, data: null, error: analysisError(error) }); });
    return () => { active = false; };
  }, [projectId, scenarioId, id, run?.scenario_version_id, run?.status, run?.aeb_mode, diagnosisKey]);
  const diagnostic = run?.aeb_mode !== "OFF" && diagnosis?.key === diagnosisKey ? diagnosis.data : null;
  const diagnosticError = run?.aeb_mode !== "OFF" && diagnosis?.key === diagnosisKey ? diagnosis.error : null;
  const diagnosticLoading = !!projectId && !!scenarioId && run?.status === "COMPLETED" && run.aeb_mode !== "OFF" && diagnosis?.key !== diagnosisKey;
  const v3 = diagnostic ? diagnosticPresentation(diagnostic.report) : null;
  const hypotheses = diagnostic ? hypothesisPresentation(diagnostic.report) : [];
  const cause = object(diagnostic?.report.confirmed_root_cause);
  const hasConfirmedCause = ["OBSERVED", "DERIVED"].includes(String(cause.status)) && typeof cause.value === "string" && cause.value.trim() !== "";
  const causeLabels: Record<string, string> = { TARGET_DETECTION: "Phát hiện mục tiêu", TRIGGER_CONDITION: "Điều kiện kích hoạt", INTERVENTION_TIMING: "Thời điểm can thiệp", BRAKING_DELAY: "Độ trễ phanh", DECELERATION: "Khả năng giảm tốc", BRAKE_BUILDUP: "Tốc độ tăng lực phanh", RISK_PREDICTION: "Dự đoán nguy cơ", PHYSICAL_LIMIT: "Giới hạn vật lý", EXTERNAL: "Điều kiện bên ngoài AEB" };
  const isReference = run?.aeb_mode === "OFF";
  const state = d ? classificationPresentation(d) : null;
  const disagreements = d ? legacyDisagreements(d) : [];
  const conclusion = isReference ? "Lượt đối chứng AEB tắt" : v3 ? v3.conclusion : !state?.trusted ? "Chưa đủ dữ liệu kết luận" : disagreements.length ? "Kết quả cần đối chiếu" : d?.verdict === "PASS" ? "Chưa phát hiện lỗi theo đánh giá đã lưu" : "Có dấu hiệu cần kiểm tra";
  const collision = v3 ? v3.outcomeText : d?.outcome === "COLLISION" ? "Có ghi nhận va chạm" : d?.outcome === "SAFE" || d?.outcome === "NEAR_MISS" ? "Không ghi nhận va chạm theo kết quả đã lưu" : "Chưa xác định va chạm";
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
        {diagnosticLoading && <p role="status">Đang tải chẩn đoán đã lưu…</p>}
        {diagnosticError && <p role="alert">Không tải được chẩn đoán đã lưu: {diagnosticError}</p>}
        {!isReference && v3 && <><p>{v3.behaviorText}.</p><p className="analysis-caption">Nhận định từ báo cáo đã lưu; cần kiểm tra lại điều kiện áp dụng trước khi ra quyết định.</p></>}
        {!isReference && state?.trusted && d.failure_type && <p>Phân loại theo kết quả chạy: {state.classification}.</p>}
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
      {!isReference && <section className="analysis-panel"><h2>Nguyên nhân và hướng kiểm tra</h2><p>{hasConfirmedCause ? `Nguyên nhân được xác nhận theo báo cáo: ${causeLabels[String(cause.value)] ?? "chưa hỗ trợ hiển thị tên nguyên nhân"}.` : diagnostic ? "Chưa có nguyên nhân được xác nhận trong báo cáo." : "Chưa có báo cáo chẩn đoán bổ sung."}</p>{state?.trusted && d.recorded_cause && <p>Nhận định theo kết quả đã lưu: {vi(d.recorded_cause)} Cần kiểm chứng thêm nguyên nhân.</p>}{hypotheses.length > 0 && <ul>{hypotheses.map((item, i) => <li key={`${item.type}-${i}`}>{item.label} · {item.status}</li>)}</ul>}</section>}
      {run?.status === "COMPLETED" && run.trace_available && <div><Link className="analysis-button" href={`/analysis/failures/${runId}/playback?${playbackQuery}`}>Phát lại mô phỏng</Link></div>}
    </div>}
  </VehicSimPage>;
}
