"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { VehicSimPage } from "@/components/VehicSimPage";
import { ScenarioMap } from "@/components/ScenarioMap";
import { MotionTelemetryChart } from "@/components/MotionTelemetryChart";
import { TelemetryChart, type ChartMarker } from "@/components/TelemetryChart";
import { ErrorNote, OutcomeBadge, PillButton, cx, fmt, paramValue, runCode } from "@/components/VehicSimUi";
import { vi, viSummary, viTime, viWeather } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { AnalysisRun, ChainStage, FailureClass, FailureDetail } from "@/types/vehicsim";

const CLASS_TITLE: Record<FailureClass, string> = {
  PERCEPTION: "Lỗi nhận thức",
  DECISION: "Lỗi quyết định / thời điểm",
  CONTROL: "Lỗi điều khiển",
  VEHICLE_DYNAMICS: "Lỗi động lực học",
};
const STAGE_NAME: Record<FailureClass, string> = {
  PERCEPTION: "Nhận thức",
  DECISION: "Quyết định",
  CONTROL: "Điều khiển",
  VEHICLE_DYNAMICS: "Động lực học",
};
const SNAPSHOT_PARAMS = ["TTC_THRESHOLD", "BRAKE_ACTIVATION_DELAY", "MAX_DECELERATION", "BRAKE_BUILDUP_RATE"];

