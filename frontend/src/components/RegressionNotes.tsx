import React from "react";
import Link from "next/link";
import { Pagination, TableScroll, Tag, cx, fmt } from "@/components/VehicSimUi";
import type { CandidateSource, DecisionHistory, Pair, SimulatorCaveat } from "@/types/vehicsim";

export const CARLA_CAVEAT_TEXT =
  "Kết quả mô phỏng trên CARLA dùng để quan sát và đối chiếu kỹ thuật cấu hình AEB, không phải chứng nhận an toàn thực địa.";

export function CarlaCaveat({ caveat }: { caveat?: SimulatorCaveat | null }) {
  if (!caveat?.carla || caveat.calibrated) return null;
  return (
    <div className="flex items-start gap-[10px] rounded-[16px] bg-vehicsim-warn-bg px-4 py-3 text-[13px] leading-[1.5] text-vehicsim-ink">
      <span className="font-bold text-vehicsim-warn">!</span>
      <span>{CARLA_CAVEAT_TEXT}</span>
    </div>
  );
}

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

/** Nơi quay về khi mở bằng chứng từ trang kiểm chứng (trang Phân tích nhận đúng mẫu này, xem `analysisReturn`). */
export const regressionReturn = (testId: number) => `/validation/regression/${testId}`;

/**
 * Link tới trang chi tiết / phát lại của màn Phân tích cho một run trong cặp: kèm `returnTo` để quay về đúng lần kiểm chứng
 * và `compare` là run còn lại của cặp (cùng biến thể, seed, xe, simulator) để mở đúng run so sánh.
 */
export function pairRunHref(runId: number, pairedRunId: number, testId: number, section: "summary" | "telemetry" | "evidence" | "playback"): string {
  const query = new URLSearchParams({ ...(section === "playback" ? {} : { section }), returnTo: regressionReturn(testId), compare: String(pairedRunId) });
  return `/analysis/failures/${runId}${section === "playback" ? "/playback" : ""}?${query}`;
}

type ObjectiveKey = "rms_jerk_mps3" | "impact_speed_mps" | "stopping_distance_m";

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
  const asNumber = (v: number | null | undefined) => (v == null && objective.key === "impact_speed_mps" ? 0 : v);
  const bn = asNumber(b);
  const cn = asNumber(c);
  const tone = bn == null || cn == null || bn === cn ? "text-vehicsim-muted" : cn < bn ? "text-vehicsim-ok" : "text-vehicsim-danger";
  const show = (v: number | null | undefined) => (v == null ? <span className="text-vehicsim-faint">{objective.none}</span> : fmt.num(v, 2));
  return (
    <span className={cx("w-[170px] text-[12px] font-semibold", tone)}>
      {b == null && c == null ? show(b) : (
        <>
          {show(b)} → {show(c)}
        </>
      )}
    </span>
  );
}

export function PairObjectivesTable({
  pairs,
  baselineLabel,
  candidateLabel,
  testId,
  simple = false,
}: {
  pairs: Pair[];
  baselineLabel: string;
  candidateLabel: string;
  testId: number;
  /** EXP (project cá nhân): bỏ ghi chú kỹ thuật nội bộ của nhóm. */
  simple?: boolean;
}) {
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 12;
  const withData = pairs.filter((p) => OBJECTIVES.some((o) => objectiveValue(p, "baseline", o.key) !== undefined));
  if (!withData.length) return null;

  const pages = Math.max(1, Math.ceil(withData.length / PAGE_SIZE));
  const pagedPairs = withData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface">
      <div className="flex flex-col gap-1 px-5 py-4">
        <h2 className="text-[15px] font-bold text-vehicsim-ink">Ba mục tiêu theo từng cặp</h2>
        <p className="text-[12px] leading-[1.5] text-vehicsim-muted">
          {baselineLabel} → {candidateLabel}, càng nhỏ càng tốt. Chỉ để tham khảo — không thuộc tiêu chí đạt/không đạt. Quãng phanh ca va chạm là
          ước lượng{simple ? "." : " (ADR-040). Chưa có trung bình theo tập: chờ bộ chỉ số chung."}
        </p>
      </div>
      <TableScroll label="Bảng mục tiêu theo cặp" minWidth={840}>
        <div className="flex h-11 items-center border-y border-solid border-slate-700 bg-slate-800 px-5 text-[12.5px] font-black uppercase tracking-wider text-white">
          <span className="w-[45px] shrink-0 pr-2 text-center font-bold">STT</span>
          <span className="w-[260px] shrink-0 pr-4">Kịch bản</span>
          {OBJECTIVES.map((o) => (
            <span key={o.key} className="w-[180px] shrink-0">
              {o.label} ({o.unit})
            </span>
          ))}
        </div>
        {pagedPairs.map((p, idx) => (
          <div key={p.variant_id} className="flex min-h-[44px] items-center border-b border-solid border-vehicsim-line px-5 py-2">
            <span className="w-[45px] shrink-0 pr-2 text-center text-[12px] font-bold text-vehicsim-faint tabular-nums">
              {(page - 1) * PAGE_SIZE + idx + 1}
            </span>
            <Link
              href={pairRunHref(p.candidate_run_id, p.baseline_run_id, testId, "summary")}
              className="w-[260px] shrink-0 truncate pr-4 text-[13px] font-bold text-vehicsim-ink hover:underline"
            >
              {p.label}
            </Link>
            {OBJECTIVES.map((o) => (
              <ObjectiveCell key={o.key} p={p} objective={o} />
            ))}
          </div>
        ))}
      </TableScroll>
      {pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-solid border-vehicsim-line px-5 py-3.5">
          <span className="text-[12px] font-medium text-vehicsim-muted">
            Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, withData.length)} trên {withData.length} cặp
          </span>
          <Pagination page={page} pages={pages} onPage={setPage} />
        </div>
      )}
    </section>
  );
}

export function BaselineEntry({ baseline: b }: { baseline: DecisionHistory["baselines"][number] }) {
  return (
    <>
      <span className="flex items-center gap-2 text-[13px] font-bold text-vehicsim-ink">
        {b.label}
        <span className={cx("text-[11px] font-semibold", b.status === "BASELINE" ? "text-vehicsim-ok" : "text-vehicsim-faint")}>
          {b.status === "BASELINE" ? "hiện hành" : "đã lưu trữ"}
        </span>
      </span>
      <span className="text-[12px] text-vehicsim-muted">
        {b.promoted_by
          ? `Được ${b.promoted_by} chấp nhận${b.promoted_at ? ` ngày ${fmt.date(b.promoted_at)}` : ""}${b.regression_code ? ` (${b.regression_code})` : ""}`
          : "Bản cơ sở khởi tạo của dự án"}
      </span>
    </>
  );
}
