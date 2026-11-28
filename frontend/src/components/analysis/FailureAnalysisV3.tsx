"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { failureAnalysisV3 as api } from "@/services/failureAnalysisV3";
import { FAError, object, matchReport, type Source, type Execution, type ReportMetadata, type HandoffMetadata, type DiagnosticReport } from "./failureAnalysisV3Data";
import { FailureAnalysisV3Report } from "./FailureAnalysisV3Report";
import { FailureAnalysisDatabasePicker } from "./FailureAnalysisDatabasePicker";
import { FailureAnalysisScenarioExplorer } from "./FailureAnalysisScenarioExplorer";
import styles from "./FailureAnalysisV3.module.css";

const message = (error: unknown) => error instanceof Error ? error.message : "Chưa tải được dữ liệu.";
const sourceLabel = (source: Source) => {
  const collection = object(source.input_manifest.declared_collection);
  return collection.variant_id ? `Biến thể ${String(collection.variant_id)}` : `Lượt chạy ${source.declared_member_identities.map(v => String(v.run_id ?? v.run_key ?? "chưa rõ")).join(", ")}`;
};
function ErrorState({ error }: { error: unknown }) {
  return error ? <p role="alert" className={styles.error}>{message(error)}</p> : null;
}
function Pager({ offset, length, onPage }: { offset: number; length: number; onPage: (n: number) => void }) {
  if (!offset && length < 20) return null;
  return <div className={styles.toolbar}><button className="analysis-button" disabled={!offset} onClick={() => onPage(Math.max(0, offset - 20))}>Trang trước</button><span>Trang {offset / 20 + 1}</span><button className="analysis-button" disabled={length < 20 || offset >= 10000} onClick={() => onPage(offset + 20)}>Trang sau</button></div>;
}
export function FailureAnalysisV3({ project, canWrite, families }: { project: number; canWrite: boolean; families: { id: number; name: string }[] }) {
  const router = useRouter(), params = useSearchParams();
  const executionId = params.get("fa_execution"), reportId = params.get("fa_report");
  const [busy, setBusy] = useState(false), [offset, setOffset] = useState(0), [selected, setSelected] = useState("");
  const [sources, setSources] = useState<Source[] | null>(null), [error, setError] = useState<unknown>(null);
  const operation = useRef(0);
  const navigation = (exec: string | null, report: string | null = null) => {
    operation.current++; setBusy(false);
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of [["fa_execution", exec], ["fa_report", report]]) { if (v) q.set(k!, v); else q.delete(k!); }
    router.push(`/analysis/failures${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  useEffect(() => { let active = true; api.sources(project, offset).then(p => { if (active) { setSources(p.items); setError(null); } }, e => { if (active) setError(e); }); return () => { active = false; }; }, [project, offset]);
  useEffect(() => () => { operation.current++; }, [executionId]);
  const analyze = async () => {
    const token = ++operation.current; setBusy(true); setError(null);
    try { const result = await api.analyze(project, selected); if (token === operation.current) navigation(result.id); }
    catch (e) { if (token === operation.current) setError(e); }
    finally { if (token === operation.current) setBusy(false); }
  };
  return <section className={`analysis-panel ${styles.workspace}`} aria-label="Phân tích dữ liệu">
    {executionId ? <><button className={`analysis-button ${styles.back}`} onClick={() => navigation(null)}>← Chọn kết quả khác</button><ExecutionView key={executionId} id={executionId} reportId={reportId} project={project} onReport={id => navigation(executionId, id)} /></>
      : reportId ? <ErrorState error={new FAError("EXECUTION_LINK_REQUIRED", "Không tìm thấy lần phân tích của kết quả này.")} /> : <>
        <FailureAnalysisScenarioExplorer project={project} canWrite={canWrite} families={families} onReport={(execution, report) => navigation(execution, report)} onExecution={id => navigation(id)} />
        <details hidden className={styles.details}><summary>Phân tích theo nguồn kết quả</summary><FailureAnalysisDatabasePicker project={project} canWrite={canWrite} disabled={busy} onPending={setBusy} onExecution={id => navigation(id)} /></details>
        <details hidden className={styles.details}><summary>Kết quả phân tích trước đây</summary>
          <ErrorState error={error} />
          <div className={styles.toolbar}><label>Chọn dữ liệu<select value={selected} onChange={e => { operation.current++; setSelected(e.target.value); }} disabled={busy}><option value="">Chọn dữ liệu</option>{sources?.map(s => <option key={s.id} value={s.id}>{sourceLabel(s)}</option>)}</select></label>
          <button className="analysis-button" disabled={!selected || busy || !canWrite} onClick={() => void analyze()}>{busy ? "Đang phân tích…" : "Phân tích lại"}</button></div>
          {sources?.length === 0 && <p>Chưa có kết quả trước đây.</p>}<Pager offset={offset} length={sources?.length ?? 0} onPage={n => { setOffset(n); setSelected(""); }} />
          {selected && <SourceHistory key={selected} id={selected} project={project} onOpen={id => navigation(id)} />}
        </details>
      </>}
  </section>;
}
function SourceHistory({ id, project, onOpen }: { id: string; project: number; onOpen: (id: string) => void }) {
  const [recent, setRecent] = useState<Execution[] | null>(null), [offset, setOffset] = useState(0), [error, setError] = useState<unknown>(null);
  useEffect(() => { let active = true; api.executions(project, id, offset).then(p => { if (active) { setRecent(p.items); setError(null); } }, e => { if (active) setError(e); }); return () => { active = false; }; }, [id, project, offset]);
  return <div><ErrorState error={error} />{recent === null && !error && <p role="status">Đang tải kết quả…</p>}{recent?.length === 0 && <p>Chưa có lần phân tích nào.</p>}{recent?.map((e, i) => <p key={e.id}><button className="analysis-button" onClick={() => onOpen(e.id)}>Xem lần phân tích {offset + i + 1} · {e.created_at_utc as string}</button></p>)}<Pager offset={offset} length={recent?.length ?? 0} onPage={setOffset} /></div>;
}
function ExecutionView({ id, reportId, project, onReport }: { id: string; reportId: string | null; project: number; onReport: (id: string) => void }) {
  const [data, setData] = useState<Execution | null>(null), [metas, setMetas] = useState<ReportMetadata[]>([]), [offset, setOffset] = useState(0), [error, setError] = useState<unknown>(null), [refresh, setRefresh] = useState(0);
  useEffect(() => { let active = true; Promise.all([api.execution(project, id), api.reports(project, id, offset)]).then(([e, p]) => { if (p.items.some(m => m.execution_id !== e.id || m.source_id !== e.source_id)) throw new FAError("IDENTITY_MISMATCH", "Kết quả không khớp lần phân tích."); if (active) { setData(e); setMetas(p.items); setError(null); } }).catch(e => { if (active) setError(e); }); return () => { active = false; }; }, [project, id, offset, refresh]);
  const selected = data?.members.find(m => m.report_id === reportId);
  return <><ErrorState error={error} />{error && <button className="analysis-button" onClick={() => setRefresh(n => n + 1)}>Thử lại</button>}{!data && !error && <p role="status">Đang tải kết quả…</p>}{data && <>
    {reportId && (selected ? <ReportView key={reportId} id={reportId} execution={data} project={project} /> : <ErrorState error={new FAError("REPORT_NOT_IN_EXECUTION", "Kết quả không thuộc lần phân tích này.")} />)}
    {(data.members.length > 1 || !selected) && <h2>{data.status === "COMPLETED" ? "Đã phân tích" : data.status === "PARTIAL" ? "Đã phân tích một phần" : "Chưa thể phân tích"}</h2>}
    {(data.blocked + data.failed > 0) && <p role="status">Một số lượt chưa thể phân tích. Hãy kiểm tra dữ liệu của các lượt đó.</p>}
    {(data.members.length > 1 || !selected) && <div className={styles.table} role="region" aria-label="Kết quả các lượt chạy" tabIndex={0}><table><thead><tr><th>Lượt chạy</th><th>Trạng thái</th><th>Kết quả</th></tr></thead><tbody>{data.members.map(m => <tr key={m.member_index}><td>{m.run_key ? `Lượt ${m.run_key}` : "Chưa xác định"}</td><td>{m.status === "ANALYZED" ? "Đã phân tích" : m.status === "FAILED" ? "Phân tích thất bại" : "Chưa thể phân tích"}</td><td>{m.report_id ? <button className="analysis-button" aria-pressed={reportId === m.report_id} onClick={() => onReport(m.report_id!)}>Xem kết quả {m.run_key ?? m.member_index}</button> : "Chưa có kết quả"}</td></tr>)}</tbody></table></div>}
    <Pager offset={offset} length={metas.length} onPage={setOffset} />
    <Handoff key={data.handoff_id} id={data.handoff_id} execution={data} project={project} />
  </>}</>;
}
function ReportView({ id, execution, project }: { id: string; execution: Execution; project: number }) {
  const [data, setData] = useState<DiagnosticReport | null>(null), [error, setError] = useState<unknown>(null);
  useEffect(() => { let active = true; const load = async () => { let offset = 0, meta: ReportMetadata | undefined; do { const p = await api.reports(project, execution.id, offset); meta = p.items.find(m => m.id === id); if (meta || p.items.length < 20) break; offset += 20; } while (offset <= 10000); if (!meta) throw new FAError("REPORT_METADATA_MISSING", "Không tìm thấy kết quả của lượt chạy."); const report = await api.report(id); matchReport(report, meta, execution); if (active) setData(report); }; load().catch(e => { if (active) setError(e); }); return () => { active = false; }; }, [id, execution, project]);
  return <><ErrorState error={error} />{!data && !error && <p role="status">Đang tải kết quả…</p>}{data && <FailureAnalysisV3Report data={data} />}</>;
}
function Handoff({ id, execution, project }: { id: string; execution: Execution; project: number }) {
  const params = useSearchParams();
  const query = new URLSearchParams(params.toString()); query.delete("fa_execution"); query.delete("fa_report"); query.set("view", "dataset");
  const [data, setData] = useState<HandoffMetadata | null>(null), [error, setError] = useState<unknown>(null);
  useEffect(() => { let active = true; api.handoff(project, id).then(h => { if (h.execution_id !== execution.id || h.source_id !== execution.source_id) throw new FAError("HANDOFF_IDENTITY_MISMATCH", "Kết quả bàn giao không khớp lần phân tích."); if (active) setData(h); }).catch(e => { if (active) setError(e); }); return () => { active = false; }; }, [id, project, execution]);
  return <section aria-label="Bước tiếp theo"><h3>Bước tiếp theo</h3><ErrorState error={error} />{data ? data.dispatch_allowed && data.content_digest ? <Link className="analysis-button" href={`/aeb/mobo/new?handoff_id=${id}&handoff_digest=${data.content_digest}`}>Tiếp tục tối ưu →</Link> : <><p>Kết quả chưa đủ điều kiện để tối ưu. Hãy chuẩn bị và rà soát tập bàn giao.</p><Link className="analysis-button" href={`/analysis/failures?${query}`}>Chuẩn bị tập bàn giao →</Link></> : !error && <p role="status">Đang kiểm tra điều kiện tối ưu…</p>}</section>;
}
