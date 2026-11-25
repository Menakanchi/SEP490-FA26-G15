"use client";

import type { CSSProperties } from "react";
import { AnalysisLoading, analysisLabel } from "@/components/analysisUi";
import type { AnalysisDashboardData, ObjectiveAggregate } from "@/types/vehicsim";
import { overviewCount, overviewGroup, overviewMetric, overviewObjective, overviewPercentage, overviewResponse, overviewVersion } from "./analysisOverviewData";
import styles from "./AnalysisOverview.module.css";

const AEB_OUTCOMES = ["SAFE", "COLLISION", "FALSE_BRAKING", "NEAR_MISS", "MISSED_BRAKING", "OTHER_FAILURE"];
const DATA_OUTCOMES = ["ERROR", "TIMEOUT", "CANCELLED", "INCOMPLETE", "NOT_FINISHED"];
const displayCount = (value: number | null) => value === null ? "—" : value.toLocaleString("vi-VN");
const outcomeColor = (key: string) => key === "SAFE" ? "var(--color-vehicsim-ok)" : key === "COLLISION" ? "var(--color-vehicsim-danger)" : "var(--color-vehicsim-warn)";

type Props = {
  data: AnalysisDashboardData | null; loading: boolean; hasError: boolean;
  onFilterSimulator: (simulator: string) => void; scope: string[];
};

export function AnalysisOverview({ data, loading, hasError, onFilterSimulator, scope }: Props) {
  if (loading) return <section aria-label="Tổng quan baseline" aria-busy="true" className={styles.overview}><AnalysisLoading /></section>;
  if (!data) return <section aria-label="Tổng quan baseline" className="analysis-panel analysis-state"><p>{hasError ? "Chưa tải được tổng quan. Vui lòng thử tải lại kết quả." : "Chưa có dữ liệu tổng quan từ API."}</p></section>;
  if (!overviewResponse(data)) return <section aria-label="Tổng quan baseline" className="analysis-panel analysis-state"><p role="alert">Dữ liệu tổng quan không hợp lệ.</p><p>Dùng “Tải lại kết quả” để yêu cầu dữ liệu mới; chưa thể hiển thị thống kê.</p></section>;
  const total = data.total;
  const count = (value: unknown) => overviewCount(value, total);
  const groups = data.objective_groups.filter(overviewGroup).sort((a, b) => Number(b.simulator.startsWith("carla-")) - Number(a.simulator.startsWith("carla-")));
  const kpis = [
    { label: "Tổng lượt chạy", value: total, note: "Trong phạm vi đang lọc", tone: "neutral" },
    { label: "Va chạm", value: count(data.counts.COLLISION), note: "Kết quả đã lưu, chưa xác nhận lỗi AEB", tone: "danger" },
    { label: "An toàn theo luật", value: count(data.counts.SAFE), note: "Nhãn backend, cần đối chiếu bằng chứng", tone: "safe" },
  ];
  return <section aria-label="Tổng quan baseline" className={styles.overview}>
    <div className={styles.metrics}>{kpis.map(kpi => <article key={kpi.label} aria-label={`KPI ${kpi.label}`} className={styles.kpi} data-tone={kpi.tone}>
      <span className={styles.kpiLabel}>{kpi.label}</span><strong className={styles.compactValue}>{displayCount(kpi.value)}</strong>
      <p>{kpi.value === null ? "Chưa có số liệu từ API" : kpi.note}</p>
    </article>)}</div>
    <details className="analysis-disclosure" data-analysis-overview-details>
      <summary>Thống kê và chỉ số theo nhóm cấu hình ({groups.length})</summary>
      <p className={styles.scope}>Toàn bộ run trong bộ lọc{scope.length ? ` · ${scope.join(" · ")}` : " · Tất cả họ kịch bản"}. Các nhóm baseline, xe, simulator và dt được giữ riêng.</p>
      <div className={styles.distributions}>
        <section aria-labelledby="overview-results-title"><h2 id="overview-results-title">Kết quả theo luật backend</h2><div className={styles.bars}>
          {AEB_OUTCOMES.map(key => { const value = count(data.counts[key]), percent = overviewPercentage(value, total);
            return <div key={key} className={styles.barRow}><span>{analysisLabel(key)}</span>
              {percent !== null ? <progress aria-label={analysisLabel(key)} max={total} value={value!} style={{ "--bar-color": outcomeColor(key) } as CSSProperties} /> : <span className={styles.missingBar} aria-label={`Chưa có tỷ lệ ${analysisLabel(key)}`} />}
              <strong>{displayCount(value)} <small>{percent ?? "—"}</small></strong></div>;
          })}
        </div></section>
        <section aria-labelledby="overview-quality-title"><h2 id="overview-quality-title">Trạng thái kỹ thuật và dữ liệu</h2>
          <dl className={styles.qualityList}>{DATA_OUTCOMES.map(key => <div key={key}><dt>{analysisLabel(key)}</dt><dd>{displayCount(count(data.counts[key]))}</dd></div>)}</dl>
          <p className={styles.qualityNote}>Lượt lỗi, hết giờ hoặc thiếu dữ liệu không được coi là an toàn.</p>
        </section>
      </div>
      <section aria-labelledby="overview-objectives-title"><h2 id="overview-objectives-title">Chỉ số theo nhóm cấu hình chạy</h2>
        <p className={styles.sourceNote}>Nguồn: kết quả mô phỏng đã lưu qua API. Không gộp chỉ số giữa các nhóm.</p>
        {!groups.length && <p className="analysis-caption">Chưa có nhóm chỉ số phù hợp.</p>}
        <div className={styles.groups}>{groups.map((group, index) => <details key={group.identity} className={styles.group} data-simulator={group.simulator}>
          <summary><span className={styles.sourceBadge}>{group.simulator.startsWith("carla-") ? "CARLA" : group.simulator.includes("kinematic") ? "Động học" : "Nguồn khác"}</span><span className={styles.profile}>{group.simulator}</span><span className={styles.configuration}>Baseline #{group.baseline_id} · xe #{group.vehicle_id}</span></summary>
          <div className={styles.groupBody}><OverviewObjectives value={group.objectives} index={index + 1} />
            {(group.simulator.startsWith("carla-") || group.carla_observational_only) && <p className={styles.carlaNote}>CARLA chỉ phục vụ quan sát/đối chiếu. Mức hiệu chuẩn phụ thuộc xe và profile; API chưa xác nhận hiệu chuẩn từng run.</p>}
            {group.objectives.invalid_runs > 0 && <p className="analysis-caption">{group.objectives.invalid_runs} lượt chưa hợp lệ trong nhóm; chỉ số có thể chưa đầy đủ.</p>}
            <div className={styles.groupFooter}><p className={styles.identity}>Nhóm: {group.identity} · tổng hợp: {overviewVersion(group.objectives.version)}</p><button type="button" className="analysis-button" onClick={() => onFilterSimulator(group.simulator)}>Lọc profile này</button></div>
          </div>
        </details>)}</div>
        {groups.length < data.objective_groups.length && <p role="status" className={styles.qualityNote}>Một số nhóm thiếu định danh hoặc chỉ số hợp lệ nên chưa thể hiển thị.</p>}
        <p className={styles.metricNote}>“—” là chưa có số đo hợp lệ hoặc không áp dụng; không thay bằng 0. Impact không va chạm đóng góp 0 chỉ khi tổng hợp run hợp lệ. Quãng phanh có thể gồm ngoại suy. Phiên bản tổng hợp: {overviewVersion(data.evaluation_version)}; không xác nhận phiên bản luật chấm từng run.</p>
      </section>
    </details>
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
