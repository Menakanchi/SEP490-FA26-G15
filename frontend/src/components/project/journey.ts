import type { FamilyRequest, JourneyCounts, JourneyStatus, JourneyStepKey, ProjectJourney, TimeOfDay, Weather } from "@/types/vehicsim";

/*
 * Logic thuần (không React) của phần project cá nhân: 5 bước hành trình, mục tiêu/ghi chú trong `description`,
 * định dạng thời gian và họ kịch bản mẫu.
 */

export interface StepDefinition {
  key: JourneyStepKey;
  n: number;
  title: string;
  short: string;
  question: string;
  /** Đường dẫn thuộc bước này, dùng để tô sáng mục đang mở (khớp dài nhất thắng). */
  paths: string[];
}

export const JOURNEY_STEPS: StepDefinition[] = [
  { key: "SCENARIO", n: 1, title: "Thiết kế kịch bản", short: "Kịch bản", question: "Tình huống nguy hiểm nào cần thử?", paths: ["/scenarios/new"] },
  { key: "BASELINE", n: 2, title: "Chạy baseline", short: "Baseline", question: "AEB hiện tại có phanh kịp không?", paths: ["/scenarios"] },
  { key: "RESULTS", n: 3, title: "Xem kết quả", short: "Kết quả", question: "Ca nào va chạm và vì sao?", paths: ["/analysis"] },
  { key: "IMPROVE", n: 4, title: "Cải tiến AEB", short: "Cải tiến", question: "Đổi tham số nào để tốt hơn?", paths: ["/aeb"] },
  { key: "VERIFY", n: 5, title: "Kiểm chứng", short: "Kiểm chứng", question: "Ứng viên có tốt hơn thật không?", paths: ["/validation"] },
];

export const STEP_NUMBER = ["①", "②", "③", "④", "⑤"];

const VERDICT_LABEL: Record<NonNullable<JourneyCounts["last_verdict"]>, string> = {
  PENDING: "đang chờ",
  PASSED: "đạt",
  REGRESSED: "xấu đi",
  FAILED: "không đạt",
};

export function stepDefinition(key: JourneyStepKey): StepDefinition {
  return JOURNEY_STEPS.find((s) => s.key === key) ?? JOURNEY_STEPS[0];
}

export function statusOf(journey: ProjectJourney, key: JourneyStepKey): JourneyStatus {
  return journey.steps.find((s) => s.key === key)?.status ?? "TODO";
}

/** Nơi làm bước đó trong project đang mở. */
export function stepHref(key: JourneyStepKey, journey: ProjectJourney): string {
  const c = journey.counts;
  switch (key) {
    case "SCENARIO":
      return c.variants > 0 ? "/scenarios" : `/projects/${journey.project_id}/start`;
    case "BASELINE":
      return "/scenarios";
    case "RESULTS":
      return "/analysis/failures";
    case "IMPROVE":
      return "/aeb";
    case "VERIFY":
      return statusOf(journey, "VERIFY") === "TODO" || c.last_regression_id === null
        ? "/validation/regression/new"
        : `/validation/regression/${c.last_regression_id}`;
  }
}

/** Một dòng số liệu thật của bước; chưa có dữ liệu thì nói rõ điều kiện, không dùng số 0 giả. */
export function stepSummary(key: JourneyStepKey, journey: ProjectJourney): string {
  const c = journey.counts;
  const status = statusOf(journey, key);
  switch (key) {
    case "SCENARIO":
      return c.families > 0 ? `${c.families} họ kịch bản · ${c.variants} biến thể` : "Chưa có kịch bản";
    case "BASELINE":
      if (c.variants === 0) return "Cần kịch bản trước";
      if (status === "RUNNING") return `Đang chạy · ${c.baseline_completed}/${c.variants} biến thể xong`;
      if (status === "FAILED") return `${c.baseline_failed} lượt chạy lỗi · ${c.baseline_completed}/${c.variants} xong`;
      return `${c.baseline_completed}/${c.variants} biến thể đã chạy`;
    case "RESULTS":
      if (c.baseline_completed === 0) return "Cần chạy baseline trước";
      return `${c.collisions} va chạm · ${c.near_misses} suýt va chạm · ${c.false_activations} phanh oan`;
    case "IMPROVE":
      if (status === "RUNNING") return "Đang tối ưu tự động…";
      return c.candidates > 0 ? `${c.candidates} ứng viên AEB` : "Chưa có ứng viên";
    case "VERIFY":
      if (status === "RUNNING") return "Đang chạy kiểm chứng…";
      if (c.regressions_completed === 0) return "Chưa kiểm chứng";
      return `${c.regressions_completed} lần kiểm chứng · lần cuối ${c.last_verdict ? VERDICT_LABEL[c.last_verdict] : "—"}`;
  }
}

