/**
 * Dịch chữ do backend VehicSim sinh ra sang tiếng Việt **ở tầng hiển thị**.
 *
 * DB và API giữ nguyên (tiếng Anh): mô tả lỗi, nguyên nhân gốc, tiêu đề, nhãn sự kiện,
 * tóm tắt biến thể, tiêu chí, đánh đổi... được lưu và trả về như cũ; frontend nhận
 * diện các mẫu câu cố định ở `src/services/vehicsim/{evaluation,simulator,views,
 * regression,common}.py` rồi dịch, giữ nguyên các con số. Câu không khớp mẫu nào thì
 * trả về nguyên văn — không bao giờ làm mất thông tin. Tên do người dùng/DB đặt (họ
 * kịch bản, tham số AEB, phiên bản) không đi qua đây.
 *
 * Đổi câu chữ ở backend thì sửa mẫu tương ứng ở đây.
 */

const WEATHER: Record<string, string> = {
  CLEAR: "Trời quang",
  CLOUDY: "Nhiều mây",
  RAIN: "Mưa",
  HEAVY_RAIN: "Mưa to",
  FOG: "Sương mù",
  clear: "Trời quang",
  cloudy: "Nhiều mây",
  rain: "Mưa",
  "heavy rain": "Mưa to",
  fog: "Sương mù",
};
const TIME: Record<string, string> = {
  DAY: "Ban ngày",
  DUSK: "Chạng vạng",
  NIGHT: "Ban đêm",
  Day: "Ban ngày",
  Dusk: "Chạng vạng",
  Night: "Ban đêm",
  day: "Ban ngày",
  dusk: "Chạng vạng",
  night: "Ban đêm",
};

/** Mã hoặc nhãn tiếng Anh của thời tiết → tiếng Việt (viết hoa chữ đầu). */
export function viWeather(value?: string | null): string {
  return value ? (WEATHER[value] ?? value) : "—";
}

/** Mã hoặc nhãn tiếng Anh của thời điểm → tiếng Việt (viết hoa chữ đầu). */
export function viTime(value?: string | null): string {
  return value ? (TIME[value] ?? value) : "—";
}

/** Tóm tắt biến thể `Night · heavy rain · 60 km/h · stops at curb` → tiếng Việt. */
export function viSummary(summary?: string | null): string {
  if (!summary) return "";
  return summary
    .split(" · ")
    .map((part, i) => {
      if (part === "stops at curb") return "dừng ở lề";
      // Xe phía trước (ADR-050): "CCRB lead 50 km/h at 40 m"
      const lead = part.match(/^(CCRS|CCRM|CCRB) lead (\d+(?:\.\d+)?) km\/h(?: at (\d+(?:\.\d+)?) m)?$/);
      if (lead) return `${lead[1]} · xe trước ${lead[2]} km/h${lead[3] ? ` cách ${lead[3]} m` : ""}`;
      if (TIME[part]) return TIME[part];
      if (WEATHER[part]) return i === 0 ? WEATHER[part] : WEATHER[part].toLowerCase();
      return part;
    })
    .join(" · ");
}

const N = String.raw`(-?\d+(?:\.\d+)?)`;
type Rule = [RegExp, (m: RegExpMatchArray) => string];
const re = (pattern: string) => new RegExp(`^${pattern}$`);

