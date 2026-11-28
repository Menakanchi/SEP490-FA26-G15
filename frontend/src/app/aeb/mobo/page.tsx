"use client";

import { TrialSelectAction, useTrialSelections } from "@/components/aeb/TrialSelectAction";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatMetric, formatMeasurement } from "@/components/analysis/analysisMetricFormat";
import { hasCompleteTrialEvidence, isFeasibleTrial, RUN_STATUS_LABEL } from "@/components/aeb/optimizationEvidence";
import { vi } from "@/components/vehicsimI18n";

export default function AebMoboStudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canWrite, refresh } = useVehicSimContext();

  const queryRunId = Number(searchParams.get("run_id"));
  const queryTab = searchParams.get("tab");
  const queryNew = searchParams.get("new") === "1";
  const queryScenarioId = Number(searchParams.get("scenario_id"));
  const hasQueryScenario = Number.isInteger(queryScenarioId) && queryScenarioId > 0;
  const datasetId = searchParams.get("dataset_id");
  const newCampaignHref = datasetId !== null ? `/aeb/mobo/new?dataset_id=${encodeURIComponent(datasetId)}`
    : `/aeb/mobo/new${hasQueryScenario ? `?scenario_id=${queryScenarioId}` : ""}`;

  const [runs, setRuns] = useState<OptimizationRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [runResult, setRunResult] = useState<{ id: number; data: OptimizationRun } | null>(null);
  const activeRun = runResult?.id === selectedRunId ? runResult.data : null;
  const listVersion = useRef(0);
  const invalidateRunRequests = useCallback(() => { ++listVersion.current; }, []);
  const selectionLock = useRef(false);
  const cancellationLock = useRef(false);
  const [detailRevision, setDetailRevision] = useState(0);

  // Sub-tabs: "runs" | "pareto" | "trials"
  const activeTab: "runs" | "pareto" | "trials" =
    queryTab === "pareto"
      ? "pareto"
      : queryTab === "trials"
      ? "trials"
      : queryTab === "runs"
      ? "runs"
      : Number.isInteger(queryRunId) && queryRunId > 0
      ? "pareto"
      : "runs";

  function openTab(tab: "runs" | "pareto" | "trials", runId = selectedRunId) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    if (runId !== null) params.set("run_id", String(runId));
    router.replace(`/aeb/mobo?${params}`);
  }

  // Pareto data
  const [paretoResult, setParetoResult] = useState<{ id: number; data: OptimizationTrial[] } | null>(null);
  // Tải trạng thái đã chọn và cập nhật ngay khi chọn thành công.
  const { selections: trialSelections, markSelected } = useTrialSelections(paretoResult);
  const paretoTrials = useMemo(() => paretoResult?.id === selectedRunId ? paretoResult.data.filter(isFeasibleTrial) : null, [paretoResult, selectedRunId]);
  const [selectingTrialId, setSelectingTrialId] = useState<number | null>(null);
  const [candidateResult, setCandidateResult] = useState<{
    runId: number;
    id: number;
    label: string;
    regressionTestId?: number;
  } | null>(null);
  const createdCandidate = candidateResult?.runId === selectedRunId ? candidateResult : null;

  // Trials data
  const [trialsResult, setTrialsResult] = useState<{ id: number; data: OptimizationTrial[] } | null>(null);
  const allTrials = trialsResult?.id === selectedRunId ? trialsResult.data : null;
  const [trialsFilter, setTrialsFilter] = useState<"ALL" | "PARETO" | "FEASIBLE">("ALL");

  // Tự động chuyển sang màn khởi tạo riêng nếu có tham số ?new=1
  useEffect(() => {
    if (queryNew) {
      router.replace(newCampaignHref);
    }
  }, [queryNew, newCampaignHref, router]);

  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tải danh sách runs
  const loadRuns = useCallback(() => {
    const version = ++listVersion.current;
    vehicsimApi
      .optimizationRuns()
      .then((data) => {
        if (version !== listVersion.current) return;
        setRuns(data);
        if (data.length > 0) {
          const matched = Number.isInteger(queryRunId) && data.some((r) => r.id === queryRunId);
          setSelectedRunId((cur) => (matched ? queryRunId : data.some(r => r.id === cur) ? cur : data[0].id));
        } else {
          setSelectedRunId(null);
        }
      })
      .catch((err) => { if (version === listVersion.current) setError(err instanceof Error ? err.message : "Không tải được danh sách đợt tối ưu"); });
  }, [queryRunId]);

  useEffect(() => { loadRuns(); return invalidateRunRequests; }, [loadRuns, invalidateRunRequests]);

  // Khi selectedRunId thay đổi, tải chi tiết run, pareto và all trials
  useEffect(() => {
    let active = true;
    if (selectedRunId !== null) {
      vehicsimApi
        .optimizationRun(selectedRunId)
        .then(data => { if (active) setRunResult({ id: selectedRunId, data }); })
        .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Không tải được thông tin đợt tối ưu"); });

      vehicsimApi
        .optimizationPareto(selectedRunId)
        .then(data => { if (active) setParetoResult({ id: selectedRunId, data }); })
        .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Không tải được nghiệm Pareto"); });

      vehicsimApi
        .optimizationTrials(selectedRunId)
        .then(data => { if (active) setTrialsResult({ id: selectedRunId, data }); })
        .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Không tải được lượt thử"); });
    }
    return () => { active = false; };
  }, [selectedRunId, detailRevision]);

  // Polling nếu activeRun đang chạy
  useEffect(() => {
    if (!activeRun || !["PENDING", "RUNNING"].includes(activeRun.status)) return;
    let active = true;
    const interval = setInterval(() => {
      vehicsimApi.optimizationRun(activeRun.id).then(data => { if (active) setRunResult({ id: activeRun.id, data }); }).catch(() => {});
      vehicsimApi.optimizationPareto(activeRun.id).then(data => { if (active) setParetoResult({ id: activeRun.id, data }); }).catch(() => {});
      vehicsimApi.optimizationTrials(activeRun.id).then(data => { if (active) setTrialsResult({ id: activeRun.id, data }); }).catch(() => {});
      loadRuns();
    }, 2500);
    return () => { active = false; clearInterval(interval); };
  }, [activeRun, loadRuns]);

  // Khi đợt vừa kết thúc, vòng polling dừng và bỏ các phản hồi còn bay: tải lại đầy đủ một lần để Pareto/lượt thử không kẹt ở số cũ (0).
  const wasActiveRun = useRef<{ id: number; active: boolean } | null>(null);
  useEffect(() => {
    if (!activeRun) return;
    const active = ["PENDING", "RUNNING"].includes(activeRun.status);
    const prev = wasActiveRun.current;
    wasActiveRun.current = { id: activeRun.id, active };
    if (prev && prev.id === activeRun.id && prev.active && !active) {
      setDetailRevision(value => value + 1);
    }
  }, [activeRun]);

  // Dừng run
  const handleCancelRun = async (runId: number) => {
    if (!canWrite || cancellationLock.current || activeRun?.id !== runId || !["PENDING", "RUNNING"].includes(activeRun.status)) return;
    if (!confirm("Bạn có chắc muốn dừng đợt tối ưu hoá này?")) return;
    cancellationLock.current = true;
    setCancelling(true);
    try {
      await vehicsimApi.cancelOptimization(runId);
      setRunResult(current => current?.id === runId ? { ...current, data: { ...current.data, status: "CANCELLED" } } : current);
      loadRuns();
      setDetailRevision(value => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể huỷ đợt chạy");
    } finally {
      setCancelling(false);
      cancellationLock.current = false;
    }
  };

  // Chọn nghiệm Pareto làm ứng viên
  const handleSelectCandidate = async (trialId: number) => {
    if (!selectedRunId || !canWrite || selectionLock.current || !paretoTrials?.some(trial => trial.id === trialId && isFeasibleTrial(trial))) return;
    selectionLock.current = true;
    setSelectingTrialId(trialId);
    setError(null);
    try {
      const res = await vehicsimApi.selectOptimizationCandidate(selectedRunId, trialId);
      markSelected(res.candidate_aeb_version_id, res.regression_test_id);
      setCandidateResult({
        runId: selectedRunId,
        id: res.candidate_aeb_version_id,
        label: `Phương án #${trialId}`,
        regressionTestId: res.regression_test_id,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? vi(err.message) : "Không thể chọn làm ứng viên");
    } finally {
      setSelectingTrialId(null);
      selectionLock.current = false;
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
      if (trialsFilter === "PARETO") return t.is_pareto_optimal && isFeasibleTrial(t);
      if (trialsFilter === "FEASIBLE") return isFeasibleTrial(t);
      return true;
    });
  }, [allTrials, trialsFilter]);

  const pagedTrials = useMemo(() => {
    const start = (Math.min(trialsPage, Math.max(1, Math.ceil(filteredTrials.length / TRIALS_PAGE_SIZE))) - 1) * TRIALS_PAGE_SIZE;
    return filteredTrials.slice(start, start + TRIALS_PAGE_SIZE);
  }, [filteredTrials, trialsPage]);
  const trialsPages = Math.max(1, Math.ceil(filteredTrials.length / TRIALS_PAGE_SIZE));
  const safeTrialsPage = Math.min(trialsPage, trialsPages);

  const pagedPareto = useMemo(() => {
    const list = paretoTrials ?? [];
    const start = (Math.min(paretoPage, Math.max(1, Math.ceil(list.length / PARETO_PAGE_SIZE))) - 1) * PARETO_PAGE_SIZE;
    return list.slice(start, start + PARETO_PAGE_SIZE);
  }, [paretoTrials, paretoPage]);
  const paretoPages = Math.max(1, Math.ceil((paretoTrials?.length ?? 0) / PARETO_PAGE_SIZE));
  const safeParetoPage = Math.min(paretoPage, paretoPages);

  const pagedRuns = useMemo(() => {
    const list = runs ?? [];
    const start = (Math.min(runsPage, Math.max(1, Math.ceil(list.length / RUNS_PAGE_SIZE))) - 1) * RUNS_PAGE_SIZE;
    return list.slice(start, start + RUNS_PAGE_SIZE);
  }, [runs, runsPage]);
  const runsPages = Math.max(1, Math.ceil((runs?.length ?? 0) / RUNS_PAGE_SIZE));
  const safeRunsPage = Math.min(runsPage, runsPages);

  const completedTrialsCount =
    activeRun?.completed_trials ??
    (allTrials?.filter(trial => trial.status === "COMPLETED").length ?? 0);
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
        canWrite && <div className="flex items-center gap-2">
          <PillButton
            href={newCampaignHref}
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
      {activeRun?.status === "FAILED" && <ErrorNote message={vi(activeRun.error_message) || "Đợt tối ưu đã thất bại. Kiểm tra nguồn dữ liệu và trạng thái mô phỏng trước khi tạo đợt mới."} />}
      {activeRun?.handoff_id && <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-vehicsim-line bg-vehicsim-surface p-4 text-[13px]" aria-label="Nguồn handoff V3 của đợt tối ưu">
        <p className="min-w-0 break-all">Handoff V3 {activeRun.handoff_id} · {activeRun.optimization_run_ids?.length ?? "—"} run tối ưu · {activeRun.validation_run_ids?.length ?? "—"} run xác minh độc lập</p>
        {activeRun.handoff_execution_id && <PillButton href={`/analysis/failures?fa_execution=${encodeURIComponent(activeRun.handoff_execution_id)}`}>Xem phân tích nguồn V3</PillButton>}
      </section>}
      {!activeRun?.handoff_id && activeRun?.dataset_id && <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-vehicsim-line bg-vehicsim-surface p-4 text-[13px]" aria-label="Nguồn dataset của đợt tối ưu">
        <p>Tập đã chốt #{activeRun.dataset_id} · {activeRun.optimization_run_ids?.length ?? "—"} run tối ưu · {activeRun.validation_run_ids?.length ?? "—"} run xác minh độc lập</p>
        <PillButton href={`/analysis/failures?view=dataset&dataset_id=${activeRun.dataset_id}`}>Xem tập nguồn</PillButton>
      </section>}

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
                  ? `/validation/regression/${createdCandidate.regressionTestId}`
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
      {activeRun && ["PENDING", "RUNNING"].includes(activeRun.status) && (
        <section className="rounded-xl border border-solid border-vehicsim-primary/30 bg-vehicsim-primary/5 p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-vehicsim-primary opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-vehicsim-primary"></span>
              </span>
              <span className="font-bold text-vehicsim-primary">
                {activeRun.status === "PENDING" ? "Đang chờ đợt tối ưu" : "Đang chạy đợt tối ưu"}: Run #{activeRun.id} — {activeRun.name}
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
        <div className="flex flex-wrap items-center gap-2 border-b border-solid border-vehicsim-line pb-1">
          <button
            type="button"
            onClick={() => openTab("runs")}
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
            onClick={() => openTab("pareto")}
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
            onClick={() => openTab("trials")}
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
            {paretoTrials === null ? <p role="status" className="p-5">{error ? "Chưa tải được nghiệm Pareto." : runs?.length === 0 ? "Chưa có đợt tối ưu." : "Đang tải nghiệm Pareto…"}</p> : paretoTrials.length === 0 ? (
              <div className="p-10">
                <EmptyState title="Chưa có phương án tối ưu cho đợt chạy này">
                  {activeRun?.status === "COMPLETED"
                    ? "Đợt chạy đã hoàn thành nhưng chưa có phương án Pareto đủ số đo hợp lệ và thỏa ràng buộc. Xem trạng thái và số đo ở tab 'Toàn bộ lượt thử'."
                    : activeRun?.status === "FAILED" || activeRun?.status === "CANCELLED"
                    ? "Đợt tối ưu đã dừng. Chưa có phương án đủ điều kiện để chọn làm ứng viên."
                    : "Đợt chạy đang trong giai đoạn khởi tạo ban đầu hoặc đang mô phỏng các lượt thử nghiệm."}
                </EmptyState>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-[13px]">
                  <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12px] font-black uppercase tracking-wider text-white">
                    <tr className="h-12">
                      <th className="pl-3 pr-2 py-3.5">Lượt thử</th>
                      <th className="px-2 py-3.5">Ngưỡng TTC (s)</th>
                      <th className="px-2 py-3.5">Trễ kích hoạt (s)</th>
                      <th className="px-2 py-3.5">Tăng lực phanh (m/s³)</th>
                      <th className="px-2 py-3.5">Giảm tốc tối đa (m/s²)</th>
                      <th className="px-2 py-3.5 text-emerald-300">RMS Jerk</th>
                      <th className="px-2 py-3.5 text-rose-300">Tốc độ va chạm</th>
                      <th className="px-2 py-3.5 text-slate-200">Quãng phanh</th>
                      <th className="w-[160px] px-2 py-3.5 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                    {pagedPareto.map((t) => (
                      <tr key={t.id} className="hover:bg-vehicsim-row transition-colors">
                        <td className="pl-3 pr-2 py-3.5 font-mono font-bold text-vehicsim-ink whitespace-nowrap">
                          #{t.trial_number}
                        </td>
                        <td title={String(t.parameters?.TTC_THRESHOLD ?? "—")} className="px-2 py-3.5 font-mono font-medium whitespace-nowrap">{formatMetric(t.parameters?.TTC_THRESHOLD, 3, true)}</td>
                        <td title={String(t.parameters?.BRAKE_ACTIVATION_DELAY ?? "—")} className="px-2 py-3.5 font-mono font-medium whitespace-nowrap">{formatMetric(t.parameters?.BRAKE_ACTIVATION_DELAY, 3, true)}</td>
                        <td title={String(t.parameters?.BRAKE_BUILDUP_RATE ?? "—")} className="px-2 py-3.5 font-mono font-medium whitespace-nowrap">{formatMetric(t.parameters?.BRAKE_BUILDUP_RATE, 3, true)}</td>
                        <td title={String(t.parameters?.MAX_DECELERATION ?? "—")} className="px-2 py-3.5 font-mono font-medium whitespace-nowrap">{formatMetric(t.parameters?.MAX_DECELERATION, 3, true)}</td>
                        <td className="px-2 py-3.5 font-bold text-vehicsim-decision whitespace-nowrap">
                          {formatMeasurement(t.rms_jerk_mps3, "m/s³", 3, true)}
                        </td>
                        <td className="px-2 py-3.5 font-bold text-vehicsim-danger whitespace-nowrap">
                          {formatMeasurement(t.impact_speed_mps, "m/s", 3, true)}
                        </td>
                        <td className="px-2 py-3.5 font-bold text-vehicsim-ink whitespace-nowrap">
                          {formatMeasurement(t.stopping_distance_m, "m", 2, true)}
                        </td>
                        <td className="w-[160px] px-2 py-3.5 text-center whitespace-nowrap">
                          <TrialSelectAction trial={t} selections={trialSelections} selecting={selectingTrialId} canWrite={canWrite} onSelect={handleSelectCandidate} disabled={!isFeasibleTrial(t)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-3 pb-3 text-xs text-vehicsim-muted">Tham số được làm tròn khi hiển thị; giá trị đầy đủ dùng để chọn ứng viên.</p>
              </div>
            )}
            {paretoPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line px-5 py-3.5">
                <span className="text-[12px] font-medium text-vehicsim-muted">
                  Hiển thị {(safeParetoPage - 1) * PARETO_PAGE_SIZE + 1}–{Math.min(safeParetoPage * PARETO_PAGE_SIZE, paretoTrials?.length ?? 0)} trên {paretoTrials?.length ?? 0} phương án tối ưu
                </span>
                <Pagination page={safeParetoPage} pages={paretoPages} onPage={setParetoPage} />
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

            {allTrials === null ? <p role="status" className="p-5">{error ? "Chưa tải được lượt thử." : runs?.length === 0 ? "Chưa có đợt tối ưu." : "Đang tải lượt thử…"}</p> : filteredTrials.length === 0 ? (
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
                          {formatMetric(t.acquisition_value, 4)}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-vehicsim-decision">
                          {formatMeasurement(t.rms_jerk_mps3, "m/s³", 3, true)}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-vehicsim-danger">
                          {formatMeasurement(t.impact_speed_mps, "m/s", 3, true)}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-vehicsim-ink">
                          {formatMeasurement(t.stopping_distance_m, "m", 2, true)}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <Tag tone={!hasCompleteTrialEvidence(t) ? "neutral" : t.constraint_violated ? "danger" : "ok"}>
                            {!hasCompleteTrialEvidence(t) ? "Chưa đánh giá" : t.constraint_violated ? "Vi phạm" : "Hợp lệ"}
                          </Tag>
                        </td>
                        <td className="w-[100px] px-4 py-3.5 text-center whitespace-nowrap">
                          {t.is_pareto_optimal && isFeasibleTrial(t) ? (
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
                  Hiển thị {(safeTrialsPage - 1) * TRIALS_PAGE_SIZE + 1}–{Math.min(safeTrialsPage * TRIALS_PAGE_SIZE, filteredTrials.length)} trên {filteredTrials.length} lượt thử
                </span>
                <Pagination page={safeTrialsPage} pages={trialsPages} onPage={setTrialsPage} />
              </div>
            )}

            {/* Ghi chú giải thích điểm tiềm năng qEHVI */}
            <div className="border-t border-solid border-vehicsim-line px-5 py-3 text-[12px] leading-relaxed text-vehicsim-muted bg-vehicsim-soft/30">
              <strong className="font-bold text-vehicsim-ink">Điểm tiềm năng (qEHVI):</strong>{" "}
              Hệ thống dự đoán xem bộ tham số này có cơ hội cho kết quả tốt hơn các lượt trước hay không, điểm càng cao càng đáng thử. Các lượt chạy ngẫu nhiên lúc đầu không tính điểm này nên sẽ chưa có số.
            </div>
          </div>
        )}

        {/* TAB 3: LỊCH SỬ CÁC ĐỢT CHẠY */}
        {activeTab === "runs" && (
          <div className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
            {runs === null && <p role="status" className="p-5">{error ? "Chưa tải được đợt tối ưu." : "Đang tải đợt tối ưu…"}</p>}
            {runs?.length === 0 && <EmptyState title="Chưa có đợt tối ưu">Khởi tạo đợt mới để bắt đầu.</EmptyState>}
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
                            {RUN_STATUS_LABEL[r.status] ?? r.status}
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
                                openTab("pareto", r.id);
                                setParetoPage(1);
                                setError(null);
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
                                openTab("trials", r.id);
                                setTrialsPage(1);
                                setError(null);
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
                  Hiển thị {(safeRunsPage - 1) * RUNS_PAGE_SIZE + 1}–{Math.min(safeRunsPage * RUNS_PAGE_SIZE, runs?.length ?? 0)} trên {runs?.length ?? 0} đợt chạy
                </span>
                <Pagination page={safeRunsPage} pages={runsPages} onPage={setRunsPage} />
              </div>
            )}
          </div>
        )}
      </section>
    </VehicSimPage>
  );
}
