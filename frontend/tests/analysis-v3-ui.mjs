/** Real browser/production UI, real service/core outputs, HTTP/storage fixtures only. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright";
import {prepareAnalysisArtifacts,repoRoot} from "./helpers/analysis-artifacts.mjs";
import {resultFixture} from "./helpers/analysis-result-fixture.mjs";
const output=await prepareAnalysisArtifacts(path.join(repoRoot,"data/analysis-fe-r4/v3"));
const base=process.env.ANALYSIS_UI_URL||"http://127.0.0.1:3143";
const fixtures=await Promise.all(["collection","standalone","partial","blocked"].map(async name=>{const f=JSON.parse(await fs.readFile(new URL(`./fixtures/fa-v3/${name}.json`,import.meta.url),"utf8"));f.reports=Object.fromEntries(Object.entries(f.reportBytesBase64).map(([id,value])=>[id,JSON.parse(Buffer.from(value,"base64"))]));return [name,f]}));
const cases=Object.fromEntries(fixtures),c=cases.collection,legacy=resultFixture();
const actor={id:7,email:"fe-r4@example.invalid",full_name:"FE-R4 browser fixture",role:"ENGINEER"};
const checks=[],screenshots=[],errors=[],requests=[];let nextStatus=null,hold=null,uploadCase=cases.standalone,explorerSummary=null,explorerSimulator="CARLA";
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
let release, page;
try {
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce",acceptDownloads:true});
 await ctx.addInitScript(()=>{localStorage.setItem("vehicsim_access_token","fe-r4-browser-fixture-only");if(!sessionStorage.getItem("vehicsim_project"))sessionStorage.setItem("vehicsim_project","1")});
 await ctx.route("**/api/v1/**",async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname.replace("/api/v1",""),project=Number(req.headers()["x-vehicsim-project"])||1;
  const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,x-vehicsim-project","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}});
  requests.push({path:p,query:url.search,method:req.method(),project,body:req.postData()});
  if(p==="/auth/me")return reply(actor);
  if(p==="/vehicsim/context")return reply({project:{id:project,name:`Project ${project}`},workspace:{id:1,name:"FE-R4 fixture"},vehicle:{id:2,name:"Fixture car"},system:{id:1,name:"AEB",baseline:{id:7,label:"v7"}},versions:[{id:7,label:"v7",status:"BASELINE"}],families:[{id:42,name:"Legacy fixture",code:"CP"}],parameters:[],reviewer_projects:[1,2].map(id=>({id,name:`Project ${id}`,workspace_name:"Fixture",can_decide:true}))});
    if (/^\/vehicsim\/analysis\/v3\/database\/(runs|collections)$/.test(p)) return reply({schema_version:"vehicsim.fa-db-input/v1",selection_kind:p.endsWith("collections")?"COLLECTION":"RUN",project_id:Number(route.request().headers()["x-vehicsim-project"]),items:[],limit:20,offset:0}); // Independent database source fixture.
  if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
  if(p==="/vehicsim/regression")return reply({items:[],kpis:{total:0,passed:0,failed:0,running:0}});
  if(p==="/vehicsim/analysis/runs")return reply({total:1,page:1,page_size:10,counts:{COLLISION:1},items:[legacy.run],objective_groups:[],evaluation_version:"adr040-stored-aggregation/1"});
  if(p===`/vehicsim/analysis/runs/${legacy.run.run_id}`)return reply({run:legacy.run,detail:legacy.detail});
  if(p==="/vehicsim/analysis/v3/explorer/scenarios") {
   const rows=project===1?[{scenario_id:42,code:"CP",name:"Họ kiểm thử",category:"CP_CROSSING",variant_count:2,analyzed_count:1,confirmed_count:0,suspected_count:1,no_failure_count:null,unknown_count:0}]:[];
   const q=url.searchParams.get("q")||"",items=rows.filter(row=>!q||["2499","1033",String(row.scenario_id),row.code,row.name].some(v=>v.toLocaleLowerCase("vi").includes(q.toLocaleLowerCase("vi"))));
   return reply({project_id:project,items,total:items.length,limit:20,offset:Number(url.searchParams.get("offset")||0),summary:explorerSummary??{scenario_count:items.length,variant_count:items.length*2,analyzed_count:items.length,confirmed_count:0,suspected_count:items.length,unknown_count:0}});
  }
  if(p==="/vehicsim/analysis/v3/explorer/scenarios/42/runs") {
   const member=c.execution.members.find(item=>item.run_key==="2499"),report=c.reports[member.report_id];
   const objectives=Object.fromEntries(Object.entries(report.report.objectives).map(([key,value])=>[key,{value:value.canonical_value.value,status:value.canonical_value.status,unit:value.canonical_value.unit,applicability:value.canonical_applicability}]));
   const rows=project===1?[{project_id:project,scenario_id:42,scenario_version_id:1033,version_no:3,run_id:2499,random_seed:49033,repetition:1,attempt:1,simulator_type:"CARLA",simulator_version:"carla-test",aeb_mode:"ON",status:"COMPLETED",report_id:member.report_id,execution_id:c.execution.id,analysis_status:"ANALYZED",classification:"SUSPECTED",physical_outcome:"COLLISION",failure_candidates:[{type:"INEFFECTIVE_BRAKING",status:"SUSPECTED"}],root_cause_hypotheses:[{type:"INEFFECTIVE_BRAKING_MECHANISM_INVESTIGATION",status:"SUSPECTED"}],objectives}]:[];
   if(explorerSimulator!=="CARLA") for(const row of rows) {row.simulator_type=explorerSimulator;row.report_id=null;row.execution_id=null;row.analysis_status="NOT_ANALYZED";row.classification="NOT_ANALYZED";}
   const q=url.searchParams.get("q")||"",mode=url.searchParams.get("aeb_mode"),state=url.searchParams.get("classification"),type=url.searchParams.get("failure_type"),cause=url.searchParams.get("root_cause");
   const items=rows.filter(row=>(!q||["2499","1033","42","CP","Họ kiểm thử"].some(v=>v.toLocaleLowerCase("vi").includes(q.toLocaleLowerCase("vi"))))&&(!mode||mode===row.aeb_mode)&&(!state||state===row.classification)&&(!type||row.failure_candidates.some(x=>x.type===type))&&(!cause||row.root_cause_hypotheses.some(x=>x.type===cause)));
   return reply({project_id:project,items,total:items.length,limit:20,offset:Number(url.searchParams.get("offset")||0)});
  }
  if(p==="/vehicsim/analysis/v3/explorer/scenarios/42/variants") {const q=url.searchParams.get("q")||"",found=project===1&&["","CP","42","1034","4"].includes(q);return reply({project_id:project,items:found?[{scenario_id:42,scenario_version_id:1034,version_no:4,run_count:0}]:[],total:found?1:0,limit:20,offset:0});}
  const root="/vehicsim/analysis/v3";
  if(!p.startsWith(root))return reply({detail:"Outside fixture scope"},404);
  const tail=p.slice(root.length);
  if(tail==="/sources") {
   if(req.method()==="POST")return reply(uploadCase.source,201);
   const offset=Number(url.searchParams.get("offset")||0);return reply({items:project===1&&offset===0?fixtures.map(([,f])=>f.source):[],offset,limit:20});
  }
  const f=fixtures.map(([,v])=>v).find(f=>tail.includes(f.source.id)||tail.includes(f.execution.id)||tail.includes(f.handoff.id)||Object.keys(f.reports).some(id=>tail.includes(id)));
  if(tail==="/executions"){const sourceId=url.searchParams.get("source_id"),found=fixtures.find(([,f])=>f.source.id===sourceId)?.[1];return reply({items:found?[found.execution]:[],limit:20,offset:0})}
  if(!f||project!==1)return reply({error:{code:"RESOURCE_NOT_FOUND"}},404);
  if(req.method()==="POST"&&tail.endsWith("/executions")) {
   assert.equal(req.postData(),null,"Default execution POST must have no body");
   if(nextStatus){const status=nextStatus;nextStatus=null;return reply({error:{code:"FIXTURE_BACKEND_BLOCKER",module:"FAILURE_ANALYSIS",retryable:status===429||status===503}},status)}
   if(hold){const pending=hold;hold=null;pending.seen();await pending.promise}
   return reply(f.execution,201);
  }
  if(tail===`/sources/${f.source.id}`)return reply(f.source);
  if(tail===`/sources/${f.source.id}/download`)return route.fulfill({contentType:"application/json",body:Buffer.from(f.sourceBase64,"base64")});
  if(tail===`/executions/${f.execution.id}`)return reply(f.execution);
  if(tail===`/executions/${f.execution.id}/reports`)return reply(f.reportsPage);
  if(tail===`/handoffs/${f.handoff.id}`)return reply(f.handoff);
  if(tail===`/handoffs/${f.handoff.id}/download`)return f.handoffBase64?route.fulfill({contentType:"application/json",body:Buffer.from(f.handoffBase64,"base64")}):reply({error:{code:"HANDOFF_NOT_GENERATED"}},409);
  const id=Object.keys(f.reports).find(id=>tail===`/reports/${id}`||tail===`/reports/${id}/download`);if(id)return route.fulfill({contentType:"application/json",body:Buffer.from(f.reportBytesBase64[id],"base64")});
  return reply({detail:"Unexpected fixture request"},404);
 });
 page=await ctx.newPage();page.setDefaultTimeout(15000);page.on("pageerror",e=>errors.push(e.message));
 const workspace=()=>page.getByRole("region",{name:"Phân tích dữ liệu",exact:true});
 const shot=async name=>{await page.screenshot({path:path.join(output,name+".png"),fullPage:true});screenshots.push(name+".png")};
 const openExecution=async f=>{await page.goto(base+`/analysis/failures?view=runs&scenario_id=42&q=kept&fa_execution=${f.execution.id}`);await page.getByRole("region",{name:"Kết quả các lượt chạy",exact:true}).waitFor()};
 const report=()=>page.getByRole("article",{name:"Kết quả phân tích",exact:true});
 for(const [analyzed,variants,visible] of [[0,2,true],[null,2,false],[1,2,false],[0,0,false]]) {
  explorerSummary={scenario_count:1,variant_count:variants,analyzed_count:analyzed,confirmed_count:null,suspected_count:0,unknown_count:0};
  await page.goto(base+"/analysis/failures");await page.getByRole("button",{name:"Họ kiểm thử · CP",exact:true}).waitFor();
  assert.equal(await page.locator("[data-fa-empty-note]").count(),visible?1:0,`empty note for analyzed=${analyzed}, variants=${variants}`);
  if(visible)assert.match(await page.locator("[data-fa-empty-note]").innerText(),/AEB bật khớp nguồn/);
 }
 explorerSummary=null;explorerSimulator="KINEMATIC";
 await page.goto(base+"/analysis/failures");await page.getByRole("button",{name:"Họ kiểm thử · CP",exact:true}).click();
 await page.getByRole("button",{name:/Biến thể 3 · ID 1033/}).click();
 assert.equal(await page.getByRole("button",{name:"Phân tích",exact:true}).count(),0);
 await page.getByText("Nguồn này chưa hỗ trợ phân tích tại đây",{exact:true}).waitFor();
 await page.getByText("Tìm kiếm nâng cao",{exact:true}).click();
 const offRequest=page.waitForResponse(response=>response.url().includes("/explorer/scenarios/42/runs")&&new URL(response.url()).searchParams.get("aeb_mode")==="OFF");
 await page.getByLabel("Chế độ AEB").selectOption("OFF");await offRequest;
 await page.getByText("Không có kết quả phù hợp. Hãy thử điều chỉnh tìm kiếm hoặc bộ lọc.",{exact:true}).waitFor();
 explorerSimulator="CARLA";
 checks.push("empty-summary distinguishes zero from null; kinematic runs do not expose CARLA analysis and AEB filter reaches server");
 await page.goto(base+"/analysis/failures");
 await page.getByRole("heading",{name:"Họ kịch bản",exact:true}).waitFor();
 await page.getByRole("button",{name:"Họ kiểm thử · CP",exact:true}).waitFor();await shot("scenario-overview");
 await page.getByRole("searchbox",{name:"Tìm kiếm",exact:true}).fill("2499");
 await page.waitForURL(url=>url.searchParams.get("fa_q")==="2499");
 await page.getByRole("button",{name:"Họ kiểm thử · CP",exact:true}).click();
 await page.getByRole("button",{name:/Biến thể 3 · ID 1033/}).click();
 assert.match(await page.getByRole("region",{name:"Bảng biến thể và lượt chạy"}).innerText(),/Phanh không hiệu quả/);
 await shot("scenario-runs");
 assert.equal(await page.getByText("Biến thể chưa có lượt chạy",{exact:true}).isVisible(),false);
 assert.equal(requests.filter(r=>r.path.includes("/explorer/scenarios/42/variants")).length,0);
 await page.getByText("Tìm kiếm nâng cao",{exact:true}).click();
 await page.getByLabel("Đánh giá AEB").selectOption("SUSPECTED");
 await page.waitForURL(url=>url.searchParams.get("fa_class")==="SUSPECTED");
 const weatherRequest=page.waitForResponse(response=>response.url().includes("/explorer/scenarios/42/runs")&&new URL(response.url()).searchParams.get("weather")==="RAIN").catch(()=>null);
 await page.getByRole("region",{name:"Khám phá họ kịch bản"}).locator("label").filter({hasText:"Thời tiết"}).locator("select").selectOption("RAIN");
 assert(await weatherRequest,"Weather filter must reach the server: "+JSON.stringify(requests.slice(-5)));
 await page.getByRole("button",{name:"Xem phân tích",exact:true}).click();await report().waitFor();await shot("diagnostic-detail");
 await page.getByRole("button",{name:"← Chọn kết quả khác",exact:true}).click();
 assert.equal(new URL(page.url()).searchParams.get("fa_q"),"2499");
 assert.equal(new URL(page.url()).searchParams.get("fa_class"),"SUSPECTED");
 assert.equal(new URL(page.url()).searchParams.get("fa_weather"),"RAIN");
 checks.push("scenario explorer uses server search, filters and returns to the preserved scope");
 await openExecution(c);assert.equal(new URL(page.url()).searchParams.get("fa_execution"),c.execution.id);
 assert.equal(await page.getByRole("button",{name:/^Xem kết quả /}).count(),2);
 await page.getByRole("button",{name:"Xem kết quả 2499",exact:true}).click();await report().waitFor();
 assert.match(await report().innerText(),/Nghi ngờ|Cần kiểm tra/);assert.match(await report().innerText(),/Nguyên nhân/);
 const deep=page.url();await page.reload();await report().waitFor();assert.equal(page.url(),deep);
 await page.getByRole("button",{name:"Xem kết quả 2511",exact:true}).click();await report().getByText(/Lượt chạy 2511/).waitFor();assert.match(await report().innerText(),/AEB tắt/);
 checks.push("saved source, collection execution, selected report and OFF reference remain available after reload");
 assert.match(await page.getByRole("region",{name:"Bước tiếp theo",exact:true}).innerText(),/chưa đủ điều kiện/);
 for(const name of ["partial","blocked"]){await openExecution(cases[name]);await page.getByText("Chưa thể phân tích",{exact:true}).first().waitFor();assert.match(await workspace().innerText(),/chưa thể phân tích/)}
 checks.push("partial and blocked executions remain visible and cannot be silently promoted");
 // The history control is hidden from users; unhide it only to retain its regression tests.
 {
  const home=async()=>{await page.goto(base+"/analysis/failures?view=runs&scenario_id=42&q=kept");const history=page.getByText("Kết quả phân tích trước đây",{exact:true});await history.locator("xpath=ancestor::details[1]").evaluate(el=>{el.hidden=false});await history.click();await workspace().locator("details").filter({has:history}).locator("select").locator("option[value='"+c.source.id+"']").waitFor({state:"attached"})};
  const select=async f=>{await workspace().locator("details").filter({has:page.getByText("Kết quả phân tích trước đây",{exact:true})}).locator("select").selectOption(f.source.id);await workspace().getByRole("button",{name:/^Xem lần phân tích 1/}).waitFor()};
  await home();await select(c);await page.getByRole("button",{name:"Phân tích lại",exact:true}).click();await page.getByRole("region",{name:"Kết quả các lượt chạy",exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get("fa_execution"),c.execution.id);
  await home();await select(c);nextStatus=403;await page.getByRole("button",{name:"Phân tích lại",exact:true}).click();await workspace().getByRole("alert").waitFor();assert.equal(new URL(page.url()).searchParams.get("fa_execution"),null);
  checks.push("dormant source history still analyzes and reports execution errors when exercised in isolation");
 }
 await openExecution(c);await page.getByRole("button",{name:"Xem kết quả 2499",exact:true}).click();await report().waitFor();
 for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"overflow "+width)}
 assert.deepEqual(errors,[]);await shot("current-report");
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",checks,screenshots,errors,liveBackendVerified:false,carlaRuntimeVerified:false},null,2));console.log("PASS V3 current browser flow; BROWSER_FIXTURE_ONLY");
} catch(error) {await page?.screenshot({path:path.join(output,"failure.png"),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(output,"failure.json"),JSON.stringify({error:String(error),requests,errors,text:await page?.locator("body").innerText().catch(()=>"")},null,2));throw error;} finally {release?.();await browser.close()}
