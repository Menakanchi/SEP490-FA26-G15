import type { ReactNode } from "react";
import "./analysis.css";

export default function AnalysisLayout({ children }: { children: ReactNode }) {
  return <div className="analysis-workspace w-full min-w-0">{children}</div>;
}
