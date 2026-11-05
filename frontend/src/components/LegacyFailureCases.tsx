"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton } from "@/components/VehicSimUi";
import { analysisError } from "@/components/analysisUi";
import { AnalysisFailureExplorer } from "@/components/analysis/AnalysisFailureExplorer";
import { positiveId } from "@/components/analysis/analysisFailurePresentation";
import { vehicsimApi } from "@/services/vehicsim";
import type { FailureFilters, FailureList } from "@/types/vehicsim";

export function LegacyFailureCases({ initialScenario, navigation }: { initialScenario?: number; navigation?: ReactNode }) {
  const { ctx } = useVehicSimContext();
  const router = useRouter(), params = useSearchParams();
  const page = positiveId(params.get("f_page"), 1);
  const size = [10, 20, 30, 50].includes(Number(params.get("f_size"))) ? Number(params.get("f_size")) : 20;
  const filters: FailureFilters = {
    // An explicit empty f_scenario means all families, even with an inherited baseline scope.
    scenario_id: params.has("f_scenario") ? positiveId(params.get("f_scenario")) || undefined : initialScenario,
    failure_class: (params.get("f_class") || undefined) as FailureFilters["failure_class"],
    outcome: (params.get("f_outcome") || undefined) as FailureFilters["outcome"],
    weather: (params.get("f_weather") || undefined) as FailureFilters["weather"],
    aeb_version_id: positiveId(params.get("f_aeb")) || undefined, days: positiveId(params.get("f_days")) || undefined,
  };
  const filterKey = JSON.stringify(filters);
  const [refresh, setRefresh] = useState(0);
  const requestKey = `${filterKey}:${page}:${size}:${refresh}`;
  const [result, setResult] = useState<{ key: string; data: FailureList | null; error: string | null } | null>(null);
  const [exportError, setExportError] = useState<{ scope: string; message: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const data = result?.key === requestKey ? result.data : null;
  const loading = result?.key !== requestKey;
  const error = result?.key === requestKey ? result.error : null;
  function update(values: Record<string, string | number>, reset = true) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value === "" && key !== "f_scenario") next.delete(key); else next.set(key, String(value));
    }
    if (reset) next.delete("f_page");
    window.history.replaceState(null, "", `/analysis/failures?${next}`);
  }
  useEffect(() => {
    let active = true;
    vehicsimApi.failures(JSON.parse(filterKey) as FailureFilters, page, size).then(value => {
      if (!active) return;
      const last = positiveId(String(value.pages), 1);
      if (page > last) {
        const next = new URLSearchParams(window.location.search); next.set("f_page", String(last));
        router.replace(`/analysis/failures?${next}`, { scroll: false }); return;
      }
      setResult({ key: requestKey, data: value, error: null });
    }).catch(err => { if (active) setResult({ key: requestKey, data: null, error: analysisError(err) }); });
    return () => { active = false; };
  }, [filterKey, page, size, requestKey, router]);
  async function exportCsv() {
    if (exporting || loading || !data || error) return;
    setExporting(true); setExportError(null);
    try { await vehicsimApi.exportFailures(filters); }
    catch (err) { setExportError({ scope: filterKey, message: analysisError(err) }); }
    finally { setExporting(false); }
  }
  return <VehicSimPage step={4} crumbs={[{ label: "Phân tích" }, { label: "Ca lỗi" }]} title="Tra cứu ca lỗi"
    subtitle="Đọc nhận định theo luật, đối chiếu số đo và mở bằng chứng của từng lượt chạy."
    actions={<PillButton disabled={exporting || loading || !data || Boolean(error)} onClick={() => void exportCsv()}>{exporting ? "Đang xuất…" : "Xuất CSV"}</PillButton>}>
    {navigation}<ErrorNote message={error ?? (exportError?.scope === filterKey ? exportError.message : null)} />
    {error && <div><button className="analysis-button" onClick={() => setRefresh(value => value + 1)}>Thử tải lại</button></div>}
    <AnalysisFailureExplorer data={data} loading={loading} hasError={Boolean(error)} filters={filters} page={page} size={size}
      search={params.get("f_q") ?? ""} returnTo={`/analysis/failures?${params}`} families={ctx?.families ?? []} versions={ctx?.versions ?? []} onUpdate={update} />
  </VehicSimPage>;
}
