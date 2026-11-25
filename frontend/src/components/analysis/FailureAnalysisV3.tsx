"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { failureAnalysisV3 as api } from "@/services/failureAnalysisV3";
import { FAError, object, evidenceText, matchReport, type Source, type Execution, type ReportMetadata, type HandoffMetadata, type DiagnosticReport } from "./failureAnalysisV3Data";
import { FailureAnalysisV3Report, TechnicalDetails } from "./FailureAnalysisV3Report";
import styles from "./FailureAnalysisV3.module.css";
import { FailureAnalysisDatabasePicker } from "./FailureAnalysisDatabasePicker";

const label = (source: Source) => {
  const collection = object(source.input_manifest.declared_collection);
  return collection.variant_id ? `Biến thể ${String(collection.variant_id)}` : `Run ${source.declared_member_identities.map(v => String(v.run_id ?? v.run_key ?? "?")).join(", ") || "chưa rõ"}`;
};
const message = (error: unknown) => error instanceof Error ? error.message : "Chưa tải được dữ liệu.";
function ErrorState({ error }: { error: unknown }) {
  if (!error) return null;
  return <div role="alert" className={styles.error}><p>{message(error)}</p>{error instanceof FAError && <details><summary>Chi tiết lỗi</summary><p>{error.status ? `HTTP ${error.status} · ` : ""}{error.code}</p>{error.code === "HTTP_REASON_UNAVAILABLE" && <p>Shared transport chưa cung cấp mã lỗi FA chi tiết. Không suy đoán lý do khoa học từ HTTP status.</p>}</details>}</div>;
}
function Pager({ offset, length, onPage }: { offset: number; length: number; onPage: (offset: number) => void }) {
  if (offset === 0 && length < 20) return null;
  return <div className={styles.toolbar}><button className="analysis-button" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - 20))}>Trang trước</button><span>Trang {offset / 20 + 1}</span><button className="analysis-button" disabled={length < 20 || offset >= 10000} onClick={() => onPage(offset + 20)}>Trang sau</button></div>;
}
/** Download only the exact authenticated bytes; unmount/source change discards late responses. */
function Download({ kind, id, children }: { kind: "sources" | "reports" | "handoffs"; id: string; children: string }) {
  const active = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState<unknown>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const download = async () => {
    setPending(true); setError(null);
    try {
      const bytes = await api.download(kind, id);
      if (!active.current) return;
      const url = URL.createObjectURL(bytes), anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${kind.slice(0, -1)}-${id}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { if (active.current) setError(e); }
    finally { if (active.current) setPending(false); }
  };
  return <div><button className="analysis-button" disabled={pending} onClick={() => void download()}>{pending ? "Đang tải tệp…" : children}</button><ErrorState error={error} /></div>;
}
export function FailureAnalysisV3({ project, canWrite }: { project: number; canWrite: boolean }) {
  const router = useRouter(), params = useSearchParams();
  const executionId = params.get("fa_execution"), reportId = params.get("fa_report");
  const [offset, setOffset] = useState(0), [refresh, setRefresh] = useState(0), [selected, setSelected] = useState("");
  const [sources, setSources] = useState<Source[] | null>(null), [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const operation = useRef(0);
  const navigation = (exec: string | null, report: string | null = null) => {
    operation.current++; setBusy(false);
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of [["fa_execution", exec], ["fa_report", report]]) { if (v) q.set(k!, v); else q.delete(k!); }
    router.push(`/analysis/failures${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  useEffect(() => { let active = true;
    api.sources(project, offset).then(p => { if (active) { setSources(p.items); setError(null); } }, e => { if (active) { setSources(null); setError(e); } });
    return () => { active = false; };
  }, [project, offset, refresh]);
  useEffect(() => () => { operation.current++; }, [executionId]);
  const analyze = async () => {
    const token = ++operation.current; setBusy(true); setError(null);
    try { const result = await api.analyze(project, selected); if (token === operation.current) navigation(result.id); }
    catch (e) { if (token === operation.current) setError(e); }
    finally { if (token === operation.current) setBusy(false); }
  };
  const upload = async (file: File) => {
    const token = ++operation.current; setBusy(true); setError(null);
    try { const saved = await api.upload(project, file); if (token === operation.current) { setSelected(saved.id); setOffset(0); setRefresh(x => x + 1); } }
    catch (e) { if (token === operation.current) setError(e); }
    finally { if (token === operation.current) setBusy(false); }
  };
  return <section className={`analysis-panel ${styles.workspace}`} aria-label="Phân tích dữ liệu">
    {executionId ? <><button className="analysis-button" onClick={() => navigation(null)}>← Chọn dữ liệu / kết quả đã lưu</button><ExecutionView key={executionId} id={executionId} reportId={reportId} project={project} onReport={id => navigation(executionId, id)} /></> : reportId ? <ErrorState error={new FAError("EXECUTION_LINK_REQUIRED", "Liên kết báo cáo cần kèm lần phân tích để xác minh đúng run.")} /> : <>
      <h2>Phân tích dữ liệu</h2>
      <FailureAnalysisDatabasePicker project={project} canWrite={canWrite} disabled={busy} onPending={setBusy} onExecution={id => navigation(id)} />
      <details className={styles.details}><summary>Nguồn JSON đã lưu / nhập nâng cao</summary><p>Nguồn đã nhập trước đây và công cụ upload tương thích. Luồng chính phía trên đọc trực tiếp từ database.</p>
      <div className={styles.toolbar}><label>Nguồn JSON đã lưu<select aria-label="Nguồn JSON đã lưu" value={selected} disabled={busy} onChange={e => { operation.current++; setSelected(e.target.value); }}><option value="">Chọn dữ liệu</option>{sources?.map(s => <option key={s.id} value={s.id}>{label(s)} · {s.source_schema.includes("collection") ? "Collection" : "Standalone"} · {s.created_at_utc}</option>)}</select></label><button className="analysis-button" disabled={!selected || busy || !canWrite} onClick={() => void analyze()}>{busy ? "Đang gửi yêu cầu…" : "Phân tích"}</button><button className="analysis-button" disabled={busy} onClick={() => setRefresh(x => x + 1)}>Tải lại nguồn</button></div>
      {!canWrite && <p>Chế độ chỉ đọc. Phân tích và tải nguồn mới cần quyền ghi; backend còn kiểm tra trạng thái dự án/workspace.</p>}
      <ErrorState error={error} />
      {sources === null && !error && <p role="status">Đang tải nguồn đã lưu…</p>}{sources?.length === 0 && <p>Chưa có nguồn JSON trên trang này. Có thể tải JSON từ Module 2 lên; không có nguồn không có nghĩa là không có run trong database.</p>}
      <Pager offset={offset} length={sources?.length ?? 0} onPage={n => { setOffset(n); setSelected(""); }} />
      {selected && <SourceDetails key={selected} id={selected} project={project} onOpen={id => navigation(id)} />}
      <details className={styles.details}><summary>Chưa có nguồn? Tải JSON từ Module 2</summary><p>Tệp được gửi nguyên byte. Hỗ trợ standalone result hoặc run collection; backend xác minh schema và ngân sách dữ liệu.</p><label>Tệp JSON<input aria-label="Tệp JSON" type="file" accept="application/json,.json" disabled={busy || !canWrite} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} /></label></details>
      </details>
    </>}
  </section>;
}
function SourceDetails({ id, project, onOpen }: { id: string; project: number; onOpen: (id: string) => void }) {
  const [data, setData] = useState<Source | null>(null), [recent, setRecent] = useState<Execution[]>([]), [offset, setOffset] = useState(0), [error, setError] = useState<unknown>(null);
  useEffect(() => { let active = true; Promise.all([api.source(project, id), api.executions(project, id, offset)]).then(([s, e]) => { if (active) { setData(s); setRecent(e.items); setError(null); } }, e => { if (active) setError(e); }); return () => { active = false; }; }, [id, project, offset]);
  return <div><ErrorState error={error} />{data && <><p>{label(data)} · {data.source_schema.includes("collection") ? "Collection" : "Standalone"} · {String(data.input_manifest.expected_members ?? "UNKNOWN")} thành viên · {data.status}</p><p>Đã lưu: {data.created_at_utc}. Đủ thành viên trong bản xuất không có nghĩa đã xác minh calibration hoặc đủ điều kiện tối ưu.</p><p>Độ mới so với dữ liệu hiện hành: chưa xác minh. Producer và cohort chưa có thẩm quyền xác nhận.</p><details className={styles.details}><summary>Kết quả đã phân tích</summary>{recent.length ? recent.map((e, i) => <p key={e.id}><button className="analysis-button" onClick={() => onOpen(e.id)}>Mở kết quả {offset + i + 1} · {e.status} · {String(e.created_at_utc)}</button></p>) : <p>Chưa có kết quả ở trang này.</p>}<Pager offset={offset} length={recent.length} onPage={setOffset} /></details><TechnicalDetails title="Chi tiết nguồn, manifest và truy vết" value={data} /><Download kind="sources" id={id}>Tải JSON nguồn gốc</Download></>}</div>;
}
function ExecutionView({ id, reportId, project, onReport }: { id: string; reportId: string | null; project: number; onReport: (id: string) => void }) {
  const [data, setData] = useState<Execution | null>(null), [metas, setMetas] = useState<ReportMetadata[]>([]), [offset, setOffset] = useState(0), [error, setError] = useState<unknown>(null), [refresh, setRefresh] = useState(0);
  useEffect(() => { let active = true; Promise.all([api.execution(project, id), api.reports(project, id, offset)]).then(([e, p]) => { if (p.items.some(m => m.execution_id !== e.id || m.source_id !== e.source_id)) throw new FAError("IDENTITY_MISMATCH", "Danh sách báo cáo không khớp lần phân tích."); if (active) { setData(e); setMetas(p.items); setError(null); } }).catch(e => { if (active) setError(e); }); return () => { active = false; }; }, [project, id, offset, refresh]);
  const selected = data?.members.find(m => m.report_id === reportId);
  return <><ErrorState error={error} />{error && <button className="analysis-button" onClick={() => setRefresh(n => n + 1)}>Tải lại kết quả phân tích</button>}{!data && !error && <p role="status">Đang tải kết quả đã lưu…</p>}{data && <>
    <h2>Lần phân tích · {data.status}</h2><p data-v3-accounting>Dự kiến {data.expected} · Tiếp nhận {data.accepted} · Đã phân tích {data.analyzed} · Bị chặn {data.blocked} · Lỗi {data.failed} · Thiếu {data.missing}</p><p>Thiếu là một phần của Bị chặn, không cộng hai lần. Phạm vi chỉ là manifest đã gửi, chưa phải cohort kịch bản đã niêm phong.</p>
    <div className={styles.table} role="region" aria-label="Thành viên lần phân tích" tabIndex={0}><table><thead><tr><th>Thành viên</th><th>Run</th><th>AEB / repetition</th><th>Trạng thái</th><th>Kết quả</th></tr></thead><tbody>{data.members.map(m => { const meta = metas.find(v => v.member_index === m.member_index), identity = meta?.run_identity; return <tr key={m.member_index}><td>{m.member_index}</td><td>{m.run_key ?? "UNKNOWN"}</td><td>{identity ? `${evidenceText(identity.aeb_mode)} / ${evidenceText(identity.repetition)}` : "UNKNOWN · xem trang metadata tương ứng"}</td><td>{m.status}{m.status !== "ANALYZED" && <p>{m.reason_codes.join(", ")}</p>}</td><td>{m.report_id ? <button className="analysis-button" aria-pressed={reportId === m.report_id} onClick={() => onReport(m.report_id!)}>Xem run {m.run_key ?? m.member_index}</button> : "Không có báo cáo"}</td></tr>; })}</tbody></table></div>
    <Pager offset={offset} length={metas.length} onPage={setOffset} />{!metas.length && <p>Không có báo cáo trên trang này; xem trạng thái từng thành viên ở trên.</p>}
    {reportId && (selected ? <ReportView key={reportId} id={reportId} execution={data} project={project} /> : <ErrorState error={new FAError("REPORT_NOT_IN_EXECUTION", "Báo cáo không thuộc thành viên của lần phân tích này.")} />)}
    <Handoff key={data.handoff_id} id={data.handoff_id} execution={data} project={project} />
    <details className={styles.details}><summary>Nguồn và chi tiết lần phân tích</summary><Download kind="sources" id={data.source_id!}>Tải JSON nguồn gốc</Download><TechnicalDetails title="Metadata và thành viên" value={data} /></details>
  </>}</>;
}
function ReportView({ id, execution, project }: { id: string; execution: Execution; project: number }) {
  const [data, setData] = useState<DiagnosticReport | null>(null), [error, setError] = useState<unknown>(null);
  useEffect(() => { let active = true;
    const load = async () => { let offset = 0, meta: ReportMetadata | undefined; do { const p = await api.reports(project, execution.id, offset); meta = p.items.find(m => m.id === id); if (meta || p.items.length < 20) break; offset += 20; } while (offset <= 10000); if (!meta) throw new FAError("REPORT_METADATA_MISSING", "Thiếu metadata liên kết báo cáo."); const report = await api.report(id); matchReport(report, meta, execution); if (active) setData(report); };
    load().catch(e => { if (active) setError(e); }); return () => { active = false; };
  }, [id, execution, project]);
  return <><ErrorState error={error} />{!data && !error && <p role="status">Đang tải báo cáo run…</p>}{data && <FailureAnalysisV3Report data={data} />}<Download kind="reports" id={id}>Tải Diagnostic Report JSON</Download></>;
}
function Handoff({ id, execution, project }: { id: string; execution: Execution; project: number }) {
  const [data, setData] = useState<HandoffMetadata | null>(null), [error, setError] = useState<unknown>(null);
  useEffect(() => { let active = true; api.handoff(project, id).then(h => { if (h.execution_id !== execution.id || h.source_id !== execution.source_id) throw new FAError("HANDOFF_IDENTITY_MISMATCH", "Handoff không khớp lần phân tích."); if (active) setData(h); }).catch(e => { if (active) setError(e); }); return () => { active = false; }; }, [id, project, execution]);
  return <section aria-label="Báo cáo bàn giao"><h3>Báo cáo bàn giao — chỉ phục vụ chẩn đoán</h3><ErrorState error={error} />{data ? <><p>{data.status} · Chưa đủ điều kiện đưa vào tối ưu · dispatch_allowed=false</p><p>Tệp bàn giao: {data.content_digest ? "Đã có" : "Chưa được tạo"}. Đây là tài nguyên riêng với dataset v2 và yêu cầu tối ưu.</p><TechnicalDetails title="Xem lý do và khả năng tương thích" value={{ reason_codes: data.reason_codes, consumer_compatibility: data.consumer_compatibility, eligibility: data.eligibility ?? "UNKNOWN", handoff_schema: data.handoff_schema, source_id: data.source_id, execution_id: data.execution_id, content_digest: data.content_digest }} />{data.content_digest && <Download kind="handoffs" id={id}>Tải Handoff JSON</Download>}</> : !error && <p role="status">Đang tải trạng thái bàn giao…</p>}</section>;
}
