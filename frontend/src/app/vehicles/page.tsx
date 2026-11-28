"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { EmptyState, ErrorNote, Pagination, StatCard, Tag, cx, TableScroll } from "@/components/VehicSimUi";
import { decel, dimensions, withUnit } from "@/components/vehicleFormat";
import { vehicsimApi } from "@/services/vehicsim";
import type { VehicleSummary } from "@/types/vehicsim";

const PAGE_SIZE = 8;

/**
 * Lưới cột dùng chung cho dòng tiêu đề và dòng dữ liệu nên hai bên luôn thẳng hàng. Mỗi cột có độ rộng tối thiểu và
 * phần giãn theo tỉ lệ: màn rộng thì mọi cột cùng giãn, màn hẹp thì co về tối thiểu.
 * Dưới xl (1280 px) ẩn "Số bánh", "Lượt chạy" và cột "Trạng thái" (nhãn chuyển xuống dưới tên xe) để bảng vừa màn 1024 px.
 */
const GRID =
  "grid gap-x-2 px-5 grid-cols-[32px_minmax(120px,2.2fr)_minmax(116px,1.5fr)_minmax(76px,1fr)_minmax(76px,1fr)_minmax(88px,1fr)_72px] " +
  "xl:grid-cols-[32px_minmax(140px,2.2fr)_minmax(116px,1.5fr)_minmax(52px,0.6fr)_minmax(76px,1fr)_minmax(76px,1fr)_minmax(88px,1fr)_minmax(60px,0.7fr)_minmax(92px,1.1fr)_72px]";
/** Chỉ hiện từ xl. */
const WIDE = "hidden xl:block";
/** Tối thiểu của lưới hẹp: 580 px cột + 6 khoảng 8 px + lề 2 × 20 px. Hẹp hơn mới cuộn ngang trong bảng. */
const TABLE_MIN_WIDTH = 580 + 6 * 8 + 2 * 20;

function VehicleTags({ v, className }: { v: VehicleSummary; className?: string }) {
  if (!v.in_use && v.is_supported) return null;
  return (
    <span className={cx("flex flex-wrap gap-1", className)}>
      {v.in_use && <Tag tone="info">Project dùng</Tag>}
      {!v.is_supported && <Tag tone="neutral">Chỉ xem</Tag>}
    </span>
  );
}

export default function VehiclesPage() {
  const router = useRouter();
  const [items, setItems] = useState<VehicleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    vehicsimApi
      .vehicles()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách phương tiện"));
  }, []);

  const inUse = items?.find((v) => v.in_use);
  const supported = items?.filter((v) => v.is_supported).length;

  const total = items?.length ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);
  const offset = (current - 1) * PAGE_SIZE;
  const shown = items?.slice(offset, offset + PAGE_SIZE) ?? [];

  return (
    <VehicSimPage
      crumbs={[{ label: "Phương tiện" }]}
    >
      <ErrorNote message={error} />

      <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label="Mẫu xe" value={items?.length ?? "…"} note="blueprint CARLA 0.9.16" />
        <StatCard label="Hỗ trợ mô phỏng" value={supported ?? "…"} tone="ok" valueClass="text-vehicsim-ok" note="còn lại chỉ để xem" />
        <StatCard
          label="Project đang dùng"
          value={<span className="text-[24px]">{inUse?.name ?? (items ? "—" : "…")}</span>}
          tone="info"
          note={inUse ? `${inUse.run_count} lượt chạy` : "chưa chọn xe"}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-[15px] font-bold text-vehicsim-ink">{items ? `${items.length} mẫu xe` : "…"}</span>
        </div>


        {items && items.length === 0 && <EmptyState title="Chưa có mẫu xe nào">Danh mục xe được thêm bằng migration của database.</EmptyState>}

        {shown.length > 0 && (
          <TableScroll label="Bảng phương tiện" minWidth={TABLE_MIN_WIDTH}>
            <div className={cx(GRID, "min-h-11 items-center border-y border-solid border-slate-700 bg-slate-800 py-2 text-[12.5px] font-black uppercase leading-tight tracking-wider text-white")}>
              <span className="text-center font-bold">STT</span>
              <span>Mẫu xe & Blueprint</span>
              <span>Dài × rộng × cao</span>
              <span className={WIDE}>Số bánh</span>
              <span>Khối lượng</span>
              <span title="Giới hạn phanh bộ động học dùng">Phanh ĐH</span>
              <span title="Giảm tốc khi phanh 100% đo trên CARLA">Phanh CARLA</span>
              <span className={WIDE}>Lượt chạy</span>
              <span className={WIDE}>Trạng thái</span>
              <span className="text-right">Thao tác</span>
            </div>
            {shown.map((v, idx) => (
              <div
                key={v.id}
                onClick={() => router.push(`/vehicles/${v.id}`)}
                className={cx(GRID, "min-h-[60px] cursor-pointer items-center border-b border-solid border-vehicsim-line py-2 hover:bg-vehicsim-row transition-colors", v.in_use && "bg-vehicsim-row")}
              >
                <span className="text-center text-[12px] font-bold text-vehicsim-faint tabular-nums">
                  {offset + idx + 1}
                </span>
                <span className="flex min-w-0 flex-col gap-[2px]">
                  <Link href={`/vehicles/${v.id}`} className="truncate text-[13.5px] font-bold text-vehicsim-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                    {v.name}
                  </Link>
                  <span className="truncate font-mono text-[11.5px] text-vehicsim-faint" title={v.carla_blueprint_id}>{v.carla_blueprint_id}</span>
                  <VehicleTags v={v} className="mt-1 xl:hidden" />
                </span>
                <span className="text-[12.5px] text-vehicsim-ink">{dimensions(v)}</span>
                <span className={cx(WIDE, "text-[12.5px] text-vehicsim-ink")}>{v.num_wheels}</span>
                <span className="text-[12.5px] text-vehicsim-ink">{withUnit(v.mass_kg, 0, "kg")}</span>
                <span className="text-[12.5px] text-vehicsim-ink">{decel(v.max_brake_decel_mps2)}</span>
                <span className="text-[12.5px] text-vehicsim-ink">{decel(v.carla_full_brake_decel_mps2)}</span>
                <span className={cx(WIDE, "text-[12.5px] text-vehicsim-ink")}>{v.run_count}</span>
                <span className={WIDE}>
                  <VehicleTags v={v} />
                </span>
                <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <Link
                    href={`/vehicles/${v.id}`}
                    className="inline-flex h-7 items-center justify-center rounded-md border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-2.5 text-[11.5px] font-bold text-vehicsim-decision hover:border-vehicsim-decision hover:bg-vehicsim-decision hover:text-white transition shadow-xs"
                  >
                    Chi tiết
                  </Link>
                </span>
              </div>
            ))}

          </TableScroll>
        )}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <span className="text-[12px] text-vehicsim-muted">
              Hiển thị {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} trên {total} mẫu xe
            </span>
            {pages > 1 && <Pagination page={current} pages={pages} onPage={setPage} />}
          </div>
        )}
      </section>
    </VehicSimPage>
  );
}
