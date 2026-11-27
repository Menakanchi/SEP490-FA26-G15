"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnalysisActionError, AnalysisBadge, AnalysisLoading, AnalysisPager, AnalysisTableRegion, eligible } from "@/components/analysisUi";
import { ErrorNote, PillButton } from "@/components/VehicSimUi";
import type { AnalysisRun } from "@/types/vehicsim";
import { type ChosenRun, type SelectionCheck, type SelectionRole } from "./analysisSelectionData";
import { readSavedSelection, sameSavedSelection, type SavedSelection } from "./analysisSnapshotData";
import { vehicsimApi } from "@/services/vehicsim";
import { failureAnalysisV3 } from "@/services/failureAnalysisV3";
import { FAError, type ApprovedContext, type Execution, type HandoffMetadata } from "./failureAnalysisV3Data";
import styles from "./AnalysisDatasetPreparation.module.css";

type Props = {
  project: number;
  selection: ChosenRun[]; checks: SelectionCheck[]; ready: boolean; canWrite: boolean; canSave: boolean;
  operation: "save" | "handoff" | null; operationError: string | null; errorKind: "save" | "handoff" | null;
  snapshotId: number; hasSnapshot: boolean; snapshot: SavedSelection | null; snapshotLoading: boolean; snapshotError: string | null;
  search: string; returnTo: string; renderSelection: (run: AnalysisRun) => ReactNode;
  onSearch: (value: string) => void; onOpenRuns: () => void; onRemove: (run: AnalysisRun) => void;
  checkedAt: string | null; onClear: () => void; onSave: () => void; onCheckHandoff: () => void; onOpenOptimizer: () => void; onRetrySnapshot: () => void;
};

