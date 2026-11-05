/** Pure URL presentation shared by server metadata and client page headings. */
export const analysisRunId = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
export function analysisListTitle(view: unknown) {
  const value = Array.isArray(view) ? view[0] : view;
  return value === "runs" ? "Khám phá lượt chạy" : value === "failures" ? "Tra cứu ca lỗi" : value === "dataset" ? "Chuẩn bị tập bàn giao" : "Phân tích baseline";
}
export function analysisRunTitle(rawId: string, playback = false) {
  const id = analysisRunId(rawId);
  return id === null ? "Lượt chạy không hợp lệ" : `${playback ? "Phát lại · " : ""}Lượt chạy #${String(id).padStart(4, "0")}`;
}
export const analysisDocumentTitle = (title: string) => `${title} | VehicSim`;
