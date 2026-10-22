"use client";

import Link from "next/link";
import type { AnalysisDataset } from "@/types/vehicsim";
import { viSummary } from "@/components/vehicsimI18n";

export function AnalysisDatasetPanel({ dataset }: { dataset: AnalysisDataset }) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
      <h2 className="text-[16px] font-bold text-vehicsim-ink">
        {dataset.id ? `Tập đã chốt #${dataset.id}` : "Xem trước tập baseline"} · {dataset.scenario.name}
      </h2>
      <p className="text-[12px] text-vehicsim-muted">
        AEB {dataset.baseline.label} · {dataset.reference?.simulator ?? "Chưa có run hoàn tất"}
        {dataset.reference ? ` · xe #${dataset.reference.vehicle_id}` : ""}
      </p>
      <p className="text-[12px] text-vehicsim-muted">
        {dataset.counts.completed}/{dataset.counts.total} đã chạy · {dataset.counts.safe} an toàn · {dataset.counts.failures} lỗi
        {" · "}{dataset.counts.unclassified} chưa phân loại · {dataset.counts.not_run} chưa chạy
      </p>
      {dataset.baseline_current === false && (
        <p role="status" className="text-[12px] font-semibold text-vehicsim-warn">
          Baseline đã thay đổi. Tập này giữ bằng chứng cũ; hãy chuẩn bị tập mới trước đợt so sánh tiếp theo.
        </p>
      )}
      {(dataset.counts.not_run > 0 || dataset.counts.unclassified > 0) && (
        <p className="text-[12px] text-vehicsim-warn">Tập chưa đủ kết quả hợp lệ để đánh giá toàn bộ. Ca thiếu dữ liệu được giữ để theo dõi.</p>
      )}
      <div className="max-h-72 overflow-auto rounded-[12px] border border-solid border-vehicsim-line">
        <table className="w-full min-w-[720px] text-left text-[11px]">
          <caption className="sr-only">Biến thể, run, seed và chỉ số baseline</caption>
          <thead className="sticky top-0 bg-vehicsim-soft text-vehicsim-muted">
            <tr>{["Biến thể / run", "Seed", "Kết quả", "RMS jerk (m/s³)", "Va chạm (m/s)", "Quãng phanh (m)"].map((label) => <th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr>
          </thead>
          <tbody>
            {dataset.variants.map((variant) => {
              const m = variant.metrics;
              const outcome = !m ? "Chưa chạy" : m.classification_status !== "CLASSIFIED" ? "Chưa phân loại"
                : m.outcome === "COLLISION" ? "Va chạm" : m.outcome === "FALSE_BRAKING" ? "Phanh oan"
                : m.missed_activation ? "Bỏ sót" : m.outcome === "NEAR_MISS" ? "Suýt va chạm"
                : m.verdict === "FAIL" ? "Có lỗi" : "An toàn";
              return (
                <tr key={variant.scenario_version_id} className="border-t border-solid border-vehicsim-line">
                  <td className="max-w-72 px-3 py-2" title={viSummary(variant.summary)}>
                    <span>{dataset.scenario.code}-{String(variant.version_no).padStart(3, "0")}</span>
                    {variant.run_id && <Link className="ml-2 text-vehicsim-decision underline" href={`/analysis/failures/${variant.run_id}`}>Run #{variant.run_id}</Link>}
                  </td>
                  <td className="px-3 py-2">{variant.seed ?? "—"}</td>
                  <td className="px-3 py-2">{outcome}</td>
                  <td className="px-3 py-2">{m?.rms_jerk_mps3?.toFixed(2) ?? "—"}</td>
                  <td className="px-3 py-2">{m?.impact_speed_mps?.toFixed(2) ?? "—"}</td>
                  <td className="px-3 py-2">{m?.stopping_distance_m?.toFixed(2) ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-vehicsim-faint">
        Toàn bộ họ được giữ, gồm ca an toàn. Chỉ số lấy từ run đã lưu; dấu — nghĩa là không có số đo hoặc không áp dụng.
        Quãng phanh hiện có thể gồm phần ngoại suy. Tập tìm tham số và tập xác minh độc lập còn cần được phân chia.
        {dataset.reference?.simulator.startsWith("carla-") ? " CARLA chưa hiệu chuẩn phanh: kết quả chỉ phục vụ quan sát/đối chiếu." : ""}
      </p>
    </section>
  );
}
