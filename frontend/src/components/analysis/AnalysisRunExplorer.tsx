"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AnalysisBadge, AnalysisLoading, AnalysisPager, analysisLabel, metric } from "@/components/analysisUi";
import type { AnalysisDashboardData, AnalysisRun } from "@/types/vehicsim";
import styles from "./AnalysisRunExplorer.module.css";

type Props = {
  data: AnalysisDashboardData | null;
  loading: boolean;
  hasError: boolean;
  page: number;
  size: number;
  search: string;
  sort: string;
  returnTo: string;
  selectionCount: number;
  activeFilters: { key: string; label: string }[];
  onRemoveFilter: (key: string) => void;
  onSearch: (value: string) => void;
  onSort: (value: string) => void;
  onPage: (value: number) => void;
  onSize: (value: number) => void;
  onOpenDataset: () => void;
  renderSelection: (run: AnalysisRun) => ReactNode;
  isSelected: (run: AnalysisRun) => boolean;
};

// Presentation only: sort the loaded page without filling or recalculating metrics.
function descendingMetric(a: number | null, b: number | null) {
  const aValid = a != null && Number.isFinite(a), bValid = b != null && Number.isFinite(b);
  if (!aValid) return bValid ? 1 : 0;
  if (!bValid) return -1;
  return b - a;
}

