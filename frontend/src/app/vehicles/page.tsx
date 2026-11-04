"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { EmptyState, ErrorNote, Pagination, StatCard, Tag, cx } from "@/components/VehicSimUi";
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
      title="Phương tiện"
      subtitle="Danh mục mẫu xe CARLA dùng cho mô phỏng. Thông số vật lý cố định theo mẫu xe nên chỉ xem, không sửa."
    >
      <ErrorNote message={error} />

      <div className="flex w-full items-stretch gap-4">
        <StatCard label="Mẫu xe" value={items?.length ?? "…"} note="blueprint CARLA 0.9.16" />
        <StatCard label="Hỗ trợ mô phỏng" value={supported ?? "…"} tone="ok" valueClass="text-vehicsim-ok" note="còn lại chỉ để xem" />
        <StatCard
          label="Project đang dùng"
          value={<span className="text-[24px]">{inUse?.name ?? (items ? "—" : "…")}</span>}
          tone="info"
          note={inUse ? `${inUse.run_count} lượt chạy` : "chưa chọn xe"}
        />
      </div>

      <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-[15px] font-bold text-vehicsim-ink">{items ? `${items.length} mẫu xe` : "…"}</span>
        </div>

        <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[12px] font-bold uppercase tracking-[0.5px] text-vehicsim-ink">
          <span className="min-w-0 flex-1">Xe</span>
          <span className="w-[170px]">Dài × rộng × cao</span>
          <span className="w-[70px]">Số bánh</span>
          <span className="w-[100px]">Khối lượng</span>
          <span className="w-[120px]" title="Giới hạn phanh bộ động học dùng">Phanh động học</span>
          <span className="w-[120px]" title="Giảm tốc khi phanh 100% đo trên CARLA">Phanh đo CARLA</span>
          <span className="w-[80px]">Lượt chạy</span>
          <span className="w-[140px]">Trạng thái</span>
          <span className="w-[100px] text-right pr-2">Thao tác</span>
        </div>

        {items && items.length === 0 && <EmptyState title="Chưa có mẫu xe nào">Danh mục xe được thêm bằng migration của database.</EmptyState>}

        {shown.map((v) => (
          <div
            key={v.id}
            onClick={() => router.push(`/vehicles/${v.id}`)}
            className={cx("flex h-[58px] cursor-pointer items-center border-b border-solid border-vehicsim-line px-5 hover:bg-vehicsim-row", v.in_use && "bg-vehicsim-row")}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
              <Link href={`/vehicles/${v.id}`} className="text-[13px] font-bold text-vehicsim-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                {v.name}
              </Link>
              <span className="truncate font-mono text-[12px] text-vehicsim-faint">{v.carla_blueprint_id}</span>
            </span>
            <span className="w-[170px] text-[13px] text-vehicsim-ink">{dimensions(v)}</span>
            <span className="w-[70px] text-[13px] text-vehicsim-ink">{v.num_wheels}</span>
            <span className="w-[100px] text-[13px] text-vehicsim-ink">{withUnit(v.mass_kg, 0, "kg")}</span>
            <span className="w-[120px] text-[13px] text-vehicsim-ink">{decel(v.max_brake_decel_mps2)}</span>
            <span className="w-[120px] text-[13px] text-vehicsim-ink">{decel(v.carla_full_brake_decel_mps2)}</span>
            <span className="w-[80px] text-[13px] text-vehicsim-ink">{v.run_count}</span>
            <span className="flex w-[140px] flex-wrap gap-1">
              {v.in_use && <Tag tone="info">Project đang dùng</Tag>}
              {!v.is_supported && <Tag tone="neutral">Chỉ để xem</Tag>}
            </span>
            <span className="flex w-[100px] justify-end" onClick={(e) => e.stopPropagation()}>
              <Link
                href={`/vehicles/${v.id}`}
                className="inline-flex h-8 items-center justify-center rounded-full border border-solid border-vehicsim-line-strong bg-white px-3 text-[12px] font-bold text-vehicsim-decision hover:border-vehicsim-decision hover:bg-vehicsim-decision hover:text-white transition shadow-sm"
              >
                Chi tiết →
              </Link>
            </span>
          </div>
        ))}

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-solid border-vehicsim-line">
            <span className="text-[12px] text-vehicsim-muted">
              Hiển thị {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} trên {total} mẫu xe
            </span>
            {pages > 1 && <Pagination page={current} pages={pages} onPage={setPage} />}
          </div>
        )}

        <div className="m-5 rounded-2xl border border-solid border-vehicsim-line bg-vehicsim-soft/70 p-4 text-[12px] leading-[1.6] text-vehicsim-muted">
          <div className="mb-1 flex items-center gap-1.5 font-bold text-vehicsim-ink">
            <span>ℹ</span> Lưu ý về thông số phanh
          </div>
          Phanh đo trên CARLA thấp hơn xe thật vì CARLA chưa hiệu chuẩn phanh (TD-17): chỉ để quan sát và đối chiếu, không phải chứng nhận an toàn. Lượt chạy đếm trong project hiện tại. Chưa đổi được xe cho project ở màn này.
        </div>
      </section>
    </VehicSimPage>
  );
}
