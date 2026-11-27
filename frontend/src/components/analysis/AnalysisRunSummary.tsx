"use client";

import Link from "next/link";
import { ScenarioMap } from "@/components/ScenarioMap";
import { runCode } from "@/components/VehicSimUi";
import { analysisLabel } from "@/components/analysisUi";
import { vi, viSummary, viTime, viWeather } from "@/components/vehicsimI18n";
import type { ReactNode } from "react";
import type { AnalysisRun, FailureDetail } from "@/types/vehicsim";
import { finite, recordedAt } from "./analysisRunData";
import { formatMeasurement, formatMetric, formatRunImpact } from "./analysisMetricFormat";
import { classificationPresentation, recordedChain } from "./analysisClassificationData";
import { legacyDisagreements, recordedOutcome } from "./analysisResultData";
import { AnalysisClassification } from "./AnalysisClassification";
import { AnalysisMetricExplanation } from "./AnalysisMetricExplanation";
import type { ExplanationMetric } from "./analysisMetricExplanationData";
import styles from "./AnalysisRunDetail.module.css";

const PARAMS = ["TTC_THRESHOLD", "BRAKE_ACTIVATION_DELAY", "MAX_DECELERATION", "BRAKE_BUILDUP_RATE"];
const PARAM_NAMES: Record<string, string> = {
  TTC_THRESHOLD: "TTC Threshold",
  BRAKE_ACTIVATION_DELAY: "Brake Activation Delay",
  MAX_DECELERATION: "Max Deceleration",
  BRAKE_BUILDUP_RATE: "Brake Build-up Rate",
};
const measured = (value: unknown, unit: string) => formatMeasurement(value, unit, undefined, true);
const objective = (value: unknown, unit: string) => formatMeasurement(value, unit, 3, true);

export function AnalysisRunSummary({ detail: d, run, returnTo }: { detail: FailureDetail; run: AnalysisRun | null; returnTo: string }) {
  const m = d.metrics;
  const disagreements = legacyDisagreements(d);
  const impact = formatRunImpact(m.impact_speed_mps, d);
  const explain = (kind: ExplanationMetric) => <AnalysisMetricExplanation kind={kind} detail={d} run={run} returnTo={returnTo} />;
  return <div className={styles.stack}>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Kết quả và chỉ số run">
      <h2>Kết quả quan sát đã lưu</h2>
      <p className={styles.headline} data-recorded-outcome aria-label="Va chạm theo outcome">{recordedOutcome(d)}</p>
      <p className="analysis-caption">Nguồn: kết quả run đã lưu; chưa xác minh tiếp xúc vật lý độc lập hoặc lỗi AEB. Mở Điều tra chuyên sâu để đối chiếu tín hiệu và các mốc được ghi.</p>
      <h3>Ba chỉ số đã lưu</h3>
      <div className={styles.objectives}>
        <RunFact label="RMS jerk" value={objective(m.rms_jerk_mps3, "m/s³")} note="Giá trị đã lưu; không tính lại từ biểu đồ" explanation={explain("rms")} />
        <RunFact label="Tốc độ va chạm" value={impact === "—" ? impact : `${impact} m/s`} note="Không va chạm hoặc thiếu số đo: giữ —, không đổi thành 0" explanation={explain("impact")} />
        <RunFact label="Quãng phanh" value={objective(m.stopping_distance_m, "m")} note="Có thể gồm ngoại suy; quãng ngắn hơn chưa chắc tốt hơn" explanation={explain("stopping")} />
      </div>
      <section className={styles.stack} aria-label="Nhận định theo luật đã lưu">
        <h3>Nhận định theo luật đã lưu</h3>
        <AnalysisClassification detail={d} />
        {disagreements.length > 0 && <div className={styles.source} role="status" data-legacy-disagreements>{disagreements.map(note => <p key={note}>{note}</p>)}</div>}
        <details><summary>Mô tả nhận định đã lưu</summary><p className="analysis-caption">{vi(d.headline) || "API chưa có mô tả nhận định."}</p></details>
      </section>
    </section>
    <section className={`analysis-panel ${styles.stack}`} aria-label="Giới hạn bằng chứng">
      <h2>Giới hạn bằng chứng</h2>
      <p className="analysis-caption">Chưa xác nhận nguyên nhân gốc hoặc thời điểm phanh thực sự tác dụng. Dấu — giữ trường thiếu hoặc không áp dụng; API chưa phân biệt mọi nguyên nhân thiếu dữ liệu.</p>
      <details><summary>Còn thiếu gì để kết luận mạnh hơn?</summary><ul className={styles.limitations}>
        <li>API chưa cung cấp đủ producer, signal, filter và window từng run để xác minh phương pháp tính ba chỉ số. Phiên bản tổng hợp không phải profile của producer.</li>
        <li>Không có contact sensor độc lập, writer của pedal hay mốc phanh vật lý đã được xác minh trong response này.</li>
        <li>Telemetry và chuyển động được backend chiếu từ frames của cùng run. Camera/CSV có đồng hồ riêng; API chưa có binding để ghép với các nguồn đó.</li>
        <li>Cấu hình được API đọc từ DB; chưa chứng minh cấu hình vật lý hoặc baseline v1 đã được xác minh trong artifact lịch sử.</li>
      </ul></details>
      {d.simulator?.startsWith("carla") && <p className="analysis-caption">Hiệu chuẩn CARLA phụ thuộc xe/profile và chưa được API xác nhận cho từng run; số liệu phục vụ quan sát/đối chiếu.</p>}
    </section>
  </div>;
}

