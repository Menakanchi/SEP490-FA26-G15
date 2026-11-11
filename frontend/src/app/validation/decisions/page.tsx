"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { VehicSimPage } from "@/components/VehicSimPage";
import { Card, CardTitle, EmptyState, ErrorNote, FilterSelect, Pagination, RecommendationBadge, StatCard, fmt } from "@/components/VehicSimUi";
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

  useEffect(() => {
    vehicsimApi.decisionHistory()
      .then(setHistory)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được lịch sử quyết định"));
  }, []);

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
      crumbs={[{ label: "Kiểm định" }, { label: "Lịch sử quyết định" }]}
      title="Lịch sử quyết định"
      subtitle="Từng lần quyết định kèm người duyệt và lý do được lưu riêng. Chấp nhận hoặc từ chối là quyết định cuối; yêu cầu thêm kiểm thử giữ khuyến nghị mở. Dữ liệu cũ chỉ giữ được quyết định gần nhất trước khi có lịch sử."
    >
      <ErrorNote message={error} />
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

      <Card className="overflow-x-auto">
        <div className="min-w-[1050px]">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="mr-2 text-[15px] font-bold text-vehicsim-ink">{history ? `${visible.length} quyết định` : "…"}</span>
          <FilterSelect<Decided> label="Quyết định" value={decision} options={DECISIONS} onChange={(value) => {
            setDecision(value);
            setPage(1);
          }} />
          <input
            aria-label="Tìm theo mã, phiên bản, người duyệt hoặc lý do"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm mã, phiên bản, người duyệt, lý do…"
            className="ml-auto w-[280px] rounded-full border border-solid border-vehicsim-line bg-vehicsim-surface px-4 py-[7px] text-[12px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
          />
        </div>
        <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[12px] font-bold uppercase tracking-[0.5px] text-vehicsim-ink">
          <span className="w-[110px]">Khuyến nghị</span>
          <span className="w-[170px]">Phiên bản</span>
          <span className="w-[190px]">Quyết định</span>
          <span className="min-w-0 flex-1">Lý do</span>
          <span className="w-[150px]">Người duyệt</span>
          <span className="w-[100px]">Ngày</span>
          <span className="w-[100px] text-right">Thao tác</span>
        </div>
        {history && visible.length === 0 && (
          <EmptyState title={all.length ? "Không có quyết định nào khớp bộ lọc" : "Chưa có quyết định nào"}>
            Quyết định được ghi khi Người duyệt chấp nhận hoặc từ chối một{" "}
            <Link href="/validation/recommendations" className="font-semibold underline">
              khuyến nghị
            </Link>
            .
          </EmptyState>
        )}
        {shown.map((d) => (
          <Link
            key={d.id}
            href={`/validation/recommendations/${d.test_id}`}
            className="flex min-h-[58px] items-center border-b border-solid border-vehicsim-line px-5 py-2 last:border-b-0 hover:bg-vehicsim-row"
          >
            <span className="flex w-[110px] flex-col gap-[2px]">
              <span className="text-[13px] font-bold text-vehicsim-ink">{d.recommendation_code}</span>
              <span className="text-[12px] text-vehicsim-faint">{d.regression_code}</span>
            </span>
            <span className="w-[170px] truncate pr-3 text-[13px] font-semibold text-vehicsim-ink">
              {d.baseline} → {d.candidate}
            </span>
            <span className="w-[190px]">
              <RecommendationBadge status={d.decision} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
              <span className="line-clamp-2 text-[13px] text-vehicsim-ink">{d.reason ?? "—"}</span>
              {d.source === "LEGACY_SNAPSHOT" && <span className="text-[11px] text-vehicsim-faint">Quyết định gần nhất từ dữ liệu cũ</span>}
              {d.conditions && <span className="truncate text-[12px] text-vehicsim-faint">Điều kiện: {d.conditions}</span>}
            </span>
            <span className="w-[150px] truncate text-[13px] text-vehicsim-muted">{d.reviewed_by ?? "—"}</span>
            <span className="w-[100px] text-[13px] text-vehicsim-faint">{fmt.date(d.reviewed_at)}</span>
            <span className="w-[100px] text-right text-[12px] font-semibold text-vehicsim-decision">Chi tiết</span>
          </Link>
        ))}
        </div>
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
        <div className="grid grid-cols-3 gap-3">
          {!history ? (
            <p className="text-[13px] text-vehicsim-muted">…</p>
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