export function AnalysisDatasetPreparation(p: Props) {
  const busy = p.operation !== null, editable = p.ready && p.canWrite && !busy;
  const groups = ["OPTIMIZATION", "VALIDATION"] as const;
  const query = p.search.trim().toLocaleLowerCase("vi");
  return <div className={styles.stack}>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Trạng thái bản nháp">
      <div className="analysis-toolbar"><div><h2>Bản nháp đang chọn</h2><p className="analysis-caption">Chọn lượt chạy cho hai tập, sau đó kiểm tra và chốt.</p></div><PillButton disabled={!p.ready || busy} onClick={p.onOpenRuns}>Thêm lượt chạy</PillButton></div>
      {!p.ready ? <AnalysisLoading /> : <>
        <div className={styles.counts}>{groups.map(role => {
          const chosen = p.selection.filter(item => item.role === role), safe = chosen.filter(({run}) => run.outcome === "SAFE").length;
          return <article key={role} aria-label={`Thống kê bản nháp ${role === "OPTIMIZATION" ? "tối ưu" : "xác minh"}`}><h3>{role === "OPTIMIZATION" ? "Tập tối ưu" : "Tập xác minh độc lập"}</h3><strong>{chosen.length}<small> run đã chọn</small></strong><p>{safe} ca an toàn · {chosen.length - safe} kết quả khác</p></article>;
        })}</div>
        {p.selection.length === 0 ? <div className="analysis-state"><strong>Chưa có run trong bản nháp.</strong><p>Mở Lượt chạy, chọn Tối ưu hoặc Xác minh cho từng run. Giữ ca an toàn trong cả hai tập.</p><button className="analysis-button" onClick={p.onOpenRuns}>Chọn run từ baseline →</button></div> : <p className="analysis-caption">Bản nháp được giữ trong phiên; thay đổi không ảnh hưởng tập đã chốt.</p>}
      </>}
    </section>
    {p.ready && p.selection.length > 0 && <details className={`analysis-panel ${styles.details}`}>
      <summary>Xem hoặc chỉnh các lượt đã chọn ({p.selection.length})</summary>
      <div className={styles.stack}>
        <div className={styles.search}><label>Tìm trong bản nháp<input type="search" aria-label="Tìm trong bản nháp" placeholder="Mã run, biến thể, họ hoặc seed…" value={p.search} onChange={event => p.onSearch(event.target.value)} /></label>{p.search && <button className="analysis-button" onClick={() => p.onSearch("")}>Xóa tìm kiếm bản nháp</button>}</div>
        <div className={styles.groups}>{groups.map(role => <DraftGroup key={role} role={role} items={p.selection.filter(item => item.role === role)} query={query} returnTo={p.returnTo} editable={editable} renderSelection={p.renderSelection} onRemove={p.onRemove} />)}</div>
      </div>
    </details>}
    <section className={`analysis-panel ${styles.stack}`} aria-label="Kiểm tra bản nháp">
      <div><h2>Kiểm tra và chốt</h2><p className="analysis-caption">Các điều kiện còn thiếu sẽ hiện bên dưới.</p></div>
      <div className={styles.validation}>
        <ul className={styles.checks}>{p.checks.filter(check => !p.ready || !check.ok).map(check => <li key={check.label} data-passed={p.ready && check.ok}><span aria-label={!p.ready ? "Chưa tải lựa chọn" : "Còn thiếu điều kiện"}>○</span><div><strong>{check.label}</strong><p>{check.help}</p></div></li>)}{p.ready && p.checks.every(check => check.ok) && <li data-passed="true"><span aria-hidden="true">✓</span><strong>Đã đủ điều kiện để gửi kiểm tra.</strong></li>}</ul>
        <div className={styles.actions}>
          <h3>{!p.ready ? "Đang khôi phục lựa chọn" : p.canSave ? "Sẵn sàng chốt" : "Bản nháp chưa thể chốt"}</h3>
          <p>Máy chủ sẽ kiểm tra lại dữ liệu và baseline trước khi lưu.</p>
          {!p.canWrite && <p>Bạn có quyền đọc; chỉnh lựa chọn và chốt tập cần quyền ghi.</p>}
          <PillButton variant="dark" disabled={!p.canSave || busy} onClick={p.onSave}>{p.operation === "save" ? "Đang chốt hai tập…" : "Chốt tập"}</PillButton>
          <button className="analysis-button" disabled={!editable || !p.selection.length} onClick={p.onClear}>Bỏ lựa chọn</button>
        </div>
      </div>
      {p.errorKind === "save" && <AnalysisActionError message={p.operationError} nextAction="Lựa chọn vẫn được giữ. Hãy kiểm tra lại các lượt chạy rồi thử chốt tập." />}
    </section>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Snapshot và bàn giao">
      <div><h2>Tập đã chốt và bàn giao</h2><p className="analysis-caption">Tập đã chốt không thay đổi khi chỉnh bản nháp.</p></div>
      {p.snapshotLoading ? <AnalysisLoading /> : p.snapshotError ? <><ErrorNote message={p.snapshotError} /><div><button className="analysis-button" disabled={!p.snapshotId} onClick={p.onRetrySnapshot}>Thử tải lại tập đã chốt</button></div></> : p.snapshot ? <>
        <div className={styles.savedStatus} role="status"><strong>Đã lưu tập</strong><span>{p.snapshot.baseline_current === true ? "Baseline hiện hành. Hãy rà soát dữ liệu trước khi phân tích." : "Baseline đã đổi hoặc chưa được xác nhận. Hãy rà lại nguồn và chốt tập mới để bàn giao."}</span></div>
        <div className={styles.snapshotSummary}><h2>Tập đã chốt #{p.snapshot.id} · {p.snapshot.scenario.name}</h2><p className="analysis-caption">{p.snapshot.optimization_run_ids.length} run tối ưu · {p.snapshot.validation_run_ids.length} run xác minh</p>
          {p.snapshot.evaluation.carla_observational_only && <p className="text-vehicsim-warn text-[12px]">Kết quả CARLA chỉ dùng để quan sát và đối chiếu, chưa xác nhận hiệu chuẩn hay an toàn thực địa.</p>}
          <details className={styles.details}><summary>Xem lượt chạy đã chọn</summary><ul>{p.snapshot.runs.map(run => <li key={run.run_id}><Link href={`/analysis/failures/${run.run_id}?returnTo=${encodeURIComponent(p.returnTo)}`}>{run.variant} · lượt {run.run_id}</Link> — {p.snapshot!.optimization_run_ids.includes(run.run_id) ? "Tối ưu" : "Xác minh"}</li>)}</ul></details>
        </div>
        <V3Review key={`${p.project}:${p.snapshot.id}:${p.snapshot.baseline_current}:${p.snapshot.dataset_digest}`} project={p.project} snapshot={p.snapshot} canWrite={p.canWrite} disabled={busy} />
        <details className={styles.details}><summary>Bàn giao theo quy trình trước</summary><div className={styles.handoff}><div><h3>Bàn giao tập theo quy trình trước</h3><p className="analysis-caption">Kiểm tra và mở tối ưu theo quy trình dataset hiện có.</p></div>
          <PillButton variant="dark" disabled={busy || p.snapshot.baseline_current !== true} onClick={p.onCheckHandoff}>{p.operation === "handoff" ? "Đang kiểm tra bàn giao…" : "Kiểm tra trước bàn giao"}</PillButton>
        </div>
        {p.checkedAt && <div className={styles.savedStatus} role="status" data-handoff-checked><strong>Đã kiểm tra tập lúc {p.checkedAt}</strong><span>Hệ thống sẽ kiểm tra lại dữ liệu trước khi tối ưu.</span><PillButton onClick={p.onOpenOptimizer} disabled={busy || p.snapshot.baseline_current !== true}>Mở module tối ưu →</PillButton></div>}
        {p.errorKind === "handoff" && <AnalysisActionError message={p.operationError} nextAction="Tập đã chốt vẫn được giữ. Hãy tải lại và kiểm tra trước khi tiếp tục." />}
        </details>
      </> : !p.hasSnapshot && <div className="analysis-state">Chưa có tập đã chốt. Hãy chọn đủ hai tập rồi nhấn Chốt tập.</div>}
    </section>
  </div>;
}

