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
  // --- evaluation.py: tiêu đề -------------------------------------------------------
  [re(String.raw`AEB braked for a pedestrian who stopped at the curb\.`), () => "AEB phanh dù người đi bộ đã dừng ở lề đường."],
  [re(String.raw`AEB handled the crossing safely\.`), () => "AEB xử lý an toàn tình huống người đi bộ băng ngang."],
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
    (m) => `Tỉ lệ phanh nhầm tăng từ ${m[1]}% lên ${m[2]}% (người đi bộ dừng ở lề).`,
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
  [re(String.raw`(FE-\d+) — not run yet`), (m) => `${m[1]} — chưa chạy`],
  [re("Awaiting review"), () => "Chờ duyệt"],
  [re("Accepted"), () => "Đã chấp nhận"],
  [re("Rejected"), () => "Đã từ chối"],
  [re("More tests requested"), () => "Yêu cầu thêm kiểm thử"],
  [re("Blocked"), () => "Bị chặn"],
  // --- regression.py: tiêu chí -------------------------------------------------------
  [re("No previously safe scenario may collide"), () => "Không kịch bản an toàn nào được chuyển thành va chạm"],
  [re("Collision rate must not increase"), () => "Tỉ lệ va chạm không được tăng"],
  [re("False activation increase ≤"), () => "Tỉ lệ phanh nhầm tăng tối đa"],
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