export function AnalysisRunContext({ detail: d, run, cursor, returnTo }: { detail: FailureDetail; run: AnalysisRun | null; cursor: number; returnTo: string }) {
  const m = d.metrics;
  const explain = (kind: ExplanationMetric) => <AnalysisMetricExplanation kind={kind} detail={d} run={run} returnTo={returnTo} />;
  const classification = classificationPresentation(d);
  const implicated = new Set(recordedChain(d.chain).filter(stage => classification.trusted && stage.passed === false && stage.parameter_code).map(stage => stage.parameter_code));
  const byCode = new Map(d.configuration.map(param => [param.code, param]));
  const configuration = [...PARAMS, ...[...implicated].filter((code): code is string => code != null && !PARAMS.includes(code))]
    .map(code => byCode.get(code)).filter((param): param is NonNullable<typeof param> => Boolean(param));
  const path = d.scene.path.filter(point => finite(point.t) && finite(point.x) && finite(point.ped_y));
  const motion = recordedAt(d.motion_telemetry ?? [], cursor);
  const scenePoint = recordedAt(path, cursor);
  const egoX = motion ? motion.ego_x_m : scenePoint?.x;
  const targetY = motion ? motion.target_y_m : scenePoint?.ped_y;
  const sceneTime = motion?.t ?? scenePoint?.t;
  const canDraw = d.environment.category === "CP_CROSSING" && path.length > 0 && finite(egoX) && finite(targetY) && finite(d.scene.crossing_x)
    && finite(d.scene.vehicle_length_m) && d.scene.vehicle_length_m > 0 && finite(d.scene.vehicle_width_m) && d.scene.vehicle_width_m > 0;
  const collision = d.events.find(event => event.kind === "collision" && finite(event.t));
  // Map annotations use exact recorded path coordinates, never predicted motion.
  const detection = path.find(point => point.t === m.first_detection_t);
  const activation = path.find(point => point.t === m.aeb_activation_t);
  return <div className={styles.stack}>
    <details className="analysis-disclosure"><summary>Chỉ số bổ sung và nguồn đo</summary>
      <div className={styles.secondary}>
        <RunFact label="TTC nhỏ nhất" value={measured(m.min_ttc_s, "s")} note="TTC GT mô phỏng; — khi không xác định. Va chạm được lưu là 0" explanation={explain("ttc")} />
        <RunFact label="Khoảng cách nhỏ nhất" value={measured(m.min_distance_m, "m")} note="Độ hở hình học nhỏ nhất; khác cự ly tới vạch và radar range" explanation={explain("separation")} />
        <RunFact label="Giảm tốc cực đại" value={measured(m.max_deceleration_mps2, "m/s²")} note="Độ lớn dương; CARLA dùng tín hiệu đã làm mượt và kẹp, không phải IMU thô" explanation={explain("deceleration")} />
        <RunFact label="Phát hiện lần đầu" value={measured(m.first_detection_t, "s")} note={`Cự ly: ${measured(m.first_detection_distance_m, "m")}`} />
        <RunFact label="Quyết định AEB" value={measured(m.aeb_activation_t, "s")} note={`TTC: ${measured(m.aeb_activation_ttc_s, "s")}`} explanation={explain("timeline")} />
        <RunFact label="Nguồn chỉ số" value={m.metric_source === "SIMULATOR_RESULT" ? "Kết quả run đã lưu" : "Chưa xác định"} note={d.evaluation_version ? `Tổng hợp: ${d.evaluation_version}; chưa xác định phiên bản luật chấm` : "API chưa có phiên bản tổng hợp"} />
      </div>
    </details>
    <details className="analysis-disclosure"><summary>Cảnh chạy, cấu hình và môi trường</summary><div className={styles.columns}>
      <section className={`analysis-panel ${styles.stack}`} aria-label="Cảnh chạy đã ghi">
        <div><h2>Cảnh chạy tại khung đã ghi</h2><p className="analysis-caption">{finite(sceneTime) ? `Khung t = ${sceneTime.toFixed(2)} s. ` : ""}Đồ họa từ tọa độ đã lưu; đường đi được API rút gọn.</p></div>
        {canDraw ? <ScenarioMap crossingX={d.scene.crossing_x} vehicleLengthM={d.scene.vehicle_length_m} vehicleWidthM={d.scene.vehicle_width_m}
          path={path} pedY={path.map(point => point.ped_y)} egoX={egoX} pedYNow={targetY}
          aebX={activation?.x} detectionX={detection?.x} collision={Boolean(collision && cursor >= collision.t)}
          egoLabel={`Xe ${d.vehicle}`} pedestrianLabel="Người đi bộ · tọa độ đã ghi" />
          : <div className="analysis-state">Không đủ category, tọa độ hoặc kích thước để dựng cảnh người đi bộ. Không dựng hình người đi bộ cho mục tiêu xe phía trước.</div>}
        <p className="analysis-caption">Đổi mốc thời gian phía trên để xem khung khác. Cảnh sử dụng tọa độ của khung đã chọn.</p>
      </section>
      <section className="analysis-panel" aria-label="Cấu hình và môi trường đã lưu">
        <h2>Cấu hình lúc chạy</h2>
        <dl className={styles.rows}>{configuration.map(param => <ConfigRow key={param.code} label={PARAM_NAMES[param.code] ?? vi(param.name || param.code)} value={finite(param.value) ? formatMeasurement(param.value, param.unit === "m/s2" ? "m/s²" : param.unit === "m/s3" ? "m/s³" : param.unit, undefined, true) : "—"} highlight={implicated.has(param.code)} />)}</dl>
        {!configuration.length && <p className="analysis-caption">API chưa có thông số cấu hình để hiển thị.</p>}
        <h3 className={styles.subheading}>MÔI TRƯỜNG</h3>
        <dl className={styles.rows}>
          <ConfigRow label="Tốc độ xe ego" value={measured(d.environment.ego_speed_kmh, "km/h")} />
          <ConfigRow label="Khoảng cách kích hoạt tình huống" value={measured(d.environment.trigger_distance_m, "m")} />
          <ConfigRow label="Tốc độ người đi bộ" value={measured(d.environment.pedestrian_speed_mps, "m/s")} />
          <ConfigRow label="Hành vi người đi bộ" value={typeof d.environment.stops_at_curb === "boolean" ? d.environment.stops_at_curb ? "Dừng ở lề" : "Băng qua" : "—"} />
          <ConfigRow label="Thời tiết · thời điểm" value={`${d.environment.weather ? viWeather(d.environment.weather) : "—"} · ${d.environment.time_of_day ? viTime(d.environment.time_of_day) : "—"}`} />
          <ConfigRow label="Ma sát mặt đường μ" value={formatMetric(d.environment.road_friction, 2, true)} />
        </dl>
        <p className="analysis-caption mt-3">{d.failure_class ? `Khâu được luật nhắc tới: ${analysisLabel(d.failure_class)}. Thông số tô màu là thông số được luật đánh giá nêu.` : "Cấu hình từ API của run; không tự suy ra thông số cần chỉnh."}</p>
      </section>
    </div></details>
    <details className="analysis-disclosure"><summary>Ca có cấu hình gần</summary><section className="analysis-panel" aria-label="Ca lỗi tương tự"><h2>Ca có cấu hình gần</h2><p className="analysis-caption">Độ gần theo tham số do backend tính, không phải xác suất lỗi, bằng chứng cùng nguyên nhân hay hiệu quả nhân quả. Không xác nhận cặp ON/OFF chỉ từ cấu hình gần.</p>
      {!d.similar.length && <p className="analysis-caption mt-3">Chưa có ca lỗi nào khác.</p>}
      {d.similar.map(run => <Link key={run.run_id} className={styles.similar} href={`/analysis/failures/${run.run_id}?returnTo=${encodeURIComponent(returnTo)}`}>
        <strong>{runCode(run.run_id)}</strong><span>{run.variant} · {viSummary(run.summary)}</span><strong>Độ gần theo tham số: {finite(run.similarity_pct) ? `${run.similarity_pct}%` : "—"}</strong>
      </Link>)}
    </section></details>
  </div>;
}

export function RunFact({ label, value, note, explanation }: { label: string; value: string; note?: string; explanation?: ReactNode }) {
  return <div className={styles.fact} aria-label={label}><dl><dt>{label}</dt><dd>{value}</dd></dl>{note && <small>{note}</small>}{explanation}</div>;
}

function ConfigRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className={styles.row} data-highlight={highlight}><dt>{label}</dt><dd>{value}</dd></div>;
}
