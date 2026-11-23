"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  ShieldCheck,
  Sliders,
  Sparkles,
} from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import {
  Card,
  EmptyState,
  ErrorNote,
  Pagination,
  PillButton,
  Tag,
  fmt,
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

  const [candidatePage, setCandidatePage] = useState(1);
  const CANDIDATE_PAGE_SIZE = 8;
  const candidatePages = Math.max(1, Math.ceil(candidates.length / CANDIDATE_PAGE_SIZE));
  const pagedCandidates = candidates.slice((candidatePage - 1) * CANDIDATE_PAGE_SIZE, candidatePage * CANDIDATE_PAGE_SIZE);

  return (
    <VehicSimPage
      step={4}
      crumbs={[{ label: "Cải tiến AEB", href: "/aeb" }, { label: "Tổng quan" }]}
      actions={
        <div className="flex items-center gap-2">
          <PillButton href="/aeb/mobo" variant="dark">
            <Sparkles className="size-4 shrink-0" />
            Vào Studio MOBO
          </PillButton>
        </div>
      }
    >
      <ErrorNote message={error} />

      {/* BƯỚC 4.1: BẢN CƠ SỞ HIỆN HÀNH (BASELINE) */}
      <section className="flex flex-col gap-4 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-bold text-vehicsim-ink">
                  Bản cơ sở hiện hành: AEB {baseline?.label ?? "..."}
                </h2>
                <Tag tone="ok">Mốc chuẩn (Baseline)</Tag>
              </div>
            </div>
          </div>
          <PillButton href="/aeb/manual" variant="light" className="text-[12.5px]">
            Chỉnh sửa bộ này
          </PillButton>
        </div>

        {baseline && (
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
        )}
      </section>

      {/* BƯỚC 4.2: CHỌN PHƯƠNG THỨC TẠO ỨNG VIÊN */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-vehicsim-primary text-xs font-bold text-white">
            2
          </span>
          <h2 className="text-[16px] font-bold text-vehicsim-ink">
            Bước 4.2 · Chọn phương pháp cải tiến tham số
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Card 1: MOBO */}
          <Card className="flex flex-col justify-between gap-5 p-6 border-2 border-vehicsim-primary/30 hover:border-vehicsim-primary hover:shadow-md transition">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex size-11 items-center justify-center rounded-xl bg-vehicsim-decision-bg text-vehicsim-decision">
                  <BarChart3 className="size-6" />
                </div>
                <span className="rounded-full bg-vehicsim-decision-bg px-2.5 py-1 text-[11px] font-extrabold text-vehicsim-decision">
                  Khuyên dùng cho Kỹ sư
                </span>
              </div>
              <div>
                <h3 className="text-[17px] font-extrabold text-vehicsim-ink">
                  Tối ưu tự động bằng AI (MOBO / qEHVI)
                </h3>
              </div>
            </div>
            <PillButton href="/aeb/mobo" variant="dark" className="w-fit py-2 px-4 text-[13px]">
              Vào Studio Tối ưu MOBO <ArrowRight className="size-4" />
            </PillButton>
          </Card>

          {/* Card 2: Manual Tuning */}
          <Card className="flex flex-col justify-between gap-5 p-6 hover:shadow-md transition">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex size-11 items-center justify-center rounded-xl bg-vehicsim-soft text-vehicsim-ink">
                  <Sliders className="size-6" />
                </div>
                <span className="rounded-full bg-vehicsim-soft px-2.5 py-1 text-[11px] font-semibold text-vehicsim-muted">
                  Can thiệp thủ công
                </span>
              </div>
              <div>
                <h3 className="text-[17px] font-extrabold text-vehicsim-ink">
                  Hiệu chỉnh tham số thủ công
                </h3>
              </div>
            </div>
            <PillButton href="/aeb/manual" variant="light" className="w-fit py-2 px-4 text-[13px]">
              Vào màn hình chỉnh tay <ArrowRight className="size-4" />
            </PillButton>
          </Card>
        </div>
      </section>

      {/* BƯỚC 4.3: DANH SÁCH ỨNG VIÊN ĐANG CHỜ KIỂM CHỨNG */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-vehicsim-primary text-xs font-bold text-white">
              3
            </span>
            <h2 className="text-[16px] font-bold text-vehicsim-ink">
              Bước 4.3 · Ứng viên AEB đang chờ kiểm định hồi quy ({candidates.length})
            </h2>
          </div>
          <Link
            href="/aeb/versions"
            className="text-[12.5px] font-bold text-vehicsim-primary hover:underline"
          >
            Tra cứu tất cả các phiên bản & lịch sử →
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
          {candidates.length === 0 ? (
            <div className="p-8">
              <EmptyState title="Chưa có ứng viên nào đang chờ kiểm định">
                Hãy sử dụng <strong>Tối ưu tự động MOBO</strong> hoặc <strong>Chỉnh tay tham số</strong> ở Bước 4.2 để tạo ứng viên đầu tiên.
              </EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-[13px]">
                <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12.5px] font-black uppercase tracking-wider text-white">
                  <tr className="h-12">
                    <th className="w-12 px-3 py-3.5 text-center">STT</th>
                    <th className="px-5 py-3.5">Ứng viên</th>
                    <th className="px-4 py-3.5">TTC (s)</th>
                    <th className="px-4 py-3.5">Trễ phanh (s)</th>
                    <th className="px-4 py-3.5">Tăng áp (m/s³)</th>
                    <th className="px-4 py-3.5">Gia tốc (m/s²)</th>
                    <th className="px-4 py-3.5">Thời gian tạo</th>
                    <th className="px-5 py-3.5 text-right">Hành động tiếp theo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                  {pagedCandidates.map((c, idx) => (
                    <tr key={c.id} className="hover:bg-vehicsim-row transition-colors">
                      <td className="w-12 px-3 py-4 text-center font-mono text-[12px] font-bold text-vehicsim-faint tabular-nums">
                        {(candidatePage - 1) * CANDIDATE_PAGE_SIZE + idx + 1}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-vehicsim-ink">{c.label}</span>
                          <span className="text-[11px] text-vehicsim-muted font-mono">ID: #{c.id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono font-medium">{c.parameters?.TTC_THRESHOLD ?? "—"}</td>
                      <td className="px-4 py-4 font-mono font-medium">{c.parameters?.BRAKE_ACTIVATION_DELAY ?? "—"}</td>
                      <td className="px-4 py-4 font-mono font-medium">{c.parameters?.BRAKE_BUILDUP_RATE ?? "—"}</td>
                      <td className="px-4 py-4 font-mono font-medium">{c.parameters?.MAX_DECELERATION ?? "—"}</td>
                      <td className="px-4 py-4 text-[12px] text-vehicsim-muted">{fmt.date(c.created_at)}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {baseline && (
                            <Link
                              href={`/aeb/compare?a=${baseline.id}&b=${c.id}`}
                              className="rounded-lg border border-solid border-vehicsim-line px-3 py-1.5 text-[12px] font-bold text-vehicsim-ink hover:bg-vehicsim-soft transition"
                            >
                              So sánh với Baseline
                            </Link>
                          )}
                          <PillButton
                            href={`/validation/regression/new?candidate=${c.id}`}
                            variant="dark"
                            className="text-[12px] py-1.5 px-3.5"
                          >
                            <span>Kiểm thử hồi quy (Bước 5)</span>
                            <ArrowRight className="size-3.5" />
                          </PillButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {candidatePages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line px-5 py-3.5">
              <span className="text-[12px] font-medium text-vehicsim-muted">
                Hiển thị {(candidatePage - 1) * CANDIDATE_PAGE_SIZE + 1}–{Math.min(candidatePage * CANDIDATE_PAGE_SIZE, candidates.length)} trên {candidates.length} ứng viên
              </span>
              <Pagination page={candidatePage} pages={candidatePages} onPage={setCandidatePage} />
            </div>
          )}
        </div>
      </section>
    </VehicSimPage>
  );
}
