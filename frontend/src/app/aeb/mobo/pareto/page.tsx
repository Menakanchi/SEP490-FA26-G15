"use client";

import { TrialSelectAction, useTrialSelections } from "@/components/aeb/TrialSelectAction";
import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, TrendingUp } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { EmptyState, ErrorNote, Pagination, PillButton } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { OptimizationRun, OptimizationTrial } from "@/types/vehicsim";
import { VehicSimSelect } from "@/components/VehicSimSelect";
import { formatMeasurement, formatMetric } from "@/components/analysis/analysisMetricFormat";
import { isFeasibleTrial, RUN_STATUS_LABEL } from "@/components/aeb/optimizationEvidence";
import { vi } from "@/components/vehicsimI18n";

export default function AebMoboParetoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canWrite, refresh } = useVehicSimContext();

  const [runs, setRuns] = useState<OptimizationRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [paretoResult, setParetoResult] = useState<{ runId: number; items: OptimizationTrial[] } | null>(null);
  // Tải trạng thái đã chọn và cập nhật ngay khi chọn thành công.
  const { selections: trialSelections, markSelected } = useTrialSelections(paretoResult);
  const paretoTrials = paretoResult?.runId === selectedRunId ? paretoResult.items.filter(isFeasibleTrial) : null;
  const selectionLock = useRef(false);
  const [selectingTrialId, setSelectingTrialId] = useState<number | null>(null);
  const [candidateResult, setCandidateResult] = useState<{ runId: number; id: number; label: string; regressionTestId?: number } | null>(null);
  const createdCandidate = candidateResult?.runId === selectedRunId ? candidateResult : null;
  const [error, setError] = useState<string | null>(null);

  const queryRunId = Number(searchParams.get("run_id"));
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;
  const paretoCount = paretoTrials?.length ?? 0;
  const pages = Math.max(1, Math.ceil(paretoCount / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pagedPareto = paretoTrials?.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
        .optimizationPareto(selectedRunId)
        .then(items => { if (active) { setParetoResult({ runId: selectedRunId, items }); setError(null); } })
        .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Không tải được tập nghiệm Pareto"); });
    }
    return () => { active = false; };
  }, [selectedRunId]);

  const handleSelectCandidate = async (trialId: number) => {
    if (!selectedRunId || !canWrite || selectionLock.current || !paretoTrials?.some(t => t.id === trialId && isFeasibleTrial(t))) return;
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
      selectionLock.current = false;
      setSelectingTrialId(null);
    }
  };

  const activeRun = runs?.find((r) => r.id === selectedRunId) ?? null;

  return (
    <VehicSimPage
      step={4}
      crumbs={[
        { label: "Cải tiến AEB", href: "/aeb" },
        { label: "Tối ưu MOBO", href: "/aeb/mobo" },
        { label: "Tập nghiệm Pareto" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PillButton href={`/aeb/mobo/trials${selectedRunId ? `?run_id=${selectedRunId}` : ""}`} variant="light">
            Xem toàn bộ lượt thử
          </PillButton>
          <PillButton href="/aeb/candidates" variant="light">
            Xem ứng viên đã chọn
          </PillButton>
        </div>
      }
    >
      <ErrorNote message={error} />

      {createdCandidate && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-vehicsim-ok-bg p-4 text-[13px] text-vehicsim-ok shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 shrink-0" />
            <span className="font-bold">
              Đã tạo ứng viên AEB từ {createdCandidate.label}
              {createdCandidate.regressionTestId ? ` và tạo bài kiểm thử hồi quy #${createdCandidate.regressionTestId}!` : "!"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PillButton variant="light" href="/aeb/candidates" className="text-[12px] py-1.5">
              Xem danh sách ứng viên
            </PillButton>
            <PillButton
              variant="dark"
              href={
                createdCandidate.regressionTestId
                  ? `/validation/regression/${createdCandidate.regressionTestId}`
                  : `/validation/regression/new?candidate=${createdCandidate.id}`
              }
              className="text-[12px] py-1.5"
            >
              {createdCandidate.regressionTestId ? "Xem kiểm thử hồi quy →" : "Kiểm thử hồi quy ngay"}
            </PillButton>
          </div>
        </div>
      )}

      {/* Bộ chọn đợt chạy MOBO */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-5 shadow-sm">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <label className="text-[13px] font-bold text-vehicsim-ink">Chọn đợt tối ưu hoá:</label>
          <VehicSimSelect
            aria-label="Chọn đợt tối ưu hoá"
            value={selectedRunId}
            onChange={(newId) => {
              setSelectedRunId(newId);
              setCandidateResult(null);
              setError(null);
              setPage(1);
              router.replace(`/aeb/mobo/pareto?run_id=${newId}`);
            }}
            options={(runs ?? []).map((r) => ({
              value: r.id,
              label: `Run #${r.id} · ${r.name}`,
              sublabel: `${r.pareto_count} nghiệm Pareto`,
            }))}
            className="min-w-0 max-w-md"
            disabled={selectingTrialId !== null || runs?.length === 0}
          />
        </div>

        {activeRun && (
          <div className="flex items-center gap-3 text-[12px] text-vehicsim-muted">
            <span>
              Trạng thái: <strong>{RUN_STATUS_LABEL[activeRun.status] ?? "Không xác định"}</strong>
            </span>
            <span>·</span>
            <span>
              Tiến độ: <strong>{activeRun.completed_trials}/{activeRun.max_trials} lượt thử</strong>
            </span>
          </div>
        )}
      </section>

      {/* Bảng nghiệm Pareto */}
      <section className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line px-5 py-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-5 text-vehicsim-ok" />
            <h3 className="text-[16px] font-bold text-vehicsim-ink">
              Biên Pareto ({paretoTrials?.length ?? 0} phương án tối ưu)
            </h3>
          </div>
          <span className="text-[12px] text-vehicsim-muted">
            Bấm &quot;Chọn làm ứng viên&quot; để lưu bộ tham số này vào kho ứng viên chờ kiểm định.
          </span>
        </div>

        {runs?.length === 0 ? <div className="p-10"><EmptyState title="Chưa có đợt tối ưu">Tạo đợt tối ưu để xem các phương án Pareto.</EmptyState></div> : paretoTrials === null ? <p role="status" className="p-5 text-[13px] text-vehicsim-muted">{error ? "Chưa tải được nghiệm Pareto." : "Đang tải nghiệm Pareto…"}</p> : paretoTrials.length === 0 ? (
          <div className="p-10">
            <EmptyState title="Chưa có nghiệm Pareto cho đợt chạy này">
              Chưa có phương án hoàn tất với đủ số đo hợp lệ và thỏa ràng buộc.
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
                {pagedPareto?.map((t) => (
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
        {pages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line px-5 py-3.5">
            <span className="text-[12px] font-medium text-vehicsim-muted">
              Hiển thị {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, paretoCount)} trên {paretoCount} phương án Pareto
            </span>
            <Pagination page={safePage} pages={pages} onPage={setPage} />
          </div>
        )}
      </section>
    </VehicSimPage>
  );
}
