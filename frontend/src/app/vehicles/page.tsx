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
      title="Danh mục phương tiện & Cấu hình phanh"
      subtitle="Thông số hình học, khối lượng và đường cong giảm tốc hiệu chuẩn cho mô phỏng CARLA và bộ động học."
    >
      <ErrorNote message={error} />

      <div className="grid w-full grid-cols-2 gap-3 xl:grid-cols-3">
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
          <TableScroll label="Bảng phương tiện" minWidth={1000}>
            <div className="flex h-11 items-center border-y border-solid border-slate-700 bg-slate-800 px-5 text-[12.5px] font-black uppercase tracking-wider text-white">
              <span className="w-[45px] shrink-0 pr-2 text-center font-bold">STT</span>
              <span className="w-[195px] shrink-0 pr-3">Mẫu xe & Blueprint</span>
              <span className="w-[140px] shrink-0">Dài × rộng × cao</span>
              <span className="w-[70px] shrink-0">Số bánh</span>
              <span className="w-[90px] shrink-0">Khối lượng</span>
              <span className="w-[110px] shrink-0" title="Giới hạn phanh bộ động học dùng">Phanh ĐH</span>
              <span className="w-[110px] shrink-0" title="Giảm tốc khi phanh 100% đo trên CARLA">Phanh CARLA</span>
              <span className="w-[80px] shrink-0">Lượt chạy</span>
              <span className="w-[130px] shrink-0">Trạng thái</span>
              <span className="w-[90px] shrink-0 text-right pr-2">Thao tác</span>
            </div>
            {shown.map((v, idx) => (
              <div
                key={v.id}
                onClick={() => router.push(`/vehicles/${v.id}`)}
                className={cx("flex h-[60px] cursor-pointer items-center border-b border-solid border-vehicsim-line px-5 hover:bg-vehicsim-row transition-colors", v.in_use && "bg-vehicsim-row")}
              >
                <span className="w-[45px] shrink-0 pr-2 text-center text-[12px] font-bold text-vehicsim-faint tabular-nums">
                  {offset + idx + 1}
                </span>
                <span className="flex w-[195px] shrink-0 flex-col gap-[2px] pr-3">
                  <Link href={`/vehicles/${v.id}`} className="text-[13.5px] font-bold text-vehicsim-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                    {v.name}
                  </Link>
                  <span className="truncate font-mono text-[11.5px] text-vehicsim-faint">{v.carla_blueprint_id}</span>
                </span>
                <span className="w-[150px] shrink-0 text-[12.5px] text-vehicsim-ink">{dimensions(v)}</span>
                <span className="w-[70px] shrink-0 text-[12.5px] text-vehicsim-ink">{v.num_wheels}</span>
                <span className="w-[95px] shrink-0 text-[12.5px] text-vehicsim-ink">{withUnit(v.mass_kg, 0, "kg")}</span>
                <span className="w-[110px] shrink-0 text-[12.5px] text-vehicsim-ink">{decel(v.max_brake_decel_mps2)}</span>
                <span className="w-[110px] shrink-0 text-[12.5px] text-vehicsim-ink">{decel(v.carla_full_brake_decel_mps2)}</span>
                <span className="w-[85px] shrink-0 text-[12.5px] text-vehicsim-ink">{v.run_count}</span>
                <span className="flex w-[130px] shrink-0 flex-wrap gap-1">
                  {v.in_use && <Tag tone="info">Project dùng</Tag>}
                  {!v.is_supported && <Tag tone="neutral">Chỉ xem</Tag>}
                </span>
                <span className="flex w-[90px] shrink-0 justify-end pr-2" onClick={(e) => e.stopPropagation()}>
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
