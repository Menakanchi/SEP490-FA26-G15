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
import { failureAnalysisV3 } from "@/services/failureAnalysisV3";
import { FAError, uuid, type V3CampaignInput } from "@/components/analysis/failureAnalysisV3Data";

export default function AebMoboNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ctx, canWrite } = useVehicSimContext();
  const rawDatasetId = searchParams.get("dataset_id");
  const datasetId = rawDatasetId && /^\d+$/.test(rawDatasetId) && Number.isSafeInteger(Number(rawDatasetId)) && Number(rawDatasetId) > 0 ? Number(rawDatasetId) : null;
  const datasetLinked = rawDatasetId !== null;
  const rawHandoffId = searchParams.get("handoff_id"), handoffDigest = searchParams.get("handoff_digest");
  const handoffLinked = rawHandoffId !== null || handoffDigest !== null;
  const linked = datasetLinked || handoffLinked;
  const handoffId = uuid(rawHandoffId) ? rawHandoffId : null;
  const sourceConflict = datasetLinked && handoffLinked;
  const [datasetRevision, setDatasetRevision] = useState(0);
  const datasetKey = `${ctx?.project.id}:${ctx?.system.baseline?.id}:${rawDatasetId}:${datasetRevision}`;
  const [datasetResult, setDatasetResult] = useState<{ key: string; data: SavedSelection | null; error: string | null } | null>(null);
  const dataset = datasetResult?.key === datasetKey ? datasetResult.data : null;
  const datasetError = datasetLinked && !datasetId ? "Mã tập phân tích không hợp lệ. Mở lại tập đã chốt từ Phân tích lỗi."
    : datasetResult?.key === datasetKey ? datasetResult.error : null;
  const handoffKey = `${ctx?.project.id}:${ctx?.system.baseline?.id}:${rawHandoffId}:${handoffDigest}:${datasetRevision}`;
  const [handoffResult, setHandoffResult] = useState<{ key: string; data: V3CampaignInput | null; error: string | null } | null>(null);
  const handoff = handoffResult?.key === handoffKey ? handoffResult.data : null;
  const handoffError = sourceConflict ? "Chỉ chọn một tập bàn giao. Mở lại liên kết từ Phân tích lỗi."
    : handoffLinked && (!handoffId || !handoffDigest || !/^[a-f0-9]{64}$/.test(handoffDigest)) ? "Liên kết bàn giao thiếu hoặc sai mã kiểm tra. Mở lại từ Phân tích lỗi."
    : handoffResult?.key === handoffKey ? handoffResult.error : null;
  const source = !sourceConflict ? handoffLinked ? handoff : dataset : null;

  const scenarioIdParam = Number(searchParams.get("scenario_id") || searchParams.get("family"));
  const initialScenarioId = Number.isSafeInteger(scenarioIdParam) && scenarioIdParam > 0 ? scenarioIdParam : undefined;

  const [selectedScenarioId, setSelectedScenarioId] = useState<number | "">(initialScenarioId ?? "");
  const scenarioId = linked ? source?.scenario.id ?? "" :
    selectedScenarioId !== ""
      ? selectedScenarioId
      : initialScenarioId && ctx?.families?.some((f) => f.id === initialScenarioId)
      ? initialScenarioId
      : ctx?.families?.[0]?.id ?? "";

  const [name, setName] = useState("");
  const [maxTrials, setMaxTrials] = useState(10);
  const [nInitialPoints, setNInitialPoints] = useState(3);
  const [selectedSimulator, setSimulatorType] = useState<"KINEMATIC" | "CARLA">("KINEMATIC");
  const simulatorType = source ? source.reference.simulator.startsWith("carla-") ? "CARLA" : "KINEMATIC" : selectedSimulator;
  const [carlaStatus, setCarlaStatus] = useState<CarlaStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vehicsimApi.carlaStatus().then(setCarlaStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (!datasetId || !ctx || handoffLinked) return;
    let active = true;
    vehicsimApi.analysisHandoff(datasetId).then(value => {
      const snapshot = readSavedSelection(value, datasetId);
      if (snapshot.baseline_current !== true || snapshot.handoff_ready !== true
          || snapshot.baseline.id !== ctx.system.baseline?.id
          || typeof snapshot.dataset_digest !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.dataset_digest)
          || typeof snapshot.reference.simulator !== "string"
          || !(snapshot.reference.simulator.startsWith("carla-") || snapshot.reference.simulator.startsWith("vehicsim-kinematic-")))
        throw new Error("Tập phân tích chưa đủ điều kiện bàn giao hoặc bản cơ sở đã thay đổi. Quay lại Phân tích lỗi để kiểm tra nguồn.");
      if (active) setDatasetResult({ key: datasetKey, data: snapshot, error: null });
    }).catch(err => { if (active) setDatasetResult({ key: datasetKey, data: null, error: err instanceof Error ? vi(err.message) : "Không kiểm tra được tập đã chốt." }); });
    return () => { active = false; };
  }, [datasetId, datasetKey, ctx, handoffLinked]);

  useEffect(() => {
    if (!handoffId || !handoffDigest || !/^[a-f0-9]{64}$/.test(handoffDigest) || !ctx || sourceConflict) return;
    let active = true;
    failureAnalysisV3.campaign(ctx.project.id, handoffId, handoffDigest).then(value => {
      if (value.baseline.id !== ctx.system.baseline?.id) throw new Error("Bản cơ sở của tập bàn giao đã thay đổi. Quay lại Phân tích lỗi để rà soát nguồn.");
      if (active) setHandoffResult({ key: handoffKey, data: value, error: null });
    }).catch(err => { if (active) setHandoffResult({ key: handoffKey, data: null, error: err instanceof FAError ? err.message : err instanceof Error ? vi(err.message) : "Không kiểm tra được tập bàn giao." }); });
    return () => { active = false; };
  }, [handoffId, handoffDigest, handoffKey, ctx, sourceConflict]);

  const handleStartOptimization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || submissionLock.current) return;
    if (linked && !source) {
      setError(handoffLinked ? "Cần kiểm tra thành công tập bàn giao trước khi tạo đợt tối ưu." : "Cần kiểm tra thành công tập đã chốt trước khi tạo đợt tối ưu.");
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
        ...(handoff ? { handoff_id: handoff.handoff_id, handoff_digest: handoff.handoff_digest, base_aeb_version_id: handoff.baseline.id, search_space: handoff.search_space }
          : dataset ? { dataset_id: dataset.id, dataset_digest: dataset.dataset_digest, base_aeb_version_id: dataset.baseline.id } : {}),
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
      {!canWrite && <p className="rounded-xl border border-vehicsim-line bg-vehicsim-surface p-4 text-sm">Tài khoản của bạn chỉ có quyền xem, không thể tạo đợt tối ưu.</p>}
      {handoffLinked && <section className="rounded-xl border border-vehicsim-line bg-vehicsim-surface p-5" aria-label="Tập bàn giao từ phân tích">
        {handoff && !sourceConflict ? <><h2 className="font-bold">Tập bàn giao · {handoff.scenario.name}</h2><p className="mt-2 text-[13px] text-vehicsim-muted">Bản cơ sở {handoff.baseline.label} · xe #{handoff.reference.vehicle_id} · {handoff.reference.simulator} · bước thời gian {handoff.reference.dt} s</p><p className="mt-2 text-[13px]">{handoff.optimization_run_ids.length} lượt tối ưu · {handoff.validation_run_ids.length} lượt xác minh độc lập. Đợt tối ưu dùng đúng các lượt chạy và miền tham số đã xác nhận.</p><details className="mt-3 text-[12px]"><summary>Nguồn và miền tham số đã xác nhận</summary><p className="mt-2 break-all">Mã bàn giao: {handoff.handoff_id} · SHA-256: {handoff.handoff_digest}</p><p className="mt-2">Lượt tối ưu: {handoff.optimization_run_ids.join(", ")}. Lượt xác minh: {handoff.validation_run_ids.join(", ")}.</p><dl>{Object.entries(handoff.search_space).map(([code, [low, high]]) => <div key={code} className="mt-2"><dt>{code}</dt><dd>{low}–{high}</dd></div>)}</dl></details></>
          : handoffError ? <><ErrorNote message={handoffError} />{handoffId && !sourceConflict && <PillButton onClick={() => setDatasetRevision(value => value + 1)}>Kiểm tra lại tập bàn giao</PillButton>}</>
          : <p role="status">Đang kiểm tra tập bàn giao…</p>}
        <div className="mt-3"><PillButton href="/analysis/failures?view=dataset">Về phân tích lỗi</PillButton></div>
      </section>}
      {datasetLinked && !handoffLinked && <section className="rounded-xl border border-vehicsim-line bg-vehicsim-surface p-5" aria-label="Dataset Failure Analysis">
        {dataset ? <><h2 className="font-bold">Tập đã chốt #{dataset.id} · {dataset.scenario.name}</h2><p className="mt-2 text-[13px] text-vehicsim-muted">Baseline {dataset.baseline.label} · xe #{dataset.reference.vehicle_id} · {dataset.reference.simulator} · dt {dataset.reference.dt} s</p><p className="mt-2 text-[13px]">{dataset.optimization_run_ids.length} run tối ưu · {dataset.validation_run_ids.length} run xác minh độc lập. Đợt chạy giữ đúng run, seed và checksum của tập đã chốt.</p></>
          : datasetError ? <><ErrorNote message={datasetError} />{datasetId && <PillButton onClick={() => setDatasetRevision(value => value + 1)}>Kiểm tra lại dataset</PillButton>}</>
          : <p role="status">Đang kiểm tra nguồn và checksum dataset…</p>}
        <div className="mt-3"><PillButton href={`/analysis/failures?view=dataset${datasetId ? `&dataset_id=${datasetId}` : ""}`}>Về tập phân tích</PillButton></div>
      </section>}

      {canWrite && <section className="flex flex-col gap-6 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface p-6 shadow-sm">
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
                disabled={linked}
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
              Chọn môi trường mô phỏng *
            </span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSimulatorType("KINEMATIC")}
                disabled={linked}
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
                  Mô phỏng nhanh
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSimulatorType("CARLA")}
                disabled={linked}
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
            <PillButton variant="dark" type="submit" disabled={submitting || !canWrite || !scenarioId || (linked && !source)}>
              {submitting
                ? "Đang khởi tạo…"
                : simulatorType === "CARLA"
                ? "Bắt đầu tối ưu trên CARLA 3D"
                : "Bắt đầu tối ưu nhanh (Kinematic)"}
            </PillButton>
          </div>
        </form>
      </section>}
    </VehicSimPage>
  );
}
