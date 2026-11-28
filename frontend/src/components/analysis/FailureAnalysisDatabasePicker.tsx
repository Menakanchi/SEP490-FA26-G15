"use client";
import { useEffect, useRef, useState } from "react";
import { failureAnalysisV3 as api } from "@/services/failureAnalysisV3";
import { FAError, type RecordValue } from "./failureAnalysisV3Data";
import type { DatabaseKind, DatabaseInspection } from "./failureAnalysisDatabaseData";
import styles from "./FailureAnalysisV3.module.css";
const failure = (e: unknown) => {
  if (e instanceof FAError && ["STORED_SOURCE_IDENTITY_MISMATCH", "DB_PRODUCER_RESULT_REVISION_MISMATCH"].includes(e.code)) return "Nguồn dữ liệu không khớp định danh hoặc checksum đã lưu. Chưa thể phân tích; hãy kiểm tra lại nguồn.";
  return e instanceof FAError && e.status === 413 ? "Nguồn vượt ngân sách tiếp nhận của Module 3. Không cắt bớt member; chọn một run hoặc đề nghị tăng giới hạn phù hợp." : e instanceof Error ? e.message : "Chưa đọc được nguồn CARLA.";
};
const issueMessage = (code: unknown): string => {
  switch (code) {
    case "DB_RESULT_NOT_PERSISTED": return "Chưa có kết quả gốc trong database. Với lượt chạy cũ, hãy chạy lại để lưu dữ liệu cho phân tích.";
    case "DATASET_REQUIRED": return "Kết quả gốc thiếu khối dataset cần cho phân tích.";
    case "DB_IDENTITY_FIELD_MISSING": return "Kết quả gốc thiếu thông tin định danh; chưa thể đối chiếu lượt chạy.";
    case "DB_IDENTITY_CONFLICT": return "Thông tin định danh trong kết quả gốc không khớp lượt chạy.";
    case "DB_RESULT_JSON_INVALID": return "Kết quả gốc không phải JSON hợp lệ.";
    case "DB_RESULT_SCHEMA_UNSUPPORTED": return "Định dạng kết quả gốc chưa được hỗ trợ.";
    case "DB_RESULT_BOM_NOT_EMBEDDABLE_WITHOUT_BYTE_CHANGE": return "Kết quả gốc có BOM và không thể đưa vào tập phân tích mà giữ nguyên dữ liệu.";
    default: return "Chưa đủ dữ liệu hoặc thông tin nguồn không khớp để phân tích.";
  }
};

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
    <p>Chọn kết quả đã hoàn tất để bắt đầu phân tích. Hệ thống tự đọc dữ liệu đã lưu.</p>
    <div className={styles.toolbar}><label>Phạm vi phân tích<select aria-label="Phạm vi phân tích" value={kind} disabled={disabled} onChange={e => { setKind(e.target.value as DatabaseKind); setSelected(0); setOffset(0); setResult(null); }}><option value="runs">Một lượt chạy</option><option value="collections">Mọi lượt chạy của một biến thể</option></select></label>
      <label>Kết quả CARLA<select aria-label="Kết quả CARLA" disabled={disabled} value={selected || ""} onChange={e => { setSelected(Number(e.target.value)); setActionError(null); }}><option value="">Chọn {kind === "runs" ? "lượt chạy" : "biến thể"}</option>{result?.rows.map(r => <option key={Number(r.id)} value={Number(r.id)}>{kind === "runs" ? `Lượt ${r.id} · Biến thể ${r.scenario_version_id} · AEB ${r.aeb_mode}` : `Biến thể ${r.id} · ${r.member_count} lượt chạy`}</option>)}</select></label>
      <button className="analysis-button" disabled={disabled || !canWrite || !detail?.can_analyze} onClick={() => void analyze()}>{disabled ? "Đang xử lý kết quả CARLA…" : "Phân tích kết quả CARLA"}</button><button className="analysis-button" disabled={disabled} onClick={() => { setResult(null); setRefresh(n => n + 1); }}>Tải lại kết quả CARLA</button>
    </div>
    {!result && <p role="status">Đang tải danh sách CARLA…</p>}{result?.error && <p role="alert">{result.error}</p>}{result && !result.error && !result.rows.length && <p>Chưa có kết quả CARLA hoàn tất được lưu trong phạm vi này.</p>}
    {result && (offset > 0 || result.rows.length === 20) && <div className={styles.toolbar}><button className="analysis-button" disabled={disabled || !offset} onClick={() => { setOffset(n => Math.max(0, n - 20)); setSelected(0); setResult(null); }}>Trang CARLA trước</button><span>Trang {offset / 20 + 1}</span><button className="analysis-button" disabled={disabled || result.rows.length < 20 || offset >= 10000} onClick={() => { setOffset(n => n + 20); setSelected(0); setResult(null); }}>Trang CARLA sau</button></div>}
    {selected > 0 && !detail && inspection?.key !== selectionKey && <p role="status">Đang kiểm tra JSON và tham chiếu lưu trữ…</p>}
    {inspection?.key === selectionKey && inspection.error && <p role="alert">{inspection.error}</p>}{actionError && <p role="alert">{actionError} Tải lại kết quả CARLA để kiểm tra nguồn hiện tại.</p>}
    {detail && <><p>{detail.can_analyze ? "Kết quả đã sẵn sàng để phân tích." : "Kết quả chưa sẵn sàng để phân tích."}{kind === "collections" && ` ${detail.members.length} lượt chạy trong biến thể.`}</p>
      {!detail.can_analyze && <p role="alert">Thiếu dữ liệu gốc hoặc thông tin nguồn không khớp. Kiểm tra các lượt chạy bên dưới trước khi phân tích.</p>}
      {detail.members.filter(m => Array.isArray(m.issues) && m.issues.length).map((m, i) => <div key={i}><p>Lượt {String(m.run_id)}: chưa đủ dữ liệu để phân tích.</p><ul>{(m.issues as unknown[]).map((issue, j) => <li key={j}>{issueMessage(issue && typeof issue === "object" && "reason_code" in issue ? issue.reason_code : null)}</li>)}</ul></div>)}
    </>}
    {!canWrite && <p>Chế độ chỉ đọc. Phân tích cần quyền ghi và dự án/workspace ACTIVE.</p>}
  </div>;
}