/** A person's explicit review binds the saved selection; the server validates all source evidence. */
function V3Review({ project, snapshot, canWrite, disabled }: { project: number; snapshot: SavedSelection; canWrite: boolean; disabled: boolean }) {
  const [reason, setReason] = useState(""), [controls, setControls] = useState<number[]>([]);
  const [canonical, setCanonical] = useState(false), [calibration, setCalibration] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [context, setContext] = useState<ApprovedContext | null>(null), [result, setResult] = useState<{ execution: Execution; handoff: HandoffMetadata } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const alive = useRef(false), lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const safe = snapshot.runs.filter(run => run.outcome === "SAFE");
  const bothPartitions = [snapshot.optimization_run_ids, snapshot.validation_run_ids].every(ids => ids.some(id => controls.includes(id)));
  const writable = project > 0 && canWrite && snapshot.baseline_current === true && !disabled;
  const canAnalyze = writable && !busy && reason.trim().length >= 3 && reason.trim().length <= 2000 && canonical && calibration && confirmed && bothPartitions;
  const missing = [
    !bothPartitions && "rà soát ít nhất một ca đối chứng trong mỗi tập",
    (reason.trim().length < 3 || reason.trim().length > 2000) && "nhập lý do xác nhận (3–2000 ký tự)",
    !(canonical && calibration && confirmed) && "hoàn thành ba xác nhận",
  ].filter(Boolean);
  const analyze = async () => {
    if (!canAnalyze || lock.current) return;
    lock.current = true; setBusy(true); setError(null); setResult(null);
    try {
      let approved = context;
      if (!approved) {
        const current = readSavedSelection(await vehicsimApi.analysisHandoff(snapshot.id), snapshot.id);
        if (!alive.current) return;
        if (!sameSavedSelection(snapshot, current) || current.baseline_current !== true || current.handoff_ready !== true
            || typeof current.dataset_digest !== "string" || !/^[a-f0-9]{64}$/.test(current.dataset_digest))
          throw new Error("Tập đã chốt hoặc nguồn đã thay đổi. Tải lại snapshot và rà soát trước khi xác nhận.");
        approved = await failureAnalysisV3.createContext({ dataset_id: snapshot.id, dataset_digest: current.dataset_digest,
          reason: reason.trim(), confirmed: true, canonical_targets_only: true, calibration_not_applicable: true, nonhazard_run_ids: controls });
        if (!alive.current) return;
        setContext(approved);
      }
      const execution = await failureAnalysisV3.analyzeContext(project, approved.context_id);
      if (!alive.current) return;
      if (execution.source_id !== approved.source_id) throw new Error("Lần phân tích không dùng đúng nguồn database của context đã xác nhận.");
      const handoff = await failureAnalysisV3.handoff(project, execution.handoff_id);
      if (!alive.current) return;
      if (handoff.execution_id !== execution.id || handoff.source_id !== execution.source_id || handoff.context_id !== approved.context_id)
        throw new Error("Handoff không khớp context, nguồn hoặc lần phân tích vừa tạo.");
      setResult({ execution, handoff });
    } catch (e) { if (alive.current) setError(e instanceof FAError ? `${e.message} (${e.code})` : e instanceof Error ? e.message : "Chưa tạo được bàn giao V3."); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const reset = () => { if (!busy) { setContext(null); setResult(null); setError(null); setConfirmed(false); } };
  return <section className={styles.stack} aria-label="Rà soát bàn giao V3">
    <div><h3>Phân tích và bàn giao V3</h3><p className="analysis-caption">Rà soát ca đối chứng và xác nhận phạm vi trước khi phân tích.</p></div>
    <fieldset className={styles.stack} disabled={!writable || busy || Boolean(context)}>
      <legend className="sr-only">Xác nhận phạm vi phân tích V3</legend>
      <div className={styles.groups}>{(["OPTIMIZATION", "VALIDATION"] as const).map(role => {
        const ids = role === "OPTIMIZATION" ? snapshot.optimization_run_ids : snapshot.validation_run_ids;
        return <fieldset key={role} className={styles.stack}><legend>{role === "OPTIMIZATION" ? "Ca đối chứng an toàn — tập tối ưu" : "Ca đối chứng an toàn — tập xác minh"}</legend>
          <p className="analysis-caption">Xem bằng chứng và chọn ít nhất một ca không có nguy cơ. Nhãn SAFE không thay cho việc rà soát.</p>
          {safe.filter(run => ids.includes(run.run_id)).map(run => <label key={run.run_id} className="flex items-start gap-2 text-[13px]"><input type="checkbox" checked={controls.includes(run.run_id)} onChange={e => setControls(old => e.target.checked ? [...old, run.run_id] : old.filter(id => id !== run.run_id))} /><span>Đã rà soát ca đối chứng #{run.run_id} · {run.variant}</span><Link href={`/analysis/failures/${run.run_id}`} target="_blank" rel="noopener noreferrer">Xem run</Link></label>)}
          {!safe.some(run => ids.includes(run.run_id)) && <p role="status">Chưa có ca SAFE trong tập này để rà soát.</p>}
        </fieldset>;
      })}</div>
      <label className={styles.stack}>Lý do xác nhận bàn giao V3<textarea aria-label="Lý do xác nhận bàn giao V3" minLength={3} maxLength={2000} rows={3} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" checked={canonical} onChange={e => setCanonical(e.target.checked)} /><span>Chỉ tối ưu ba chỉ số đã lưu; giữ ràng buộc va chạm và phanh oan hiện hành.</span></label>
      <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" checked={calibration} onChange={e => setCalibration(e.target.checked)} /><span>Hiệu chuẩn vật lý không áp dụng trong phạm vi này. Tôi không xác nhận hiệu chuẩn, nguyên nhân vật lý hay an toàn thực địa.</span></label>
      <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>Tôi đã rà soát lựa chọn, hai tập độc lập và ca đối chứng; chấp nhận miền tham số hiện hành trong giới hạn bộ tối ưu và danh mục, và sẽ xem các khoảng trước khi chạy. Người duyệt vẫn quyết định về ứng viên.</span></label>
    </fieldset>
    {writable && !busy && !context && missing.length > 0 && <p className="analysis-caption">Để tiếp tục: {missing.join("; ")}.</p>}
    <div className={styles.handoff}><PillButton variant="dark" disabled={!canAnalyze} onClick={() => void analyze()}>{busy ? "Đang phân tích và lưu bàn giao V3…" : context ? "Thử lại phân tích với context đã lưu" : "Xác nhận và phân tích V3"}</PillButton>{context && <button className="analysis-button" disabled={busy || !writable} onClick={reset}>Rà soát lại xác nhận</button>}</div>
    {!canWrite && <p className="analysis-caption">Tạo context và phân tích yêu cầu quyền ghi.</p>}
    <ErrorNote message={error} />
    {context && <p className="analysis-caption">Đã lưu xác nhận; có thể thử lại nếu cần.</p>}
    {result && <div className={styles.savedStatus} role="status"><strong>{result.handoff.dispatch_allowed ? "Sẵn sàng tối ưu" : "Chưa đủ điều kiện tối ưu"}</strong><span>{result.handoff.dispatch_allowed ? "Có thể tiếp tục sang tối ưu." : "Hãy kiểm tra lại dữ liệu và điều kiện bàn giao."}</span>
      <PillButton href={`/analysis/failures?fa_execution=${result.execution.id}`}>Xem phân tích V3</PillButton>
      {result.handoff.dispatch_allowed && result.handoff.content_digest && <PillButton href={`/aeb/mobo/new?handoff_id=${result.handoff.id}&handoff_digest=${result.handoff.content_digest}`}>Mở MOBO từ handoff V3 →</PillButton>}
    </div>}
  </section>;
}

function DraftGroup({ role, items, query, returnTo, editable, renderSelection, onRemove }: {
  role: SelectionRole; items: ChosenRun[]; query: string; returnTo: string; editable: boolean;
  renderSelection: (run: AnalysisRun) => ReactNode; onRemove: (run: AnalysisRun) => void;
}) {
  const [requestedPage, setPage] = useState(1), [size, setSize] = useState(10);
  const matches = items.filter(({run}) => `${run.run_id} ${run.family} ${run.variant} ${run.seed}`.toLocaleLowerCase("vi").includes(query));
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(matches.length / size)));
  const name = role === "OPTIMIZATION" ? "Tập tối ưu trong bản nháp" : "Tập xác minh trong bản nháp";
  return <section className={`analysis-panel ${styles.stack}`} aria-label={name}>
    <div><h2>{name}</h2><p className="analysis-caption">{matches.length} / {items.length} run · {role === "OPTIMIZATION" ? "Dùng để tìm tham số AEB." : "Giữ độc lập để xác minh ứng viên AEB."} Tìm kiếm không bỏ run khỏi lựa chọn.</p></div>
    {matches.length > 0 ? <AnalysisTableRegion className={styles.tableWrap} label={`Bảng ${name.toLocaleLowerCase("vi")}, cuộn ngang`}><table className={`analysis-table ${styles.table}`}>
      <caption className="sr-only">{name}, seed, nguồn và số đo đã lưu</caption><thead><tr><th scope="col">Run / biến thể / nguồn</th><th scope="col">Kết quả / bằng chứng</th><th scope="col">Tập / thao tác</th></tr></thead>
      <tbody>{matches.slice((page - 1) * size, page * size).map(({run}) => <tr key={run.run_id} data-draft-run={run.run_id}>
        <td><Link href={`/analysis/failures/${run.run_id}?returnTo=${encodeURIComponent(returnTo)}`} aria-label={`Chi tiết run đã chọn ${run.run_id}`}>#{run.run_id} · {run.variant}</Link><small>{run.family}</small></td>
        <td><AnalysisBadge value={run.outcome} /><small>{eligible(run) ? "Sẵn sàng kiểm tra" : "Cần kiểm tra lượt chạy"}</small></td>
        <td><div className={styles.rowActions}>{renderSelection(run)}<button className="analysis-button" disabled={!editable} aria-label={`Bỏ run ${run.run_id} khỏi bản nháp`} onClick={() => onRemove(run)}>Bỏ run</button></div></td>
      </tr>)}</tbody>
    </table></AnalysisTableRegion> : <div className="analysis-state">{items.length ? "Không có run khớp từ khóa trong tập này." : "Chưa chọn run cho tập này."}</div>}
    {items.length > 0 && <AnalysisPager label={role === "OPTIMIZATION" ? "Phân trang tập tối ưu" : "Phân trang tập xác minh"} page={page} size={size} total={matches.length} onPage={setPage} onSize={value => { setPage(1); setSize(value); }} />}
  </section>;
}
