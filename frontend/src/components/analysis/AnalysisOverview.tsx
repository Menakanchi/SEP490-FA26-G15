"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { AnalysisLoading, AnalysisTableRegion, analysisLabel } from "@/components/analysisUi";
import type { AnalysisDashboardData, AnalysisRun, ObjectiveAggregate } from "@/types/vehicsim";
import { overviewCount, overviewGroup, overviewMetric, overviewObjective, overviewPercentage, overviewResponse, overviewRun, overviewVersion } from "./analysisOverviewData";
import styles from "./AnalysisOverview.module.css";

const AEB_OUTCOMES = ["SAFE", "COLLISION", "FALSE_BRAKING", "NEAR_MISS", "MISSED_BRAKING", "OTHER_FAILURE"];
const DATA_OUTCOMES = ["ERROR", "TIMEOUT", "CANCELLED", "INCOMPLETE", "NOT_FINISHED"];
const displayCount = (value: number | null) => value === null ? "—" : value.toLocaleString("vi-VN");
const outcomeColor = (key: string) => key === "SAFE" ? "var(--color-vehicsim-ok)" : key === "COLLISION" ? "var(--color-vehicsim-danger)" : "var(--color-vehicsim-warn)";

type Props = {
  data: AnalysisDashboardData | null;
  loading: boolean;
  hasError: boolean;
  onOpenRuns: () => void;
  onFilterSimulator: (simulator: string) => void;
  returnTo: string;
  scope: string[];
};

