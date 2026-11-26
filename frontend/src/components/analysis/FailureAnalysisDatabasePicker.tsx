"use client";
import { useEffect, useRef, useState } from "react";
import { failureAnalysisV3 as api } from "@/services/failureAnalysisV3";
import { object, FAError, type RecordValue } from "./failureAnalysisV3Data";
import type { DatabaseKind, DatabaseInspection } from "./failureAnalysisDatabaseData";
import { TechnicalDetails } from "./FailureAnalysisV3Report";
import styles from "./FailureAnalysisV3.module.css";
const failure = (e: unknown) => e instanceof FAError && e.status === 413 ? "Nguồn vượt ngân sách tiếp nhận của Module 3. Không cắt bớt member; chọn một run hoặc đề nghị tăng giới hạn phù hợp." : e instanceof Error ? e.message : "Chưa đọc được nguồn CARLA.";

export function FailureAnalysisDatabasePicker({ project, canWrite, disabled, onPending, onExecution }: {
  project: number; canWrite: boolean; disabled: boolean; onPending: (pending: boolean) => void; onExecution: (id: string) => void;
}) {
  const [kind, setKind] = useState<DatabaseKind>("runs"), [offset, setOffset] = useState(0), [refresh, setRefresh] = useState(0), [selected, setSelected] = useState(0);
  const [result, setResult] = useState<{ rows: RecordValue[]; error: string | null } | null>(null);
  const [inspection, setInspection] = useState<{ key: string; data: DatabaseInspection | null; error: string | null } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const active = useRef(false);
  const selectionKey = `${kind}:${selected}:${refresh}`;
  const detail = inspection?.key === selectionKey ? inspection.data : null;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { let current = true;
    api.databaseList(project, kind, offset).then(p => { if (current) setResult({ rows: p.items, error: null }); }, e => { if (current) setResult({ rows: [], error: e instanceof Error ? e.message : "Chưa tải được kết quả CARLA." }); });
    return () => { current = false; };
  }, [project, kind, offset, refresh]);
  useEffect(() => { if (!selected) return; let current = true;
    api.databaseInspect(project, kind, selected).then(data => { if (current) setInspection({ key: selectionKey, data, error: null }); }, e => { if (current) setInspection({ key: selectionKey, data: null, error: failure(e) }); });
    return () => { current = false; };
  }, [project, kind, selected, selectionKey]);
  const analyze = async () => {
    if (!detail?.can_analyze || !detail.source_sha256) return;
    onPending(true); setActionError(null);
    try { const e = await api.databaseAnalyze(project, kind, selected, detail.source_sha256); if (active.current) onExecution(e.id); }
    catch (e) { if (active.current) setActionError(failure(e)); }
    finally { if (active.current) onPending(false); }
  };
  return <div aria-label="Kết quả CARLA trong database" role="region">
    <p>Chọn kết quả CARLA đã hoàn tất trong database. Hệ thống tự đọc JSON gốc và lưu báo cáo; không cần tải tệp lên.</p>
    <div className={styles.toolbar}><label>Phạm vi phân tích<select aria-label="Phạm vi phân tích" value={kind} disabled={disabled} onChange={e => { setKind(e.target.value as DatabaseKind); setSelected(0); setOffset(0); setResult(null); }}><option value="runs">Một lượt chạy</option><option value="collections">Mọi lượt chạy của một biến thể</option></select></label>
      <label>Kết quả CARLA<select aria-label="Kết quả CARLA" disabled={disabled} value={selected || ""} onChange={e => { setSelected(Number(e.target.value)); setActionError(null); }}><option value="">Chọn {kind === "runs" ? "run" : "biến thể"}</option>{result?.rows.map(r => <option key={Number(r.id)} value={Number(r.id)}>{kind === "runs" ? `Run ${r.id} · Biến thể ${r.scenario_version_id} · AEB ${r.aeb_mode} · Seed ${r.random_seed} · Lặp ${r.repetition} / lần thử ${r.attempt}` : `Biến thể ${r.id} · ${r.member_count} run CARLA`}</option>)}</select></label>
      <button className="analysis-button" disabled={disabled || !canWrite || !detail?.can_analyze} onClick={() => void analyze()}>{disabled ? "Đang xử lý kết quả CARLA…" : "Phân tích kết quả CARLA"}</button><button className="analysis-button" disabled={disabled} onClick={() => { setResult(null); setRefresh(n => n + 1); }}>Tải lại kết quả CARLA</button>
    </div>
    {!result && <p role="status">Đang tải danh sách CARLA…</p>}{result?.error && <p role="alert">{result.error}</p>}{result && !result.error && !result.rows.length && <p>Chưa có kết quả CARLA hoàn tất trong phạm vi này. Module 2 cần hoàn tất run và giữ file result.json.</p>}
    {result && (offset > 0 || result.rows.length === 20) && <div className={styles.toolbar}><button className="analysis-button" disabled={disabled || !offset} onClick={() => { setOffset(n => Math.max(0, n - 20)); setSelected(0); setResult(null); }}>Trang CARLA trước</button><span>Trang {offset / 20 + 1}</span><button className="analysis-button" disabled={disabled || result.rows.length < 20 || offset >= 10000} onClick={() => { setOffset(n => n + 20); setSelected(0); setResult(null); }}>Trang CARLA sau</button></div>}
    {selected > 0 && !detail && inspection?.key !== selectionKey && <p role="status">Đang kiểm tra JSON và tham chiếu lưu trữ…</p>}
    {inspection?.key === selectionKey && inspection.error && <p role="alert">{inspection.error}</p>}{actionError && <p role="alert">{actionError} Tải lại kết quả CARLA để kiểm tra nguồn hiện tại.</p>}
    {detail && <><p>{detail.members.length} thành viên · {detail.availability}. Chỉ phân tích bản nguồn đang chọn, chưa xác nhận baseline hoặc cohort tối ưu.</p>
      {!detail.can_analyze && <p role="alert">Thiếu JSON gốc hoặc identity không khớp DB. Module 2 cần bổ sung nguồn được chỉ ra dưới đây; hệ thống không dựng JSON từ telemetry/config.</p>}
      {detail.members.filter(m => Array.isArray(m.issues) && m.issues.length).map((m, i) => <div key={i}><strong>Run {String(m.run_id)} · {String(m.availability)}</strong><ul>{(m.issues as unknown[]).map((issue, j) => { const x = object(issue); return <li key={j}>{String(x.reason_code)} · Trường/nguồn: {String(x.field)}</li>; })}</ul></div>)}
      <TechnicalDetails title="Chi tiết kiểm tra nguồn DB và member" value={detail} /></>}
    {!canWrite && <p>Chế độ chỉ đọc. Phân tích cần quyền ghi và dự án/workspace ACTIVE.</p>}
  </div>;
}
