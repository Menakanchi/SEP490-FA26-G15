"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton, cx } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { CarlaStatus } from "@/types/vehicsim";
import { AebNav } from "@/components/aeb/AebNav";

export default function AebMoboNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ctx, canWrite } = useVehicSimContext();

  const scenarioIdParam = Number(searchParams.get("scenario_id") || searchParams.get("family"));
  const initialScenarioId = Number.isSafeInteger(scenarioIdParam) && scenarioIdParam > 0 ? scenarioIdParam : undefined;

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
  const [simulatorType, setSimulatorType] = useState<"KINEMATIC" | "CARLA">("KINEMATIC");
  const [carlaStatus, setCarlaStatus] = useState<CarlaStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vehicsimApi.carlaStatus().then(setCarlaStatus).catch(() => {});
  }, []);

  const handleStartOptimization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scenarioId) {
      setError("Vui lòng chọn kịch bản kiểm thử");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await vehicsimApi.createOptimization({
        scenario_id: Number(scenarioId),
        name: name.trim() || undefined,
        max_trials: Number(maxTrials),
        n_initial_points: Number(nInitialPoints),
        simulator_type: simulatorType,
      });
      router.push(`/aeb/mobo?run_id=${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Khởi tạo đợt tối ưu thất bại");
      setSubmitting(false);
    }
  };

  return (
    <VehicSimPage
      step={4}
      crumbs={[
        { label: "Cải tiến AEB", href: "/aeb" },
        { label: "Tối ưu tự động (MOBO)", href: "/aeb/mobo" },
        { label: "Khởi tạo đợt mới" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PillButton href="/aeb/mobo" variant="light">
            <ArrowLeft className="size-4" />
            Về danh sách đợt chạy
          </PillButton>
        </div>
      }
    >
      <ErrorNote message={error} />
      <AebNav active="mobo_new" />

      <section className="flex flex-col gap-6 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-vehicsim-line pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-vehicsim-decision-bg text-vehicsim-decision">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-vehicsim-ink">
                Cấu hình tham số đợt chạy MOBO
              </h2>
              <p className="text-[12px] text-vehicsim-muted">
                Thuật toán Bayesian đa mục tiêu sử dụng mô hình thay thế Gaussian Process và hàm thu thập qEHVI.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-vehicsim-soft px-3 py-1 text-[12px] font-bold text-vehicsim-ink">
            4 Tham số · 3 Mục tiêu
          </span>
        </div>

        <form onSubmit={handleStartOptimization} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-2">
              <span className="text-[13px] font-bold text-vehicsim-ink">Kịch bản kiểm thử</span>
              <select
                aria-label="Kịch bản kiểm thử"
                value={scenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value ? Number(e.target.value) : "")}
                className="h-[44px] rounded-xl border border-solid border-vehicsim-line-strong bg-vehicsim-surface px-3.5 text-[14px] text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-primary"
              >
                {(ctx?.families ?? []).length === 0 && <option value="">Chưa có kịch bản</option>}
                {(ctx?.families ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} · {f.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[13px] font-bold text-vehicsim-ink">Tên đợt chạy</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="vd. MOBO CP_CROSSING đợt 1"
                className="h-[44px] rounded-xl border border-solid border-vehicsim-line-strong px-3.5 text-[14px] text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-primary"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[13px] font-bold text-vehicsim-ink">Số lượt thử nghiệm (Max Trials)</span>
              <input
                type="number"
                min={3}
                max={50}
                value={maxTrials}
                onChange={(e) => setMaxTrials(Number(e.target.value))}
                className="h-[44px] rounded-xl border border-solid border-vehicsim-line-strong px-3.5 text-[14px] text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-primary"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[13px] font-bold text-vehicsim-ink">Số điểm khởi tạo ban đầu</span>
              <input
                type="number"
                min={2}
                max={15}
                value={nInitialPoints}
                onChange={(e) => setNInitialPoints(Number(e.target.value))}
                className="h-[44px] rounded-xl border border-solid border-vehicsim-line-strong px-3.5 text-[14px] text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-primary"
              />
            </label>
          </div>

          {/* CHỌN BỘ MÔ PHỎNG */}
          <div className="flex flex-col gap-3 rounded-2xl border border-solid border-vehicsim-line bg-vehicsim-soft/50 p-5">
            <span className="text-[12px] font-bold uppercase tracking-wider text-vehicsim-muted">
              Môi trường mô phỏng (Simulator) *
            </span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSimulatorType("KINEMATIC")}
                className={cx(
                  "flex flex-col items-start gap-1.5 rounded-xl border-2 p-4 text-left transition",
                  simulatorType === "KINEMATIC"
                    ? "border-vehicsim-primary bg-vehicsim-surface shadow-xs"
                    : "border-transparent bg-vehicsim-surface/70 hover:bg-vehicsim-surface text-vehicsim-muted hover:text-vehicsim-ink"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-[14px] font-black text-vehicsim-ink">
                    Mô phỏng Động học (Kinematic)
                  </span>
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    Siêu tốc (~30s)
                  </span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-vehicsim-muted">
                  Tính toán vật lý đa luồng trên CPU. Phù hợp để khám phá nhanh không gian tham số và chạy nhiều trials.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSimulatorType("CARLA")}
                className={cx(
                  "flex flex-col items-start gap-1.5 rounded-xl border-2 p-4 text-left transition",
                  simulatorType === "CARLA"
                    ? "border-vehicsim-primary bg-vehicsim-surface shadow-xs"
                    : "border-transparent bg-vehicsim-surface/70 hover:bg-vehicsim-surface text-vehicsim-muted hover:text-vehicsim-ink"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-[14px] font-black text-vehicsim-ink">
                    Mô phỏng CARLA 3D (OpenSCENARIO)
                  </span>
                  <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300">
                    Chính xác cao
                  </span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-vehicsim-muted">
                  Chạy trên Unreal Engine 3D với cảm biến radar và ma sát lốp thực. Cần mở CARLA server trước.
                </p>
                {carlaStatus && !carlaStatus.connected && (
                  <span className="mt-1 text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">
                    CARLA chưa kết nối (bật máy chủ với scripts/dev-carla.ps1)
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Không gian tham số và Mục tiêu thu thập */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-2xl border border-solid border-vehicsim-line bg-vehicsim-soft/50 p-5">
              <span className="text-[12px] font-bold uppercase tracking-wider text-vehicsim-muted">
                Không gian tham số tìm kiếm (Search Space 4 chiều)
              </span>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-3">
                  <span className="block font-bold text-vehicsim-ink">TTC_THRESHOLD</span>
                  <span className="text-[12px] text-vehicsim-muted">0.5s – 3.5s (Thời gian tới va chạm)</span>
                </div>
                <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-3">
                  <span className="block font-bold text-vehicsim-ink">ACTIVATION_DELAY</span>
                  <span className="text-[12px] text-vehicsim-muted">0.05s – 0.45s (Trễ kích hoạt phanh)</span>
                </div>
                <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-3">
                  <span className="block font-bold text-vehicsim-ink">BUILDUP_RATE</span>
                  <span className="text-[12px] text-vehicsim-muted">5.0 – 20.0 m/s³ (Tốc độ tăng áp suất)</span>
                </div>
                <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-3">
                  <span className="block font-bold text-vehicsim-ink">MAX_DECELERATION</span>
                  <span className="text-[12px] text-vehicsim-muted">5.0 – 10.0 m/s² (Gia tốc phanh cực đại)</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-solid border-vehicsim-line bg-vehicsim-soft/50 p-5">
              <span className="text-[12px] font-bold uppercase tracking-wider text-vehicsim-muted">
                3 Mục tiêu tối ưu hoá đồng thời (Cực tiểu hoá)
              </span>
              <div className="grid grid-cols-3 gap-3 text-[13px]">
                <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-3">
                  <span className="block font-bold text-vehicsim-decision">1. Độ êm ái</span>
                  <span className="text-[12px] text-vehicsim-muted">RMS Jerk (m/s³)</span>
                </div>
                <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-3">
                  <span className="block font-bold text-vehicsim-danger">2. Giảm chấn</span>
                  <span className="text-[12px] text-vehicsim-muted">Tốc độ va chạm (m/s)</span>
                </div>
                <div className="rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-3">
                  <span className="block font-bold text-vehicsim-ink">3. Quãng phanh</span>
                  <span className="text-[12px] text-vehicsim-muted">Khoảng cách dừng (m)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-solid border-vehicsim-line pt-5">
            <span className="text-[12px] text-vehicsim-faint">
              Mỗi trial sẽ tự động khởi chạy kịch bản OpenSCENARIO trên bộ mô phỏng CARLA để cập nhật biên Pareto.
            </span>
            <div className="flex items-center gap-2">
              <PillButton variant="light" href="/aeb/mobo">
                Hủy bỏ
              </PillButton>
              <PillButton variant="dark" type="submit" disabled={submitting || !canWrite || !scenarioId}>
                {submitting
                  ? "Đang khởi tạo…"
                  : simulatorType === "CARLA"
                  ? "Bắt đầu tối ưu trên CARLA 3D"
                  : "Bắt đầu tối ưu nhanh (Kinematic)"}
              </PillButton>
            </div>
          </div>
        </form>
      </section>
    </VehicSimPage>
  );
}