export default function FailureDetailPage() {
  const router = useRouter();
  const { canWrite } = useVehicSimContext();
  const [inspection,setInspection]=useState<AnalysisRun|null>(null);
  const params=useSearchParams();
  const initialCursor=Number(params.get("t"))||0;
  const [cursor,setCursor]=useState(initialCursor);
  const [running, setRunning] = useState(false);
  const { runId } = useParams<{ runId: string }>();
  const [d, setD] = useState<FailureDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active=true;
    vehicsimApi.analysisInspection(Number(runId))
      .then(value=>{if(active){setInspection(value.run);setD(value.detail);setCursor(Math.max(0,Math.min(initialCursor,value.detail?.telemetry.at(-1)?.t??0)));}})
      .catch((err) => {if(active)setError(err instanceof Error ? err.message : "Không tải được lượt chạy");});
    return ()=>{active=false;};
  }, [runId,initialCursor]);

  const derived = useMemo(() => (d ? derive(d) : null), [d]);
  const currentPoint=d?.motion_telemetry?.filter(p=>p.t<=cursor).at(-1);
  const code = runCode(Number(runId));

  return (
    <VehicSimPage
      step={4}
      crumbs={[{ label: "Phân tích" }, { label: "Ca lỗi", href: "/analysis/failures" }, { label: `Lượt chạy ${code}` }]}
      title={`Lượt chạy ${code}`}
      badges={
        d && d.evaluation_valid !== false && (
          <>
            <span className="[&>span]:px-3 [&>span]:py-[6px] [&>span]:text-[13px]">
              <OutcomeBadge outcome={d.outcome} />
            </span>
            {d.failure_class && <ClassHeadline value={d.failure_class} />}
          </>
        )
      }
      subtitle={
        d &&
        `${d.family} · ${viSummary(d.summary)}  —  kịch bản ${d.variant} · seed ${d.seed} · ${d.vehicle} · AEB ${d.config} · ${fmt.date(d.date)}`
      }
      actions={
        <>
          <PillButton disabled title="Sửa nhãn nguyên nhân (màn 05) chưa có trong đợt MVP">
            Sửa nguyên nhân
          </PillButton>
          <PillButton
            title="Xuất OpenSCENARIO cùng biến thể, AEB, xe và seed của lượt này"
            onClick={() => void vehicsimApi.downloadRunXosc(Number(runId)).catch((e) => setError(e.message))}
          >
            Tải .xosc
          </PillButton>
          <PillButton disabled={!canWrite || running} onClick={async () => {
            setRunning(true);
            try {
              const run = await vehicsimApi.runOnCarla(Number(runId));
              router.push(`/analysis/carla?run=${run.run_id}`);
            } catch (e) { setError(e instanceof Error ? e.message : "Không chạy được CARLA"); }
            finally { setRunning(false); }
          }}>{running ? "Đang xếp hàng…" : "Chạy trên CARLA"}</PillButton>
          <PillButton variant="dark" disabled={!inspection?.trace_available || inspection.status!=="COMPLETED"} href={`/analysis/failures/${runId}/playback`}>
            ▶  Phát lại
          </PillButton>
        </>
      }
    >
      <ErrorNote message={error} />
      {inspection && !d && <section className="rounded-[20px] bg-white p-6 space-y-3">
        <h2 className="font-bold">Run #{inspection.run_id} · {inspection.status}</h2>
        <p>{inspection.family} · {inspection.variant} · seed {inspection.seed} · xe #{inspection.vehicle_id} · baseline #{inspection.baseline_id}</p>
        <p>{inspection.simulator} · {inspection.end_reason ?? "Chưa có kết quả"}</p>
        <p role="status">Không có kết quả AEB hợp lệ để kết luận an toàn hoặc tính objective.</p>
        {inspection.error && <p role="alert">{inspection.error}</p>}
      </section>}
      {d && <section className="rounded-[16px] bg-white p-4 text-[12px]">
        <label>Thời gian phân tích: {cursor.toFixed(2)} s · {({STATIONARY:"Đứng yên",ACCELERATING:"Nhanh dần",DECELERATING:"Chậm dần",STEADY:"Tốc độ gần đều",UNKNOWN:"Chưa xác định"} as Record<string,string>)[currentPoint?.motion_state??"UNKNOWN"]}
          <input aria-label="Thời gian phân tích" type="range" className="block w-full" min={0} max={d.telemetry.at(-1)?.t ?? 0} step={0.01} value={cursor} onChange={e=>setCursor(Number(e.target.value))}/>
        </label>
        <Link className="underline" href={`/analysis/failures/${runId}/playback?t=${cursor}`}>Mở playback tại thời điểm đang xem</Link>
      </section>}
      {d && derived && (
        <>
          <section className="flex w-full items-start gap-6 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
            <div className="flex w-[340px] shrink-0 flex-col gap-[18px]">
              <span className="text-[11px] font-semibold tracking-[0.88px] text-vehicsim-faint">ĐIỀU GÌ ĐÃ XẢY RA</span>
              <p className="text-[24px] font-extrabold leading-[1.25] tracking-[-0.48px] text-vehicsim-ink">{d.evaluation_valid===false?"Run chưa đủ điều kiện để kết luận kết quả AEB.":vi(d.headline)}</p>
              <div className="grid grid-cols-2 gap-[10px]">
                <Fact label="Tốc độ va chạm" value={fmt.kmh(d.metrics.impact_speed_kmh)} danger={d.metrics.impact_speed_kmh !== null && d.metrics.impact_speed_kmh > 0} />
                <Fact label="Khoảng cách nhỏ nhất" value={fmt.m(d.metrics.min_distance_m)} danger={(d.metrics.min_distance_m ?? 1) <= 0.05} />
                <Fact label="RMS jerk" value={d.metrics.rms_jerk_mps3 === null ? "Chưa đo" : `${d.metrics.rms_jerk_mps3.toFixed(2)} m/s³`} />
                <Fact label="Quãng phanh" value={fmt.m(d.metrics.stopping_distance_m)} />
                <Fact label="Giảm tốc cực đại" value={d.metrics.max_deceleration_mps2 === null ? "Chưa đo" : `${d.metrics.max_deceleration_mps2.toFixed(2)} m/s²`} />
                <Fact label="Nguồn chỉ số" value={d.metrics.metric_source === "SIMULATOR_RESULT" ? "Kết quả run đã lưu" : "Chưa xác định"} />
                <p className="col-span-2 text-[10px] text-vehicsim-faint">Chỉ số cùng đơn vị SI từ kết quả của bộ mô phỏng đang ghi trên run. CARLA chưa hiệu chuẩn phanh; không dùng các số CARLA làm bằng chứng regression.</p>
                <Fact
                  label="Phát hiện lần đầu"
                  value={
                    d.metrics.first_detection_t === null
                      ? "Không phát hiện"
                      : `t ${d.metrics.first_detection_t.toFixed(1)} s · ${fmt.m(d.metrics.first_detection_distance_m, 0)}`
                  }
                />
                <Fact
                  label="AEB kích hoạt"
                  value={
                    d.metrics.aeb_activation_t === null
                      ? "Không kích hoạt"
                      : `t ${d.metrics.aeb_activation_t.toFixed(1)} s · TTC ${fmt.s(d.metrics.aeb_activation_ttc_s)}`
                  }
                />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              {d.scene.path.length>0 && typeof d.scene.crossing_x==="number" ? <ScenarioMap
                crossingX={d.scene.crossing_x}
                vehicleLengthM={d.scene.vehicle_length_m}
                vehicleWidthM={d.scene.vehicle_width_m}
                path={d.scene.path}
                pedY={d.scene.path.map((p) => p.ped_y)}
                egoX={currentPoint?.ego_x_m ?? d.scene.end?.ego_x ?? 0}
                pedYNow={currentPoint?.target_y_m ?? d.scene.end?.ped_y ?? 0}
                aebX={derived.aebX}
                detectionX={derived.detectionX}
                collision={d.outcome === "COLLISION"}
                egoLabel={`Xe ${d.vehicle} · ${d.environment.ego_speed_kmh} km/h`}
                pedestrianLabel={`Người đi bộ · ${d.environment.pedestrian_speed_mps} m/s`}
                labels={derived.mapLabels}
              /> : <p>Không đủ tọa độ để dựng cảnh.</p>}
            </div>
          </section>

          <section className="flex w-full flex-col gap-[18px] rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[10px]">
                <h2 className="text-[18px] font-bold text-vehicsim-ink">Chuỗi nguyên nhân gốc</h2>
                {d.chain.length > 0 && (
                  <span className="rounded-full bg-vehicsim-soft px-[10px] py-[5px] text-[12px] font-medium text-vehicsim-muted">
                    Nhận định theo luật{d.chain_confidence !== null ? ` · độ tin cậy ${d.chain_confidence.toFixed(2)}` : ""}
                  </span>
                )}
              </div>
              <span title="Sửa nhãn (màn 05) chưa có trong đợt MVP" className="cursor-not-allowed text-[13px] font-semibold text-vehicsim-decision opacity-50">
                Sửa nhãn →
              </span>
            </div>
            {d.chain.length === 0 ? (
              <p className="text-[13px] text-vehicsim-muted">Run không có chuỗi nhận định để hiển thị. Xem kết quả và dữ liệu nguồn trước khi kết luận.</p>
            ) : (
              <div className="flex w-full items-stretch gap-[10px]">
                {d.chain.map((stage, i) => (
                  <React.Fragment key={stage.stage}>
                    {i > 0 && <span className="self-center text-[16px] font-bold text-vehicsim-faint">→</span>}
                    <StageCard index={i + 1} stage={stage} />
                  </React.Fragment>
                ))}
              </div>
            )}
          </section>

          <div className="flex w-full items-start gap-4">
            <section className="flex w-[340px] shrink-0 flex-col gap-3 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
              <h2 className="text-[16px] font-bold text-vehicsim-ink">Cấu hình lúc chạy</h2>
              {derived.snapshot.map((p) => (
                <Row key={p.code} label={p.name} value={paramValue(p.value, p.unit)} highlight={derived.implicated.has(p.code)} />
              ))}
              <span className="text-[11px] font-semibold tracking-[0.88px] text-vehicsim-faint">MÔI TRƯỜNG</span>
              <Row label="Tốc độ xe ego" value={`${d.environment.ego_speed_kmh} km/h`} />
              <Row label="Người đi bộ: khoảng cách · tốc độ" value={`${d.environment.trigger_distance_m} m · ${d.environment.pedestrian_speed_mps} m/s`} />
              <Row label="Hành vi người đi bộ" value={d.environment.stops_at_curb ? "Dừng ở lề" : "Băng qua"} />
              <Row label="Thời tiết · thời điểm" value={`${viWeather(d.environment.weather)} · ${viTime(d.environment.time_of_day)}`} />
              <Row label="Ma sát mặt đường μ" value={d.environment.road_friction?.toFixed(2) ?? "—"} />
            </section>

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <section className="flex w-full flex-col gap-[14px] rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
                <div className="flex items-center justify-between">
                  <h2 className="text-[16px] font-bold text-vehicsim-ink">Dữ liệu đo</h2>
                  <div className="flex items-center gap-[14px] text-[12px] font-medium text-vehicsim-muted">
                    <Legend color="bg-vehicsim-ink" label="TTC nhận thức (s)" />
                    <Legend color="bg-vehicsim-decision" label="Tốc độ (km/h)" />
                    {d.ttc_threshold_s !== null && <Legend color="bg-vehicsim-amber" label={`Ngưỡng ${d.ttc_threshold_s} s`} />}
                  </div>
                </div>
                <TelemetryChart
                  cursor={cursor}
                  points={d.telemetry}
                  threshold={d.ttc_threshold_s}
                  markers={derived.markers}
                  shade={derived.shade}
                  impactT={derived.impactT}
                />
                {derived.note && (
                  <div className="flex items-center gap-[10px] rounded-[14px] bg-vehicsim-fail-card px-[14px] py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- chấm màu SVG từ Figma */}
                    <img alt="" src="/vehicsim/dot-collision.svg" width={8} height={8} className="size-2" />
                    <p className="flex-1 text-[12px] font-medium text-vehicsim-ink">
                      {derived.note}{" "}
                      <Link href="/aeb" className="font-semibold text-vehicsim-decision hover:underline">
                        Tạo cấu hình ứng viên ở mục AEB →
                      </Link>
                    </p>
                  </div>
                )}
              </section>

              <section className="rounded-[20px] bg-white p-5 space-y-3">
                <h2 className="font-bold">Bằng chứng và giới hạn nhận định</h2>
                <p className="text-[12px] text-vehicsim-muted">Chuỗi nguyên nhân là giả thuyết theo luật đánh giá, không chứng minh quan hệ nhân quả. Điểm confidence là điểm của luật, không phải xác suất đã hiệu chuẩn.</p>
                {d.stage_evidence?.map(e=><div key={e.stage} className="text-[12px]"><strong>{STAGE_NAME[e.stage as FailureClass]??e.stage}</strong>
                  <p>{Object.values(e.values).some(v=>v!==null)?"Có số đo để đối chiếu; nhận định vẫn cần kiểm tra.":"Không đủ số đo để đối chiếu."}</p>
                  {Object.entries(e.values).map(([key,value])=><span key={key} className="mr-3">{({first_detection_t:"Phát hiện (s)",first_detection_distance_m:"Cự ly phát hiện (m)",decision_t:"Quyết định (s)",decision_ttc_s:"TTC quyết định (s)",brake_onset_t:"Phanh có hiệu lực (s)",response_time_s:"Trễ phanh (s)",max_deceleration_mps2:"Giảm tốc cực đại (m/s²)",road_friction:"Hệ số ma sát"} as Record<string,string>)[key]??key}: {value===null?"Không khả dụng":value}</span>)}
                </div>)}
              </section>

              <MotionTelemetryChart points={d.motion_telemetry ?? []} markers={derived.markers} cursor={cursor} />

              <section className="flex w-full flex-col gap-[10px] rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
                <h2 className="text-[16px] font-bold text-vehicsim-ink">Ca lỗi tương tự</h2>
                {d.similar.length === 0 && <p className="text-[12px] text-vehicsim-muted">Chưa có ca lỗi nào khác.</p>}
                {d.similar.map((s) => (
                  <Link
                    key={s.run_id}
                    href={`/analysis/failures/${s.run_id}`}
                    className="flex w-full items-center gap-[10px] rounded-[12px] bg-vehicsim-soft px-[10px] py-2 hover:bg-vehicsim-line"
                  >
                    <span className="text-[13px] font-bold text-vehicsim-ink">{runCode(s.run_id)}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-vehicsim-muted">
                      {s.variant} · {viSummary(s.summary)}
                    </span>
                    <span className="rounded-full bg-vehicsim-decision-bg px-2 py-[3px] text-[11px] font-semibold text-vehicsim-decision">
                      {s.similarity_pct}%
                    </span>
                  </Link>
                ))}
              </section>
            </div>
          </div>
        </>
      )}
    </VehicSimPage>
  );
}

