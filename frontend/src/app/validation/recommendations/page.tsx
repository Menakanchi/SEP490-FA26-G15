"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { EmptyState, ErrorNote, FilterSelect, Pagination, PillButton, RECOMMENDATION_STATUS, RecommendationBadge, StatCard, cx, fmt, TableScroll } from "@/components/VehicSimUi";
import { BaselineEntry } from "@/components/RegressionNotes";
import { vehicsimApi } from "@/services/vehicsim";
import type { DecisionHistory, RecommendationItem, RecommendationStatus } from "@/types/vehicsim";

const PAGE_SIZE = 8;

export default function RecommendationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<RecommendationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<RecommendationStatus | "">("");
  const [history, setHistory] = useState<DecisionHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    vehicsimApi.recommendations()
      .then((data) => { setItems(data); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách khuyến nghị"));
    vehicsimApi.decisionHistory().then((data) => { setHistory(data); setHistoryError(null); }).catch((err) => setHistoryError(err instanceof Error ? err.message : "Không tải được lịch sử quyết định"));
  }, []);
  useEffect(load, [load]);

  const visible = useMemo(() => (items ?? []).filter((i) => !status || i.status === status), [items, status]);
  const count = (s: RecommendationStatus) => (items ?? []).filter((i) => i.status === s).length;
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const offset = (current - 1) * PAGE_SIZE;
  const shown = visible.slice(offset, offset + PAGE_SIZE);

  return (
    <VehicSimPage
      step={6}
      crumbs={[{ label: "Kiểm chứng", href: "/validation/regression" }, { label: "Khuyến nghị" }]}
    >
      <ErrorNote message={error} />
      {error && <PillButton onClick={() => { setError(null); load(); }}>Thử tải lại</PillButton>}
      {!items && !error && <p role="status" className="text-sm text-vehicsim-muted">Đang tải danh sách khuyến nghị…</p>}
      <div className="grid w-full grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Chờ duyệt" value={items ? count("PENDING") : "…"} valueClass="text-vehicsim-warn" tone="warn" note="cần quyết định" />
        <StatCard label="Đã chấp nhận" value={items ? count("ACCEPT") : "…"} valueClass="text-vehicsim-ok" tone="ok" note="đã thành bản cơ sở" />
        <StatCard label="Từ chối / thêm kiểm thử" value={items ? count("REJECT") + count("REQUEST_MORE_TESTS") : "…"} note="đã trả lại" />
        <StatCard label="Bị chặn" value={items ? count("BLOCKED") : "…"} valueClass="text-vehicsim-danger" tone="danger" note="trượt kiểm thử hồi quy" />
      </div>

      <section className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface">
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <span className="mr-2 whitespace-nowrap text-[15px] font-bold text-vehicsim-ink">{items ? `${visible.length} khuyến nghị` : "…"}</span>
          <div className="w-full sm:w-[220px]"><FilterSelect<RecommendationStatus>
            label="Trạng thái"
            value={status}
            options={(Object.keys(RECOMMENDATION_STATUS) as RecommendationStatus[]).map((s) => ({ value: s, label: RECOMMENDATION_STATUS[s].label }))}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          /></div>
        </div>
        {items && visible.length === 0 && (
          <EmptyState title={items.length ? "Không có khuyến nghị nào khớp bộ lọc" : "Chưa có khuyến nghị"}>
            Khuyến nghị xuất hiện khi một{" "}
            <Link href="/validation/regression" className="font-semibold underline">
              kiểm thử hồi quy
            </Link>{" "}
            chạy xong.
          </EmptyState>
        )}
        {shown.length > 0 && (
          <TableScroll label="Bảng khuyến nghị" minWidth={960}>
            <div className="flex h-11 items-center border-y border-solid border-slate-700 bg-slate-800 px-5 text-[12.5px] font-black uppercase tracking-wider text-white">
              <span className="w-[45px] shrink-0 pr-2 text-center font-bold">STT</span>
              <span className="w-[200px] shrink-0 pr-3">Khuyến nghị</span>
              <span className="w-[135px] shrink-0">Phiên bản</span>
              <span className="w-[155px] shrink-0">Trạng thái</span>
              <span className="w-[155px] shrink-0">Tỉ lệ va chạm</span>
              <span className="w-[105px] shrink-0">Sửa / Xấu đi</span>
              <span className="w-[80px] shrink-0">Ngày</span>
              <span className="w-[95px] shrink-0 text-right pr-2">Thao tác</span>
            </div>
            {shown.map((i, idx) => {
              const rates = "collision_baseline_pct" in i.rates ? i.rates : null;
              const counts = "fixed" in i.counts ? i.counts : null;
              return (
                <div
                  key={i.id}
                  onClick={() => router.push(`/validation/recommendations/${i.id}`)}
                  className="flex h-[60px] cursor-pointer items-center border-b border-solid border-vehicsim-line px-5 hover:bg-vehicsim-row transition-colors"
                >
                  <span className="w-[45px] shrink-0 pr-2 text-center text-[12px] font-bold text-vehicsim-faint tabular-nums">
                    {offset + idx + 1}
                  </span>
                  <span className="flex w-[200px] shrink-0 flex-col gap-[2px] pr-3">
                    <span className="text-[13px] font-bold text-vehicsim-ink">{i.code}</span>
                    <span className="truncate text-[11.5px] text-vehicsim-faint">từ kiểm thử {i.regression_code}</span>
                  </span>
                  <span className="w-[140px] shrink-0 text-[12.5px] font-semibold text-vehicsim-ink">
                    {i.baseline} → {i.candidate}
                  </span>
                  <span className="w-[160px] shrink-0">
                    <RecommendationBadge status={i.status} />
                  </span>
                  <span
                    className={cx(
                      "w-[160px] shrink-0 text-[12.5px] font-semibold",
                      !rates ? "text-vehicsim-faint" : rates.collision_candidate_pct <= rates.collision_baseline_pct ? "text-vehicsim-ok" : "text-vehicsim-danger",
                    )}
                  >
                    {rates ? `${fmt.pct(rates.collision_baseline_pct)} → ${fmt.pct(rates.collision_candidate_pct)}` : "—"}
                  </span>
                  <span className="w-[110px] shrink-0 text-[12.5px] font-semibold">
                    {counts ? (
                      <>
                        <span className="text-vehicsim-ok">+{counts.fixed}</span>
                        <span className="text-vehicsim-faint"> / </span>
                        <span className={counts.regressed ? "text-vehicsim-danger" : "text-vehicsim-muted"}>{counts.regressed ? `−${counts.regressed}` : 0}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="w-[85px] shrink-0 text-[12px] text-vehicsim-faint">{fmt.date(i.created_at)}</span>
                  <span className="flex w-[100px] shrink-0 justify-end pr-2" onClick={(event) => event.stopPropagation()}>
                    <Link
                      href={`/validation/recommendations/${i.id}`}
                      className="inline-flex h-7 items-center justify-center rounded-md border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-2.5 text-[11.5px] font-bold text-vehicsim-decision hover:border-vehicsim-decision hover:bg-vehicsim-decision hover:text-white transition shadow-xs"
                    >
                      Chi tiết
                    </Link>
                  </span>
                </div>
              );
            })}
          </TableScroll>
        )}
        {visible.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <span className="text-[12px] text-vehicsim-muted">
              Hiển thị {offset + 1}–{offset + shown.length} trên {visible.length} khuyến nghị
            </span>
            {pages > 1 && <Pagination page={current} pages={pages} onPage={setPage} />}
          </div>
        )}
      </section>

      {historyError && <div className="flex flex-wrap items-center gap-3"><ErrorNote message={historyError} /><PillButton onClick={() => { setHistoryError(null); load(); }}>Thử tải lại lịch sử</PillButton></div>}
      {!history && !historyError && <p role="status" className="text-sm text-vehicsim-muted">Đang tải lịch sử quyết định…</p>}
      {history && (
        <div className="flex w-full flex-col gap-4 xl:flex-row xl:items-start">
          <section className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-5">
            <h2 className="text-[15px] font-bold text-vehicsim-ink">Lịch sử quyết định</h2>
            {history.decisions.length === 0 ? (
              <p className="text-[13px] text-vehicsim-muted">Chưa có quyết định nào của Người duyệt.</p>
            ) : (
              history.decisions.map((d) => (
                <Link
                  key={d.id}
                  href={`/validation/recommendations/${d.test_id}`}
                  className="flex flex-col gap-1 border-b border-solid border-vehicsim-line pb-3 last:border-b-0 last:pb-0"
                >
                  <span className="flex items-center gap-2 text-[13px] font-bold text-vehicsim-ink">
                    {d.recommendation_code}
                    <RecommendationBadge status={d.decision} />
                    <span className="font-normal text-vehicsim-faint">{d.baseline} → {d.candidate}</span>
                  </span>
                  <span className="text-[12px] text-vehicsim-muted">
                    {d.reviewed_by ?? "—"}
                    {d.reviewed_at ? ` · ${fmt.date(d.reviewed_at)}` : ""}
                    {d.reason ? ` · ${d.reason}` : ""}
                  </span>
                </Link>
              ))
            )}
          </section>
          <section className="flex w-full shrink-0 flex-col xl:w-[360px] gap-3 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-5">
            <h2 className="text-[15px] font-bold text-vehicsim-ink">Chuỗi bản cơ sở</h2>
            {history.baselines.length === 0 && <p className="text-[13px] text-vehicsim-muted">Chưa có bản cơ sở để hiển thị.</p>}
            {history.baselines.map((b) => (
              <div key={b.id} className="flex flex-col gap-1 border-b border-solid border-vehicsim-line pb-3 last:border-b-0 last:pb-0">
                <BaselineEntry baseline={b} />
              </div>
            ))}
          </section>
        </div>
      )}
    </VehicSimPage>
  );
}
