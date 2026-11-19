"use client";
import { useState } from "react";
import Link from "next/link";
import { AnalysisBadge, AnalysisTableRegion } from "@/components/analysisUi";
import { PillButton } from "@/components/VehicSimUi";
import type { AnalysisSelection, ObjectiveAggregate } from "@/types/vehicsim";
import { formatObjective, objectiveState } from "./analysis/analysisMetricFormat";
export function ObjectiveSummary({value}: {value: ObjectiveAggregate}) {
  return <div className="grid gap-4 text-[12px] sm:grid-cols-3">
    {(["rms_jerk_mps3","impact_speed_mps","stopping_distance_m"] as const).map(key=>{
      const objective=value[key];
      const unit=key==="rms_jerk_mps3"?"m/s³":key==="impact_speed_mps"?"m/s":"m";
      const state=objectiveState(objective,unit);
      return <div key={key}><span className="block text-vehicsim-muted">{key==="rms_jerk_mps3"?"RMS jerk":key==="impact_speed_mps"?"Tốc độ va chạm":"Quãng phanh"}</span>
        <strong className="block mt-1 text-[18px] tabular-nums">{state.valid?formatObjective(objective.value):"—"} <span className="text-[11px] font-medium">{unit}</span></strong>
        <span className="block mt-1 text-vehicsim-muted">{state.label} · {state.samples ?? "—"} mẫu · {state.missing ?? "—"} thiếu · {state.notApplicable ?? "—"} không áp dụng</span>
      </div>;
    })}
  </div>;
}
export function AnalysisSelectionSummary({dataset,returnTo}: {dataset: AnalysisSelection;returnTo?:string}) {
 const [requestedPage,setPage]=useState(1);
 const pages=Math.max(1,Math.ceil(dataset.runs.length/20)),page=Math.min(requestedPage,pages);
 return <section className="rounded-xl border border-vehicsim-line bg-vehicsim-surface p-5 space-y-4">
   <h2 className="font-bold">Tập đã chốt #{dataset.id} · {dataset.scenario.name}</h2>
   <p className="text-[12px] text-vehicsim-muted">Baseline {dataset.baseline.label} · xe #{dataset.reference.vehicle_id} · {dataset.reference.simulator} · dt {dataset.reference.dt} s</p>
   <p className="text-[12px]">Hợp đồng {dataset.evaluation.version} · {dataset.optimization_run_ids.length} run tối ưu · {dataset.validation_run_ids.length} run xác minh</p>
   {dataset.baseline_current===false&&<p role="status" className="text-[12px] text-vehicsim-warn">Baseline đã thay đổi. Đây là bằng chứng đã lưu; cần kiểm tra lại trước khi bàn giao.</p>}
   {dataset.evaluation.carla_observational_only && <p className="text-vehicsim-warn text-[12px]">CARLA chỉ phục vụ quan sát/đối chiếu; hiệu chuẩn phụ thuộc xe/profile, snapshot chưa xác nhận calibration từng run và không phải kiểm chứng thực địa.</p>}
   <div className="rounded-xl bg-vehicsim-soft p-4 space-y-3"><h3 className="text-[13px] font-bold">Mục tiêu của tập tối ưu</h3><ObjectiveSummary value={dataset.optimization_objectives} /></div>
   <details className="rounded-xl border border-vehicsim-line p-4"><summary className="text-[13px] font-semibold cursor-pointer">Chỉ số của tập xác minh</summary><div className="mt-4"><ObjectiveSummary value={dataset.validation_objectives} /></div></details>
   <AnalysisTableRegion label="Bảng run và seed trong snapshot, cuộn ngang"><table className="w-full min-w-[560px] text-left text-[12px]">
     <caption className="sr-only">Bằng chứng run và seed trong snapshot đã chốt</caption>
     <thead className="bg-vehicsim-soft text-[12px] font-bold uppercase tracking-[0.5px] text-vehicsim-ink"><tr>{["Run / biến thể","Seed","Tập","Kết quả"].map(x=><th scope="col" className="p-3" key={x}>{x}</th>)}</tr></thead>
     <tbody>{dataset.runs.slice((page-1)*20,page*20).map(run=><tr key={run.run_id} className="border-t border-vehicsim-line">
       <td className="p-3"><Link className="text-vehicsim-decision underline" href={`/analysis/failures/${run.run_id}${returnTo?`?returnTo=${encodeURIComponent(returnTo)}`:""}`}>#{run.run_id} · {run.variant}</Link></td>
       <td className="p-3 tabular-nums">{run.seed}</td><td className="p-3">{dataset.optimization_run_ids.includes(run.run_id)?"Tối ưu":"Xác minh"}</td><td className="p-3"><AnalysisBadge value={run.outcome}/></td>
     </tr>)}</tbody>
   </table></AnalysisTableRegion>
   {pages>1&&<nav aria-label="Phân trang snapshot" className="flex flex-wrap items-center justify-between gap-3 text-[12px]"><span>Trang {page} / {pages} · {dataset.runs.length} run trong snapshot</span><div className="flex gap-2"><PillButton disabled={page<=1} onClick={()=>setPage(page-1)}>Trang trước snapshot</PillButton><PillButton disabled={page>=pages} onClick={()=>setPage(page+1)}>Trang sau snapshot</PillButton></div></nav>}
 </section>;
}
