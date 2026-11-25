/** Pure URL presentation shared by server metadata and client page headings. */
export const analysisRunId = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
export function analysisListTitle(_view: unknown) {
  // Keep the legacy metadata call signature; all views now share one workspace.
  void _view;
  return "Dữ liệu & kết quả";
}
export function analysisRunTitle(rawId: string, playback = false) {
  const id = analysisRunId(rawId);
  return id === null ? "Lượt chạy không hợp lệ" : `${playback ? "Phát lại · " : ""}Lượt chạy #${String(id).padStart(4, "0")}`;
}
export const analysisDocumentTitle = (title: string) => `${title} | VehicSim`;
