/**
 * Real HTTP/MySQL smoke test. Only runs against the isolated QA fixture.
 * Prerequisites: target/admin-qa/config.json, vsos-admin-qa-mysql, backend :18001.
 * Never point this at a shared or production database.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const config=JSON.parse(readFileSync("target/admin-qa/config.json","utf8"));
assert.equal(config.mysql,"vsos-admin-qa-mysql");
assert.equal(config.api,"http://localhost:18001/api/v1");
const suffix=Date.now().toString(36);
const email=name=>`qa-${name}-${suffix}@example.invalid`;
let checks=0;
async function call(method,path,token,body,status=200) {
  const response=await fetch(config.api+path,{method,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();
  assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(result)}`);
  checks++; return result;
}
function sql(query) {
  return execFileSync("docker",["exec","-e","MYSQL_PWD="+config.db_password,config.mysql,"mysql","-uroot","--batch","--skip-column-names","vehicsim","-e",query],{encoding:"utf8"}).trim();
}
const adminEmail=email("admin");
const signup=await call("POST","/auth/register",null,{email:adminEmail,password:config.password,lastName:"QA",firstName:"Admin",role:"ADMIN",role_id:1},200);
assert.equal(signup.user.role,"EXPERIENCER"); checks++;
sql(`UPDATE users SET role_id=(SELECT id FROM roles WHERE code='ADMIN') WHERE email='${adminEmail}'`);
const login=async account=>(await call("POST","/auth/login",null,{email:account,password:config.password})).access_token;
const admin=await login(adminEmail);
const internal={};
for(const role of ["MANAGER","ENGINEER","REVIEWER","EXPERIENCER"]) {
  const account=email(role.toLowerCase());
  const body={email:account,last_name:"QA",first_name:role,role,is_active:true,password:config.password};
  const user=await call("POST","/vehicsim/admin/users",admin,body,201);
  assert(!("password_hash" in user)); checks++;
  const token=await login(account);
  internal[role]={...user,token,body};
  for(const resource of ["users","workspaces","tech-references"])
    await call("GET","/vehicsim/admin/"+resource,token,null,403);
}
await call("GET","/vehicsim/admin/users",null,null,401);
await call("GET","/vehicsim/admin/users","invalid-token",null,401);
await call("POST","/vehicsim/admin/users",admin,internal.MANAGER.body,400);
await call("POST","/vehicsim/admin/users",admin,{...internal.MANAGER.body,email:email("invalid"),role:"ROOT"},400);
const mine=await call("GET","/auth/me",admin);
await call("PUT","/vehicsim/admin/users/"+mine.id,admin,{email:adminEmail,last_name:"QA",first_name:"Admin",role:"MANAGER",is_active:true},400);
const bodyFor=user=>{const {password,...body}=user.body;return body;};
await call("PUT","/vehicsim/admin/users/"+internal.ENGINEER.id,admin,{...bodyFor(internal.ENGINEER),role:"REVIEWER"});
await call("GET","/auth/me",internal.ENGINEER.token,null,401);
const newReviewer=await login(internal.ENGINEER.email);
await call("PUT","/vehicsim/admin/users/"+internal.ENGINEER.id,admin,{...bodyFor(internal.ENGINEER),role:"REVIEWER",is_active:false});
await call("GET","/auth/me",newReviewer,null,401);
await call("POST","/auth/login",null,{email:internal.ENGINEER.email,password:config.password},403);
await call("PUT","/vehicsim/admin/users/"+internal.ENGINEER.id,admin,{...bodyFor(internal.ENGINEER),role:"REVIEWER",is_active:true});
await call("GET","/auth/me",newReviewer,null,401);
const wsBody={name:"Admin QA "+suffix,description:"Persisted QA workspace",manager_id:internal.MANAGER.id};
const workspace=await call("POST","/vehicsim/admin/workspaces",admin,wsBody,201);
assert.equal(workspace.status,"ACTIVE"); checks++;
await call("POST","/vehicsim/admin/workspaces",admin,wsBody,400);
await call("POST","/vehicsim/admin/workspaces",admin,{...wsBody,name:"Invalid "+suffix,manager_id:internal.REVIEWER.id},400);
await call("PUT","/vehicsim/admin/users/"+internal.MANAGER.id,admin,{...bodyFor(internal.MANAGER),role:"ENGINEER"},400);
await call("PUT","/vehicsim/admin/users/"+internal.MANAGER.id,admin,{...bodyFor(internal.MANAGER),is_active:false},400);
const assigned=await call("GET","/vehicsim/notifications",internal.MANAGER.token);
assert(assigned.items.some(n=>n.type==="WORKSPACE_ASSIGNED" && n.reference_id===workspace.id)); checks++;
await call("POST",`/vehicsim/workspaces/${workspace.id}/members`,admin,{user_id:internal.EXPERIENCER.id,role:"ENGINEER"},403);
await call("POST",`/vehicsim/workspaces/${workspace.id}/members`,internal.MANAGER.token,{user_id:internal.EXPERIENCER.id,role:"ENGINEER"},201);
await call("GET","/auth/me",internal.EXPERIENCER.token,null,401);
sql(`INSERT INTO projects(workspace_id,name,created_by_user_id) VALUES(${workspace.id},'QA project',${internal.EXPERIENCER.id})`);
const ownedId=Number(sql(`SELECT id FROM projects WHERE workspace_id=${workspace.id} AND name='QA project'`));
sql(`INSERT INTO workspace_tasks(workspace_id,project_id,title,created_by_user_id,assigned_to_user_id) VALUES(${workspace.id},${ownedId},'QA task',${internal.MANAGER.id},${internal.EXPERIENCER.id})`);
const secondBody={...internal.MANAGER.body,email:email("manager2")};
const second=await call("POST","/vehicsim/admin/users",admin,secondBody,201);
const secondToken=await login(second.email);
const moved=await call("PUT","/vehicsim/admin/workspaces/"+workspace.id,admin,{...wsBody,manager_id:second.id});
assert.equal(Number(moved.member_count),1); assert.equal(Number(moved.project_count),1);
assert.equal(Number(sql(`SELECT COUNT(*) FROM workspace_tasks WHERE workspace_id=${workspace.id}`)),1); checks+=3;
await call("GET",`/vehicsim/workspaces/${workspace.id}`,internal.MANAGER.token,null,404);
await call("GET",`/vehicsim/workspaces/${workspace.id}`,secondToken);
assert((await call("GET","/vehicsim/notifications",secondToken)).items.some(n=>n.type==="WORKSPACE_ASSIGNED")); checks++;
const searched=await call("GET","/vehicsim/admin/workspaces?q="+encodeURIComponent(second.email)+"&status=ACTIVE",admin);
assert(searched.items.some(w=>w.id===workspace.id)); checks++;
sql(`UPDATE workspaces SET status='ARCHIVED' WHERE id=${workspace.id}`);
await call("PUT","/vehicsim/admin/workspaces/"+workspace.id,admin,{...wsBody,manager_id:second.id},400);
const refBody={ref_code:"QA_"+suffix,ref_type:"CONSTANT",ref_name:"QA constant "+suffix,ref_value:"1.234567890123",unit:"m",description:"QA",source_type:"PAPER",source_title:"QA source",author:"QA",organization:"QA",publication_year:2026,page:"1",url:"https://example.invalid/reference",doi:"10.0000/qa",is_active:true};
const ref=await call("POST","/vehicsim/admin/tech-references",admin,refBody,201);
await call("PUT","/vehicsim/admin/tech-references/"+ref.id,admin,{...refBody,ref_value:"123456789012345678.123456789012"});
const exact=await call("GET","/vehicsim/admin/tech-references/"+ref.id,admin);
assert.equal(exact.ref_value,"123456789012345678.123456789012"); checks++;
await call("POST","/vehicsim/admin/tech-references",admin,refBody,400);
await call("POST","/vehicsim/admin/tech-references",admin,{...refBody,ref_code:refBody.ref_code+"_2"},400);
await call("POST","/vehicsim/admin/tech-references",admin,{...refBody,ref_code:"INVALID",ref_value:"abc"},400);
await call("POST","/vehicsim/admin/tech-references",admin,{...refBody,ref_type:"STANDARD"},400);
await call("PUT","/vehicsim/admin/tech-references/"+ref.id,admin,{...refBody,ref_value:"2.5",is_active:false});
const reread=await call("GET","/vehicsim/admin/tech-references/"+ref.id,admin);
assert.equal(Number(reread.ref_value),2.5); assert.equal(reread.source_title,"QA source"); checks+=2;
await call("DELETE","/vehicsim/admin/tech-references/"+ref.id,admin,null,405);
const filtered=await call("GET","/vehicsim/admin/tech-references?q="+suffix+"&role=CONSTANT&status=INACTIVE&page_size=1",admin);
assert.equal(filtered.total,1); checks++;
await call("GET","/vehicsim/admin/users?page_size=101",admin,null,400);
await call("GET","/vehicsim/admin/users?role=ADMIN",admin);
assert.equal(Number(sql(`SELECT COUNT(*) FROM tech_references WHERE id=${ref.id} AND is_active=FALSE`)),1); checks++;
// Deliberately fail notification insertion in this isolated fixture: workspace transaction must roll back.
sql("CREATE TRIGGER qa_fail_notification BEFORE INSERT ON notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='QA notification failure'");
try {
  await call("POST","/vehicsim/admin/workspaces",admin,{...wsBody,name:"Rollback "+suffix,manager_id:second.id},500);
  assert.equal(Number(sql(`SELECT COUNT(*) FROM workspaces WHERE name='Rollback ${suffix}'`)),0); checks++;
} finally { sql("DROP TRIGGER qa_fail_notification"); }
// Common account flows for an Admin account, independent of the primary QA session.
const authBody={...internal.MANAGER.body,email:email("auth-admin"),role:"ADMIN"};
const authAdmin=await call("POST","/vehicsim/admin/users",admin,authBody,201);
const authToken=await login(authAdmin.email);
const profile=await call("PUT","/auth/me",authToken,{full_name:"QA Admin Profile"});
assert.equal(profile.role,"ADMIN"); assert.equal(profile.full_name,"QA Admin Profile"); checks+=2;
const newPassword=config.password+"X";
const changed=await call("POST","/auth/password/change",authToken,{old_password:config.password,new_password:newPassword});
await call("GET","/auth/me",authToken,null,401);
await call("GET","/auth/me",changed.access_token);
await call("POST","/auth/login",null,{email:authAdmin.email,password:newPassword});

// Two concurrent creates must leave exactly one workspace.
const concurrentName="Concurrent "+suffix;
const concurrentBody={...wsBody,name:concurrentName,manager_id:second.id};
const concurrent=await Promise.all([1,2].map(()=>fetch(config.api+"/vehicsim/admin/workspaces",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+admin},body:JSON.stringify(concurrentBody)})));
const statuses=concurrent.map(r=>r.status).sort();
assert.equal(statuses[0],201); assert([400,409].includes(statuses[1]));
assert.equal(Number(sql(`SELECT COUNT(*) FROM workspaces WHERE name='${concurrentName}'`)),1); checks+=3;

// Assignment and Manager demotion contend on the same user row.
const raceBody={...internal.MANAGER.body,email:email("race-manager")};
const raceManager=await call("POST","/vehicsim/admin/users",admin,raceBody,201);
const {password:ignoredPassword,...raceUpdate}=raceBody;
const race=await Promise.all([
    fetch(config.api+"/vehicsim/admin/workspaces",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+admin},body:JSON.stringify({...wsBody,name:"Race "+suffix,manager_id:raceManager.id})}),
    fetch(config.api+"/vehicsim/admin/users/"+raceManager.id,{method:"PUT",headers:{"Content-Type":"application/json",Authorization:"Bearer "+admin},body:JSON.stringify({...raceUpdate,role:"ENGINEER"})})
]);
assert.equal(race.filter(r=>r.ok).length,1);
assert.equal(race.filter(r=>r.status===400).length,1);
assert.equal(Number(sql(`SELECT COUNT(*) FROM workspaces w JOIN users u ON u.id=w.manager_id JOIN roles r ON r.id=u.role_id WHERE w.manager_id=${raceManager.id} AND (r.code<>'MANAGER' OR u.is_active=FALSE)`)),0); checks+=3;

const result={checks,adminEmail,password:config.password,adminToken:admin,workspaceId:workspace.id,referenceId:ref.id,suffix};
writeFileSync("target/admin-qa/state.json",JSON.stringify(result,null,2));
writeFileSync("target/admin-qa/api-result.json",JSON.stringify({checks,result:"PASS",scope:"real HTTP + isolated MySQL + Redis"},null,2));
console.log(`PASS: ${checks} real API/database assertions; credentials stored only under ignored target/admin-qa.`);