import type { AnalysisRun, FailureDetail } from "@/types/vehicsim";
import { formatMeasurement, formatRunImpact } from "./analysisMetricFormat";

export type ExplanationMetric = "rms" | "impact" | "stopping" | "ttc" | "separation" | "deceleration" | "timeline";
type Input = { label: string; value: string; field: string };
type Method = { title: string; definition: string; field: string; unit: string; formula: string; variables: string;
  conditions: string; interpretation: string; limitations: string[]; method: string };

const METHODS: Record<ExplanationMetric, Method> = {
  rms: {
    title: "RMS jerk", field: "rms_jerk_mps3", unit: "m/s³",
    definition: "Độ lớn hiệu dụng của tốc độ thay đổi gia tốc trong pha phanh đã ghi.",
    formula: "jᵢ = (aᵢ − aᵢ₋₁) / dt; RMS = √(Σjᵢ² / N)",
    variables: "aᵢ: gia tốc ego có dấu (m/s²); dt: bước danh định (s); N: số mẫu từ onset lệnh đến hết run. Mẫu trước onset được dùng làm aᵢ₋₁; nếu không có thì dùng 0.",
    conditions: "Simulator.brakePhaseMetrics chọn frame đầu t ≥ brake_onset_t (có sai số so khớp nhỏ). Không có onset/frame phù hợp thì trả null.",
    interpretation: "Hỗ trợ quan sát độ êm của pha phanh; RMS cao riêng lẻ không kết luận AEB không an toàn hoặc mức thoải mái của người thật.",
    limitations: ["Objective canonical dùng dt danh định, không thêm lọc trong phép RMS; gia tốc đầu vào CARLA đã được xử lý. Có thể gồm đoạn dừng gấp và khung cuối va chạm.", "Jerk trên biểu đồ dùng Δa/Δt theo timestamp thực, ngắt khi thiếu/trùng mẫu; khác objective này. IMU/sensor recomputation và RMS lọc thử nghiệm không ghi đè số đã lưu.", "API chưa trả đầy đủ mẫu/đầu vào và phiên bản công thức để tái lập RMS tại đây; giao diện không tính lại."],
    method: "Simulator.brakePhaseMetrics · canonical",
  },
  impact: {
    title: "Tốc độ va chạm", field: "impact_speed_mps", unit: "m/s",
    definition: "Tốc độ ego ở frame cuối của run khi bộ mô phỏng ghi nhận va chạm; không phải tốc độ tương đối với mục tiêu.",
    formula: "impact_speed_mps = v_ego,last nếu collision; ngược lại null",
    variables: "v_ego,last: tốc độ ego (m/s) ở frame cuối; collision: cờ va chạm canonical. Hiển thị km/h ở nơi khác dùng m/s × 3,6.",
    conditions: "Chỉ trình bày số đo từng run đã hoàn tất và có outcome COLLISION; không đổi null thành 0.",
    interpretation: "Cho biết tốc độ còn lại khi va chạm, chưa đủ xác định lỗi điều khiển, bỏ sót phanh hoặc khả năng tránh va chạm.",
    limitations: ["Relative impact của CCR và sensor recomputation là đại lượng/nguồn khác, chưa được chiếu riêng vào metric này.", "Trong aggregate backend, run hợp lệ không va chạm đóng góp 0 là quy ước tổng hợp; đó không phải số đo va chạm từng run."],
    method: "Simulator / LeadVehicleSimulator.summaryMetrics",
  },
  stopping: {
    title: "Quãng phanh", field: "stopping_distance_m", unit: "m",
    definition: "Quãng đã đi từ onset lệnh phanh cộng phần ngoại suy khi run kết thúc mà xe còn chạy.",
    formula: "d = (x_last − x_onset) + v_last² / (2 × a_available), khi a_available > 0",
    variables: "x_last, x_onset: vị trí mũi ego (m); v_last: tốc độ cuối (m/s); a_available: độ lớn giảm tốc khả dụng (m/s²). Nếu a_available ≤ 0, code dùng phần còn lại bằng 0.",
    conditions: "Không có onset/frame pha phanh thì null. Bắt đầu từ onset lệnh, không bao gồm quãng phản ứng từ quyết định đến onset.",
    interpretation: "Không luôn là quãng dừng đã đo. Phần ngoại suy giả định giảm tốc không đổi; không phải required stopping distance hay khoảng trống còn đủ để tránh va chạm.",
    limitations: ["Động học dùng min(AEB max, xe max, μg); CARLA xosc5 thêm giới hạn phanh 100% theo cấu hình. File cũ giữ cách tính cũ.", "API Detail chưa trả x_onset và a_available của phép tính; không thay số bằng giảm tốc cực đại đã đo hoặc tham số cấu hình.", "CARLA còn lệch ở tốc độ thấp/ma sát; phần ngoại suy không chứng minh xe thực dừng đúng quãng này."],
    method: "Simulator.brakePhaseMetrics · observed + extrapolated",
  },
  ttc: {
    title: "TTC nhỏ nhất", field: "min_ttc_s", unit: "s",
    definition: "Giá trị nhỏ nhất của TTC ground truth trong các frame hợp lệ; code lưu 0 khi va chạm. Khác TTC nhận thức và thời điểm va chạm đã quan sát.",
    formula: "", variables: "", conditions: "",
    interpretation: "TTC là dự đoán với vận tốc tức thời giữ không đổi, không phải đồng hồ đếm chắc chắn tới va chạm. Điều kiện quỹ đạo và chuyển động ngang được xét riêng trong controller.",
    limitations: ["TTC nhận thức yêu cầu phát hiện, perceived_y có số, gap > 0 và closing ≥ 2 m/s; hành lang dự đoán dùng y_seen + vy_filtered × min(TTC, 2 s). TTC nhận thức có số chưa có nghĩa controller phải phanh.", "Không tiến gần, ngoài điều kiện GT/path hoặc thiếu tín hiệu có thể không có TTC; API không phân biệt mọi nguyên nhân null. Không dùng GT thay TTC nhận thức thiếu.", "Sampling có thể bỏ cực tiểu; API chưa trả timestamp đạt min. Không thay số từ tốc độ ban đầu hoặc khoảng cách kích hoạt tình huống."],
    method: "groundTruthTtc / summaryMetrics; AebStack.decide cho TTC nhận thức",
  },
  separation: {
    title: "Khoảng cách nhỏ nhất", field: "min_distance_m", unit: "m",
    definition: "Độ hở hình học nhỏ nhất giữa ego và mục tiêu theo các frame, không phải khoảng cách tâm, radar range hay khoảng cách tới vạch.",
    formula: "", variables: "", conditions: "Va chạm được lưu là 0; không có mẫu hợp lệ thì không có số đo.",
    interpretation: "Khoảng cách nhỏ hỗ trợ xem xét biên an toàn; riêng số đo này không xác định nguyên nhân lỗi AEB.",
    limitations: ["Dùng hình học và lấy mẫu của simulator, không phải khoảng cách đo thực địa. Chưa có timestamp min trong API.", "Cảnh CCR hiện còn giới hạn hình học; không dùng khoảng cách tới vạch trên biểu đồ làm dynamic gap tới xe mục tiêu."],
    method: "Simulator / LeadVehicleSimulator.summaryMetrics",
  },
  deceleration: {
    title: "Giảm tốc cực đại", field: "max_deceleration_mps2", unit: "m/s²",
    definition: "Độ lớn dương lớn nhất của tín hiệu giảm tốc được lõi đưa vào MotionStats; gia tốc ego trong frame mang dấu âm khi phanh.",
    formula: "a_max = max(a_decel,i); ego_a = −a_decel",
    variables: "a_decel,i: độ lớn giảm tốc từng bước (m/s²); khác lệnh giảm tốc và khác vector IMU thô.",
    conditions: "Động học dùng min(lệnh, μg). CARLA dùng max(0, (v_đầu − v_cuối)/(dt × (n−1))) trong cửa sổ khoảng 0,1 s khi braking, rồi kẹp μg. dt là bước danh định; n là số mẫu tốc độ.",
    interpretation: "Cho biết tín hiệu giảm tốc cực đại đã lưu, không chứng minh lực phanh khả dụng hoặc mức pedal đã áp dụng.",
    limitations: ["Gia tốc CARLA đã làm mượt/kẹp và có thể khác IMU; số 0 cực đại legacy được lưu null.", "Bàn đạp 100% không tương đương một mức giảm tốc cố định; phụ thuộc xe, tốc độ và hiệu chuẩn. API chưa có calibration version từng run."],
    method: "Simulator.MotionStats; CARLA DecelMeter.update",
  },
  timeline: {
    title: "Quyết định AEB", field: "aeb_activation_t", unit: "s",
    definition: "Mốc controller quyết định AEB, khác onset lệnh, pedal thật được áp dụng và thời điểm xe thực sự giảm tốc.",
    formula: "t_onset là tick đầu t ≥ t_decision + delay_config + 0,10 s",
    variables: "t_decision, t_onset: mốc controller (s); delay_config: BRAKE_ACTIVATION_DELAY (s); 0,10 s là hằng actuator của mô hình. Tick làm lượng tử hóa thời điểm.",
    conditions: "Quyết định cần TTC và hành lang thỏa luật AebStack. Đọc mốc đã ghi, không sinh mốc từ công thức ở frontend.",
    interpretation: "Trễ lệnh phanh lưu ở backend là onset − decision khi cả hai có dữ liệu; không phải độ trễ đáp ứng vật lý đã đo.",
    limitations: ["Detail chưa có hazard onset, applied pedal và physical-deceleration onset riêng. gt_start chỉ là sự kiện mục tiêu bắt đầu hành vi, không tự coi là hazard onset.", "Các mốc va chạm/dừng chỉ lấy từ event đã ghi. Không suy dừng từ tốc độ 0 hoặc suy applied brake từ aeb=true."],
    method: "AebStack.decide/control; metrics + events đã lưu",
  },
};

