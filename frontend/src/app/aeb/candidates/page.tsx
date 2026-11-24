"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, ErrorNote, Pagination, PillButton, Tag, fmt, paramValue } from "@/components/VehicSimUi";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { vehicsimApi } from "@/services/vehicsim";
import type { AebVersion } from "@/types/vehicsim";
import { KEY_PARAMS, PARAM_NAMES } from "@/components/aeb/aebTypes";

export default function AebCandidatesPage() {
  const { ctx, canWrite } = useVehicSimContext();
  const [versions, setVersions] = useState<AebVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vehicsimApi
      .aebVersions()
      .then(setVersions)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách ứng viên AEB"));
  }, []);

  const baseline = versions?.find((v) => v.status === "BASELINE") ?? null;
  const candidates = versions?.filter((v) => v.status === "CANDIDATE") ?? [];
  const catalog = new Map((ctx?.parameters ?? []).map((p) => [p.code, p]));

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;
  const pages = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
  const pagedCandidates = candidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <VehicSimPage
      step={4}
      crumbs={[{ label: "Cải tiến AEB", href: "/aeb" }, { label: "Ứng viên chờ duyệt" }]}
      actions={
        <div className="flex items-center gap-2">
          <PillButton href="/aeb/mobo/new" variant="light">
            + Tối ưu MOBO mới
          </PillButton>
          <PillButton href="/aeb/manual" variant="dark">
            + Chỉnh tay tham số
          </PillButton>
        </div>
      }
    >
      <ErrorNote message={error} />

      <section className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-[16px] font-bold text-vehicsim-ink">
              Tất cả ứng viên Candidate ({candidates.length})
            </h2>
            <Tag tone="info">Chờ kiểm chứng hồi quy</Tag>
          </div>
          <Link href="/aeb/versions" className="text-[12px] font-bold text-vehicsim-decision hover:underline">
            Xem toàn bộ phiên bản trong kho tri thức →
          </Link>
        </div>

        {candidates.length === 0 ? (
          <div className="p-10">
            <EmptyState title="Chưa có ứng viên AEB nào đang chờ">
              Hãy khởi chạy tối ưu hoá MOBO hoặc tự hiệu chỉnh thủ công để tạo ứng viên AEB mới.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12.5px] font-black uppercase tracking-wider text-white">
                <tr className="h-12">
                  <th className="w-12 px-3 py-3.5 text-center">STT</th>
                  <th className="px-5 py-3.5">Ứng viên</th>
                  <th className="px-5 py-3.5">Nguồn gốc</th>
                  {KEY_PARAMS.map((code) => (
                    <th key={code} className="px-4 py-3.5">
                      {PARAM_NAMES[code] ?? catalog.get(code)?.name ?? code}
                    </th>
                  ))}
                  <th className="px-5 py-3.5">Ngày tạo</th>
                  <th className="px-5 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                {pagedCandidates.map((cand, idx) => (
                  <tr key={cand.id} className="hover:bg-vehicsim-row transition-colors">
                    <td className="w-12 px-3 py-4 text-center font-mono text-[12px] font-bold text-vehicsim-faint tabular-nums">
                      {(page - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    <td className="px-5 py-4 font-bold text-vehicsim-ink">
                      <div className="flex flex-col">
                        <span className="text-[14px]">AEB {cand.label}</span>
                        <span className="text-[11px] text-vehicsim-faint">
                          {cand.notes ? cand.notes : "Không có ghi chú"}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Tag tone={cand.source === "OPTIMIZATION" ? "ok" : "neutral"}>
                        {cand.source === "OPTIMIZATION" ? "Sinh từ MOBO" : "Chỉnh tay thủ công"}
                      </Tag>
                    </td>
                    {KEY_PARAMS.map((code) => {
                      const def = catalog.get(code);
                      const differs = baseline && cand.parameters[code] !== baseline.parameters[code];
                      return (
                        <td
                          key={code}
                          className={`px-4 py-4 font-mono ${
                            differs ? "font-bold text-vehicsim-decision" : "text-vehicsim-ink"
                          }`}
                        >
                          {paramValue(cand.parameters[code], def?.unit ?? "")}
                        </td>
                      );
                    })}
                    <td className="px-5 py-4 text-[12px] text-vehicsim-muted">
                      {fmt.date(cand.created_at)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <PillButton
                          variant="light"
                          href={`/aeb/compare?a=${baseline?.id}&b=${cand.id}`}
                          className="text-[12px] py-1.5"
                        >
                          So với Baseline
                        </PillButton>
                        {canWrite && (
                          <PillButton
                            variant="dark"
                            href={`/validation/regression/new?candidate=${cand.id}`}
                            className="text-[12px] py-1.5"
                          >
                            Kiểm thử hồi quy
                          </PillButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line px-5 py-3.5">
            <span className="text-[12px] font-medium text-vehicsim-muted">
              Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, candidates.length)} trên {candidates.length} ứng viên
            </span>
            <Pagination page={page} pages={pages} onPage={setPage} />
          </div>
        )}
      </section>
    </VehicSimPage>
  );
}
