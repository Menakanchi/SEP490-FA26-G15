import type { Metadata } from "next";
import type { ReactNode } from "react";
import { analysisDocumentTitle, analysisRunTitle } from "@/components/analysis/analysisRouteTitles";

export async function generateMetadata({ params }: { params: Promise<{ runId: string }> }): Promise<Metadata> {
  return { title: analysisDocumentTitle(analysisRunTitle((await params).runId, false)) };
}
export default function RunLayout({ children }: { children: ReactNode }) {
  return children;
}
