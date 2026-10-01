"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { ScenarioMap } from "@/components/ScenarioMap";
import { TelemetryChart, type ChartMarker } from "@/components/TelemetryChart";
import { ErrorNote, OutcomeBadge, PillButton, cx, fmt, paramValue, runCode } from "@/components/VehicSimUi";
import { vi, viSummary, viTime, viWeather } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { ChainStage, FailureClass, FailureDetail } from "@/types/vehicsim";

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
const SNAPSHOT_PARAMS = [
  "TTC_THRESHOLD",
  "BRAKE_ACTIVATION_DELAY",
  "MAX_DECELERATION",
  "DETECTION_CONFIDENCE_THRESHOLD",
  "PREDICTION_HORIZON",
  "BRAKE_BUILDUP_RATE",
];

export default function FailureDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const [d, setD] = useState<FailureDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vehicsimApi.run(Number(runId))
      .then(setD)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được lượt chạy"));
  }, [runId]);

  const derived = useMemo(() => (d ? derive(d) : null), [d]);
  const code = runCode(Number(runId));

  return (
    <VehicSimPage
      step={4}
      crumbs={[{ label: "Phân tích" }, { label: "Ca lỗi", href: "/analysis/failures" }, { label: `Lượt chạy ${code}` }]}
      title={`Lượt chạy ${code}`}
      badges={
        d && (
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
            title={`Chạy lại đúng lượt này (cùng biến thể, AEB, seed) trên CARLA: python worker/run_variant.py vehicsim-run-${runId}.json`}
            onClick={() => void vehicsimApi.downloadRunBundle(Number(runId)).catch((e) => setError(e.message))}
          >
            Tải JSON chạy CARLA
          </PillButton>
          <PillButton variant="dark" href={`/analysis/failures/${runId}/playback`}>
            ▶  Phát lại
          </PillButton>
        </>
      }
    >
      <ErrorNote message={error} />
      {d && derived && (
        <>
          <section className="flex w-full items-start gap-6 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
            <div className="flex w-[340px] shrink-0 flex-col gap-[18px]">
              <span className="text-[11px] font-semibold tracking-[0.88px] text-vehicsim-faint">ĐIỀU GÌ ĐÃ XẢY RA</span>
              <p className="text-[24px] font-extrabold leading-[1.25] tracking-[-0.48px] text-vehicsim-ink">{vi(d.headline)}</p>
              <div className="grid grid-cols-2 gap-[10px]">
                <Fact label="Tốc độ va chạm" value={fmt.kmh(d.metrics.impact_speed_kmh)} danger={!!d.metrics.impact_speed_kmh} />
                <Fact label="Khoảng cách nhỏ nhất" value={fmt.m(d.metrics.min_distance_m)} danger={(d.metrics.min_distance_m ?? 1) <= 0.05} />
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
              <ScenarioMap
                crossingX={d.scene.crossing_x}
                vehicleLengthM={d.scene.vehicle_length_m}
                vehicleWidthM={d.scene.vehicle_width_m}
                path={d.scene.path}
                pedY={d.scene.path.map((p) => p.ped_y)}
                egoX={d.scene.end?.ego_x ?? 0}
                pedYNow={d.scene.end?.ped_y ?? 0}
                aebX={derived.aebX}
                detectionX={derived.detectionX}
                collision={d.outcome === "COLLISION"}
                egoLabel={`Xe ${d.vehicle} · ${d.environment.ego_speed_kmh} km/h`}
                pedestrianLabel={`Người đi bộ · ${d.environment.pedestrian_speed_mps} m/s`}
                labels={derived.mapLabels}
              />
            </div>
          </section>

          <section className="flex w-full flex-col gap-[18px] rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[10px]">
                <h2 className="text-[18px] font-bold text-vehicsim-ink">Chuỗi nguyên nhân gốc</h2>
                {d.chain.length > 0 && (
                  <span className="rounded-full bg-vehicsim-soft px-[10px] py-[5px] text-[12px] font-medium text-vehicsim-muted">
                    Tự động phân loại{d.chain_confidence !== null ? ` · độ tin cậy ${d.chain_confidence.toFixed(2)}` : ""}
                  </span>
                )}
              </div>
              <span title="Sửa nhãn (màn 05) chưa có trong đợt MVP" className="cursor-not-allowed text-[13px] font-semibold text-vehicsim-decision opacity-50">
                Sửa nhãn →
              </span>
            </div>
            {d.chain.length === 0 ? (
              <p className="text-[13px] text-vehicsim-muted">Không có lỗi: mọi khâu đạt chuẩn và xe không chạm người đi bộ.</p>
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
                    <Legend color="bg-vehicsim-ink" label="TTC (s)" />
                    <Legend color="bg-vehicsim-decision" label="Tốc độ (km/h)" />
                    {d.ttc_threshold_s !== null && <Legend color="bg-vehicsim-amber" label={`Ngưỡng ${d.ttc_threshold_s} s`} />}
                  </div>
                </div>
                <TelemetryChart
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
