import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
export function analysisArtifactPath(candidate) {
  const destination=path.resolve(candidate), relative=path.relative(path.join(repoRoot,"data"),destination);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Analysis artifacts must use a subdirectory of repository data/");
  return destination;
}
export async function prepareAnalysisArtifacts(fallback, override=process.env.ANALYSIS_UI_OUTPUT) {
  const output=analysisArtifactPath(override || fallback);
  await fs.mkdir(output,{recursive:true});
  await fs.rm(path.join(output,"result.json"),{force:true});
  return output;
}
export function validateAnalysisResult(result) {
  if (result?.status!=="PASS" || result.kind!=="BROWSER_FIXTURE_ONLY" || result.baseline===true) throw new Error("Missing completed fixture assertions");
  if (result.errors!==undefined && (!Array.isArray(result.errors) || result.errors.length)) throw new Error("Browser errors in fixture result");
  return result;
}
