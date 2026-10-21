import React from "react";
import Link from "next/link";
import { Tag, cx, fmt } from "@/components/VehicSimUi";
import type { CandidateSource, Pair, SimulatorCaveat } from "@/types/vehicsim";

export const CARLA_CAVEAT_TEXT =
  "Kết quả này chạy trên CARLA khi phanh của xe chưa được hiệu chuẩn (TD-17): số liệu chỉ để quan sát và đối chiếu, không phải chứng nhận an toàn.";

/** Banner khi regression chạy trên CARLA; không hiện gì với bộ động học. */
export function CarlaCaveat({ caveat }: { caveat?: SimulatorCaveat | null }) {
  if (!caveat?.carla || caveat.calibrated) return null;
  return (
    <div className="flex items-start gap-[10px] rounded-[16px] bg-vehicsim-warn-bg px-4 py-3 text-[13px] leading-[1.5] text-vehicsim-ink">
      <span className="font-bold text-vehicsim-warn">!</span>
      <span>{CARLA_CAVEAT_TEXT}</span>
    </div>
  );
}

/** Mô tả nguồn của candidate: thủ công, hoặc chiến dịch/trial tối ưu (chỉ đọc; chưa có dữ liệu tối ưu thì chỉ ghi "tối ưu hoá"). */
export function candidateSourceText(source?: CandidateSource | null): string | null {
  if (!source) return null;
  if (source.type !== "OPTIMIZATION") return "Tạo thủ công";
  const campaign = source.campaign_name ?? (source.optimization_run_id ? `chiến dịch #${source.optimization_run_id}` : null);
  if (!campaign) return "Từ tối ưu hoá";
  return `Từ tối ưu hoá · ${campaign}${source.trial_number != null ? ` · lần thử ${source.trial_number}` : ""}`;
}

export function CandidateSourceTag({ source }: { source?: CandidateSource | null }) {
  const text = candidateSourceText(source);
  if (!text) return null;
  return <Tag tone={source?.type === "OPTIMIZATION" ? "info" : "neutral"}>{text}</Tag>;
}

type ObjectiveKey = "rms_jerk_mps3" | "impact_speed_mps" | "stopping_distance_m";

/** Ba mục tiêu ADR-040; `none` là nghĩa của null ở từng mục (không phanh / không va chạm), không phải thiếu dữ liệu. */
const OBJECTIVES: { key: ObjectiveKey; label: string; unit: string; none: string }[] = [
  { key: "rms_jerk_mps3", label: "RMS jerk", unit: "m/s³", none: "không phanh" },
  { key: "impact_speed_mps", label: "Tốc độ va chạm", unit: "m/s", none: "không va chạm" },
  { key: "stopping_distance_m", label: "Quãng phanh", unit: "m", none: "không phanh" },
];

function objectiveValue(p: Pair, side: "baseline" | "candidate", key: ObjectiveKey): number | null | undefined {
  return p[`${side}_${key}` as keyof Pair] as number | null | undefined;
}

function ObjectiveCell({ p, objective }: { p: Pair; objective: (typeof OBJECTIVES)[number] }) {
  const b = objectiveValue(p, "baseline", objective.key);
  const c = objectiveValue(p, "candidate", objective.key);
  // Tốc độ va chạm: không va chạm nghĩa là 0 khi so sánh (ADR-040); hai mục còn lại chỉ so khi cả hai run có số đo.
  const asNumber = (v: number | null | undefined) => (v == null && objective.key === "impact_speed_mps" ? 0 : v);
  const bn = asNumber(b);
  const cn = asNumber(c);
  const tone = bn == null || cn == null || bn === cn ? "text-vehicsim-muted" : cn < bn ? "text-vehicsim-ok" : "text-vehicsim-danger";
  const show = (v: number | null | undefined) => (v == null ? <span className="text-vehicsim-faint">{objective.none}</span> : fmt.num(v, 2));
  return (
    <span className={cx("w-[170px] text-[12px] font-semibold", tone)}>
      {/* Cả hai run cùng không có số đo (không phanh / không va chạm): ghi một lần thay vì "x → x". */}
      {b == null && c == null ? show(b) : (
        <>
          {show(b)} → {show(c)}
        </>
      )}
    </span>
  );
}

/**
 * Ba mục tiêu ADR-040 theo từng cặp baseline → candidate, đọc thẳng số worker ghi cho từng run. Chỉ để tham khảo: không vào tiêu chí
 * nên không đổi kết quả đạt/không đạt. Chưa có trung bình theo tập (chờ bộ chỉ số chung của phần phân tích).
 */
export function PairObjectivesTable({ pairs, baselineLabel, candidateLabel }: { pairs: Pair[]; baselineLabel: string; candidateLabel: string }) {
  const [shown, setShown] = React.useState(10);
  // Backend cũ không trả số đo → không vẽ bảng rỗng giả.
  const withData = pairs.filter((p) => OBJECTIVES.some((o) => objectiveValue(p, "baseline", o.key) !== undefined));
  if (!withData.length) return null;
  return (
    <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
      <div className="flex flex-col gap-1 px-5 py-4">
        <h2 className="text-[15px] font-bold text-vehicsim-ink">Ba mục tiêu theo từng cặp</h2>
        <p className="text-[12px] leading-[1.5] text-vehicsim-muted">
          {baselineLabel} → {candidateLabel}, càng nhỏ càng tốt. Chỉ để tham khảo — không thuộc tiêu chí đạt/không đạt. Quãng phanh ca va chạm là
          ước lượng (ADR-040). Chưa có trung bình theo tập: chờ bộ chỉ số chung.
        </p>
      </div>
      <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
        <span className="min-w-0 flex-1">Kịch bản</span>
        {OBJECTIVES.map((o) => (
          <span key={o.key} className="w-[170px]">
            {o.label} ({o.unit})
          </span>
        ))}
      </div>
      {withData.slice(0, shown).map((p) => (
        <div key={p.variant_id} className="flex h-[44px] items-center border-b border-solid border-vehicsim-line px-5">
          <Link href={`/analysis/failures/${p.candidate_run_id}`} className="min-w-0 flex-1 truncate text-[13px] font-bold text-vehicsim-ink hover:underline">
            {p.label}
          </Link>
          {OBJECTIVES.map((o) => (
            <ObjectiveCell key={o.key} p={p} objective={o} />
          ))}
        </div>
      ))}
      <div className="flex items-center justify-between px-5 py-3 text-[12px] text-vehicsim-faint">
        <span>
          Hiển thị {Math.min(shown, withData.length)} / {withData.length} cặp
        </span>
        {shown < withData.length && (
          <button type="button" onClick={() => setShown((n) => n + 20)} className="font-semibold text-vehicsim-ink hover:underline">
            Xem thêm
          </button>
        )}
      </div>
    </section>
  );
}
