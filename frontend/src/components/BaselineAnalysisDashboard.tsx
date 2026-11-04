"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton } from "@/components/VehicSimUi";
import { AnalysisDatasetPreparation } from "@/components/analysis/AnalysisDatasetPreparation";
import { restoreSelection, selectionChecks, type ChosenRun } from "@/components/analysis/analysisSelectionData";
import { AnalysisRunExplorer } from "@/components/analysis/AnalysisRunExplorer";
import { AnalysisOverview } from "@/components/analysis/AnalysisOverview";
import { LegacyFailureCases } from "@/components/LegacyFailureCases";
import { AnalysisNav, analysisError, analysisLabel, eligible } from "@/components/analysisUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { AnalysisDashboardData, AnalysisFilters, AnalysisRun, AnalysisSelection } from "@/types/vehicsim";

type Draft = { key: string; chosen: Record<number, ChosenRun>; notice?: string };
const FILTER_KEYS = ["scenario_id", "variant_id", "aeb_version_id", "vehicle_id", "simulator", "weather", "time_of_day", "status", "failure_class"] as const;
const numericKeys = new Set(["scenario_id", "variant_id", "aeb_version_id", "vehicle_id"]);
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
  const [operation, setOperation] = useState<"save" | "handoff" | null>(null);
  const busy = operation !== null;
  const [operationError, setOperationError] = useState<{ scope: string; message: string; kind: "save" | "handoff" } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const rawDatasetId = params.get("dataset_id"), savedId = positive(rawDatasetId, 0);
  const [snapshotRefresh, setSnapshotRefresh] = useState(0);
  const [snapshotResult, setSnapshotResult] = useState<{ key: string; data: AnalysisSelection | null; error: string | null } | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const storageKey = user?.id && ctx?.project.id ? `vehicsim.analysis.selection.v1:${user.id}:${ctx.project.id}` : "";
  const draftReady = Boolean(storageKey && draft?.key === storageKey);
  const chosen = draft?.key === storageKey ? draft.chosen : {};
  const snapshotKey = `${storageKey}:${rawDatasetId}:${snapshotRefresh}`;
  const saved = snapshotResult?.key === snapshotKey ? snapshotResult.data : null;
  const snapshotLoading = rawDatasetId !== null && savedId > 0 && snapshotResult?.key !== snapshotKey;
  const snapshotError = rawDatasetId !== null && !savedId ? "Mã tập phân tích không hợp lệ."
    : snapshotResult?.key === snapshotKey ? snapshotResult.error : null;
  const requestKey = `${filterKey}:${page}:${size}:${refresh}`;
  const loading = (view === "overview" || view === "runs") && result?.key !== requestKey;
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
    if (view === "failures" || view === "dataset") return;
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
      const { chosen: restored, discarded } = restoreSelection(JSON.parse(sessionStorage.getItem(storageKey) ?? "{}"));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the account/project scoped draft after hydration
      setDraft({ key: storageKey, chosen: restored, notice: discarded ? "Một số lựa chọn trong phiên bị thiếu metadata nên không khôi phục được. Hãy chọn lại các run đó." : undefined });
    } catch {
      setDraft({ key: storageKey, chosen: {}, notice: "Không khôi phục được lựa chọn trong phiên. Hãy chọn lại các run cần bàn giao." });
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
  useEffect(() => {
    if (!savedId || !storageKey) return;
    let active = true;
    vehicsimApi.savedAnalysisDataset(savedId).then(value => {
      if (!active) return;
      if ((value as unknown as { schema?: string }).schema !== "vehicsim.analysis-dataset/v2")
        throw new Error("Tập dữ liệu cũ chưa có hai tập độc lập. Hãy chọn và chốt lại trước khi bàn giao.");
      if (value.id !== savedId) throw new Error("Mã tập máy chủ trả về không khớp yêu cầu. Hãy thử tải lại.");
      setSnapshotResult({ key: snapshotKey, data: value as unknown as AnalysisSelection, error: null });
    }).catch(err => { if (active) setSnapshotResult({ key: snapshotKey, data: null, error: analysisError(err) }); });
    return () => { active = false; };
  }, [savedId, storageKey, snapshotKey]);
  const selection = Object.values(chosen), opt = selection.filter(item => item.role === "OPTIMIZATION"), val = selection.filter(item => item.role === "VALIDATION");
  const checks = selectionChecks(selection, ctx?.system.baseline?.id);
  const draftScope = `${storageKey}:${JSON.stringify(selection)}`;
  const mutationError = operationError && operationError.scope === (operationError.kind === "save" ? draftScope : snapshotKey) ? operationError.message : null;
  const canSave = canWrite && draftReady && checks.every(check => check.ok);
  function assign(run: AnalysisRun, role: string) {
    if (!canWrite || busy || !draftReady || (role && (!eligible(run) || !["OPTIMIZATION", "VALIDATION"].includes(role)))) return;
    setSnapshotResult(null); setOperationError(null);
    if (rawDatasetId !== null) update({ dataset_id: undefined });
    setDraft(old => {
      const next = { ...(old?.key === storageKey ? old.chosen : {}) };
      if (!role) delete next[run.run_id]; else next[run.run_id] = { run, role: role as ChosenRun["role"] };
      return { key: storageKey, chosen: next };
    });
  }
  async function save() {
    if (!canSave || busy) return;
    setOperation("save"); setOperationError(null);
    try {
      const value = await vehicsimApi.createAnalysisSelection({ scenario_id: selection[0].run.scenario_id, baseline_id: selection[0].run.baseline_id,
        optimization_run_ids: opt.map(x => x.run.run_id), validation_run_ids: val.map(x => x.run.run_id),
        run_revisions: Object.fromEntries(selection.map(x => [String(x.run.run_id), x.run.revision])) });
      setSnapshotResult({ key: `${storageKey}:${value.id}:${snapshotRefresh}`, data: value, error: null });
      update({ dataset_id: value.id });
    } catch (err) { setOperationError({ scope: draftScope, kind: "save", message: analysisError(err) }); }
    finally { setOperation(null); }
  }
  async function proceed() {
    if (!saved || saved.baseline_current !== true || busy) return;
    setOperation("handoff"); setOperationError(null);
    try {
      const verified = await vehicsimApi.analysisHandoff(saved.id);
      if (verified.id !== saved.id || verified.schema !== "vehicsim.analysis-dataset/v2" || verified.baseline_current !== true || verified.handoff_ready !== true)
        throw new Error("Máy chủ chưa xác nhận tập dữ liệu đủ điều kiện bàn giao. Hãy tải lại tập đã chốt.");
      if (positive(new URLSearchParams(window.location.search).get("dataset_id"), 0) === saved.id)
        router.push(`/aeb?dataset_id=${saved.id}`);
    } catch (err) { setOperationError({ scope: snapshotKey, kind: "handoff", message: analysisError(err) }); }
    finally { setOperation(null); }
  }
  function clearDraft() {
    if (!canWrite || busy || !draftReady) return;
    setDraft({ key: storageKey, chosen: {} }); setSnapshotResult(null); setOperationError(null);
    update({ dataset_id: undefined });
  }
  const search = params.get("q") ?? "", sort = params.get("sort") ?? "newest";
  const filterLabels: Record<typeof FILTER_KEYS[number], string> = {
    scenario_id: "Họ", variant_id: "Biến thể", aeb_version_id: "Baseline", vehicle_id: "Xe",
    simulator: "Simulator", weather: "Thời tiết", time_of_day: "Thời điểm", status: "Trạng thái", failure_class: "Khâu lỗi",
  };
  const activeFilters = FILTER_KEYS.filter(key => filters[key] !== undefined).map(key => {
    const value = filters[key];
    const label = key === "scenario_id" ? ctx?.families.find(f => f.id === value)?.name
      : key === "aeb_version_id" ? ctx?.versions.find(v => v.id === value)?.label : undefined;
    return { key, label: `${filterLabels[key]}: ${label ?? analysisLabel(String(value))}` };
  });
  const returnTo = `/analysis/failures?${params}`;
  const roleField = (run: AnalysisRun) => <select aria-label={`Tập của run ${run.run_id}`} title={!eligible(run) ? "Run cần hoàn tất, có telemetry và kết quả hợp lệ" : undefined}
    disabled={!canWrite || busy || !storageKey || draft?.key !== storageKey || !eligible(run)} value={chosen[run.run_id]?.role ?? ""} onChange={e => assign(run, e.target.value)}>
    <option value="">Không chọn</option><option value="OPTIMIZATION">Tối ưu</option><option value="VALIDATION">Xác minh</option>
  </select>;
  const title = view === "overview" ? "Phân tích baseline" : view === "runs" ? "Khám phá lượt chạy" : "Chuẩn bị tập bàn giao";
  const nav = <AnalysisNav view={view} count={selection.length} />;
  if (view === "failures") return <LegacyFailureCases initialScenario={filters.scenario_id} navigation={nav} />;
  return <VehicSimPage step={4} title={title} crumbs={[{ label: "Phân tích" }, { label: view === "overview" ? "Tổng quan baseline" : view === "runs" ? "Lượt chạy" : "Tập bàn giao" }]}
    subtitle={view === "dataset" ? "Rà soát hai tập độc lập, giữ ca an toàn và chốt bằng chứng trước khi bàn giao." : "Từ kết quả mô phỏng đến bằng chứng kỹ thuật và tập dữ liệu cho bước tối ưu AEB."}
    actions={view === "dataset" ? <PillButton disabled={!savedId || snapshotLoading || busy} onClick={() => setSnapshotRefresh(value => value + 1)}>Tải lại tập đã chốt</PillButton> : <PillButton disabled={loading} onClick={() => setRefresh(x => x + 1)}>Tải lại kết quả</PillButton>}>
    {nav}
    {view !== "dataset" && <ErrorNote message={error} />}
    {view !== "dataset" && error && <div><button className="analysis-button" onClick={() => setRefresh(x => x + 1)}>Thử tải lại</button></div>}
    {draftReady && (draft?.notice || draftNotice) && <p role="status" className="analysis-caption">{draft?.notice || draftNotice}</p>}
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
    {view === "overview" && <AnalysisOverview data={data} loading={loading} hasError={Boolean(error)} onOpenRuns={() => update({ view: "runs" })} onFilterSimulator={simulator => update({ simulator }, true)} />}
    {view === "dataset" && <AnalysisDatasetPreparation selection={selection} checks={checks} ready={draftReady} canWrite={canWrite} canSave={canSave}
      operation={operation} operationError={mutationError} errorKind={operationError?.kind ?? null}
      snapshotId={savedId} hasSnapshot={rawDatasetId !== null} snapshot={saved} snapshotLoading={snapshotLoading} snapshotError={snapshotError}
      search={params.get("d_q") ?? ""} returnTo={returnTo} renderSelection={roleField}
      onSearch={d_q => update({ d_q })} onOpenRuns={() => update({ view: "runs" })} onRemove={run => assign(run, "")}
      onClear={clearDraft} onSave={() => void save()} onProceed={() => void proceed()} onRetrySnapshot={() => setSnapshotRefresh(value => value + 1)} />}
      {view === "runs" && <AnalysisRunExplorer data={data} loading={loading} hasError={Boolean(error)} page={page} size={size}
        search={search} sort={sort} returnTo={returnTo} selectionCount={selection.length} activeFilters={activeFilters}
        onRemoveFilter={key => update({ [key]: undefined }, true)} onSearch={q => update({ q })} onSort={sort => update({ sort })}
        onPage={page => update({ page })} onSize={page_size => update({ page_size }, true)} onOpenDataset={() => update({ view: "dataset" })}
        renderSelection={roleField} isSelected={run => Boolean(chosen[run.run_id])} />}
  </VehicSimPage>;
}
