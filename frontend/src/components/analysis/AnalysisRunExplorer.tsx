"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AnalysisBadge, AnalysisLoading, AnalysisPager, AnalysisTableRegion, analysisLabel } from "@/components/analysisUi";
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
  selecting: boolean;
  activeFilters: { key: string; label: string }[];
  onResetFilters: () => void;
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
  selectionCount, selecting, activeFilters, onResetFilters, onRemoveFilter, onSearch, onPage, onSize,
  onOpenDataset, renderSelection, isSelected }: Props) {
  const [collisionFilter, setCollisionFilter] = useState(""), [outcomeFilter, setOutcomeFilter] = useState("");
  const query = search.trim().toLocaleLowerCase("vi");
  const rows = (data?.items ?? []).filter(run =>
    `${run.run_id} ${run.family} ${run.variant} ${run.seed}`.toLocaleLowerCase("vi").includes(query)
    && (!outcomeFilter || run.outcome === outcomeFilter)
    && (!collisionFilter || (collisionFilter === "collision" ? run.outcome === "COLLISION" : ["SAFE", "NEAR_MISS", "FALSE_BRAKING", "MISSED_BRAKING", "OTHER_FAILURE"].includes(run.outcome))));
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
      <div><h2 id="analysis-runs-title" tabIndex={-1}>Lượt chạy baseline</h2></div>
      <button id="analysis-prepare-trigger" className="analysis-button" onClick={onOpenDataset}>{selecting ? `Rà soát lựa chọn (${selectionCount}) →` : "Chuẩn bị bàn giao"}</button>
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
      <label>Kết quả va chạm<select value={collisionFilter} onChange={e => setCollisionFilter(e.target.value)}><option value="">Tất cả</option><option value="collision">Có va chạm</option><option value="no_collision">Không ghi nhận va chạm</option></select></label>
      <label>Loại kết quả<select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}><option value="">Tất cả</option><option value="FALSE_BRAKING">Phanh không cần thiết</option><option value="MISSED_BRAKING">Bỏ sót phanh</option><option value="OTHER_FAILURE">Lỗi khác</option></select></label>
    </div>
    <p id="run-search-scope" className="analysis-caption">Tìm và lọc áp dụng cho tối đa {size} lượt ở trang này. Một số kết quả chưa xác định được tình trạng va chạm.</p>
    {loading ? <AnalysisLoading /> : hasError ? <div className="analysis-state">Chưa tải được danh sách. Dùng nút “Thử tải lại” phía trên.</div> : data && <>
      <div className={styles.summary}>
        <p role="status">Hiển thị <strong>{rows.length}</strong> / {data.items.length} run trong trang · <strong>{data.total}</strong> run khớp bộ lọc</p>
      </div>
      {rows.length > 0 ? <AnalysisTableRegion className={styles.tableWrap} label="Bảng lượt chạy baseline, cuộn ngang để xem thêm">
        <table className={`analysis-table ${styles.table}`}>
          <caption className="sr-only">Lượt chạy baseline, seed, cấu hình, trạng thái, chỉ số từ API và thao tác</caption>
          <thead><tr>
            <th scope="col">Run / biến thể</th><th scope="col">Trạng thái / kết quả đã lưu</th>
            {selecting && <th scope="col">Tập dữ liệu</th>}<th scope="col">Thao tác</th>
          </tr></thead>
          <tbody>{rows.map(run => <tr key={run.run_id} data-run-id={run.run_id} data-selected={isSelected(run)}>
            <td className={styles.identity}><Link href={href(run.run_id)}>#{run.run_id} · {run.variant}</Link><small>{run.family}</small>{run.aeb_mode === "OFF" && <small>AEB tắt · lượt đối chứng</small>}</td>

            <td className={styles.result}><div className={styles.badges}><div><span className={styles.badgeLabel}>Chạy</span><AnalysisBadge value={run.status} /></div><div><span className={styles.badgeLabel}>Theo luật</span><AnalysisBadge value={run.outcome} /></div></div>
              {run.failure_class && <small>{analysisLabel(run.failure_class)}</small>}
              {run.error && <small className={styles.error} title={run.error}>{run.error}</small>}
            </td>
            {selecting && <td>{renderSelection(run)}</td>}
            <td><div className={styles.actions}><Link href={href(run.run_id)} aria-label={`Chi tiết run ${run.run_id}`}>Xem kết quả →</Link>
            </div></td>
          </tr>)}</tbody>
        </table>
      </AnalysisTableRegion> : <div className="analysis-state">
        <strong>{data.total === 0 ? activeFilters.length ? "Không có run khớp bộ lọc." : "Chưa có run baseline để hiển thị." : "Không có kết quả tìm trong trang này."}</strong>
        <p>{data.total === 0 ? activeFilters.length ? "Bớt hoặc xóa bộ lọc để xem các run khác." : "Phạm vi này chỉ gồm baseline AEB bật của dự án đang mở. Có thể xem hoặc chạy baseline ở màn Kịch bản." : "Thử từ khóa khác hoặc chuyển trang. Bộ lọc toàn danh sách nằm phía trên."}</p>
        {data.total === 0 && activeFilters.length > 0 && <button className="analysis-button" onClick={onResetFilters}>Xóa bộ lọc danh sách</button>}
        {data.total === 0 && <Link href="/scenarios" className="analysis-button">Mở kịch bản</Link>}
        {search && <button className="analysis-button" onClick={() => onSearch("")}>Hiện toàn bộ trang này</button>}
      </div>}
      <AnalysisPager page={page} size={size} total={data.total} onPage={onPage} onSize={onSize} />
    </>}
  </section>;
}
