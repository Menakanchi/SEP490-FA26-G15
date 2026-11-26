"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { VehicSimPage } from "@/components/VehicSimPage";
import { ErrorNote, PillButton, fmt, runCode } from "@/components/VehicSimUi";
import { AnalysisScope, AnalysisBadge, AnalysisLoading, analysisError, analysisLabel, analysisOrigin, analysisReturn, analysisRunId } from "@/components/analysisUi";
import { MOTION_SIGNALS, type MotionSignal } from "@/components/MotionTelemetryChart";
import { AnalysisRunSummary, AnalysisRunContext } from "@/components/analysis/AnalysisRunSummary";
import { AnalysisRunTimeline, AnalysisRunTelemetry } from "@/components/analysis/AnalysisRunTelemetry";
import { AnalysisRunEvidence } from "@/components/analysis/AnalysisRunEvidence";
import { assertInspection } from "@/components/analysis/analysisResultData";
import { finite, recordedRange, runMarkers } from "@/components/analysis/analysisRunData";
import styles from "@/components/analysis/AnalysisRunDetail.module.css";
import { vehicsimApi } from "@/services/vehicsim";
import type { AnalysisRun, FailureDetail } from "@/types/vehicsim";

const SECTIONS = [["telemetry", "Telemetry & chỉ số"], ["evidence", "Nhận định & bằng chứng"]] as const;
type Inspection = { run: AnalysisRun; detail: FailureDetail | null };

export default function FailureDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  return <AnalysisScope><FailureDetailContent key={runId} /></AnalysisScope>;
}

function FailureDetailContent() {
  const router = useRouter();
  const { canWrite } = useVehicSimContext();
  const { runId } = useParams<{ runId: string }>();
  const validId = analysisRunId(runId);
  const params = useSearchParams();
  const [refresh, setRefresh] = useState(0);
  const requestKey = `${runId}:${refresh}`;
  const [result, setResult] = useState<{ key: string; data: Inspection | null; error: string | null } | null>(null);
  const alive = useRef(false), actionLock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const loading = validId !== null && result?.key !== requestKey;
  const inspection = result?.key === requestKey ? result.data?.run : null;
  const d = result?.key === requestKey ? result.data?.detail : null;
  const error = validId === null ? "Mã lượt chạy không hợp lệ." : result?.key === requestKey ? result.error : null;
  const section = SECTIONS.some(([key]) => key === params.get("section")) ? params.get("section")! : "summary";
  const signal = (MOTION_SIGNALS.some(item => item.key === params.get("signal")) ? params.get("signal") : "ego_accel_mps2") as MotionSignal;
  const returnTo = analysisReturn(params.get("returnTo"));
  const origin = analysisOrigin(returnTo);
  const compareId = analysisRunId(params.get("compare") ?? "");
  const range = d ? recordedRange(d) : null;
  const requestedTime = Number(params.get("t"));
  const cursor = range ? Math.max(range.min, Math.min(range.max, finite(requestedTime) && requestedTime >= 0 ? requestedTime : range.min)) : 0;
  const canPlayback = Boolean(inspection?.trace_available && inspection.status === "COMPLETED");
  const playbackHref = `/analysis/failures/${runId}/playback?t=${cursor}&signal=${signal}&returnTo=${encodeURIComponent(returnTo)}${compareId === null ? "" : `&compare=${compareId}`}`;
  const markers = d ? runMarkers(d) : [];

  useEffect(() => {
    if (validId === null) return;
    let active = true;
    vehicsimApi.analysisInspection(validId)
      .then(data => {
        assertInspection(data, validId);
        if (active) setResult({ key: requestKey, data, error: null });
      })
      .catch(err => { if (active) setResult({ key: requestKey, data: null, error: analysisError(err) }); });
    return () => { active = false; };
  }, [runId, validId, requestKey]);

  function update(values: Record<string, string | number>) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) next.set(key, String(value));
    window.history.replaceState(null, "", `/analysis/failures/${runId}?${next}`);
  }
  function moveTab(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? SECTIONS.length - 1
      : event.key === "ArrowRight" ? (index + 1) % SECTIONS.length : event.key === "ArrowLeft" ? (index + SECTIONS.length - 1) % SECTIONS.length : null;
    if (next === null) return;
    event.preventDefault(); update({ section: SECTIONS[next][0] });
    document.getElementById(`run-tab-${SECTIONS[next][0]}`)?.focus();
  }
  return <VehicSimPage step={origin.testId !== null ? 5 : 3} title={validId === null ? "Lượt chạy không hợp lệ" : `Kết quả ${runCode(validId)}`}
    crumbs={[...origin.crumbs, { label: validId === null ? "Mã không hợp lệ" : `Lượt chạy ${runCode(validId)}` }]}
    subtitle={inspection ? `${inspection.family} · ${inspection.variant} · seed ${inspection.seed}` : "Chi tiết và telemetry từ kết quả run đã lưu."}
    badges={inspection && <><AnalysisBadge value={inspection.status} /></>}
