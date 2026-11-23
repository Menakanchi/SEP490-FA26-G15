"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import {
  Card,
  ErrorNote,
  PillButton,
  paramValue,
} from "@/components/VehicSimUi";
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

      {/* BƯỚC 4.1: BẢN CƠ SỞ HIỆN HÀNH (BASELINE) */}
      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-vehicsim-primary text-[11px] font-bold text-white">
              1
            </span>
            <h2 className="text-[15px] font-bold text-vehicsim-ink">
              Bước 4.1 · Bản cơ sở hiện hành (Baseline)
            </h2>
            <span className="hidden text-[12.5px] text-vehicsim-muted sm:inline">
              — Mốc tham chiếu chuẩn dùng để đối chiếu khi đánh giá ứng viên
            </span>
          </div>
          {baseline && (
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                AEB {baseline.label}
              </span>
              <span className="text-xs text-vehicsim-muted font-mono">ID: #{baseline.id}</span>
            </div>
          )}
        </div>

        {baseline && (
          <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {KEY_PARAMS.map((code) => {
                const def = catalog.get(code);
                return (
                  <div
                    key={code}
                    className="flex flex-col gap-1 rounded-[12px] border border-solid border-vehicsim-line bg-vehicsim-soft p-3.5"
                  >
                    <span className="text-[12px] font-semibold text-vehicsim-muted">{def?.name ?? code}</span>
                    <span className="text-[18px] font-black text-vehicsim-ink">
                      {paramValue(baseline.parameters[code], def?.unit ?? "")}
                    </span>
                    <span className="text-[11px] text-vehicsim-faint">
                      Phạm vi: {def?.min_value} – {def?.max_value} {def?.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* BƯỚC 4.2: PHƯƠNG PHÁP CẢI TIẾN THAM SỐ */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-vehicsim-primary text-[11px] font-bold text-white">
            2
          </span>
          <h2 className="text-[15px] font-bold text-vehicsim-ink">
            Bước 4.2 · Phương pháp cải tiến tham số
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Card 1: MOBO */}
          <Card className="flex flex-col justify-between gap-3 p-4 border border-solid border-vehicsim-line hover:border-vehicsim-primary/50 transition">
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[14.5px] font-bold text-vehicsim-ink">
                    Tối ưu tự động bằng AI (MOBO)
                  </h3>
                  <span className="rounded-full bg-vehicsim-decision-bg px-2 py-0.5 text-[10.5px] font-bold text-vehicsim-decision">
                    Khuyên dùng
                  </span>
                </div>
                <PillButton href="/aeb/mobo" variant="dark" className="shrink-0 py-1.5 px-3.5 text-[12px] font-bold">
                  Studio MOBO <ArrowRight className="size-3.5" />
                </PillButton>
              </div>
              <p className="text-[12.5px] text-vehicsim-muted">
                Thuật toán Bayesian qEHVI tìm biên Pareto cân bằng đồng thời 3 mục tiêu:
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                  ① Giảm rung giật (RMS Jerk)
                </span>
                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                  ② Giảm tốc độ va chạm
                </span>
                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                  ③ Giảm quãng phanh dừng
                </span>
              </div>
            </div>
          </Card>

          {/* Card 2: Chỉnh tay */}
          <Card className="flex flex-col justify-between gap-3 p-4 border border-solid border-vehicsim-line hover:border-vehicsim-primary/50 transition">
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[14.5px] font-bold text-vehicsim-ink">
                  Hiệu chỉnh tham số thủ công
                </h3>
                <PillButton href="/aeb/manual" variant="light" className="shrink-0 py-1.5 px-3.5 text-[12px] font-bold">
                  Chỉnh tay <ArrowRight className="size-3.5" />
                </PillButton>
              </div>
              <p className="text-[12.5px] text-vehicsim-muted leading-relaxed">
                Chỉnh 4 tham số AEB dựa trên tri thức chuyên gia hoặc phân tích nguyên nhân lỗi.
              </p>
            </div>
          </Card>
        </div>
      </section>

      {/* BƯỚC 4.3: QUẢN LÝ ỨNG VIÊN & KIỂM THỬ HỒI QUY */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-vehicsim-primary text-[11px] font-bold text-white">
            3
          </span>
          <h2 className="text-[15px] font-bold text-vehicsim-ink">
            Bước 4.3 · Quản lý ứng viên & Kiểm định hồi quy
          </h2>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-5 shadow-sm">
          <div>
            <p className="text-[13.5px] text-vehicsim-ink font-medium">
              Hiện có <strong className="font-bold text-vehicsim-decision">{candidates.length} ứng viên</strong> đang chờ kiểm định hồi quy (trên tổng số {versions?.length ?? 0} phiên bản đã lưu).
            </p>
            <p className="text-[12px] text-vehicsim-muted mt-0.5">
              Đưa các ứng viên tiềm năng sang Bước 5 để kiểm chứng hồi quy độc lập trước khi Reviewer phê duyệt.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/aeb/compare"
              className="rounded-lg border border-solid border-vehicsim-line bg-vehicsim-surface px-4 py-2 text-[12.5px] font-bold text-vehicsim-ink hover:bg-vehicsim-soft transition shadow-sm"
            >
              So sánh 2 phiên bản
            </Link>
            <PillButton
              href="/aeb/versions"
              variant="dark"
              className="py-2 px-4 text-[12.5px] font-bold"
            >
              <span>Vào Thư viện phiên bản ({versions?.length ?? 0})</span>
              <ArrowRight className="size-4" />
            </PillButton>
          </div>
        </div>
      </section>
    </VehicSimPage>
  );
}
