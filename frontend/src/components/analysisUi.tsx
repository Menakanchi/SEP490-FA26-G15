"use client";

import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { VehicSimPage } from "@/components/VehicSimPage";
import { ApiError } from "@/services/api";
import { vi } from "@/components/vehicsimI18n";
import type { AnalysisRun } from "@/types/vehicsim";

export { analysisRunId } from "./analysis/analysisRouteTitles";

export const ANALYSIS_LABELS: Record<string, string> = {
  CLEAR: "Trời quang", CLOUDY: "Nhiều mây", RAIN: "Mưa", HEAVY_RAIN: "Mưa lớn", FOG: "Sương mù",
  DAY: "Ban ngày", DUSK: "Chạng vạng", NIGHT: "Ban đêm", PERCEPTION: "Nhận thức", DECISION: "Quyết định",
  CONTROL: "Điều khiển", VEHICLE_DYNAMICS: "Động lực học", SAFE: "An toàn", COLLISION: "Va chạm", REFERENCE: "Đối chứng AEB tắt",
  FALSE_BRAKING: "Phanh oan", NEAR_MISS: "Suýt va chạm", MISSED_BRAKING: "Bỏ sót phanh", OTHER_FAILURE: "Lỗi AEB khác",
  ERROR: "Lỗi kỹ thuật", CANCELLED: "Đã hủy", TIMEOUT: "Hết giờ", INCOMPLETE: "Thiếu dữ liệu", NOT_FINISHED: "Chưa hoàn tất",
  PENDING: "Đang chờ", RUNNING: "Đang chạy", PAUSED: "Tạm dừng", COMPLETED: "Hoàn tất", FAILED: "Lỗi kỹ thuật", STOPPED: "Đã hủy",
};
export const analysisLabel = (value: string | null) => value ? ANALYSIS_LABELS[value] ?? vi(value) : "—";
export { formatMetric as metric } from "./analysis/analysisMetricFormat";
export const eligible = (run: AnalysisRun) => run.aeb_mode !== "OFF" && run.status === "COMPLETED" && run.trace_available && !["TIMEOUT", "ERROR", "INCOMPLETE", "REFERENCE"].includes(run.outcome);
/** Remount only local analysis state when ownership changes; providers/transport stay unchanged. */
export function AnalysisScope({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const { ctx, choosing, error, refresh } = useVehicSimContext();
  if (user && ctx && !choosing && !error) return <Fragment key={`${user.id}:${ctx.project.id}`}>{children}</Fragment>;
  return <VehicSimPage title="Dữ liệu & kết quả" crumbs={[{ label: "Phân tích" }, { label: "Dữ liệu & kết quả" }]}>
    {isLoading ? <AnalysisLoading /> : <section className="analysis-panel analysis-state" role="status">
      <h2>{!user ? "Cần đăng nhập" : choosing ? "Chưa chọn dự án" : error ? "Chưa tải được ngữ cảnh dự án" : "Đang tải ngữ cảnh dự án"}</h2>
      <p>{!user ? "Đăng nhập lại để xem dữ liệu của bạn." : choosing ? "Chọn dự án ở khu vực dự án để xem các lượt chạy." : "Chờ ngữ cảnh dự án sẵn sàng; dữ liệu của dự án trước không được hiển thị tại đây."}</p>
      {user && error && <button className="analysis-button" onClick={() => void refresh()}>Thử tải lại ngữ cảnh</button>}
    </section>}
  </VehicSimPage>;
}
/** Action errors keep keyboard focus near the affected operation, not at the page header. */
export function AnalysisActionError({ message, nextAction }: { message: string | null; nextAction: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (message) ref.current?.focus(); }, [message]);
  return message ? <div ref={ref} tabIndex={-1} role="alert" className="analysis-action-error"><p>{message}</p><p>{nextAction}</p></div> : null;
}
export function analysisError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return "Bạn không có quyền thực hiện thao tác này. Liên hệ người quản lý để kiểm tra quyền truy cập.";
  if (error instanceof ApiError && error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error instanceof ApiError && error.status === 429) return "Đã đạt giới hạn yêu cầu. Chờ rồi chủ động thử lại; thao tác chưa được tự gửi lại.";
  return vi(error instanceof Error ? error.message : "Không tải được dữ liệu. Kiểm tra kết nối và thử lại.");
}
export function AnalysisBadge({ value }: { value: string }) {
  const tone = value === "SAFE" || value === "COMPLETED" ? "bg-vehicsim-ok-bg text-vehicsim-ok"
    : ["COLLISION", "ERROR", "FAILED"].includes(value) ? "bg-vehicsim-danger-bg text-vehicsim-danger"
    : ["FALSE_BRAKING", "NEAR_MISS", "MISSED_BRAKING", "TIMEOUT", "INCOMPLETE"].includes(value) ? "bg-vehicsim-warn-bg text-vehicsim-warn"
    : "bg-vehicsim-soft text-vehicsim-muted";
  return <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ${tone}`}>{analysisLabel(value)}</span>;
}
export function AnalysisLoading() {
  return <div role="status" className="analysis-state"><span aria-hidden="true" className="analysis-loading-spinner inline-block size-5 animate-spin rounded-full border-2 border-vehicsim-line-strong border-t-vehicsim-decision" /><p>Đang tải dữ liệu phân tích…</p></div>;
}
/** Scroll and focus behavior shared by run, failure, draft and snapshot tables. */
export function AnalysisTableRegion({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return <div className={`analysis-table-wrap min-w-0 max-w-full overflow-x-auto ${className}`} role="region" aria-label={label} tabIndex={0}>{children}</div>;
}
export function AnalysisPager({ page, size, total, loading, label = "Phân trang kết quả", onPage, onSize }: { page: number; size: number; total: number; loading?: boolean; label?: string; onPage: (page: number) => void; onSize: (size: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <nav aria-label={label} className="analysis-toolbar border-t border-vehicsim-line pt-4">
    <span className="text-[12px] text-vehicsim-muted" aria-live="polite">{total ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} / ${total} bản ghi` : "0 bản ghi"}</span>
    <div className="flex flex-wrap items-center gap-3 text-[12px]">
      <label>Số dòng <select aria-label="Số dòng mỗi trang" disabled={loading} value={size} onChange={e => onSize(Number(e.target.value))}>{[10, 20, 30, 50].map(n => <option key={n}>{n}</option>)}</select></label>
      <button type="button" className="analysis-button" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Trang trước</button>
      <span>Trang {page} / {pages}</span>
      <button type="button" className="analysis-button" disabled={loading || page >= pages} onClick={() => onPage(page + 1)}>Trang sau</button>
    </div>
  </nav>;
}
/** Trang kết quả kiểm chứng (bước ⑤) được phép làm nơi quay về; chỉ đúng mẫu nội bộ, không nhận link ra ngoài. */
const VERIFY_RETURN = /^\/validation\/regression\/(\d{1,12})$/;

export function analysisReturn(value: string | null) {
  if (value && VERIFY_RETURN.test(value)) return value;
  return value?.startsWith("/analysis/failures?") ? value : "/analysis/failures?view=runs";
}

/** Nơi quay về của trang chi tiết run / phát lại: màn Phân tích (mặc định) hoặc trang kiểm chứng đã mở link. */
export function analysisOrigin(returnTo: string): { back: string; crumbs: { label: string; href?: string }[]; testId: number | null } {
  const match = VERIFY_RETURN.exec(returnTo);
  if (!match) return { back: "← Về danh sách đang xem", crumbs: [{ label: "Phân tích" }, { label: "Danh sách phân tích", href: returnTo }], testId: null };
  const code = `RT-${match[1].padStart(3, "0")}`;
  return {
    back: `← Về kiểm chứng ${code}`,
    crumbs: [{ label: "Kiểm chứng", href: "/validation/regression" }, { label: code, href: returnTo }],
    testId: Number(match[1]),
  };
}