export function metricExplanation(kind: ExplanationMetric, detail: FailureDetail, run: AnalysisRun | null) {
  const content = { ...METHODS[kind] };
  const category = detail.environment.category;
  const cp = category === "CP_CROSSING", lead = ["CCRS", "CCRM", "CCRB"].includes(category ?? "");
  const engine = detail.simulator === "vehicsim-kinematic-1.0" ? "Động học Java"
    : /^carla-\d+\.\d+\.\d+-xosc[345]$/.test(detail.simulator ?? "") ? "CARLA qua lõi Java" : "Chưa xác định phương pháp simulator";
  const known = (cp || lead) && detail.metrics.metric_source === "SIMULATOR_RESULT" && engine !== "Chưa xác định phương pháp simulator";
  const inputs: Input[] = [];
  const add = (label: string, value: unknown, unit: string, field: string) => inputs.push({ label, value: formatMeasurement(value, unit, undefined, true), field });
  const config = (code: string) => detail.configuration.find(param => param.code === code)?.value;
  if (kind === "ttc") {
    content.formula = cp ? "TTC_GT = gap / v_ego; min_ttc = min(TTC_GT hợp lệ), va chạm → 0"
      : "TTC_GT = gap / (v_ego − v_target,x); min_ttc = min(TTC_GT hợp lệ), va chạm → 0";
    content.variables = cp ? "gap: từ mũi ego tới vạch băng ngang (m); v_ego: tốc độ ego (m/s). TTC nhận thức dùng cùng vận tốc dọc vì target_vx=0."
      : "gap: từ mũi ego tới đuôi xe mục tiêu (m); v_ego, v_target,x: vận tốc dọc (m/s). Không dùng tốc độ ego thay closing speed.";
    content.conditions = cp ? "GT chỉ tính khi người nằm trong hành lang hình học, gap > 0 và v_ego > 0,1 m/s."
      : "GT chỉ tính khi mục tiêu trong path, gap > 0 và closing > 0,1 m/s; cùng tốc độ/đi xa thì null.";
    add("Ngưỡng TTC cấu hình", detail.ttc_threshold_s, "s", "ttc_threshold_s");
    add("TTC nhận thức tại quyết định · số đo khác", detail.metrics.aeb_activation_ttc_s, "s", "metrics.aeb_activation_ttc_s");
  } else if (kind === "separation") {
    content.formula = cp ? "d_min = min max(0, √(dx² + dy²) − r); r = 0,30 m"
      : "d_min = min √(dx² + dy²) giữa hai hộp xe";
    content.variables = cp ? "dx: khoảng hở dọc từ điểm người tới đoạn đuôi–mũi ego (m); dy=max(0, |y_ped|−W_ego/2) (m); r: bán kính người của mô hình."
      : "dx, dy: khoảng hở dọc/ngang giữa hai hộp xe theo hệ trục run (m), bằng 0 khi các khoảng tương ứng chồng nhau. Không phải khoảng cách tâm.";
    add("Chiều dài ego", detail.scene.vehicle_length_m, "m", "scene.vehicle_length_m");
    add("Chiều rộng ego", detail.scene.vehicle_width_m, "m", "scene.vehicle_width_m");
  } else if (kind === "rms" || kind === "stopping") {
    add("Onset lệnh đã ghi", detail.metrics.brake_onset_t, "s", "metrics.brake_onset_t");
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
  const value = kind === "impact" ? formatRunImpact(rawValue, detail) : formatMeasurement(rawValue, content.unit, kind === "rms" || kind === "stopping" ? 3 : undefined, true);
  return { ...content, formula: known ? content.formula : null, variables: known ? content.variables : null,
    conditions: known ? content.conditions : "Chưa đủ category, nguồn canonical hoặc simulator đã đối chiếu để chọn công thức. Không tự áp công thức từ tên run hoặc hình cảnh.",
    category: typeof category === "string" && category ? category : "Chưa có category trong API", engine, inputs, value: kind === "impact" && value !== "—" ? `${value} m/s` : value,
    source: typeof detail.metrics.metric_source === "string" ? detail.metrics.metric_source : "Chưa có nguồn metric trong API" };
}
