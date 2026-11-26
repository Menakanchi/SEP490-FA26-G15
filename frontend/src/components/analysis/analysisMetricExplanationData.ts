import type { AnalysisRun, FailureDetail } from "@/types/vehicsim";
import { formatMeasurement, formatRunImpact } from "./analysisMetricFormat";

export type ExplanationMetric = "rms" | "impact" | "stopping" | "ttc" | "separation" | "deceleration" | "timeline";
type Input = { label: string; value: string; field: string };
type Method = { title: string; definition: string; field: string; unit: string; interpretation: string; limitations: string[] };
const METHODS: Record<ExplanationMetric, Method> = {
  rms: {
    title: "RMS jerk", field: "rms_jerk_mps3", unit: "m/s³",
    definition: "Độ lớn hiệu dụng của tốc độ thay đổi gia tốc theo phương pháp producer đã dùng.",
    interpretation: "Hỗ trợ quan sát độ êm; riêng giá trị này chưa chứng minh an toàn hoặc mức thoải mái của người thật.",
    limitations: ["Jerk trên biểu đồ là sai phân gia tốc theo timestamp, không phải objective RMS đã lưu. Không dùng sensor jerk hoặc chart để tính lại objective.", "API chưa trả signal/filter/window và T_AEB của từng run. Không dùng brake_onset_t làm T_AEB của CARLA."]
  },
  impact: {
    title: "Tốc độ va chạm", field: "impact_speed_mps", unit: "m/s",
    definition: "Số đo va chạm từng run đã lưu. Định nghĩa tốc độ ego hay tương đối phụ thuộc producer lịch sử.",
    interpretation: "Tốc độ còn lại khi va chạm chưa xác định lỗi AEB hoặc khả năng tránh va chạm.",
    limitations: ["ADR-055 thay tốc độ ego bằng tốc độ tương đối cho định danh mới; không dùng định nghĩa hiện tại để diễn giải chắc chắn run cũ hoặc profile chưa xác minh.", "API chưa chiếu physical contact impact riêng. Không gộp sensor impact với canonical impact.", "Không va chạm: số đo từng run là null. Giá trị 0 cho ca không va chạm chỉ là quy ước objective aggregate của run hợp lệ, không phải contact đã đo."]
  },
  stopping: {
    title: "Quãng phanh", field: "stopping_distance_m", unit: "m",
    definition: "Giá trị đã lưu có thể gồm quãng đi trong trace từ pha phanh và phần ngoại suy khi run kết thúc mà xe còn chạy.",
    interpretation: "Không luôn là quãng dừng đã đo. Quãng ngắn hơn chưa chắc tốt hơn: trace có thể bị cắt bởi va chạm hoặc kết thúc run.",
    limitations: ["API Detail chưa trả x_onset và a_available của phép tính, cũng chưa tách trace component và extrapolated component. Cả hai phần chưa xác định riêng; không tự chia hoặc thay số.", "Theo source, phần đuôi có thể dùng v²/(2a_available) với giả định giảm tốc không đổi. Mốc vị trí đầu bước phanh thay đổi theo vintage; profile chưa xác minh thì không áp một công thức chung.", "Configured deceleration khác achieved deceleration; không thay a_available bằng tham số cấu hình hay giảm tốc cực đại đã đo."]
  },
  ttc: {
    title: "TTC nhỏ nhất", field: "min_ttc_s", unit: "s",
    definition: "TTC ground truth nhỏ nhất do backend cung cấp; khác TTC nhận thức và thời điểm va chạm đã quan sát.",
    interpretation: "TTC 1D không phải physical collision truth trong bài toán 2D; TTC có số chưa có nghĩa controller phải phanh.",
    limitations: ["GT và perception là hai nguồn khác nhau; không dùng GT thay TTC nhận thức thiếu.", "API chưa trả timestamp đạt cực tiểu hoặc lý do null; không thay bằng tốc độ ban đầu hay khoảng cách kích hoạt."]
  },
  separation: {
    title: "Khoảng cách nhỏ nhất", field: "min_distance_m", unit: "m",
    definition: "Độ hở hình học nhỏ nhất đã lưu, khác radar range hoặc khoảng cách tới vạch.",
    interpretation: "Geometric overlap không phải sensor contact; riêng độ hở chưa xác định nguyên nhân lỗi.",
    limitations: ["Geometry và sampling phụ thuộc producer; chưa có timestamp min trong API.", "Cảnh người đi bộ không thay hình học hai xe; không dùng khoảng cách tới vạch làm dynamic gap của CCR."]
  },
  deceleration: {
    title: "Giảm tốc cực đại", field: "max_deceleration_mps2", unit: "m/s²",
    definition: "Độ lớn giảm tốc cực đại đã lưu từ producer; khác giảm tốc đặt trong cấu hình.",
    interpretation: "Không chứng minh lực phanh khả dụng hoặc mức pedal đã áp dụng.",
    limitations: ["Gia tốc CARLA trong frame có thể đã làm mượt/kẹp, khác vector IMU thô. API chưa xác minh signal/filter/window của run.", "Bàn đạp 100% không tương đương một mức giảm tốc cố định; phụ thuộc xe, tốc độ và hiệu chuẩn."]
  },
  timeline: {
    title: "Quyết định AEB", field: "aeb_activation_t", unit: "s",
    definition: "Mốc quyết định AEB đã lưu, khác pedal được áp dụng và thời điểm xe thực sự giảm tốc.",
    interpretation: "Chỉ đối chiếu mốc có thật; không dựng onset bằng delay cấu hình hoặc TTC.",
    limitations: ["Detail chưa có hazard onset, writer attribution của pedal và physical braking onset đã xác minh. gt_start không tự là hazard onset.", "Run OFF có thể có quyết định shadow; response hiện chưa cung cấp AEB mode. Không suy đã phanh từ aeb=true."]
  }
};
// Identifiers are source references, not proof of engine revision or runtime equivalence.
const CARLA_REFERENCE = new Set(Array.from({ length: 7 }, (_, i) => `carla-0.9.16-xosc${i + 9}`));
export const UNVERIFIED_METHOD = "Chưa xác minh phương pháp tính từ nguồn dữ liệu này";

