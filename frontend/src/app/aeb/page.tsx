"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { AebVersion } from "@/types/vehicsim";
import { KEY_PARAMS } from "@/components/aeb/aebTypes";

export default function AebHubPage() {
  const { ctx } = useVehicSimContext();
  const [versions, setVersions] = useState<AebVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vehicsimApi
      .aebVersions()
      .then(setVersions)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách phiên bản AEB"));
  }, []);

  const baseline = versions?.find((v) => v.status === "BASELINE") ?? null;
  const candidates = versions?.filter((v) => v.status === "CANDIDATE") ?? [];
  const catalog = new Map((ctx?.parameters ?? []).map((p) => [p.code, p]));

  return (
    <VehicSimPage
      step={4}
      crumbs={[{ label: "Cải tiến AEB", href: "/aeb" }, { label: "Tổng quan" }]}
    >
      <ErrorNote message={error} />

      {/* THÔNG TIN BẢN CƠ SỞ HIỆN HÀNH (BASELINE) */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-emerald-600" />
          <h2 className="text-[15px] font-bold text-vehicsim-ink">
            Bản cơ sở hiện hành (Baseline)
          </h2>
        </div>

        {baseline && (
          <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-4 shadow-xs">
            <div className="grid grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-solid divide-vehicsim-line sm:grid-cols-4">
              {KEY_PARAMS.map((code) => {
                const def = catalog.get(code);
                const val = baseline.parameters[code];
                const unit = def?.unit === "ratio" ? "" : def?.unit === "m/s2" ? "m/s²" : def?.unit === "m/s3" ? "m/s³" : def?.unit;
                return (
                  <div key={code} className="flex flex-col gap-1 px-4 py-2 first:pl-2 last:pr-2">
                    <span className="text-[12.5px] font-semibold text-vehicsim-muted">{def?.name ?? code}</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[20px] font-black text-vehicsim-ink">
                        {val !== undefined ? val : "—"}
                      </span>
                      {unit && <span className="text-[13px] font-bold text-vehicsim-ink">{unit}</span>}
                    </div>
                    <span className="text-[11.5px] text-vehicsim-faint">
                      Phạm vi: {def?.min_value} – {def?.max_value} {unit}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* PHƯƠNG PHÁP CẢI TIẾN THAM SỐ */}
      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-bold text-vehicsim-ink">
          Phương pháp cải tiến tham số
        </h2>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Card 1: MOBO */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-4 hover:border-vehicsim-primary/50 transition">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-bold text-vehicsim-ink">
                  Tối ưu tự động (MOBO)
                </h3>
                <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                  Khuyên dùng
                </span>
              </div>
              <p className="text-[12.5px] text-vehicsim-muted leading-relaxed">
                Tự động tìm kiếm các bộ tham số tối ưu cân bằng rung giật, va chạm và quãng phanh bằng Bayesian GP.
              </p>
            </div>
            <Link
              href="/aeb/mobo"
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-vehicsim-primary px-3.5 text-[12.5px] font-bold text-white hover:bg-vehicsim-primary-hover transition"
            >
              <span>Bắt đầu</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>

          {/* Card 2: Chỉnh tay */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-4 hover:border-slate-300 transition">
            <div className="flex flex-col gap-1">
              <h3 className="text-[14px] font-bold text-vehicsim-ink">
                Hiệu chỉnh tham số thủ công
              </h3>
              <p className="text-[12.5px] text-vehicsim-muted leading-relaxed">
                Tự điều chỉnh từng tham số phanh theo kinh nghiệm hoặc kết quả phân tích lỗi.
              </p>
            </div>
            <Link
              href="/aeb/manual"
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-solid border-vehicsim-line bg-vehicsim-surface px-3.5 text-[12.5px] font-bold text-vehicsim-ink hover:bg-vehicsim-soft transition"
            >
              <span>Chỉnh tay</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* QUẢN LÝ PHIÊN BẢN & SO SÁNH */}
      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-bold text-vehicsim-ink">
          Quản lý phiên bản & So sánh
        </h2>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface px-5 py-4 shadow-xs">
          <p className="text-[13.5px] text-vehicsim-ink font-medium">
            Hiện có <strong className="font-bold text-vehicsim-decision">{candidates.length} ứng viên</strong> đang chờ kiểm định hồi quy (trên tổng số {versions?.length ?? 0} phiên bản đã lưu).
          </p>
          <div className="flex items-center gap-2.5">
            <Link
              href="/aeb/compare"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-solid border-vehicsim-line bg-vehicsim-surface px-3.5 text-[12.5px] font-bold text-vehicsim-ink hover:bg-vehicsim-soft transition shadow-xs whitespace-nowrap"
            >
              So sánh 2 phiên bản
            </Link>
            <Link
              href="/aeb/versions"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-vehicsim-primary px-3.5 text-[12.5px] font-bold text-white hover:bg-vehicsim-primary-hover transition shadow-xs whitespace-nowrap"
            >
              <span>Xem danh sách phiên bản ({versions?.length ?? 0})</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </VehicSimPage>
  );
}