export function AnalysisOverview({ data, loading, hasError, onOpenRuns, onFilterSimulator, returnTo, scope }: Props) {
  if (loading) return <section aria-label="Tổng quan baseline" aria-busy="true" className={`${styles.overview} ${styles.loading}`}><AnalysisLoading /></section>;
  if (!data) return <section aria-label="Tổng quan baseline" className="analysis-panel analysis-state"><p>{hasError ? "Chưa tải được tổng quan. Vui lòng thử tải lại kết quả." : "Chưa có dữ liệu tổng quan từ API."}</p></section>;
  if (!overviewResponse(data)) return <section aria-label="Tổng quan baseline" className="analysis-panel analysis-state"><p role="alert">Dữ liệu tổng quan không hợp lệ.</p><p>Dùng “Tải lại kết quả” để yêu cầu dữ liệu mới; chưa thể hiển thị thống kê.</p></section>;

  const total = data.total;
  const count = (value: unknown) => overviewCount(value, total);
  const groups = data.objective_groups.filter(overviewGroup).sort((a, b) => Number(b.simulator.startsWith("carla-")) - Number(a.simulator.startsWith("carla-")));
  const carlaGroups = groups.filter(group => group.simulator.startsWith("carla-")).length;
  const percentage = (value: number | null) => overviewPercentage(value, total);
  const runs = data.items.filter(overviewRun);
  const kpis = [
    { label: "Tổng lượt chạy", value: total, note: "Toàn bộ phạm vi đang lọc", tone: "neutral" },
    { label: "An toàn", value: count(data.counts.SAFE), note: "Nhãn theo luật backend; cần đối chiếu bằng chứng", tone: "safe" },
    { label: "Va chạm", value: count(data.counts.COLLISION), note: "Đối chiếu chi tiết và telemetry", tone: "danger" },
    { label: "Phanh oan", value: count(data.counts.FALSE_BRAKING), note: "Giữ ca an toàn khi chuẩn bị tập", tone: "warn" },
  ];

  return <section aria-label="Tổng quan baseline" className={styles.overview}>
    <p className={styles.scope}>Tổng hợp toàn bộ run baseline trong bộ lọc{scope.length ? ` · ${scope.join(" · ")}` : " · Tất cả họ kịch bản"}. Không phải kết quả của một run riêng lẻ.</p>
    <div className={styles.metrics}>
      {kpis.map((kpi, index) => <article key={kpi.label} aria-label={`KPI ${kpi.label}`} className={styles.kpi} data-tone={kpi.tone}>
        <span className={styles.kpiLabel}>{kpi.label}</span>
        <div className={styles.kpiValue}><strong>{displayCount(kpi.value)}</strong>{index > 0 && percentage(kpi.value) !== null && <span>{percentage(kpi.value)} tổng lượt</span>}</div>
        <p>{kpi.value === null ? "Chưa có số liệu từ API" : kpi.note}</p>
      </article>)}
    </div>

    {total === 0 ? <div className="analysis-panel analysis-state"><h2>Chưa có run baseline phù hợp.</h2><p>{scope.length ? "Không có run khớp bộ lọc hiện tại. Thử mở rộng bộ lọc." : "API chưa trả về run baseline trong phạm vi này."} <Link href="/scenarios" className="font-semibold text-vehicsim-decision underline">Mở màn kịch bản</Link>.</p></div> : <>
      <section className="analysis-panel" aria-labelledby="overview-runs-title">
        <div className="analysis-toolbar"><div><h2 id="overview-runs-title">Mở bằng chứng của từng run</h2><p className="analysis-caption">{Math.min(runs.length, 5)} / {data.items.length} run trong trang {data.page} · {total} run trong bộ lọc. Các trang khác nằm ở mục Lượt chạy.</p></div><button type="button" className="analysis-button" onClick={onOpenRuns}>Mở danh sách lượt chạy →</button></div>
        <p className={styles.qualityNote}>Va chạm là kết quả mô phỏng, chưa tự chứng minh AEB bị lỗi. Danh sách này chưa cung cấp lệnh phanh AEB hoặc khoảng cách nhỏ nhất; mở Chi tiết để kiểm tra. Lệnh phanh không đồng nghĩa xe đã giảm tốc.</p>
        {runs.length ? <AnalysisTableRegion label="Run trong trang hiện tại, cuộn ngang" className={styles.runRegion}>
          <table className={styles.runTable}><caption className="sr-only">Run và điều kiện đã lưu, trạng thái thực thi, phân loại backend, tốc độ va chạm và liên kết bằng chứng</caption>
            <thead><tr>{["Run và điều kiện", "Thực thi / phân loại", "Tốc độ va chạm", "Bằng chứng"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{runs.slice(0, 5).map(run => <OverviewRun key={run.run_id} run={run} returnTo={returnTo} />)}</tbody>
          </table>
        </AnalysisTableRegion> : <p className="analysis-state">Chưa có run hợp lệ để mở trong trang này. Thống kê toàn bộ bộ lọc không thay thế dữ liệu từng run.</p>}
        {runs.length > 0 && <p className={styles.qualityNote}>Trên màn hẹp, cuộn ngang vùng bảng để xem trạng thái, chỉ số và liên kết bằng chứng.</p>}
        {runs.length < data.items.length && <p role="status" className={styles.qualityNote}>Một số bản ghi thiếu định danh hoặc trạng thái hợp lệ nên chưa thể tạo liên kết.</p>}
      </section>
      <div className={styles.distributions}>
        <section className="analysis-panel" aria-labelledby="overview-results-title">
          <div className="analysis-toolbar"><div><h2 id="overview-results-title">Kết quả theo luật backend</h2><p className="analysis-caption">Nhãn và tỷ lệ theo kết quả đã lưu; chưa phải nguyên nhân lỗi đã xác nhận. Tỷ lệ tính trên tổng lượt trong bộ lọc.</p></div><button type="button" className="analysis-button" onClick={onOpenRuns}>Xem lượt chạy →</button></div>
          <div className={styles.bars}>
            {AEB_OUTCOMES.map(key => {
              const value = count(data.counts[key]), percent = percentage(value);
              return <div key={key} className={styles.barRow}>
                <span>{analysisLabel(key)}</span>
                {percent !== null ? <progress aria-label={analysisLabel(key)} max={total!} value={value!} style={{ "--bar-color": outcomeColor(key) } as CSSProperties} /> : <span className={styles.missingBar} aria-label={`Chưa có tỷ lệ ${analysisLabel(key)}`} />}
                <strong>{displayCount(value)} <small>{percent ?? "—"}</small></strong>
              </div>;
            })}
          </div>
        </section>

        <section className="analysis-panel" aria-labelledby="overview-quality-title">
          <h2 id="overview-quality-title">Trạng thái kỹ thuật và dữ liệu</h2>
          <p className="analysis-caption">Các lượt chưa có kết quả AEB hợp lệ được giữ riêng để theo dõi.</p>
          <dl className={styles.qualityList}>{DATA_OUTCOMES.map(key => <div key={key}><dt>{analysisLabel(key)}</dt><dd>{displayCount(count(data.counts[key]))}</dd></div>)}</dl>
          <p className={styles.qualityNote}>Không suy ra “an toàn” từ lượt lỗi, hết giờ hoặc thiếu dữ liệu.</p>
        </section>
      </div>

      <section className="analysis-panel" aria-labelledby="overview-objectives-title">
        <div className="analysis-toolbar"><div><h2 id="overview-objectives-title">Chỉ số theo nhóm cấu hình chạy</h2><p className="analysis-caption">Giữ riêng baseline, xe, simulator và bước thời gian; không gộp chỉ số giữa các nhóm.</p></div><span className={styles.groupCount}>{groups.length} nhóm · {carlaGroups} CARLA</span></div>
        <div className={styles.sourceNote}>Nguồn: kết quả mô phỏng đã lưu qua API. CARLA được hiển thị trước; dữ liệu các bộ mô phỏng khác vẫn được giữ để truy xuất.</div>
        {groups.length === 0 && <p className="analysis-caption py-4">Chưa có nhóm chỉ số phù hợp. Xem lượt chạy để kiểm tra nguồn dữ liệu.</p>}
        <div className={styles.groups}>{groups.map((group, index) => {
          const isCarla = group.simulator.startsWith("carla-");
          return <details key={group.identity} open={index === 0} className={styles.group} data-simulator={group.simulator}>
            <summary><span className={styles.sourceBadge}>{isCarla ? "CARLA" : group.simulator.includes("kinematic") ? "Động học" : "Nguồn khác"}</span><span className={styles.profile}>{group.simulator}</span><span className={styles.configuration}>Baseline #{group.baseline_id} · xe #{group.vehicle_id}</span></summary>
            <div className={styles.groupBody}>
              <OverviewObjectives value={group.objectives} index={index + 1} />
              {(isCarla || group.carla_observational_only) && <p className={styles.carlaNote}>CARLA chỉ phục vụ quan sát/đối chiếu. Mức hiệu chuẩn phụ thuộc xe và profile; dữ liệu tổng hợp chưa xác nhận cấu hình hiệu chuẩn từng run và không phải kiểm chứng thực địa.</p>}
              {group.objectives.invalid_runs > 0 && <p className="analysis-caption">{group.objectives.invalid_runs} lượt chưa hợp lệ trong nhóm; chỉ số có thể chưa đầy đủ.</p>}
              <div className={styles.groupFooter}><div><p className="analysis-caption">Phiên bản tổng hợp: {overviewVersion(group.objectives.version)}</p><p className={styles.identity}>Mã nhóm: {group.identity}</p></div><button type="button" className="analysis-button" onClick={() => onFilterSimulator(group.simulator)}>Lọc profile này</button></div>
            </div>
          </details>;
        })}</div>
        {groups.length < data.objective_groups.length && <p role="status" className={styles.qualityNote}>Một số nhóm thiếu định danh hoặc chỉ số hợp lệ nên chưa thể hiển thị.</p>}
        <p className={styles.metricNote}>“—” nghĩa là thiếu số đo hợp lệ hoặc không áp dụng; trạng thái từng chỉ số được ghi riêng. Impact là tốc độ ego, không phải tốc độ tương đối; khi tổng hợp, run hợp lệ không va chạm đóng góp 0. Quãng phanh có thể gồm phần ngoại suy, không luôn là quãng dừng đã đo. Phiên bản tổng hợp: {overviewVersion(data.evaluation_version)}; chưa xác định phiên bản luật chấm từng run từ trường này.</p>
      </section>
    </>}
  </section>;
}

function OverviewObjectives({ value, index }: { value: ObjectiveAggregate; index: number }) {
  return <section className={styles.objectives} aria-label={`Chỉ số tổng hợp của nhóm ${index}`}>
    {([["rms_jerk_mps3", "RMS jerk", "m/s³"], ["impact_speed_mps", "Tốc độ va chạm", "m/s"], ["stopping_distance_m", "Quãng phanh", "m"]] as const).map(([key, label, unit]) => {
      const objective = value[key], state = overviewObjective(objective, unit);
      return <div key={key}><span>{label}</span><strong>{state.valid ? `${overviewMetric(objective.value)} ${unit}` : "—"}</strong><span>{state.label}</span><small>{displayCount(state.samples)} mẫu · {displayCount(state.missing)} thiếu · {displayCount(state.notApplicable)} không áp dụng</small></div>;
    })}
  </section>;
}

function OverviewRun({ run, returnTo }: { run: AnalysisRun; returnTo: string }) {
  const href = (section: string, playback = false) => `/analysis/failures/${run.run_id}${playback ? "/playback" : ""}?${new URLSearchParams({ ...(playback ? {} : { section }), returnTo })}`;
  const trace = run.status === "COMPLETED" && run.trace_available === true;
  const impact = run.status === "COMPLETED" && run.outcome === "COLLISION" ? overviewMetric(run.metrics?.impact_speed_mps) : "—";
  return <tr data-overview-run-id={run.run_id}>
    <td><strong>#{run.run_id} · {run.variant}</strong><span>{run.family} · seed {run.seed ?? "—"}</span><span>{run.simulator} · dt {run.dt ?? "—"} s</span><span>Baseline #{run.baseline_id ?? "—"} · xe #{run.vehicle_id ?? "—"}</span><span>{analysisLabel(run.weather)} · {analysisLabel(run.time_of_day)}</span></td>
    <td><span>Chạy: {analysisLabel(run.status)}</span><span>Phân loại: {analysisLabel(run.outcome)}</span><small>{run.trace_available === true ? "Có telemetry đã lưu" : run.trace_available === false ? "Thiếu telemetry" : "Chưa xác định telemetry"}</small></td>
    <td data-impact>{impact === "—" ? impact : `${impact} m/s`}</td>
    <td><div className={styles.runActions}><Link aria-label={`Chi tiết run ${run.run_id}`} href={href("summary")}>Chi tiết →</Link>{trace && <><Link aria-label={`Telemetry run ${run.run_id}`} href={href("telemetry")}>Telemetry →</Link><Link aria-label={`Bằng chứng run ${run.run_id}`} href={href("evidence")}>Bằng chứng →</Link><Link aria-label={`Playback run ${run.run_id}`} href={href("", true)}>Playback ↗</Link></>}</div></td>
  </tr>;
}
