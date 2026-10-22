"use client";
import Link from "next/link";
import type { AnalysisSelection, ObjectiveAggregate } from "@/types/vehicsim";
export function ObjectiveSummary({value}: {value: ObjectiveAggregate}) {
  return <div className="flex flex-wrap gap-4 text-[12px]">
    {(["rms_jerk_mps3","impact_speed_mps","stopping_distance_m"] as const).map((key)=>{
      const objective=value[key];
      return <p key={key}><strong>{key==="rms_jerk_mps3"?"RMS jerk":key==="impact_speed_mps"?"Tốc độ va chạm":"Quãng phanh"}: </strong>
        {objective.value===null?"—":objective.value.toFixed(3)} {objective.unit}
        <span className="block text-vehicsim-muted">{objective.samples} mẫu · {objective.missing} thiếu · {objective.notApplicable} không áp dụng</span>
      </p>;
    })}
  </div>;
}
export function AnalysisSelectionSummary({dataset}: {dataset: AnalysisSelection}) {
 return <section className="rounded-[20px] border border-vehicsim-line bg-white p-5 space-y-3">
   <h2 className="font-bold">Tập đã chốt #{dataset.id} · {dataset.scenario.name}</h2>
   <p className="text-[12px]">Baseline {dataset.baseline.label} · xe #{dataset.reference.vehicle_id} · {dataset.reference.simulator} · dt {dataset.reference.dt} s</p>
   <p className="text-[12px]">Hợp đồng {dataset.evaluation.version} · {dataset.optimization_run_ids.length} run tối ưu · {dataset.validation_run_ids.length} run xác minh</p>
   {dataset.evaluation.carla_observational_only && <p className="text-vehicsim-warn text-[12px]">CARLA chỉ phục vụ quan sát/đối chiếu; chưa hiệu chuẩn phanh và chưa tương đương với số động học.</p>}
   <ObjectiveSummary value={dataset.optimization_objectives} />
   <div className="max-h-60 overflow-auto"><table className="w-full text-left text-[12px]">
     <thead><tr>{["Run / biến thể","Seed","Tập","Kết quả"].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead>
     <tbody>{dataset.runs.map(run=><tr key={run.run_id} className="border-t border-vehicsim-line">
       <td className="p-2"><Link className="underline" href={`/analysis/failures/${run.run_id}`}>#{run.run_id} · {run.variant}</Link></td>
       <td>{run.seed}</td><td>{dataset.optimization_run_ids.includes(run.run_id)?"Tối ưu":"Xác minh"}</td><td>{run.outcome}</td>
     </tr>)}</tbody>
   </table></div>
 </section>;
}