function derive(d: FailureDetail) {
  const at = (t: number | null) => (t === null ? null : d.scene.path.find((p) => p.t >= t - 1e-6)?.x ?? null);
  const threshold = d.ttc_threshold_s;
  const belowT = threshold === null ? null : d.telemetry.find((p) => p.ttc !== null && p.ttc <= threshold)?.t ?? null;
  const impactT = d.events.find((e) => e.kind === "collision")?.t ?? null;
  const stoppedT = d.events.find((e) => e.kind === "stopped")?.t ?? null;

  const markers: ChartMarker[] = [];
  if (d.metrics.first_detection_t !== null) markers.push({ t: d.metrics.first_detection_t, label: "Phát hiện", color: "var(--color-vehicsim-perception)" });
  if (belowT !== null) markers.push({ t: belowT, label: `TTC < ${threshold} s`, color: "var(--color-vehicsim-warn)" });
  if (d.metrics.aeb_activation_t !== null) markers.push({ t: d.metrics.aeb_activation_t, label: "AEB kích hoạt", color: "var(--color-vehicsim-decision)" });
  if (impactT !== null) markers.push({ t: impactT, label: "Va chạm", color: "var(--color-vehicsim-danger)" });
  else if (stoppedT !== null) markers.push({ t: stoppedT, label: "Dừng", color: "var(--color-vehicsim-ok)" });

  const aebT = d.metrics.aeb_activation_t;
  const delay = belowT !== null && aebT !== null ? aebT - belowT : null;
  const shade: [number, number] | null = delay !== null && delay > 0.05 ? [belowT as number, aebT as number] : null;

  const implicated = new Set(d.chain.filter((s) => !s.passed && s.parameter_code).map((s) => s.parameter_code as string));
  const byCode = new Map(d.configuration.map((p) => [p.code, p]));
  const codes = [...SNAPSHOT_PARAMS, ...[...implicated].filter((c) => !SNAPSHOT_PARAMS.includes(c))];
  const snapshot = codes.map((c) => byCode.get(c)).filter((p): p is NonNullable<typeof p> => !!p);

  const failing = d.chain.find((s) => !s.passed);
  const note = failing
    ? `${shade ? `Trễ kích hoạt ${delay!.toFixed(1)} s (vùng tô). ` : ""}${vi(failing.summary)}`
    : null;

  const mapLabels = [];
  const detX = at(d.metrics.first_detection_t);
  const aebX = at(aebT);
  if (detX !== null && d.metrics.first_detection_t !== null)
    mapLabels.push({ x: detX, y: 190, text: `Phát hiện · t ${d.metrics.first_detection_t.toFixed(1)} s`, color: "var(--color-vehicsim-perception)" });
  if (aebX !== null && aebT !== null) mapLabels.push({ x: aebX, y: 104, text: `AEB · t ${aebT.toFixed(1)} s`, color: "var(--color-vehicsim-decision)" });
  if (impactT !== null && d.metrics.impact_speed_kmh !== null)
    mapLabels.push({ x: d.scene.crossing_x + 2, y: 190, text: `Va chạm · ${d.metrics.impact_speed_kmh.toFixed(1)} km/h`, color: "var(--color-vehicsim-danger)" });

  return { markers, shade, impactT, implicated, snapshot, note, detectionX: detX, aebX, mapLabels };
}

