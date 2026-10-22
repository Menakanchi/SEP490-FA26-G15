"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton, StatCard } from "@/components/VehicSimUi";
import { AnalysisSelectionSummary, ObjectiveSummary } from "@/components/AnalysisSelectionSummary";
import { vehicsimApi } from "@/services/vehicsim";
import { vi } from "@/components/vehicsimI18n";
import type { AnalysisDashboardData, AnalysisFilters, AnalysisRun, AnalysisSelection } from "@/types/vehicsim";
const LABELS: Record<string,string>={CLEAR:"Trời quang",CLOUDY:"Nhiều mây",RAIN:"Mưa",HEAVY_RAIN:"Mưa lớn",FOG:"Sương mù",DAY:"Ban ngày",DUSK:"Chạng vạng",NIGHT:"Ban đêm",PERCEPTION:"Nhận thức",DECISION:"Quyết định",CONTROL:"Điều khiển",VEHICLE_DYNAMICS:"Động lực học",SAFE:"An toàn",COLLISION:"Va chạm",FALSE_BRAKING:"Phanh oan",NEAR_MISS:"Suýt va chạm",
 MISSED_BRAKING:"Bỏ sót",OTHER_FAILURE:"Lỗi AEB khác",ERROR:"Lỗi kỹ thuật",CANCELLED:"Đã hủy",TIMEOUT:"Hết giờ",
 INCOMPLETE:"Thiếu dữ liệu",NOT_FINISHED:"Chưa hoàn tất",PENDING:"Đang chờ",RUNNING:"Đang chạy",PAUSED:"Tạm dừng",COMPLETED:"Hoàn tất",FAILED:"Lỗi",STOPPED:"Đã hủy"};