export function metricExplanation(kind: ExplanationMetric, detail: FailureDetail, run: AnalysisRun | null) {
  const content = { ...METHODS[kind] };
  const category = detail.environment.category;
  const cp = category === "CP_CROSSING", lead = ["CCRS", "CCRM", "CCRB"].includes(category ?? "");
  const sim = detail.simulator ?? "";
  const engine = sim === "vehicsim-kinematic-1.0" || sim === "vehicsim-kinematic-1.4" ? "Động học Java"
    : CARLA_REFERENCE.has(sim) || sim === "carla-0.9.16-xosc5" ? "CARLA qua lõi Java" : "Chưa xác định phương pháp simulator";
  const reference = detail.metrics.metric_source === "SIMULATOR_RESULT" && (cp || lead);
  let method = "API chưa có đủ metadata để đối chiếu producer lịch sử; không chọn công thức theo tên run.";
  if (reference && kind === "rms" && CARLA_REFERENCE.has(sim))
    method = "Tham khảo ADR-055 và source CARLA: gia tốc lọc Butterworth bậc 6 mỗi lượt xuôi/ngược, 10 Hz, từ T_AEB tới hết run. Chưa xác minh run này thực thi đúng profile đó.";
  else if (reference && kind === "rms" && sim === "vehicsim-kinematic-1.4")
    method = "Tham khảo source động học 1.4: jerk chưa lọc theo dt danh định, từ brake_onset_t. Không áp cách này cho CARLA; chưa xác minh source revision của run.";
  else if (reference && kind === "ttc" && engine !== "Chưa xác định phương pháp simulator")
    method = cp ? "Tham khảo source CP: gap / v_ego khi người trong hành lang, gap > 0, v_ego > 0,1 m/s. Không phải chứng minh collision course 2D."
      : "Tham khảo source CCR: gap / (v_ego − v_target,x) khi tiến gần và mục tiêu trong path. Không dùng tốc độ ego thay closing speed.";
  else if (reference && kind === "separation" && engine !== "Chưa xác định phương pháp simulator")
    method = cp ? "Tham khảo source CP: độ hở giữa thân xe và mô hình người; không phải radar range."
      : "Tham khảo source CCR: khoảng hở giữa hai hộp xe; không phải khoảng cách tâm.";
  const inputs: Input[] = [];
  const add = (label: string, value: unknown, unit: string, field: string) => inputs.push({ label, value: formatMeasurement(value, unit, undefined, true), field });
  const config = (code: string) => detail.configuration.find(param => param.code === code)?.value;
  if (kind === "ttc") {
    add("Ngưỡng TTC cấu hình", detail.ttc_threshold_s, "s", "ttc_threshold_s");
    add("TTC nhận thức tại quyết định · số đo khác", detail.metrics.aeb_activation_ttc_s, "s", "metrics.aeb_activation_ttc_s");
  } else if (kind === "separation") {
    add("Chiều dài ego", detail.scene.vehicle_length_m, "m", "scene.vehicle_length_m");
    add("Chiều rộng ego", detail.scene.vehicle_width_m, "m", "scene.vehicle_width_m");
  } else if (kind === "rms" || kind === "stopping") {
    add("brake_onset_t đã ghi · chưa xác minh writer", detail.metrics.brake_onset_t, "s", "metrics.brake_onset_t");
    if (run?.run_id === detail.run_id) add("Bước danh định cấu hình · không phải bước đo", run.dt, "s", "run.dt");
  } else if (kind === "deceleration") {
    add("Giảm tốc tối đa cấu hình · không phải a_available", config("MAX_DECELERATION"), "m/s²", "configuration[code=MAX_DECELERATION].value");
    add("Ma sát cấu hình μ", detail.environment.road_friction, "", "environment.road_friction");
  } else if (kind === "timeline") {
    // Only expose recorded timestamps. Unknown physical stages stay in limitations above.
    for (const [key, label] of [["first_detection_t", "Phát hiện lần đầu"], ["aeb_activation_t", "Quyết định AEB"], ["brake_onset_t", "Bắt đầu lệnh phanh"]] as const) {
      const value = detail.metrics[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) add(label, value, "s", `metrics.${key}`);
    }
    for (const event of detail.events.filter(e => ["collision", "stopped"].includes(e.kind) && Number.isFinite(e.t) && e.t >= 0)) add(event.kind === "collision" ? "Sự kiện va chạm" : "Sự kiện dừng", event.t, "s", `events[kind=${event.kind}].t`);
    add("Trễ kích hoạt cấu hình", config("BRAKE_ACTIVATION_DELAY"), "s", "configuration[code=BRAKE_ACTIVATION_DELAY].value");
    add("Trễ lệnh đã lưu", Array.isArray(detail.stage_evidence) ? detail.stage_evidence.find(e => e?.stage === "CONTROL" && e.values)?.values?.response_time_s : null, "s", "stage_evidence[stage=CONTROL].values.response_time_s");
  }
  const rawValue = detail.metrics[content.field as keyof FailureDetail["metrics"]];
  if (kind === "impact") inputs.push({ label: "Giá trị trường đã lưu · chưa xác nhận contact", field: "metrics.impact_speed_mps",
    value: typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue >= 0 ? `${String(rawValue)} m/s` : "—" });
  const value = kind === "impact" ? formatRunImpact(rawValue, detail) : formatMeasurement(rawValue, content.unit, kind === "rms" || kind === "stopping" ? 3 : undefined, true);
  return { ...content, formula: null, variables: null, method, profileStatus: UNVERIFIED_METHOD,
    conditions: "Chưa đủ category, source revision và metadata signal/filter/window để xác nhận phép tính lịch sử. Không tự tính lại từ biểu đồ.",
    category: typeof category === "string" && category ? category : "Chưa có category trong API", engine, inputs, value: kind === "impact" && value !== "—" ? `${value} m/s` : value,
    source: typeof detail.metrics.metric_source === "string" ? detail.metrics.metric_source : "Chưa có nguồn metric trong API" };
}
