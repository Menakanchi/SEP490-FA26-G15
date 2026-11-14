/** Phase 04 Admin entry regression. Browser HTTP fixtures only; no live auth/backend/DB/Figma.
 * Kept at the previous dashboard harness path so existing QA commands remain valid.
 */
import { chromium } from "playwright";
import { browserOptions, captureScreenshot } from "./admin-test-utils.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const output=path.resolve(root,process.env.ADMIN_UI_OUTPUT||"data/admin-phase4-ui");
await fs.mkdir(output,{recursive:true});
const base=process.env.ADMIN_UI_URL||"http://localhost:3100";
const actor={id:999999,email:"admin-entry@example.invalid",full_name:"Admin Entry Fixture",role:"ADMIN",is_active:true};
const row={id:101,email:"entry-user@example.invalid",full_name:"Nguyễn Kiểm Thử",last_name:"Nguyễn",first_name:"Thử",role:"ENGINEER",is_active:true,created_date:"2026-11-07T08:00:00"};
const resources=["users","workspaces","tech-references"];
const viewports=[[1920,1080],[1366,768],[768,1024],[390,844]];
let role="ADMIN",mode="normal";
const reads=[],writes=[],unexpected=[],errors=[],pending=[],screenshots=[];
const browser=await chromium.launch(browserOptions());
try{
 const context=await browser.newContext({viewport:{width:1366,height:768}});
 await context.route("**/api/v1/**",async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname.replace("/api/v1","");
  const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body),headers:{"Access-Control-Allow-Origin":"*"}});
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}});
  if(p==="/auth/login")return reply({access_token:"admin-entry-fixture-only",token_type:"bearer",expires_in:3600,user:{...actor,role}});
  if(p==="/auth/me")return reply({...actor,role});
  if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
  if(p==="/vehicsim/projects")return reply({items:[],total:0,page:1,page_size:20,active_count:0,archived_count:0});
  if(p==="/vehicsim/context")return reply({project:{id:1,name:"Fixture"},workspace:null,vehicle:{id:1,name:"Fixture"},system:{id:1,baseline:null},versions:[],families:[],parameters:[],reviewer_projects:[],reviewer_can_decide:false});
  if(p.startsWith("/vehicsim/admin/")){
   if(req.method()!=="GET"){writes.push(p);return reply({detail:"No writes allowed in entry regression"},405);}
   const resource=p.slice("/vehicsim/admin/".length);
   if(!resources.includes(resource)){unexpected.push(p);return reply({detail:"Unexpected resource"},404);}
   const behavior=mode;
   reads.push({resource,query:Object.fromEntries(url.searchParams)});
   if(resource==="users"){
    if(behavior==="slow")await new Promise(resolve=>pending.push(resolve));
    if(behavior==="network")return route.abort("failed");
    if(behavior==="error")return reply({detail:"Fixture: nguồn tài khoản tạm thời không sẵn sàng"},503);
    if(behavior==="forbidden")return reply({detail:"Fixture: không được phép đọc tài khoản"},403);
    if(behavior==="expired")return reply({detail:"Fixture: hết phiên"},401);
    if(behavior==="malformed")return reply({items:[],total:null,page:1,page_size:20});
   }
   const items=resource==="users"&&behavior!=="empty"?[row]:[];
   return reply({items,total:items.length,page:1,page_size:Number(url.searchParams.get("page_size")||20)});
  }
  unexpected.push(p);return reply({detail:"Unhandled fixture "+p},404);
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);
 page.on("pageerror",error=>errors.push(error.message));
 const frame=page.locator("[data-admin-frame]");
 const nav=()=>page.getByRole("navigation",{name:"Quản trị hệ thống",exact:true}).filter({visible:true});
 const ready=async title=>{
  await frame.getByRole("heading",{level:1,name:title,exact:true}).waitFor();
  await frame.getByRole("table").waitFor();
  await page.waitForFunction(expected=>document.title===expected,title+" | Quản trị VehicSim");
 };
 const entry=async()=>{await page.goto(base+"/admin");await page.waitForURL(base+"/admin/users");};
 const shot=async name=>{await captureScreenshot(page,{path:path.join(output,name+".png"),fullPage:false},screenshots);};
 const release=()=>{assert(pending.length>0);pending.shift()();};
 // Exercise the real login form with an intercepted session, without auto-restoring expired tokens.
 await page.goto(base+"/login");
 await page.getByLabel("Email",{exact:true}).fill(actor.email);
 await page.getByLabel("Mật khẩu",{exact:true}).fill("Browser-fixture-only-12");
 await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();await ready("Tài khoản");
 const before=reads.length;await entry();await ready("Tài khoản");
 const initial=reads.slice(before);
 assert.equal(initial.length,1);assert.equal(initial[0].resource,"users");
 assert.equal(initial[0].query.page_size,"20");assert.equal(initial[0].query.page,"1");
 assert.equal(await frame.getByRole("heading",{level:1}).count(),1);
 assert.equal(await frame.getByRole("article").count(),0);
 assert.equal(await frame.getByText("Số liệu quản trị",{exact:true}).count(),0);
 assert.equal(await frame.getByText("Thiết lập workspace",{exact:true}).count(),0);
 for(const [width,height] of viewports){
  await page.setViewportSize({width,height});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width<1100){await page.locator("summary").focus();await page.keyboard.press("Enter");}
  assert.deepEqual(await nav().getByRole("link").evaluateAll(nodes=>nodes.map(n=>n.getAttribute("href"))),resources.map(r=>"/admin/"+r));
  assert.equal(await nav().locator('[aria-current="page"]').getAttribute("href"),"/admin/users");
  assert.equal(await page.getByRole("link",{name:/Tổng quan quản trị/}).count(),0);
  await shot("entry-"+width);
  if(width<1100){await page.keyboard.press("Escape");assert.equal(await page.locator("details").getAttribute("open"),null);}
 }
 await page.setViewportSize({width:1366,height:768});
 // Brand and breadcrumb use the same legacy entry URL; Back must return to the preceding workflow.
 await nav().getByRole("link",{name:/^Workspace/}).click();await ready("Workspace");
 await page.getByRole("complementary",{name:"Khu vực quản trị"}).getByRole("link",{name:/VehicSim/}).first().click();
 await page.waitForURL(base+"/admin/users");await ready("Tài khoản");
 await page.goBack();await ready("Workspace");
 await page.getByRole("navigation",{name:"Đường dẫn",exact:true}).getByRole("link",{name:"Quản trị hệ thống",exact:true}).click();
 await page.waitForURL(base+"/admin/users");await ready("Tài khoản");
 await frame.getByRole("link",{name:"Đến nội dung quản trị",exact:true}).focus();await page.keyboard.press("Enter");
 assert(await page.locator("#admin-content").evaluate(el=>el===document.activeElement));
 await nav().getByRole("link",{name:/^Tài liệu kỹ thuật/}).click();await ready("Tài liệu kỹ thuật");
 await page.goBack();await ready("Tài khoản");
 await page.reload();await ready("Tài khoản");
 await frame.getByRole("button",{name:"Thêm mới",exact:true}).click();
 await page.getByRole("dialog",{name:"Thêm mới · Tài khoản",exact:true}).waitFor();
 await page.keyboard.press("Escape");
 // Loading/empty/error/permission states belong to the primary workflow, not hidden KPI requests.
 mode="slow";await entry();await frame.getByRole("status").filter({hasText:"Đang tải dữ liệu"}).waitFor();
 await shot("entry-loading");release();await ready("Tài khoản");
 mode="empty";await entry();await frame.getByText("Chưa có tài khoản",{exact:true}).waitFor();await shot("entry-empty");
 for(const state of ["error","forbidden","network","malformed"]){
  mode=state;await entry();await frame.getByRole("alert").first().waitFor();await shot("entry-"+state);
  assert(await frame.getByRole("link",{name:"Hồ sơ / Mật khẩu",exact:true}).isVisible());
  mode="normal";await frame.getByRole("button",{name:"Thử lại",exact:true}).click();await ready("Tài khoản");
 }
 // A delayed users response cannot replace a different resource after navigation.
 mode="slow";await entry();await frame.getByRole("status").filter({hasText:"Đang tải dữ liệu"}).waitFor();
 await nav().getByRole("link",{name:/^Workspace/}).click();await ready("Workspace");
 const late=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/admin/users"));release();await late;
 assert.equal(await frame.getByRole("heading",{level:1}).innerText(),"Workspace");
 mode="normal";
 for(const otherRole of ["MANAGER","ENGINEER","REVIEWER","EXPERIENCER"]){
  role=otherRole;const count=reads.length;await page.goto(base+"/admin");
  // AuthGate may suppress the streamed redirect child for a denied role.
  await page.getByRole("heading",{name:"Trang này yêu cầu quyền truy cập",exact:true}).waitFor();
  assert.equal(await frame.count(),0);assert.equal(reads.length,count);
 }
 role="ADMIN";mode="expired";await page.goto(base+"/admin");await page.waitForURL(base+"/login");
 assert.equal(await page.evaluate(()=>localStorage.getItem("vehicsim_access_token")),null);
 const count=reads.length;mode="normal";await page.goto(base+"/admin");await page.waitForURL(base+"/login");assert.equal(reads.length,count);
 assert(reads.every(read=>read.query.page_size!=="1"),"No obsolete aggregate requests");
 assert.deepEqual(writes,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",viewports,screenshots,checks:["login and legacy /admin route lead to users; no KPI or count requests","three resource navigation; brand/breadcrumb/client redirect/Back/reload/skip focus","primary workflow loading/empty/503/403/network/malformed/retry","late users response isolation; four roles denied before data reads; 401 and guest","no API mutations"],liveBackendVerified:false,figmaVerified:false},null,2));
 console.log("PASS Admin entry Phase 04: "+screenshots.length+" screenshots; browser HTTP fixtures only. Live backend/auth/DB/Figma NOT verified.");
}finally{for(const resolve of pending)resolve();await browser.close();}
