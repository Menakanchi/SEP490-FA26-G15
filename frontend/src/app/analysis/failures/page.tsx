"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { LegacyFailureCases } from "@/components/LegacyFailureCases";
import { BaselineAnalysisDashboard } from "@/components/BaselineAnalysisDashboard";

export default function AnalysisPage() {
  const [tab, setTab] = useState<"baseline" | "failures">("baseline");
  const params = useSearchParams();

  return (
    <div className="min-w-0 w-full">
      {tab === "baseline" ? (
        <BaselineAnalysisDashboard
          key={params.toString()}
          initialScenario={Number(params.get("scenario_id")) || undefined}
          activeTab={tab}
          onTabChange={setTab}
        />
      ) : (
        <LegacyFailureCases
          key={params.toString()}
          initialScenario={Number(params.get("scenario_id")) || undefined}
          activeTab={tab}
          onTabChange={setTab}
        />
      )}
    </div>
  );
}