export function AnalysisRunExplorer({ data, loading, hasError, page, size, search, sort, returnTo,
  selectionCount, activeFilters, onRemoveFilter, onSearch, onSort, onPage, onSize,
  onOpenDataset, renderSelection, isSelected }: Props) {
  const query = search.trim().toLocaleLowerCase("vi");
  const rows = (data?.items ?? []).filter(run =>
    `${run.run_id} ${run.family} ${run.variant} ${run.seed}`.toLocaleLowerCase("vi").includes(query));
  const activeSort = ["newest", "oldest", "impact", "jerk"].includes(sort) ? sort : "newest";
  rows.sort((a, b) => {
    if (activeSort === "oldest") return a.run_id - b.run_id;
    if (activeSort === "impact") return descendingMetric(a.metrics.impact_speed_mps, b.metrics.impact_speed_mps) || b.run_id - a.run_id;
    if (activeSort === "jerk") return descendingMetric(a.metrics.rms_jerk_mps3, b.metrics.rms_jerk_mps3) || b.run_id - a.run_id;
    return b.run_id - a.run_id;
  });
  const href = (id: number, playback = false) => `/analysis/failures/${id}${playback ? "/playback" : ""}?returnTo=${encodeURIComponent(returnTo)}`;
  return <section className={`analysis-panel ${styles.explorer}`} aria-label="Khám phá lượt chạy baseline">
    <div className="analysis-toolbar">
      <div><h2>Lượt chạy baseline</h2><p className="analysis-caption">Đọc kết quả, mở bằng chứng và chọn run cho tập bàn giao.</p></div>
      <button className="analysis-button" onClick={onOpenDataset}>Rà soát lựa chọn ({selectionCount}) →</button>
    </div>
    {activeFilters.length > 0 && <div className={styles.filters} aria-label="Bộ lọc đang áp dụng">
      <span>Đang lọc toàn danh sách</span>
      {activeFilters.map(filter => <button key={filter.key} className={styles.chip} onClick={() => onRemoveFilter(filter.key)} aria-label={`Bỏ bộ lọc ${filter.label}`}>
        {filter.label}<span aria-hidden="true">×</span>
      </button>)}
    </div>}
    <div className={styles.tools}>
      <label className={styles.search}>Tìm trong trang hiện tại
        <input type="search" aria-label="Tìm trong trang hiện tại" aria-describedby="run-search-scope" placeholder="Mã run, họ, biến thể, seed…" value={search} onChange={e => onSearch(e.target.value)} />
      </label>
      {search && <button className="analysis-button" onClick={() => onSearch("")}>Xóa tìm kiếm</button>}
      <label className={styles.sort}>Sắp xếp trong trang
        <select aria-label="Sắp xếp trong trang" value={activeSort} onChange={e => onSort(e.target.value)}>
          <option value="newest">Mã run giảm dần</option><option value="oldest">Mã run tăng dần</option>
          <option value="impact">Tốc độ va chạm giảm dần</option><option value="jerk">RMS jerk giảm dần</option>
        </select>
      </label>
    </div>
    <p id="run-search-scope" className="analysis-caption">Tìm và sắp xếp áp dụng cho tối đa {size} run của trang này. Bộ lọc phía trên áp dụng cho toàn bộ danh sách.</p>
    {loading ? <AnalysisLoading /> : hasError ? <div className="analysis-state">Chưa tải được danh sách. Dùng nút “Thử tải lại” phía trên.</div> : data && <>
      <div className={styles.summary}>
        <p role="status">Hiển thị <strong>{rows.length}</strong> / {data.items.length} run trong trang · <strong>{data.total}</strong> run khớp bộ lọc</p>
        <span>—: chưa có số đo · Chỉ số theo API</span>
      </div>
      {rows.length > 0 ? <div className={styles.tableWrap} role="region" aria-label="Bảng lượt chạy baseline, cuộn ngang để xem thêm" tabIndex={0}>
        <table className={`analysis-table ${styles.table}`}>
          <caption className="sr-only">Lượt chạy baseline, seed, cấu hình, trạng thái, chỉ số từ API và thao tác</caption>
          <thead><tr>
            <th scope="col">Run / biến thể</th><th scope="col">Nguồn / cấu hình</th><th scope="col">Trạng thái / kết quả AEB</th>
            <th scope="col" className={styles.metricHeading}>RMS jerk<small>m/s³</small></th>
            <th scope="col" className={styles.metricHeading}>Tốc độ va chạm<small>m/s</small></th>
            <th scope="col" className={styles.metricHeading}>Quãng phanh<small>m</small></th>
            <th scope="col">Tập dữ liệu</th><th scope="col">Thao tác</th>
          </tr></thead>
          <tbody>{rows.map(run => <tr key={run.run_id} data-run-id={run.run_id} data-selected={isSelected(run)}>
            <td className={styles.identity}><Link href={href(run.run_id)}>#{run.run_id} · {run.variant}</Link><small>{run.family}</small><span className={styles.seed}>Seed {run.seed}</span></td>
            <td className={styles.source}><strong>{run.simulator}</strong><small>dt {run.dt} s · baseline #{run.baseline_id} · xe #{run.vehicle_id}</small><small>{analysisLabel(run.weather)} · {analysisLabel(run.time_of_day)}</small></td>
            <td className={styles.result}><div className={styles.badges}><div><span className={styles.badgeLabel}>Chạy</span><AnalysisBadge value={run.status} /></div><div><span className={styles.badgeLabel}>AEB</span><AnalysisBadge value={run.outcome} /></div></div>
              <small>{run.trace_available ? "Có telemetry" : "Thiếu telemetry"}{run.failure_class ? ` · ${analysisLabel(run.failure_class)}` : ""}</small>
              {run.error && <small className={styles.error} title={run.error}>{run.error}</small>}
            </td>
            <td className="numeric">{metric(run.metrics.rms_jerk_mps3)}</td><td className="numeric">{metric(run.metrics.impact_speed_mps)}</td><td className="numeric">{metric(run.metrics.stopping_distance_m)}</td>
            <td>{renderSelection(run)}</td>
            <td><div className={styles.actions}><Link href={href(run.run_id)} aria-label={`Chi tiết run ${run.run_id}`}>Chi tiết →</Link>
              {run.trace_available ? <Link href={href(run.run_id, true)} aria-label={`Playback run ${run.run_id}`}>Playback ↗</Link> : <span title="API chưa có telemetry để phát lại">Chưa có playback</span>}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="analysis-state">
        <strong>{data.total === 0 ? "Chưa có run baseline phù hợp." : "Không có kết quả tìm trong trang này."}</strong>
        <p>{data.total === 0 ? "Thử bỏ bộ lọc hoặc chạy baseline ở màn Kịch bản." : "Thử từ khóa khác hoặc chuyển trang. Bộ lọc toàn danh sách nằm phía trên."}</p>
        {search && <button className="analysis-button" onClick={() => onSearch("")}>Hiện toàn bộ trang này</button>}
      </div>}
      {rows.length > 0 && <p className="analysis-caption">Cuộn ngang bảng để xem thêm chỉ số và tập dữ liệu.</p>}
      <AnalysisPager page={page} size={size} total={data.total} onPage={onPage} onSize={onSize} />
    </>}
  </section>;
}
