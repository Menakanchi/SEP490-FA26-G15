/** Migration 012 on an isolated, populated pre-012 schema; never accesses the project DB. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const config=JSON.parse(readFileSync("target/admin-qa/config.json","utf8"));
assert.equal(config.mysql,"vsos-admin-qa-mysql");
const database="qa_legacy_"+Date.now();
const args=["exec","-i","-e","MYSQL_PWD="+config.db_password,config.mysql,"mysql","-uroot","--batch","--skip-column-names","--default-character-set=utf8mb4"];
function sql(query,db=database) { return execFileSync("docker",[...args,db],{input:query,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim(); }
const before=execFileSync("git",["show","HEAD:database/mysql/01_schema.sql"],{encoding:"utf8"})
    .replace("CREATE DATABASE IF NOT EXISTS vehicsim", "CREATE DATABASE IF NOT EXISTS "+database)
    .replace("USE vehicsim;","USE "+database+";");
execFileSync("docker",args,{input:before,encoding:"utf8",stdio:["pipe","pipe","pipe"]});
sql("INSERT INTO users(email,password_hash,role_id,last_name,first_name) SELECT email,password_hash,role_id,last_name,first_name FROM vehicsim.users WHERE role_id=(SELECT id FROM roles WHERE code='MANAGER') LIMIT 2");
const ids=sql("SELECT id FROM users ORDER BY id").split("\n").map(Number);
assert.equal(ids.length,2);
sql(`INSERT INTO workspaces(name,manager_id,created_by_user_id) VALUES('Legacy duplicate',${ids[0]},${ids[0]}),('Legacy duplicate',${ids[1]},${ids[0]})`);
const ws=Number(sql("SELECT MIN(id) FROM workspaces"));
sql(`INSERT INTO workspace_members(workspace_id,user_id) VALUES(${ws},${ids[1]})`);
sql(`INSERT INTO projects(workspace_id,name,created_by_user_id) VALUES(${ws},'Legacy project',${ids[1]})`);
const project=Number(sql("SELECT MIN(id) FROM projects"));
sql(`INSERT INTO workspace_tasks(workspace_id,project_id,title,created_by_user_id) VALUES(${ws},${project},'Legacy task',${ids[0]})`);
const migration=readFileSync("database/mysql/migrations/012_2026-11-02_admin-integrity.sql","utf8");
let checks=0;
function fails(text) {
    assert.throws(()=>sql(migration),err=>String(err.stderr).includes(text)); checks++;
    assert.equal(sql("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='auth_version'"),"0"); checks++;
}
fails("Duplicate workspace names");
sql("UPDATE workspaces SET name=CONCAT(name,' second') WHERE id=(SELECT id FROM (SELECT MAX(id) AS id FROM workspaces) own_row)");
sql("INSERT INTO tech_references(ref_code,ref_name,ref_type,ref_value) VALUES('QA_DUP1','Legacy ref','CONSTANT',1),('QA_DUP2','Legacy ref','CONSTANT',2)");
fails("Duplicate reference names");
sql("UPDATE tech_references SET ref_name='Legacy ref second' WHERE ref_code='QA_DUP2'");
sql(migration);
assert.equal(sql("SELECT COUNT(*) FROM users WHERE auth_version=0"),"2"); checks++;
assert.equal(sql("SELECT COUNT(*) FROM workspace_members"),"1"); checks++;
assert.equal(sql("SELECT COUNT(*) FROM projects"),"1"); checks++;
assert.equal(sql("SELECT COUNT(*) FROM workspace_tasks"),"1"); checks++;
assert.throws(()=>sql(`INSERT INTO workspaces(name,manager_id,created_by_user_id) VALUES('Legacy duplicate',${ids[1]},${ids[0]})`),err=>String(err.stderr).includes("uq_workspaces_name")); checks++;
assert.throws(()=>sql("INSERT INTO tech_references(ref_code,ref_name,ref_type,ref_value) VALUES('QA_DUP3','Legacy ref','CONSTANT',3)"),err=>String(err.stderr).includes("uq_tech_references_kind_name")); checks++;
writeFileSync("target/admin-qa/migration-result.json",JSON.stringify({result:"PASS",checks,database},null,2));
console.log(`PASS: ${checks} populated legacy-schema migration/preflight assertions.`);