"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton, StatCard } from "@/components/VehicSimUi";
import { AnalysisSelectionSummary, ObjectiveSummary } from "@/components/AnalysisSelectionSummary";
import { LegacyFailureCases } from "@/components/LegacyFailureCases";
import { AnalysisBadge, AnalysisLoading, AnalysisNav, AnalysisPager, analysisError, analysisLabel, eligible, metric } from "@/components/analysisUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { AnalysisDashboardData, AnalysisFilters, AnalysisRun, AnalysisSelection } from "@/types/vehicsim";

type Chosen = { run: AnalysisRun; role: "OPTIMIZATION" | "VALIDATION" };
type Draft = { key: string; chosen: Record<number, Chosen> };
const FILTER_KEYS = ["scenario_id", "variant_id", "aeb_version_id", "vehicle_id", "simulator", "weather", "time_of_day", "status", "failure_class"] as const;
const numericKeys = new Set(["scenario_id", "variant_id", "aeb_version_id", "vehicle_id"]);
const OUTCOMES = ["SAFE", "COLLISION", "FALSE_BRAKING", "NEAR_MISS", "MISSED_BRAKING", "OTHER_FAILURE", "ERROR", "CANCELLED", "TIMEOUT", "INCOMPLETE", "NOT_FINISHED"];
const color = (key: string) => key === "SAFE" ? "var(--color-vehicsim-ok)" : key === "COLLISION" ? "var(--color-vehicsim-danger)" : ["ERROR", "CANCELLED", "TIMEOUT", "INCOMPLETE", "NOT_FINISHED"].includes(key) ? "var(--color-vehicsim-muted)" : "var(--color-vehicsim-warn)";
const positive = (value: string | null, fallback: number) => value && /^\d+$/.test(value) && Number(value) > 0 && Number.isSafeInteger(Number(value)) ? Number(value) : fallback;

