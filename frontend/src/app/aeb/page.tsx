"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import {
  CLASS_STYLE,
  ErrorNote,
  PillButton,
  Tag,
  cx,
  fmt,
  paramValue,
} from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type {
  AebVersion,
  FailureClass,
  OptimizationRun,
  OptimizationTrial,
  ParameterDef,
  VersionBrief,
} from "@/types/vehicsim";

const STATUS_TONE: Record<VersionBrief["status"], "dark" | "info" | "ok" | "danger" | "neutral"> = {
  BASELINE: "dark",
  CANDIDATE: "info",
  ACCEPTED: "ok",
  REJECTED: "danger",
  ARCHIVED: "neutral",
};
const STATUS_LABEL: Record<VersionBrief["status"], string> = {
  BASELINE: "cơ sở",
  CANDIDATE: "ứng viên",
  ACCEPTED: "đã chấp nhận",
  REJECTED: "đã từ chối",
  ARCHIVED: "lưu trữ",
};
const SOURCE_LABEL: Record<string, string> = { MANUAL: "thủ công", OPTIMIZATION: "tối ưu hoá" };

// 4 tham số AEB chỉnh được theo ADR-040
const KEY_PARAMS = ["TTC_THRESHOLD", "BRAKE_ACTIVATION_DELAY", "MAX_DECELERATION", "BRAKE_BUILDUP_RATE"];
const CATEGORY_ORDER: FailureClass[] = ["DECISION", "CONTROL", "VEHICLE_DYNAMICS"];

