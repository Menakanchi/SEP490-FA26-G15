/** Batch 3: browser HTTP fixtures only; no live auth/backend/database/Figma. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const output=path.resolve(root,process.env.ADMIN_UI_OUTPUT||"data/admin-batch3-ui");await fs.mkdir(output,{recursive:true});
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
  const region=()=>frame.getByRole("region",{name:"Bảng tài khoản, cuộn ngang",exact:true});
  const rowButtons=()=>frame.getByRole("button",{name:/^Chỉnh sửa tài khoản /});
  const readCount=()=>requests.filter(r=>r.path==="/vehicsim/admin/users"&&r.method==="GET").length;
  const lastRead=()=>requests.filter(r=>r.path==="/vehicsim/admin/users"&&r.method==="GET").at(-1);
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
  const search=async q=>{await frame.getByLabel("Từ khóa tìm kiếm",{exact:true}).fill(q);await frame.getByRole("button",{name:"Tìm",exact:true}).click();await ready();};
  const shot=async name=>{await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true});screenshots.push(`${name}.png`);};
  const release=kind=>{const item=pending.find(item=>item.kind===kind);assert.ok(item);pending.splice(pending.indexOf(item),1);item.resolve();};
  const query=()=>Object.fromEntries(new URL(page.url()).searchParams);

  await page.goto(base+"/login");await page.getByLabel("Email",{exact:true}).fill(actor.email);await page.getByLabel("Mật khẩu",{exact:true}).fill("Fixture-browser-only-12");
  await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();await ready();
  assert.equal(readCount(),1);assert.equal(lastRead().query.page_size,"20");assert.equal(await rowButtons().count(),20);
  assert.equal(await frame.getByText("61 kết quả · Trang 1/4",{exact:true}).count(),1);
  assert.equal(await frame.getByRole("button",{name:"Trước",exact:true}).isDisabled(),true);
  assert.equal(await frame.getByText("Bạn",{exact:true}).count(),1);
  assert.equal(await frame.getByRole("columnheader",{name:"Tài khoản",exact:true}).count(),1);
  assert.equal(await region().getByRole("columnheader").count(),4);
  assert.equal(await region().getByRole("columnheader",{name:"Ngày tạo",exact:true}).count(),0);
  for(const [width,height] of [[1920,1080],[1366,768],[768,1024],[390,844],[320,568]]){
    await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await shot(`users-${width}`);
  }
  await region().focus();await page.keyboard.press("ArrowRight");await page.waitForFunction(()=>document.querySelector('[aria-label="Bảng tài khoản, cuộn ngang"]').scrollLeft>0);
  const sticky=await rowButtons().first().boundingBox();assert.ok(sticky.x>=0&&sticky.x+sticky.width<=320);
  assert.equal(await region().evaluate(el=>getComputedStyle(el).outlineWidth),"3px");
  await rowButtons().first().focus();
  assert.equal(await rowButtons().first().evaluate(el=>getComputedStyle(el).outlineWidth),"3px");
  await page.setViewportSize({width:1366,height:768});

  mode="empty";await page.goto(base+"/admin/users");
  await frame.getByRole("heading",{name:"Chưa có tài khoản",exact:true}).waitFor();
  assert.equal(await rowButtons().count(),0);await shot("empty-unfiltered");
  mode="incomplete";await page.reload();await region().locator("tbody tr").first().waitFor();
  for(const [width,height] of [[1366,768],[768,1024],[320,568]]){
    await page.setViewportSize({width,height});await shot("incomplete-"+width);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const rows=region().locator("tbody tr");assert.equal(await rows.count(),3);
    assert.match(await rows.nth(0).getByRole("rowheader").innerText(),/Tài khoản #901/);
    assert.match(await rows.nth(1).getByRole("rowheader").innerText(),/Tài khoản #902/,"Whitespace-only identity uses the ID fallback");
    assert.match(await rows.nth(2).getByRole("rowheader").innerText(),/fallback@example.invalid/,"Missing full name falls back to available email");
    assert.equal(await rows.nth(0).getByText("Chưa rõ",{exact:true}).count(),2,"Missing role/status are not invented");
    assert.deepEqual(await rowButtons().evaluateAll(buttons=>buttons.map(button=>button.getAttribute("aria-label"))),["Chỉnh sửa tài khoản #901","Chỉnh sửa tài khoản #902","Chỉnh sửa tài khoản fallback@example.invalid"],"Missing emails keep distinct action names");
  }
  await frame.getByRole("button",{name:"Chỉnh sửa tài khoản #901",exact:true}).click();
  await frame.getByRole("alert").filter({hasText:"không khớp hoặc không đầy đủ"}).waitFor();
  assert.equal(requests.at(-1).path,"/vehicsim/admin/users/901");
  assert.equal(await page.getByRole("dialog").count(),0,"Incomplete detail still cannot open an unsafe editor");
  assert.equal(writes.length,0);
  mode="normal";await page.setViewportSize({width:1366,height:768});await goto("");

  const initial=readCount();await frame.getByLabel("Từ khóa tìm kiếm",{exact:true}).fill("  Fixture  ");assert.equal(readCount(),initial);assert.equal(query().q,undefined);
  await frame.getByRole("button",{name:"Tìm",exact:true}).click();await ready();assert.equal(query().q,"Fixture");
  await frame.getByRole("button",{name:"Sau",exact:true}).click();await ready();assert.equal(query().page,"2");
  await frame.getByLabel("Sắp xếp",{exact:true}).selectOption("name");await ready();assert.equal(query().page,undefined);assert.equal(lastRead().query.sort,"name");
  const visibleEmails=await region().locator("tbody tr th").allTextContents();assert.equal(visibleEmails[0].includes("fixture-001@example.invalid"),true);
  await frame.getByLabel("Số dòng mỗi trang",{exact:true}).selectOption("10");await ready();assert.equal(await rowButtons().count(),10);
  await frame.getByRole("button",{name:"Sau",exact:true}).click();await ready();assert.equal(query().page,"2");
  await frame.getByLabel("Vai trò",{exact:true}).selectOption("ENGINEER");await ready();assert.equal(query().page,undefined);
  await frame.getByLabel("Trạng thái",{exact:true}).selectOption("ACTIVE");await ready();
  assert.equal(lastRead().query.role,"ENGINEER");assert.equal(lastRead().query.status,"ACTIVE");
  assert.equal(await frame.getByRole("button",{name:/^Bỏ lọc vai trò/}).getAttribute("aria-label"),"Bỏ lọc vai trò: Kỹ sư","Role chip name includes its visible value");
  assert.equal(await frame.getByRole("button",{name:/^Bỏ lọc trạng thái/}).getAttribute("aria-label"),"Bỏ lọc trạng thái: Đang hoạt động","Status chip name includes its visible value");
  assert.equal(await region().locator("tbody tr").count(),users.filter(row=>row.role==="ENGINEER"&&row.is_active).length);
  assert.equal(await region().getByText("Đã khóa",{exact:true}).count(),0);
  const scoped=page.url();await page.reload();await ready();assert.equal(page.url(),scoped);
  assert.equal(await frame.getByLabel("Từ khóa tìm kiếm",{exact:true}).inputValue(),"Fixture");
  await page.getByRole("navigation",{name:"Quản trị hệ thống",exact:true}).filter({visible:true}).getByRole("link",{name:/^Workspace/}).click();await frame.getByRole("region",{name:"Bảng workspace, cuộn ngang",exact:true}).waitFor();
  await page.goBack();await ready();assert.equal(page.url(),scoped);
  const roleChip=frame.getByRole("button",{name:"Bỏ lọc vai trò: Kỹ sư",exact:true});
  await roleChip.focus();assert.equal(await roleChip.evaluate(el=>getComputedStyle(el).outlineWidth),"3px");
  await page.keyboard.press("Enter");await ready();assert.equal(query().role,undefined);
  await page.goBack();await ready();assert.equal(query().role,"ENGINEER");await page.goForward();await ready();assert.equal(query().role,undefined);
  await frame.getByRole("button",{name:"Bỏ lọc trạng thái: Đang hoạt động",exact:true}).focus();
  await page.keyboard.press("Enter");await ready();assert.equal(query().status,undefined);assert.equal(query().q,"Fixture");
  await frame.getByRole("button",{name:"Xóa bộ lọc",exact:true}).first().click();await ready();assert.deepEqual(query(),{sort:"name",page_size:"10"});
  await frame.getByLabel("Số dòng mỗi trang",{exact:true}).selectOption("50");await ready();assert.equal(await rowButtons().count(),50);
  await frame.getByLabel("Số dòng mỗi trang",{exact:true}).selectOption("100");await ready();assert.equal(await rowButtons().count(),61);

  for(const [role,status,roleLabel,statusLabel] of [["ADMIN","ACTIVE","Quản trị viên","Đang hoạt động"],["MANAGER","INACTIVE","Quản lý","Đã khóa"],["ENGINEER","ACTIVE","Kỹ sư","Đang hoạt động"],["REVIEWER","INACTIVE","Người duyệt","Đã khóa"],["EXPERIENCER","ACTIVE","Người trải nghiệm","Đang hoạt động"]]){
    await goto("?q=Fixture&role="+role+"&status="+status);
    const chips=[frame.getByRole("button",{name:"Bỏ lọc vai trò: "+roleLabel,exact:true}),frame.getByRole("button",{name:"Bỏ lọc trạng thái: "+statusLabel,exact:true})];
    for(const chip of chips)assert((await chip.getAttribute("aria-label")).includes((await chip.innerText()).trim()),"Accessible chip name contains the visible label");
    await shot("chips-"+role.toLowerCase()+"-"+status.toLowerCase());
  }

  await goto("?q=%20Fixture%20&status=ROOT&role=constructor&sort=hack&page=-7&page_size=999");
  assert.deepEqual(query(),{q:"Fixture"});assert.equal(lastRead().query.page,"1");assert.equal(lastRead().query.page_size,"20");
  await goto("?page=999");assert.equal(query().page,"4");assert.equal(await rowButtons().count(),1);
  assert.equal(await frame.getByText("61 kết quả · Trang 4/4",{exact:true}).count(),1);
  assert.equal(await frame.getByRole("button",{name:"Sau",exact:true}).isDisabled(),true);
  await goto("?q=not-present-anywhere&page=999");assert.equal(query().page,undefined);
  await frame.getByText("Không có dữ liệu phù hợp.",{exact:true}).waitFor();assert.equal(await rowButtons().count(),0);await shot("empty-filtered");

  // Two simultaneous queries: the old error cannot replace the new successful scope.
  delaySearch="old-response";await frame.getByLabel("Từ khóa tìm kiếm",{exact:true}).fill("old-response");await frame.getByRole("button",{name:"Tìm",exact:true}).click();
  await frame.getByRole("status").filter({hasText:"Đang tải dữ liệu tài khoản"}).waitFor();assert.equal(await rowButtons().count(),0);
  await search("Fixture");const late=page.waitForResponse(r=>new URL(r.url()).searchParams.get("q")==="old-response");release("search");await late;
  assert.equal(query().q,"Fixture");assert.equal(await frame.getByRole("alert").count(),0);assert.equal(await rowButtons().count(),20);delaySearch=null;
  mode="slow";await frame.getByRole("button",{name:"Làm mới danh sách",exact:true}).click();await frame.getByRole("status").filter({hasText:"Đang tải dữ liệu tài khoản"}).waitFor();await shot("loading");
  mode="normal";release("list");await ready();
  for(const errorMode of ["error","forbidden","network","malformed"]){
    mode=errorMode;const scoped=page.url();await frame.getByRole("button",{name:"Làm mới danh sách",exact:true}).click();await frame.getByRole("alert").waitFor();
    assert.equal(await rowButtons().count(),0);assert.equal(await frame.getByText(/61 kết quả/).count(),0);await shot(`list-${errorMode}`);
    mode="normal";await frame.getByRole("button",{name:"Thử lại",exact:true}).click();await ready();assert.equal(page.url(),scoped);
  }
  mode="empty";await frame.getByRole("button",{name:"Làm mới danh sách",exact:true}).click();await ready();await frame.getByText("Không có dữ liệu phù hợp.",{exact:true}).waitFor();
  mode="normal";await frame.getByRole("button",{name:"Xóa bộ lọc",exact:true}).first().click();await ready();

  // Existing Editor is reused; detail failure leaves the table intact and confirmed writes remain authoritative.
  const target=users.find(row=>row.role==="ENGINEER"&&row.is_active);
  await goto("?role=ENGINEER&status=ACTIVE&sort=name");const beforeEdit=page.url();
  const editButton=()=>frame.getByRole("button",{name:`Chỉnh sửa tài khoản ${target.email}`,exact:true});
  detailMode="error";await editButton().click();await frame.getByRole("alert").filter({hasText:"không mở được"}).waitFor();assert.equal(await rowButtons().count(),8);
  detailMode="slow";await editButton().click();assert.equal(await rowButtons().first().isDisabled(),true);
  assert.equal(await frame.getByRole("button",{name:"Thêm mới",exact:true}).isDisabled(),true);
  assert.equal(await editButton().innerText(),"Đang mở…");
  assert.equal(await page.getByRole("dialog").count(),0,"Pending detail is not shown as an opened editor");
  const detailResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(`/users/${target.id}`));detailMode="normal";release("detail");await detailResponse;
  const dialog=page.getByRole("dialog",{name:"Chỉnh sửa · Tài khoản",exact:true});await dialog.waitFor();
  assert.equal(await dialog.getByLabel("Email *",{exact:true}).inputValue(),target.email);
  await dialog.getByRole("button",{name:"Hủy",exact:true}).click();assert.equal(page.url(),beforeEdit);assert.equal(writes.length,0);
  await editButton().click();await dialog.waitFor();await dialog.getByLabel("Tên *",{exact:true}).fill("Giữ dữ liệu");
  await dialog.getByRole("button",{name:"Lưu thay đổi",exact:true}).click();assert.equal(writes.length,0);
  await dialog.getByRole("button",{name:"Xác nhận lưu",exact:true}).click();await dialog.getByRole("alert").filter({hasText:"lưu thất bại"}).waitFor();
  assert.equal(await dialog.getByLabel("Tên *",{exact:true}).inputValue(),"Giữ dữ liệu");assert.equal(target.is_active,true);
  saveMode="success";await dialog.getByLabel("Tài khoản đang hoạt động",{exact:true}).uncheck();
  await dialog.getByRole("button",{name:"Lưu thay đổi",exact:true}).click();assert.equal(writes.length,1);
  await dialog.getByRole("button",{name:"Xác nhận lưu",exact:true}).click();await dialog.waitFor({state:"hidden"});await ready();
  assert.equal(page.url(),beforeEdit);assert.equal(await editButton().count(),0);assert.equal(target.is_active,false);assert.equal(writes.length,2);
  await frame.getByText("Đã lưu thành công.",{exact:true}).waitFor();assert.equal(await rowButtons().count(),7);
  assert.equal(await frame.getByRole("status").filter({hasText:"Đã lưu thành công."}).evaluate(el=>el===document.activeElement),true,"Successful save must retain a keyboard focus destination when the edited row leaves the filter");
  const feedback=frame.getByRole("status").filter({hasText:"Đã lưu thành công."});
  assert((await feedback.innerText()).includes(target.email));
  await feedback.getByText("Bộ lọc được giữ nguyên; tài khoản không còn khớp sẽ không xuất hiện trong kết quả.",{exact:true}).waitFor();
  await shot("saved-filtered-1366");
  await frame.getByRole("button",{name:"Thêm mới",exact:true}).click();await page.getByRole("dialog",{name:"Thêm mới · Tài khoản",exact:true}).waitFor();await page.keyboard.press("Escape");assert.equal(writes.length,2);
  await goto("?role=ADMIN");await frame.getByRole("button",{name:`Chỉnh sửa tài khoản ${actor.email}`,exact:true}).click();await dialog.waitFor();
  assert.equal(await dialog.getByRole("combobox",{name:/^Vai trò/}).isDisabled(),true);assert.equal(await dialog.getByLabel("Tài khoản đang hoạt động",{exact:true}).isDisabled(),true);await page.keyboard.press("Escape");

  for(const nextRole of roles.filter(value=>value!=="ADMIN")){
    role=nextRole;const before=readCount();await page.goto(base+"/admin/users?q=Fixture&page=2");await page.getByRole("heading",{name:"Trang này yêu cầu quyền truy cập",exact:true}).waitFor();assert.equal(readCount(),before);
  }
  role="ADMIN";mode="expired";await page.goto(base+"/admin/users");await page.waitForURL(base+"/login");assert.equal(await page.evaluate(()=>localStorage.getItem("vehicsim_access_token")),null);
  const before=readCount();await page.goto(base+"/admin/users");await page.waitForURL(base+"/login");assert.equal(readCount(),before);
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",screenshots,checks:["fixture login; actual server search/filter/email sort/page sizes and row counts","URL reload/sidebar return/Back/Forward/chip reset/normalization/page clamp","four essential columns; five responsive widths including 320px; named scroll region keyboard/focus and sticky actions","all five roles and both status chip names include visible values; keyboard removal retains other query values/history","null/whitespace identity fallbacks, unique ID actions; incomplete detail still rejected without mutation; unfiltered empty state","success focus and target identity even when the saved account leaves an active filter","old response error ignored; loading/empty/503/403/network/malformed/retry with no stale actions","detail loading/error/target identity; unchanged Editor cancel/confirmation/error preservation/server success","self role/status guard; four forbidden roles and 401/guest","only two deliberate fixture PUTs; no real writes"],liveBackendVerified:false,figmaVerified:false},null,2));
  console.log(`PASS users table: ${screenshots.length} screenshots; browser HTTP fixtures only. Live backend/auth/DB/Figma NOT verified.`);
}finally{for(const item of pending)item.resolve();await browser.close();}
