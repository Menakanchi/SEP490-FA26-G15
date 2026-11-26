/** Browser/production UI + responses captured from actual isolated MySQL tests; not live E2E. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright";
import {prepareAnalysisArtifacts,repoRoot} from "./helpers/analysis-artifacts.mjs";
const output=await prepareAnalysisArtifacts(path.join(repoRoot,"data/analysis-db-direct-browser"));
const f=JSON.parse(await fs.readFile(new URL("./fixtures/fa-db-input/mysql-output.json",import.meta.url),"utf8"));
assert.equal(f.kind,"BROWSER_FIXTURE_ONLY");const cases=Object.values(f.cases),base=process.env.ANALYSIS_UI_URL||"http://127.0.0.1:3143";
const actor={id:7,email:"db-fa@example.invalid",full_name:"MySQL fixture",role:"ENGINEER"},checks=[],requests=[],errors=[],screenshots=[];
let partial=false,empty=false,inspectError=false,hold=null,release,page;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
try {
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});
 await ctx.addInitScript(()=>{localStorage.setItem("vehicsim_access_token","db-browser-fixture-only");if(!sessionStorage.getItem("vehicsim_project"))sessionStorage.setItem("vehicsim_project","4")});
 await ctx.route("**/api/v1/**",async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname.replace("/api/v1",""),project=Number(req.headers()["x-vehicsim-project"])||4;
  const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,x-vehicsim-project","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}});
  requests.push({path:p,method:req.method(),project,body:req.postData()});
  if(p==="/auth/me")return reply(actor);
  if(p==="/vehicsim/context")return reply({project:{id:project,name:`Project ${project}`},workspace:{id:1,name:"Isolated fixture"},vehicle:{id:5,name:"Fixture identity only"},system:{id:1,name:"AEB",baseline:{id:33,label:"Identity fixture, not verified v1"}},versions:[{id:33,label:"Fixture33",status:"CANDIDATE"}],families:[],parameters:[],reviewer_projects:[4,2].map(id=>({id,name:`Project ${id}`,workspace_name:"Fixture",can_decide:true}))});
  if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
  if(p==="/vehicsim/projects")return reply({items:[]});
  if(p==="/vehicsim/analysis/runs")return reply({total:0,page:1,page_size:10,counts:{},items:[],objective_groups:[],evaluation_version:"adr040-stored-aggregation/1"});
  const root="/vehicsim/analysis/v3",tail=p.slice(root.length);
  if(tail==="/sources") {assert.equal(req.method(),"GET","Database flow must never upload source JSON");return reply({items:[],limit:20,offset:0})}
  if(tail==="/database/runs"||tail==="/database/collections")return reply(project===4&&!empty?(tail.endsWith("runs")?f.runs:f.collections):{schema_version:"vehicsim.fa-db-input/v1",selection_kind:tail.endsWith("runs")?"RUN":"COLLECTION",project_id:project,items:[],limit:20,offset:0});
  if(project!==4&&p.startsWith(root))return reply({error:{code:"DB_SELECTION_NOT_FOUND"}},404);
  const match=tail.match(/^\/database\/(runs|collections)\/(\d+)(\/executions)?$/);
  if(match){const item=match[1]==="collections"?(partial?f.cases["missing-member"]:f.cases.collection):f.cases.run;
   if(!match[3])return inspectError?reply({error:{code:"UNAVAILABLE"}},503):reply(match[2]==="2511"?f.missingRun:item.inspection);
   assert.equal(req.method(),"POST");assert.equal(req.postData(),null);assert.equal(url.searchParams.get("source_sha256"),item.inspection.source_sha256);
   if(hold){const h=hold;hold=null;h.seen();await h.promise}return reply(item.execution,201);
  }
  const item=cases.find(c=>tail.includes(c.execution.id)||tail.includes(c.handoff.id)||Object.keys(c.reports).some(id=>tail.includes(id)));
  if(item){if(tail===`/executions/${item.execution.id}`)return reply(item.execution);if(tail===`/executions/${item.execution.id}/reports`)return reply(item.reportsPage);if(tail===`/handoffs/${item.handoff.id}`)return reply(item.handoff);const id=Object.keys(item.reports).find(id=>tail===`/reports/${id}`);if(id)return reply(item.reports[id])}
  return reply({detail:"Outside DB-flow HTTP fixture"},404);
 });
 page=await ctx.newPage();page.setDefaultTimeout(15000);page.on("pageerror",e=>errors.push(e.message));
 const home=async()=>{await page.goto(base+"/analysis/failures?view=runs&q=preserved");await page.getByLabel("Kết quả CARLA",{exact:true}).locator('option[value="2499"]').waitFor({state:"attached"})};
 const select=async(value="2499")=>{await page.getByLabel("Kết quả CARLA",{exact:true}).selectOption(value);await page.getByText(/Kết quả (đã sẵn sàng|chưa sẵn sàng) để phân tích/).waitFor()};
 const analyze=async()=>{await page.getByRole("button",{name:"Phân tích kết quả CARLA",exact:true}).click();await page.getByRole("region",{name:"Kết quả các lượt chạy",exact:true}).waitFor()};
 const shot=async name=>{await page.screenshot({path:path.join(output,name+".png"),fullPage:true});screenshots.push(name+".png")};
 await page.goto(base+"/analysis/failures");const legacy=page.getByText("Kết quả đã lưu và chuẩn bị tập bàn giao",{exact:true});await legacy.waitFor();assert.equal(await legacy.locator("xpath=ancestor::details[1]").getAttribute("open"),null);await shot("default-desktop");await page.setViewportSize({width:375,height:900});await shot("default-mobile");assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1440,height:1000});await legacy.click();await page.getByLabel("Trạng thái",{exact:true}).selectOption("COMPLETED");await page.getByRole("button",{name:"Xóa bộ lọc",exact:true}).click();assert.notEqual(await legacy.locator("xpath=ancestor::details[1]").getAttribute("open"),null);checks.push("00 legacy tools start collapsed, stay open after filter reset");
 await home();assert.equal(await page.locator('input[type="file"]').count(),0);await select();await shot("database-run-desktop");await analyze();await page.getByRole("button",{name:"Xem kết quả 2499",exact:true}).click();await page.getByRole("article",{name:"Kết quả phân tích",exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get("fa_execution"),f.cases.run.execution.id);assert.equal(new URL(page.url()).searchParams.get("q"),"preserved");checks.push("01 choose actual MySQL fixture run2499; bodyless DB POST; no manual upload; UUID output keeps filter context");
 const report=page.getByRole("article",{name:"Kết quả phân tích",exact:true}),record=Object.values(f.cases.run.reports)[0];
 await shot("analysis-result-desktop");await page.setViewportSize({width:375,height:900});await shot("analysis-result-mobile");assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1440,height:1000});
 assert.match(await report.innerText(),/Chưa đủ dữ liệu để xác định nguyên nhân/);assert.equal(await report.locator("pre").count(),0);
 const impact=record.report.objectives.impact_speed_mps;if(impact.canonical_applicability==="APPLICABLE"&&typeof impact.canonical_value.value==="number")assert.match(await report.innerText(),/Tốc độ va chạm tương đối/);
 checks.push("02 short conclusion preserves unknown cause; raw data and irrelevant objectives absent");
 const writes=requests.filter(r=>r.method==="POST").length,deep=page.url();await page.reload();await report.waitFor();assert.equal(page.url(),deep);assert.equal(requests.filter(r=>r.method==="POST").length,writes);checks.push("03 refresh/deep-link reads persisted report with no re-analysis POST");
 await home();await page.getByLabel("Phạm vi phân tích",{exact:true}).selectOption("collections");await select("1033");await analyze();assert.equal(await page.getByRole("button",{name:/^Xem kết quả /}).count(),2);checks.push("04 collection keeps both run identities");
 await page.getByRole("button",{name:"Xem kết quả 2511",exact:true}).click();await report.waitFor();assert.match(await report.innerText(),/AEB tắt/);assert.match(await page.getByRole("region",{name:"Bước tiếp theo",exact:true}).innerText(),/chưa đủ điều kiện/i);assert.equal(await page.getByRole("link",{name:/Tiếp tục tối ưu/}).count(),0);const reviewUrl=new URL(await page.getByRole("link",{name:/Chuẩn bị tập bàn giao/}).getAttribute("href"),base);assert.equal(reviewUrl.searchParams.get("view"),"dataset");assert.equal(reviewUrl.searchParams.get("fa_execution"),null);checks.push("05 AEB OFF remains separate; diagnostic-only handoff never authorizes optimizer dispatch");
 partial=true;await home();await page.getByLabel("Phạm vi phân tích",{exact:true}).selectOption("collections");await select("1033");assert.match(await page.getByRole("region",{name:"Kết quả CARLA trong database",exact:true}).innerText(),/chưa đủ dữ liệu/i);await analyze();assert.match(await page.getByRole("region",{name:"Kết quả các lượt chạy",exact:true}).innerText(),/Chưa thể phân tích/);assert.equal(await page.getByRole("button",{name:/^Xem kết quả /}).count(),1);await shot("database-partial-desktop");checks.push("06 missing member remains visible and blocked");
 await home();await select("2511");assert(await page.getByRole("button",{name:"Phân tích kết quả CARLA",exact:true}).isDisabled());assert.match(await page.getByRole("region",{name:"Kết quả CARLA trong database",exact:true}).innerText(),/chưa đủ dữ liệu/i);checks.push("07 missing original result disables analysis without reconstruction");
 partial=false;await home();await select();await page.setViewportSize({width:375,height:900});await shot("database-run-mobile");assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.getByRole("button",{name:"Phân tích kết quả CARLA",exact:true}).focus();assert(await page.getByRole("button",{name:"Phân tích kết quả CARLA",exact:true}).evaluate(el=>document.activeElement===el));await page.setViewportSize({width:1440,height:1000});checks.push("08 mobile reflow and keyboard access");
 empty=true;await page.goto(base+"/analysis/failures");await page.getByText(/Chưa có kết quả CARLA hoàn tất/).waitFor();assert(await page.getByRole("button",{name:"Phân tích kết quả CARLA",exact:true}).isDisabled());empty=false;
 inspectError=true;await home();await page.getByLabel("Kết quả CARLA",{exact:true}).selectOption("2499");await page.getByRole("region",{name:"Kết quả CARLA trong database"}).getByRole("alert").waitFor();assert(await page.getByRole("button",{name:"Phân tích kết quả CARLA",exact:true}).isDisabled());inspectError=false;checks.push("10 empty list and API failure do not permit analysis");
 await home();await select();let seen;const requested=new Promise(r=>{seen=r}),promise=new Promise(r=>{release=r});hold={seen,promise};await page.getByRole("button",{name:"Phân tích kết quả CARLA",exact:true}).click();await requested;assert(await page.getByRole("button",{name:"Đang xử lý kết quả CARLA…",exact:true}).isDisabled());await page.getByLabel("Project đang xem",{exact:true}).selectOption("2");await page.waitForURL(u=>u.pathname==="/");release();await page.waitForTimeout(300);assert.equal(new URL(page.url()).searchParams.get("fa_execution"),null);checks.push("09 loading and project switch discard old-context navigation");
 assert.deepEqual(errors,[]);assert(requests.filter(r=>r.method==="POST").every(r=>/^\/vehicsim\/analysis\/v3\/database\/(runs|collections)\/\d+\/executions$/.test(r.path)));assert(!requests.some(r=>/optimization|mobo/.test(r.path)));
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",checks,screenshots,errors,liveBackendVerified:false,mysqlBackendVerifiedSeparately:true,producerModified:false,manualSourceUploads:0},null,2));console.log("PASS9 DB-input browser groups; actual MySQL output fixtures, not live E2E");
}catch(error){await page?.screenshot({path:path.join(output,"failure.png"),fullPage:true});await fs.writeFile(path.join(output,"failure.json"),JSON.stringify({error:String(error),requests,errors,text:await page?.locator("body").innerText()},null,2));throw error}finally{release?.();await browser.close()}