function ClassHeadline({ value }: { value: FailureClass }) {
  const styles: Record<FailureClass, string> = {
    PERCEPTION: "bg-vehicsim-perception-bg text-vehicsim-perception",
    DECISION: "bg-vehicsim-decision-bg text-vehicsim-decision",
    CONTROL: "bg-vehicsim-control-bg text-vehicsim-control",
    VEHICLE_DYNAMICS: "bg-vehicsim-dynamics-bg text-vehicsim-dynamics",
  };
  return (
    <span className={cx("inline-flex items-center gap-[6px] rounded-full px-3 py-[6px] text-[13px] font-semibold", styles[value])}>
      <span className="size-[6px] rounded-full bg-current" />
      {CLASS_TITLE[value]}
    </span>
  );
}

function StageCard({ index, stage }: { index: number; stage: ChainStage }) {
  const failed = !stage.passed;
  return (
    <div
      className={cx(
        "flex min-w-0 flex-1 flex-col gap-[10px] rounded-[16px] border-solid p-4",
        failed ? "border-[1.5px] border-vehicsim-danger bg-vehicsim-fail-card" : "border border-vehicsim-line bg-white",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cx("flex size-[22px] items-center justify-center rounded-[11px] text-[11px] font-bold text-white", failed ? "bg-vehicsim-danger" : "bg-vehicsim-ink")}>
            {index}
          </span>
          <span className="text-[14px] font-bold text-vehicsim-ink">{STAGE_NAME[stage.stage]}</span>
        </div>
        <span
          className={cx(
            "whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-semibold",
            failed ? "bg-vehicsim-danger-bg text-vehicsim-danger" : "bg-vehicsim-ok-bg text-vehicsim-ok",
          )}
        >
          {failed ? "✕ Không đạt" : "✓ Đạt"}
        </span>
      </div>
      <p className="text-[12px] leading-[1.5] text-vehicsim-muted">{vi(stage.summary)}</p>
    </div>
  );
}

function Fact({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] bg-vehicsim-soft px-[14px] py-3">
      <span className="text-[12px] font-medium text-vehicsim-faint">{label}</span>
      <span className={cx("text-[15px] font-bold", danger ? "text-vehicsim-danger" : "text-vehicsim-ink")}>{value}</span>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-solid border-vehicsim-line py-[7px] text-[13px]">
      <span className="font-medium text-vehicsim-muted">{label}</span>
      {highlight ? (
        <span className="rounded-full bg-vehicsim-danger-bg px-[10px] py-[5px] text-[12px] font-semibold text-vehicsim-danger">{value}</span>
      ) : (
        <span className="font-semibold text-vehicsim-ink">{value}</span>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-[6px]">
      <span className={cx("h-[3px] w-[14px] rounded-[2px]", color)} />
      {label}
    </span>
  );
}