const RULES: Rule[] = [
  [re("Chưa xác định được vùng lưu trữ của project\\. Liên hệ quản trị viên để kiểm tra trước khi xóa\\."),
    () => "Chưa xác định được vùng lưu trữ của project. Liên hệ quản trị viên để kiểm tra trước khi xóa."],
  [re("This scenario family has runs or related analysis, optimization or regression data and cannot be deleted"), () => "Không thể xóa họ kịch bản vì đã có lượt chạy hoặc dữ liệu phân tích, tối ưu hay kiểm chứng liên quan."],
  [re("This scenario family is in use and cannot be deleted"), () => "Họ kịch bản đang được sử dụng, chưa thể xóa. Hãy tải lại danh sách và thử lại."],
  [re("Analysis dataset ID is required with its digest"), () => "Cần mã dataset và checksum từ bước kiểm tra bàn giao."],
  [re("Specify either a V3 handoff or a V2 dataset, not both"), () => "Chỉ chọn một nguồn bàn giao: handoff V3 hoặc dataset V2."],
  [re("V3 approved search space is missing"), () => "Handoff V3 chưa có miền tham số được xác nhận. Quay lại Phân tích lỗi để rà soát."],
  [re("Campaign search space differs from the V3 approved domain"), () => "Miền tham số của đợt tối ưu khác miền được xác nhận trong handoff V3."],
  [re("V3 campaign handoff reference is invalid"), () => "Tham chiếu handoff V3 của đợt tối ưu không hợp lệ."],
  [re("V3 campaign partition or revision changed"), () => "Partition hoặc revision của handoff V3 đã thay đổi. Không thể tiếp tục tối ưu với nguồn này."],
  [re("V3 holdout variants cannot be used for optimization or GP fitting"), () => "Không được dùng biến thể trong tập xác minh V3 để tối ưu hoặc huấn luyện GP."],
  [re("V3 handoff ID and SHA-256 digest are required"), () => "Cần mã handoff V3 và checksum SHA-256 từ Phân tích lỗi."],
  [re("V3 handoff consumer is unavailable"), () => "Dịch vụ tiếp nhận handoff V3 chưa sẵn sàng."],
  [re("V3 handoff campaign contract is invalid"), () => "Handoff V3 không đáp ứng hợp đồng tạo đợt tối ưu."],
  [re("Analysis dataset partition is empty or invalid"), () => "Tập tối ưu hoặc tập xác minh trống hoặc không hợp lệ."],
  [re("Analysis dataset simulation step is missing or invalid"), () => "Dataset thiếu bước thời gian mô phỏng hợp lệ."],
  [re("Analysis dataset checksum changed; reload the handoff"), () => "Checksum dataset đã thay đổi. Hãy kiểm tra lại bàn giao từ Phân tích lỗi."],
  [re("Analysis dataset belongs to another scenario or baseline"), () => "Dataset không thuộc họ kịch bản hoặc baseline đang chọn."],
  [re("Analysis dataset simulator differs from (?:this campaign or current simulator profile|the current simulator profile)"), () => "Simulator của dataset không khớp đợt tối ưu hoặc profile hiện hành. Hãy dùng kết quả baseline cùng simulator."],
  [re("Analysis campaign dataset reference is invalid"), () => "Tham chiếu dataset của đợt tối ưu không hợp lệ. Hãy kiểm tra lại tập đã chốt."],
  [re("Analysis campaign dataset identity or checksum changed"), () => "Định danh hoặc checksum dataset đã thay đổi. Không thể tiếp tục đợt tối ưu với nguồn này."],
  [re("Analysis dataset scenario version is unavailable"), () => "Phiên bản kịch bản trong dataset không còn truy cập được."],
  [re("Analysis dataset source runs are incomplete or changed"), () => "Run nguồn của dataset bị thiếu hoặc đã thay đổi. Hãy kiểm tra lại nguồn trước khi tối ưu."],
  [re("Optimization candidate differs from its frozen run identity"), () => "Ứng viên không khớp định danh run đã chốt; chưa thể dùng làm bằng chứng tối ưu."],
  [re("Optimization candidate is missing frozen source runs"), () => "Ứng viên thiếu run thuộc tập đã chốt; chưa thể đánh giá tối ưu."],
  [re("Optimization trial evidence changed before GP fitting"), () => "Bằng chứng lượt thử đã thay đổi trước khi huấn luyện mô hình tối ưu. Đợt chạy đã dừng để tránh dùng sai dữ liệu."],
  [re("Analysis dataset partitions(?: or objectives)? changed"), () => "Tập tối ưu, tập xác minh hoặc chỉ số trong dataset đã thay đổi. Hãy kiểm tra lại bàn giao."],
  [re("Analysis dataset partitions contain the same variant"), () => "Hai tập tối ưu và xác minh đang có biến thể trùng nhau."],
  [re("Analysis dataset mixes vehicle or simulator identities"), () => "Các lượt chạy trong tập không cùng xe, simulator hoặc bước thời gian."],
  [re("Analysis dataset repeats a variant and seed"), () => "Tập dữ liệu có cặp biến thể và seed bị lặp."],
  [re("Analysis validation evidence is incomplete"), () => "Tập xác minh chưa đủ dữ liệu hợp lệ."],
  [re("Analysis optimization objectives changed"), () => "Chỉ số của tập tối ưu không khớp dữ liệu đã chốt. Hãy kiểm tra lại nguồn."],
  [re("Analysis validation objectives changed"), () => "Chỉ số của tập xác minh không khớp dữ liệu đã chốt. Hãy kiểm tra lại nguồn."],
  [re("Analysis dataset manifests are incomplete"), () => "Dataset thiếu thông tin truy vết artifact; chưa thể bàn giao tối ưu."],
  [re("Analysis baseline parameter values changed or source parameters are incomplete"), () => "Tham số baseline đã thay đổi hoặc run nguồn thiếu tham số. Hãy kiểm tra lại baseline và chốt tập phù hợp."],
  [re("Optimization baseline is missing selected variant runs"), () => "Baseline chưa có đủ lượt chạy cho các biến thể đã chọn. Hãy chạy đủ baseline trước khi tối ưu."],
  [re("Optimization candidate is missing selected variant runs"), () => "Ứng viên chưa có đủ lượt chạy cho các biến thể đã chọn. Không thể đánh giá kết quả tối ưu."],
  [re("Invalid optimization search space: .*"), () => "Miền tìm kiếm không hợp lệ. Cần đủ bốn tham số AEB với cận hữu hạn, đúng thứ tự và trong giới hạn cho phép."],
  [re("Optimization search space cannot produce a candidate different from its parent"), () => "Miền tìm kiếm không tạo được ứng viên khác cấu hình gốc. Hãy điều chỉnh cận tham số."],
  [re("Unsupported optimization objective configuration: .*"), () => "Đợt tối ưu chỉ hỗ trợ ba mục tiêu chuẩn và các ràng buộc đã chốt."],
  [re("Analysis selection repeats a variant and seed"), () => "Chỉ chọn một run cho mỗi cặp biến thể và seed để tránh đếm lặp."],
  [re("Analysis preview changed; reload source runs"), () => "Dữ liệu đã thay đổi. Hãy tải lại và kiểm tra các run trước khi chốt."],
  [re("Invalid analysis selection"), () => "Lựa chọn tập dữ liệu không hợp lệ."],
  [re("Analysis sets overlap(?: by variant)?"), () => "Tập tối ưu và xác minh không được trùng biến thể."],
  [re("Analysis baseline changed"), () => "Baseline đã thay đổi. Hãy chốt tập mới."],
  [re("Each analysis set must retain safe cases"), () => "Mỗi tập phải giữ ít nhất một ca an toàn."],
  [re("Analysis selection mixes vehicle or simulator identities"), () => "Các run phải cùng xe, simulator và bước thời gian."],
  [re("Analysis optimization objectives are incomplete"), () => "Tập tối ưu chưa đủ số đo hợp lệ cho ba objective."],
  [re("Analysis selection contains invalid runs or missing telemetry"), () => "Tập chứa run không hợp lệ hoặc thiếu telemetry."],
  [re("Analysis selection belongs to another baseline or scenario"), () => "Các run phải cùng họ và baseline đã chọn."],
  [re("Legacy analysis dataset requires a new selection"), () => "Dataset cũ chưa chia tập. Hãy chốt tập tối ưu và xác minh mới."],
  [re("Analysis source runs (?:changed or telemetry is missing|are unavailable)"), () => "Run nguồn đã thay đổi hoặc thiếu artifact. Không thể bàn giao tập này."],
  [re("Baseline data changed; refresh the analysis dataset before saving"), () => "Dữ liệu baseline đã thay đổi. Hãy xem lại tập phân tích trước khi lưu."],
  // --- evaluation.py: tiêu đề -------------------------------------------------------
  [re(String.raw`AEB OFF reference: collision observed\. AEB intervention assessment is not applicable\.`), () => "Lượt đối chứng AEB tắt: có va chạm. Không đánh giá khả năng can thiệp của AEB."],
  [re(String.raw`AEB OFF reference: near miss observed\. AEB intervention assessment is not applicable\.`), () => "Lượt đối chứng AEB tắt: có tình huống cận va chạm. Không đánh giá khả năng can thiệp của AEB."],
  [re(String.raw`AEB OFF reference: no collision observed\. AEB intervention assessment is not applicable\.`), () => "Lượt đối chứng AEB tắt: không có va chạm. Không đánh giá khả năng can thiệp của AEB."],
  [re(String.raw`Available vehicle braking capped deceleration at ${N} m/s² vs ${N} requested\.`), m => `Khả năng phanh của xe giới hạn giảm tốc ở ${m[1]} m/s² so với ${m[2]} m/s² yêu cầu.`],
  [re(String.raw`AEB braked for a pedestrian who stopped at the curb\.`), () => "AEB phanh dù người đi bộ đã dừng ở lề đường."],
  [re(String.raw`AEB handled the crossing safely\.`), () => "AEB xử lý an toàn tình huống người đi bộ băng ngang."],
  // --- nhóm xe phía trước CCRs/CCRm/CCRb (ADR-050) ----------------------------------------
  [re(String.raw`AEB handled the lead vehicle safely\.`), () => "AEB xử lý an toàn tình huống xe phía trước."],
  [re(String.raw`AEB braked for a vehicle that stayed outside the ego path\.`), () => "AEB phanh dù xe phía trước nằm ngoài làn đi của xe."],
  [re(String.raw`Every stage met its spec, yet the lead vehicle was reached\.`), () => "Mọi khâu đạt chuẩn nhưng xe vẫn chạm xe phía trước."],
  [re(String.raw`The lead vehicle was detected too late for AEB to stop\.`), () => "Phát hiện xe phía trước quá muộn để AEB dừng kịp."],
  [re(String.raw`The lead vehicle was detected in time, but AEB activated ${N} s too late\.`), (m) => `Phát hiện xe phía trước kịp thời nhưng AEB kích hoạt muộn ${m[1]} s.`],
  [re(String.raw`The lead vehicle was detected in time, but the TTC threshold left too little room to stop\.`), () => "Phát hiện xe phía trước kịp thời nhưng ngưỡng TTC để lại quá ít thời gian để dừng."],
  [
    re(String.raw`Lead vehicle never passed the detection threshold ${N} \((.+), (\w+)\)\.`),
    (m) => `Xe phía trước chưa lần nào vượt ngưỡng phát hiện ${m[1]} (${viWeather(m[2]).toLowerCase()}, ${viTime(m[3]).toLowerCase()}).`,
  ],
  [
    re(String.raw`Lead vehicle first detected at t ${N} s \(${N} m\), ${N} s after AEB should have fired\.`),
    (m) => `Phát hiện xe phía trước lần đầu lúc t = ${m[1]} s (cách ${m[2]} m), trễ ${m[3]} s so với lúc AEB lẽ ra phải kích hoạt.`,
  ],
  [re(String.raw`Lead vehicle detected at t ${N} s \(${N} m\) with latency 0\.1 s\.`), (m) => `Phát hiện xe phía trước lúc t = ${m[1]} s (cách ${m[2]} m), độ trễ 0.1 s.`],
  [re(String.raw`Lead vehicle detected at t ${N} s\.`), (m) => `Phát hiện xe phía trước lúc t = ${m[1]} s.`],
  [
    re(String.raw`Lead vehicle entered the path at TTC ${N} s, inside the ${N} s stopping envelope; only an earlier path prediction could have fired in time\.`),
    (m) => `Xe phía trước vào quỹ đạo xe ở TTC ${m[1]} s, đã nằm trong vùng ${m[2]} s cần để dừng; chỉ dự đoán quỹ đạo sớm hơn mới kích hoạt kịp.`,
  ],
  [re(String.raw`Lead vehicle detected and tracked correctly\.`), () => "Phát hiện và bám theo xe phía trước đúng."],
  [
    re(String.raw`AEB braked at TTC ${N} s for a vehicle whose edge stayed outside the ego path; the safety corridor reached into the neighbouring lane\.`),
    (m) => `AEB phanh ở TTC ${m[1]} s dù mép xe phía trước nằm ngoài làn đi của xe; hành lang an toàn với sang làn bên.`,
  ],
  [re(String.raw`Lead vehicle brakes · ${N} m/s²`), (m) => `Xe phía trước phanh · ${m[1]} m/s²`],
  [re(String.raw`Every stage met its spec, yet the pedestrian was reached\.`), () => "Mọi khâu đạt chuẩn nhưng xe vẫn chạm người đi bộ."],
  [re(String.raw`AEB stopped in time, but with less margin than the near-miss limit\.`), () => "AEB dừng kịp nhưng biên an toàn thấp hơn ngưỡng suýt va chạm."],
  [re(String.raw`The pedestrian was detected too late for AEB to stop\.`), () => "Phát hiện người đi bộ quá muộn để AEB dừng kịp."],
  [re(String.raw`The pedestrian was detected in time, but AEB activated ${N} s too late\.`), (m) => `Phát hiện người đi bộ kịp thời nhưng AEB kích hoạt muộn ${m[1]} s.`],
  [re(String.raw`The pedestrian was detected in time, but the TTC threshold left too little room to stop\.`), () => "Phát hiện người đi bộ kịp thời nhưng ngưỡng TTC để lại quá ít thời gian để dừng."],
  [
    re(String.raw`The pedestrian walked into the side of the car; AEB only checks the moment the front arrives\.`),
    () => "Người đi bộ đi vào hông xe; AEB chỉ xét thời điểm đầu xe tới vạch.",
  ],
  [re(String.raw`AEB fired in time, but braking built up too slowly\.`), () => "AEB kích hoạt kịp nhưng lực phanh tăng quá chậm."],
  [re(String.raw`AEB fired in time, but the road could not deliver the requested deceleration\.`), () => "AEB kích hoạt kịp nhưng mặt đường không cho đạt mức giảm tốc yêu cầu."],
  // --- evaluation.py: mô tả lỗi và từng khâu --------------------------------------------
  [
    re(String.raw`Every stage met spec, but the margin was thin: min distance ${N} m, min TTC ${N} s\.`),
    (m) => `Mọi khâu đạt chuẩn nhưng biên an toàn quá mỏng: khoảng cách nhỏ nhất ${m[1]} m, TTC nhỏ nhất ${m[2]} s.`,
  ],
  [re(String.raw`Hazard reproduced without a single failing stage\.`), () => "Tái hiện được nguy hiểm dù không khâu nào hỏng."],
  [
    re(String.raw`Pedestrian never passed the detection threshold ${N} \((.+), (\w+)\)\.`),
    (m) => `Người đi bộ chưa lần nào vượt ngưỡng phát hiện ${m[1]} (${viWeather(m[2]).toLowerCase()}, ${viTime(m[3]).toLowerCase()}).`,
  ],
  [
    re(String.raw`Pedestrian first detected at t ${N} s \(${N} m\), ${N} s after AEB should have fired\.`),
    (m) => `Phát hiện người đi bộ lần đầu lúc t = ${m[1]} s (cách ${m[2]} m), trễ ${m[3]} s so với lúc AEB lẽ ra phải kích hoạt.`,
  ],
  [re(String.raw`Pedestrian detected at t ${N} s \(${N} m\) with latency 0\.1 s\.`), (m) => `Phát hiện người đi bộ lúc t = ${m[1]} s (cách ${m[2]} m), độ trễ 0.1 s.`],
  [re(String.raw`Pedestrian detected at t ${N} s\.`), (m) => `Phát hiện người đi bộ lúc t = ${m[1]} s.`],
  [re(String.raw`AEB never issued a brake command: the predicted path did not enter the lane in time\.`), () => "AEB không ra lệnh phanh: quỹ đạo dự đoán không đi vào làn xe kịp lúc."],
  [
    re(String.raw`Pedestrian stepped into the side of the car after its front had passed the crossing; AEB only predicts the pedestrian's position for the moment the front arrives\.`),
    () => "Người đi bộ bước vào hông xe khi đầu xe đã qua vạch; AEB chỉ dự đoán vị trí người đi bộ tại thời điểm đầu xe tới nơi.",
  ],
  [
    re(String.raw`AEB fired at TTC ${N} s, ${N} s after the ${N} s threshold was reached\.`),
    (m) => `AEB kích hoạt ở TTC ${m[1]} s, trễ ${m[2]} s sau khi chạm ngưỡng ${m[3]} s.`,
  ],
  [
    re(String.raw`TTC threshold ${N} s is below the ${N} s needed to stop from ${N} km/h\.`),
    (m) => `Ngưỡng TTC ${m[1]} s thấp hơn mức ${m[2]} s cần để dừng từ ${m[3]} km/h.`,
  ],
  [
    re(String.raw`Pedestrian entered the path at TTC ${N} s, inside the ${N} s stopping envelope; only an earlier path prediction could have fired in time\.`),
    (m) => `Người đi bộ đi vào quỹ đạo xe ở TTC ${m[1]} s, đã nằm trong vùng ${m[2]} s cần để dừng; chỉ dự đoán quỹ đạo sớm hơn mới kích hoạt kịp.`,
  ],
  [re(String.raw`Brake command at TTC ${N} s, within the ${N} s threshold\.`), (m) => `Lệnh phanh ở TTC ${m[1]} s, trong ngưỡng ${m[2]} s.`],
  [
    re(String.raw`Brake delay ${N} s \+ actuator ${N} s \+ ramp ${N} s lost ${N} s of braking \(limit ${N} s\)\.`),
    (m) => `Trễ kích hoạt ${m[1]} s + actuator ${m[2]} s + tăng lực phanh ${m[3]} s làm mất ${m[4]} s phanh (giới hạn ${m[5]} s).`,
  ],
  [re(String.raw`Brake command reached ${N} m/s² with ${N} s of delay and ramp\.`), (m) => `Lệnh phanh đạt ${m[1]} m/s² sau ${m[2]} s trễ và tăng lực.`],
  [re(String.raw`No brake command to execute\.`), () => "Không có lệnh phanh để thực thi."],
  [
    re(String.raw`Road friction μ ${N} capped deceleration at ${N} m/s² vs ${N} requested\.`),
    (m) => `Ma sát mặt đường μ ${m[1]} giới hạn giảm tốc ở ${m[2]} m/s² so với ${m[3]} m/s² yêu cầu.`,
  ],
  [re(String.raw`Road friction μ ${N}: requested ${N} m/s² was achievable\.`), (m) => `Ma sát mặt đường μ ${m[1]}: đạt được mức ${m[2]} m/s² yêu cầu.`],
  [re(String.raw`Pedestrian detected and tracked correctly\.`), () => "Phát hiện và bám theo người đi bộ đúng."],
  [
    re(String.raw`AEB braked at TTC ${N} s for a pedestrian who stopped at the curb; the ${N} s predicted path entered the lane\.`),
    (m) => `AEB phanh ở TTC ${m[1]} s dù người đi bộ dừng ở lề; quỹ đạo dự đoán ${m[2]} s đi vào làn xe.`,
  ],
  [re(String.raw`Braking executed as commanded\.`), () => "Phanh thực hiện đúng lệnh."],
  [re(String.raw`Vehicle dynamics nominal\.`), () => "Động lực học xe bình thường."],
  // --- simulator.py: nhãn sự kiện ----------------------------------------------------
  [re("Pedestrian starts crossing"), () => "Người đi bộ bắt đầu băng qua"],
  [re("Pedestrian stops at the curb"), () => "Người đi bộ dừng ở lề"],
  [re(String.raw`First detection · conf ${N}`), (m) => `Phát hiện lần đầu · độ tin cậy ${m[1]}`],
  [re("FCW warning issued"), () => "Phát cảnh báo FCW"],
  [re("AEB brake command"), () => "AEB ra lệnh phanh"],
  [re("Brakes engage"), () => "Phanh bắt đầu tác dụng"],
  [re(String.raw`Collision · ${N} km/h`), (m) => `Va chạm · ${m[1]} km/h`],
  [re("Ego stopped"), () => "Xe ego dừng hẳn"],
  // --- views.py: đánh đổi, bằng chứng, nhãn duyệt ---------------------------------------
  [
    re(String.raw`False activation rises from ${N}% to ${N}% \(pedestrians who stop at the curb\)\.`),
    (m) => `Tỉ lệ phanh oan tăng từ ${m[1]}% lên ${m[2]}% (người đi bộ dừng ở lề).`,
  ],
  [re(String.raw`(\d+) scenario\(s\) get worse than on the baseline\.`), (m) => `${m[1]} kịch bản xấu đi so với bản cơ sở.`],
  [
    re(String.raw`${N}% of scenarios still end in a collision — mostly late dart-outs that no threshold can stop in time\.`),
    (m) => `${m[1]}% kịch bản vẫn kết thúc bằng va chạm — chủ yếu là người đi bộ lao ra quá muộn, không ngưỡng nào dừng kịp.`,
  ],
  [re(String.raw`Regression (RT-\d+)`), (m) => `Kiểm thử hồi quy ${m[1]}`],
  [re(String.raw`(\d+) regressions · (\d+) fixed`), (m) => `${m[1]} ca xấu đi · ${m[2]} ca được sửa`],
  [re("Robustness validation"), () => "Kiểm định độ bền vững"],
  [re("Pareto front"), () => "Biên Pareto"],
  [re("Sensitivity analysis"), () => "Phân tích độ nhạy"],
  [re(String.raw`FE-\d+\s*[-—]\s*(?:not run yet|chưa chạy)`), () => "Chưa chạy"],
  [re(String.raw`Verification test for MOBO candidate \(Run #(\d+), Trial #(\d+)\)`), (m) => `Kiểm thử ứng viên tối ưu (đợt #${m[1]}, lượt thử #${m[2]})`],
  [re(String.raw`Trial #(\d+) is on the Pareto front of (.+)`), (m) => `Lần thử #${m[1]} thuộc biên Pareto của đợt ${m[2]}`],
  [re(String.raw`Trial #(\d+) is not on the Pareto front of (.+)`), (m) => `Lần thử #${m[1]} không thuộc biên Pareto của đợt ${m[2]}`],
  [re("Manual candidate — not from optimization"), () => "Ứng viên chỉnh tay, không qua tối ưu MOBO"],
  [re("Awaiting review"), () => "Chờ duyệt"],
  [re("Accepted"), () => "Đã chấp nhận"],
  [re("Rejected"), () => "Đã từ chối"],
  [re("More tests requested"), () => "Yêu cầu thêm kiểm thử"],
  [re("Blocked"), () => "Bị chặn"],
  [re("Superseded"), () => "Hết hiệu lực"],
  [re("Baseline changed"), () => "Bản cơ sở đã đổi"],
  // --- RunService: hủy run (TD-37) ----------------------------------------------------
  [re("Cancelled by user"), () => "Đã hủy theo yêu cầu"],
  [re(String.raw`Run is already (\w+); nothing to cancel`), (m) => `Lượt chạy đã ở trạng thái ${m[1]}, không còn gì để hủy`],
  [re("This run belongs to a regression test or optimization and cannot be cancelled on its own"),
    () => "Lượt chạy thuộc kiểm thử hồi quy hoặc tối ưu: hủy cả lần kiểm thử / đợt tối ưu thay vì từng lượt"],
  [re("Only baseline run results can be deleted"), () => "Chỉ xóa được kết quả của lượt baseline (không phải lượt của regression hoặc tối ưu)"],
  [re(String.raw`Run is (\w+); cancel it before deleting its result`), (m) => `Lượt chạy đang ở trạng thái ${m[1]}: hủy lượt trước rồi mới xóa kết quả`],
  [re("Completed run results are kept; only failed or cancelled runs can be deleted"),
    () => "Lượt đã hoàn thành là số liệu thật nên được giữ; chỉ xóa được lượt bị lỗi hoặc đã hủy"],
  [re("Only the user who started this run or an admin can delete its result"),
    () => "Chỉ người tạo lượt chạy này hoặc Admin mới xóa được kết quả"],
  [re("This run is the reference of a regression test and cannot be deleted"),
    () => "Lượt này đang là mốc đối chiếu của một kiểm thử hồi quy nên không xóa được"],
  [re("This run is referenced or no longer eligible for deletion"),
    () => "Lượt này đang được tham chiếu hoặc không còn đủ điều kiện để xóa"],
  [re(String.raw`Regression test is already (\w+); nothing to cancel`), (m) => `Kiểm thử hồi quy đã ở trạng thái ${m[1]}, không còn gì để hủy`],
  // --- regression.py: tiêu chí -------------------------------------------------------
  [re("No previously safe scenario may collide"), () => "Không kịch bản an toàn nào được chuyển thành va chạm"],
  [re("Collision rate must not increase"), () => "Tỉ lệ va chạm không được tăng"],
  [re("False activation increase ≤"), () => "Tỉ lệ phanh oan tăng tối đa"],
  [re("Median min TTC change ≥"), () => "Trung vị TTC nhỏ nhất thay đổi ít nhất"],
  [re("Use identical random seeds for both versions"), () => "Dùng cùng seed ngẫu nhiên cho cả hai phiên bản"],
  [re("enforced"), () => "đã áp dụng"],
];

/** Câu do backend sinh ra → tiếng Việt; không khớp mẫu thì trả nguyên văn. */
export function vi(text?: string | null): string {
  if (!text) return text ?? "";
  const t = text.trim();
  for (const [pattern, render] of RULES) {
    const m = t.match(pattern);
    if (m) return render(m);
  }
  return text;
}
