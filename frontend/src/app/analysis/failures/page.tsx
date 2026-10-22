"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { LegacyFailureCases } from "@/components/LegacyFailureCases";
import { BaselineAnalysisDashboard } from "@/components/BaselineAnalysisDashboard";
export default function AnalysisPage() {
  const [tab,setTab]=useState("baseline");
  const params=useSearchParams();
  return <div className="min-w-0 w-full">
    <nav aria-label="Chế độ phân tích" className="flex gap-3 px-9 pt-5 text-[13px]">
      <button className={tab==="baseline" ? "font-bold underline" : ""} onClick={()=>setTab("baseline")}>Kết quả baseline</button>
      <button className={tab==="failures" ? "font-bold underline" : ""} onClick={()=>setTab("failures")}>Tra cứu ca lỗi</button>
    </nav>
    {tab==="baseline" ? <BaselineAnalysisDashboard key={params.toString()} initialScenario={Number(params.get("scenario_id")) || undefined} /> : <LegacyFailureCases key={params.toString()} initialScenario={Number(params.get("scenario_id")) || undefined} />}
  </div>;
}