export interface NextAction {
  key: JourneyStepKey | null;
  title: string;
  detail: string;
  cta: string;
  href: string;
}

/** Nội dung thẻ "Bước tiếp theo": luôn có đúng một việc nên làm, kể cả khi vòng đã xong. */
export function nextAction(journey: ProjectJourney): NextAction {
  const c = journey.counts;
  const baseline = journey.baseline_label ?? "gốc";
  const key = journey.next;
  if (key === null) {
    return {
      key: null,
      title: `Vòng ${journey.round} đã xong`,
      detail: `Lần kiểm chứng gần nhất ${c.last_verdict ? VERDICT_LABEL[c.last_verdict] : "đã có kết quả"}. Thử một ứng viên khác để cải thiện thêm.`,
      cta: "Xem kết quả kiểm chứng",
      href: stepHref("VERIFY", journey),
    };
  }
  const status = statusOf(journey, key);
  const step = stepDefinition(key);
  const href = stepHref(key, journey);
  const base = { key, title: `${STEP_NUMBER[step.n - 1]} ${step.title}`, href };
  switch (key) {
    case "SCENARIO":
      return { ...base, detail: "Dựng tình huống người đi bộ băng ngang để thử AEB: dùng mẫu có sẵn, mô tả bằng lời hoặc tự nhập tham số.", cta: "Thiết kế kịch bản" };
    case "BASELINE":
      if (status === "RUNNING") {
        return { ...base, detail: `Đang chạy ${c.baseline_completed}/${c.variants} biến thể với AEB ${baseline}. Kết quả tự cập nhật.`, cta: "Xem tiến độ" };
      }
      if (status === "FAILED") {
        return { ...base, detail: `${c.baseline_failed} lượt chạy bị lỗi. Mở họ kịch bản để xem lỗi và chạy lại.`, cta: "Mở họ kịch bản" };
      }
      return { ...base, detail: `Chạy ${c.variants} biến thể với cấu hình AEB ${baseline} để có mốc so sánh.`, cta: "Chạy baseline" };
    case "RESULTS":
      return {
        ...base,
        detail:
          c.collisions > 0
            ? `${c.collisions}/${c.baseline_completed} tình huống xe vẫn va chạm với AEB ${baseline}. Xem ca nào tệ nhất và vì sao.`
            : `AEB ${baseline} không va chạm ở ${c.baseline_completed} tình huống. Xem các ca suýt va chạm và phanh oan.`,
        cta: "Xem kết quả",
      };
    case "IMPROVE":
      if (status === "RUNNING") {
        return { ...base, detail: "Hệ thống đang thử các bộ tham số AEB. Bạn có thể chọn ứng viên khi có phương án tốt.", cta: "Xem tiến độ tối ưu" };
      }
      return { ...base, detail: "Tự chỉnh 4 tham số AEB hoặc để hệ thống tìm phương án cân bằng (MOBO).", cta: "Cải tiến AEB" };
    case "VERIFY":
      if (status === "RUNNING") {
        return { ...base, detail: "Đang chạy lại đúng các tình huống với ứng viên để so từng cặp với baseline.", cta: "Xem tiến độ" };
      }
      return { ...base, detail: "Chạy lại đúng các tình huống với ứng viên, cùng seed, để so từng cặp với baseline.", cta: "Kiểm chứng ứng viên" };
  }
}

/** Bước vừa chuyển sang xong giữa hai lần tải, để báo cho người dùng. */
export function newlyDone(before: ProjectJourney | null, after: ProjectJourney): JourneyStepKey | null {
  if (!before || before.project_id !== after.project_id) return null;
  const done = after.steps.find((s) => s.status === "DONE" && statusOf(before, s.key) !== "DONE");
  return done?.key ?? null;
}

