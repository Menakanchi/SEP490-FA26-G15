"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { EmptyState, ErrorNote, StatCard, Tag, cx } from "@/components/VehicSimUi";
import { decel, dimensions, withUnit } from "@/components/vehicleFormat";
import { vehicsimApi } from "@/services/vehicsim";
import type { VehicleSummary } from "@/types/vehicsim";

export default function VehiclesPage() {
  const router = useRouter();
  const [items, setItems] = useState<VehicleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vehicsimApi
      .vehicles()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách phương tiện"));
  }, []);

  const inUse = items?.find((v) => v.in_use);
  const supported = items?.filter((v) => v.is_supported).length;

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
        <div className="flex items-center px-5 py-4">
          <span className="text-[15px] font-bold text-vehicsim-ink">{items ? `${items.length} mẫu xe` : "…"}</span>
        </div>

        <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
          <span className="min-w-0 flex-1">Xe</span>
          <span className="w-[190px]">Dài × rộng × cao</span>
          <span className="w-[70px]">Số bánh</span>
          <span className="w-[110px]">Khối lượng</span>
          <span className="w-[130px]" title="Giới hạn phanh bộ động học dùng">Phanh động học</span>
          <span className="w-[130px]" title="Giảm tốc khi phanh 100% đo trên CARLA">Phanh đo CARLA</span>
          <span className="w-[80px]">Lượt chạy</span>
          <span className="w-[150px]">Trạng thái</span>
        </div>

        {items && items.length === 0 && <EmptyState title="Chưa có mẫu xe nào">Danh mục xe được thêm bằng migration của database.</EmptyState>}

        {items?.map((v) => (
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
            <span className="w-[190px] text-[13px] text-vehicsim-ink">{dimensions(v)}</span>
            <span className="w-[70px] text-[13px] text-vehicsim-ink">{v.num_wheels}</span>
            <span className="w-[110px] text-[13px] text-vehicsim-ink">{withUnit(v.mass_kg, 0, "kg")}</span>
            <span className="w-[130px] text-[13px] text-vehicsim-ink">{decel(v.max_brake_decel_mps2)}</span>
            <span className="w-[130px] text-[13px] text-vehicsim-ink">{decel(v.carla_full_brake_decel_mps2)}</span>
            <span className="w-[80px] text-[13px] text-vehicsim-ink">{v.run_count}</span>
            <span className="flex w-[150px] flex-wrap gap-1">
              {v.in_use && <Tag tone="info">Project đang dùng</Tag>}
              {!v.is_supported && <Tag tone="neutral">Chỉ để xem</Tag>}
            </span>
          </div>
        ))}

        <p className="px-5 py-4 text-[12px] leading-[1.6] text-vehicsim-faint">
          Phanh đo trên CARLA thấp hơn xe thật vì CARLA chưa hiệu chuẩn phanh (TD-17): chỉ để quan sát và đối chiếu, không phải chứng
          nhận an toàn. Lượt chạy đếm trong project hiện tại. Chưa đổi được xe cho project ở màn này.
        </p>
      </section>
    </VehicSimPage>
  );
}
