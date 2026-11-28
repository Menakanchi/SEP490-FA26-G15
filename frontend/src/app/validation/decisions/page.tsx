"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { VehicSimPage } from "@/components/VehicSimPage";
import { Card, CardTitle, EmptyState, ErrorNote, FilterSelect, Pagination, PillButton, RecommendationBadge, StatCard, TableScroll, fmt } from "@/components/VehicSimUi";
import { BaselineEntry } from "@/components/RegressionNotes";
import { vehicsimApi } from "@/services/vehicsim";
import type { DecisionHistory, ReviewDecision } from "@/types/vehicsim";

type Decided = Exclude<ReviewDecision, "PENDING">;
const PAGE_SIZE = 8;
const DECISIONS: { value: Decided; label: string }[] = [
  { value: "ACCEPT", label: "Chấp nhận" },
  { value: "REJECT", label: "Từ chối" },
  { value: "REQUEST_MORE_TESTS", label: "Yêu cầu thêm kiểm thử" },
];

export default function DecisionHistoryPage() {
  const [history, setHistory] = useState<DecisionHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decided | "">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    vehicsimApi.decisionHistory()
      .then((data) => { setHistory(data); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được lịch sử quyết định"));
  }, []);
  useEffect(load, [load]);

  const all = useMemo(() => history?.decisions ?? [], [history]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (d) =>
        (!decision || d.decision === decision) &&
        (!needle ||
          [d.recommendation_code, d.regression_code, d.baseline, d.candidate, d.reviewed_by, d.reason, d.conditions]
            .some((v) => v && v.toLowerCase().includes(needle))),
    );
  }, [all, decision, q]);
  const count = (s: Decided) => all.filter((d) => d.decision === s).length;
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const offset = (current - 1) * PAGE_SIZE;
  const shown = visible.slice(offset, offset + PAGE_SIZE);

  return (
    <VehicSimPage
      crumbs={[{ label: "Kiểm chứng", href: "/validation/regression" }, { label: "Lịch sử quyết định" }]}
    >
      <ErrorNote message={error} />
      {error && <PillButton onClick={() => { setError(null); load(); }}>Thử tải lại</PillButton>}
      {!history && !error && <p role="status" className="text-sm text-vehicsim-muted">Đang tải lịch sử quyết định…</p>}
      <div className="grid w-full grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Tổng quyết định" value={history ? all.length : "…"} note="đã ghi" />
        <StatCard
          label="Chấp nhận"
          value={history ? count("ACCEPT") : "…"}
          valueClass={count("ACCEPT") ? "text-vehicsim-ok" : undefined}
          tone="ok"
          note="thành bản cơ sở"
        />
        <StatCard label="Từ chối" value={history ? count("REJECT") : "…"} note="không áp dụng" />
        <StatCard label="Yêu cầu thêm kiểm thử" value={history ? count("REQUEST_MORE_TESTS") : "…"} tone="info" note="trả lại kỹ sư" />
      </div>

      <Card className="min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <span className="mr-2 whitespace-nowrap text-[15px] font-bold text-vehicsim-ink">{history ? `${visible.length} quyết định` : "…"}</span>
          <div className="w-full sm:w-[220px]"><FilterSelect<Decided> label="Quyết định" value={decision} options={DECISIONS} onChange={(value) => {
            setDecision(value);
            setPage(1);
          }} /></div>
          <input
            aria-label="Tìm theo mã, phiên bản, người duyệt hoặc lý do"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm mã, phiên bản, người duyệt, lý do…"
            className="min-h-10 w-full rounded-full border border-solid border-vehicsim-line bg-vehicsim-surface px-4 py-[7px] text-[12px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong sm:ml-auto sm:w-[280px]"
          />
        </div>
        {history && visible.length === 0 && (
          <EmptyState title={all.length ? "Không có quyết định nào khớp bộ lọc" : "Chưa có quyết định nào"}>
            Quyết định được ghi khi Người duyệt chấp nhận, từ chối hoặc yêu cầu kiểm thử thêm một{" "}
            <Link href="/validation/recommendations" className="font-semibold underline">khuyến nghị</Link>.
          </EmptyState>
        )}
        {shown.length > 0 && (
        <TableScroll label="Bảng lịch sử quyết định" minWidth={960}>
          <div className="flex h-11 items-center border-y border-solid border-slate-700 bg-slate-800 px-5 text-[12.5px] font-black uppercase tracking-wider text-white">
            <span className="w-[45px] shrink-0 pr-2 text-center font-bold">STT</span>
            <span className="w-[115px] shrink-0 pr-3">Khuyến nghị</span>
            <span className="w-[145px] shrink-0 pr-3">Phiên bản</span>
            <span className="w-[155px] shrink-0 pr-3">Quyết định</span>
            <span className="min-w-[190px] flex-1 pr-4">Lý do</span>
            <span className="w-[135px] shrink-0 pr-3">Người duyệt</span>
            <span className="w-[80px] shrink-0">Ngày</span>
            <span className="w-[85px] shrink-0 text-right">Thao tác</span>
          </div>
          {shown.map((d, idx) => (
            <Link
              key={d.id}
              href={`/validation/recommendations/${d.test_id}`}
              className="flex min-h-[58px] items-center border-b border-solid border-vehicsim-line px-5 py-2.5 last:border-b-0 hover:bg-vehicsim-row"
            >
              <span className="w-[45px] shrink-0 pr-2 text-center text-[12px] font-bold text-vehicsim-faint tabular-nums">
                {offset + idx + 1}
              </span>
              <span className="flex w-[115px] shrink-0 flex-col gap-[2px] pr-3">
                <span className="text-[13px] font-bold text-vehicsim-ink">{d.recommendation_code}</span>
                <span className="text-[11.5px] text-vehicsim-faint">{d.regression_code}</span>
              </span>
              <span className="w-[150px] shrink-0 truncate pr-3 text-[12.5px] font-semibold text-vehicsim-ink">
                {d.baseline} → {d.candidate}
              </span>
              <span className="w-[160px] shrink-0 pr-3">
                <RecommendationBadge status={d.decision} />
              </span>
              <span className="flex min-w-[200px] flex-1 flex-col gap-[2px] pr-4">
                <span className="line-clamp-2 text-[12.5px] text-vehicsim-ink">{d.reason ?? "—"}</span>
                {d.source === "LEGACY_SNAPSHOT" && <span className="text-[11px] text-vehicsim-faint">Quyết định gần nhất từ dữ liệu cũ</span>}
                {d.conditions && <span className="truncate text-[11.5px] text-vehicsim-faint">Điều kiện: {d.conditions}</span>}
              </span>
              <span className="w-[140px] shrink-0 truncate pr-3 text-[12.5px] text-vehicsim-muted">{d.reviewed_by ?? "—"}</span>
              <span className="w-[85px] shrink-0 text-[12px] text-vehicsim-faint">{fmt.date(d.reviewed_at)}</span>
              <span className="w-[90px] shrink-0 text-right text-[12px] font-bold text-vehicsim-decision">Chi tiết</span>
            </Link>
          ))}
        </TableScroll>
        )}
        {visible.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <span className="text-[12px] text-vehicsim-muted">
              Hiển thị {offset + 1}–{offset + shown.length} trên {visible.length} quyết định
            </span>
            {pages > 1 && <Pagination page={current} pages={pages} onPage={setPage} />}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <CardTitle>Chuỗi bản cơ sở</CardTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {!history ? (
            <p className="text-[13px] text-vehicsim-muted">{error ? "Không tải được chuỗi bản cơ sở." : "Đang tải…"}</p>
          ) : history.baselines.length === 0 ? (
            <p className="text-[13px] text-vehicsim-muted">Chưa có bản cơ sở để hiển thị.</p>
          ) : (
            history.baselines.map((b) => (
              <div key={b.id} className="flex flex-col gap-1 rounded-[14px] bg-vehicsim-soft px-4 py-3">
                <BaselineEntry baseline={b} />
              </div>
            ))
          )}
        </div>
      </Card>
    </VehicSimPage>
  );
}
