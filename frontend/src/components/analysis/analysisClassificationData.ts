import type { ChainStage } from "@/types/vehicsim";

/** Labels for values emitted by Evaluation; no client classification or thresholds. */
const FAILURE_LABELS: Record<string, string> = {
  COLLISION: "Va chạm được ghi nhận",
  FALSE_BRAKING: "Phanh oan theo luật",
  MISSED_BRAKING: "Bỏ sót phanh theo luật",
  LATE_BRAKING: "Phanh muộn theo luật",
  NEAR_MISS: "Suýt va chạm theo luật",
};
export function failureTypeLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "API chưa có phân loại lỗi";
  return FAILURE_LABELS[value] ?? `Chưa có nhãn cho mã ${value}`;
}

export function classificationPresentation(data: { status?: unknown; evaluation_valid?: unknown; verdict?: unknown; failure_type?: unknown }) {
  const verdict = data.verdict === "PASS" || data.verdict === "FAIL" ? data.verdict : null;
  const trusted = data.status === "COMPLETED" && data.evaluation_valid === true && verdict !== null;
  const evaluation = data.status !== "COMPLETED" ? "Run chưa hoàn tất"
    : data.evaluation_valid === false ? "Chưa đủ dữ liệu đánh giá"
    : data.evaluation_valid !== true ? "API chưa xác nhận điều kiện đánh giá"
    : verdict === null ? "API chưa có verdict hợp lệ"
    : verdict === "PASS" ? "Đạt theo luật đã lưu (PASS)" : "Không đạt theo luật đã lưu (FAIL)";
  const classification = typeof data.failure_type === "string" && data.failure_type.trim()
    ? failureTypeLabel(data.failure_type)
    : "API chưa có phân loại lỗi";
  return { trusted, evaluation, classification };
}

/** Missing/null chains are unavailable evidence, never proof that all stages passed. */
export function recordedChain(value: unknown): ChainStage[] {
  return Array.isArray(value) ? value.filter((item): item is ChainStage => item !== null && typeof item === "object"
    && typeof item.stage === "string" && item.stage.trim().length > 0) : [];
}
