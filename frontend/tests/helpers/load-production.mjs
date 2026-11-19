/** Transpile actual production modules for Node tests; no duplicate implementation or network imports. */
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../src");
const cache=new Map();
async function moduleUrl(file) {
  if (cache.has(file)) return cache.get(file);
  const pending=(async()=>{
    const relative=path.relative(sourceRoot,file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Production test import outside frontend/src");
    const source=await fs.readFile(file,"utf8");
    let code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
    const parsed=ts.createSourceFile(file,code,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS), imports=[];
    parsed.forEachChild(node=>{
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
        imports.push({name:node.moduleSpecifier.text,start:node.moduleSpecifier.getStart(parsed),end:node.moduleSpecifier.getEnd()});
    });
    for (const dependency of imports.reverse()) {
      const name=dependency.name;
      if (!name.startsWith(".") && !name.startsWith("@/")) throw new Error("Unsupported runtime dependency in pure production test: "+name);
      let target=name.startsWith("@/")?path.join(sourceRoot,name.slice(2)):path.resolve(path.dirname(file),name);
      if (!path.extname(target)) target+=".ts";
      const url=await moduleUrl(target);
      code=code.slice(0,dependency.start)+JSON.stringify(url)+code.slice(dependency.end);
    }
    return "data:text/javascript;base64,"+Buffer.from(code).toString("base64");
  })();
  cache.set(file,pending);
  return pending;
}
export const loadProduction=async relative=>import(await moduleUrl(path.resolve(sourceRoot,relative)));
