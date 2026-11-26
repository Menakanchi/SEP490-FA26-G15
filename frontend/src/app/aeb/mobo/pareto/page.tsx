"use client";

import { TrialSelectAction, useTrialSelections } from "@/components/aeb/TrialSelectAction";
import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, TrendingUp } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { EmptyState, ErrorNote, Pagination, PillButton } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { OptimizationRun, OptimizationTrial } from "@/types/vehicsim";
import { AebNav } from "@/components/aeb/AebNav";

export default function AebMoboParetoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canWrite, refresh } = useVehicSimContext();

  const [runs, setRuns] = useState<OptimizationRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [paretoTrials, setParetoTrials] = useState<OptimizationTrial[] | null>(null);
  const trialSelections = useTrialSelections(paretoTrials);
  const [selectingTrialId, setSelectingTrialId] = useState<number | null>(null);
  const [createdCandidate, setCreatedCandidate] = useState<{ id: number; label: string; regressionTestId?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryRunId = Number(searchParams.get("run_id"));
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;
  const paretoCount = paretoTrials?.length ?? 0;
  const pages = Math.max(1, Math.ceil(paretoCount / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pagedPareto = paretoTrials?.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    vehicsimApi
      .optimizationRuns()
      .then((data) => {
        setRuns(data);
        if (data.length > 0) {
          const matched = Number.isInteger(queryRunId) && data.some((r) => r.id === queryRunId);
          setSelectedRunId(matched ? queryRunId : data[0].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách đợt tối ưu"));
  }, [queryRunId]);

  useEffect(() => {
    if (selectedRunId !== null) {
      vehicsimApi
        .optimizationPareto(selectedRunId)
        .then(setParetoTrials)
        .catch((err) => setError(err instanceof Error ? err.message : "Không tải được tập nghiệm Pareto"));
    }
  }, [selectedRunId]);

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

  const activeRun = runs?.find((r) => r.id === selectedRunId) ?? null;

  return (
    <VehicSimPage
      step={4}
      crumbs={[
        { label: "Cải tiến AEB", href: "/aeb" },
        { label: "Tối ưu MOBO", href: "/aeb/mobo" },
        { label: "Tập nghiệm Pareto" },
      ]}
      title="Tập nghiệm Pareto tối ưu (Pareto Frontier)"
      actions={
        <div className="flex items-center gap-2">
          <PillButton href={`/aeb/mobo/trials${selectedRunId ? `?run_id=${selectedRunId}` : ""}`} variant="light">
            Xem toàn bộ Trials
          </PillButton>
          <PillButton href="/aeb/candidates" variant="light">
            Xem ứng viên đã chọn
          </PillButton>
        </div>
      }
    >
      <ErrorNote message={error} />
      <AebNav active="mobo_pareto" />

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
                  ? `/validation/regression`
                  : `/validation/regression/new?candidate=${createdCandidate.id}`
              }
              className="text-[12px] py-1.5"
            >
              {createdCandidate.regressionTestId ? "Đến bảng Kiểm thử hồi quy →" : "Kiểm thử hồi quy ngay"}
            </PillButton>
          </div>
        </div>
      )}

      {/* Bộ chọn đợt chạy MOBO */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <label className="text-[13px] font-bold text-vehicsim-ink">Chọn đợt tối ưu hoá:</label>
          <select
            aria-label="Chọn đợt tối ưu hoá"
            value={selectedRunId ?? ""}
            onChange={(e) => {
              const newId = Number(e.target.value);
              setSelectedRunId(newId);
              setPage(1);
              router.replace(`/aeb/mobo/pareto?run_id=${newId}`);
            }}
            className="h-10 rounded-xl border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-3 text-[14px] font-bold text-vehicsim-ink"
          >
            {(runs ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                Run #{r.id} · {r.name} ({r.pareto_count} nghiệm Pareto)
              </option>
            ))}
          </select>
        </div>

        {activeRun && (
          <div className="flex items-center gap-3 text-[12px] text-vehicsim-muted">
            <span>
              Trạng thái: <strong>{activeRun.status}</strong>
            </span>
            <span>·</span>
            <span>
              Tiến độ: <strong>{activeRun.completed_trials}/{activeRun.max_trials} trials</strong>
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
              Biên Pareto Frontier ({paretoTrials?.length ?? 0} phương án tối ưu)
            </h3>
          </div>
          <span className="text-[12px] text-vehicsim-muted">
            Bấm &quot;Chọn làm ứng viên&quot; để lưu bộ tham số này vào kho ứng viên chờ kiểm định.
          </span>
        </div>

        {paretoTrials?.length === 0 ? (
          <div className="p-10">
            <EmptyState title="Chưa có nghiệm Pareto cho đợt chạy này">
              Đợt chạy đang trong giai đoạn khởi tạo ban đầu hoặc chưa có trial nào hoàn thành.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead className="border-b border-solid border-slate-700 bg-slate-800 text-[12.5px] font-black uppercase tracking-wider text-white">
                <tr className="h-12">
                  <th className="w-12 px-3 py-3.5 text-center">STT</th>
                  <th className="px-4 py-3.5">Trial #</th>
                  <th className="px-4 py-3.5">TTC (s)</th>
                  <th className="px-4 py-3.5">Trễ (s)</th>
                  <th className="px-4 py-3.5">Tăng áp (m/s³)</th>
                  <th className="px-4 py-3.5">Gia tốc (m/s²)</th>
                  <th className="px-4 py-3.5 text-emerald-300">RMS Jerk</th>
                  <th className="px-4 py-3.5 text-rose-300">Tốc độ va chạm</th>
                  <th className="px-4 py-3.5 text-slate-200">Quãng phanh</th>
                  <th className="px-4 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-solid divide-vehicsim-line bg-vehicsim-surface">
                {pagedPareto?.map((t, idx) => (
                  <tr key={t.id} className="hover:bg-vehicsim-row transition-colors">
                    <td className="w-12 px-3 py-4 text-center font-mono text-[12px] font-bold text-vehicsim-faint tabular-nums">
                      {(safePage - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    <td className="px-4 py-3.5 font-mono font-bold text-vehicsim-ink">
                      #{t.trial_number}
                    </td>
                    <td className="px-4 py-3.5 font-mono font-medium">{t.parameters?.TTC_THRESHOLD ?? "—"}</td>
                    <td className="px-4 py-3.5 font-mono font-medium">{t.parameters?.BRAKE_ACTIVATION_DELAY ?? "—"}</td>
                    <td className="px-4 py-3.5 font-mono font-medium">{t.parameters?.BRAKE_BUILDUP_RATE ?? "—"}</td>
                    <td className="px-4 py-3.5 font-mono font-medium">{t.parameters?.MAX_DECELERATION ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-bold text-vehicsim-decision">
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
                      <TrialSelectAction trial={t} selections={trialSelections} selecting={selectingTrialId} canWrite={canWrite} onSelect={handleSelectCandidate} />
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
              Hiển thị {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, paretoCount)} trên {paretoCount} phương án Pareto
            </span>
            <Pagination page={safePage} pages={pages} onPage={setPage} />
          </div>
        )}
      </section>
    </VehicSimPage>
  );
}
