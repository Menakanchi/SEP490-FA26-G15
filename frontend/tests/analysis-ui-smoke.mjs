/**
 * Real integration UI smoke against backend :8101 and the isolated test database.
 * First run scripts/test_analysis_integration.py and start Next :3100 with API :8101.
 * Install Playwright temporarily: npm install --no-save --package-lock=false playwright
 * Uses only the test-domain account created by that script. No API routes are mocked.
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const evidence=JSON.parse(await fs.readFile(path.join(root,"data/analysis-integration/evidence.json"),"utf8"));
const output=path.join(root,"data/analysis-integration/ui");
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1080}});
 page.setDefaultNavigationTimeout(120000);
 page.setDefaultTimeout(120000);
 const errors=[], unauthorizedWrites=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("request",request=>{
   if(request.method()==="POST" && /\/(aeb\/versions|optimization)/.test(new URL(request.url()).pathname))
     unauthorizedWrites.push(request.url());
 });
 const base="http://localhost:3100";
 await page.goto(base+"/login");
 // In dev the server HTML may precede hydration; wait for React's form handler before submitting.
 await page.waitForFunction(()=>{
   const form=document.querySelector("form");
   return form && Object.keys(form).some(key=>key.startsWith("__reactProps")&&typeof form[key]?.onSubmit==="function");
 });
 await page.locator('input[type="email"]').fill("analysis-integration@example.invalid");
 await page.locator('input[type="password"]').fill("Analysis-test-only-2026!");
 await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();
 await page.waitForURL(base+"/");
 await page.goto(base+"/scenarios");
 await page.locator(`a[href="/analysis/failures?scenario_id=${evidence.scenario_id}"]`).click();
 await page.waitForURL("**/analysis/failures?scenario_id="+evidence.scenario_id);
 await page.getByRole("heading",{name:"Phân tích baseline",exact:true}).waitFor();

 // The moved legacy lookup must retain the family selected on the baseline screen.
 const legacyResponse=page.waitForResponse(r=>r.url().includes("/api/v1/vehicsim/failures?")&&r.status()===200);
 await page.getByRole("button",{name:"Tra cứu ca lỗi",exact:true}).click();
 assert.equal(new URL((await legacyResponse).url()).searchParams.get("scenario_id"),String(evidence.scenario_id));
 await page.getByRole("heading",{name:"Tra cứu ca lỗi",exact:true}).waitFor();
 await page.getByRole("button",{name:"Kết quả baseline",exact:true}).click();
 await page.getByLabel("Trạng thái",{exact:true}).selectOption("FAILED");
 await page.getByText("Chưa có run baseline phù hợp.",{exact:false}).waitFor();
 await page.getByLabel("Trạng thái",{exact:true}).selectOption("");
 await page.getByRole("table").locator("tbody tr").first().waitFor();
 await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).waitFor();
 await page.screenshot({path:path.join(output,"01-baseline-dashboard.png"),fullPage:true});

 // Gather selections across pages; choices must survive pagination.
 const selections=[
   ...evidence.selection.optimization_run_ids.map(id=>({id,role:"OPTIMIZATION"})),
   ...evidence.selection.validation_run_ids.map(id=>({id,role:"VALIDATION"})),
 ];
 for(const selection of selections) {
   let found=false;
   for(let attempt=0;attempt<4;attempt++){
     const field=page.getByLabel(`Tập của run ${selection.id}`,{exact:true});
     if(await field.count()){await field.selectOption(selection.role);found=true;break;}
     const next=page.getByRole("button",{name:"Trang sau",exact:true});
     if(await next.isDisabled()){
       await page.getByRole("button",{name:"Trang trước",exact:true}).click();
     }else await next.click();
     await page.waitForResponse(r=>r.url().includes("/api/v1/vehicsim/analysis/runs?")&&r.status()===200);
   }
   assert(found,`Run ${selection.id} was not available in the paginated dashboard`);
 }
 const response=page.waitForResponse(r=>r.url().endsWith("/api/v1/vehicsim/analysis/selections")&&r.request().method()==="POST");
 await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).click();
 const saved=await (await response).json();
 assert(saved.id>0,saved.detail);
 await page.getByRole("heading",{name:new RegExp(`Tập đã chốt #${saved.id}`)}).waitFor();
 await page.getByRole("button",{name:"Tiếp tục: Tối ưu AEB →",exact:true}).click();
 await page.waitForURL("**/aeb?dataset_id="+saved.id);
 await page.getByRole("heading",{name:new RegExp(`Tập đã chốt #${saved.id}`)}).waitFor();
 assert.deepEqual([...saved.optimization_run_ids].sort((a,b)=>a-b),[...evidence.selection.optimization_run_ids].sort((a,b)=>a-b));
 assert.deepEqual([...saved.validation_run_ids].sort((a,b)=>a-b),[...evidence.selection.validation_run_ids].sort((a,b)=>a-b));
 await page.screenshot({path:path.join(output,"02-aeb-handoff.png"),fullPage:true});
 const runId=evidence.run_ids[0];
 await page.goto(base+`/analysis/failures/${runId}?t=1.25`);
 const slider=page.getByRole("slider",{name:"Thời gian phân tích",exact:true});
 await slider.waitFor();
 assert.equal(Number(await slider.inputValue()),1.25);
 await page.getByLabel("Tín hiệu",{exact:true}).selectOption("jerk_mps3");
 await page.getByRole("img",{name:/Jerk từ gia tốc đã lưu/}).waitFor();
 await page.getByRole("heading",{name:"Bằng chứng và giới hạn nhận định",exact:true}).waitFor();
 await page.getByRole("button",{name:"Tải .xosc",exact:true}).waitFor();
 await page.getByRole("button",{name:"Chạy trên CARLA",exact:true}).waitFor();
 await page.screenshot({path:path.join(output,"03-detail-jerk-evidence.png"),fullPage:true});
 await page.getByRole("link",{name:"Mở playback tại thời điểm đang xem",exact:true}).click();
 await page.waitForURL("**/playback?t=1.25");
 const playback=page.getByRole("slider",{name:"Thời gian playback",exact:true});
 await playback.waitFor();
 assert.equal(Number(await playback.inputValue()),1.25);
 await page.getByRole("button",{name:"Phát",exact:true}).click();
 await page.waitForFunction(()=>Number(document.querySelector('input[aria-label="Thời gian playback"]')?.value)>1.3);
 await page.getByRole("button",{name:"Tạm dừng",exact:true}).click();
 await playback.focus();
 await playback.press("Home");
 assert.equal(Number(await playback.inputValue()),0);
 await playback.press("ArrowRight");
 assert(Number(await playback.inputValue())>0);
 await page.screenshot({path:path.join(output,"04-playback-synchronized.png"),fullPage:true});
 // A direct playback link without ?t retains trungdam's AEB-event/end focus.
 const playbackResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/vehicsim/runs/"+runId+"/playback")&&r.status()===200);
 await page.goto(base+`/analysis/failures/${runId}/playback`);
 const recordedPlayback=await (await playbackResponse).json();
 await page.getByRole("slider",{name:"Thời gian playback",exact:true}).waitFor();
 const expectedFocus=recordedPlayback.events.find(event=>event.kind==="aeb_decision")?.t??recordedPlayback.duration_s;
 assert(Math.abs(Number(await page.getByRole("slider",{name:"Thời gian playback",exact:true}).inputValue())-expectedFocus)<=0.011);
 assert.deepEqual(errors,[]);
 assert.deepEqual(unauthorizedWrites,[]);
 console.log("PASS: real login, scoped legacy lookup, filtered baseline KPI, paginated split selection, AEB ID handoff, jerk/evidence, CARLA actions, seek/play/pause, upstream default focus and shared time cursor.");
 console.log("Screenshots:",output);
} finally {await browser.close();}
