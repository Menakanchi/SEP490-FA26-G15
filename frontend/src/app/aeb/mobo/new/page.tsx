"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton, cx } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { CarlaStatus } from "@/types/vehicsim";
import { VehicSimSelect } from "@/components/VehicSimSelect";
import { readSavedSelection, type SavedSelection } from "@/components/analysis/analysisSnapshotData";
import { vi } from "@/components/vehicsimI18n";

export default function AebMoboNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ctx, canWrite } = useVehicSimContext();
  const rawDatasetId = searchParams.get("dataset_id");
  const datasetId = rawDatasetId && /^\d+$/.test(rawDatasetId) && Number.isSafeInteger(Number(rawDatasetId)) && Number(rawDatasetId) > 0 ? Number(rawDatasetId) : null;
  const datasetLinked = rawDatasetId !== null;
  const [datasetRevision, setDatasetRevision] = useState(0);
  const datasetKey = `${ctx?.project.id}:${ctx?.system.baseline?.id}:${rawDatasetId}:${datasetRevision}`;
  const [datasetResult, setDatasetResult] = useState<{ key: string; data: SavedSelection | null; error: string | null } | null>(null);
  const dataset = datasetResult?.key === datasetKey ? datasetResult.data : null;
  const datasetError = datasetLinked && !datasetId ? "Mã tập phân tích không hợp lệ. Mở lại tập đã chốt từ Phân tích lỗi."
    : datasetResult?.key === datasetKey ? datasetResult.error : null;

  const scenarioIdParam = Number(searchParams.get("scenario_id") || searchParams.get("family"));
  const initialScenarioId = Number.isSafeInteger(scenarioIdParam) && scenarioIdParam > 0 ? scenarioIdParam : undefined;

  const [selectedScenarioId, setSelectedScenarioId] = useState<number | "">(initialScenarioId ?? "");
  const scenarioId = datasetLinked ? dataset?.scenario.id ?? "" :
    selectedScenarioId !== ""
      ? selectedScenarioId
      : initialScenarioId && ctx?.families?.some((f) => f.id === initialScenarioId)
      ? initialScenarioId
      : ctx?.families?.[0]?.id ?? "";

  const [name, setName] = useState("");
  const [maxTrials, setMaxTrials] = useState(10);
  const [nInitialPoints, setNInitialPoints] = useState(3);
  const [selectedSimulator, setSimulatorType] = useState<"KINEMATIC" | "CARLA">("KINEMATIC");
  const simulatorType = dataset ? dataset.reference.simulator.startsWith("carla-") ? "CARLA" : "KINEMATIC" : selectedSimulator;
  const [carlaStatus, setCarlaStatus] = useState<CarlaStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vehicsimApi.carlaStatus().then(setCarlaStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (!datasetId || !ctx) return;
    let active = true;
    vehicsimApi.analysisHandoff(datasetId).then(value => {
      const snapshot = readSavedSelection(value, datasetId);
      if (snapshot.baseline_current !== true || snapshot.handoff_ready !== true
          || snapshot.baseline.id !== ctx.system.baseline?.id
          || typeof snapshot.dataset_digest !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.dataset_digest)
          || typeof snapshot.reference.simulator !== "string"
          || !(snapshot.reference.simulator.startsWith("carla-") || snapshot.reference.simulator.startsWith("vehicsim-kinematic-")))
        throw new Error("Dataset chưa đủ điều kiện bàn giao hoặc baseline đã thay đổi. Quay lại Phân tích lỗi để kiểm tra nguồn.");
      if (active) setDatasetResult({ key: datasetKey, data: snapshot, error: null });
    }).catch(err => { if (active) setDatasetResult({ key: datasetKey, data: null, error: err instanceof Error ? vi(err.message) : "Không kiểm tra được dataset đã chốt." }); });
    return () => { active = false; };
  }, [datasetId, datasetKey, ctx]);

  const handleStartOptimization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || submissionLock.current) return;
    if (datasetLinked && !dataset) {
      setError("Cần kiểm tra thành công dataset đã chốt trước khi tạo đợt tối ưu.");
      return;
    }
    if (!scenarioId || !ctx?.families.some(family => family.id === scenarioId)) {
      setError("Vui lòng chọn kịch bản kiểm thử");
      return;
    }
    if (!Number.isInteger(maxTrials) || maxTrials < 2 || maxTrials > 50
        || !Number.isInteger(nInitialPoints) || nInitialPoints < 2 || nInitialPoints > Math.min(15, maxTrials)) {
      setError("Chọn 2–50 lượt thử và 2–15 điểm khởi tạo; điểm khởi tạo không được vượt số lượt thử.");
      return;
    }
    submissionLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await vehicsimApi.createOptimization({
        scenario_id: Number(scenarioId),
        name: name.trim() || undefined,
        max_trials: Number(maxTrials),
        n_initial_points: Number(nInitialPoints),
        simulator_type: simulatorType,
        ...(dataset ? { dataset_id: dataset.id, dataset_digest: dataset.dataset_digest, base_aeb_version_id: dataset.baseline.id } : {}),
      });
      router.push(`/aeb/mobo?run_id=${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? vi(err.message) : "Khởi tạo đợt tối ưu thất bại");
      setSubmitting(false);
      submissionLock.current = false;
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
          <PillButton href="/aeb/mobo" variant="dark">
            <ArrowLeft className="size-4" />
            Về danh sách đợt chạy
          </PillButton>
        </div>
      }
    >
      <ErrorNote message={error} />
      {datasetLinked && <section className="rounded-xl border border-vehicsim-line bg-vehicsim-surface p-5" aria-label="Dataset Failure Analysis">
        {dataset ? <><h2 className="font-bold">Tập đã chốt #{dataset.id} · {dataset.scenario.name}</h2><p className="mt-2 text-[13px] text-vehicsim-muted">Baseline {dataset.baseline.label} · xe #{dataset.reference.vehicle_id} · {dataset.reference.simulator} · dt {dataset.reference.dt} s</p><p className="mt-2 text-[13px]">{dataset.optimization_run_ids.length} run tối ưu · {dataset.validation_run_ids.length} run xác minh độc lập. Đợt chạy giữ đúng run, seed và checksum của tập đã chốt.</p></>
          : datasetError ? <><ErrorNote message={datasetError} />{datasetId && <PillButton onClick={() => setDatasetRevision(value => value + 1)}>Kiểm tra lại dataset</PillButton>}</>
          : <p role="status">Đang kiểm tra nguồn và checksum dataset…</p>}
        <div className="mt-3"><PillButton href={`/analysis/failures?view=dataset${datasetId ? `&dataset_id=${datasetId}` : ""}`}>Về tập phân tích</PillButton></div>
      </section>}

      <section className="flex flex-col gap-6 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6 shadow-sm">
        <div className="border-b border-solid border-vehicsim-line pb-4">
          <h2 className="text-[17px] font-bold text-vehicsim-ink">
            Cấu hình tham số đợt chạy MOBO
          </h2>
        </div>

        <form onSubmit={handleStartOptimization} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="select-scenario" className="text-[13px] font-bold text-vehicsim-ink">Kịch bản kiểm thử</label>
              <VehicSimSelect
                id="select-scenario"
                aria-label="Kịch bản kiểm thử"
                value={scenarioId}
                disabled={datasetLinked}
                onChange={(val) => setSelectedScenarioId(val ? Number(val) : "")}
                options={(ctx?.families ?? []).map((f) => ({
                  value: f.id,
                  label: `${f.code} · ${f.name}`,
                }))}
                placeholder="Chọn kịch bản…"
                buttonClassName="h-[44px]"
              />
            </div>

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
              <span className="text-[13px] font-bold text-vehicsim-ink">Số lượt thử nghiệm</span>
              <input
                type="number"
                min={2}
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
                max={Math.min(15, maxTrials)}
                value={nInitialPoints}
                onChange={(e) => setNInitialPoints(Number(e.target.value))}
                className="h-[44px] rounded-xl border border-solid border-vehicsim-line-strong px-3.5 text-[14px] text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-primary"
              />
            </label>
          </div>

          {/* CHỌN BỘ MÔ PHỎNG */}
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold text-vehicsim-ink">
              Chọn môi trường mô phỏng (Simulator) *
            </span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSimulatorType("KINEMATIC")}
                disabled={datasetLinked}
                className={cx(
                  "flex h-[44px] items-center justify-between rounded-xl border px-4 text-left transition",
                  simulatorType === "KINEMATIC"
                    ? "border-vehicsim-primary bg-vehicsim-primary/5 shadow-xs ring-1 ring-vehicsim-primary"
                    : "border-vehicsim-line-strong bg-vehicsim-surface hover:bg-vehicsim-soft text-vehicsim-muted hover:text-vehicsim-ink"
                )}
              >
                <span className="text-[13.5px] font-bold text-vehicsim-ink">
                  Mô phỏng Động học (Kinematic)
                </span>
                <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11.5px] font-bold text-emerald-900">
                  Siêu tốc (~30s)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSimulatorType("CARLA")}
                disabled={datasetLinked}
                className={cx(
                  "flex h-[44px] items-center justify-between rounded-xl border px-4 text-left transition",
                  simulatorType === "CARLA"
                    ? "border-vehicsim-primary bg-vehicsim-primary/5 shadow-xs ring-1 ring-vehicsim-primary"
                    : "border-vehicsim-line-strong bg-vehicsim-surface hover:bg-vehicsim-soft text-vehicsim-muted hover:text-vehicsim-ink"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13.5px] font-bold text-vehicsim-ink truncate">
                    Mô phỏng CARLA 3D (OpenSCENARIO)
                  </span>
                  {carlaStatus && !carlaStatus.connected && (
                    <span className="text-[11px] font-semibold text-amber-700">
                      (Chưa kết nối)
                    </span>
                  )}
                </div>
                <span className="rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 text-[11.5px] font-bold text-sky-900 shrink-0">
                  Chính xác cao
                </span>
              </button>
            </div>
          </div>

          {/* GHI CHÚ GIẢI THÍCH THAM SỐ MOBO */}
          <div className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-vehicsim-muted">
            <p>
              <strong className="font-bold text-vehicsim-ink">Số lượt thử nghiệm:</strong>{" "}
              Số bộ tham số AEB được đánh giá trong đợt. Mỗi lượt thử chạy trên toàn bộ tập tối ưu; tăng ngân sách cần thêm thời gian và không bảo đảm tìm được ứng viên tốt hơn.
            </p>
            <p>
              <strong className="font-bold text-vehicsim-ink">Số điểm khởi tạo ban đầu:</strong>{" "}
              Số lần chạy thử ngẫu nhiên lúc đầu để lấy dữ liệu mồi, sau đó hệ thống sẽ tự động tìm kiếm các bộ tham số tốt nhất ở những lần còn lại.
            </p>
          </div>



          <div className="flex items-center justify-end gap-2 border-t border-solid border-vehicsim-line pt-5">
            <PillButton variant="light" href="/aeb/mobo">
              Hủy bỏ
            </PillButton>
            <PillButton variant="dark" type="submit" disabled={submitting || !canWrite || !scenarioId || (datasetLinked && !dataset)}>
              {submitting
                ? "Đang khởi tạo…"
                : simulatorType === "CARLA"
                ? "Bắt đầu tối ưu trên CARLA 3D"
                : "Bắt đầu tối ưu nhanh (Kinematic)"}
            </PillButton>
          </div>
        </form>
      </section>
    </VehicSimPage>
  );
}
