"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@/services/api";
import { vi } from "@/components/vehicsimI18n";
import type { AnalysisRun } from "@/types/vehicsim";

export const ANALYSIS_LABELS: Record<string, string> = {
  CLEAR: "Trời quang", CLOUDY: "Nhiều mây", RAIN: "Mưa", HEAVY_RAIN: "Mưa lớn", FOG: "Sương mù",
  DAY: "Ban ngày", DUSK: "Chạng vạng", NIGHT: "Ban đêm", PERCEPTION: "Nhận thức", DECISION: "Quyết định",
  CONTROL: "Điều khiển", VEHICLE_DYNAMICS: "Động lực học", SAFE: "An toàn", COLLISION: "Va chạm",
  FALSE_BRAKING: "Phanh oan", NEAR_MISS: "Suýt va chạm", MISSED_BRAKING: "Bỏ sót phanh", OTHER_FAILURE: "Lỗi AEB khác",
  ERROR: "Lỗi kỹ thuật", CANCELLED: "Đã hủy", TIMEOUT: "Hết giờ", INCOMPLETE: "Thiếu dữ liệu", NOT_FINISHED: "Chưa hoàn tất",
  PENDING: "Đang chờ", RUNNING: "Đang chạy", PAUSED: "Tạm dừng", COMPLETED: "Hoàn tất", FAILED: "Lỗi kỹ thuật", STOPPED: "Đã hủy",
};
export const analysisLabel = (value: string | null) => value ? ANALYSIS_LABELS[value] ?? vi(value) : "—";
export const metric = (value: number | null | undefined, digits = 2) => value != null && Number.isFinite(value) ? value.toFixed(digits) : "—";
export const eligible = (run: AnalysisRun) => run.status === "COMPLETED" && run.trace_available && !["TIMEOUT", "ERROR", "INCOMPLETE"].includes(run.outcome);
export function analysisError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return "Bạn không có quyền thực hiện thao tác này. Liên hệ người quản lý để kiểm tra quyền truy cập.";
  if (error instanceof ApiError && error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  return vi(error instanceof Error ? error.message : "Không tải được dữ liệu. Kiểm tra kết nối và thử lại.");
}
export function AnalysisBadge({ value }: { value: string }) {
  const tone = value === "SAFE" || value === "COMPLETED" ? "bg-vehicsim-ok-bg text-vehicsim-ok"
    : ["COLLISION", "ERROR", "FAILED"].includes(value) ? "bg-vehicsim-danger-bg text-vehicsim-danger"
    : ["FALSE_BRAKING", "NEAR_MISS", "MISSED_BRAKING", "TIMEOUT", "INCOMPLETE"].includes(value) ? "bg-vehicsim-warn-bg text-vehicsim-warn"
    : "bg-vehicsim-soft text-vehicsim-muted";
  return <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ${tone}`}>{analysisLabel(value)}</span>;
}
export const ANALYSIS_VIEWS = [["overview", "Tổng quan"], ["runs", "Lượt chạy"], ["failures", "Tra cứu ca lỗi"], ["dataset", "Tập bàn giao"]] as const;
export function AnalysisNav({ view, count = 0 }: { view: string; count?: number }) {
  const params = useSearchParams();
  return <nav aria-label="Chế độ phân tích" className="analysis-nav">{ANALYSIS_VIEWS.map(([key, label]) => {
    const next = new URLSearchParams(params.toString()); next.set("view", key);
    return <Link key={key} href={`/analysis/failures?${next}`} scroll={false} aria-current={view === key ? "page" : undefined}>{label}{key === "dataset" && count > 0 && <span>{count}</span>}</Link>;
  })}</nav>;
}
export function AnalysisLoading() {
  return <div role="status" className="analysis-state"><span className="inline-block size-5 animate-spin rounded-full border-2 border-vehicsim-line-strong border-t-vehicsim-decision" /><p>Đang tải dữ liệu phân tích…</p></div>;
}
export function AnalysisPager({ page, size, total, loading, onPage, onSize }: { page: number; size: number; total: number; loading?: boolean; onPage: (page: number) => void; onSize: (size: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <div className="analysis-toolbar border-t border-vehicsim-line pt-4">
    <span className="text-[12px] text-vehicsim-muted" aria-live="polite">{total ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} / ${total} bản ghi` : "0 bản ghi"}</span>
    <div className="flex flex-wrap items-center gap-3 text-[12px]">
      <label>Số dòng <select aria-label="Số dòng mỗi trang" value={size} onChange={e => onSize(Number(e.target.value))}>{[10, 20, 30, 50].map(n => <option key={n}>{n}</option>)}</select></label>
      <button type="button" className="analysis-button" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Trang trước</button>
      <span>Trang {page} / {pages}</span>
      <button type="button" className="analysis-button" disabled={loading || page >= pages} onClick={() => onPage(page + 1)}>Trang sau</button>
    </div>
  </div>;
}
export function analysisReturn(value: string | null) {
  return value?.startsWith("/analysis/failures?") ? value : "/analysis/failures?view=runs";
}