>
    <div><Link className="text-[13px] font-semibold text-vehicsim-decision" href={returnTo}>{origin.back}</Link></div>
    <ErrorNote message={error ?? (actionError?.id === runId ? actionError.message : null)} />
    {error && <div><button className="analysis-button" onClick={() => setRefresh(value => value + 1)}>Thử tải lại</button></div>}
    {loading && <AnalysisLoading />}
    {inspection && <section className={`analysis-panel ${styles.stack}`} aria-label="Danh tính và nguồn dữ liệu run">
      <p className="analysis-caption">Run #{inspection.run_id} · {inspection.variant} · seed {inspection.seed} · {analysisLabel(inspection.status)}</p>
      <details><summary>Danh tính và nguồn dữ liệu</summary><dl className={styles.identity}>
        <div><dt>Run / kịch bản / biến thể</dt><dd>#{inspection.run_id} / #{inspection.scenario_id} / #{inspection.scenario_version_id}</dd></div>
        <div><dt>Nhóm tình huống từ API</dt><dd>{d?.environment?.category || "Chưa có category"}</dd></div>
        <div><dt>Simulator / bước thời gian</dt><dd>{inspection.simulator || "Chưa có danh tính simulator"} · dt {inspection.dt ?? "—"} s</dd></div>
        <div><dt>Baseline / cấu hình</dt><dd>#{inspection.baseline_id} · {d?.config ?? "—"}</dd></div>
        <div><dt>Phương tiện</dt><dd>#{inspection.vehicle_id} · {d?.vehicle ?? "—"}</dd></div>
        <div><dt>Thời điểm chạy</dt><dd>{fmt.date(d?.date ?? inspection.created_at)}</dd></div>
      </dl>
      {d?.environment?.category && !["CP_CROSSING", "CCRS", "CCRM", "CCRB"].includes(d.environment.category) && <p className="analysis-caption">Nhóm tình huống này chưa được hỗ trợ bởi bộ mô phỏng hiện hành. Không dùng các số đã lưu để tự suy ra phân loại hoặc nguyên nhân.</p>}
      <div className={styles.source} data-carla={inspection.simulator?.startsWith("carla")}>
        Chỉ số và tín hiệu do backend cung cấp từ kết quả run đã lưu. API chưa cung cấp chế độ AEB từng run; không suy ra ON/OFF từ tên cấu hình. Không mặc định đây là dữ liệu sensor thô.
        {inspection.simulator?.startsWith("carla") && " Hiệu chuẩn CARLA phụ thuộc xe/profile; API chưa xác nhận calibration từng run; số liệu chỉ phục vụ quan sát/đối chiếu, không dùng làm bằng chứng regression."}
      </div>
      {d?.evaluation_valid === false && <p role="status" className="analysis-caption">Run chưa có kết quả AEB hợp lệ; không dùng các số hiện có để kết luận an toàn.</p>}
      </details>
    </section>}
    {inspection && !d && <section className="analysis-panel space-y-3" aria-label="Run chưa có kết quả phân tích">
      <h2>Run #{inspection.run_id} · {analysisLabel(inspection.status)}</h2>
      <p className="analysis-caption">{inspection.end_reason ?? "Chưa có kết quả"}</p>
      <p role="status">Không có kết quả AEB hợp lệ để kết luận an toàn hoặc tính objective.</p>
      <p className="analysis-caption">{["PENDING", "RUNNING", "PAUSED"].includes(inspection.status) ? "Lượt chạy chưa hoàn tất. Có thể kiểm tra lại trạng thái; chưa có kết quả không có nghĩa là an toàn." : "Xem lý do kết thúc ở trên hoặc trở về danh sách để chọn lượt chạy khác."}</p>
      <div><button className="analysis-button" onClick={() => setRefresh(value => value + 1)}>Kiểm tra lại trạng thái</button></div>
      {inspection.error && <p role="alert">{inspection.error}</p>}
    </section>}
    {d && <>
      <div id="run-panel-summary"><AnalysisRunSummary detail={d} run={inspection ?? null} returnTo={returnTo} /></div>
      <details className="analysis-disclosure" data-run-investigation open={section !== "summary"}
        onToggle={event => { if (event.currentTarget.open !== (section !== "summary")) update({ section: event.currentTarget.open ? "telemetry" : "summary" }); }}>
        <summary>Điều tra chuyên sâu</summary>
        <p className="analysis-caption">Đối chiếu các mốc đã ghi với tín hiệu và bằng chứng. Nhận định theo luật chưa là nguyên nhân đã xác nhận.</p>
        <AnalysisRunTimeline detail={d} cursor={cursor} onSeek={time => update({ t: time })} playbackHref={canPlayback ? playbackHref : null} />
        <div role="tablist" aria-label="Nội dung điều tra run" className={styles.tabs}>{SECTIONS.map(([key, label], index) =>
          <button key={key} id={`run-tab-${key}`} role="tab" aria-selected={section === key} aria-controls={`run-panel-${key}`}
            tabIndex={section === key ? 0 : -1} onKeyDown={event => moveTab(event, index)} onClick={() => update({ section: key })}>{label}</button>)}</div>
        <div id="run-panel-telemetry" role="tabpanel" aria-labelledby="run-tab-telemetry" tabIndex={0} hidden={section !== "telemetry"}>
          <AnalysisRunTelemetry key={d.run_id} nominalStep={inspection?.run_id === d.run_id ? inspection.dt : undefined} detail={d} markers={markers} cursor={cursor} signal={signal} onSignal={signal => update({ signal })} />
        </div>
        <div id="run-panel-evidence" role="tabpanel" aria-labelledby="run-tab-evidence" tabIndex={0} hidden={section !== "evidence"}>
          <AnalysisRunEvidence detail={d} returnTo={returnTo} playbackAvailable={canPlayback} />
        </div>
        <AnalysisRunContext detail={d} run={inspection ?? null} cursor={cursor} returnTo={returnTo} />
      </details>
    </>}
    <details className="analysis-disclosure"><summary>Phát lại và tác vụ khác</summary><div className="analysis-toolbar">

      <PillButton disabled={!inspection} title="Xuất OpenSCENARIO cùng biến thể, AEB, xe và seed của lượt này"
        onClick={() => { setActionError(null); void vehicsimApi.downloadRunXosc(Number(runId)).catch(err => { if (alive.current) setActionError({ id: runId, message: analysisError(err) }); }); }}>Tải .xosc</PillButton>
      <PillButton disabled={!inspection || !canWrite || running} onClick={async () => {
        if (actionLock.current || !inspection || !canWrite) return;
        actionLock.current = true; setRunning(true); setActionError(null);
        try { const run = await vehicsimApi.runOnCarla(Number(runId)); if (alive.current) router.push(`/analysis/carla?run=${run.run_id}`); }
        catch (err) { if (alive.current) setActionError({ id: runId, message: analysisError(err) }); } finally { actionLock.current = false; if (alive.current) setRunning(false); }
      }}>{running ? "Đang xếp hàng…" : "Chạy trên CARLA"}</PillButton>
      {canPlayback ? <PillButton variant="dark" href={playbackHref}>▶ Phát lại</PillButton> : <PillButton variant="dark" disabled title="Run cần hoàn tất và có telemetry">▶ Phát lại</PillButton>}

    </div><p className="analysis-caption">Chạy trên CARLA tạo lượt mô phỏng mới; không phải chạy lại chẩn đoán. Tệp .xosc là cấu hình mô phỏng, không phải báo cáo chẩn đoán.</p></details>
  </VehicSimPage>;
}
