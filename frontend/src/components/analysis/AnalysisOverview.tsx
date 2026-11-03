"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { ObjectiveSummary } from "@/components/AnalysisSelectionSummary";
import { AnalysisLoading, analysisLabel } from "@/components/analysisUi";
import type { AnalysisDashboardData } from "@/types/vehicsim";
import styles from "./AnalysisOverview.module.css";

const AEB_OUTCOMES = ["SAFE", "COLLISION", "FALSE_BRAKING", "NEAR_MISS", "MISSED_BRAKING", "OTHER_FAILURE"];
const DATA_OUTCOMES = ["ERROR", "TIMEOUT", "CANCELLED", "INCOMPLETE", "NOT_FINISHED"];
const count = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const displayCount = (value: number | null) => value === null ? "—" : value.toLocaleString("vi-VN");
const outcomeColor = (key: string) => key === "SAFE" ? "var(--color-vehicsim-ok)" : key === "COLLISION" ? "var(--color-vehicsim-danger)" : "var(--color-vehicsim-warn)";

type Props = {
  data: AnalysisDashboardData | null;
  loading: boolean;
  hasError: boolean;
  onOpenRuns: () => void;
  onFilterSimulator: (simulator: string) => void;
};

export function AnalysisOverview({ data, loading, hasError, onOpenRuns, onFilterSimulator }: Props) {
  if (loading) return <section aria-label="Tổng quan baseline" aria-busy="true" className={styles.overview}><AnalysisLoading /></section>;
  if (!data) return <section aria-label="Tổng quan baseline" className="analysis-panel analysis-state"><p>{hasError ? "Chưa tải được tổng quan. Vui lòng thử tải lại kết quả." : "Chưa có dữ liệu tổng quan từ API."}</p></section>;

  const total = count(data.total);
  const groups = [...data.objective_groups].sort((a, b) => Number(b.simulator.startsWith("carla-")) - Number(a.simulator.startsWith("carla-")));
  const carlaGroups = groups.filter(group => group.simulator.startsWith("carla-")).length;
  const percentage = (value: number | null) => value !== null && total !== null && total > 0 && value <= total ? Math.round(100 * value / total) : null;
  const kpis = [
    { label: "Tổng lượt chạy", value: total, note: "Toàn bộ phạm vi đang lọc", tone: "neutral" },
    { label: "An toàn", value: count(data.counts.SAFE), note: "Kết quả AEB đã phân loại", tone: "safe" },
    { label: "Va chạm", value: count(data.counts.COLLISION), note: "Đối chiếu chi tiết và telemetry", tone: "danger" },
    { label: "Phanh oan", value: count(data.counts.FALSE_BRAKING), note: "Giữ ca an toàn khi chuẩn bị tập", tone: "warn" },
  ];

  return <section aria-label="Tổng quan baseline" className={styles.overview}>
    <div className={styles.metrics}>
      {kpis.map((kpi, index) => <article key={kpi.label} aria-label={`KPI ${kpi.label}`} className={styles.kpi} data-tone={kpi.tone}>
        <span className={styles.kpiLabel}>{kpi.label}</span>
        <div className={styles.kpiValue}><strong>{displayCount(kpi.value)}</strong>{index > 0 && percentage(kpi.value) !== null && <span>{percentage(kpi.value)}% tổng lượt</span>}</div>
        <p>{kpi.value === null ? "Chưa có số liệu từ API" : kpi.note}</p>
      </article>)}
    </div>

    {total === 0 ? <div className="analysis-panel analysis-state"><h2>Chưa có run baseline phù hợp.</h2><p>Thử mở rộng bộ lọc hoặc <Link href="/scenarios" className="font-semibold text-vehicsim-decision underline">chạy baseline ở màn kịch bản</Link>.</p></div> : <>
      <div className={styles.distributions}>
        <section className="analysis-panel" aria-labelledby="overview-results-title">
          <div className="analysis-toolbar"><div><h2 id="overview-results-title">Kết quả đánh giá AEB</h2><p className="analysis-caption">Số lượt theo phân loại backend. Tỷ lệ tính trên tổng lượt trong bộ lọc.</p></div><button type="button" className="analysis-button" onClick={onOpenRuns}>Xem lượt chạy →</button></div>
          <div className={styles.bars}>
            {AEB_OUTCOMES.map(key => {
              const value = count(data.counts[key]), percent = percentage(value);
              return <div key={key} className={styles.barRow}>
                <span>{analysisLabel(key)}</span>
                {percent !== null ? <progress aria-label={analysisLabel(key)} max={total!} value={value!} style={{ "--bar-color": outcomeColor(key) } as CSSProperties} /> : <span className={styles.missingBar} aria-label={`Chưa có tỷ lệ ${analysisLabel(key)}`} />}
                <strong>{displayCount(value)} <small>{percent !== null ? `${percent}%` : "—"}</small></strong>
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
              <ObjectiveSummary value={group.objectives} />
              {(isCarla || group.carla_observational_only) && <p className={styles.carlaNote}>CARLA chỉ phục vụ quan sát/đối chiếu; vật lý phanh chưa hiệu chuẩn.</p>}
              {group.objectives.invalid_runs > 0 && <p className="analysis-caption">{group.objectives.invalid_runs} lượt chưa hợp lệ trong nhóm; chỉ số có thể chưa đầy đủ.</p>}
              <div className={styles.groupFooter}><div><p className="analysis-caption">Hợp đồng: {group.objectives.version}</p><p className={styles.identity}>Mã nhóm: {group.identity}</p></div><button type="button" className="analysis-button" onClick={() => onFilterSimulator(group.simulator)}>Lọc profile này</button></div>
            </div>
          </details>;
        })}</div>
        <p className={styles.metricNote}>“—” nghĩa là chưa có số đo hoặc không áp dụng; giữ riêng số mẫu, thiếu và không áp dụng do API trả về. Quãng phanh có thể gồm phần ngoại suy. Hợp đồng đánh giá: {data.evaluation_version}.</p>
      </section>
    </>}
  </section>;
}
