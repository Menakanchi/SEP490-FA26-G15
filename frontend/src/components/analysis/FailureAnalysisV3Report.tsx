"use client";

import { diagnosticPresentation, hypothesisPresentation, missingEvidencePresentation, objectivePresentation, object, type DiagnosticReport } from "./failureAnalysisV3Data";
import styles from "./FailureAnalysisV3.module.css";

type Measure = { value: number; clock: string | null; frame: string | null; conditional: boolean };
function measure(value: unknown, unit: string, allowNegative = false): Measure | null {
  const e = object(value);
  if (!["OBSERVED", "DERIVED", "CONDITIONAL"].includes(String(e.status)) || e.unit !== unit || typeof e.value !== "number" || !Number.isFinite(e.value) || (!allowNegative && e.value < 0)) return null;
  return { value: e.value, clock: typeof e.clock_id === "string" ? e.clock_id : null, frame: typeof e.frame_id === "string" ? e.frame_id : null, conditional: e.status === "CONDITIONAL" };
}
const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
const display = (m: Measure, unit: string) => `${fmt(m.value)} ${unit}${m.conditional ? " · có điều kiện" : ""}`;

export function FailureAnalysisV3Report({ data }: { data: DiagnosticReport }) {
  const report = data.report, result = diagnosticPresentation(report);
  const mode = object(data.input.mode), modeKnown = ["OBSERVED", "DERIVED", "CONDITIONAL"].includes(String(mode.status));
  const modeText = modeKnown && (mode.value === "ON" || mode.value === "OFF") ? `AEB ${mode.value === "ON" ? "bật" : "tắt"}${mode.status === "CONDITIONAL" ? " (cần xác minh)" : ""}` : "Chưa xác định chế độ AEB";
  const timeline = object(report.aeb_timeline), impact = object(report.impact_analysis);
  const actualTimeline = timeline.hypothetical !== true && mode.value !== "OFF" && object(report.observed_behavior).value !== "OFF_HYPOTHETICAL_ONLY";
  const timelineItems = [
    { label: "Phát hiện mục tiêu", value: actualTimeline ? measure(timeline.detection, "s") : null },
    { label: "Quyết định phanh", value: actualTimeline ? measure(timeline.decision, "s") : null },
    { label: "Bắt đầu lệnh phanh theo lõi", value: actualTimeline ? measure(timeline.command_onset, "s") : null },
    { label: "Bắt đầu phanh vật lý", value: actualTimeline ? measure(timeline.physical_onset, "s") : null },
    { label: "Va chạm được ghi nhận", value: impact.admissible_recorded_contact === true ? measure(impact.contact_time, "s") : null },
  ].filter((item): item is { label: string; value: Measure } => item.value !== null);
  const clocks = new Set(timelineItems.map(item => item.value.clock));
  const decisionLatency = actualTimeline ? measure(timeline.decision_latency, "s") : null;
  const commandLatency = actualTimeline ? measure(timeline.command_latency, "s") : null;
  const physicalLatency = actualTimeline ? measure(timeline.command_to_physical_delay, "s") : null;
  const screens = (Array.isArray(report.feasibility_results) ? report.feasibility_results : []).map(object);
  const screen = screens.find(item => item.id === "CONDITIONAL_BRAKE_ONLY_STOPPING_SCREEN");
  const available = measure(screen?.available_distance, "m"), required = measure(screen?.stopping_distance, "m"), margin = measure(screen?.unbuffered_stopping_margin, "m", true);
  const decel = measure(screen?.available_deceleration, "m/s²"), latest = measure(screen?.unbuffered_screen_latest, "s");
  const comparable = available && required && margin && available.clock && available.clock === required.clock && available.clock === margin.clock && available.frame && available.frame === required.frame && available.frame === margin.frame;
  const hypotheses = hypothesisPresentation(report), missing = missingEvidencePresentation(report);
  const confirmed = object(report.confirmed_root_cause);
  const hasConfirmedCause = ["OBSERVED", "DERIVED"].includes(String(confirmed.status)) && typeof confirmed.value === "string" && confirmed.value.trim() !== "";
  const causeLabels: Record<string, string> = { TARGET_DETECTION: "Phát hiện mục tiêu", TRIGGER_CONDITION: "Điều kiện kích hoạt", INTERVENTION_TIMING: "Thời điểm can thiệp", BRAKING_DELAY: "Độ trễ phanh", DECELERATION: "Khả năng giảm tốc", BRAKE_BUILDUP: "Tốc độ tăng lực phanh", RISK_PREDICTION: "Dự đoán nguy cơ", PHYSICAL_LIMIT: "Giới hạn vật lý", EXTERNAL: "Điều kiện bên ngoài AEB" };
  const pair = object(report.paired_mitigation), reduction = pair.pairing_status === "MATCHED_RECORDED_CONTEXT" ? measure(pair.observed_speed_reduction, "m/s", true) : null;
  return <article className={styles.report} aria-label="Kết quả phân tích">
    <header>
      <p>Lượt chạy {data.input.run_key} · {modeText}</p>
      <h2>Kết luận: {result.conclusion}</h2>
      <p>{result.outcomeText}. {result.behaviorText}.</p>
      <p className="analysis-caption">Kết quả va chạm và đánh giá trách nhiệm AEB là hai thông tin riêng.</p>
      <p className="analysis-caption">Đây là nhận định trong báo cáo đã lưu; điều kiện áp dụng và phê duyệt cần được kiểm tra lại trước khi ra quyết định.</p>
    </header>
    {result.candidates.length > 0 && <section><h3>Dấu hiệu AEB</h3><ul className={styles.findings}>
      {result.candidates.map((candidate, i) => <li key={i}><strong>{candidate.label}</strong><span>{candidate.supported ? "Có bằng chứng hỗ trợ" : "Nghi ngờ — chưa xác nhận"}</span></li>)}
    </ul></section>}
    {result.hasUnknownCandidates && <p role="status">Một dấu hiệu chưa thể diễn giải; cần kiểm tra thêm.</p>}
    <section aria-label="Ba chỉ số chính"><h3>Ba chỉ số chính</h3><dl className={styles.metrics}>
      {objectivePresentation(report).map(metric => <div key={metric.key} className={styles.metric}><dt>{metric.label}</dt><dd><strong>{metric.text}</strong></dd>{metric.key === "stopping_distance_m" && <small>Chỉ số gốc của lượt chạy; có thể gồm phần ngoại suy.</small>}</div>)}
    </dl></section>
    <section><h3>Diễn biến tình huống</h3>
      {timelineItems.length ? <ul className={styles.findings}>{timelineItems.map(item => <li key={item.label}><strong>{item.label}</strong><span>{display(item.value, "s")}{clocks.size > 1 || !item.value.clock ? ` · ${item.value.clock === "core" ? "đồng hồ mô phỏng" : item.value.clock === "recorder" ? "đồng hồ ghi nhận" : "chưa rõ đồng hồ"}` : ""}</span></li>)}</ul> : <p>Chưa có mốc diễn biến được ghi nhận đủ điều kiện.</p>}
      {(clocks.size > 1 || clocks.has(null)) && timelineItems.length > 1 && <p className="analysis-caption">Các mốc khác đồng hồ hoặc chưa rõ đồng hồ chưa thể so sánh trực tiếp.</p>}
      {(decisionLatency || commandLatency || physicalLatency) && <dl className={styles.summaryGrid}>
        {decisionLatency && <div className={styles.summaryCard}><dt>Phát hiện → quyết định</dt><dd>{display(decisionLatency, "s")}</dd></div>}
        {commandLatency && <div className={styles.summaryCard}><dt>Quyết định → lệnh phanh</dt><dd>{display(commandLatency, "s")}</dd></div>}
        {physicalLatency && <div className={styles.summaryCard}><dt>Lệnh → phanh vật lý</dt><dd>{display(physicalLatency, "s")}</dd></div>}
      </dl>}
      <p className="analysis-caption">Mốc lệnh theo lõi chưa chứng minh lệnh đã được áp dụng hoặc phanh vật lý đã bắt đầu.</p>
    </section>
    {screen && <section><h3>Đối chiếu khoảng cách dừng theo mô hình</h3>
      <p>Tại mốc tham chiếu, khoảng cách hiện có so với khoảng cách dừng tính theo mô hình như thế nào?</p>
      <dl className={styles.summaryGrid}>
        {available && <div className={styles.summaryCard}><dt>Khoảng cách hiện có</dt><dd>{display(available, "m")}</dd></div>}
        {required && <div className={styles.summaryCard}><dt>Khoảng cách dừng theo mô hình</dt><dd>{display(required, "m")}</dd></div>}
        {decel && <div className={styles.summaryCard}><dt>Giảm tốc hiện có theo mô hình</dt><dd>{display(decel, "m/s²")}</dd></div>}
        {margin && <div className={styles.summaryCard}><dt>Chênh lệch chưa tính khoảng an toàn</dt><dd>{display(margin, "m")}</dd></div>}
        {latest && <div className={styles.summaryCard}><dt>Mốc giới hạn theo phép sàng lọc dừng</dt><dd>{display(latest, "s")}</dd></div>}
      </dl>
      {comparable && <p>Chênh lệch theo báo cáo = khoảng cách hiện có − khoảng cách dừng theo mô hình = {fmt(available.value)} − {fmt(required.value)} = {fmt(margin.value)} m.</p>}
      <p className="analysis-caption">Đây là phép sàng lọc dừng một chiều có điều kiện, không phải chỉ số quãng đường dừng; chưa chứng minh khả năng tránh va chạm hai chiều hay xác nhận nguyên nhân lỗi.</p>
    </section>}
    <section><h3>Nguyên nhân và hướng điều tra</h3>
      {hasConfirmedCause ? <p>Nguyên nhân đã xác nhận theo báo cáo: {causeLabels[String(confirmed.value)] ?? "chưa hỗ trợ hiển thị tên nguyên nhân"}.</p> : <p>Chưa có nguyên nhân được xác nhận trong báo cáo.</p>}
      {hypotheses.length > 0 && <ul className={styles.findings}>{hypotheses.map((item, i) => <li key={i}><strong>{item.label}</strong><span>{item.status}</span></li>)}</ul>}
      {hypotheses.some(item => item.type === "INEFFECTIVE_BRAKING_MECHANISM_INVESTIGATION") && <p>Độ trễ quyết định, lệnh phanh và đáp ứng vật lý là các hướng cần kiểm tra; phép sàng lọc dừng không tự xác nhận can thiệp muộn hay nguyên nhân.</p>}
      {hypotheses.some(item => item.type === "FALSE_BRAKING_MECHANISM_INVESTIGATION") && <p>Cần đối chiếu dữ liệu dự đoán và lý do phanh tại thời điểm quyết định; kết quả xảy ra sau đó không tự chứng minh phanh nhầm.</p>}
      {hypotheses.some(item => item.type === "NO_BRAKING_MECHANISM_INVESTIGATION") && <p>Cần kiểm tra chuỗi phát hiện, quyết định và lệnh cùng cơ hội can thiệp hợp lệ.</p>}
      {missing.length > 0 && <><h4>Cần xác minh thêm</h4><ul>{missing.slice(0, 4).map(item => <li key={item}>{item}</li>)}</ul>
        {missing.length > 4 && <details className={styles.details}><summary>Những bằng chứng còn thiếu khác ({missing.length - 4})</summary><ul>{missing.slice(4).map(item => <li key={item}>{item}</li>)}</ul></details>}</>}
    </section>
    {Object.keys(pair).length > 0 && <section><h3>Đối chiếu AEB tắt</h3>{reduction ? <p>Chênh lệch tốc độ va chạm được báo cáo: {display(reduction, "m/s")}. Đây là quan sát đối chiếu, không tự chứng minh quan hệ nhân quả.</p> : <p>Chưa đủ điều kiện để so sánh tốc độ va chạm giữa hai lượt.</p>}</section>}
  </article>;
}
