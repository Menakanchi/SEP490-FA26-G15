"use client";

import React from "react";
import { cx } from "@/components/VehicSimUi";
import { vi } from "@/components/vehicsimI18n";
import type { ChainStage, FailureClass, FailureDetail } from "@/types/vehicsim";
import styles from "./AnalysisRunDetail.module.css";

const STAGE_NAME: Record<FailureClass, string> = { PERCEPTION: "Nhận thức", DECISION: "Quyết định", CONTROL: "Điều khiển", VEHICLE_DYNAMICS: "Động lực học" };

/** Existing evidence content; rule/classification redesign belongs to Batch 6. */
export function AnalysisRunEvidence({ detail: d }: { detail: FailureDetail }) {
  return <div className={styles.stack}>
          <section className="flex w-full flex-col gap-[18px] rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[10px]">
                <h2 className="text-[18px] font-bold text-vehicsim-ink">Chuỗi nhận định nguyên nhân</h2>
                {d.chain.length > 0 && (
                  <span className="rounded-full bg-vehicsim-soft px-[10px] py-[5px] text-[12px] font-medium text-vehicsim-muted">
                    Nhận định theo luật{d.chain_confidence !== null ? ` · độ tin cậy ${d.chain_confidence.toFixed(2)}` : ""}
                  </span>
                )}
              </div>

            </div>
            {d.chain.length === 0 ? (
              <p className="text-[13px] text-vehicsim-muted">Run không có chuỗi nhận định để hiển thị. Xem kết quả và dữ liệu nguồn trước khi kết luận.</p>
            ) : (
              <div className="analysis-chain flex w-full items-stretch gap-[10px]">
                {d.chain.map((stage, i) => (
                  <React.Fragment key={stage.stage}>
                    {i > 0 && <span className="self-center text-[16px] font-bold text-vehicsim-faint">→</span>}
                    <StageCard index={i + 1} stage={stage} />
                  </React.Fragment>
                ))}
              </div>
            )}
          </section>

              <section className="rounded-[20px] bg-white p-5 space-y-3">
                <h2 className="font-bold">Bằng chứng và giới hạn nhận định</h2>
                <p className="text-[12px] text-vehicsim-muted">Chuỗi nguyên nhân là giả thuyết theo luật đánh giá, không chứng minh quan hệ nhân quả. Điểm confidence là điểm của luật, không phải xác suất đã hiệu chuẩn.</p>
                {d.stage_evidence?.map(e=><div key={e.stage} className="text-[12px]"><strong>{STAGE_NAME[e.stage as FailureClass]??e.stage}</strong>
                  <p>{Object.values(e.values).some(v=>v!==null)?"Có số đo để đối chiếu; nhận định vẫn cần kiểm tra.":"Không đủ số đo để đối chiếu."}</p>
                  {Object.entries(e.values).map(([key,value])=><span key={key} className="mr-3">{({first_detection_t:"Phát hiện (s)",first_detection_distance_m:"Cự ly phát hiện (m)",decision_t:"Quyết định (s)",decision_ttc_s:"TTC quyết định (s)",brake_onset_t:"Phanh có hiệu lực (s)",response_time_s:"Trễ phanh (s)",max_deceleration_mps2:"Giảm tốc cực đại (m/s²)",road_friction:"Hệ số ma sát"} as Record<string,string>)[key]??key}: {value===null||!Number.isFinite(value)?"Không khả dụng":value.toFixed(3)}</span>)}
                </div>)}
              </section>

  </div>;
}

function StageCard({ index, stage }: { index: number; stage: ChainStage }) {
  const failed = !stage.passed;
  return (
    <div
      className={cx(
        "flex min-w-0 flex-1 flex-col gap-[10px] rounded-[16px] border-solid p-4",
        failed ? "border-[1.5px] border-vehicsim-danger bg-vehicsim-fail-card" : "border border-vehicsim-line bg-white",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cx("flex size-[22px] items-center justify-center rounded-[11px] text-[11px] font-bold text-white", failed ? "bg-vehicsim-danger" : "bg-vehicsim-ink")}>
            {index}
          </span>
          <span className="text-[14px] font-bold text-vehicsim-ink">{STAGE_NAME[stage.stage]}</span>
        </div>
        <span
          className={cx(
            "whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-semibold",
            failed ? "bg-vehicsim-danger-bg text-vehicsim-danger" : "bg-vehicsim-ok-bg text-vehicsim-ok",
          )}
        >
          {failed ? "✕ Không đạt" : "✓ Đạt"}
        </span>
      </div>
      <p className="text-[12px] leading-[1.5] text-vehicsim-muted">{vi(stage.summary)}</p>
    </div>
  );
}

