import { object, FAError, type RecordValue } from "./failureAnalysisV3Data";
export type DatabaseKind = "runs" | "collections";
export type DatabasePage = { items: RecordValue[]; limit: number; offset: number };
export type DatabaseInspection = RecordValue & { can_analyze: boolean; source_sha256: string | null; members: RecordValue[]; availability: string };
const invalid = (): never => { throw new FAError("MALFORMED_DATABASE_INPUT", "Dữ liệu nguồn CARLA từ database không đúng hợp đồng."); };
export function databaseIdentity(v: unknown, project: number, kind: DatabaseKind): RecordValue {
  const x = object(v);
  if (x.schema_version !== "vehicsim.fa-db-input/v1" || x.project_id !== project || x.selection_kind !== (kind === "runs" ? "RUN" : "COLLECTION")) invalid();
  return x;
}
export function databasePage(v: unknown, project: number, kind: DatabaseKind): DatabasePage {
  const x = databaseIdentity(v, project, kind);
  if (!Array.isArray(x.items) || !Number.isSafeInteger(x.limit) || Number(x.limit) < 1 || Number(x.limit) > 20 || !Number.isSafeInteger(x.offset) || Number(x.offset) < 0 || x.items.length > Number(x.limit)) invalid();
  for (const row of x.items as unknown[]) { const r = object(row); if (!Number.isSafeInteger(r.id) || Number(r.id) < 1 || r.project_id !== project) invalid(); }
  return x as unknown as DatabasePage;
}
export function databaseInspection(v: unknown, project: number, kind: DatabaseKind, id: number): DatabaseInspection {
  const x = databaseIdentity(v, project, kind);
  if (x.selection_id !== id || typeof x.can_analyze !== "boolean" || !Array.isArray(x.members) || typeof x.availability !== "string" || !(x.source_sha256 === null || typeof x.source_sha256 === "string" && /^[a-f0-9]{64}$/.test(x.source_sha256)) || x.can_analyze && x.source_sha256 === null) invalid();
  return x as DatabaseInspection;
}
export function databaseId(id: number): number {
  if (!Number.isSafeInteger(id) || id < 1) throw new FAError("INVALID_DATABASE_ID", "Mã run/biến thể không hợp lệ.");
  return id;
}
