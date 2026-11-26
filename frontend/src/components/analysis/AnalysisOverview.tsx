"use client";

import { AnalysisLoading } from "@/components/analysisUi";
import type { AnalysisDashboardData } from "@/types/vehicsim";
import { overviewCount, overviewResponse } from "./analysisOverviewData";
import styles from "./AnalysisOverview.module.css";

type Props = { data: AnalysisDashboardData | null; loading: boolean; hasError: boolean; onFilterSimulator: (simulator: string) => void; scope: string[] };
export function AnalysisOverview({ data, loading, hasError }: Props) {
  if (loading) return <section aria-label="Tổng quan baseline" aria-busy="true"><AnalysisLoading /></section>;
  if (!data || !overviewResponse(data)) return <section aria-label="Tổng quan baseline" className="analysis-panel analysis-state"><p>{hasError ? "Chưa tải được tổng quan. Hãy thử lại." : "Chưa có dữ liệu tổng quan."}</p></section>;
  const counts = [
    { label: "Tổng lượt chạy", value: data.total, note: "Trong phạm vi đang lọc" },
    { label: "Va chạm đã ghi nhận", value: overviewCount(data.counts.COLLISION, data.total), note: "Chưa tự xác nhận lỗi AEB" },
    { label: "An toàn theo đánh giá đã lưu", value: overviewCount(data.counts.SAFE, data.total), note: "Không thay cho xác minh an toàn" },
  ];
  return <section aria-label="Tổng quan baseline" className={styles.overview}><div className={styles.metrics}>{counts.map(item => <article key={item.label} className={styles.kpi}>
    <span className={styles.kpiLabel}>{item.label}</span><strong className={styles.compactValue}>{item.value === null ? "—" : item.value.toLocaleString("vi-VN")}</strong><p>{item.note}</p>
  </article>)}</div></section>;
}
