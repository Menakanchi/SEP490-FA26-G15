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
import { AebNav } from "@/components/aeb/AebNav";

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

  // Sub-tabs: "pareto" | "trials" | "runs"
  const [activeTab, setActiveTab] = useState<"pareto" | "trials" | "runs">(
    queryTab === "trials" ? "trials" : queryTab === "runs" ? "runs" : "pareto"
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
        label: `Trial #${trialId}`,
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
      <AebNav active="mobo" />

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

      {/* BỘ CHỌN ĐỢT CHẠY & TIẾN TRÌNH REAL-TIME */}
      <section className="flex flex-col gap-4 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-solid border-vehicsim-line pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[13px] font-bold text-vehicsim-ink">Đợt tối ưu hoá:</label>
            <select
              aria-label="Chọn đợt tối ưu hoá"
              value={selectedRunId ?? ""}
              onChange={(e) => {
                const newId = Number(e.target.value);
                setSelectedRunId(newId);
                router.replace(`/aeb/mobo?run_id=${newId}`);
              }}
              className="h-10 min-w-[260px] rounded-xl border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-3 text-[13.5px] font-bold text-vehicsim-ink shadow-xs"
            >
              {(runs ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  Run #{r.id} · {r.name} ({r.pareto_count} nghiệm Pareto) — {r.status}
                </option>
              ))}
            </select>
          </div>

          {activeRun && (
            <div className="flex items-center gap-3">
              <Tag
                tone={
                  activeRun.status === "COMPLETED"
                    ? "ok"
                    : activeRun.status === "RUNNING"
                    ? "info"
                    : activeRun.status === "FAILED"
                    ? "danger"
                    : "neutral"
                }
              >
                {activeRun.status === "RUNNING"
                  ? "Đang chạy mô phỏng"
                  : activeRun.status === "COMPLETED"
                  ? "Hoàn thành"
                  : activeRun.status === "CANCELLED"
                  ? "Đã huỷ"
                  : activeRun.status}
              </Tag>
              {activeRun.status === "RUNNING" && canWrite && (
                <button
                  type="button"
                  onClick={() => handleCancelRun(activeRun.id)}
                  disabled={cancelling}
                  className="rounded-full border border-solid border-vehicsim-danger px-3 py-1 text-[11px] font-bold text-vehicsim-danger hover:bg-vehicsim-danger-bg transition"
                >
                  {cancelling ? "Đang dừng…" : "Dừng đợt chạy"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Thanh tiến trình & chỉ số nhanh */}
        {activeRun && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-vehicsim-ink">Tiến độ chạy:</span>
                <span className="font-mono font-bold text-vehicsim-primary">
                  {activeRun.completed_trials} / {activeRun.max_trials} trials
                </span>
                <span className="text-vehicsim-muted">
                  ({Math.round((activeRun.completed_trials / (activeRun.max_trials || 1)) * 100)}%)
                </span>
                {activeRun.status === "RUNNING" && (
                  <span className="flex items-center gap-1.5 text-vehicsim-decision font-medium">
                    <span className="size-2 animate-ping rounded-full bg-vehicsim-decision" />
                    Đang giải thuật qEHVI ({activeRun.simulator_version?.startsWith("carla-") ? "Mô phỏng CARLA 3D" : "Mô phỏng Kinematic"})
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-vehicsim-muted">
                <span className="inline-flex items-center gap-1 rounded-full bg-vehicsim-soft px-2.5 py-0.5 text-[11px] font-bold text-vehicsim-ink border border-vehicsim-line">
                  {activeRun.simulator_version?.startsWith("carla-") ? "CARLA 3D" : "Kinematic"}
                </span>
                <span>·</span>
                <span>
                  Bắt đầu: <strong>{fmt.date(activeRun.started_at)}</strong>
                </span>
                <span>·</span>
                <span>
                  Nghiệm Pareto: <strong>{activeRun.pareto_count}</strong>
                </span>
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-vehicsim-soft">
              <div
                className="h-full bg-vehicsim-primary transition-all duration-300"
                style={{
                  width: `${Math.min(100, (activeRun.completed_trials / (activeRun.max_trials || 1)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </section>

      {/* CỤM TABS CON NỘI BỘ (PARETO / TRIALS / LỊCH SỬ RUNS) */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-solid border-vehicsim-line pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("pareto")}
            className={cx(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold transition",
              activeTab === "pareto"
                ? "bg-vehicsim-primary text-white shadow-xs"
                : "text-vehicsim-muted hover:bg-vehicsim-soft hover:text-vehicsim-ink"
            )}
          >
            <TrendingUp className="size-4" />
            <span>Tập nghiệm Pareto Frontier ({paretoTrials?.length ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("trials")}
            className={cx(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold transition",
              activeTab === "trials"
                ? "bg-vehicsim-primary text-white shadow-xs"
                : "text-vehicsim-muted hover:bg-vehicsim-soft hover:text-vehicsim-ink"
            )}
          >
            <ListFilter className="size-4" />
            <span>Nhật ký toàn bộ Trials ({allTrials?.length ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("runs")}
            className={cx(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold transition",
              activeTab === "runs"
                ? "bg-vehicsim-primary text-white shadow-xs"
                : "text-vehicsim-muted hover:bg-vehicsim-soft hover:text-vehicsim-ink"
            )}
          >
            <Clock className="size-4" />
            <span>Lịch sử các đợt chạy ({runs?.length ?? 0})</span>
          </button>
        </div>

        {/* TAB 1: TẬP NGHIỆM PARETO */}
        {activeTab === "pareto" && (
          <div className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line px-5 py-4">
              <div>
                <h3 className="text-[15px] font-bold text-vehicsim-ink">
                  Biên Pareto Frontier ({paretoTrials?.length ?? 0} phương án tối ưu)
                </h3>
                <p className="text-[12px] text-vehicsim-muted">
                  Các bộ tham số không bị thống trị trên cả 3 tiêu chí: RMS Jerk, tốc độ va chạm và quãng phanh. Bấm &quot;Chọn làm ứng viên&quot; để đối chiếu ở Bước 5.
                </p>
              </div>
            </div>

            {paretoTrials?.length === 0 ? (
              <div className="p-10">
                <EmptyState title="Chưa có nghiệm Pareto cho đợt chạy này">
                  {activeRun?.status === "COMPLETED"
                    ? "Đợt chạy đã hoàn thành nhưng tất cả các trial đều vi phạm ràng buộc an toàn (tỉ lệ va chạm cao hơn hoặc phanh oan tăng quá 5% so với bản cơ sở). Bạn có thể xem chi tiết từng trial ở tab 'Nhật ký toàn bộ Trials'."
                    : "Đợt chạy đang trong giai đoạn khởi tạo ban đầu hoặc đang mô phỏng các trial."}
                </EmptyState>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-[13px]">
                  <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12.5px] font-black uppercase tracking-wider text-white">
                    <tr className="h-12">
                      <th className="w-12 px-3 py-3.5 text-center font-bold">STT</th>
                      <th className="px-4 py-3.5">Trial #</th>
                      <th className="px-4 py-3.5">TTC (s)</th>
                      <th className="px-4 py-3.5">Trễ phanh (s)</th>
                      <th className="px-4 py-3.5">Tăng áp (m/s³)</th>
                      <th className="px-4 py-3.5">Gia tốc (m/s²)</th>
                      <th className="px-4 py-3.5 text-emerald-300">RMS Jerk</th>
                      <th className="px-4 py-3.5 text-rose-300">Tốc độ va chạm</th>
                      <th className="px-4 py-3.5 text-slate-200">Quãng phanh</th>
                      <th className="px-4 py-3.5 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                    {pagedPareto.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-vehicsim-row transition-colors">
                        <td className="w-12 px-3 py-3.5 text-center text-[12px] font-bold text-vehicsim-faint tabular-nums">
                          {(paretoPage - 1) * PARETO_PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-4 py-3.5 font-mono font-bold text-vehicsim-ink">
                          #{t.trial_number}
                        </td>
                        <td className="px-4 py-3.5 font-mono font-medium">{t.parameters?.TTC_THRESHOLD ?? "—"}</td>
                        <td className="px-4 py-3.5 font-mono font-medium">{t.parameters?.BRAKE_ACTIVATION_DELAY ?? "—"}</td>
                        <td className="px-4 py-3.5 font-mono font-medium">{t.parameters?.BRAKE_BUILDUP_RATE ?? "—"}</td>
                        <td className="px-4 py-3.5 font-mono font-medium">{t.parameters?.MAX_DECELERATION ?? "—"}</td>
                        <td className="px-4 py-3.5 font-bold text-vehicsim-decision">
                          {t.rms_jerk_mps3 !== null ? `${t.rms_jerk_mps3.toFixed(2)} m/s³` : "—"}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-vehicsim-danger">
                          {t.impact_speed_mps !== null
                            ? t.impact_speed_mps <= 0.001
                              ? "0.0 km/h (An toàn)"
                              : `${(t.impact_speed_mps * 3.6).toFixed(1)} km/h`
                            : "—"}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-vehicsim-ink">
                          {t.stopping_distance_m !== null ? `${t.stopping_distance_m.toFixed(2)} m` : "—"}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            disabled={selectingTrialId !== null || !canWrite}
                            onClick={() => handleSelectCandidate(t.id)}
                            className="inline-flex h-8 items-center justify-center rounded-lg bg-vehicsim-primary px-3 text-[12px] font-bold text-white transition hover:bg-vehicsim-primary-hover disabled:opacity-40 shadow-xs"
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
                  Hiển thị {(paretoPage - 1) * PARETO_PAGE_SIZE + 1}–{Math.min(paretoPage * PARETO_PAGE_SIZE, paretoTrials?.length ?? 0)} trên {paretoTrials?.length ?? 0} nghiệm Pareto
                </span>
                <Pagination page={paretoPage} pages={paretoPages} onPage={setParetoPage} />
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TOÀN BỘ TRIALS */}
        {activeTab === "trials" && (
          <div className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-bold text-vehicsim-ink">Bộ lọc trials:</span>
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
                        "rounded-lg px-2.5 py-1 text-[12px] font-semibold transition",
                        trialsFilter === mode
                          ? "bg-vehicsim-ink text-white"
                          : "bg-vehicsim-soft text-vehicsim-muted hover:text-vehicsim-ink"
                      )}
                    >
                      {mode === "ALL" ? "Tất cả" : mode === "PARETO" ? "Chỉ Pareto" : "Chỉ hợp lệ"}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-[12px] text-vehicsim-muted">
                Hiển thị {filteredTrials.length} / {allTrials?.length ?? 0} trials
              </span>
            </div>

            {filteredTrials.length === 0 ? (
              <div className="p-10">
                <EmptyState title="Không có trial nào khớp bộ lọc" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-[13px]">
                  <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12.5px] font-black uppercase tracking-wider text-white">
                    <tr className="h-12">
                      <th className="w-12 px-3 py-3.5 text-center font-bold">STT</th>
                      <th className="px-4 py-3.5">Trial #</th>
                      <th className="px-4 py-3.5">Nguồn</th>
                      <th className="px-4 py-3.5 font-mono">qEHVI</th>
                      <th className="px-4 py-3.5 text-emerald-300">RMS Jerk</th>
                      <th className="px-4 py-3.5 text-rose-300">Tốc độ va chạm</th>
                      <th className="px-4 py-3.5 text-slate-200">Quãng phanh</th>
                      <th className="px-4 py-3.5 text-center">Ràng buộc</th>
                      <th className="px-4 py-3.5 text-right">Pareto?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                    {pagedTrials.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-vehicsim-row transition-colors">
                        <td className="w-12 px-3 py-3.5 text-center text-[12px] font-bold text-vehicsim-faint tabular-nums">
                          {(trialsPage - 1) * TRIALS_PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-4 py-3.5 font-mono font-bold text-vehicsim-ink">
                          #{t.trial_number}
                        </td>
                        <td className="px-4 py-3.5">
                          <Tag tone={t.sampling_source === "SOBOL_INIT" ? "neutral" : "info"}>
                            {t.sampling_source === "SOBOL_INIT" ? "Khởi tạo Sobol" : "Bayesian GP"}
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
                        <td className="px-4 py-3.5 text-right">
                          {t.is_pareto_optimal ? (
                            <span className="inline-flex items-center rounded-full bg-vehicsim-ok-bg px-2 py-0.5 text-[11px] font-bold text-vehicsim-ok">
                              ★ Pareto
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
                  Hiển thị {(trialsPage - 1) * TRIALS_PAGE_SIZE + 1}–{Math.min(trialsPage * TRIALS_PAGE_SIZE, filteredTrials.length)} trên {filteredTrials.length} trials
                </span>
                <Pagination page={trialsPage} pages={trialsPages} onPage={setTrialsPage} />
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LỊCH SỬ CÁC ĐỢT CHẠY */}
        {activeTab === "runs" && (
          <div className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line px-5 py-4">
              <h3 className="text-[15px] font-bold text-vehicsim-ink">
                Lịch sử {runs?.length ?? 0} đợt chạy MOBO trong project
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-[13px]">
                <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12.5px] font-black uppercase tracking-wider text-white">
                  <tr className="h-12">
                    <th className="w-12 px-3 py-3.5 text-center font-bold">STT</th>
                    <th className="px-5 py-3.5">Mã run</th>
                    <th className="px-5 py-3.5">Tên đợt chạy</th>
                    <th className="px-5 py-3.5">Bộ mô phỏng</th>
                    <th className="px-5 py-3.5">Trạng thái</th>
                    <th className="px-5 py-3.5">Tiến độ trials</th>
                    <th className="px-5 py-3.5">Nghiệm Pareto</th>
                    <th className="px-5 py-3.5">Thời gian</th>
                    <th className="px-5 py-3.5 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                  {pagedRuns.map((r, idx) => {
                    const isSelected = r.id === selectedRunId;
                    return (
                      <tr
                        key={r.id}
                        className={cx(
                          "hover:bg-vehicsim-soft/60 transition-colors",
                          isSelected && "bg-vehicsim-primary-bg/50"
                        )}
                      >
                        <td className="w-12 px-3 py-4 text-center text-[12px] font-bold text-vehicsim-faint tabular-nums">
                          {(runsPage - 1) * RUNS_PAGE_SIZE + idx + 1}
                        </td>
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
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center rounded-full bg-vehicsim-decision-bg px-2.5 py-0.5 text-[11px] font-bold text-vehicsim-decision">
                            {r.pareto_count} nghiệm
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[12px] text-vehicsim-muted">{fmt.date(r.started_at)}</td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRunId(r.id);
                              setActiveTab("pareto");
                            }}
                            className={cx(
                              "rounded-lg px-3 py-1.5 text-[12px] font-bold transition",
                              isSelected
                                ? "bg-vehicsim-primary text-white"
                                : "bg-vehicsim-soft text-vehicsim-ink hover:bg-vehicsim-line"
                            )}
                          >
                            {isSelected ? "Đang xem" : "Xem đợt này"}
                          </button>
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