export default function AebConfigPage() {
  const { ctx, refresh, canWrite } = useVehicSimContext();
  const [activeTab, setActiveTab] = useState<"mobo" | "manual" | "versions">("mobo");
  const [versions, setVersions] = useState<AebVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: number; label: string } | null>(null);

  const load = useCallback(() => {
    vehicsimApi
      .aebVersions()
      .then(setVersions)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách phiên bản AEB"));
  }, []);
  useEffect(load, [load]);

  const catalog = useMemo(() => new Map((ctx?.parameters ?? []).map((p) => [p.code, p])), [ctx]);
  const baseline = versions?.find((v) => v.status === "BASELINE") ?? null;

  return (
    <VehicSimPage
      step={5}
      crumbs={[{ label: "Phanh khẩn cấp" }, { label: "Cấu hình" }]}
      title="Cấu hình & Tối ưu hoá AEB"
      subtitle="Hiệu chỉnh 4 tham số AEB: chạy thuật toán tối ưu đa mục tiêu Bayes (MOBO/qEHVI) hoặc điều chỉnh thủ công, sau đó chuyển sang kiểm thử hồi quy."
    >
      <ErrorNote message={error} />

      {created && (
        <div className="flex items-center justify-between gap-4 rounded-[16px] bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok shadow-sm">
          <span>Đã tạo ứng viên AEB {created.label}. Bước tiếp theo: chạy kiểm thử hồi quy so với bản cơ sở.</span>
          <PillButton variant="dark" className="px-4 py-2 text-[12px]" href={`/validation/regression/new?candidate=${created.id}`}>
            Chạy kiểm thử hồi quy →
          </PillButton>
        </div>
      )}

      {/* Điều hướng chuyển chế độ (Tabs) */}
      <div className="flex items-center gap-2 border-b border-solid border-vehicsim-line pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("mobo")}
          className={cx(
            "flex items-center gap-2 rounded-t-[14px] px-5 py-3 text-[14px] font-bold transition",
            activeTab === "mobo"
              ? "border-b-2 border-vehicsim-ink bg-white text-vehicsim-ink shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              : "text-vehicsim-muted hover:text-vehicsim-ink",
          )}
        >
          <span>Tối ưu hoá tự động (MOBO)</span>
          <span className="rounded-full bg-vehicsim-decision-bg px-2 py-[2px] text-[11px] font-semibold text-vehicsim-decision">
            qEHVI
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("manual")}
          className={cx(
            "flex items-center gap-2 rounded-t-[14px] px-5 py-3 text-[14px] font-bold transition",
            activeTab === "manual"
              ? "border-b-2 border-vehicsim-ink bg-white text-vehicsim-ink shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              : "text-vehicsim-muted hover:text-vehicsim-ink",
          )}
        >
          <span>Tạo ứng viên thủ công</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("versions")}
          className={cx(
            "flex items-center gap-2 rounded-t-[14px] px-5 py-3 text-[14px] font-bold transition",
            activeTab === "versions"
              ? "border-b-2 border-vehicsim-ink bg-white text-vehicsim-ink shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              : "text-vehicsim-muted hover:text-vehicsim-ink",
          )}
        >
          <span>Tất cả phiên bản AEB</span>
          <span className="rounded-full bg-vehicsim-soft px-2 py-[2px] text-[11px] font-semibold text-vehicsim-muted">
            {versions ? versions.length : 0}
          </span>
        </button>
      </div>

      {/* Tab 1: Tối ưu hoá đa mục tiêu Bayes (MOBO) */}
      {activeTab === "mobo" && (
        <MoboOptimizationSection
          canWrite={canWrite}
          baselineId={baseline?.id ?? null}
          onCandidateSelected={async (candId, candLabel) => {
            setCreated({ id: candId, label: candLabel });
            load();
            await refresh();
          }}
        />
      )}

      {/* Tab 2: Tạo ứng viên thủ công */}
      {activeTab === "manual" && (
        <>
          {versions && ctx && canWrite ? (
            <CandidateForm
              versions={versions}
              parameters={ctx.parameters}
              onCreated={async (id, label) => {
                setCreated({ id, label });
                load();
                await refresh();
              }}
            />
          ) : (
            <div className="rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 text-[13px] text-vehicsim-muted shadow-vehicsim-card">
              Bạn chỉ có quyền xem hoặc dữ liệu tham số đang được tải.
            </div>
          )}
        </>
      )}

      {/* Tab 3: Danh sách tất cả phiên bản AEB */}
      {activeTab === "versions" && (
        <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
          <div className="flex items-center px-5 py-4">
            <span className="text-[15px] font-bold text-vehicsim-ink">{versions ? `${versions.length} phiên bản` : "…"}</span>
          </div>
          <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
            <span className="w-[120px]">Phiên bản</span>
            <span className="w-[120px]">Trạng thái</span>
            {KEY_PARAMS.map((code) => (
              <span key={code} className="w-[120px] truncate pr-2">
                {catalog.get(code)?.name ?? code}
              </span>
            ))}
            <span className="min-w-0 flex-1">Ghi chú</span>
            <span className="w-[96px]">Ngày tạo</span>
            <span className="w-[110px]" />
          </div>
          {versions?.map((v) => (
            <div
              key={v.id}
              className={cx(
                "flex min-h-[56px] items-center border-b border-solid border-vehicsim-line px-5 py-2",
                v.status === "BASELINE" && "bg-vehicsim-row",
              )}
            >
              <span className="flex w-[120px] flex-col">
                <span className="text-[13px] font-bold text-vehicsim-ink">AEB {v.label}</span>
                <span className="text-[11px] text-vehicsim-faint">{changedNote(v, baseline)}</span>
              </span>
              <span className="w-[120px]">
                <Tag tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Tag>
              </span>
              {KEY_PARAMS.map((code) => {
                const differs = baseline && v.id !== baseline.id && v.parameters[code] !== baseline.parameters[code];
                return (
                  <span
                    key={code}
                    className={cx("w-[120px] text-[13px]", differs ? "font-bold text-vehicsim-decision" : "text-vehicsim-ink")}
                  >
                    {paramValue(v.parameters[code], catalog.get(code)?.unit ?? "")}
                  </span>
                );
              })}
              <span className="min-w-0 flex-1 truncate pr-3 text-[12px] text-vehicsim-muted">{v.notes ?? "—"}</span>
              <span className="w-[96px] text-[12px] text-vehicsim-faint">{fmt.date(v.created_at)}</span>
              <span className="flex w-[110px] justify-end">
                {v.status === "CANDIDATE" && canWrite && (
                  <Link
                    href={`/validation/regression/new?candidate=${v.id}`}
                    className="text-[12px] font-semibold text-vehicsim-decision hover:underline"
                  >
                    Kiểm thử hồi quy →
                  </Link>
                )}
              </span>
            </div>
          ))}
        </section>
      )}
    </VehicSimPage>
  );
}

// ===========================================================================
// Giao diện Tối ưu hoá AEB đa mục tiêu (MOBO Section)
// ===========================================================================

