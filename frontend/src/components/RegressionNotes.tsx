import React from "react";
import { Tag } from "@/components/VehicSimUi";
import type { CandidateSource, SimulatorCaveat } from "@/types/vehicsim";

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
