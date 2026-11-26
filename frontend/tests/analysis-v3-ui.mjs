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
const checks=[],screenshots=[],errors=[],requests=[];let nextStatus=null,hold=null,uploadCase=cases.standalone;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
let release, page;
try {
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce",acceptDownloads:true});
 await ctx.addInitScript(()=>{localStorage.setItem("vehicsim_access_token","fe-r4-browser-fixture-only");if(!sessionStorage.getItem("vehicsim_project"))sessionStorage.setItem("vehicsim_project","1")});
 await ctx.route("**/api/v1/**",async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname.replace("/api/v1",""),project=Number(req.headers()["x-vehicsim-project"])||1;
  const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,x-vehicsim-project","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}});
  requests.push({path:p,method:req.method(),project,body:req.postData()});
  if(p==="/auth/me")return reply(actor);
  if(p==="/vehicsim/context")return reply({project:{id:project,name:`Project ${project}`},workspace:{id:1,name:"FE-R4 fixture"},vehicle:{id:2,name:"Fixture car"},system:{id:1,name:"AEB",baseline:{id:7,label:"v7"}},versions:[{id:7,label:"v7",status:"BASELINE"}],families:[{id:42,name:"Legacy fixture",code:"CP"}],parameters:[],reviewer_projects:[1,2].map(id=>({id,name:`Project ${id}`,workspace_name:"Fixture",can_decide:true}))});
    if (/^\/vehicsim\/analysis\/v3\/database\/(runs|collections)$/.test(p)) return reply({schema_version:"vehicsim.fa-db-input/v1",selection_kind:p.endsWith("collections")?"COLLECTION":"RUN",project_id:Number(route.request().headers()["x-vehicsim-project"]),items:[],limit:20,offset:0}); // Independent database source fixture.
  if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
  if(p==="/vehicsim/regression")return reply({items:[],kpis:{total:0,passed:0,failed:0,running:0}});
  if(p==="/vehicsim/analysis/runs")return reply({total:1,page:1,page_size:10,counts:{COLLISION:1},items:[legacy.run],objective_groups:[],evaluation_version:"adr040-stored-aggregation/1"});
  if(p===`/vehicsim/analysis/runs/${legacy.run.run_id}`)return reply({run:legacy.run,detail:legacy.detail});
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
 const home=async()=>{await page.goto(base+"/analysis/failures?view=runs&scenario_id=42&q=kept");await page.getByText("Nguồn JSON đã lưu / nhập nâng cao",{exact:true}).click();await page.getByLabel("Nguồn JSON đã lưu",{exact:true}).locator("option[value='"+c.source.id+"']").waitFor({state:"attached"})};
 const select=async f=>{await page.getByLabel("Nguồn JSON đã lưu",{exact:true}).selectOption(f.source.id);await workspace().getByText(/Đã lưu:/).waitFor()};
 const analyze=async()=>{await page.getByRole("button",{name:"Phân tích",exact:true}).click();await page.getByRole("region",{name:"Thành viên lần phân tích",exact:true}).waitFor()};
 const report=()=>page.getByRole("article",{name:"Kết quả phân tích chuyên sâu V3.1",exact:true});
 await home();assert.equal(await page.getByRole("heading",{name:"Phân tích dữ liệu",exact:true}).count(),1);await shot("workspace-desktop");await page.setViewportSize({width:375,height:900});await shot("workspace-mobile");assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1440,height:1000});await select(c);checks.push("01 saved sources separate from legacy runs; actual source identities, upload secondary");
 await analyze();assert.equal(new URL(page.url()).searchParams.get("fa_execution"),c.execution.id);assert.match(await workspace().innerText(),/Đã phân tích 2 lượt mô phỏng/);await workspace().getByText("Chi tiết số lượng",{exact:true}).click();assert.match(await workspace().innerText(),/Dự kiến 2 · Tiếp nhận 2 · Đã phân tích 2 · Bị chặn 0 · Lỗi 0 · Thiếu 0/);assert.equal(await page.getByRole("button",{name:/^Xem run /}).count(),2);checks.push("02 bodyless collection POST commits execution, preserves two ON/OFF members");
 await page.getByRole("button",{name:"Xem run 2499",exact:true}).click();await report().waitFor();const first=c.reportsPage.items.find(m=>m.run_key==="2499"),core=c.reports[first.id];
 for(const [key,name] of [["rms_jerk_mps3","RMS jerk"],["impact_speed_mps","Tốc độ impact canonical"],["stopping_distance_m","Quãng đường dừng canonical"]]){const ev=core.report.objectives[key].canonical_value;assert.match(await report().getByRole("region",{name,exact:true}).innerText(),new RegExp(String(ev.value)))}
 assert.match(await report().innerText(),/SUSPECTED/);assert.match(await report().innerText(),/Nguyên nhân đã xác nhận:.*UNKNOWN/);assert.equal(await report().locator("details[open]").count(),0);checks.push("03 actual core objectives and SUSPECTED/root UNKNOWN; technical disclosures closed");
 await shot("result-desktop");await report().getByText(/Giả thuyết nguyên nhân \(/).click();await report().getByText("Bằng chứng hỗ trợ",{exact:true}).first().click();assert.match(await report().innerText(),/Kế hoạch phản chứng là đề xuất/);await shot("investigation-desktop");checks.push("04 evidence support/counter/alternatives/missing/falsification available; no invented execution");
 const deep=page.url();await page.reload();await report().waitFor();assert.equal(page.url(),deep);await page.getByRole("button",{name:"Xem run 2511",exact:true}).click();await page.getByRole("heading",{name:"Kết quả run 2511",exact:true}).waitFor();assert.match(await report().innerText(),/AEB: OFF/);const off=c.reports[c.reportsPage.items.find(m=>m.run_key==="2511").id];if(off.report.objectives.rms_jerk_mps3.canonical_value.value===null)assert.match(await report().getByRole("region",{name:"RMS jerk",exact:true}).innerText(),/Chưa có giá trị/);checks.push("05 hard refresh/UUID deep link preserves legacy query; OFF actual report/null separate");
 await page.getByRole("button",{name:"Xem run 2499",exact:true}).click();await report().waitFor();
 for(const [name,expected] of [["Tải Diagnostic Report JSON",Buffer.from(c.reportBytesBase64[first.id],"base64")],["Tải Handoff JSON",Buffer.from(c.handoffBase64,"base64")]]) { const pending=page.waitForEvent("download");await page.getByRole("button",{name,exact:true}).click();const download=await pending;assert.match(download.suggestedFilename(),/^(report|handoff)-[a-f0-9-]+\.json$/);assert.deepEqual(await fs.readFile(await download.path()),expected); }
 await page.getByText("Nguồn và chi tiết lần phân tích",{exact:true}).click();const download=page.waitForEvent("download");await page.getByRole("button",{name:"Tải JSON nguồn gốc",exact:true}).click();assert.deepEqual(await fs.readFile(await (await download).path()),Buffer.from(c.sourceBase64,"base64"));checks.push("06 authenticated source/report/handoff download bytes exact; safe UUID names");
 assert.match(await page.getByRole("region",{name:"Báo cáo bàn giao",exact:true}).innerText(),/Chưa thể chuyển sang tối ưu/);await page.getByText("Xem lý do và khả năng tương thích",{exact:true}).click();assert.match(await workspace().innerText(),/NOT_DIRECTLY_CONSUMABLE|BLOCKED/);assert(!requests.some(r=>/optimization|mobo/.test(r.path)));checks.push("07 diagnostic-only handoff reasons visible; zero optimizer requests");
 await home();await select(c);await analyze();assert.equal(new URL(page.url()).searchParams.get("fa_execution"),c.execution.id);checks.push("08 duplicate execution reuses committed UUID");
 {
  await home();await select(c);await workspace().getByText("Kết quả đã phân tích",{exact:true}).click();
  let seen;const requested=new Promise(r=>{seen=r});const promise=new Promise(r=>{release=r});hold={seen,promise};
  await page.getByRole("button",{name:"Phân tích",exact:true}).click();await requested;
  await page.getByRole("button",{name:/^Mở kết quả 1/}).click();await page.getByRole("button",{name:"Xem run 2499",exact:true}).click();await report().waitFor();
  release();await page.waitForTimeout(300);assert.equal(new URL(page.url()).searchParams.get("fa_report"),first.id);
  checks.push("08b late POST cannot clear a report explicitly opened while pending");
 }
 for(const name of ["partial","blocked"]){await home();await select(cases[name]);await analyze();const e=cases[name].execution;await workspace().getByText("Chi tiết số lượng",{exact:true}).click();assert.match(await workspace().innerText(),new RegExp(`Bị chặn ${e.blocked} · Lỗi ${e.failed} · Thiếu ${e.missing}`));assert.equal(await page.getByRole("button",{name:/^Xem run /}).count(),e.analyzed);assert.match(await workspace().innerText(),/Thiếu là một phần của Bị chặn/);assert.equal(await page.getByRole("button",{name:"Tải Handoff JSON",exact:true}).count(),0);await shot(name+"-desktop")}
 checks.push("09 real service PARTIAL/BLOCKED outputs from explicit input deletion; missing subset not double-counted");
 await home();await select(cases.standalone);await analyze();assert.equal(await page.getByRole("button",{name:/^Xem run /}).count(),1);checks.push("10 actual standalone execution supported");
 await home();await workspace().getByText("Chưa có nguồn? Tải JSON từ Module 2",{exact:true}).click();await page.getByLabel("Tệp JSON",{exact:true}).setInputFiles({name:"original.json",mimeType:"application/json",buffer:Buffer.from(uploadCase.sourceBase64,"base64")});await page.waitForFunction(id=>document.querySelector('select[aria-label="Nguồn JSON đã lưu"]').value===id,uploadCase.source.id);const upload=requests.findLast(r=>r.method==="POST"&&r.path.endsWith("/v3/sources"));assert.equal(upload.body,Buffer.from(uploadCase.sourceBase64,"base64").toString("utf8"));checks.push("11 upload original bytes, uses persisted returned source ID");
 for(const status of [400,403,404,409,413,422,429,500,503]){await home();await select(c);nextStatus=status;await page.getByRole("button",{name:"Phân tích",exact:true}).click();const alert=workspace().getByRole("alert");await alert.waitFor();await alert.getByText("Chi tiết lỗi",{exact:true}).click();assert.match(await alert.innerText(),new RegExp(`HTTP ${status}`));assert.equal(new URL(page.url()).searchParams.get("fa_execution"),null)}checks.push("12 distinct HTTP errors, no unsafe retries or success navigation");
 await home();await select(c);let seen;const requested=new Promise(r=>{seen=r});const promise=new Promise(r=>{release=r});hold={seen,promise};await page.getByRole("button",{name:"Phân tích",exact:true}).click();await requested;assert(await page.getByRole("button",{name:"Đang gửi yêu cầu…",exact:true}).isDisabled());await page.getByLabel("Project đang xem",{exact:true}).selectOption("2");await page.waitForURL(u=>u.pathname==="/");release();await page.waitForTimeout(500);assert.equal(new URL(page.url()).searchParams.get("fa_execution"),null);checks.push("13 real shared project switch while POST pending cannot navigate old result");
 await page.getByLabel("Project đang xem",{exact:true}).selectOption("1");await home();await select(c);await analyze();await page.getByRole("button",{name:"Xem run 2499",exact:true}).click();await report().waitFor();
 for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(width===375)await shot("result-mobile")}
 const details=report().getByText("Timeline và hành vi",{exact:true});await details.focus();await page.keyboard.press("Enter");assert(await details.evaluate(el=>el.parentElement.open));checks.push("14 320/375/768/1440 reflow; keyboard technical disclosure");
 await page.getByRole("button",{name:"← Chọn dữ liệu / kết quả đã lưu",exact:true}).click();await page.getByText("Nguồn JSON đã lưu / nhập nâng cao",{exact:true}).click();await page.getByLabel("Nguồn JSON đã lưu",{exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get("q"),"kept");assert(await page.getByRole("heading",{name:"Kết quả đã lưu (legacy)",exact:true}).isVisible());checks.push("15 return preserves legacy filters and legacy explorer");
 await select(c);nextStatus=401;await page.getByRole("button",{name:"Phân tích",exact:true}).click();await page.waitForFunction(()=>!localStorage.getItem("vehicsim_access_token"));assert.equal(new URL(page.url()).searchParams.get("fa_execution"),null);checks.push("16 actual shared transport 401 expires session, no success report");
 assert.deepEqual(errors,[]);assert(requests.filter(r=>r.path.includes("/analysis/v3/")).every(r=>r.project===1));
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",checks,screenshots,errors,liveBackendVerified:false,carlaRuntimeVerified:false,fixtureProvenance:"Actual service/core outputs with test memory storage; partial/blocked explicitly synthetic input deletion"},null,2));console.log("PASS FE-R4 17 browser acceptance groups; BROWSER_FIXTURE_ONLY");
} catch(error) {await page?.screenshot({path:path.join(output,"failure.png"),fullPage:true});await fs.writeFile(path.join(output,"failure.json"),JSON.stringify({error:String(error),requests,errors,text:await page?.locator("body").innerText()},null,2));throw error;} finally {release?.();await browser.close()}