type Chosen={run: AnalysisRun; role:"OPTIMIZATION"|"VALIDATION"};
export function BaselineAnalysisDashboard({initialScenario}: {initialScenario?: number}) {
 const {ctx,canWrite}=useVehicSimContext();
 const router=useRouter();
 const [filters,setFilters]=useState<AnalysisFilters>({scenario_id:initialScenario});
 const [page,setPage]=useState(1);
 const [data,setData]=useState<AnalysisDashboardData|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [refresh,setRefresh]=useState(0);
 const [chosen,setChosen]=useState<Record<number,Chosen>>({});
 const [saved,setSaved]=useState<AnalysisSelection|null>(null);
 useEffect(()=>{
   let active=true;
   vehicsimApi.analysisRuns(filters,page).then(value=>{if(active){setData(value);setError(null);}})
     .catch(e=>{if(active){setData(null);setError(vi(e.message));}});
   return ()=>{active=false;};
 },[filters,page,refresh]);
 const change=(key:keyof AnalysisFilters,value:string)=>{
   setPage(1);setChosen({});setSaved(null);setData(null);
   const numeric=["scenario_id","variant_id","aeb_version_id","vehicle_id"].includes(key);
   setFilters(old=>({...old,[key]:value?(numeric?Number(value):value):undefined}));
 };
 const selection=Object.values(chosen), opt=selection.filter(x=>x.role==="OPTIMIZATION"), val=selection.filter(x=>x.role==="VALIDATION");
 const overlaps=opt.some(a=>val.some(b=>a.run.scenario_version_id===b.run.scenario_version_id));
 const identities=new Set(selection.map(({run})=>[run.scenario_id,run.baseline_id,run.vehicle_id,run.simulator,run.dt].join("|")));
 const canSave=canWrite && opt.length>0 && val.length>0 && !overlaps && identities.size===1
   && opt.some(x=>x.run.outcome==="SAFE") && val.some(x=>x.run.outcome==="SAFE");
 const assign=(run:AnalysisRun,role:string)=>{
   setSaved(null);setChosen(old=>{const next={...old};if(!role)delete next[run.run_id];else next[run.run_id]={run,role:role as Chosen["role"]};return next;});
 };
 const save=async()=>{
   if(!canSave)return;setBusy(true);setError(null);
   try {
     const dataset=await vehicsimApi.createAnalysisSelection({scenario_id:selection[0].run.scenario_id,
       baseline_id:selection[0].run.baseline_id,optimization_run_ids:opt.map(x=>x.run.run_id),validation_run_ids:val.map(x=>x.run.run_id),run_revisions:Object.fromEntries(selection.map(x=>[String(x.run.run_id),x.run.revision]))});
     setSaved(dataset);
   }catch(e){setError(vi(e instanceof Error?e.message:"Không chốt được tập dữ liệu"));}
   finally{setBusy(false);}
 };
 const proceed=async()=>{
   if(!saved)return;setBusy(true);
   try{await vehicsimApi.analysisHandoff(saved.id);router.push(`/aeb?dataset_id=${saved.id}`);}
   catch(e){setError(vi(e instanceof Error?e.message:"Không bàn giao được tập dữ liệu"));}
   finally{setBusy(false);}
 };
 return <VehicSimPage step={4} title="Phân tích baseline" crumbs={[{label:"Phân tích"},{label:"Kết quả baseline"}]}
   subtitle="Thống kê theo đúng bộ lọc. Giữ riêng lỗi AEB, lỗi kỹ thuật và dữ liệu không đủ để kết luận."
   actions={<PillButton onClick={()=>setRefresh(x=>x+1)}>Tải lại kết quả</PillButton>}>
   <ErrorNote message={error}/>
   <section aria-label="Bộ lọc baseline" className="grid grid-cols-2 xl:grid-cols-5 gap-3 rounded-[20px] bg-white p-5">
     <label className="text-[12px]">Họ kịch bản<select aria-label="Họ kịch bản" className="block w-full border rounded-lg p-2" value={filters.scenario_id??""} onChange={e=>change("scenario_id",e.target.value)}><option value="">Tất cả</option>{ctx?.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
     <label className="text-[12px]">Phiên bản baseline<select aria-label="Phiên bản baseline" className="block w-full border rounded-lg p-2" value={filters.aeb_version_id??""} onChange={e=>change("aeb_version_id",e.target.value)}><option value="">Tất cả</option>{ctx?.versions.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
     {([["status","Trạng thái",["PENDING","RUNNING","PAUSED","COMPLETED","FAILED","STOPPED"]],
       ["weather","Thời tiết",["CLEAR","CLOUDY","RAIN","HEAVY_RAIN","FOG"]],
       ["time_of_day","Thời điểm",["DAY","DUSK","NIGHT"]],
       ["failure_class","Khâu lỗi",["PERCEPTION","DECISION","CONTROL","VEHICLE_DYNAMICS"]]] as const).map(([key,label,values])=>
       <label key={key} className="text-[12px]">{label}<select aria-label={label} className="block w-full border rounded-lg p-2" value={filters[key]??""} onChange={e=>change(key,e.target.value)}><option value="">Tất cả</option>{values.map(value=><option key={value} value={value}>{LABELS[value]??vi(value)}</option>)}</select></label>)}
     {([["variant_id","ID biến thể"],["vehicle_id","ID xe"],["simulator","Phiên bản simulator"]] as const).map(([key,label])=>
       <label key={key} className="text-[12px]">{label}<input aria-label={label} type={key==="simulator"?"text":"number"} min={1} className="block w-full border rounded-lg p-2" value={filters[key]??""} onChange={e=>change(key,e.target.value)}/></label>)}
   </section>
   <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
     <StatCard label="Tổng lượt chạy" value={data?.total??"—"}/>
     {(["SAFE","COLLISION","FALSE_BRAKING","NEAR_MISS","MISSED_BRAKING","OTHER_FAILURE","ERROR","CANCELLED","TIMEOUT","INCOMPLETE","NOT_FINISHED"] as const).map(key=>
       <StatCard key={key} label={LABELS[key]} value={data?data.counts[key]??0:"—"} />)}
   </div>
   {data?.objective_groups.map(group=><section key={group.identity} className="rounded-[20px] bg-white p-5 space-y-2">
     <h2 className="text-[13px] font-bold">{group.simulator} · baseline #{group.baseline_id} · xe #{group.vehicle_id}</h2>
     <ObjectiveSummary value={group.objectives}/><p className="text-[11px] text-vehicsim-muted">Hợp đồng {group.objectives.version}. Chỉ tổng hợp cùng identity; run lỗi/thiếu làm objective không đầy đủ.
       {group.carla_observational_only?" CARLA chỉ phục vụ quan sát; chưa tương đương với số động học.":""}</p>
   </section>)}
   <section className="rounded-[20px] bg-white p-5 space-y-3">
     <h2 className="font-bold">Lượt chạy và tập bàn giao</h2>
     <p className="text-[12px] text-vehicsim-muted">Gán run vào tập tối ưu hoặc xác minh. Hai tập phải khác biến thể, cùng họ/baseline/xe/simulator và mỗi tập giữ ca an toàn. Lựa chọn được giữ qua các trang.</p>
     <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-[12px] text-left">
       <thead><tr>{["Run / biến thể","Seed","Baseline / xe","Simulator","Trạng thái / kết quả","Tập"].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead>
       <tbody>{data?.items.map(run=><tr key={run.run_id} className="border-t border-vehicsim-line">
         <td className="p-2"><Link className="underline text-vehicsim-decision" href={`/analysis/failures/${run.run_id}`}>#{run.run_id} · {run.variant}</Link><span className="block">{run.family}</span></td>
         <td>{run.seed}</td><td>#{run.baseline_id} / #{run.vehicle_id}</td><td>{run.simulator}</td>
         <td>{LABELS[run.status]??run.status}<span className="block">{LABELS[run.outcome]??run.outcome}</span>{!run.trace_available&&<span className="text-vehicsim-warn">Thiếu telemetry</span>}</td>
         <td><select aria-label={`Tập của run ${run.run_id}`} disabled={!canWrite||run.status!=="COMPLETED"||!run.trace_available||["TIMEOUT","ERROR","INCOMPLETE"].includes(run.outcome)} className="rounded border p-2" value={chosen[run.run_id]?.role??""} onChange={e=>assign(run,e.target.value)}>
           <option value="">Không chọn</option><option value="OPTIMIZATION">Tối ưu</option><option value="VALIDATION">Xác minh</option>
         </select></td>
       </tr>)}</tbody>
     </table></div>
     {data?.total===0&&<p>Chưa có run baseline phù hợp. <Link href="/scenarios" className="underline">Chạy baseline ở màn kịch bản</Link>.</p>}
     <div className="flex gap-3 items-center"><PillButton disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Trang trước</PillButton><span className="text-[12px]">Trang {page}</span><PillButton disabled={!data||page*30>=data.total} onClick={()=>setPage(p=>p+1)}>Trang sau</PillButton></div>
     <p className="text-[12px]">{opt.length} run tối ưu · {val.length} run xác minh {overlaps?"· Hai tập đang trùng biến thể":""}</p>
     <div className="flex gap-3"><PillButton disabled={!canSave||busy} onClick={()=>void save()}>{busy?"Đang xử lý…":"Chốt hai tập dữ liệu"}</PillButton>
       <PillButton disabled={!selection.length||busy} onClick={()=>{setChosen({});setSaved(null);}}>Bỏ lựa chọn</PillButton></div>
     {!canSave&&canWrite&&<p className="text-[12px] text-vehicsim-muted">Chọn đủ hai tập theo điều kiện ở trên. Bộ tổng hợp sẽ kiểm tra metric trước khi lưu.</p>}
   </section>
   {saved&&<><AnalysisSelectionSummary dataset={saved}/><PillButton variant="dark" disabled={busy} onClick={()=>void proceed()}>Tiếp tục: Tối ưu AEB →</PillButton></>}
 </VehicSimPage>;
}