/** Bước của đường dẫn hiện tại, khớp dài nhất thắng (/scenarios/new thuộc bước 1, /scenarios thuộc bước 2). */
export function stepOfPath(pathname: string, projectId: number | null): JourneyStepKey | null {
  if (projectId !== null && pathname.startsWith(`/projects/${projectId}/start`)) return "SCENARIO";
  let best: { key: JourneyStepKey; length: number } | null = null;
  for (const step of JOURNEY_STEPS) {
    for (const path of step.paths) {
      if ((pathname === path || pathname.startsWith(`${path}/`)) && (!best || path.length > best.length)) {
        best = { key: step.key, length: path.length };
      }
    }
  }
  return best?.key ?? null;
}

/**
 * Mục tiêu thử nghiệm và ghi chú cùng nằm trong `projects.description` (không thêm cột):
 * dòng đầu "Mục tiêu: …" nếu có, sau một dòng trống là ghi chú.
 */
const GOAL_PREFIX = "Mục tiêu: ";

export interface ProjectBrief {
  goal: string;
  note: string;
}

export function composeDescription({ goal, note }: ProjectBrief): string {
  const cleanGoal = goal.replace(/\s*\n\s*/g, " ").trim();
  const cleanNote = note.trim();
  return [cleanGoal && `${GOAL_PREFIX}${cleanGoal}`, cleanNote].filter(Boolean).join("\n\n");
}

export function splitDescription(description: string | null | undefined): ProjectBrief {
  const text = (description ?? "").trim();
  if (!text.startsWith(GOAL_PREFIX)) return { goal: "", note: text };
  const [first, ...rest] = text.split("\n");
  return { goal: first.slice(GOAL_PREFIX.length).trim(), note: rest.join("\n").trim() };
}

/** Thời gian backend trả không kèm múi giờ là giờ UTC (cùng quy ước với `fmt.date`). */
function parse(iso: string): Date {
  return new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
}

/** "vừa xong", "5 phút trước", "3 giờ trước", "2 ngày trước", hoặc ngày đầy đủ khi đã lâu. */
export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const date = parse(iso);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export type StarterCondition = "DAY" | "NIGHT" | "RAIN";

interface StarterOption {
  key: StarterCondition;
  label: string;
  weather: Weather;
  timeOfDay: TimeOfDay;
}

export const STARTER_OPTIONS: StarterOption[] = [
  { key: "DAY", label: "Ban ngày", weather: "CLEAR", timeOfDay: "DAY" },
  { key: "NIGHT", label: "Ban đêm", weather: "CLEAR", timeOfDay: "NIGHT" },
  { key: "RAIN", label: "Trời mưa", weather: "RAIN", timeOfDay: "DAY" },
];

const EGO_SPEEDS_KMH = [30, 40, 50];
const TRIGGER_DISTANCES_M = [20, 30];
const PEDESTRIAN_SPEEDS_MPS = [1.5];

/** Số biến thể của họ mẫu: tốc độ xe × khoảng cách × tốc độ người × (băng qua / dừng ở lề). */
export const STARTER_VARIANTS = EGO_SPEEDS_KMH.length * TRIGGER_DISTANCES_M.length * PEDESTRIAN_SPEEDS_MPS.length * 2;

/**
 * Họ kịch bản mẫu "người đi bộ băng ngang" trong phạm vi CP_CROSSING đang chạy được, giữ cả ca người dừng ở lề
 * (AEB không nên phanh) để thấy được phanh oan. Chạy baseline ngay khi tạo.
 */
export function starterFamily(condition: StarterCondition): FamilyRequest {
  const option = STARTER_OPTIONS.find((o) => o.key === condition) ?? STARTER_OPTIONS[0];
  return {
    name: `Người đi bộ băng ngang · mẫu ${option.label.toLowerCase()}`,
    description: "Họ kịch bản mẫu: người đi bộ bước ra trước xe ở nhiều tốc độ và khoảng cách; một nửa số ca người dừng ở lề.",
    ego_speeds_kmh: EGO_SPEEDS_KMH,
    trigger_distances_m: TRIGGER_DISTANCES_M,
    pedestrian_speeds_mps: PEDESTRIAN_SPEEDS_MPS,
    stops_at_curb: [false, true],
    weathers: [option.weather],
    times_of_day: [option.timeOfDay],
    run_baseline: true,
  };
}
