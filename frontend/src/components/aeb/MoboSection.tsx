"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton, Tag, cx, fmt } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { OptimizationRun, OptimizationTrial } from "@/types/vehicsim";
import { VehicSimSelect } from "@/components/VehicSimSelect";

export function MoboSection({
  canWrite,
  baselineId,
  initialScenarioId,
  onCandidateSelected,
}: {
  canWrite: boolean;
  baselineId: number | null;
  initialScenarioId?: number;
  onCandidateSelected: (candidateId: number, label: string) => void;
}) {
  const { ctx } = useVehicSimContext();
  const [runs, setRuns] = useState<OptimizationRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [activeRun, setActiveRun] = useState<OptimizationRun | null>(null);
  const [trials, setTrials] = useState<OptimizationTrial[] | null>(null);
  const [paretoTrials, setParetoTrials] = useState<OptimizationTrial[] | null>(null);

  // Form state
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | "">(initialScenarioId ?? "");
  const scenarioId =
    selectedScenarioId !== ""
      ? selectedScenarioId
      : initialScenarioId && ctx?.families?.some((f) => f.id === initialScenarioId)
      ? initialScenarioId
      : ctx?.families?.[0]?.id ?? "";

  const [name, setName] = useState("");
  const [maxTrials, setMaxTrials] = useState(10);
  const [nInitialPoints, setNInitialPoints] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [selectingTrialId, setSelectingTrialId] = useState<number | null>(null);
  const [selectionResult, setSelectionResult] = useState<{ regressionTestId: number; trialId: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tải danh sách đợt tối ưu
  const loadRuns = useCallback(() => {
    vehicsimApi
      .optimizationRuns()
      .then((data) => {
        setRuns(data);
        setSelectedRunId((cur) => cur ?? (data.length > 0 ? data[0].id : null));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách đợt tối ưu"));
  }, []);

  useEffect(loadRuns, [loadRuns]);

  // Tải chi tiết và danh sách trials của run đang chọn
  const loadActiveRunDetails = useCallback((runId: number) => {
    Promise.all([
      vehicsimApi.optimizationRun(runId),
      vehicsimApi.optimizationTrials(runId),
      vehicsimApi.optimizationPareto(runId),
    ])
      .then(([r, allTrials, pTrials]) => {
        setActiveRun(r);
        setTrials(allTrials);
        setParetoTrials(pTrials);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được chi tiết đợt tối ưu"));
  }, []);

  useEffect(() => {
    if (selectedRunId !== null) {
      loadActiveRunDetails(selectedRunId);
    }
  }, [selectedRunId, loadActiveRunDetails]);

  // Polling tự động mỗi 2.5 giây khi run đang RUNNING
  useEffect(() => {
    if (!activeRun || activeRun.status !== "RUNNING") return;
    const interval = setInterval(() => {
      loadActiveRunDetails(activeRun.id);
      loadRuns();
    }, 2500);
    return () => clearInterval(interval);
  }, [activeRun, loadActiveRunDetails, loadRuns]);

  // Khởi động run mới
  const handleStartOptimization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scenarioId) {
      setError("Vui lòng chọn kịch bản kiểm thử");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSelectionResult(null);
    try {
      const res = await vehicsimApi.createOptimization({
        scenario_id: Number(scenarioId),
        base_aeb_version_id: baselineId ?? undefined,
        name: name.trim() || undefined,
        max_trials: maxTrials,
        n_initial_points: nInitialPoints,
      });
      setName("");
      await loadRuns();
      setSelectedRunId(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể khởi động đợt tối ưu");
    } finally {
      setSubmitting(false);
    }
  };

  // Huỷ run đang chạy
  const handleCancelRun = async (runId: number) => {
    setCancelling(true);
    try {
      await vehicsimApi.cancelOptimization(runId);
      await loadActiveRunDetails(runId);
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể huỷ đợt tối ưu");
    } finally {
      setCancelling(false);
    }
  };

  // Chọn ứng viên Pareto chuyển sang kiểm thử hồi quy
  const handleSelectCandidate = async (trialId: number) => {
    if (!activeRun) return;
    setSelectingTrialId(trialId);
    setError(null);
    try {
      const res = await vehicsimApi.selectOptimizationCandidate(activeRun.id, trialId);
      setSelectionResult({
        regressionTestId: res.regression_test_id,
        trialId,
      });
      onCandidateSelected(res.candidate_aeb_version_id, `Phương án #${trialId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể chọn ứng viên");
    } finally {
      setSelectingTrialId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ErrorNote message={error} />

      {/* Thông báo chọn ứng viên thành công */}
      {selectionResult && (
        <div className="flex items-center justify-between gap-4 rounded-[16px] bg-vehicsim-ok-bg p-4 text-[13px] text-vehicsim-ok shadow-sm">
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-vehicsim-ok" />
            <span>
              Đã tạo ứng viên AEB từ <strong>Phương án #{selectionResult.trialId}</strong> và tự động lập bài kiểm thử hồi quy{" "}
              <strong>#{selectionResult.regressionTestId}</strong>.
            </span>
          </div>
          <PillButton
            variant="dark"
            className="px-4 py-2 text-[12px]"
            href={`/validation/regression/${selectionResult.regressionTestId}`}
          >
            Mở bài kiểm thử hồi quy
          </PillButton>
        </div>
      )}

      {/* Form khởi tạo đợt tối ưu mới */}
      <section className="flex flex-col gap-5 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-[17px] font-bold text-vehicsim-ink">Khởi tạo đợt tối ưu hoá AEB (MOBO)</h2>
            <p className="text-[12px] text-vehicsim-muted">
              Thuật toán Bayesian đa mục tiêu sử dụng mô hình thay thế Gaussian Process và hàm thu thập qEHVI để dò tìm bộ tham số Pareto tối ưu.
            </p>
          </div>
          <span className="rounded-full bg-vehicsim-soft px-3 py-[6px] text-[12px] font-semibold text-vehicsim-ink">
            4 Tham số · 3 Mục tiêu
          </span>
        </div>

        <form onSubmit={handleStartOptimization} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="select-mobo-scenario" className="text-[13px] font-medium text-vehicsim-muted">Kịch bản kiểm thử</label>
              <VehicSimSelect
                id="select-mobo-scenario"
                aria-label="Kịch bản kiểm thử"
                value={scenarioId}
                onChange={(val) => setSelectedScenarioId(val ? Number(val) : "")}
                options={(ctx?.families ?? []).map((f) => ({
                  value: f.id,
                  label: `${f.code} · ${f.name}`,
                }))}
                placeholder="Chọn kịch bản…"
                buttonClassName="h-[42px]"
              />
            </div>

            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-vehicsim-muted">Tên đợt chạy</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="vd. MOBO CP_CROSSING đợt 1"
                className="h-[42px] rounded-[12px] border border-solid border-vehicsim-line-strong px-[14px] text-[14px] text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
              />
            </label>

            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-vehicsim-muted">Số lượt thử nghiệm tối đa</span>
              <input
                type="number"
                min={3}
                max={50}
                value={maxTrials}
                onChange={(e) => setMaxTrials(Number(e.target.value))}
                className="h-[42px] rounded-[12px] border border-solid border-vehicsim-line-strong px-[14px] text-[14px] text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
              />
            </label>

            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-vehicsim-muted">Số điểm khởi tạo ban đầu</span>
              <input
                type="number"
                min={2}
                max={15}
                value={nInitialPoints}
                onChange={(e) => setNInitialPoints(Number(e.target.value))}
                className="h-[42px] rounded-[12px] border border-solid border-vehicsim-line-strong px-[14px] text-[14px] text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
              />
            </label>
          </div>

          {/* Không gian tham số và Mục tiêu thu thập */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-[16px] border border-solid border-vehicsim-line bg-vehicsim-soft/50 p-4">
              <span className="text-[12px] font-bold uppercase tracking-wider text-vehicsim-muted">
                Không gian tham số tìm kiếm (Search Space)
              </span>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-[10px] bg-vehicsim-surface p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink">TTC_THRESHOLD:</span> 0.5s – 3.5s
                </div>
                <div className="rounded-[10px] bg-vehicsim-surface p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink">ACTIVATION_DELAY:</span> 0.05s – 0.45s
                </div>
                <div className="rounded-[10px] bg-vehicsim-surface p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink">BUILDUP_RATE:</span> 5.0 – 20.0 m/s³
                </div>
                <div className="rounded-[10px] bg-vehicsim-surface p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink">MAX_DECELERATION:</span> 5.0 – 10.0 m/s²
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-[16px] border border-solid border-vehicsim-line bg-vehicsim-soft/50 p-4">
              <span className="text-[12px] font-bold uppercase tracking-wider text-vehicsim-muted">
                3 Mục tiêu tối ưu hoá đồng thời (Cực tiểu hoá)
              </span>
              <div className="grid grid-cols-3 gap-2 text-[12px]">
                <div className="rounded-[10px] bg-vehicsim-surface p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink block">Độ êm ái:</span>
                  RMS Jerk (m/s³)
                </div>
                <div className="rounded-[10px] bg-vehicsim-surface p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink block">Giảm chấn:</span>
                  Tốc độ va chạm (m/s)
                </div>
                <div className="rounded-[10px] bg-vehicsim-surface p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink block">Hiệu năng:</span>
                  Quãng phanh dừng (m)
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-solid border-vehicsim-line pt-4">
            <span className="text-[12px] text-vehicsim-faint">
              Mỗi lượt thử sẽ tự động khởi chạy kịch bản OpenSCENARIO trên bộ mô phỏng CARLA để thu thập dữ liệu cảm biến và cập nhật biên Pareto.
            </span>
            <PillButton variant="dark" type="submit" disabled={submitting || !canWrite || !scenarioId}>
              {submitting ? "Đang khởi tạo…" : "Bắt đầu tối ưu MOBO"}
            </PillButton>
          </div>
        </form>
      </section>

      {/* Lịch sử các đợt chạy MOBO */}
      <section className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-[15px] font-bold text-vehicsim-ink">
            {runs ? `${runs.length} đợt tối ưu hoá` : "Đang tải danh sách đợt tối ưu…"}
          </span>
        </div>

        <div className="flex h-11 items-center border-y border-solid border-slate-700 bg-slate-800 px-5 text-[12.5px] font-black uppercase tracking-wider text-white">
          <span className="w-[80px]">Mã run</span>
          <span className="w-[220px]">Tên đợt chạy</span>
          <span className="w-[120px]">Trạng thái</span>
          <span className="w-[140px]">Tiến độ thử nghiệm</span>
          <span className="w-[120px]">Nghiệm Pareto</span>
          <span className="w-[120px]">Thời gian</span>
          <span className="min-w-0 flex-1 text-right pr-2">Thao tác</span>
        </div>

        {runs?.length === 0 && (
          <div className="p-8 text-center text-[13px] text-vehicsim-muted">
            Chưa có đợt tối ưu hoá nào. Hãy điền form phía trên và bấm &quot;Bắt đầu tối ưu MOBO&quot;.
          </div>
        )}

        {runs?.map((r) => {
          const isSelected = r.id === selectedRunId;
          const isRunning = ["PENDING", "RUNNING"].includes(r.status);
          return (
            <div
              key={r.id}
              onClick={() => setSelectedRunId(r.id)}
              className={cx(
                "flex min-h-[56px] cursor-pointer items-center border-b border-solid border-vehicsim-line px-5 py-2 transition hover:bg-vehicsim-soft/60",
                isSelected && "bg-vehicsim-row ring-1 ring-inset ring-vehicsim-line-strong",
              )}
            >
              <span className="w-[80px] font-mono text-[13px] font-bold text-vehicsim-ink">#{r.id}</span>
              <span className="w-[220px] truncate text-[13px] font-semibold text-vehicsim-ink">{r.name}</span>
              <span className="w-[120px]">
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
                  {r.status === "PENDING" ? "Đang chờ" : r.status === "RUNNING" ? "Đang chạy" : r.status === "COMPLETED" ? "Hoàn thành" : r.status === "CANCELLED" ? "Đã huỷ" : r.status}
                </Tag>
              </span>
              <span className="w-[140px] text-[13px] font-medium text-vehicsim-ink">
                {r.completed_trials} / {r.max_trials} lượt
              </span>
              <span className="w-[120px]">
                <span className="inline-flex items-center rounded-full bg-vehicsim-decision-bg px-2.5 py-1 text-[11px] font-bold text-vehicsim-decision">
                  {r.pareto_count} nghiệm
                </span>
              </span>
              <span className="w-[120px] text-[12px] text-vehicsim-faint">{fmt.date(r.started_at)}</span>
              <span className="flex min-w-0 flex-1 justify-end items-center gap-2">
                {isRunning && canWrite && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelRun(r.id);
                    }}
                    disabled={cancelling}
                    className="inline-flex h-8 items-center justify-center rounded-full border border-solid border-vehicsim-danger px-3 text-[11px] font-bold text-vehicsim-danger hover:bg-vehicsim-danger-bg transition"
                  >
                    Dừng đợt chạy
                  </button>
                )}
                <span className={cx(
                  "inline-flex h-8 items-center justify-center rounded-full px-3 text-[12px] font-bold transition shadow-sm",
                  isSelected
                    ? "bg-vehicsim-primary text-white"
                    : "border border-solid border-vehicsim-line-strong bg-vehicsim-surface text-vehicsim-decision hover:border-vehicsim-decision hover:bg-vehicsim-decision hover:text-white"
                )}>
                  {isSelected ? "Đang xem" : "Chi tiết"}
                </span>
              </span>
            </div>
          );
        })}
      </section>

      {/* Chi tiết đợt chạy đang chọn */}
      {activeRun && (
        <section className="flex flex-col gap-6 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6">
          <div className="flex flex-col gap-2 border-b border-solid border-vehicsim-line pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[18px] font-extrabold text-vehicsim-ink">Run #{activeRun.id}</span>
                <h3 className="text-[17px] font-bold text-vehicsim-ink">{activeRun.name}</h3>
                <Tag tone={activeRun.status === "RUNNING" ? "info" : activeRun.status === "COMPLETED" ? "ok" : "neutral"}>
                  {activeRun.status}
                </Tag>
              </div>

              {activeRun.status === "RUNNING" && (
                <div className="flex items-center gap-2 text-[12px] font-semibold text-vehicsim-decision">
                  <span className="size-2 animate-ping rounded-full bg-vehicsim-decision" />
                  Đang tiến hành mô phỏng và cập nhật kết quả…
                </div>
              )}
            </div>

            {/* Thanh tiến độ */}
            <div className="mt-2 flex flex-col gap-1">
              <div className="flex justify-between text-[12px] text-vehicsim-muted">
                <span>Tiến độ thử nghiệm</span>
                <span className="font-bold text-vehicsim-ink">
                  {activeRun.completed_trials} / {activeRun.max_trials} lượt thử (
                  {Math.round((activeRun.completed_trials / (activeRun.max_trials || 1)) * 100)}%)
                </span>
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
          </div>

          {/* Tập nghiệm Pareto-optimal */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-[15px] font-bold text-vehicsim-ink">Tập nghiệm tối ưu Pareto (Pareto Front)</h4>
                <span className="rounded-full bg-vehicsim-ok-bg px-2.5 py-0.5 text-[11px] font-bold text-vehicsim-ok">
                  {paretoTrials?.length ?? 0} phương án không bị thống trị
                </span>
              </div>
              <span className="text-[12px] text-vehicsim-muted">
                Chọn một ứng viên để đưa sang bước Kiểm thử hồi quy (Regression Test).
              </span>
            </div>

            <div className="overflow-x-auto rounded-[14px] border border-solid border-vehicsim-line">
              <table className="w-full min-w-[960px] text-left text-[13px]">
                <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12.5px] font-black uppercase tracking-wider text-white">
                  <tr className="h-12">
                    <th className="px-4 py-3">Lượt thử</th>
                    <th className="px-4 py-3">TTC Threshold (s)</th>
                    <th className="px-4 py-3">Brake Activation Delay (s)</th>
                    <th className="px-4 py-3">Brake Build-up Rate (m/s³)</th>
                    <th className="px-4 py-3">Max Deceleration (m/s²)</th>
                    <th className="px-4 py-3 text-vehicsim-decision">RMS Jerk (m/s³)</th>
                    <th className="px-4 py-3 text-vehicsim-danger">Tốc độ va chạm</th>
                    <th className="px-4 py-3 text-vehicsim-ink">Quãng phanh (m)</th>
                    <th className="px-4 py-3 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                  {paretoTrials?.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-vehicsim-muted">
                        Chưa tìm thấy nghiệm Pareto hợp lệ hoặc đang trong giai đoạn khởi tạo ban đầu.
                      </td>
                    </tr>
                  ) : (
                    paretoTrials?.map((t) => (
                      <tr key={t.id} className="hover:bg-vehicsim-row">
                        <td className="px-4 py-3 font-mono font-bold text-vehicsim-ink">#{t.trial_number}</td>
                        <td className="px-4 py-3">{t.parameters?.TTC_THRESHOLD ?? "—"}</td>
                        <td className="px-4 py-3">{t.parameters?.BRAKE_ACTIVATION_DELAY ?? "—"}</td>
                        <td className="px-4 py-3">{t.parameters?.BRAKE_BUILDUP_RATE ?? "—"}</td>
                        <td className="px-4 py-3">{t.parameters?.MAX_DECELERATION ?? "—"}</td>
                        <td className="px-4 py-3 font-semibold text-vehicsim-decision">
                          {t.rms_jerk_mps3 !== null ? `${t.rms_jerk_mps3.toFixed(2)} m/s³` : "—"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-vehicsim-danger">
                          {t.impact_speed_mps !== null
                            ? t.impact_speed_mps <= 0.001
                              ? "0.0 km/h (Không va chạm)"
                              : `${(t.impact_speed_mps * 3.6).toFixed(1)} km/h`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-vehicsim-ink">
                          {t.stopping_distance_m !== null ? `${t.stopping_distance_m.toFixed(2)} m` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={selectingTrialId !== null || !canWrite}
                            onClick={() => handleSelectCandidate(t.id)}
                            className="inline-flex h-8 items-center justify-center rounded-lg bg-vehicsim-primary px-4 text-[12px] font-bold text-white transition hover:bg-vehicsim-primary-hover disabled:opacity-40"
                          >
                            {selectingTrialId === t.id ? "Đang chọn…" : "Chọn ứng viên"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lịch sử tất cả các Trials */}
          <div className="flex flex-col gap-3 pt-2">
            <h4 className="text-[15px] font-bold text-vehicsim-ink">Lịch sử toàn bộ {trials?.length ?? 0} lượt thử nghiệm</h4>
            <div className="max-h-[320px] overflow-y-auto rounded-[14px] border border-solid border-vehicsim-line">
              <table className="w-full min-w-[760px] text-left text-[12px]">
                <thead className="sticky top-0 border-b border-solid border-slate-700 bg-slate-800 text-[12px] font-black uppercase tracking-wider text-white">
                  <tr className="h-10">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Nguồn sinh</th>
                    <th className="px-3 py-2">qEHVI Acq</th>
                    <th className="px-3 py-2">RMS Jerk</th>
                    <th className="px-3 py-2">Va chạm (km/h)</th>
                    <th className="px-3 py-2">Quãng phanh</th>
                    <th className="px-3 py-2">Ràng buộc</th>
                    <th className="px-3 py-2 text-right">Biên Pareto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                  {trials?.map((t) => (
                    <tr key={t.id} className={cx(t.is_pareto_optimal && "bg-vehicsim-ok-bg/30")}>
                      <td className="px-3 py-2 font-mono font-bold text-vehicsim-ink">{t.trial_number}</td>
                      <td className="px-3 py-2">
                        <Tag tone={["INITIAL_DESIGN", "SOBOL_INIT"].includes(t.sampling_source) ? "neutral" : "info"}>
                          {["INITIAL_DESIGN", "SOBOL_INIT"].includes(t.sampling_source) ? "Khởi tạo ban đầu" : "qEHVI Bayes"}
                        </Tag>
                      </td>
                      <td className="px-3 py-2 font-mono text-vehicsim-muted">
                        {t.acquisition_value !== null ? t.acquisition_value.toFixed(4) : "—"}
                      </td>
                      <td className="px-3 py-2">{t.rms_jerk_mps3 !== null ? t.rms_jerk_mps3.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2">
                        {t.impact_speed_mps !== null ? (t.impact_speed_mps * 3.6).toFixed(1) : "—"}
                      </td>
                      <td className="px-3 py-2">{t.stopping_distance_m !== null ? t.stopping_distance_m.toFixed(1) : "—"}</td>
                      <td className="px-3 py-2">
                        {t.constraint_violated ? (
                          <span className="text-vehicsim-danger font-semibold">Vi phạm</span>
                        ) : (
                          <span className="text-vehicsim-ok font-semibold">Hợp lệ</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {t.is_pareto_optimal ? (
                          <span className="rounded-full bg-vehicsim-ok-bg px-2 py-0.5 text-[10px] font-bold text-vehicsim-ok">
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
          </div>
        </section>
      )}
    </div>
  );
}
