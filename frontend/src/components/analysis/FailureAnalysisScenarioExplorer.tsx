"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { failureAnalysisV3 as api, type ExplorerMetric, type ExplorerPage, type ExplorerRun, type ExplorerScenario, type ExplorerVariant } from "@/services/failureAnalysisV3";

const SIZE = 20;
const classification: Record<string, string> = { CONFIRMED: "Lỗi AEB có bằng chứng hỗ trợ", SUSPECTED: "Nghi ngờ lỗi AEB", NO_SUPPORTED_FAILURE: "Chưa có lỗi được hỗ trợ", UNKNOWN: "Chưa xác định", NOT_ANALYZED: "Chưa có báo cáo khớp nguồn chạy", NOT_APPLICABLE: "Không áp dụng — AEB tắt" };
const physical: Record<string, string> = { COLLISION: "Có va chạm", SAFE: "Không va chạm đã xác minh", NEAR_MISS: "Suýt va chạm", UNKNOWN: "Chưa xác định" };
const failureTypes: Record<string, string> = { NO_BRAKING: "Không phanh", INEFFECTIVE_BRAKING: "Phanh không hiệu quả", FALSE_BRAKING: "Phanh không cần thiết" };
const causeTypes: Record<string, string> = { NO_BRAKING_MECHANISM_INVESTIGATION: "Điều tra cơ chế không phanh", INEFFECTIVE_BRAKING_MECHANISM_INVESTIGATION: "Điều tra thời điểm và đáp ứng phanh", FALSE_BRAKING_MECHANISM_INVESTIGATION: "Điều tra dự đoán nguy cơ khi phanh" };
const integer = (value: string | null) => value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const number = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString("vi-VN") : "—";
const status = (value: string | undefined) => value === "SUPPORTED" ? "có bằng chứng hỗ trợ" : value === "SUSPECTED" ? "nghi ngờ" : value === "CONFIRMED" ? "đã xác nhận" : "cần điều tra";
function metric(m: ExplorerMetric | undefined, unit: string) {
  if (!m || typeof m !== "object") return "Chưa xác định";
  if (m.applicability === "NOT_APPLICABLE" || m.status === "NOT_APPLICABLE") return "N/A";
  if (m.status === "INVALID") return "Không hợp lệ";
  if (m.status === "CONFLICTING") return "Mâu thuẫn";
  if (m.applicability !== "APPLICABLE" || !["OBSERVED", "DERIVED", "CONDITIONAL"].includes(m.status) || m.unit !== unit || typeof m.value !== "number" || !Number.isFinite(m.value) || m.value < 0) return "Chưa xác định";
  return `${m.value.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} ${unit}${m.status === "CONDITIONAL" ? " · có điều kiện" : ""}`;
}
const selectStyle = "rounded-lg border border-vehicsim-line bg-vehicsim-surface px-3 py-2 text-sm";
const headStyle = "px-3 py-3 text-left text-xs font-semibold text-vehicsim-muted";
const cellStyle = "px-3 py-3 align-top text-sm";

