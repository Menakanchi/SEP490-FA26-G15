/** FE-R3: real browser events against the production UI; HTTP fixtures only. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright";
import {prepareAnalysisArtifacts,repoRoot} from "./helpers/analysis-artifacts.mjs";
import {resultFixture} from "./helpers/analysis-result-fixture.mjs";
const output=await prepareAnalysisArtifacts(path.join(repoRoot,"data/analysis-fe-r3/results"));
const base=process.env.ANALYSIS_UI_URL||"http://127.0.0.1:3143";
const original=resultFixture(), actor={id:999993,email:"fe-r3@example.invalid",full_name:"FE-R3 UI fixture",role:"ENGINEER"};
const v3Fixture=JSON.parse(await fs.readFile(new URL("./fixtures/fa-v3/collection.json",import.meta.url),"utf8"));
const v3ReportId=v3Fixture.execution.members[0].report_id;
const v3Report=JSON.parse(Buffer.from(v3Fixture.reportBytesBase64[v3ReportId],"base64"));
let payload=structuredClone(original), override, gate, showV3=false;
const gates=[],errors=[],runtimeWarnings=[],writes=[],requests=[],checks=[],screenshots=[];
const returnTo="/analysis/failures?view=runs&scenario_id=42&page=2&page_size=20&q=kept&sort=impact&weather=RAIN";
const href=(id=101,section="summary")=>`${base}/analysis/failures/${id}?section=${section}&t=0.25&signal=jerk_mps3&returnTo=${encodeURIComponent(returnTo)}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
try {
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});
 await ctx.addInitScript(()=>{localStorage.setItem("vehicsim_access_token","fe-r3-fixture-only");sessionStorage.setItem("vehicsim_project","999993");window.__decoded=[];const request=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await request(...args),json=response.json.bind(response);response.json=async()=>{const body=await json();window.__decoded.push(response.url);return body};return response}});
 await ctx.route("**/api/v1/**",async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.replace("/api/v1",""),project=Number(req.headers()["x-vehicsim-project"])||999993;
  const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,x-vehicsim-project","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}});
  requests.push({path:p,method:req.method(),project});
  if(p==="/auth/login")return reply({access_token:"fe-r3-fixture-only",token_type:"bearer",expires_in:3600,user:actor});
  if(req.method()!=="GET"){writes.push(p);return reply({detail:"Fixture forbids business writes"},405)}
  if(p==="/auth/me")return reply(actor);
  if(p==="/vehicsim/context")return reply({project:{id:project,name:`Project ${project}`},workspace:{id:1,name:"UI fixture"},vehicle:{id:2,name:"Fixture car"},system:{id:1,name:"AEB",baseline:{id:7,label:"v7"}},versions:[{id:7,label:"v7",status:"BASELINE"}],families:[{id:42,name:"Metric fixture",code:"CP"}],parameters:[],reviewer_projects:[999993,999992].map(id=>({id,name:`Project ${id}`,workspace_name:"UI fixture",can_decide:true}))});
    if (p === "/vehicsim/analysis/v3/sources") return reply({items:[],limit:20,offset:0}); // FE-R4: empty FA storage is independent of legacy runs.
    if (p === "/vehicsim/analysis/v3/explorer/scenarios") return reply({project_id:project,items:[],total:0,limit:20,offset:0});
    if (/^\/vehicsim\/analysis\/v3\/explorer\/scenarios\/\d+\/runs$/.test(p)) {
      const items=showV3?[{scenario_id:payload.run.scenario_id,scenario_version_id:payload.run.scenario_version_id,run_id:payload.run.run_id,report_id:v3ReportId}]:[];
      return reply({project_id:project,items,total:items.length,limit:1,offset:0});
    }
    if (p === `/vehicsim/analysis/v3/reports/${v3ReportId}`) return reply(v3Report);
    if (/^\/vehicsim\/analysis\/v3\/database\/(runs|collections)$/.test(p)) return reply({schema_version:"vehicsim.fa-db-input/v1",selection_kind:p.endsWith("collections")?"COLLECTION":"RUN",project_id:Number(route.request().headers()["x-vehicsim-project"]),items:[],limit:20,offset:0}); // Independent database source fixture.
  if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
  if(p==="/vehicsim/regression")return reply({items:[],kpis:{total:0,passed:0,failed:0,running:0}});
  if(p==="/vehicsim/analysis/runs"){
   const url=new URL(req.url()),pageNo=Number(url.searchParams.get("page"))||1,size=Number(url.searchParams.get("page_size"))||20;
   const members=[original.run,{...original.run,run_id:102,scenario_version_id:202,variant:"CP-002"}];
   return reply({total:members.length,page:pageNo,page_size:size,counts:{COLLISION:members.length},items:members.slice((pageNo-1)*size,pageNo*size),objective_groups:[],evaluation_version:"adr040-stored-aggregation/1"});
  }
  const match=p.match(/^\/vehicsim\/analysis\/runs\/(\d+)$/);
  if(match){
   const id=Number(match[1]),body=override===undefined?{run:{...payload.run,run_id:id,family:`Project ${project}`},detail:payload.detail===null?null:{...payload.detail,run_id:id}}:structuredClone(override);
   if(gate?.id===id){const held=gate;gate=null;held.seen();await held.released}
   return reply(body);
  }
  if(/^\/vehicsim\/runs\/\d+\/playback$/.test(p))return reply({...original.detail,frames:original.frames,duration_s:0.5,related_runs:[]});
  return reply({detail:"Outside FA result fixture scope"},404);
 });
 const page=await ctx.newPage();page.setDefaultTimeout(15000);page.on("pageerror",e=>errors.push(e.message));
 page.on("console",message=>{if(["warning","error"].includes(message.type())&&!/Failed to load resource|net::ERR_/.test(message.text()))runtimeWarnings.push(message.text())});
 const conclusion=page.getByRole("region",{name:"Kết luận phân tích",exact:true});
 const shot=async name=>{await page.screenshot({path:path.join(output,name+".png"),fullPage:true});screenshots.push(name+".png")};
 const load=async()=>{await page.goto(href());try {await conclusion.waitFor()} catch(e) {console.error("Detail state:",await page.locator("body").innerText(),"requests:",requests,"errors:",errors,"warnings:",runtimeWarnings);throw e}};
 await load();assert.match(await conclusion.innerText(),/Có ghi nhận va chạm/);assert.equal(await page.getByRole("link",{name:"Phát lại mô phỏng",exact:true}).count(),1);
 const important=page.getByRole("region",{name:"Thông tin quan trọng",exact:true});assert.match(await important.innerText(),/10\.000 m\/s/);checks.push("recorded collision and impact shown; playback available");
 payload.detail.metrics.impact_speed_mps=null;await load();assert.doesNotMatch(await page.locator("main").innerText(),/10\.000 m\/s/);checks.push("missing impact is not invented");
 payload=structuredClone(original);payload.detail.evaluation_valid=false;await load();assert.match(await conclusion.innerText(),/Chưa đủ dữ liệu kết luận/);assert.doesNotMatch(await page.locator("main").innerText(),/10\.000 m\/s/);checks.push("invalid evaluation has no safety conclusion or objective");
 showV3=true;await load();await conclusion.getByText(/Nhận định từ báo cáo V3 đã lưu/).waitFor();assert.match(await conclusion.innerText(),/Nghi ngờ phanh không hiệu quả/);assert.match(await page.getByRole("heading",{name:"Nguyên nhân và hướng kiểm tra"}).locator("..").innerText(),/Thời điểm can thiệp và đáp ứng phanh/);checks.push("V3 diagnosis and hypothesis shown for the requested run");showV3=false;
 payload=structuredClone(original);payload.run.aeb_mode="OFF";await load();assert.match(await conclusion.innerText(),/Lượt đối chứng AEB tắt/);assert.match(await conclusion.innerText(),/không tham gia đánh giá/);checks.push("AEB OFF is reference only");
 payload=structuredClone(original);payload.detail.verdict="PASS";payload.detail.metrics.false_activation=true;await load();assert.match(await conclusion.innerText(),/chưa thống nhất/);checks.push("conflicting stored fields are disclosed");
 payload={run:{...original.run,status:"RUNNING",trace_available:false},detail:null};await page.goto(href());await page.getByRole("region",{name:"Run chưa có kết quả phân tích",exact:true}).waitFor();assert.equal(await conclusion.count(),0);assert(await page.getByRole("button",{name:"Kiểm tra lại trạng thái",exact:true}).isEnabled());checks.push("unfinished run has no conclusion");
 for(const malformed of [{},null,{run:original.run,detail:{}},{run:original.run,detail:{...original.detail,metrics:null}},{run:original.run,detail:{...original.detail,events:[null]}}]){override=malformed;await page.goto(href());await page.getByRole("button",{name:"Thử lại",exact:true}).waitFor();assert.equal(await conclusion.count(),0)}
 override=undefined;payload=structuredClone(original);await page.getByRole("button",{name:"Thử lại",exact:true}).click();await conclusion.waitFor();checks.push("malformed responses rejected and retry recovers");
 for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot("result-"+width)}checks.push("responsive detail layouts");
 const playbackLink=new URL(await page.getByRole("link",{name:"Phát lại mô phỏng",exact:true}).getAttribute("href"),base);assert.equal(playbackLink.searchParams.get("t"),"0.25");assert.equal(playbackLink.searchParams.get("signal"),"jerk_mps3");assert.equal(playbackLink.searchParams.get("returnTo"),returnTo);checks.push("playback retains time, signal and return context");
 assert.deepEqual(errors,[]);assert.deepEqual(runtimeWarnings,[]);assert.deepEqual(writes,[]);
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",checks,screenshots,errors,runtimeWarnings,businessWrites:0,liveBackendVerified:false,carlaRuntimeVerified:false,figmaCompared:false},null,2));console.log("PASS current detail: recorded results, validity, reference, errors, playback and responsive fixtures");
} finally {for(const gate of gates)gate.release();await browser.close()}
