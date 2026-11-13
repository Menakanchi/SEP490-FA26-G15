/** Phase 4 user search: actual browser with HTTP fixtures; no live backend/auth/DB/Figma. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const output=path.resolve(root,process.env.ADMIN_UI_OUTPUT||"data/admin-user-search-ui");await fs.mkdir(output,{recursive:true});
const base=process.env.ADMIN_UI_URL||"http://localhost:3100";
const roles=["ADMIN","MANAGER","ENGINEER","REVIEWER","EXPERIENCER"];
const incompleteUsers=[
  {id:901,full_name:null,email:null,role:null,is_active:null},
  {id:902,full_name:"   ",email:"  ",role:null,is_active:null},
  {id:903,full_name:" ",email:"fallback@example.invalid",role:"ENGINEER",is_active:1},
];
const actor={id:999999,email:"self-admin@example.invalid",full_name:"Admin Fixture",role:"ADMIN"};
const users=Array.from({length:61},(_,i)=>({id:i===0?actor.id:i===3?888888:100+i,email:i===0?actor.email:`fixture-${String(i).padStart(3,"0")}@example.invalid`,last_name:"Nguyễn",middle_name:"Fixture",first_name:String(i),full_name:i===0?actor.full_name:i===3?"Nguyễn Fixture với họ tên rất dài để kiểm tra bảng tài khoản trên màn hình nhỏ":`Nguyễn Fixture ${i}`,role:roles[i%5],is_active:i===0||i%3!==0,created_date:i===60?null:"2026-11-04T08:30:00"}));
users[3].email="very-long-email-for-responsive-table-and-row-action-identification@example.invalid";
users[3].full_name+=" "+"X".repeat(120);
let role="ADMIN",mode="normal",detailMode="normal",saveMode="reject",delaySearch=null;
const requests=[],writes=[],errors=[],unexpected=[],pending=[],screenshots=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
try{
  const context=await browser.newContext({viewport:{width:1366,height:768}});
  await context.route("**/api/v1/**",async route=>{
    const req=route.request(),url=new URL(req.url()),p=url.pathname.replace("/api/v1","");
    const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body),headers:{"Access-Control-Allow-Origin":"*"}});
    if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"GET,POST,PUT,OPTIONS"}});
    requests.push({path:p,method:req.method(),query:Object.fromEntries(url.searchParams)});
    if(p==="/auth/login")return reply({access_token:"users-table-fixture-only",token_type:"bearer",expires_in:3600,user:{...actor,role}});
    if(p==="/auth/me")return reply({...actor,role});
    if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
    if(p==="/vehicsim/projects")return reply({items:[],total:0,page:1,page_size:20,active_count:0,archived_count:0});
  if(p==="/vehicsim/context")return reply({project:{id:1,name:"Fixture"},workspace:null,vehicle:{id:1,name:"Fixture"},system:{id:1,baseline:null},versions:[],families:[],parameters:[],reviewer_projects:[],reviewer_can_decide:false});
    if(p==="/vehicsim/admin/users"&&req.method()==="POST"){
      const body=req.postDataJSON();writes.push({path:p,method:"POST",body});
      const row={...body,id:1000001,full_name:[body.last_name,body.middle_name,body.first_name].filter(Boolean).join(" "),created_date:"2026-11-13T10:00:00"};
      users.push(row);return reply(row,201);
    }
    if(p==="/vehicsim/admin/users"&&req.method()==="GET"){
      const size=Number(url.searchParams.get("page_size")||20),number=Number(url.searchParams.get("page")||1),q=url.searchParams.get("q")||"";
      let rows=users.filter(user=>!q||`${user.full_name} ${user.email}`.toLowerCase().includes(q.toLowerCase()));
      const wantedRole=url.searchParams.get("role"),status=url.searchParams.get("status"),sort=url.searchParams.get("sort");
      if(wantedRole)rows=rows.filter(user=>user.role===wantedRole);
      if(status)rows=rows.filter(user=>user.is_active===(status==="ACTIVE"));
      rows.sort((a,b)=>sort==="name"?a.email.localeCompare(b.email)||b.id-a.id:sort==="oldest"?a.id-b.id:b.id-a.id);
      const response={items:rows.slice((number-1)*size,number*size),total:rows.length,page:number,page_size:size};
      if(q===delaySearch)await new Promise(resolve=>pending.push({kind:"search",resolve}));
      if(mode==="slow")await new Promise(resolve=>pending.push({kind:"list",resolve}));
      if(mode==="error"||q==="old-response")return reply({detail:"Fixture: không tải được danh sách"},503);
      if(mode==="forbidden")return reply({detail:"Fixture: bạn không có quyền"},403);
      if(mode==="expired")return reply({detail:"Fixture: hết phiên"},401);
      if(mode==="network")return route.abort("failed");
      if(mode==="malformed")return reply({...response,total:null});
      if(mode==="empty")return reply({items:[],total:0,page:number,page_size:size});
      if(mode==="incomplete")return reply({items:incompleteUsers,total:3,page:number,page_size:size});
      return reply(response);
    }
    const detail=p.match(/^\/vehicsim\/admin\/users\/(\d+)$/);
    if(detail){
      const row=users.find(user=>user.id===Number(detail[1]))??incompleteUsers.find(user=>user.id===Number(detail[1]));
      if(req.method()==="PUT"){
        writes.push({path:p,method:req.method(),body:req.postDataJSON()});
        if(saveMode==="reject")return reply({detail:"Fixture: lưu thất bại, giữ dữ liệu nhập"},409);
        Object.assign(row,req.postDataJSON());row.full_name=[row.last_name,row.middle_name,row.first_name].filter(Boolean).join(" ");
        return reply(row);
      }
      if(detailMode==="slow")await new Promise(resolve=>pending.push({kind:"detail",resolve}));
      if(detailMode==="error")return reply({detail:"Fixture: không mở được tài khoản"},503);
      return reply(row??{},row?200:404);
    }
    if(p==="/vehicsim/admin/workspaces"||p==="/vehicsim/admin/tech-references")return reply({items:[],total:0,page:1,page_size:20});
    unexpected.push(p);return reply({detail:`Unhandled fixture ${p}`},404);
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on("pageerror",error=>errors.push(error.message));
  const frame=page.locator("[data-admin-frame]");
  const rowButtons=()=>frame.getByRole("button",{name:/^Chỉnh sửa tài khoản /});
  const readCount=()=>requests.filter(r=>r.path==="/vehicsim/admin/users"&&r.method==="GET").length;
  const ready=async()=>{
    const params=new URL(page.url()).searchParams;
    const q=(params.get("q")||"").trim().slice(0,100),wantedRole=roles.includes(params.get("role"))?params.get("role"):"",status=["ACTIVE","INACTIVE"].includes(params.get("status"))?params.get("status"):"",sort=["name","oldest","newest"].includes(params.get("sort"))?params.get("sort"):"newest";
    const size=[10,20,50,100].includes(Number(params.get("page_size")))?Number(params.get("page_size")):20;
    const matching=mode==="empty"?[]:users.filter(row=>(!q||(row.full_name+" "+row.email).toLowerCase().includes(q.toLowerCase()))&&(!wantedRole||row.role===wantedRole)&&(!status||row.is_active===(status==="ACTIVE")));
    matching.sort((a,b)=>sort==="name"?a.email.localeCompare(b.email)||b.id-a.id:sort==="oldest"?a.id-b.id:b.id-a.id);
    const rawPage=Number(params.get("page")||1),validPage=Number.isInteger(rawPage)&&rawPage>0&&rawPage<=100000?rawPage:1;
    const pageNumber=Math.min(validPage,Math.max(1,Math.ceil(matching.length/size)));
    const emails=matching.slice((pageNumber-1)*size,pageNumber*size).map(row=>row.email);
    await page.waitForFunction(expected=>{
      const frame=document.querySelector("[data-admin-frame]"),region=frame?.querySelector('[aria-label="Bảng tài khoản, cuộn ngang"]');
      if(!region)return false;
      const cells=[...region.querySelectorAll("tbody tr th")];
      const labels=[...frame.querySelectorAll("button[aria-label]")].map(button=>button.getAttribute("aria-label"));
      const scopeMatches=labels.includes("Bỏ tìm kiếm: "+expected.q)===!!expected.q&&labels.some(label=>label.startsWith("Bỏ lọc vai trò"))===!!expected.role&&labels.some(label=>label.startsWith("Bỏ lọc trạng thái"))===!!expected.status;
      const text=expected.total.toLocaleString("vi-VN")+" kết quả · Trang "+expected.page+"/"+Math.max(1,Math.ceil(expected.total/expected.size));
      return scopeMatches&&frame.textContent.includes(text)&&cells.length===expected.emails.length&&cells.every((cell,i)=>cell.textContent.includes(expected.emails[i]));
    },{q,role:wantedRole,status,emails,total:matching.length,page:pageNumber,size});
  };
  const goto=async search=>{await page.goto(base+"/admin/users"+search);await ready();};
  const shot=async name=>{await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true});screenshots.push(`${name}.png`);};
  const release=kind=>{const item=pending.find(item=>item.kind===kind);assert.ok(item);pending.splice(pending.indexOf(item),1);item.resolve();};
  const query=()=>Object.fromEntries(new URL(page.url()).searchParams);


  const input=frame.getByLabel("Từ khóa tìm kiếm",{exact:true});
  const submit=async value=>{await input.fill(value);await input.press("Enter");await ready();};
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const checkFocus=async()=>assert.equal(await input.evaluate(el=>el===document.activeElement),true,"Search keeps input focus");
  await page.goto(base+"/login");await page.getByLabel("Email",{exact:true}).fill(actor.email);await page.getByLabel("Mật khẩu",{exact:true}).fill("Fixture-browser-only-12");
  await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();await ready();

  // Collect both original failures in one baseline run before exercising the passing flows.
  const baselineIssues=[];
  const originalNode=await input.elementHandle();
  await submit("Fixture");
  if(!await originalNode.evaluate(el=>el.isConnected))baselineIssues.push("Search remounts the input DOM node");
  if(!await input.evaluate(el=>el===document.activeElement))baselineIssues.push("Enter search loses input focus");
  await shot("search-submit-focus");
  await goto("?q=Fixture&page=3");
  const unchangedUrl=page.url(),unchangedReads=readCount();
  await input.press("Enter");await ready();
  if(page.url()!==unchangedUrl)baselineIssues.push("Unchanged query resets page 3 to page 1");
  if(readCount()!==unchangedReads)baselineIssues.push("Unchanged query sends an unnecessary list request");
  await shot("search-unchanged-query");
  await fs.writeFile(path.join(output,"baseline-observations.json"),JSON.stringify({baselineIssues,url:page.url(),unchangedUrl,unchangedReads,reads:readCount()},null,2));
  assert.deepEqual(baselineIssues,[]);
  await input.fill("  Fixture  ");await input.press("Enter");await ready();
  assert.equal(page.url(),unchangedUrl);assert.equal(readCount(),unchangedReads,"Whitespace-only normalization does not resubmit the applied search");

  // Explicit submission: fast typing/caret movement never sends requests on its own.
  for(const [width,height] of [[1366,768],[768,1024],[390,844],[320,568]]){
    await goto("?page=3");await page.setViewportSize({width,height});
    const before=readCount();
    await input.fill("");await input.pressSequentially("  Fixture  ",{delay:5});
    await input.press("ArrowLeft");const caret=await input.evaluate(el=>el.selectionStart);
    assert.equal(readCount(),before);assert.equal(query().page,"3");
    await input.press("Enter");await ready();await checkFocus();
    assert.equal(query().q,"Fixture");assert.equal(query().page,undefined);
    assert.equal(readCount(),before+1);assert(caret>0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await shot("search-focus-"+width);
    // A data refresh must not overwrite a new, unapplied draft or its caret.
    await input.fill("Fixture draft");await input.press("ArrowLeft");
    const position=await input.evaluate(el=>el.selectionStart);
    const refresh=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/admin/users"));
    await frame.getByRole("button",{name:"Làm mới danh sách",exact:true}).evaluate(button=>button.click());
    await (await refresh).finished();
    await ready();await checkFocus();assert.equal(await input.inputValue(),"Fixture draft");
    assert.equal(await input.evaluate(el=>el.selectionStart),position);
    assert.equal(query().q,"Fixture");
  }
  await page.setViewportSize({width:1366,height:768});
  await goto("?q=Fixture&page=3&sort=name&page_size=10&status=ACTIVE");
  await submit("fixture-001@example.invalid");
  assert.deepEqual(query(),{q:"fixture-001@example.invalid",status:"ACTIVE",sort:"name",page_size:"10"});
  assert.equal(await rowButtons().count(),1);
  await submit("Fixture");await frame.getByRole("button",{name:"Sau",exact:true}).click();await ready();
  assert.equal(query().q,"Fixture");assert.equal(query().page,"2");
  await input.focus();await input.press("Enter");await ready();assert.equal(query().page,"2");await checkFocus();
  await page.goBack();await ready();assert.equal(await input.inputValue(),"Fixture");assert.equal(query().page,undefined);
  await page.goBack();await ready();assert.equal(await input.inputValue(),"fixture-001@example.invalid");
  await page.goForward();await ready();assert.equal(await input.inputValue(),"Fixture");
  const beforeEscape=readCount();await input.fill("unapplied draft");await input.press("Escape");
  assert.equal(await input.inputValue(),"","Native search Escape clears only the draft");
  assert.equal(query().q,"Fixture");assert.equal(readCount(),beforeEscape);await checkFocus();
  const beforeClear=readCount();await input.fill("");assert.equal(readCount(),beforeClear);
  await input.press("Enter");await ready();assert.equal(query().q,undefined);assert.equal(query().status,"ACTIVE");await checkFocus();
  assert.equal(await frame.getByRole("button",{name:/^Bỏ tìm kiếm:/}).count(),0);
  await submit("Fixture");
  await frame.getByRole("button",{name:"Bỏ tìm kiếm: Fixture",exact:true}).click();await ready();
  assert.equal(await input.inputValue(),"");assert.equal(query().q,undefined);

  // Success and error from A must not replace B; response data is captured before the gate.
  for(const oldQuery of ["Fixture","old-response"]){
    await goto("");delaySearch=oldQuery;
    await input.fill(oldQuery);await input.press("Enter");
    await frame.getByRole("status").filter({hasText:"Đang tải dữ liệu tài khoản"}).waitFor();
    assert.equal(await rowButtons().count(),0);
    await submit("fixture-001@example.invalid");
    assert.equal(await rowButtons().count(),1);
    const late=page.waitForResponse(r=>new URL(r.url()).searchParams.get("q")===oldQuery);
    release("search");await (await late).finished();await settle();
    assert.equal(await frame.getByRole("alert").count(),0);
    assert.equal(await rowButtons().count(),1);assert.equal(query().q,"fixture-001@example.invalid");
    assert.equal(await rowButtons().first().getAttribute("aria-label"),"Chỉnh sửa tài khoản fixture-001@example.invalid");
    await checkFocus();delaySearch=null;
  }
  await submit("not-present-anywhere");
  await frame.getByRole("heading",{name:"Không có dữ liệu phù hợp.",exact:true}).waitFor();
  assert.equal(await frame.getByRole("heading",{name:"Chưa có tài khoản",exact:true}).count(),0);
  mode="error";await input.fill("Fixture");await input.press("Enter");
  await frame.getByRole("alert").filter({hasText:"không tải được"}).waitFor();
  assert.equal(await frame.getByRole("heading",{name:"Không có dữ liệu phù hợp.",exact:true}).count(),0);
  assert.equal(await rowButtons().count(),0);await checkFocus();
  mode="normal";await frame.getByRole("button",{name:"Thử lại",exact:true}).click();await ready();
  assert.equal(query().q,"Fixture");

  // A live request may finish after unmount; cleanup ignores it without new user requests.
  for(const oldQuery of ["Fixture","old-response"]){
    await goto("");delaySearch=oldQuery;
    await input.fill(oldQuery);await input.press("Enter");
    await frame.getByRole("status").filter({hasText:"Đang tải dữ liệu tài khoản"}).waitFor();
    const count=readCount();
    await page.getByRole("navigation",{name:"Quản trị hệ thống",exact:true}).filter({visible:true}).getByRole("link",{name:/^Workspace/}).click();
    await frame.getByRole("heading",{level:1,name:"Workspace",exact:true}).waitFor();
    const late=page.waitForResponse(r=>new URL(r.url()).searchParams.get("q")===oldQuery);
    release("search");await (await late).finished();await settle();
    assert.equal(readCount(),count);assert.equal(new URL(page.url()).pathname,"/admin/workspaces");
    assert.equal(await frame.getByRole("alert").count(),0);delaySearch=null;
  }

  // Confirmed create/edit refetches retain search, filters, sort and page 3.
  saveMode="success";await goto("?q=Fixture&page=3&sort=name");
  let scoped=page.url();await frame.getByRole("button",{name:"Thêm mới",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await dialog.waitFor();await page.keyboard.press("Escape");assert.equal(page.url(),scoped);
  await frame.getByRole("button",{name:"Thêm mới",exact:true}).click();
  for(const [label,value] of [["Email *","fixture-created@example.invalid"],["Họ *","Nguyễn"],["Tên đệm","Fixture"],["Tên *","Created"],["Mật khẩu ban đầu *","Fixture-only-123"]])await dialog.getByLabel(label,{exact:true}).fill(value);
  await dialog.getByRole("button",{name:"Tạo mới",exact:true}).click();assert.equal(writes.length,0);
  await dialog.getByRole("button",{name:"Xác nhận tạo",exact:true}).click();await dialog.waitFor({state:"hidden"});await ready();
  assert.equal(writes.length,1);assert.equal(page.url(),scoped);assert.equal(query().page,"3");
  await rowButtons().first().click();await dialog.waitFor();
  await dialog.getByLabel("Tên *",{exact:true}).fill("Updated");
  await dialog.getByLabel("Vai trò *",{exact:true}).selectOption("REVIEWER");
  await dialog.getByRole("button",{name:"Lưu thay đổi",exact:true}).click();assert.equal(writes.length,1);
  await dialog.getByRole("button",{name:"Xác nhận lưu",exact:true}).click();await dialog.waitFor({state:"hidden"});await ready();
  assert.equal(writes.length,2);assert.equal(page.url(),scoped);assert.equal(await input.inputValue(),"Fixture");
  assert.equal(writes[1].body.role,"REVIEWER");
  await shot("search-after-confirmed-edit");
  await goto("?q=Fixture&status=ACTIVE&role=ENGINEER");
  scoped=page.url();const target=await rowButtons().first().getAttribute("aria-label");
  await rowButtons().first().click();await dialog.waitFor();
  await dialog.getByLabel("Tài khoản đang hoạt động",{exact:true}).uncheck();
  await dialog.getByRole("button",{name:"Lưu thay đổi",exact:true}).click();
  await dialog.getByRole("button",{name:"Xác nhận lưu",exact:true}).click();await dialog.waitFor({state:"hidden"});await ready();
  assert.equal(page.url(),scoped);assert.equal(await frame.getByRole("button",{name:target,exact:true}).count(),0);
  assert.equal(await input.inputValue(),"Fixture");assert.equal(writes.length,3);
  assert.deepEqual(writes.map(write=>write.method),["POST","PUT","PUT"]);
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",screenshots,checks:["Enter search preserves input DOM and focus","unchanged normalized query preserves page and sends no request","rapid typing has no request until explicit submit; draft/caret survives data refresh","changed query resets page 3; paging/history/clearing retain other query values","stale success and stale error ignored after newer success","filtered empty differs from API error/retry","late success/error after unmount ignored; no new user requests","create/edit/role/status/modal cancel retain search/page and confirmed writes only"],fixtureWriteCount:writes.length,liveBackendVerified:false,figmaVerified:false},null,2));
  console.log("PASS user search Phase 4: "+screenshots.length+" screenshots; browser HTTP fixtures only. Live backend/auth/DB/Figma NOT verified.");
}finally{for(const item of pending)item.resolve();await browser.close();}
