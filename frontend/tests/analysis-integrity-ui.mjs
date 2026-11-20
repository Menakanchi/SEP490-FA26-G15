/** Real Java service golden over HTTP fixtures; defensive identity/metadata probes are explicitly not valid simulator results. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {gunzipSync} from "node:zlib";
import {chromium} from "playwright";
import {repoRoot,prepareAnalysisArtifacts} from "./helpers/analysis-artifacts.mjs";

const probe=process.argv.find(arg=>arg.startsWith("--probe="))?.split("=")[1];
const output=await prepareAnalysisArtifacts(path.join(repoRoot,"data/analysis-phase19-2026-11-17",probe?"probe-"+probe:"integrity"));
const base=process.env.ANALYSIS_UI_URL||"http://127.0.0.1:3131";
const contract=JSON.parse(gunzipSync(await fs.readFile(path.join(repoRoot,"src/test/resources/analysis/analysis-api-contract.json.gz"))));
assert.equal(contract.kind,"OFFLINE_KINEMATIC_SERVICE_CONTRACT");
const cases=new Map(contract.cases.map(c=>[c.id,c]));
const actor={id:999919,email:"analysis-qa@example.invalid",full_name:"Analysis QA fixture",role:"ENGINEER"};
const errors=[],unexpected=[],writes=[],screenshots=[],checks=[];
let mode="normal",hold=null,releaseHold=null;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
try {
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(()=>{
    window.__analysisDocument=crypto.randomUUID();window.__analysisDecoded=[];
    const original=window.fetch.bind(window);
    window.fetch=async (...args)=>{
      const response=await original(...args), url=new URL(response.url);
      if (/\/api\/v1\/vehicsim\/(analysis\/runs\/\d+|runs\/\d+\/playback)$/.test(url.pathname)) {
        const json=response.json.bind(response);
        response.json=async()=>{const body=await json();window.__analysisDecoded.push(url.pathname);return body;};
      }
      return response;
    };
  });
  await context.route("**/api/v1/**",async route=>{
    const req=route.request(),p=new URL(req.url()).pathname.replace("/api/v1","");
    const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
    if(req.method()==="OPTIONS") return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}});
    if(p==="/auth/login") return reply({access_token:"analysis-qa-fixture-only",token_type:"bearer",expires_in:3600,user:actor});
    if(req.method()!=="GET"){writes.push(p);return reply({detail:"Fixture forbids business writes"},405);}
    if(p==="/auth/me") return reply(actor);
    if(p==="/vehicsim/context") return reply({project:{id:actor.id,name:"Analysis contract QA"},workspace:{id:1,name:"QA fixture"},vehicle:{id:2,name:"Contract vehicle"},
      system:{id:1,name:"AEB",baseline:{id:7,label:"Contract v7"}},versions:[{id:7,label:"Contract v7",status:"BASELINE"}],
      families:[{id:42,code:"CP_CROSSING",name:"Contract CP_CROSSING"}],parameters:[],reviewer_projects:[]});
    if(p==="/vehicsim/notifications") return reply({items:[],unread_count:0});
    if(p==="/vehicsim/regression") return reply({items:[],kpis:{total:0,passed:0,failed:0,running:0}});
    if(p==="/vehicsim/families" || p==="/vehicsim/recommendations") return reply([]);
    if(p==="/vehicsim/projects") return reply({items:[],total:0,page:1,page_size:20,active_count:0,archived_count:0});
    const match=p.match(/^\/vehicsim\/(?:analysis\/runs\/(\d+)|runs\/(\d+)\/playback)$/);
    if(match) {
      const id=Number(match[1]||match[2]),playback=!!match[2],item=cases.get(id);
      if(!item){unexpected.push(p);return reply({detail:"Unconfigured run"},404);}
      if(mode==="network") return route.abort("failed");
      if(mode==="error") return reply({detail:"Fixture Analysis service failed"},500);
      if(mode==="malformed") return reply(null);
      let body=structuredClone(playback?item.playback:item.inspection);
      // A mismatched cached payload and incomplete evaluation metadata are defensive HTTP responses, never simulation claims.
      if(mode==="mismatch" && playback) body=structuredClone(cases.get(103).playback);
      if(mode==="validity" && playback) {delete body.evaluation_valid;body.outcome="SAFE";body.verdict="PASS";body.failure_type=null;body.failure_class=null;}
      if(playback) body.related_runs=[{run_id:id===101?104:101,config:id===101?"Contract v8":"Contract v7",purpose:"BASELINE",outcome:cases.get(id===101?104:101).playback.outcome}];
      else body.detail.similar=[{run_id:id===101?104:101,variant:cases.get(id===101?104:101).inspection.detail.variant,summary:"Same scenario/seed/vehicle; different AEB version",similarity_pct:100}];
      if(hold===p) {hold=null;await new Promise(resolve=>{releaseHold=resolve;});}
      await reply(body);
      return;
    }
    unexpected.push(p);return reply({detail:"Unexpected fixture endpoint: "+p},500);
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base+"/login");await page.getByLabel("Email",{exact:true}).fill(actor.email);
  await page.getByLabel("Mật khẩu",{exact:true}).fill("Fixture-only-phase19");
  await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();await page.waitForURL(u=>u.pathname!=="/login");
  const returnTo="/analysis/failures?view=runs&scenario_id=42&page=2";
  const query="?t=0.5&signal=jerk_mps3&returnTo="+encodeURIComponent(returnTo);
  const detailUrl=id=>base+"/analysis/failures/"+id+query;
  const pbUrl=id=>base+"/analysis/failures/"+id+"/playback"+query;
  const source=page.getByRole("region",{name:"Nguồn dữ liệu playback",exact:true});
  const identity=page.getByRole("region",{name:"Danh tính và nguồn dữ liệu run",exact:true});
  const expectedError="Dữ liệu trả về không khớp lượt chạy đang mở.";
  const shot=async name=>{await page.screenshot({path:path.join(output,name+".png"),fullPage:true});screenshots.push(name+".png");};
  const untilSettled=()=>page.waitForFunction(text=>document.body.innerText.includes(text)||document.querySelector('[aria-label="Nguồn dữ liệu playback"]'),expectedError);
  if(!probe || probe==="mismatch") {
    mode="mismatch";await page.goto(pbUrl(101));await untilSettled();
    if(probe) await shot("wrong-response-id");
    assert.equal(await page.getByText(expectedError,{exact:true}).count(),1,"Playback must reject another run's API payload before rendering frames");
    assert.equal(await source.count(),0);checks.push("wrong playback run ID rejected");
  }
  if(!probe || probe==="validity") {
    mode="validity";await page.goto(pbUrl(101));await source.waitFor();
    if(probe) await shot("missing-validity");
    assert.equal(await page.getByText("An toàn",{exact:true}).count(),0,"Missing evaluation validity cannot publish SAFE as a verified result");
    await page.getByRole("button",{name:"Phát",exact:true}).waitFor();checks.push("unverified metadata keeps playback, without verdict badge");
  }
  if(!probe) {
    mode="normal";
    // The actual Java payload is exercised at five widths. Metrics/source assertions accompany layout checks.
    for(const width of [375,390,768,1024,1440]) {
      await page.setViewportSize({width,height:900});await page.goto(detailUrl(101));await identity.waitFor();
      assert.match(await identity.innerText(),/#101 \/ #42 \/ #301/);
      const impact=page.getByLabel("Tốc độ va chạm",{exact:true});
      assert.match(await impact.innerText(),new RegExp(cases.get(101).inspection.detail.metrics.impact_speed_mps.toFixed(3).replace(".","\\.")+" m/s"));
      const tab=page.getByRole("tab",{name:"Nguyên nhân & bằng chứng",exact:true});await tab.click();await tab.focus();await page.keyboard.press("Home");await page.keyboard.press("End");
      assert.equal(await page.locator('[data-evidence-run="101"]').count(),1);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Evidence overflow "+width);
    }
    checks.push("Java service contract rendered at five viewports with keyboard and exact SI value");
    // Client transitions retain this document. A delayed old response is decoded after the new run already rendered.
    const stale=async playback=>{
      await page.goto(playback?pbUrl(101):detailUrl(101));await (playback?source:identity).waitFor();
      const documentId=await page.evaluate(()=>window.__analysisDocument);
      const pendingPath=playback?"/vehicsim/runs/104/playback":"/vehicsim/analysis/runs/104";
      hold=pendingPath;releaseHold=null;
      const pendingRequest=page.waitForRequest(r=>new URL(r.url()).pathname==="/api/v1"+pendingPath);
      if(playback) await page.getByRole("link",{name:"Mở run liên quan · AEB Contract v8",exact:true}).click();
      else await page.getByRole("region",{name:"Ca lỗi tương tự",exact:true}).getByRole("link").first().click();
      await pendingRequest;await page.waitForURL(u=>u.pathname.includes("/104"));
      assert.equal(await (playback?source:identity).count(),0,"Previous run facts hidden during client transition");
      const backRequest=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/v1"+(playback?"/vehicsim/runs/101/playback":"/vehicsim/analysis/runs/101"));
      await page.goBack();await backRequest;await (playback?source:identity).waitFor();
      assert.equal(await page.evaluate(()=>window.__analysisDocument),documentId,"A document reload cannot prove effect cleanup");
      const oldDecoded=page.waitForFunction(p=>window.__analysisDecoded.includes("/api/v1"+p),pendingPath);
      assert(releaseHold);releaseHold();releaseHold=null;await oldDecoded;
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(new URL(page.url()).pathname,"/analysis/failures/101"+(playback?"/playback":""));
      assert.equal(await page.evaluate(()=>window.__analysisDocument),documentId);
      assert.match(await (playback?source:identity).innerText(),playback?/Contract v7/:/#101 \/ #42 \/ #301/);
      if(playback) {
        assert.equal(await source.locator("dd").nth(1).innerText(),"Contract v7");
        assert.match(await source.locator("dd").first().innerText(),/seed 3/);
      }
      checks.push((playback?"Playback":"Detail")+" stale response decoded after new response in same document; ignored");
    };
    await stale(false);await stale(true);
    for(const scenario of ["error","network","malformed"]) {
      mode=scenario;await page.goto(pbUrl(101));await page.getByRole("button",{name:"Thử tải lại",exact:true}).waitFor();
      assert.equal(await source.count(),0,"API failure is not an empty/SAFE frame source");
      mode="normal";await page.getByRole("button",{name:"Thử tải lại",exact:true}).click();await source.waitFor();
      checks.push(scenario+" error and recovery");
    }
    await shot("validated-playback-source");
    assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",checks,screenshots,errors,unexpected,writes,liveBackendVerified:false,carlaRuntimeVerified:false},null,2));
    console.log("PASS: Java contract browser mapping, defensive ID/validity, real client stale responses, API failures/recovery, five viewports");
  }
} finally {
  if(releaseHold) releaseHold();
  await browser.close();
}