export function FailureAnalysisScenarioExplorer({ project, canWrite, families, onReport, onExecution }: {
  project: number; canWrite: boolean; families: { id: number; name: string }[];
  onReport: (execution: string, report: string) => void; onExecution: (execution: string) => void;
}) {
  const router = useRouter(), params = useSearchParams();
  const scenario = integer(params.get("fa_scenario"));
  const search = params.get("fa_q") ?? "", rawOffset = Number(params.get("fa_offset") ?? 0);
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 && rawOffset <= 100000 ? rawOffset : 0;
  const [draft, setDraft] = useState(search), [open, setOpen] = useState<Record<number, boolean>>({});
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data: ExplorerPage<ExplorerScenario> | ExplorerPage<ExplorerRun> | null; error: string | null } | null>(null);
  const [busy, setBusy] = useState<number | null>(null), [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // A browser Back/Forward navigation must restore the search field, too.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with browser history
    setDraft(search);
  }, [search]);
  function navigate(values: Record<string, string | number | null>, push = false) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) { if (value === null || value === "") next.delete(key); else next.set(key, String(value)); }
    const url = `/analysis/failures${next.size ? `?${next}` : ""}`;
    if (push) router.push(url, { scroll: false }); else window.history.replaceState(null, "", url);
  }
  useEffect(() => {
    if (draft === search) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      if (draft.trim()) next.set("fa_q", draft.trim()); else next.delete("fa_q");
      next.delete("fa_offset");
      window.history.replaceState(null, "", `/analysis/failures${next.size ? `?${next}` : ""}`);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft, search, router]);
  const query = new URLSearchParams({ limit: String(SIZE), offset: String(offset), sort: params.get("fa_sort") === "id_asc" ? "id_asc" : "id_desc" });
  if (search.trim()) query.set("q", search.trim());
  if (scenario) for (const [name, key] of [["aeb_mode", "fa_mode"], ["classification", "fa_class"], ["failure_type", "fa_type"], ["root_cause", "fa_cause"], ["physical_outcome", "fa_outcome"], ["variant_id", "fa_variant"], ["run_id", "fa_run"], ["weather", "fa_weather"], ["ego_speed_min", "fa_speed_min"], ["ego_speed_max", "fa_speed_max"], ["initial_distance_min", "fa_distance_min"], ["initial_distance_max", "fa_distance_max"]]) {
    const value = params.get(key); if (value) query.set(name, value);
  }
  const queryKey = query.toString(), requestKey = `${project}:${scenario ?? "all"}:${queryKey}:${retry}`;
  useEffect(() => {
    let active = true;
    const request = scenario ? api.explorerRuns(project, scenario, new URLSearchParams(queryKey)) : api.explorerScenarios(project, new URLSearchParams(queryKey));
    request.then(data => { if (active) setResult({ key: requestKey, data, error: null }); }, error => { if (active) setResult({ key: requestKey, data: null, error: error instanceof Error ? error.message : "Chưa tải được danh sách." }); });
    return () => { active = false; };
  }, [project, scenario, queryKey, requestKey]);
  const data = result?.key === requestKey ? result.data : null, error = result?.key === requestKey ? result.error : null;
  const loading = result?.key !== requestKey;
  const analyze = async (run: ExplorerRun) => {
    if (busy !== null || !canWrite) return;
    setBusy(run.run_id); setActionError(null);
    try {
      const source = await api.databaseInspect(project, "runs", run.run_id);
      if (!source.can_analyze || !source.source_sha256) throw new Error("Chưa có result.json hợp lệ đã lưu cho lượt chạy này. Kiểm tra nguồn Module 2 trước khi phân tích.");
      const execution = await api.databaseAnalyze(project, "runs", run.run_id, source.source_sha256);
      if (mounted.current) onExecution(execution.id);
    } catch (e) { if (mounted.current) setActionError(e instanceof Error ? e.message : "Chưa thể phân tích lượt chạy."); }
    finally { if (mounted.current) setBusy(null); }
  };
  const scenarios = !scenario && data ? data.items as ExplorerScenario[] : [];
  const runs = scenario && data ? data.items as ExplorerRun[] : [];
  const groups = new Map<number, ExplorerRun[]>();
  for (const run of runs) { if (Number.isSafeInteger(run.scenario_version_id)) groups.set(run.scenario_version_id, [...(groups.get(run.scenario_version_id) ?? []), run]); }
  const family = families.find(f => f.id === scenario);
  const filters = [
    { key: "fa_mode", label: "Chế độ AEB", options: [["ON", "AEB bật"], ["OFF", "AEB tắt"]] },
    { key: "fa_class", label: "Đánh giá AEB", options: Object.entries(classification).filter(([value]) => value !== "NO_SUPPORTED_FAILURE" && value !== "CONFIRMED") },
    { key: "fa_type", label: "Loại lỗi", options: Object.entries(failureTypes) },
    { key: "fa_cause", label: "Nhóm nguyên nhân", options: Object.entries(causeTypes) },
    { key: "fa_outcome", label: "Kết quả vật lý", options: Object.entries(physical) },
    { key: "fa_weather", label: "Thời tiết", options: [["CLEAR", "Trời quang"], ["CLOUDY", "Nhiều mây"], ["RAIN", "Mưa"], ["HEAVY_RAIN", "Mưa lớn"], ["FOG", "Sương mù"]] },
  ];
  return <section aria-label="Khám phá họ kịch bản" className="grid min-w-0 gap-4">
    {scenario && <nav aria-label="Điều hướng phân tích" className="text-sm"><button className="analysis-button" onClick={() => navigate({ fa_scenario: null, fa_offset: null }, true)}>← Các họ kịch bản</button><span className="ml-3">{family?.name ?? `Họ kịch bản ${scenario}`}</span></nav>}
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><h2>{scenario ? "Biến thể và lượt chạy" : "Họ kịch bản"}</h2><p className="analysis-caption">{scenario ? "Mở biến thể để xem từng lượt chạy và kết quả phân tích." : "Tìm theo tên, mã họ, mã biến thể hoặc mã lượt chạy trong dự án."}</p></div>
      <label className="grid min-w-[220px] gap-1 text-sm">Tìm kiếm<input className={selectStyle} type="search" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Tên, mã hoặc ID…" /></label>
    </div>
    {scenario && <details className="analysis-disclosure"><summary>Tìm kiếm nâng cao</summary><div className="mt-3 flex flex-wrap gap-3">
      {filters.map(filter => <label key={filter.key} className="grid gap-1 text-sm">{filter.label}<select className={selectStyle} value={params.get(filter.key) ?? ""} onChange={e => navigate({ [filter.key]: e.target.value, fa_offset: null })}><option value="">Tất cả</option>{filter.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
      {[['fa_variant', 'ID biến thể'], ['fa_run', 'ID lượt chạy']].map(([key,label]) => <label key={key} className="grid gap-1 text-sm">{label}<input className={selectStyle} inputMode="numeric" type="number" min="1" defaultValue={params.get(key) ?? ""} key={`${key}:${params.get(key) ?? ""}`} onBlur={e => navigate({ [key]: e.target.value, fa_offset: null })} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>)}
      {[["fa_speed_min", "Tốc độ từ (km/h)"], ["fa_speed_max", "Tốc độ đến (km/h)"], ["fa_distance_min", "Khoảng cách từ (m)"], ["fa_distance_max", "Khoảng cách đến (m)"]].map(([key,label]) => <label key={key} className="grid gap-1 text-sm">{label}<input className={selectStyle} inputMode="decimal" type="number" min="0" step="any" defaultValue={params.get(key) ?? ""} key={`${key}:${params.get(key) ?? ""}`} onBlur={e => navigate({ [key]: e.target.value, fa_offset: null })} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>)}
      <button className="analysis-button self-end" onClick={() => navigate({ fa_mode: null, fa_class: null, fa_type: null, fa_cause: null, fa_outcome: null, fa_variant: null, fa_run: null, fa_weather: null, fa_speed_min: null, fa_speed_max: null, fa_distance_min: null, fa_distance_max: null, fa_offset: null })}>Xóa bộ lọc</button>
    </div></details>}
    {actionError && <p role="alert" className="analysis-state">{actionError}</p>}
    {loading && <p role="status">Đang tải danh sách…</p>}{error && <div role="alert"><p>{error}</p><button className="analysis-button" onClick={() => setRetry(n => n + 1)}>Thử tải lại</button></div>}
    {data && <>{!scenario && data.summary && <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Tổng quan phân tích">
      {[["Họ kịch bản", "scenario_count"], ["Biến thể", "variant_count"], ["Báo cáo AEB bật khớp nguồn", "analyzed_count"], ["Lỗi có bằng chứng", "confirmed_count"], ["Nghi ngờ", "suspected_count"], ["Chưa xác định", "unknown_count"]].map(([label,key]) => <div key={key} className="rounded-lg border border-vehicsim-line p-3"><p className="text-xs text-vehicsim-muted">{label}</p><strong className="text-lg">{number(data.summary?.[key])}</strong></div>)}
    </div>}
    {!scenario && data.summary && data.summary.analyzed_count === 0 && typeof data.summary.variant_count === "number" && data.summary.variant_count > 0 && <p role="status" data-fa-empty-note className="rounded-lg border border-vehicsim-line bg-vehicsim-soft px-4 py-3 text-sm text-vehicsim-muted">Chưa có báo cáo AEB bật khớp nguồn trong phạm vi đang xem. Mục này hỗ trợ phân tích lượt chạy CARLA.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p>{number(data.total)} {scenario ? "lượt chạy" : "họ kịch bản"} phù hợp</p><label>Sắp xếp <select className={selectStyle} value={params.get("fa_sort") === "id_asc" ? "id_asc" : "id_desc"} onChange={e => navigate({ fa_sort: e.target.value, fa_offset: null })}><option value="id_desc">Mới nhất trước</option><option value="id_asc">Cũ nhất trước</option></select></label></div>
    {data.total === 0 ? <div className="analysis-state">Không có kết quả phù hợp. Hãy thử điều chỉnh tìm kiếm hoặc bộ lọc.</div> : <div className="max-w-full overflow-x-auto" role="region" aria-label={scenario ? "Bảng biến thể và lượt chạy" : "Bảng họ kịch bản"} tabIndex={0}>
      {!scenario ? <table className="w-full min-w-[760px] border-collapse"><thead><tr>{["Họ kịch bản", "Biến thể", "Run đã phân tích", "Lỗi AEB", "Nghi ngờ", "Chưa có lỗi được hỗ trợ", "Chưa xác định"].map(label => <th className={headStyle} key={label}>{label}</th>)}</tr></thead><tbody>{scenarios.map(row => <tr className="border-t border-vehicsim-line" key={row.scenario_id}><td className={cellStyle}><button className="font-semibold text-vehicsim-decision" onClick={() => navigate({ fa_scenario: row.scenario_id, fa_offset: null }, true)}>{row.name} · {row.code}</button></td>{[row.variant_count,row.analyzed_count,row.confirmed_count,row.suspected_count,row.no_failure_count,row.unknown_count].map((value,i) => <td className={cellStyle} key={i}>{number(value)}</td>)}</tr>)}</tbody></table>
        : <table className="w-full min-w-[1250px] border-collapse"><thead><tr>{["Biến thể / lượt chạy", "AEB", "Kết quả vật lý", "Đánh giá AEB", "Loại lỗi", "Giả thuyết nguyên nhân", "RMS jerk", "Tốc độ va chạm", "Quãng dừng", ""].map((label,i) => <th className={headStyle} key={i}>{label}</th>)}</tr></thead><tbody>{[...groups].map(([variant, members]) => <Fragment key={variant}>
          <tr className="border-t border-vehicsim-line"><th colSpan={10} className={`${cellStyle} text-left`}><button aria-expanded={open[variant] ?? false} className="font-semibold text-vehicsim-decision" onClick={() => setOpen(old => ({ ...old, [variant]: !old[variant] }))}>{open[variant] ? "▾" : "▸"} Biến thể {members[0].version_no} · ID {variant} <span className="font-normal text-vehicsim-muted">({members.length} lượt trong trang)</span></button></th></tr>
          {open[variant] && members.map(run => <tr key={run.run_id} className="border-t border-vehicsim-line"><td className={cellStyle}>Lượt {run.run_id}<small className="block text-vehicsim-muted">Seed {run.random_seed ?? "—"} · Lần {run.repetition ?? "—"}</small></td><td className={cellStyle}>{run.aeb_mode === "ON" ? "Bật" : run.aeb_mode === "OFF" ? "Tắt" : "Chưa rõ"}</td><td className={cellStyle}>{physical[run.physical_outcome] ?? "Chưa xác định"}</td><td className={cellStyle}>{classification[run.classification] ?? "Chưa xác định"}</td><td className={cellStyle}>{Array.isArray(run.failure_candidates) && run.failure_candidates.length ? run.failure_candidates.map((c,i) => <div key={i}>{failureTypes[c.type] ?? "Dấu hiệu cần kiểm tra"} · {status(c.status)}</div>) : "—"}</td><td className={cellStyle}>{Array.isArray(run.root_cause_hypotheses) && run.root_cause_hypotheses.length ? run.root_cause_hypotheses.map((c,i) => <div key={i}>{causeTypes[c.type] ?? "Giả thuyết cần kiểm tra"} · {status(c.status)}</div>) : "Chưa xác định"}</td><td className={cellStyle}>{metric(run.objectives?.rms_jerk_mps3, "m/s³")}</td><td className={cellStyle}>{metric(run.objectives?.impact_speed_mps, "m/s")}</td><td className={cellStyle}>{metric(run.objectives?.stopping_distance_m, "m")}</td><td className={cellStyle}>{run.report_id && run.execution_id ? <button className="analysis-button" onClick={() => onReport(run.execution_id!, run.report_id!)}>Xem phân tích</button> : run.simulator_type === "CARLA" ? <button className="analysis-button" disabled={!canWrite || busy !== null || run.status !== "COMPLETED"} onClick={() => void analyze(run)}>{busy === run.run_id ? "Đang phân tích…" : "Phân tích"}</button> : <span className="text-vehicsim-muted">Nguồn này chưa hỗ trợ phân tích tại đây</span>}</td></tr>)}
        </Fragment>)}</tbody></table>}
    </div>}
    <p className="analysis-caption">Thống kê theo lượt AEB bật có báo cáo khớp nguồn run; chưa kiểm tra lại hiệu lực context duyệt. AEB tắt chỉ dùng đối chứng. Chưa có lỗi được hỗ trợ không đồng nghĩa đã chứng minh an toàn.</p>
    <div className="flex items-center gap-3"><button className="analysis-button" disabled={offset === 0} onClick={() => navigate({ fa_offset: Math.max(0, offset - SIZE) })}>Trang trước</button><span className="text-sm">Trang {Math.floor(offset / SIZE) + 1}</span><button className="analysis-button" disabled={offset + SIZE >= data.total} onClick={() => navigate({ fa_offset: offset + SIZE })}>Trang sau</button></div></>}
    {scenario && !["fa_mode", "fa_class", "fa_type", "fa_cause", "fa_outcome", "fa_variant", "fa_run", "fa_weather", "fa_speed_min", "fa_speed_max", "fa_distance_min", "fa_distance_max"].some(key => params.has(key)) && <UnrunVariants key={`${scenario}:${search}`} project={project} scenario={scenario} search={search} />}
  </section>;
}

function UnrunVariants({ project, scenario, search }: { project: number; scenario: number; search: string }) {
  const [opened, setOpened] = useState(false), [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{ key: string; data: ExplorerPage<ExplorerVariant> | null; error: string | null } | null>(null);
  const key = `${project}:${scenario}:${search}:${offset}`;
  useEffect(() => {
    if (!opened) return;
    let active = true;
    const query = new URLSearchParams({ without_runs: "true", limit: String(SIZE), offset: String(offset), sort: "id_desc" });
    if (search) query.set("q", search);
    api.explorerVariants(project, scenario, query).then(data => { if (active) setResult({ key, data, error: null }); }, error => { if (active) setResult({ key, data: null, error: error instanceof Error ? error.message : "Chưa tải được biến thể." }); });
    return () => { active = false; };
  }, [project, scenario, search, offset, key, opened]);
  const data = result?.key === key ? result.data : null, error = result?.key === key ? result.error : null;
  return <details hidden className="analysis-disclosure" onToggle={e => setOpened(e.currentTarget.open)}><summary>Biến thể chưa có lượt chạy</summary>
    {opened && <div className="grid gap-2 pt-3">{!data && !error && <p role="status">Đang tải biến thể…</p>}{error && <p role="alert">{error}</p>}{data && <>
      {data.total === 0 ? <p>Không có biến thể chưa chạy trong phạm vi tìm kiếm.</p> : <ul>{data.items.map(variant => <li key={variant.scenario_version_id}>Biến thể {variant.version_no} · ID {variant.scenario_version_id} — chưa có lượt chạy</li>)}</ul>}
      <div className="flex items-center gap-3"><button className="analysis-button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - SIZE))}>Trang trước</button><span className="text-sm">Trang {Math.floor(offset / SIZE) + 1}</span><button className="analysis-button" disabled={offset + SIZE >= data.total} onClick={() => setOffset(offset + SIZE)}>Trang sau</button></div>
    </>}</div>}
  </details>;
}
