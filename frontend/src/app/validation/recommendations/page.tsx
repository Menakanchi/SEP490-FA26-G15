"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { EmptyState, ErrorNote, FilterSelect, RECOMMENDATION_STATUS, RecommendationBadge, StatCard, cx, fmt } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { RecommendationItem, RecommendationStatus } from "@/types/vehicsim";

export default function RecommendationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<RecommendationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<RecommendationStatus | "">("");

  useEffect(() => {
    vehicsimApi.recommendations()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách khuyến nghị"));
  }, []);

  const visible = useMemo(() => (items ?? []).filter((i) => !status || i.status === status), [items, status]);
  const count = (s: RecommendationStatus) => (items ?? []).filter((i) => i.status === s).length;

  return (
    <VehicSimPage
      step={6}
      crumbs={[{ label: "Kiểm định" }, { label: "Khuyến nghị" }]}
      title="Khuyến nghị"
      subtitle="Mỗi kiểm thử hồi quy chạy xong trở thành một khuyến nghị kỹ thuật. Chỉ kỹ sư mới được chấp nhận — không gì được áp dụng tự động."
    >
      <ErrorNote message={error} />
      <div className="flex w-full items-stretch gap-4">
        <StatCard label="Chờ duyệt" value={items ? count("PENDING") : "…"} valueClass="text-vehicsim-warn" tone="warn" note="cần quyết định" />
        <StatCard label="Đã chấp nhận" value={items ? count("ACCEPT") : "…"} valueClass="text-vehicsim-ok" tone="ok" note="đã thành bản cơ sở" />
        <StatCard label="Từ chối / thêm kiểm thử" value={items ? count("REJECT") + count("REQUEST_MORE_TESTS") : "…"} note="đã trả lại" />
        <StatCard label="Bị chặn" value={items ? count("BLOCKED") : "…"} valueClass="text-vehicsim-danger" tone="danger" note="trượt kiểm thử hồi quy" />
      </div>

      <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="mr-2 text-[15px] font-bold text-vehicsim-ink">{items ? `${visible.length} khuyến nghị` : "…"}</span>
          <FilterSelect<RecommendationStatus>
            label="Trạng thái"
            value={status}
            options={(Object.keys(RECOMMENDATION_STATUS) as RecommendationStatus[]).map((s) => ({ value: s, label: RECOMMENDATION_STATUS[s].label }))}
            onChange={setStatus}
          />
        </div>
        <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
          <span className="min-w-0 flex-1">Khuyến nghị</span>
          <span className="w-[150px]">Phiên bản</span>
          <span className="w-[180px]">Trạng thái</span>
          <span className="w-[170px]">Tỉ lệ va chạm</span>
          <span className="w-[120px]">Sửa / Xấu đi</span>
          <span className="w-[100px]">Ngày</span>
          <span className="w-[70px]" />
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
        {visible.map((i) => {
          const rates = "collision_baseline_pct" in i.rates ? i.rates : null;
          const counts = "fixed" in i.counts ? i.counts : null;
          return (
            <div
              key={i.id}
              onClick={() => router.push(`/validation/recommendations/${i.id}`)}
              className="flex h-[58px] cursor-pointer items-center border-b border-solid border-vehicsim-line px-5 hover:bg-vehicsim-row"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
                <span className="text-[13px] font-bold text-vehicsim-ink">{i.code}</span>
                <span className="truncate text-[12px] text-vehicsim-faint">từ kiểm thử hồi quy {i.regression_code}</span>
              </span>
              <span className="w-[150px] text-[13px] font-semibold text-vehicsim-ink">
                {i.baseline} → {i.candidate}
              </span>
              <span className="w-[180px]">
                <RecommendationBadge status={i.status} />
              </span>
              <span
                className={cx(
                  "w-[170px] text-[13px] font-semibold",
                  !rates ? "text-vehicsim-faint" : rates.collision_candidate_pct <= rates.collision_baseline_pct ? "text-vehicsim-ok" : "text-vehicsim-danger",
                )}
              >
                {rates ? `${fmt.pct(rates.collision_baseline_pct)} → ${fmt.pct(rates.collision_candidate_pct)}` : "—"}
              </span>
              <span className="w-[120px] text-[13px] font-semibold">
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
              <span className="w-[100px] text-[13px] text-vehicsim-faint">{fmt.date(i.created_at)}</span>
              <span className="flex w-[70px] justify-end text-[12px] font-semibold text-vehicsim-decision">Xem</span>
            </div>
          );
        })}
      </section>
    </VehicSimPage>
  );
}
