"use client";

import Link from "next/link";
import { ScenarioMap } from "@/components/ScenarioMap";
import { paramValue, runCode } from "@/components/VehicSimUi";
import { analysisLabel, metric } from "@/components/analysisUi";
import { vi, viSummary, viTime, viWeather } from "@/components/vehicsimI18n";
import type { FailureDetail } from "@/types/vehicsim";
import { finite, recordedAt } from "./analysisRunData";
import styles from "./AnalysisRunDetail.module.css";

const PARAMS = ["TTC_THRESHOLD", "BRAKE_ACTIVATION_DELAY", "MAX_DECELERATION", "BRAKE_BUILDUP_RATE"];
const PARAM_NAMES: Record<string, string> = {
  TTC_THRESHOLD: "Ngưỡng TTC", BRAKE_ACTIVATION_DELAY: "Trễ kích hoạt phanh",
  MAX_DECELERATION: "Giảm tốc tối đa", BRAKE_BUILDUP_RATE: "Tốc độ tăng lực phanh",
};
const measured = (value: unknown, unit: string, digits = 2) => finite(value) ? `${metric(value, digits)} ${unit}` : "—";

export function AnalysisRunSummary({ detail: d, cursor, returnTo }: { detail: FailureDetail; cursor: number; returnTo: string }) {
  const m = d.metrics;
  const implicated = new Set(d.chain.filter(stage => !stage.passed && stage.parameter_code).map(stage => stage.parameter_code));
  const byCode = new Map(d.configuration.map(param => [param.code, param]));
  const configuration = [...PARAMS, ...[...implicated].filter((code): code is string => code != null && !PARAMS.includes(code))]
    .map(code => byCode.get(code)).filter((param): param is NonNullable<typeof param> => Boolean(param));
  const path = d.scene.path.filter(point => finite(point.t) && finite(point.x) && finite(point.ped_y));
  const motion = recordedAt(d.motion_telemetry ?? [], cursor);
  const scenePoint = recordedAt(path, cursor);
  const egoX = motion ? motion.ego_x_m : scenePoint?.x;
  const targetY = motion ? motion.target_y_m : scenePoint?.ped_y;
  const sceneTime = motion?.t ?? scenePoint?.t;
  const canDraw = path.length > 0 && finite(egoX) && finite(targetY) && finite(d.scene.crossing_x)
    && finite(d.scene.vehicle_length_m) && d.scene.vehicle_length_m > 0 && finite(d.scene.vehicle_width_m) && d.scene.vehicle_width_m > 0;
  const collision = d.events.find(event => event.kind === "collision" && finite(event.t));
  // Map annotations use exact recorded path coordinates, never predicted motion.
  const detection = path.find(point => point.t === m.first_detection_t);
  const activation = path.find(point => point.t === m.aeb_activation_t);
  return <div className={styles.stack}>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Kết quả và chỉ số run">
      <div><p className="analysis-caption">KẾT QUẢ ĐÃ GHI</p><h2 className={styles.headline}>{d.evaluation_valid === false ? "Run chưa đủ điều kiện để kết luận kết quả AEB." : vi(d.headline)}</h2><p className="analysis-caption">{viSummary(d.summary)}</p></div>
      <div className={styles.objectives}>
        <RunFact label="RMS jerk" value={measured(m.rms_jerk_mps3, "m/s³")} note="Giá trị đã lưu từ bộ mô phỏng" />
        <RunFact label="Tốc độ va chạm" value={measured(m.impact_speed_mps, "m/s")} note="Đơn vị SI từ kết quả đã lưu" />
        <RunFact label="Quãng phanh" value={measured(m.stopping_distance_m, "m")} note="Quãng phanh từ kết quả đã lưu" />
      </div>
      <div className={styles.secondary}>
        <RunFact label="TTC nhỏ nhất" value={measured(m.min_ttc_s, "s")} />
        <RunFact label="Khoảng cách nhỏ nhất" value={measured(m.min_distance_m, "m")} />
        <RunFact label="Giảm tốc cực đại" value={measured(m.max_deceleration_mps2, "m/s²")} />
        <RunFact label="Phát hiện lần đầu" value={measured(m.first_detection_t, "s")} note={`Cự ly: ${measured(m.first_detection_distance_m, "m")}`} />
        <RunFact label="AEB kích hoạt" value={measured(m.aeb_activation_t, "s")} note={`TTC: ${measured(m.aeb_activation_ttc_s, "s")}`} />
        <RunFact label="Nguồn chỉ số" value={m.metric_source === "SIMULATOR_RESULT" ? "Kết quả run đã lưu" : "Chưa xác định"} note={d.evaluation_version ? `Đánh giá: ${d.evaluation_version}` : "API chưa có phiên bản đánh giá"} />
      </div>
    </section>
    <div className={styles.columns}>
      <section className={`analysis-panel ${styles.stack}`} aria-label="Cảnh chạy đã ghi">
        <div><h2>Cảnh chạy tại khung đã ghi</h2><p className="analysis-caption">{finite(sceneTime) ? `Khung t = ${sceneTime.toFixed(2)} s. ` : ""}Đồ họa từ tọa độ đã lưu; đường đi được API rút gọn.</p></div>
        {canDraw ? <ScenarioMap crossingX={d.scene.crossing_x} vehicleLengthM={d.scene.vehicle_length_m} vehicleWidthM={d.scene.vehicle_width_m}
          path={path} pedY={path.map(point => point.ped_y)} egoX={egoX} pedYNow={targetY}
          aebX={activation?.x} detectionX={detection?.x} collision={Boolean(collision && cursor >= collision.t)}
          egoLabel={`Xe ${d.vehicle}`} pedestrianLabel="Người đi bộ · tọa độ đã ghi" />
          : <div className="analysis-state">Không đủ tọa độ hoặc kích thước xe tại khung này để dựng cảnh.</div>}
        <p className="analysis-caption">Đổi mốc thời gian phía trên để xem khung khác. Cảnh sử dụng tọa độ của khung đã chọn.</p>
      </section>
      <section className="analysis-panel" aria-label="Cấu hình và môi trường đã lưu">
        <h2>Cấu hình lúc chạy</h2>
        <dl className={styles.rows}>{configuration.map(param => <ConfigRow key={param.code} label={PARAM_NAMES[param.code] ?? vi(param.name || param.code)} value={finite(param.value) ? paramValue(param.value, param.unit) : "—"} highlight={implicated.has(param.code)} />)}</dl>
        {!configuration.length && <p className="analysis-caption">API chưa có thông số cấu hình để hiển thị.</p>}
        <h3 className={styles.subheading}>MÔI TRƯỜNG</h3>
        <dl className={styles.rows}>
          <ConfigRow label="Tốc độ xe ego" value={measured(d.environment.ego_speed_kmh, "km/h")} />
          <ConfigRow label="Khoảng cách kích hoạt tình huống" value={measured(d.environment.trigger_distance_m, "m")} />
          <ConfigRow label="Tốc độ người đi bộ" value={measured(d.environment.pedestrian_speed_mps, "m/s")} />
          <ConfigRow label="Hành vi người đi bộ" value={typeof d.environment.stops_at_curb === "boolean" ? d.environment.stops_at_curb ? "Dừng ở lề" : "Băng qua" : "—"} />
          <ConfigRow label="Thời tiết · thời điểm" value={`${d.environment.weather ? viWeather(d.environment.weather) : "—"} · ${d.environment.time_of_day ? viTime(d.environment.time_of_day) : "—"}`} />
          <ConfigRow label="Ma sát mặt đường μ" value={metric(d.environment.road_friction)} />
        </dl>
        <p className="analysis-caption mt-3">{d.failure_class ? `Khâu lỗi do backend xác định: ${analysisLabel(d.failure_class)}. Thông số tô màu là thông số được luật đánh giá nêu.` : "Cấu hình từ API của run; không tự suy ra thông số cần chỉnh."}</p>
      </section>
    </div>
    <section className="analysis-panel" aria-label="Ca lỗi tương tự"><h2>Ca lỗi tương tự</h2>
      {!d.similar.length && <p className="analysis-caption mt-3">Chưa có ca lỗi nào khác.</p>}
      {d.similar.map(run => <Link key={run.run_id} className={styles.similar} href={`/analysis/failures/${run.run_id}?returnTo=${encodeURIComponent(returnTo)}`}>
        <strong>{runCode(run.run_id)}</strong><span>{run.variant} · {viSummary(run.summary)}</span><strong>{run.similarity_pct}%</strong>
      </Link>)}
    </section>
  </div>;
}

export function RunFact({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className={styles.fact} aria-label={label}><dl><dt>{label}</dt><dd>{value}</dd></dl>{note && <small>{note}</small>}</div>;
}

function ConfigRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className={styles.row} data-highlight={highlight}><dt>{label}</dt><dd>{value}</dd></div>;
}
