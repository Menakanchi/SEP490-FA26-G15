import type { Metadata } from "next";
import { BaselineAnalysisDashboard } from "@/components/BaselineAnalysisDashboard";
import { analysisDocumentTitle, analysisListTitle } from "@/components/analysis/analysisRouteTitles";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  return { title: analysisDocumentTitle(analysisListTitle((await searchParams).view)) };
}
export default function AnalysisPage() {
  return <BaselineAnalysisDashboard />;
}
