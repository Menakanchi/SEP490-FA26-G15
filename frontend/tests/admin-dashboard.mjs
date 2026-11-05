/** Batch 2 dashboard checks. All API traffic is intercepted: no live backend/auth/DB/Figma. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const output=path.join(root,"data/admin-batch2-ui");await fs.mkdir(output,{recursive:true});
const base=process.env.ADMIN_UI_URL||"http://localhost:3100";
const resources=["users","workspaces","tech-references"];
const titles={users:"Tài khoản",workspaces:"Workspace","tech-references":"Tài liệu kỹ thuật"};
const labels={users:"Tổng số tài khoản",workspaces:"Tổng số workspace","tech-references":"Tổng số tài liệu kỹ thuật"};
const actor={id:999999,email:"admin-dashboard@example.invalid",full_name:"Admin Dashboard Fixture",role:"ADMIN"};
const viewports=[[1920,1080],[1366,768],[768,1024],[390,844]];
let role="ADMIN",modes={},totals={users:1234,workspaces:27,"tech-references":9};
const reads=[],writes=[],unexpected=[],errors=[],pending=[],screenshots=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
try{
  const context=await browser.newContext({viewport:{width:1366,height:768}});
  await context.addInitScript(()=>{
    if (!sessionStorage.getItem("admin-dashboard-fixture-guest")) localStorage.setItem("vehicsim_access_token","dashboard-browser-fixture-token");
  });
  await context.route("**/api/v1/**",async route=>{
    const req=route.request(),url=new URL(req.url()),p=url.pathname.replace("/api/v1","");
    const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body),headers:{"Access-Control-Allow-Origin":"*"}});
    if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"GET,OPTIONS"}});
    if(req.method()!=="GET"){writes.push(p);return reply({detail:"Writes forbidden by dashboard fixture"},405);}
    if(p==="/auth/me")return reply({...actor,role});
    if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
    if(p==="/vehicsim/context")return reply({project:{id:1,name:"Fixture"},workspace:null,vehicle:{id:1,name:"Fixture vehicle"},system:{id:1,baseline:null},versions:[],families:[],parameters:[]});
    const match=p.match(/^\/vehicsim\/admin\/(users|workspaces|tech-references)$/);
    if(match){
      const resource=match[1],isCount=url.searchParams.get("page_size")==="1";
      reads.push({resource,isCount,query:Object.fromEntries(url.searchParams)});
      if(!isCount)return reply({items:[],total:0,page:1,page_size:20});
      const mode=modes[resource],total=totals[resource];
      if(mode==="slow")await new Promise(resolve=>pending.push({resource,resolve}));
      if(mode==="network")return route.abort("failed");
      if(mode==="error")return reply({detail:"Fixture: nguồn dữ liệu tạm thời không sẵn sàng"},503);
      if(mode==="forbidden")return reply({detail:"Fixture: không được phép đọc danh mục"},403);
      if(mode==="expired")return reply({detail:"Fixture: hết phiên"},401);
      // A one-row response with a much larger total catches counting items.length on the client.
      return reply({items:total===0?[]:[{id:771,email:"must-not-render@example.invalid",ref_name:"MUST_NOT_RENDER_ROW"}],total,page:1,page_size:1});
    }
    unexpected.push(p);return reply({detail:`Unhandled fixture ${p}`},404);
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on("pageerror",error=>errors.push(error.message));
  const frame=page.locator("[data-admin-frame]");
  const article=resource=>frame.getByRole("article",{name:titles[resource],exact:true});
  const value=resource=>frame.getByLabel(labels[resource],{exact:true});
  const settle=()=>frame.getByRole("button",{name:"Làm mới số liệu",exact:true}).waitFor();
  const ready=async()=>{
    await frame.getByRole("heading",{level:1,name:"Tổng quan quản trị",exact:true}).waitFor();
    await settle();
  };
  const refresh=async()=>{await frame.getByRole("button",{name:"Làm mới số liệu",exact:true}).click();await settle();};
  const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const shot=async name=>{await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true});screenshots.push(`${name}.png`);};
  const release=resource=>{const item=pending.find(item=>item.resource===resource);assert.ok(item,`${resource} has a delayed response`);pending.splice(pending.indexOf(item),1);item.resolve();};

  await page.goto(base+"/admin");await ready();
  await page.waitForFunction(()=>document.title==="Tổng quan quản trị | Quản trị VehicSim");
  assert.equal(await frame.getByRole("heading",{level:1}).count(),1);
  assert.equal(await frame.getByRole("article").count(),3);
  for(const resource of resources)assert.equal(await value(resource).innerText(),totals[resource].toLocaleString("vi-VN"));
  assert.equal(reads.length,3);
  for(const read of reads)assert.deepEqual(read.query,{page:"1",page_size:"1",sort:"newest"});
  assert.equal((await frame.innerText()).includes("must-not-render@example.invalid"),false);
  assert.equal((await frame.innerText()).includes("MUST_NOT_RENDER_ROW"),false);
  assert.equal(await frame.getByRole("alert").count(),0);
  for(const [width,height] of viewports){
    await page.setViewportSize({width,height});await noOverflow();await shot(`overview-${width}`);
    if(width<1100){
      const summary=page.locator("summary");await summary.focus();await page.keyboard.press("Enter");
      const nav=page.getByRole("navigation",{name:"Quản trị hệ thống",exact:true}).filter({visible:true});
      assert.equal(await nav.locator('[aria-current="page"]').getAttribute("href"),"/admin");
      await nav.getByRole("link").first().focus();await page.keyboard.press("Escape");
      assert.equal(await summary.evaluate(el=>el===document.activeElement),true);
    }
  }
  await frame.getByRole("link",{name:"Đến nội dung quản trị",exact:true}).focus();await page.keyboard.press("Enter");
  assert.equal(await page.locator("#admin-content").evaluate(el=>el===document.activeElement),true);
  assert.equal(new URL(page.url()).hash,"","Skip focus does not add a history entry");

  // Shortcuts open existing lists. Browser Back remounts counts; no hidden create/edit action fires.
  for(const resource of resources){
    await article(resource).getByRole("link",{name:new RegExp(`^Quản lý ${resource==="users"?"tài khoản":resource==="workspaces"?"workspace":"tài liệu kỹ thuật"}$`)}).click();
    await frame.getByRole("table").waitFor();assert.equal(new URL(page.url()).pathname,`/admin/${resource}`);
    await page.goBack();await ready();
    assert.equal(await value(resource).innerText(),totals[resource].toLocaleString("vi-VN"));
  }
  assert.equal(await frame.getByRole("link",{name:"Mở danh sách tài khoản",exact:true}).getAttribute("href"),"/admin/users");
  assert.equal(await frame.getByRole("link",{name:"Mở danh sách workspace",exact:true}).getAttribute("href"),"/admin/workspaces");

  // A slow source does not block the other cards. Loading has no stale totals or false zeroes.
  modes={users:"slow"};const start=reads.length;
  await frame.getByRole("button",{name:"Làm mới số liệu",exact:true}).click();
  await article("users").getByText("Đang tải…",{exact:true}).waitFor();
  await value("workspaces").filter({hasText:"27"}).waitFor();
  assert.equal(await value("users").innerText(),"—");
  assert.equal(await frame.getByRole("button",{name:"Đang tải số liệu…",exact:true}).isDisabled(),true);
  assert.equal(reads.length-start,3);
  await shot("partial-loading-390");release("users");await settle();
  modes={users:"error"};await refresh();
  assert.equal(await value("users").innerText(),"—");
  assert.equal(await value("workspaces").innerText(),"27");
  await article("users").getByRole("alert").filter({hasText:"Fixture:"}).waitFor();
  assert.equal(await frame.getByRole("alert").count(),1);await shot("partial-error-390");
  // Error cards still lead to the working list, independent of the count failure.
  await article("users").getByRole("link",{name:"Quản lý tài khoản",exact:true}).click();await frame.getByRole("table").waitFor();
  await page.goBack();await ready();
  modes={};totals.users=2345;await refresh();assert.equal(await value("users").innerText(),"2.345");
  assert.equal(await frame.getByRole("alert").count(),0);

  modes=Object.fromEntries(resources.map(resource=>[resource,"error"]));await refresh();
  assert.equal(await frame.getByRole("alert").count(),3);
  for(const resource of resources)assert.equal(await value(resource).innerText(),"—");
  await shot("all-errors-390");
  modes={workspaces:"forbidden","tech-references":"network"};await refresh();
  assert.equal(await value("users").innerText(),"2.345");
  assert.equal(await frame.getByRole("alert").count(),2);
  assert.equal(new URL(page.url()).pathname,"/admin");

  // True zero is data, not an error; invalid/missing/fractional/unsafe totals must never become zero.
  modes={};totals={users:0,workspaces:0,"tech-references":0};await refresh();
  for(const resource of resources){assert.equal(await value(resource).innerText(),"0");assert.equal(await article(resource).getByRole("alert").count(),0);}
  await frame.getByText("Chưa có workspace. Mở danh sách để tạo workspace đầu tiên.",{exact:true}).waitFor();
  await page.setViewportSize({width:1366,height:768});await shot("empty-1366");
  for(const invalid of [null,"13",-1,2.5,Number.MAX_SAFE_INTEGER+1,undefined]){
    totals={users:invalid,workspaces:7,"tech-references":5};await refresh();
    await article("users").getByRole("alert").filter({hasText:"Số lượng trả về không hợp lệ"}).waitFor();
    assert.equal(await value("users").innerText(),"—");assert.equal(await value("workspaces").innerText(),"7");
  }
  totals={users:Number.MAX_SAFE_INTEGER,workspaces:2048,"tech-references":119};await refresh();
  for(const [width,height] of viewports){await page.setViewportSize({width,height});await noOverflow();}
  assert.equal(await value("users").innerText(),Number.MAX_SAFE_INTEGER.toLocaleString("vi-VN"));
  await shot("large-count-390");

  // Delayed responses from an unmounted dashboard cannot render on another page.
  modes={users:"slow"};await frame.getByRole("button",{name:"Làm mới số liệu",exact:true}).click();
  await article("users").getByText("Đang tải…",{exact:true}).waitFor();
  await article("workspaces").getByRole("link",{name:"Quản lý workspace",exact:true}).click();await frame.getByRole("table").waitFor();
  const late=page.waitForResponse(response=>response.url().includes("/admin/users?")&&new URL(response.url()).searchParams.get("page_size")==="1");
  release("users");await late;
  assert.equal(await frame.getByRole("article").count(),0);
  modes={};totals={users:88,workspaces:6,"tech-references":4};await page.goBack();await ready();
  assert.equal(await value("users").innerText(),"88");

  // Reload works with no session cache, and role gates run before count fetches.
  await page.reload();await ready();assert.equal(await value("users").innerText(),"88");
  await page.setViewportSize({width:1366,height:768});
  for(const nextRole of ["MANAGER","ENGINEER","REVIEWER","EXPERIENCER"]){
    role=nextRole;const before=reads.length;await page.goto(base+"/admin");
    await page.getByRole("heading",{name:"Quyền Hạn Không Đủ",exact:true}).waitFor();
    assert.equal(reads.length,before);assert.equal(await frame.count(),0);
    assert.equal(await page.getByRole("complementary",{name:"Khu vực quản trị"}).count(),0);
  }
  await page.evaluate(()=>sessionStorage.setItem("admin-dashboard-fixture-guest","1"));
  role="ADMIN";modes={users:"expired"};await page.goto(base+"/admin");await page.waitForURL(base+"/login");
  assert.equal(await page.evaluate(()=>localStorage.getItem("vehicsim_access_token")),null);
  const before=reads.length;await page.goto(base+"/admin");await page.waitForURL(base+"/login");assert.equal(reads.length,before);
  assert.deepEqual(writes,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",viewports,screenshots,checks:["three server totals with page_size=1, not page length; no record fields shown","overview metadata/navigation/shortcuts/back/reload","keyboard menu/Escape/skip focus","responsive and large count bounds","independent loading/partial/503/all-error/403/network/retry; stale totals hidden","true zero and malformed/unsafe totals","late unmount response isolation","four roles denied before fetch; 401 session expiry and guest redirect","no API writes or unexpected requests"],liveBackendVerified:false,figmaVerified:false},null,2));
  console.log(`PASS Admin dashboard: ${screenshots.length} screenshots; browser HTTP fixtures only. Live backend/auth/DB/Figma NOT verified.`);
}finally{for(const item of pending)item.resolve();await browser.close();}