export function BaselineAnalysisDashboard() {
  const { ctx, canWrite } = useVehicSimContext();
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const view = ["runs", "failures", "dataset"].includes(params.get("view") ?? "") ? params.get("view")! : "overview";
  const page = positive(params.get("page"), 1);
  const size = [10, 20, 30, 50].includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 30;
  const filters: AnalysisFilters = {};
  for (const key of FILTER_KEYS) {
    const raw = params.get(key);
    if (raw) Object.assign(filters, { [key]: numericKeys.has(key) ? positive(raw, 0) || undefined : raw });
  }
  const filterKey = JSON.stringify(filters);
  const [result, setResult] = useState<{ key: string; data: AnalysisDashboardData | null; error: string | null } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selectionPage,setSelectionPage]=useState(1);
  const [selectionSize,setSelectionSize]=useState(20);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedSnapshot, setSaved] = useState<AnalysisSelection | null>(null);
  const savedId=positive(params.get("dataset_id"),0);
  const saved=savedSnapshot?.id===savedId?savedSnapshot:null;
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const storageKey = user?.id && ctx?.project.id ? `vehicsim.analysis.selection.v1:${user.id}:${ctx.project.id}` : "";
  const chosen = draft?.key === storageKey ? draft.chosen : {};
  const requestKey = `${filterKey}:${page}:${size}:${refresh}`;
  const loading = view !== "failures" && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;
  const error = result?.key === requestKey ? result.error : null;

  function update(values: Record<string, string | number | undefined>, resetPage = false) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value === "" || value === undefined) next.delete(key); else next.set(key, String(value));
    }
    if (resetPage) next.delete("page");
    window.history.replaceState(null, "", `/analysis/failures?${next}`);
  }
  useEffect(() => {
    if (view === "failures") return;
    let active = true;
    vehicsimApi.analysisRuns(JSON.parse(filterKey) as AnalysisFilters, page, size)
      .then(value => {
        if (!active) return;
        const last = Math.max(1, Math.ceil(value.total / size));
        if (page > last) {
          const next = new URLSearchParams(window.location.search); next.set("page", String(last));
          router.replace(`/analysis/failures?${next}`, { scroll: false }); return;
        }
        setResult({ key: requestKey, data: value, error: null });
      })
      .catch(e => { if (active) setResult({ key: requestKey, data: null, error: analysisError(e) }); });
    return () => { active = false; };
  }, [filterKey, page, size, refresh, requestKey, router, view]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as Record<string, Chosen>;
      const restored = Object.fromEntries(Object.entries(raw).filter(([id, item]) => item?.run?.revision && Number(id) === item.run.run_id && ["OPTIMIZATION", "VALIDATION"].includes(item.role)));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the account/project scoped draft after hydration
      setDraft({ key: storageKey, chosen: restored });
    } catch {
      setDraft({ key: storageKey, chosen: {} });
      setDraftNotice("Không khôi phục được lựa chọn trong phiên. Hãy chọn lại các run cần bàn giao.");
    }
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey || draft?.key !== storageKey) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(draft.chosen)); }
    catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage errors must be visible before leaving the page
      setDraftNotice("Trình duyệt không lưu được lựa chọn trong phiên; lựa chọn chỉ giữ khi bạn còn ở trang này.");
    }
  }, [draft, storageKey]);
  useEffect(()=>{
    if(!savedId)return;
    let active=true;
    vehicsimApi.savedAnalysisDataset(savedId).then(value=>{
      if(!active)return;
      if((value as unknown as {schema?:string}).schema==="vehicsim.analysis-dataset/v2")setSaved(value as unknown as AnalysisSelection);
      else setMutationError("Tập dữ liệu cũ chưa có hai tập độc lập. Hãy chọn và chốt lại trước khi bàn giao.");
    }).catch(e=>{if(active)setMutationError(analysisError(e));});
    return ()=>{active=false;};
  },[savedId]);
  const selection = Object.values(chosen), opt = selection.filter(x => x.role === "OPTIMIZATION"), val = selection.filter(x => x.role === "VALIDATION");
  const overlaps = opt.some(a => val.some(b => a.run.scenario_version_id === b.run.scenario_version_id));
  const identities = new Set(selection.map(({ run }) => [run.scenario_id, run.baseline_id, run.vehicle_id, run.simulator, run.dt].join("|")));
  const duplicates = new Set(selection.map(({ run }) => `${run.scenario_version_id}:${run.seed}`)).size !== selection.length;
  const checks = [
    { ok: opt.length > 0 && val.length > 0, label: "Có run trong cả tập tối ưu và tập xác minh" },
    { ok: selection.length > 0 && identities.size === 1, label: "Cùng họ, baseline, xe, simulator và bước thời gian" },
    { ok: selection.length > 0 && !overlaps && !duplicates, label: "Không trùng biến thể giữa hai tập; không lặp biến thể/seed" },
    { ok: opt.some(x => x.run.outcome === "SAFE") && val.some(x => x.run.outcome === "SAFE"), label: "Mỗi tập giữ ít nhất một ca an toàn" },
  ];
  const chosenPage=Math.min(selectionPage,Math.max(1,Math.ceil(selection.length/selectionSize)));
  const canSave = canWrite && checks.every(check => check.ok);
  function assign(run: AnalysisRun, role: string) {
    setSaved(null); setMutationError(null);
    if(savedId)update({dataset_id:undefined});
    setDraft(old => {
      const next = { ...(old?.key === storageKey ? old.chosen : {}) };
      if (!role) delete next[run.run_id]; else next[run.run_id] = { run, role: role as Chosen["role"] };
      return { key: storageKey, chosen: next };
    });
  }
  async function save() {
    if (!canSave || busy) return;
    setBusy(true); setMutationError(null);
    try {
      const value = await vehicsimApi.createAnalysisSelection({ scenario_id: selection[0].run.scenario_id, baseline_id: selection[0].run.baseline_id,
        optimization_run_ids: opt.map(x => x.run.run_id), validation_run_ids: val.map(x => x.run.run_id),
        run_revisions: Object.fromEntries(selection.map(x => [String(x.run.run_id), x.run.revision])) });
      setSaved(value); update({dataset_id:value.id});
    } catch (e) { setMutationError(analysisError(e)); }
    finally { setBusy(false); }
  }
  async function proceed() {
    if (!saved || busy) return;
    setBusy(true); setMutationError(null);
    try { await vehicsimApi.analysisHandoff(saved.id); router.push(`/aeb?dataset_id=${saved.id}`); }
    catch (e) { setMutationError(analysisError(e)); }
    finally { setBusy(false); }
  }
  const search = params.get("q") ?? "", sort = params.get("sort") ?? "newest";
  const rows = (data?.items ?? []).filter(run => `${run.run_id} ${run.family} ${run.variant} ${run.seed}`.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")));
  if (sort === "oldest") rows.sort((a, b) => a.run_id - b.run_id);
  if (sort === "impact") rows.sort((a, b) => (b.metrics.impact_speed_mps ?? -Infinity) - (a.metrics.impact_speed_mps ?? -Infinity));
  if (sort === "jerk") rows.sort((a, b) => (b.metrics.rms_jerk_mps3 ?? -Infinity) - (a.metrics.rms_jerk_mps3 ?? -Infinity));
  const returnTo = `/analysis/failures?${params}`;
  const runHref = (id: number) => `/analysis/failures/${id}?returnTo=${encodeURIComponent(returnTo)}`;
  const roleField = (run: AnalysisRun) => <select aria-label={`Tập của run ${run.run_id}`} title={!eligible(run) ? "Run cần hoàn tất, có telemetry và kết quả hợp lệ" : undefined}
    disabled={!canWrite || busy || !storageKey || draft?.key !== storageKey || !eligible(run)} value={chosen[run.run_id]?.role ?? ""} onChange={e => assign(run, e.target.value)}>
    <option value="">Không chọn</option><option value="OPTIMIZATION">Tối ưu</option><option value="VALIDATION">Xác minh</option>
  </select>;
  const title = view === "overview" ? "Phân tích baseline" : view === "runs" ? "Khám phá lượt chạy" : "Chuẩn bị tập bàn giao";
  const nav = <AnalysisNav view={view} count={selection.length} />;
  if (view === "failures") return <LegacyFailureCases initialScenario={filters.scenario_id} navigation={nav} />;
  return <VehicSimPage step={4} title={title} crumbs={[{ label: "Phân tích" }, { label: view === "overview" ? "Tổng quan baseline" : view === "runs" ? "Lượt chạy" : "Tập bàn giao" }]}
    subtitle={view === "dataset" ? "Rà soát hai tập độc lập, giữ ca an toàn và chốt bằng chứng trước khi bàn giao." : "Từ kết quả mô phỏng đến bằng chứng kỹ thuật và tập dữ liệu cho bước tối ưu AEB."}
    actions={<PillButton disabled={loading} onClick={() => setRefresh(x => x + 1)}>Tải lại kết quả</PillButton>}>
    {nav}
    <ErrorNote message={error ?? mutationError} />
    {(error || mutationError) && <div><button className="analysis-button" onClick={() => setRefresh(x => x + 1)}>Thử tải lại</button></div>}
    {draftNotice && <p role="status" className="analysis-caption">{draftNotice}</p>}
    {!canWrite && <p className="analysis-caption">Bạn đang ở chế độ chỉ đọc. Chốt tập dữ liệu yêu cầu quyền ghi.</p>}
    {selection.length > 0 && view !== "dataset" && <div className="analysis-selection-bar"><span><strong>{selection.length}</strong> run đã chọn · {opt.length} tối ưu · {val.length} xác minh</span><button className="analysis-button" onClick={() => update({ view: "dataset" })}>Rà soát tập bàn giao →</button></div>}
    {view !== "dataset" && <section className="analysis-panel space-y-4" aria-label="Bộ lọc baseline">
      <div className="analysis-toolbar"><h2>Phạm vi phân tích</h2><button className="analysis-button" onClick={() => update(Object.fromEntries(FILTER_KEYS.map(key => [key, undefined])), true)}>Xóa bộ lọc</button></div>
      <div className="analysis-filters">
        <label>Họ kịch bản<select aria-label="Họ kịch bản" value={filters.scenario_id ?? ""} onChange={e => update({ scenario_id: e.target.value }, true)}><option value="">Tất cả họ</option>{ctx?.families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Phiên bản baseline<select aria-label="Phiên bản baseline" value={filters.aeb_version_id ?? ""} onChange={e => update({ aeb_version_id: e.target.value }, true)}><option value="">Tất cả</option>{ctx?.versions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
        {([["status", "Trạng thái", ["PENDING", "RUNNING", "PAUSED", "COMPLETED", "FAILED", "STOPPED"]], ["failure_class", "Khâu lỗi", ["PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS"]]] as const).map(([key, label, values]) => <label key={key}>{label}<select aria-label={label} value={filters[key] ?? ""} onChange={e => update({ [key]: e.target.value }, true)}><option value="">Tất cả</option>{values.map(value => <option key={value} value={value}>{analysisLabel(value)}</option>)}</select></label>)}
      </div>
      <details open={Boolean(filters.weather || filters.time_of_day || filters.variant_id || filters.vehicle_id || filters.simulator)}><summary className="cursor-pointer text-[12px] font-semibold text-vehicsim-decision">Điều kiện chạy và bộ lọc nâng cao</summary><div className="analysis-filters mt-4">
        {([["weather", "Thời tiết", ["CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG"]], ["time_of_day", "Thời điểm", ["DAY", "DUSK", "NIGHT"]]] as const).map(([key, label, values]) => <label key={key}>{label}<select value={filters[key] ?? ""} onChange={e => update({ [key]: e.target.value }, true)}><option value="">Tất cả</option>{values.map(value => <option key={value} value={value}>{analysisLabel(value)}</option>)}</select></label>)}
        {([["variant_id", "ID biến thể"], ["vehicle_id", "ID xe"], ["simulator", "Phiên bản simulator"]] as const).map(([key, label]) => <label key={key}>{label}<input type={key === "simulator" ? "text" : "number"} min={1} value={filters[key] ?? ""} onChange={e => update({ [key]: e.target.value }, true)} /></label>)}
      </div></details>
      <p className="analysis-caption">Thống kê và danh sách dùng cùng bộ lọc. Đổi bộ lọc giữ nguyên tập đã chọn.</p>
    </section>}
    {view === "overview" && <>
      <div className="analysis-kpis">
        <StatCard label="Tổng lượt chạy" value={data?.total ?? "—"} note="Theo phạm vi đang lọc" />
        <StatCard label="An toàn" value={data ? data.counts.SAFE ?? 0 : "—"} note="Kết quả AEB hợp lệ" tone="ok" />
        <StatCard label="Va chạm" value={data ? data.counts.COLLISION ?? 0 : "—"} note="Cần phân tích bằng chứng" tone="danger" />
        <StatCard label="Phanh oan" value={data ? data.counts.FALSE_BRAKING ?? 0 : "—"} note="Giữ ca an toàn khi chọn tập" tone="warn" />
      </div>
      {loading && <AnalysisLoading />}
      {data && <div className="analysis-columns">
        <section className="analysis-panel"><h2>Phân bố kết quả</h2><p className="analysis-caption mb-3">{data.total} lượt chạy trong bộ lọc hiện tại. Lỗi kỹ thuật được hiển thị riêng.</p>
          {OUTCOMES.map(key => <div key={key} className="analysis-chart-row"><span>{analysisLabel(key)}</span><progress aria-label={analysisLabel(key)} max={Math.max(1, data.total)} value={data.counts[key] ?? 0} style={{ "--bar-color": color(key) } as CSSProperties} /><span className="text-right tabular-nums">{data.counts[key] ?? 0} <small className="text-vehicsim-muted">{data.total ? `${Math.round(100 * (data.counts[key] ?? 0) / data.total)}%` : "—"}</small></span></div>)}
        </section>
        <section className="analysis-panel space-y-4"><h2>Ba mục tiêu theo cấu hình chạy</h2><p className="analysis-caption">Giữ riêng baseline, xe, simulator và dt. Giá trị thiếu hiển thị —; không thay bằng 0.</p>
          {data.objective_groups.length === 0 && <p className="analysis-caption">Chưa có nhóm kết quả phù hợp.</p>}
          {data.objective_groups.map(group => <details key={group.identity} open={data.objective_groups.length === 1} className="border-t border-vehicsim-line pt-3"><summary className="cursor-pointer text-[12px] font-semibold">{group.simulator} · baseline #{group.baseline_id} · xe #{group.vehicle_id}</summary><div className="mt-4 space-y-3"><ObjectiveSummary value={group.objectives} /><p className="analysis-caption">Hợp đồng {group.objectives.version}. Quãng phanh có thể gồm phần ngoại suy.{group.carla_observational_only ? " CARLA chưa hiệu chuẩn phanh; chỉ để quan sát/đối chiếu." : ""}</p></div></details>)}
          <PillButton onClick={() => update({ view: "runs" })}>Khám phá lượt chạy →</PillButton>
        </section>
      </div>}
      {data?.total === 0 && <div className="analysis-panel analysis-state"><h2>Chưa có run baseline phù hợp.</h2><p>Thử bỏ bộ lọc hoặc <Link className="text-vehicsim-decision underline" href="/scenarios">chạy baseline ở màn kịch bản</Link>.</p></div>}
    </>}
    {(view === "runs" || view === "dataset") && <>
      {view === "dataset" && <div className="analysis-columns">
        <section className="analysis-panel space-y-4"><div className="analysis-toolbar"><div><h2>1. Lựa chọn đã giữ trong phiên</h2><p className="analysis-caption">{opt.length} run tối ưu · {val.length} run xác minh</p></div><PillButton onClick={() => update({ view: "runs" })}>Thêm lượt chạy</PillButton></div>
          {!selection.length ? <div className="analysis-state">Chưa chọn run. Mở Lượt chạy và gán run vào Tối ưu hoặc Xác minh.</div> : <div className="analysis-table-wrap"><table className="analysis-table" style={{ minWidth: 560 }}><caption className="sr-only">Run đã chọn cho tập bàn giao</caption><thead><tr><th scope="col">Run / biến thể</th><th scope="col">Kết quả</th><th scope="col">Tập dữ liệu</th></tr></thead><tbody>{selection.slice((chosenPage-1)*selectionSize,chosenPage*selectionSize).map(({ run }) => <tr key={run.run_id}><td><Link href={runHref(run.run_id)}>#{run.run_id} · {run.variant}</Link><small>{run.family} · seed {run.seed}</small></td><td><AnalysisBadge value={run.outcome} /></td><td>{roleField(run)}</td></tr>)}</tbody></table></div>}
          {selection.length>0&&<AnalysisPager page={chosenPage} size={selectionSize} total={selection.length} onPage={setSelectionPage} onSize={value=>{setSelectionPage(1);setSelectionSize(value);}}/>}
          <p className="analysis-caption">Lựa chọn giữ nguyên qua bộ lọc, phân trang và khi quay lại từ chi tiết trong cùng phiên trình duyệt. Backend sẽ kiểm lại run và revision khi chốt.</p>
        </section>
        <section className="analysis-panel"><h2>2. Kiểm tra và chốt</h2>{checks.map(check => <div className="analysis-check" data-passed={check.ok} key={check.label}><span aria-label={check.ok ? "Đã đủ" : "Còn thiếu"}>{check.ok ? "✓" : "○"}</span>{check.label}</div>)}
          <p className="analysis-caption my-4">Máy chủ xác minh thêm baseline hiện hành, telemetry, số đo, revision và artifact trước khi lưu snapshot bất biến.</p>
          <div className="flex flex-wrap gap-3"><PillButton variant="dark" disabled={!canSave || busy} onClick={() => void save()}>{busy ? "Đang xử lý…" : "Chốt hai tập dữ liệu"}</PillButton><PillButton disabled={!selection.length || busy} onClick={() => { setDraft({ key: storageKey, chosen: {} }); setSaved(null); update({dataset_id:undefined}); }}>Bỏ lựa chọn</PillButton></div>
        </section>
      </div>}
      {view === "runs" && <section className="analysis-panel space-y-4">
        <div className="analysis-toolbar"><div><h2>Lượt chạy baseline</h2><p className="analysis-caption">Mở run để xem bằng chứng; gán tập để chuẩn bị bàn giao.</p></div><PillButton onClick={() => update({ view: "dataset" })}>Rà soát lựa chọn ({selection.length})</PillButton></div>
        <div className="analysis-toolbar"><label>Tìm trong trang hiện tại <input aria-label="Tìm trong trang hiện tại" placeholder="Mã run, họ, biến thể, seed…" value={search} onChange={e => update({ q: e.target.value })} /></label><label>Sắp xếp trong trang <select aria-label="Sắp xếp trong trang" value={sort} onChange={e => update({ sort: e.target.value })}><option value="newest">Run mới trước</option><option value="oldest">Run cũ trước</option><option value="impact">Tốc độ va chạm giảm dần</option><option value="jerk">RMS jerk giảm dần</option></select></label></div>
        <p className="analysis-caption">Tìm và sắp xếp áp dụng cho tối đa {size} run của trang này; bộ lọc phía trên áp dụng cho toàn bộ danh sách.</p>
        {loading ? <AnalysisLoading /> : data && <>
          <div className="analysis-table-wrap"><table className="analysis-table"><caption className="sr-only">Lượt chạy baseline, seed, chỉ số và lựa chọn tập</caption><thead><tr>{["Run / biến thể", "Điều kiện / cấu hình", "Trạng thái / kết quả", "RMS jerk (m/s³)", "Va chạm (m/s)", "Quãng phanh (m)", "Tập dữ liệu"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map(run => <tr key={run.run_id}><td><Link href={runHref(run.run_id)}>#{run.run_id} · {run.variant}</Link><small>{run.family}</small><small>Seed {run.seed}</small></td><td>Baseline #{run.baseline_id} · xe #{run.vehicle_id}<small>{run.simulator} · dt {run.dt} s</small><small>{analysisLabel(run.weather)} · {analysisLabel(run.time_of_day)}</small></td><td><div className="flex flex-wrap gap-1"><AnalysisBadge value={run.status} /><AnalysisBadge value={run.outcome} /></div>{!run.trace_available && <small>Thiếu telemetry</small>}{run.failure_class && <small>{analysisLabel(run.failure_class)}</small>}{run.error && <small className="max-w-60" title={run.error}>{run.error}</small>}</td><td className="numeric">{metric(run.metrics.rms_jerk_mps3)}</td><td className="numeric">{metric(run.metrics.impact_speed_mps)}</td><td className="numeric">{metric(run.metrics.stopping_distance_m)}</td><td>{roleField(run)}</td></tr>)}</tbody></table></div>
          {rows.length === 0 && <div className="analysis-state"><strong>{data.total === 0 ? "Chưa có run baseline phù hợp." : "Không có kết quả tìm trong trang này."}</strong><p>{data.total === 0 ? "Thử bỏ bộ lọc hoặc chạy baseline ở màn Kịch bản." : "Thử từ khóa khác hoặc chuyển trang. Bộ lọc toàn danh sách nằm phía trên."}</p></div>}
          <AnalysisPager page={page} size={size} total={data.total} loading={loading} onPage={value => update({ page: value })} onSize={value => update({ page_size: value }, true)} />
        </>}
      </section>}
      {view === "dataset" && saved && <><div className="analysis-panel"><h2>3. Snapshot đã được máy chủ lưu</h2><p className="analysis-caption">Kiểm tra lại baseline và bằng chứng trước khi chuyển sang màn tối ưu.</p></div><AnalysisSelectionSummary dataset={saved} returnTo={returnTo} /><div><PillButton variant="dark" disabled={busy} onClick={() => void proceed()}>Tiếp tục: Tối ưu AEB →</PillButton></div></>}
    </>}
  </VehicSimPage>;
}
