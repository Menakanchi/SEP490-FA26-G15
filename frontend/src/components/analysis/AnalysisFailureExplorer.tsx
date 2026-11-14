"use client";

import Link from "next/link";
import { AnalysisBadge, AnalysisLoading, AnalysisPager, AnalysisTableRegion, analysisLabel, metric } from "@/components/analysisUi";
import { vi, viSummary } from "@/components/vehicsimI18n";
import { runCode } from "@/components/VehicSimUi";
import type { FailureFilters, FailureList } from "@/types/vehicsim";
import { FAILURE_FILTER_KEYS, FAILURE_OUTCOMES, FAILURE_STAGES, FAILURE_WEATHERS, validCount } from "./analysisFailurePresentation";
import { formatMetric } from "./analysisMetricFormat";
import styles from "./AnalysisFailureExplorer.module.css";

type Props = {
  data: FailureList | null; loading: boolean; hasError: boolean; filters: FailureFilters;
  page: number; size: number; search: string; returnTo: string;
  families: { id: number; name: string }[]; versions: { id: number; label: string }[];
  onUpdate: (values: Record<string, string | number>, reset?: boolean) => void;
};
const count = (value: unknown) => validCount(value) ? value.toLocaleString("vi-VN") : "—";
export function AnalysisFailureExplorer({ data, loading, hasError, filters, page, size, search, returnTo, families, versions, onUpdate }: Props) {
  const k = data?.kpis;
  const query = search.trim().toLocaleLowerCase("vi");
  const rows = (data?.items ?? []).filter(item => `${item.run_id} ${item.family} ${item.variant} ${item.root_cause ?? ""} ${vi(item.root_cause ?? "")} ${item.cause_code ?? ""}`.toLocaleLowerCase("vi").includes(query));
  const familyOptions = [...new Map([...families, ...(data?.families ?? [])].map(family => [family.id, family])).values()];
  if (filters.scenario_id && !familyOptions.some(family => family.id === filters.scenario_id)) familyOptions.push({ id: filters.scenario_id, name: `Họ #${filters.scenario_id}` });
  const versionOptions = [...versions];
  if (filters.aeb_version_id && !versionOptions.some(version => version.id === filters.aeb_version_id)) versionOptions.push({ id: filters.aeb_version_id, label: `AEB #${filters.aeb_version_id}` });
  const filterEntries = [
    { key: "f_scenario", value: filters.scenario_id, label: `Họ: ${familyOptions.find(family => family.id === filters.scenario_id)?.name ?? filters.scenario_id}` },
    { key: "f_class", value: filters.failure_class, label: `Khâu: ${analysisLabel(filters.failure_class ?? null)}` },
    { key: "f_outcome", value: filters.outcome, label: `Kết quả: ${analysisLabel(filters.outcome ?? null)}` },
    { key: "f_weather", value: filters.weather, label: `Thời tiết: ${analysisLabel(filters.weather ?? null)}` },
    { key: "f_aeb", value: filters.aeb_version_id, label: `AEB: ${versionOptions.find(version => version.id === filters.aeb_version_id)?.label ?? filters.aeb_version_id}` },
    { key: "f_days", value: filters.days, label: `${filters.days} ngày qua` },
  ].filter(filter => filter.value !== undefined);
  const options = (values: string[], selected?: string) => <><option value="">Tất cả</option>{selected && !values.includes(selected) && <option value={selected}>{analysisLabel(selected)}</option>}{values.map(value => <option key={value} value={value}>{analysisLabel(value)}</option>)}</>;
  const href = (id: number, section: "evidence" | "telemetry" | "playback") => `/analysis/failures/${id}${section === "playback" ? "/playback?" : `?section=${section}&`}returnTo=${encodeURIComponent(returnTo)}`;
  return <div className={styles.stack}>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Bộ lọc ca lỗi">
      <div className="analysis-toolbar"><h2>Phạm vi ca lỗi</h2><button className="analysis-button" onClick={() => onUpdate(Object.fromEntries(FAILURE_FILTER_KEYS.map(key => [key, ""])))}>Xóa bộ lọc ca lỗi</button></div>
      <div className={styles.filters}>
        <label>Họ kịch bản<select aria-label="Họ kịch bản" value={filters.scenario_id ?? ""} onChange={event => onUpdate({ f_scenario: event.target.value })}><option value="">Tất cả họ</option>{familyOptions.map(family => <option key={family.id} value={family.id}>{family.name}</option>)}</select></label>
        <label>Khâu chính<select aria-label="Khâu chính" value={filters.failure_class ?? ""} onChange={event => onUpdate({ f_class: event.target.value })}>{options(FAILURE_STAGES, filters.failure_class)}</select></label>
        <label>Kết quả AEB<select aria-label="Kết quả AEB" value={filters.outcome ?? ""} onChange={event => onUpdate({ f_outcome: event.target.value })}>{options(FAILURE_OUTCOMES, filters.outcome)}</select></label>
        <label>Thời tiết<select aria-label="Thời tiết" value={filters.weather ?? ""} onChange={event => onUpdate({ f_weather: event.target.value })}>{options(FAILURE_WEATHERS, filters.weather)}</select></label>
        <label>Cấu hình AEB<select aria-label="Cấu hình AEB" value={filters.aeb_version_id ?? ""} onChange={event => onUpdate({ f_aeb: event.target.value })}><option value="">Tất cả</option>{versionOptions.map(version => <option key={version.id} value={version.id}>{version.label}</option>)}</select></label>
        <label>Khoảng thời gian<select aria-label="Khoảng thời gian" value={filters.days ?? ""} onChange={event => onUpdate({ f_days: event.target.value })}><option value="">Toàn bộ thời gian</option>{filters.days && ![7, 30, 90].includes(filters.days) && <option value={filters.days}>{filters.days} ngày qua</option>}{[7, 30, 90].map(days => <option key={days} value={days}>{days} ngày qua</option>)}</select></label>
      </div>
      {filterEntries.length > 0 && <div className={styles.chips} aria-label="Bộ lọc ca lỗi đang áp dụng">{filterEntries.map(filter => <button key={filter.key} aria-label={`Bỏ bộ lọc ${filter.label}`} onClick={() => onUpdate({ [filter.key]: "" })}>{filter.label} <span aria-hidden="true">×</span></button>)}</div>}
      <p className="analysis-caption">KPI, phân bố khâu và danh sách dùng cùng bộ lọc máy chủ. Bộ lọc ca lỗi giữ riêng với Lượt chạy.</p>
    </section>
    <section aria-label="Thống kê ca lỗi" className={styles.kpis}>
      {([["total", "Tổng số ca lỗi"], ["collisions", "Va chạm"], ["near_misses", "Suýt va chạm"], ["false_braking", "Phanh oan"]] as const).map(([key, label]) => <article key={key} className={styles.kpi} aria-label={`KPI ${label}`}><dl><dt>{label}</dt><dd>{count(k?.[key])}</dd></dl><small>{validCount(k?.[key]) ? "Trong toàn bộ phạm vi đang lọc" : loading ? "Đang tải thống kê" : "API chưa có thống kê"}</small></article>)}
    </section>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Phân bố khâu nguyên nhân">
      <div><h2>Khâu được hệ thống nhận định</h2><p className="analysis-caption">Số ca theo khâu chính do API trả về. Chọn một khâu để lọc; phân bố này không phải xác suất nguyên nhân.</p></div>
      <div className={styles.stages}>{FAILURE_STAGES.map(stage => {
        const value = k?.by_class?.[stage], total = k?.total;
        const canDraw = validCount(value) && validCount(total) && total > 0 && value <= total;
        return <button key={stage} className={styles.stage} aria-label={`Lọc khâu ${analysisLabel(stage)}`} aria-pressed={filters.failure_class === stage} onClick={() => onUpdate({ f_class: filters.failure_class === stage ? "" : stage })}>
          <header><span>{analysisLabel(stage)}</span><strong>{count(value)}</strong></header>
          {canDraw && <progress aria-label={`Số ca ${analysisLabel(stage)}`} value={value} max={total} />}
          <small>{!validCount(value) ? "Chưa có số lượng từ API" : !validCount(total) ? "Chưa có tổng phạm vi" : value > total ? "Số khâu vượt tổng phạm vi" : `${count(value)} ca trong ${count(total)} ca lỗi`}</small>
        </button>;
      })}</div>
      {k?.total === 0 && <p className="analysis-caption">Chưa có ca lỗi phù hợp để vẽ phân bố.</p>}
    </section>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Danh sách ca lỗi và bằng chứng">
      <div><h2>Ca lỗi và bằng chứng</h2><p className="analysis-caption">Nhận định theo luật từ kết quả đã lưu; mở khâu và số đo trước khi kết luận nguyên nhân.</p></div>
      <div className={styles.tools}><label className={styles.search}>Tìm trong trang ca lỗi<input type="search" aria-label="Tìm trong trang ca lỗi" placeholder="Mã run, biến thể, nhận định, mã nguyên nhân…" value={search} onChange={event => onUpdate({ f_q: event.target.value }, false)} /></label>{search && <button className="analysis-button" onClick={() => onUpdate({ f_q: "" }, false)}>Xóa tìm kiếm ca lỗi</button>}</div>
      <p className="analysis-caption">Tìm kiếm áp dụng trong tối đa {size} ca của trang đang tải. CSV áp dụng bộ lọc máy chủ, bỏ qua tìm kiếm và trang đang xem.</p>
      {loading ? <AnalysisLoading /> : hasError ? <div className="analysis-state">Chưa tải được ca lỗi. Dùng nút “Thử tải lại” phía trên.</div> : data && <>
        <div className={styles.summary}><p role="status">Hiển thị <strong>{rows.length}</strong> / {data.items.length} ca trong trang · <strong>{count(data.total)}</strong> ca khớp bộ lọc</p><span className="analysis-caption">Mới nhất trước · —: chưa có số đo</span></div>
        {rows.length > 0 ? <AnalysisTableRegion className={styles.tableWrap} label="Bảng ca lỗi, cuộn ngang để xem thêm"><table className={`analysis-table ${styles.table}`}>
          <caption className="sr-only">Ca lỗi, nhận định chính, điểm luật và bằng chứng từ API</caption>
          <thead><tr>{["Run / biến thể", "Kết quả / khâu chính", "Nhận định theo luật", "Va chạm (km/h)", "TTC min (s)", "Cấu hình / điều kiện", "Bằng chứng"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{rows.map((item, index) => <tr key={`${item.failure_id ?? item.run_id}-${index}`} data-failure-run={item.run_id}>
            <td className={styles.identity}><Link href={href(item.run_id, "evidence")}>{runCode(item.run_id)} · {item.variant}</Link><small>{item.family}</small><small>{viSummary(item.summary)}</small></td>
            <td><div className={styles.badges}><AnalysisBadge value={item.outcome} />{item.failure_class ? <AnalysisBadge value={item.failure_class} /> : <small>Chưa có khâu nhận định</small>}</div></td>
            <td className={styles.cause}><p>{item.root_cause ? vi(item.root_cause) : "API chưa có mô tả nhận định."}</p><small>Điểm luật: {metric(item.confidence)}</small>{item.cause_code && <details><summary>Mã nguyên nhân</summary><code>{item.cause_code}</code></details>}</td>
            <td className="numeric">{item.outcome === "COLLISION" ? formatMetric(item.impact_kmh, 1, true) : "—"}</td><td className="numeric">{formatMetric(item.min_ttc_s, 2, true)}</td>
            <td className={styles.context}>{item.config || "—"}<small>{analysisLabel(item.weather ?? null)} · {analysisLabel(item.time_of_day ?? null)}</small></td>
            <td><div className={styles.actions}><Link href={href(item.run_id, "evidence")} aria-label={`Bằng chứng run ${item.run_id}`}>Nguyên nhân →</Link><Link href={href(item.run_id, "telemetry")} aria-label={`Telemetry run ${item.run_id}`}>Telemetry →</Link><Link href={href(item.run_id, "playback")} aria-label={`Playback run ${item.run_id}`}>Playback ↗</Link></div></td>
          </tr>)}</tbody>
        </table></AnalysisTableRegion> : <div className="analysis-state"><strong>{data.total === 0 ? "Không có ca lỗi nào với bộ lọc này." : "Không có kết quả tìm trong trang ca lỗi."}</strong><p>{data.total === 0 ? "Thử mở rộng bộ lọc hoặc xem ca an toàn trong mục Lượt chạy." : "Thử từ khóa khác hoặc chuyển trang."}</p>{search && <button className="analysis-button" onClick={() => onUpdate({ f_q: "" }, false)}>Hiện toàn bộ trang ca lỗi</button>}</div>}
        {rows.length > 0 && <p className="analysis-caption">Cuộn ngang để xem thêm nhận định và chỉ số. Điểm luật không phải xác suất đã hiệu chuẩn.</p>}
        <AnalysisPager page={page} size={size} total={data.total} onPage={value => onUpdate({ f_page: value }, false)} onSize={value => onUpdate({ f_size: value })} />
      </>}
    </section>
  </div>;
}
