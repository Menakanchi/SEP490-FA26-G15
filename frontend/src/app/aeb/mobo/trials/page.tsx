"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListFilter } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { EmptyState, ErrorNote, Pagination, PillButton, Tag, cx } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { OptimizationRun, OptimizationTrial } from "@/types/vehicsim";
import { VehicSimSelect } from "@/components/VehicSimSelect";
import { formatMetric, formatObjective } from "@/components/analysis/analysisMetricFormat";
import { hasCompleteTrialEvidence, isFeasibleTrial } from "@/components/aeb/optimizationEvidence";

export default function AebMoboTrialsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [runs, setRuns] = useState<OptimizationRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [trialResult, setTrialResult] = useState<{ runId: number; items: OptimizationTrial[] } | null>(null);
  const trials = trialResult?.runId === selectedRunId ? trialResult.items : null;
  const [filterMode, setFilterMode] = useState<"ALL" | "PARETO" | "FEASIBLE">("ALL");
  const [error, setError] = useState<string | null>(null);

  const queryRunId = Number(searchParams.get("run_id"));

  useEffect(() => {
    let active = true;
    vehicsimApi
      .optimizationRuns()
      .then((data) => {
        if (!active) return;
        setRuns(data);
        if (data.length > 0) {
          const matched = Number.isInteger(queryRunId) && data.some((r) => r.id === queryRunId);
          setSelectedRunId(matched ? queryRunId : data[0].id);
        }
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Không tải được danh sách đợt tối ưu"); });
    return () => { active = false; };
  }, [queryRunId]);

  useEffect(() => {
    let active = true;
    if (selectedRunId !== null) {
      vehicsimApi
        .optimizationTrials(selectedRunId)
        .then(items => { if (active) { setTrialResult({ runId: selectedRunId, items }); setError(null); } })
        .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Không tải được danh sách lượt thử"); });
    }
    return () => { active = false; };
  }, [selectedRunId]);

  const activeRun = runs?.find((r) => r.id === selectedRunId) ?? null;

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const filteredTrials = (trials ?? []).filter((t) => {
    if (filterMode === "PARETO") return t.is_pareto_optimal && isFeasibleTrial(t);
    if (filterMode === "FEASIBLE") return isFeasibleTrial(t);
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredTrials.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedTrials = filteredTrials.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <VehicSimPage
      step={4}
      crumbs={[
        { label: "Cải tiến AEB", href: "/aeb" },
        { label: "Tối ưu MOBO", href: "/aeb/mobo" },
        { label: "Dữ liệu thử nghiệm" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PillButton href={`/aeb/mobo/pareto${selectedRunId ? `?run_id=${selectedRunId}` : ""}`} variant="dark">
            Xem biên Pareto Frontier
          </PillButton>
          <PillButton href="/aeb/mobo" variant="light">
            Về danh sách đợt chạy
          </PillButton>
        </div>
      }
    >
      <ErrorNote message={error} />

      {/* Bộ chọn đợt chạy và Bộ lọc */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-5 shadow-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <label className="text-[13px] font-bold text-vehicsim-ink">Đợt chạy:</label>
            <VehicSimSelect
              aria-label="Chọn đợt tối ưu hoá"
              value={selectedRunId}
              onChange={(newId) => {
                setSelectedRunId(newId);
                setError(null);
                setPage(1);
                router.replace(`/aeb/mobo/trials?run_id=${newId}`);
              }}
              options={(runs ?? []).map((r) => ({
                value: r.id,
                label: `Run #${r.id} · ${r.name}`,
                sublabel: `${r.completed_trials} lượt thử`,
              }))}
              className="min-w-0 max-w-md"
              disabled={runs?.length === 0}
            />
          </div>

          <div className="flex items-center rounded-lg border border-solid border-slate-200 dark:border-slate-700 p-1 bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => { setFilterMode("ALL"); setPage(1); }}
              className={cx(
                "rounded-md px-3 py-1.5 text-[12px] font-bold transition-all",
                filterMode === "ALL"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700"
              )}
            >
              Tất cả ({trials?.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => { setFilterMode("PARETO"); setPage(1); }}
              className={cx(
                "rounded-md px-3 py-1.5 text-[12px] font-bold transition-all",
                filterMode === "PARETO"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 dark:text-slate-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-950/40"
              )}
            >
              Biên Pareto ({trials?.filter((t) => t.is_pareto_optimal && isFeasibleTrial(t)).length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => { setFilterMode("FEASIBLE"); setPage(1); }}
              className={cx(
                "rounded-md px-3 py-1.5 text-[12px] font-bold transition-all",
                filterMode === "FEASIBLE"
                  ? "bg-slate-800 text-white shadow-xs dark:bg-slate-700 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700"
              )}
            >
              Hợp lệ ({trials?.filter(isFeasibleTrial).length ?? 0})
            </button>
          </div>
        </div>

        {activeRun && (
          <span className="text-[12px] text-vehicsim-muted">
            Kịch bản ID: <strong>#{activeRun.scenario_id}</strong>
          </span>
        )}
      </section>

      {/* Bảng danh sách Trials */}
      <section className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-solid border-vehicsim-line px-5 py-4">
          <div className="flex items-center gap-2">
            <ListFilter className="size-5 text-vehicsim-decision" />
            <h3 className="text-[16px] font-bold text-vehicsim-ink">
              Dữ liệu thử nghiệm ({filteredTrials.length} lượt thử)
            </h3>
          </div>
        </div>

        {runs?.length === 0 ? <div className="p-10"><EmptyState title="Chưa có đợt tối ưu">Tạo đợt tối ưu để xem các lượt thử.</EmptyState></div> : trials === null ? <p role="status" className="p-5 text-[13px] text-vehicsim-muted">{error ? "Chưa tải được lượt thử." : "Đang tải lượt thử…"}</p> : filteredTrials.length === 0 ? (
          <div className="p-10">
            <EmptyState title="Không có lượt thử nghiệm nào khớp bộ lọc">
              Hãy chọn bộ lọc khác hoặc kiểm tra lại tiến độ đợt chạy.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12.5px] font-black uppercase tracking-wider text-white">
                <tr className="h-12">
                  <th className="pl-5 pr-4 py-3.5 whitespace-nowrap">Lượt thử</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Nguồn sinh mẫu</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Điểm tiềm năng (qEHVI)</th>
                  <th className="px-4 py-3.5 text-emerald-300 whitespace-nowrap">RMS Jerk (m/s³)</th>
                  <th className="px-4 py-3.5 text-rose-300 whitespace-nowrap">Va chạm (m/s)</th>
                  <th className="px-4 py-3.5 text-slate-200 whitespace-nowrap">Quãng phanh (m)</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Ràng buộc</th>
                  <th className="px-4 py-3.5 text-right whitespace-nowrap">Biên Pareto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                {pagedTrials.map((t) => (
                  <tr key={t.id} className={cx("hover:bg-vehicsim-row transition-colors", t.is_pareto_optimal && "bg-vehicsim-ok-bg/25")}>
                    <td className="pl-5 pr-4 py-3.5 font-mono font-bold text-vehicsim-ink">#{t.trial_number}</td>
                    <td className="px-4 py-3.5">
                      <Tag tone={t.sampling_source === "INITIAL_DESIGN" ? "neutral" : "info"}>
                        {t.sampling_source === "INITIAL_DESIGN" ? "Khởi tạo Sobol/Random" : "qEHVI Bayes"}
                      </Tag>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12px] text-vehicsim-muted">
                      {formatMetric(t.acquisition_value, 5)}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-vehicsim-decision">
                      {formatObjective(t.rms_jerk_mps3)}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-vehicsim-danger">
                      {formatMetric(t.impact_speed_mps, 3, true)}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-vehicsim-ink">
                      {formatObjective(t.stopping_distance_m)}
                    </td>
                    <td className="px-4 py-3.5">
                      {!hasCompleteTrialEvidence(t) ? (
                        <span className="text-vehicsim-muted">Chưa đánh giá</span>
                      ) : t.constraint_violated ? (
                        <span className="font-bold text-vehicsim-danger">Vi phạm</span>
                      ) : (
                        <span className="font-bold text-vehicsim-ok">Thỏa mãn</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {t.is_pareto_optimal && isFeasibleTrial(t) ? (
                        <span className="rounded-full bg-vehicsim-ok-bg px-2.5 py-0.5 text-[10px] font-bold text-vehicsim-ok">
                          PARETO
                        </span>
                      ) : (
                        <span className="text-vehicsim-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line px-5 py-3.5">
            <span className="text-[12px] font-medium text-vehicsim-muted">
              Hiển thị {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredTrials.length)} trên {filteredTrials.length} lượt thử nghiệm
            </span>
            <Pagination page={safePage} pages={totalPages} onPage={setPage} />
          </div>
        )}
      </section>
    </VehicSimPage>
  );
}