function MoboOptimizationSection({
  canWrite,
  baselineId,
  onCandidateSelected,
}: {
  canWrite: boolean;
  baselineId: number | null;
  onCandidateSelected: (candidateId: number, label: string) => void;
}) {
  const { ctx } = useVehicSimContext();
  const [runs, setRuns] = useState<OptimizationRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [activeRun, setActiveRun] = useState<OptimizationRun | null>(null);
  const [trials, setTrials] = useState<OptimizationTrial[] | null>(null);
  const [paretoTrials, setParetoTrials] = useState<OptimizationTrial[] | null>(null);

  // Form state
  const [scenarioId, setScenarioId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [maxTrials, setMaxTrials] = useState(10);
  const [nInitialPoints, setNInitialPoints] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [selectingTrialId, setSelectingTrialId] = useState<number | null>(null);
  const [selectionResult, setSelectionResult] = useState<{ regressionTestId: number; trialId: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chọn mặc định kịch bản đầu tiên
  useEffect(() => {
    if (!ctx?.families?.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- giá trị mặc định khi kịch bản tải xong
    setScenarioId((cur) => (cur === "" ? ctx.families[0].id : cur));
  }, [ctx]);

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
      onCandidateSelected(res.candidate_aeb_version_id, `Trial #${trialId}`);
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
              Đã tạo ứng viên AEB từ <strong>Trial #{selectionResult.trialId}</strong> và tự động lập bài kiểm thử hồi quy{" "}
              <strong>#{selectionResult.regressionTestId}</strong>.
            </span>
          </div>
          <PillButton
            variant="dark"
            className="px-4 py-2 text-[12px]"
            href={`/validation/regression/${selectionResult.regressionTestId}`}
          >
            Mở bài kiểm thử hồi quy →
          </PillButton>
        </div>
      )}

      {/* Form khởi tạo đợt tối ưu mới */}
      <section className="flex flex-col gap-5 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 shadow-vehicsim-card">
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
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-vehicsim-muted">Kịch bản kiểm thử</span>
              <select
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value ? Number(e.target.value) : "")}
                className="h-[42px] rounded-[12px] border border-solid border-vehicsim-line-strong bg-white px-[14px] text-[14px] text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
              >
                {(ctx?.families ?? []).length === 0 && <option value="">Chưa có kịch bản</option>}
                {(ctx?.families ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} · {f.name}
                  </option>
                ))}
              </select>
            </label>

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
                <div className="rounded-[10px] bg-white p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink">TTC_THRESHOLD:</span> 0.5s – 3.5s
                </div>
                <div className="rounded-[10px] bg-white p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink">ACTIVATION_DELAY:</span> 0.05s – 0.45s
                </div>
                <div className="rounded-[10px] bg-white p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink">BUILDUP_RATE:</span> 5.0 – 20.0 m/s³
                </div>
                <div className="rounded-[10px] bg-white p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink">MAX_DECELERATION:</span> 5.0 – 10.0 m/s²
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-[16px] border border-solid border-vehicsim-line bg-vehicsim-soft/50 p-4">
              <span className="text-[12px] font-bold uppercase tracking-wider text-vehicsim-muted">
                3 Mục tiêu tối ưu hoá đồng thời (Cực tiểu hoá)
              </span>
              <div className="grid grid-cols-3 gap-2 text-[12px]">
                <div className="rounded-[10px] bg-white p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink block">Độ êm ái:</span>
                  RMS Jerk (m/s³)
                </div>
                <div className="rounded-[10px] bg-white p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink block">Giảm chấn:</span>
                  Tốc độ va chạm (m/s)
                </div>
                <div className="rounded-[10px] bg-white p-2 border border-solid border-vehicsim-line">
                  <span className="font-semibold text-vehicsim-ink block">Hiệu năng:</span>
                  Quãng phanh dừng (m)
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-solid border-vehicsim-line pt-4">
            <span className="text-[12px] text-vehicsim-faint">
              Mỗi trial sẽ tự động chạy bộ mô phỏng động học để chấm điểm 3 hàm mục tiêu và cập nhật biên Pareto.
            </span>
            <PillButton variant="dark" type="submit" disabled={submitting || !canWrite || !scenarioId}>
              {submitting ? "Đang khởi tạo…" : "Bắt đầu tối ưu MOBO"}
            </PillButton>
          </div>
        </form>
      </section>

      {/* Lịch sử các đợt chạy MOBO */}
      <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-[15px] font-bold text-vehicsim-ink">
            {runs ? `${runs.length} đợt tối ưu hoá` : "Đang tải danh sách đợt tối ưu…"}
          </span>
        </div>

        <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
          <span className="w-[80px]">Mã run</span>
          <span className="w-[220px]">Tên đợt chạy</span>
          <span className="w-[120px]">Trạng thái</span>
          <span className="w-[140px]">Tiến độ trials</span>
          <span className="w-[120px]">Nghiệm Pareto</span>
          <span className="w-[120px]">Thời gian</span>
          <span className="min-w-0 flex-1 text-right">Thao tác</span>
        </div>

        {runs?.length === 0 && (
          <div className="p-8 text-center text-[13px] text-vehicsim-muted">
            Chưa có đợt tối ưu hoá nào. Hãy điền form phía trên và bấm &quot;Bắt đầu tối ưu MOBO&quot;.
          </div>
        )}

        {runs?.map((r) => {
          const isSelected = r.id === selectedRunId;
          const isRunning = r.status === "RUNNING";
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
                  {r.status === "RUNNING" ? "Đang chạy" : r.status === "COMPLETED" ? "Hoàn thành" : r.status === "CANCELLED" ? "Đã huỷ" : r.status}
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
              <span className="flex min-w-0 flex-1 justify-end gap-2">
                {isRunning && canWrite && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelRun(r.id);
                    }}
                    disabled={cancelling}
                    className="rounded-full border border-solid border-vehicsim-danger px-3 py-1 text-[11px] font-semibold text-vehicsim-danger hover:bg-vehicsim-danger-bg"
                  >
                    Dừng đợt chạy
                  </button>
                )}
                <span className="text-[12px] font-bold text-vehicsim-decision">
                  {isSelected ? "Đang xem ▼" : "Xem chi tiết →"}
                </span>
              </span>
            </div>
          );
        })}
      </section>

      {/* Chi tiết đợt chạy đang chọn */}
      {activeRun && (
        <section className="flex flex-col gap-6 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 shadow-vehicsim-card">
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
                  {activeRun.completed_trials} / {activeRun.max_trials} trials (
                  {Math.round((activeRun.completed_trials / (activeRun.max_trials || 1)) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-vehicsim-soft">
                <div
                  className="h-full bg-vehicsim-ink transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (activeRun.completed_trials / (activeRun.max_trials || 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Tập nghiệm Pareto-optimal (Các giải pháp tốt nhất) */}
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
              <table className="w-full text-left text-[13px]">
                <thead className="bg-vehicsim-soft text-[11px] font-semibold uppercase text-vehicsim-faint">
                  <tr>
                    <th className="px-4 py-3">Trial #</th>
                    <th className="px-4 py-3">TTC (s)</th>
                    <th className="px-4 py-3">Delay (s)</th>
                    <th className="px-4 py-3">Buildup (m/s³)</th>
                    <th className="px-4 py-3">Decel (m/s²)</th>
                    <th className="px-4 py-3 text-vehicsim-decision">RMS Jerk (m/s³)</th>
                    <th className="px-4 py-3 text-vehicsim-danger">Tốc độ va chạm</th>
                    <th className="px-4 py-3 text-vehicsim-ink">Quãng phanh (m)</th>
                    <th className="px-4 py-3 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-solid divide-vehicsim-line bg-white">
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
                            className="rounded-full bg-vehicsim-ink px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-black/80 disabled:opacity-40"
                          >
                            {selectingTrialId === t.id ? "Đang chọn…" : "Chọn ứng viên này →"}
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
            <h4 className="text-[15px] font-bold text-vehicsim-ink">Lịch sử toàn bộ {trials?.length ?? 0} Trials</h4>
            <div className="max-h-[320px] overflow-y-auto rounded-[14px] border border-solid border-vehicsim-line">
              <table className="w-full text-left text-[12px]">
                <thead className="sticky top-0 bg-vehicsim-soft text-[11px] font-semibold uppercase text-vehicsim-faint">
                  <tr>
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
                <tbody className="divide-y divide-solid divide-vehicsim-line bg-white">
                  {trials?.map((t) => (
                    <tr key={t.id} className={cx(t.is_pareto_optimal && "bg-vehicsim-ok-bg/30")}>
                      <td className="px-3 py-2 font-mono font-bold text-vehicsim-ink">{t.trial_number}</td>
                      <td className="px-3 py-2">
                        <Tag tone={t.sampling_source === "INITIAL_DESIGN" ? "neutral" : "info"}>
                          {t.sampling_source === "INITIAL_DESIGN" ? "Khởi tạo ngẫu nhiên" : "qEHVI Bayes"}
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

// ===========================================================================
// Form tạo ứng viên AEB thủ công (Manual Candidate Form)
// ===========================================================================

function changedNote(v: AebVersion, baseline: AebVersion | null): string {
  if (!baseline || v.id === baseline.id) return SOURCE_LABEL[v.source] ?? v.source;
  const n = Object.keys({ ...v.parameters, ...baseline.parameters }).filter(
    (k) => v.parameters[k] !== baseline.parameters[k],
  ).length;
  return `${n} tham số khác bản cơ sở`;
}

function CandidateForm({
  versions,
  parameters,
  onCreated,
}: {
  versions: AebVersion[];
  parameters: ParameterDef[];
  onCreated: (id: number, label: string) => void;
}) {
  const parents = versions.filter((v) => v.status !== "REJECTED");
  const [parentId, setParentId] = useState<number>(() => (versions.find((v) => v.status === "BASELINE") ?? versions[0]).id);
  const parent = versions.find((v) => v.id === parentId) ?? versions[0];
  const [values, setValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = (p: ParameterDef) => values[p.code] ?? String(parent.parameters[p.code] ?? p.default_value);
  const changed = parameters.filter((p) => Number(current(p)) !== parent.parameters[p.code]);
  const invalid = parameters.filter((p) => {
    const n = Number(current(p));
    return current(p).trim() === "" || Number.isNaN(n) || n < p.min_value || n > p.max_value;
  });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await vehicsimApi.createCandidate({
        parent_version_id: parent.id,
        label: label.trim() || undefined,
        notes: notes.trim() || undefined,
        values: Object.fromEntries(changed.map((p) => [p.code, Number(current(p))])),
      });
      const fresh = await vehicsimApi.aebVersions();
      setValues({});
      setLabel("");
      setNotes("");
      onCreated(res.id, fresh.find((v) => v.id === res.id)?.label ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được ứng viên");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-5 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 shadow-vehicsim-card">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-vehicsim-ink">Cấu hình ứng viên mới</h2>
        <span className="rounded-full bg-vehicsim-soft px-3 py-[6px] text-[12px] font-semibold text-vehicsim-ink">
          {changed.length} tham số đã đổi
        </span>
      </div>
      <ErrorNote message={error} />
      <div className="grid grid-cols-3 gap-4">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[13px] font-medium text-vehicsim-muted">Dựa trên</span>
          <select
            value={parentId}
            onChange={(e) => {
              setParentId(Number(e.target.value));
              setValues({});
            }}
            className="h-[42px] rounded-[12px] border border-solid border-vehicsim-line-strong bg-white px-[14px] text-[14px] text-vehicsim-ink"
          >
            {parents.map((v) => (
              <option key={v.id} value={v.id}>
                AEB {v.label} · {STATUS_LABEL[v.status]}
              </option>
            ))}
          </select>
        </label>
        <Input label="Nhãn (không bắt buộc, mặc định v{n})" value={label} onChange={setLabel} placeholder="vd. v1.1" />
        <Input label="Ghi chú (không bắt buộc)" value={notes} onChange={setNotes} placeholder="vd. phanh sớm hơn khi người đi bộ lao ra" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {CATEGORY_ORDER.map((cat) => {
          const params = parameters.filter((p) => p.category === cat);
          if (!params.length) return null;
          return (
            <div key={cat} className="flex flex-col gap-2 rounded-[16px] border border-solid border-vehicsim-line p-4">
              <span className={cx("w-fit rounded-full px-[10px] py-[4px] text-[11px] font-semibold", CLASS_STYLE[cat].cls)}>
                {CLASS_STYLE[cat].label}
              </span>
              {params.map((p) => {
                const isChanged = changed.includes(p);
                const isInvalid = invalid.includes(p);
                return (
                  <div key={p.code} className="flex items-center gap-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] font-medium text-vehicsim-ink">{p.name}</span>
                      <span className="text-[11px] text-vehicsim-faint">
                        {p.min_value}–{p.max_value} {p.unit === "ratio" ? "" : p.unit} · hiện tại{" "}
                        {paramValue(parent.parameters[p.code], p.unit)}
                      </span>
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={current(p)}
                      aria-label={p.name}
                      onChange={(e) => setValues((prev) => ({ ...prev, [p.code]: e.target.value }))}
                      className={cx(
                        "h-9 w-[110px] rounded-[10px] border border-solid px-3 text-right text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong",
                        isInvalid
                          ? "border-vehicsim-danger text-vehicsim-danger"
                          : isChanged
                          ? "border-vehicsim-decision bg-vehicsim-decision-bg text-vehicsim-decision"
                          : "border-vehicsim-line-strong text-vehicsim-ink",
                      )}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-solid border-vehicsim-line pt-4">
        <p className="text-[12px] text-vehicsim-muted">
          Ứng viên mới chưa ảnh hưởng bản cơ sở cho tới khi qua kiểm thử hồi quy và được kỹ sư chấp nhận.
        </p>
        <PillButton variant="dark" onClick={submit} disabled={busy || changed.length === 0 || invalid.length > 0}>
          {busy ? "Đang tạo…" : "Tạo ứng viên"}
        </PillButton>
      </div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[13px] font-medium text-vehicsim-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-[42px] rounded-[12px] border border-solid border-vehicsim-line-strong px-[14px] text-[14px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
      />
    </label>
  );
}
