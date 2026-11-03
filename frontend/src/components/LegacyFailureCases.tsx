"use client";

import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { CLASS_STYLE, ClassBadge, ErrorNote, OutcomeBadge, PillButton, StatCard, fmt, runCode } from "@/components/VehicSimUi";
import { AnalysisLoading, AnalysisPager, analysisError, analysisLabel } from "@/components/analysisUi";
import { vi, viSummary } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { FailureClass, FailureFilters, FailureList } from "@/types/vehicsim";
const CLASSES: FailureClass[] = ["PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS"];

export function LegacyFailureCases({ initialScenario, navigation }: { initialScenario?: number; navigation?: ReactNode }) {
  const { ctx } = useVehicSimContext();
  const router = useRouter(), params = useSearchParams();
  const page = Math.max(1, Number(params.get("f_page")) || 1);
  const size = [10, 20, 30, 50].includes(Number(params.get("f_size"))) ? Number(params.get("f_size")) : 20;
  const filters: FailureFilters = {
    scenario_id: params.has("f_scenario") ? Number(params.get("f_scenario")) || undefined : initialScenario,
    failure_class: (params.get("f_class") || undefined) as FailureFilters["failure_class"],
    outcome: (params.get("f_outcome") || undefined) as FailureFilters["outcome"],
    weather: (params.get("f_weather") || undefined) as FailureFilters["weather"],
    aeb_version_id: Number(params.get("f_aeb")) || undefined, days: Number(params.get("f_days")) || undefined,
  };
  const filterKey = JSON.stringify(filters), requestKey = `${filterKey}:${page}:${size}`;
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; data: FailureList | null; error: string | null } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null), [exporting, setExporting] = useState(false);
  const data = result?.key === `${requestKey}:${refresh}` ? result.data : null;
  const loading = result?.key !== `${requestKey}:${refresh}`;
  const error = result?.key === `${requestKey}:${refresh}` ? result.error : null;
  function update(values: Record<string, string | number>, reset = true) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) next.set(key, String(value));
    if (reset) next.delete("f_page");
    window.history.replaceState(null, "", `/analysis/failures?${next}`);
  }
  useEffect(() => {
    let active = true;
    vehicsimApi.failures(JSON.parse(filterKey) as FailureFilters, page, size).then(value => {
      if (!active) return;
      if (page > Math.max(1, value.pages)) {
        const next = new URLSearchParams(window.location.search); next.set("f_page", String(Math.max(1, value.pages)));
        router.replace(`/analysis/failures?${next}`, { scroll: false }); return;
      }
      setResult({ key: `${requestKey}:${refresh}`, data: value, error: null });
    }).catch(e => { if (active) setResult({ key: `${requestKey}:${refresh}`, data: null, error: analysisError(e) }); });
    return () => { active = false; };
  }, [filterKey, page, size, refresh, requestKey, router]);
  const k = data?.kpis;
  const returnTo = encodeURIComponent(`/analysis/failures?${params}`);
  const options = (values: string[]) => <><option value="">Tất cả</option>{values.map(value => <option key={value} value={value}>{analysisLabel(value)}</option>)}</>;
  async function exportCsv() {
    if (exporting) return; setExporting(true); setExportError(null);
    try { await vehicsimApi.exportFailures(filters); } catch (e) { setExportError(analysisError(e)); } finally { setExporting(false); }
  }
  return <VehicSimPage step={4} crumbs={[{ label: "Phân tích" }, { label: "Ca lỗi" }]} title="Tra cứu ca lỗi"
    subtitle="Truy vết kết quả và nhận định theo từng khâu AEB. Nguyên nhân theo luật là giả thuyết cần đối chiếu telemetry."
    actions={<PillButton disabled={exporting} onClick={() => void exportCsv()}>{exporting ? "Đang xuất…" : "Xuất CSV"}</PillButton>}>
    {navigation}<ErrorNote message={error ?? exportError} />
    {error && <div><button className="analysis-button" onClick={() => setRefresh(x => x + 1)}>Thử tải lại</button></div>}
    <div className="analysis-kpis"><StatCard label="Tổng số ca lỗi" value={k?.total ?? "—"} /><StatCard label="Va chạm" value={k?.collisions ?? "—"} tone="danger" /><StatCard label="Suýt va chạm" value={k?.near_misses ?? "—"} tone="warn" /><StatCard label="Phanh oan" value={k?.false_braking ?? "—"} tone="warn" /></div>
    <section className="analysis-panel"><h2>Khâu được hệ thống nhận định</h2><p className="analysis-caption">Bấm một khâu để lọc. Số lượng theo đúng phạm vi đang chọn; đây không phải xác suất nguyên nhân.</p><div className="grid grid-cols-2 gap-3 mt-4">{CLASSES.map(key => <button key={key} aria-pressed={filters.failure_class === key} className="analysis-button text-left" onClick={() => update({ f_class: filters.failure_class === key ? "" : key })}><span className="analysis-chart-row" style={{ gridTemplateColumns: "1fr 1fr 30px" }}><span>{CLASS_STYLE[key].label}</span><progress aria-label={`Số ca ${CLASS_STYLE[key].label}`} value={k?.by_class[key] ?? 0} max={Math.max(1, k?.total ?? 0)} style={{ "--bar-color": "var(--color-vehicsim-decision)" } as CSSProperties} /><span>{k ? k.by_class[key] : "—"}</span></span></button>)}</div></section>
    <section className="analysis-panel space-y-4"><div className="analysis-toolbar"><h2>Lọc ca lỗi</h2><button className="analysis-button" onClick={() => update({ f_scenario: "", f_class: "", f_outcome: "", f_weather: "", f_aeb: "", f_days: "" })}>Xóa bộ lọc ca lỗi</button></div>
      <div className="analysis-filters">
        <label>Họ kịch bản<select value={filters.scenario_id ?? ""} onChange={e => update({ f_scenario: e.target.value })}><option value="">Tất cả họ</option>{ctx?.families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Nhóm lỗi<select value={filters.failure_class ?? ""} onChange={e => update({ f_class: e.target.value })}>{options(CLASSES)}</select></label>
        <label>Kết quả<select value={filters.outcome ?? ""} onChange={e => update({ f_outcome: e.target.value })}>{options(["COLLISION", "NEAR_MISS", "FALSE_BRAKING"])}</select></label>
        <label>Thời tiết<select value={filters.weather ?? ""} onChange={e => update({ f_weather: e.target.value })}>{options(["CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG"])}</select></label>
        <label>Cấu hình AEB<select value={filters.aeb_version_id ?? ""} onChange={e => update({ f_aeb: e.target.value })}><option value="">Tất cả</option>{ctx?.versions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
        <label>Thời gian<select value={filters.days ?? ""} onChange={e => update({ f_days: e.target.value })}><option value="">Toàn bộ thời gian</option><option value="7">7 ngày qua</option><option value="30">30 ngày qua</option><option value="90">90 ngày qua</option></select></label>
      </div>
    </section>
    <section className="analysis-panel space-y-4"><h2>Ca lỗi và bằng chứng</h2>{loading ? <AnalysisLoading /> : data && <>
      <div className="analysis-table-wrap"><table className="analysis-table"><caption className="sr-only">Ca lỗi, nhận định nguyên nhân và chỉ số đã ghi</caption><thead><tr>{["Lượt chạy / kịch bản", "Kết quả / khâu lỗi", "Nhận định nguyên nhân", "Va chạm (km/h)", "TTC min (s)", "Cấu hình", "Bằng chứng"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data.items.map(item => <tr key={item.run_id}><td><Link href={`/analysis/failures/${item.run_id}?returnTo=${returnTo}`}>{runCode(item.run_id)} · {item.variant}</Link><small>{item.family}</small><small>{viSummary(item.summary)}</small></td><td><div className="flex flex-col items-start gap-2"><OutcomeBadge outcome={item.outcome} /><ClassBadge value={item.failure_class} /></div></td><td className="max-w-80">{vi(item.root_cause)}<small>Nhận định theo luật</small></td><td className="numeric">{item.impact_kmh == null ? "—" : item.impact_kmh.toFixed(1)}</td><td className="numeric">{fmt.s(item.min_ttc_s)}</td><td>{item.config}</td><td><Link href={`/analysis/failures/${item.run_id}/playback?returnTo=${returnTo}`}>Phát lại →</Link></td></tr>)}</tbody></table></div>
      {!data.items.length && <div className="analysis-state"><strong>Không có ca lỗi nào với bộ lọc này.</strong><p>Thử mở rộng bộ lọc hoặc xem ca an toàn trong mục Lượt chạy.</p></div>}
      <AnalysisPager page={page} size={size} total={data.total} onPage={value => update({ f_page: value }, false)} onSize={value => update({ f_size: value })} />
    </>}</section>
  </VehicSimPage>;
}
