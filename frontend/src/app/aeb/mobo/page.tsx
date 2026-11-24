"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ListFilter,
  Plus,
  TrendingUp,
} from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import {
  EmptyState,
  ErrorNote,
  Pagination,
  PillButton,
  Tag,
  cx,
  fmt,
} from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { OptimizationRun, OptimizationTrial } from "@/types/vehicsim";

export default function AebMoboStudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canWrite, refresh } = useVehicSimContext();

  const queryRunId = Number(searchParams.get("run_id"));
  const queryTab = searchParams.get("tab");
  const queryNew = searchParams.get("new") === "1";
  const queryScenarioId = Number(searchParams.get("scenario_id"));
  const hasQueryScenario = Number.isInteger(queryScenarioId) && queryScenarioId > 0;

  const [runs, setRuns] = useState<OptimizationRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [activeRun, setActiveRun] = useState<OptimizationRun | null>(null);

  // Sub-tabs: "runs" | "pareto" | "trials"
  const [activeTab, setActiveTab] = useState<"runs" | "pareto" | "trials">(
    queryTab === "pareto"
      ? "pareto"
      : queryTab === "trials"
      ? "trials"
      : queryTab === "runs"
      ? "runs"
      : Number.isInteger(queryRunId) && queryRunId > 0
      ? "pareto"
      : "runs"
  );

  // Pareto data
  const [paretoTrials, setParetoTrials] = useState<OptimizationTrial[] | null>(null);
  const [selectingTrialId, setSelectingTrialId] = useState<number | null>(null);
  const [createdCandidate, setCreatedCandidate] = useState<{
    id: number;
    label: string;
    regressionTestId?: number;
  } | null>(null);

  // Trials data
  const [allTrials, setAllTrials] = useState<OptimizationTrial[] | null>(null);
  const [trialsFilter, setTrialsFilter] = useState<"ALL" | "PARETO" | "FEASIBLE">("ALL");

  // Tự động chuyển sang màn khởi tạo riêng nếu có tham số ?new=1
  useEffect(() => {
    if (queryNew) {
      router.replace(`/aeb/mobo/new${hasQueryScenario ? `?scenario_id=${queryScenarioId}` : ""}`);
    }
  }, [queryNew, hasQueryScenario, queryScenarioId, router]);

  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tải danh sách runs
  const loadRuns = useCallback(() => {
    vehicsimApi
      .optimizationRuns()
      .then((data) => {
        setRuns(data);
        if (data.length > 0) {
          const matched = Number.isInteger(queryRunId) && data.some((r) => r.id === queryRunId);
          setSelectedRunId((cur) => (matched ? queryRunId : cur ?? data[0].id));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách đợt tối ưu"));
  }, [queryRunId]);

  useEffect(loadRuns, [loadRuns]);

  // Khi selectedRunId thay đổi, tải chi tiết run, pareto và all trials
  useEffect(() => {
    if (selectedRunId !== null) {
      vehicsimApi
        .optimizationRun(selectedRunId)
        .then(setActiveRun)
        .catch((err) => setError(err instanceof Error ? err.message : "Không tải được thông tin đợt tối ưu"));

      vehicsimApi
        .optimizationPareto(selectedRunId)
        .then(setParetoTrials)
        .catch(() => setParetoTrials(null));

      vehicsimApi
        .optimizationTrials(selectedRunId)
        .then(setAllTrials)
        .catch(() => setAllTrials(null));
    }
  }, [selectedRunId]);

  // Polling nếu activeRun đang chạy
  useEffect(() => {
    if (!activeRun || activeRun.status !== "RUNNING") return;
    const interval = setInterval(() => {
      vehicsimApi.optimizationRun(activeRun.id).then(setActiveRun).catch(() => {});
      vehicsimApi.optimizationPareto(activeRun.id).then(setParetoTrials).catch(() => {});
      vehicsimApi.optimizationTrials(activeRun.id).then(setAllTrials).catch(() => {});
      loadRuns();
    }, 2500);
    return () => clearInterval(interval);
  }, [activeRun, loadRuns]);

  // Dừng run
  const handleCancelRun = async (runId: number) => {
    if (!confirm("Bạn có chắc muốn dừng đợt tối ưu hoá này?")) return;
    setCancelling(true);
    try {
      await vehicsimApi.cancelOptimization(runId);
      loadRuns();
      if (activeRun?.id === runId) {
        const updated = await vehicsimApi.optimizationRun(runId);
        setActiveRun(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể huỷ đợt chạy");
    } finally {
      setCancelling(false);
    }
  };

  // Chọn nghiệm Pareto làm ứng viên
  const handleSelectCandidate = async (trialId: number) => {
    if (!selectedRunId) return;
    setSelectingTrialId(trialId);
    setError(null);
    try {
      const res = await vehicsimApi.selectOptimizationCandidate(selectedRunId, trialId);
      setCreatedCandidate({
        id: res.candidate_aeb_version_id,
        label: `Phương án #${trialId}`,
        regressionTestId: res.regression_test_id,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể chọn làm ứng viên");
    } finally {
      setSelectingTrialId(null);
    }
  };

  // Pagination states
  const [paretoPage, setParetoPage] = useState(1);
  const PARETO_PAGE_SIZE = 8;
  const [trialsPage, setTrialsPage] = useState(1);
  const TRIALS_PAGE_SIZE = 10;
  const [runsPage, setRunsPage] = useState(1);
  const RUNS_PAGE_SIZE = 8;

  const filteredTrials = useMemo(() => {
    return (allTrials ?? []).filter((t) => {
      if (trialsFilter === "PARETO") return t.is_pareto_optimal;
      if (trialsFilter === "FEASIBLE") return !t.constraint_violated;
      return true;
    });
  }, [allTrials, trialsFilter]);

  const pagedTrials = useMemo(() => {
    const start = (trialsPage - 1) * TRIALS_PAGE_SIZE;
    return filteredTrials.slice(start, start + TRIALS_PAGE_SIZE);
  }, [filteredTrials, trialsPage]);
  const trialsPages = Math.ceil(filteredTrials.length / TRIALS_PAGE_SIZE);

  const pagedPareto = useMemo(() => {
    const list = paretoTrials ?? [];
    const start = (paretoPage - 1) * PARETO_PAGE_SIZE;
    return list.slice(start, start + PARETO_PAGE_SIZE);
  }, [paretoTrials, paretoPage]);
  const paretoPages = Math.ceil((paretoTrials?.length ?? 0) / PARETO_PAGE_SIZE);

  const pagedRuns = useMemo(() => {
    const list = runs ?? [];
    const start = (runsPage - 1) * RUNS_PAGE_SIZE;
    return list.slice(start, start + RUNS_PAGE_SIZE);
  }, [runs, runsPage]);
  const runsPages = Math.ceil((runs?.length ?? 0) / RUNS_PAGE_SIZE);

  const completedTrialsCount =
    activeRun?.completed_trials ??
    (allTrials && allTrials.length > 0 ? allTrials.length : 0);
  const maxTrialsCount = activeRun?.max_trials || 10;
  const runProgressPct =
    maxTrialsCount > 0
      ? Math.min(100, Math.round((completedTrialsCount / maxTrialsCount) * 100))
      : 0;

  return (
    <VehicSimPage
      step={4}
      crumbs={[
        { label: "Cải tiến AEB", href: "/aeb" },
        { label: "Tối ưu tự động MOBO" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PillButton
            href={`/aeb/mobo/new${hasQueryScenario ? `?scenario_id=${queryScenarioId}` : ""}`}
            variant="dark"
            className="inline-flex items-center gap-1.5 text-[13px]"
          >
            <Plus className="size-4" />
            <span>Khởi tạo đợt mới</span>
          </PillButton>
        </div>
      }
    >
      <ErrorNote message={error} />

      {/* BANNER THÀNH CÔNG KHI CHỌN CANDIDATE */}
      {createdCandidate && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 p-4 text-[13.5px] text-emerald-950 dark:text-emerald-200 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <span className="font-extrabold text-[14px]">
                Đã chọn {createdCandidate.label} làm Ứng viên AEB mới thành công!
              </span>
              <p className="text-[12px] opacity-80">
                Ứng viên này đã sẵn sàng để đối chiếu với Baseline qua kiểm thử hồi quy độc lập.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <PillButton
              variant="dark"
              href={
                createdCandidate.regressionTestId
                  ? `/validation/regression`
                  : `/validation/regression/new?candidate=${createdCandidate.id}`
              }
              className="py-1.5 px-4 text-[12.5px] shadow-sm"
            >
              <span>Chuyển sang Bước 5: Kiểm định hồi quy</span>
              <ArrowRight className="size-4" />
            </PillButton>
          </div>
        </section>
      )}

      {/* THANH TIẾN ĐỘ CHỈ KHI CÓ ĐỢT CHẠY ĐANG DIỄN RA */}
      {activeRun?.status === "RUNNING" && (
        <section className="rounded-xl border border-solid border-vehicsim-primary/30 bg-vehicsim-primary/5 p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-vehicsim-primary opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-vehicsim-primary"></span>
              </span>
              <span className="font-bold text-vehicsim-primary">
                Đang chạy đợt tối ưu: Run #{activeRun.id} — {activeRun.name}
              </span>
              <span className="font-mono text-vehicsim-muted">
                ({completedTrialsCount} / {maxTrialsCount} lượt thử · {runProgressPct}%)
              </span>
            </div>

            {canWrite && (
              <button
                type="button"
                onClick={() => handleCancelRun(activeRun.id)}
                disabled={cancelling}
                className="rounded-lg border border-solid border-vehicsim-danger px-3 py-1 text-[11px] font-bold text-vehicsim-danger hover:bg-vehicsim-danger-bg transition"
              >
                {cancelling ? "Đang dừng…" : "Dừng đợt chạy"}
              </button>
            )}
          </div>

          <div
            role="progressbar"
            aria-valuenow={runProgressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Tiến độ đợt tối ưu: ${runProgressPct}%`}
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
          >
            <div
              className="h-full rounded-full bg-vehicsim-primary transition-all duration-500 ease-out"
              style={{ width: `${runProgressPct}%` }}
            />
          </div>
        </section>
      )}

      {/* CỤM TABS CON NỘI BỘ (PARETO / TRIALS / LỊCH SỬ RUNS) */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-solid border-vehicsim-line pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("runs")}
            className={cx(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold transition",
              activeTab === "runs"
                ? "bg-vehicsim-primary text-white shadow-xs"
                : "text-vehicsim-ink hover:bg-vehicsim-soft hover:text-vehicsim-primary"
            )}
          >
            <Clock className="size-4" />
            <span>Lịch sử đợt chạy ({runs?.length ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pareto")}
            className={cx(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold transition",
              activeTab === "pareto"
                ? "bg-vehicsim-primary text-white shadow-xs"
                : "text-vehicsim-ink hover:bg-vehicsim-soft hover:text-vehicsim-primary"
            )}
          >
            <TrendingUp className="size-4" />
            <span>Phương án tối ưu ({paretoTrials?.length ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("trials")}
            className={cx(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold transition",
              activeTab === "trials"
                ? "bg-vehicsim-primary text-white shadow-xs"
                : "text-vehicsim-ink hover:bg-vehicsim-soft hover:text-vehicsim-primary"
            )}
          >
            <ListFilter className="size-4" />
            <span>Toàn bộ lượt thử ({allTrials?.length ?? 0})</span>
          </button>
        </div>

        {/* TAB: PHƯƠNG ÁN TỐI ƯU */}
        {activeTab === "pareto" && (
          <div className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
            {paretoTrials?.length === 0 ? (
              <div className="p-10">
                <EmptyState title="Chưa có phương án tối ưu cho đợt chạy này">
                  {activeRun?.status === "COMPLETED"
                    ? "Đợt chạy đã hoàn thành nhưng tất cả các lượt thử nghiệm đều vi phạm ràng buộc an toàn (tỉ lệ va chạm cao hơn hoặc phanh oan tăng quá 5% so với bản cơ sở). Bạn có thể xem chi tiết từng lượt ở tab 'Toàn bộ lượt thử'."
                    : "Đợt chạy đang trong giai đoạn khởi tạo ban đầu hoặc đang mô phỏng các lượt thử nghiệm."}
                </EmptyState>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[11.5px] font-black uppercase tracking-wider leading-snug text-white">
                    <tr className="h-12">
                      <th className="pl-4 pr-3 py-3 whitespace-nowrap">Lượt thử</th>
                      <th className="px-3 py-3">TTC Threshold (s)</th>
                      <th className="px-3 py-3">Brake Activation Delay (s)</th>
                      <th className="px-3 py-3">Brake Build-up Rate (m/s³)</th>
                      <th className="px-3 py-3">Max Deceleration (m/s²)</th>
                      <th className="px-3 py-3 text-emerald-300">RMS Jerk</th>
                      <th className="px-3 py-3 text-rose-300">Tốc độ va chạm</th>
                      <th className="px-3 py-3 text-slate-200">Quãng phanh</th>
                      <th className="pl-3 pr-4 py-3 text-center whitespace-nowrap">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                    {pagedPareto.map((t) => (
                      <tr key={t.id} className="hover:bg-vehicsim-row transition-colors">
                        <td className="pl-4 pr-3 py-3.5 font-mono font-bold text-vehicsim-ink whitespace-nowrap">
                          #{t.trial_number}
                        </td>
                        <td className="px-3 py-3.5 font-mono font-medium whitespace-nowrap">{t.parameters?.TTC_THRESHOLD ?? "—"}</td>
                        <td className="px-3 py-3.5 font-mono font-medium whitespace-nowrap">{t.parameters?.BRAKE_ACTIVATION_DELAY ?? "—"}</td>
                        <td className="px-3 py-3.5 font-mono font-medium whitespace-nowrap">{t.parameters?.BRAKE_BUILDUP_RATE ?? "—"}</td>
                        <td className="px-3 py-3.5 font-mono font-medium whitespace-nowrap">{t.parameters?.MAX_DECELERATION ?? "—"}</td>
                        <td className="px-3 py-3.5 font-bold text-vehicsim-decision whitespace-nowrap">
                          {t.rms_jerk_mps3 !== null ? `${t.rms_jerk_mps3.toFixed(2)} m/s³` : "—"}
                        </td>
                        <td className="px-3 py-3.5 font-bold text-vehicsim-danger leading-tight">
                          {t.impact_speed_mps !== null ? (
                            t.impact_speed_mps <= 0.001 ? (
                              <span>
                                <span className="whitespace-nowrap">0.0 km/h</span>{" "}
                                <span className="inline-block text-[11px] font-semibold">(An toàn)</span>
                              </span>
                            ) : (
                              <span className="whitespace-nowrap">{`${(t.impact_speed_mps * 3.6).toFixed(1)} km/h`}</span>
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3.5 font-bold text-vehicsim-ink whitespace-nowrap">
                          {t.stopping_distance_m !== null ? `${t.stopping_distance_m.toFixed(2)} m` : "—"}
                        </td>
                        <td className="pl-3 pr-4 py-3.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            disabled={selectingTrialId !== null || !canWrite}
                            onClick={() => handleSelectCandidate(t.id)}
                            className="inline-flex h-8 items-center justify-center rounded-lg bg-vehicsim-primary px-3 text-[12px] font-bold text-white transition hover:bg-vehicsim-primary-hover disabled:opacity-40 shadow-xs whitespace-nowrap"
                          >
                            {selectingTrialId === t.id ? "Đang lưu…" : "Chọn làm ứng viên"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {paretoPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line px-5 py-3.5">
                <span className="text-[12px] font-medium text-vehicsim-muted">
                  Hiển thị {(paretoPage - 1) * PARETO_PAGE_SIZE + 1}–{Math.min(paretoPage * PARETO_PAGE_SIZE, paretoTrials?.length ?? 0)} trên {paretoTrials?.length ?? 0} phương án tối ưu
                </span>
                <Pagination page={paretoPage} pages={paretoPages} onPage={setParetoPage} />
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TOÀN BỘ TRIALS */}
        {activeTab === "trials" && (
          <div className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-bold text-vehicsim-ink">Bộ lọc:</span>
                <div className="flex items-center gap-1.5">
                  {(["ALL", "PARETO", "FEASIBLE"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setTrialsFilter(mode);
                        setTrialsPage(1);
                      }}
                      className={cx(
                        "rounded-lg px-3 py-1 text-[12px] font-semibold transition border border-solid",
                        trialsFilter === mode
                          ? "bg-vehicsim-primary border-vehicsim-primary text-white shadow-xs"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      )}
                    >
                      {mode === "ALL" ? "Tất cả" : mode === "PARETO" ? "Chỉ tối ưu" : "Chỉ hợp lệ"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredTrials.length === 0 ? (
              <div className="p-10">
                <EmptyState title="Không có lượt thử nào khớp bộ lọc" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-left text-[13px]">
                  <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12px] font-black uppercase tracking-wider text-white">
                    <tr className="h-12">
                      <th className="pl-5 pr-4 py-3.5 whitespace-nowrap">Lượt thử</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Nguồn</th>
                      <th className="px-4 py-3.5 whitespace-nowrap">Điểm tiềm năng (qEHVI)</th>
                      <th className="px-4 py-3.5 text-emerald-300 whitespace-nowrap">RMS Jerk</th>
                      <th className="px-4 py-3.5 text-rose-300 whitespace-nowrap">Tốc độ va chạm</th>
                      <th className="px-4 py-3.5 text-slate-200 whitespace-nowrap">Quãng phanh</th>
                      <th className="px-4 py-3.5 text-center whitespace-nowrap">Ràng buộc</th>
                      <th className="w-[100px] px-4 py-3.5 text-center whitespace-nowrap">Tối ưu?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                    {pagedTrials.map((t) => (
                      <tr key={t.id} className="hover:bg-vehicsim-row transition-colors">
                        <td className="pl-5 pr-4 py-3.5 font-mono font-bold text-vehicsim-ink whitespace-nowrap">
                          #{t.trial_number}
                        </td>
                        <td className="px-4 py-3.5">
                          <Tag tone={t.sampling_source === "INITIAL_DESIGN" || t.sampling_source === "SOBOL_INIT" ? "neutral" : "info"}>
                            {t.sampling_source === "INITIAL_DESIGN" || t.sampling_source === "SOBOL_INIT" ? "Khởi tạo ban đầu" : "Bayesian GP"}
                          </Tag>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-[12px]">
                          {t.acquisition_value !== null ? t.acquisition_value.toFixed(4) : "—"}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-vehicsim-decision">
                          {t.rms_jerk_mps3 !== null ? `${t.rms_jerk_mps3.toFixed(2)} m/s³` : "—"}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-vehicsim-danger">
                          {t.impact_speed_mps !== null
                            ? t.impact_speed_mps <= 0.001
                              ? "0.0 km/h"
                              : `${(t.impact_speed_mps * 3.6).toFixed(1)} km/h`
                            : "—"}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-vehicsim-ink">
                          {t.stopping_distance_m !== null ? `${t.stopping_distance_m.toFixed(2)} m` : "—"}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <Tag tone={t.constraint_violated ? "danger" : "ok"}>
                            {t.constraint_violated ? "Vi phạm" : "Hợp lệ"}
                          </Tag>
                        </td>
                        <td className="w-[100px] px-4 py-3.5 text-center whitespace-nowrap">
                          {t.is_pareto_optimal ? (
                            <span className="inline-flex items-center rounded-full bg-vehicsim-ok-bg px-2 py-0.5 text-[11px] font-bold text-vehicsim-ok">
                              ★ Tối ưu
                            </span>
                          ) : (
                            <span className="text-[12px] text-vehicsim-faint">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {trialsPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line px-5 py-3.5">
                <span className="text-[12px] font-medium text-vehicsim-muted">
                  Hiển thị {(trialsPage - 1) * TRIALS_PAGE_SIZE + 1}–{Math.min(trialsPage * TRIALS_PAGE_SIZE, filteredTrials.length)} trên {filteredTrials.length} lượt thử
                </span>
                <Pagination page={trialsPage} pages={trialsPages} onPage={setTrialsPage} />
              </div>
            )}

            {/* Ghi chú giải thích điểm tiềm năng qEHVI */}
            <div className="border-t border-solid border-vehicsim-line px-5 py-3 text-[12px] leading-relaxed text-vehicsim-muted bg-vehicsim-soft/30">
              <strong className="font-bold text-vehicsim-ink">Điểm tiềm năng (qEHVI):</strong>{" "}
              Chỉ số do thuật toán AI tính toán để đo mức độ hứa hẹn của bộ tham số. Điểm càng cao thì phương án càng có khả năng mở rộng tập tối ưu (các lượt khởi tạo ban đầu để lấy mẫu mồi sẽ hiển thị &ldquo;—&rdquo;).
            </div>
          </div>
        )}

        {/* TAB 3: LỊCH SỬ CÁC ĐỢT CHẠY */}
        {activeTab === "runs" && (
          <div className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-[13px]">
                <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12.5px] font-black uppercase tracking-wider text-white">
                  <tr className="h-12">
                    <th className="px-5 py-3.5">Mã run</th>
                    <th className="px-5 py-3.5">Tên đợt chạy</th>
                    <th className="px-5 py-3.5">Bộ mô phỏng</th>
                    <th className="px-5 py-3.5">Trạng thái</th>
                    <th className="px-5 py-3.5">Tiến độ thử nghiệm</th>
                    <th className="px-5 py-3.5">Phương án tối ưu</th>
                    <th className="px-5 py-3.5">Thời gian</th>
                    <th className="px-5 py-3.5 text-center min-w-[240px]">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                  {pagedRuns.map((r) => {
                    const isSelected = r.id === selectedRunId;
                    return (
                      <tr
                        key={r.id}
                        className={cx(
                          "hover:bg-vehicsim-soft/60 transition-colors",
                          isSelected && "bg-vehicsim-primary-bg/50"
                        )}
                      >
                        <td className="px-5 py-4 font-mono font-bold text-vehicsim-ink">#{r.id}</td>
                        <td className="px-5 py-4 font-bold text-vehicsim-ink">{r.name}</td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1 rounded-full bg-vehicsim-soft px-2.5 py-0.5 text-[11px] font-bold text-vehicsim-ink border border-vehicsim-line">
                            {r.simulator_version?.startsWith("carla-") ? "CARLA 3D" : "Kinematic"}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <Tag
                            tone={
                              r.status === "COMPLETED"
                                ? "ok"
                                : r.status === "RUNNING"
                                ? "info"
                                : r.status === "FAILED"
                                ? "danger"
                                : "neutral"
                            }
                          >
                            {r.status}
                          </Tag>
                        </td>
                        <td className="px-5 py-4 font-semibold text-vehicsim-ink">
                          {r.completed_trials} / {r.max_trials} lượt
                        </td>
                        <td className="px-5 py-4 font-semibold text-vehicsim-ink whitespace-nowrap">
                          {r.pareto_count} phương án
                        </td>
                        <td className="px-5 py-4 text-[12px] text-vehicsim-muted">{fmt.date(r.started_at)}</td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRunId(r.id);
                                setActiveTab("pareto");
                              }}
                              className={cx(
                                "min-w-[100px] whitespace-nowrap rounded-lg px-3 py-1.5 text-center text-[12px] font-bold transition shadow-xs",
                                isSelected
                                  ? "bg-vehicsim-primary text-white"
                                  : "border border-solid border-vehicsim-primary/40 bg-vehicsim-primary/5 text-vehicsim-primary hover:bg-vehicsim-primary hover:text-white"
                              )}
                              title="Xem các phương án tối ưu được tìm ra"
                            >
                              Xem tối ưu
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRunId(r.id);
                                setActiveTab("trials");
                              }}
                              className="min-w-[100px] whitespace-nowrap rounded-lg border border-solid border-vehicsim-line bg-vehicsim-surface px-3 py-1.5 text-center text-[12px] font-bold text-vehicsim-ink transition hover:bg-vehicsim-soft hover:border-slate-400 shadow-xs"
                              title="Xem chi tiết toàn bộ các lượt thử nghiệm đã chạy"
                            >
                              Xem lượt thử
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {runsPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line px-5 py-3.5">
                <span className="text-[12px] font-medium text-vehicsim-muted">
                  Hiển thị {(runsPage - 1) * RUNS_PAGE_SIZE + 1}–{Math.min(runsPage * RUNS_PAGE_SIZE, runs?.length ?? 0)} trên {runs?.length ?? 0} đợt chạy
                </span>
                <Pagination page={runsPage} pages={runsPages} onPage={setRunsPage} />
              </div>
            )}
          </div>
        )}
      </section>
    </VehicSimPage>
  );
}
