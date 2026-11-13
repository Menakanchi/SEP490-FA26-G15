/** Batch 4 forms: browser-only HTTP fixtures, no live auth/backend/DB/Figma. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),output=path.resolve(root,process.env.ADMIN_UI_OUTPUT||"data/admin-batch4-ui");
await fs.mkdir(output,{recursive:true});
const base=process.env.ADMIN_UI_URL||"http://localhost:3100";
const actor={id:999999,email:"self-form@example.invalid",full_name:"Admin Fixture",role:"ADMIN"};
const users=[
 {id:actor.id,email:actor.email,full_name:actor.full_name,last_name:"Admin",middle_name:null,first_name:"Fixture",role:"ADMIN",is_active:true,created_date:"2026-11-04T08:30:00"},
 {id:101,email:"engineer-form@example.invalid",full_name:"Nguyễn Kỹ sư",last_name:"Nguyễn",middle_name:null,first_name:"Kỹ sư",role:"ENGINEER",is_active:true,created_date:"2026-11-04T08:30:00"},
 {id:102,email:"manager-form@example.invalid",full_name:"Trần Quản lý",last_name:"Trần",middle_name:null,first_name:"Quản lý",role:"MANAGER",is_active:true,created_date:"2026-11-04T08:30:00"},
 {id:103,email:"reviewer-form@example.invalid",full_name:"Lê Người duyệt",last_name:"Lê",middle_name:null,first_name:"Người duyệt",role:"REVIEWER",is_active:false,created_date:"2026-11-04T08:30:00"},
];
let role="ADMIN",saveMode="reject",detailMode="normal",revoked=false;
const writes=[],reads=[],pending=[],errors=[],unexpected=[],screenshots=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
try{
 const context=await browser.newContext({viewport:{width:1366,height:768}});
 await context.route("**/api/v1/**",async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname.replace("/api/v1","");
  const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body),headers:{"Access-Control-Allow-Origin":"*"}});
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"GET,POST,PUT,OPTIONS"}});
  if(p==="/auth/login")return reply({access_token:"user-form-fixture-only",token_type:"bearer",expires_in:3600,user:{...actor,role}});
  if(p==="/auth/me")return reply({...actor,role});
  if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
  if(p==="/vehicsim/projects")return reply({items:[],total:0,page:1,page_size:20,active_count:0,archived_count:0});
  if(p==="/vehicsim/context")return reply({project:{id:1,name:"Fixture"},workspace:null,vehicle:{id:1,name:"Fixture"},system:{id:1,baseline:null},versions:[],families:[],parameters:[],reviewer_projects:[],reviewer_can_decide:false});
  const target=p.match(/^\/vehicsim\/admin\/users(?:\/(\d+))?$/);
  if(target){
   if(req.method()==="GET"){
    reads.push(p);
    if(revoked)return reply({detail:"Fixture: phiên cũ đã thu hồi"},401);
    if(target[1]){
     const behavior=detailMode,row=users.find(user=>user.id===Number(target[1]));
     if(behavior==="slow")await new Promise(resolve=>pending.push({kind:"detail",resolve}));
     if(behavior==="mismatch")return reply({...row,id:888888});
     return reply(row||{},row?200:404);
    }
    let rows=users.filter(user=>(!url.searchParams.get("role")||user.role===url.searchParams.get("role"))&&(!url.searchParams.get("status")||user.is_active===(url.searchParams.get("status")==="ACTIVE")));
    const q=url.searchParams.get("q");if(q)rows=rows.filter(user=>(user.full_name+" "+user.email).toLowerCase().includes(q.toLowerCase()));
    rows.sort((a,b)=>b.id-a.id);
    const size=Number(url.searchParams.get("page_size")||20),page=Number(url.searchParams.get("page")||1);
    return reply({items:rows.slice((page-1)*size,page*size),total:rows.length,page,page_size:size});
   }
   const body=req.postDataJSON(),behavior=saveMode;writes.push({method:req.method(),path:p,body});
   if(behavior==="slow")await new Promise(resolve=>pending.push({kind:"save",resolve}));
   if(behavior==="network")return route.abort("failed");
   if(behavior==="reject")return reply({detail:"Fixture: email đã được sử dụng"},409);
   if(behavior==="dependency")return reply({detail:"Chuyển toàn bộ workspace sang Manager khác trước khi đổi vai trò hoặc khóa tài khoản này"},400);
   if(behavior==="forbidden")return reply({detail:"Fixture: không có quyền lưu"},403);
   if(behavior==="quota")return reply({detail:"Fixture: thao tác quá nhiều, thử lại sau"},429);
   if(behavior==="expired")return reply({detail:"Fixture: hết phiên"},401);
   let row=target[1]?users.find(user=>user.id===Number(target[1])):{id:600+users.length,created_date:"2026-11-04T09:00:00"};
   const oldEmail=row.email;Object.assign(row,body);row.full_name=[row.last_name,row.middle_name,row.first_name].filter(Boolean).join(" ");
   if(!target[1])users.push(row);
   if(row.id===actor.id&&oldEmail!==body.email)revoked=true;
   return reply(row,target[1]?200:201);
  }
  unexpected.push(p);return reply({detail:"Unhandled fixture "+p},404);
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on("pageerror",error=>errors.push(error.message));
 const frame=page.locator("[data-admin-frame]");
 const dialog=()=>page.getByRole("dialog",{name:/^(Chỉnh sửa|Thêm mới) · Tài khoản$/});
 const roleHelp=()=>dialog().locator("#admin-user-role-help");
 const ready=()=>frame.getByRole("region",{name:"Bảng tài khoản, cuộn ngang",exact:true}).waitFor();
 const open=async email=>{await frame.getByRole("button",{name:"Chỉnh sửa tài khoản "+email,exact:true}).click();await dialog().waitFor();};
 const add=async()=>{await frame.getByRole("button",{name:"Thêm mới",exact:true}).click();await dialog().waitFor();};
 const shot=async name=>{await page.screenshot({path:path.join(output,name+".png"),fullPage:false});screenshots.push(name+".png");};
 const release=kind=>{const item=pending.find(item=>item.kind===kind);assert.ok(item);pending.splice(pending.indexOf(item),1);item.resolve();};
 const fillCreate=async(password="Fixture-123")=>{
  await dialog().getByLabel("Email *",{exact:true}).fill("  NEW-FORM@EXAMPLE.INVALID  ");
  await dialog().getByLabel("Họ *",{exact:true}).fill("  Nguyễn  ");
  await dialog().getByLabel("Tên đệm",{exact:true}).fill("  Thị  ");
  await dialog().getByLabel("Tên *",{exact:true}).fill("  Fixture  ");
  await dialog().getByLabel("Mật khẩu ban đầu *",{exact:true}).fill(password);
 };
 const confirmEdit=async()=>{await dialog().getByRole("button",{name:"Lưu thay đổi",exact:true}).click();await dialog().getByRole("heading",{name:"Xác nhận thay đổi",exact:true}).waitFor();};
 const discard=async()=>{await dialog().getByRole("button",{name:"Hủy",exact:true}).click();await dialog().getByRole("button",{name:"Bỏ thay đổi",exact:true}).click();await dialog().waitFor({state:"hidden"});};

 await page.goto(base+"/login");await page.getByLabel("Email",{exact:true}).fill(actor.email);await page.getByLabel("Mật khẩu",{exact:true}).fill("Fixture-browser-only-12");await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();await ready();
 await add();
 assert.equal(await dialog().getByLabel("Email *",{exact:true}).evaluate(el=>el===document.activeElement),true);
 assert.equal(await dialog().getByLabel("Vai trò *",{exact:true}).inputValue(),"MANAGER");
 assert.equal(await dialog().getByLabel("Tài khoản đang hoạt động",{exact:true}).isDisabled(),true);
 const beforeRoleHelp={reads:reads.length,writes:writes.length};
 assert.deepEqual((await dialog().getByLabel("Vai trò *",{exact:true}).locator("option").evaluateAll(nodes=>nodes.map(n=>n.value))).sort(),["ADMIN","ENGINEER","EXPERIENCER","MANAGER","REVIEWER"]);
 for(const [code,positive,limit] of [
  ["ADMIN","Quản trị tài khoản","Không duyệt khuyến nghị hoặc thêm/bớt thành viên workspace"],
  ["MANAGER","Quản lý thành viên","Chỉ đọc phần kỹ thuật"],
  ["ENGINEER","chạy regression","Không duyệt khuyến nghị"],
  ["REVIEWER","chạy regression để kiểm tra","Không tạo kịch bản hoặc candidate"],
  ["EXPERIENCER","Tài khoản tự đăng ký","Không duyệt khuyến nghị"]
 ]){
  await dialog().getByLabel("Vai trò *",{exact:true}).selectOption(code);
  const text=await roleHelp().innerText();assert(text.includes("một vai trò hệ thống"));assert(text.includes(positive));assert(text.includes(limit));
  assert.equal(await roleHelp().getAttribute("aria-live"),"polite");
  if(code==="ADMIN"||code==="MANAGER"){await roleHelp().scrollIntoViewIfNeeded();await shot("role-help-"+code.toLowerCase()+"-1366");}
 }
 await dialog().getByLabel("Vai trò *",{exact:true}).selectOption("MANAGER");
 assert.deepEqual({reads:reads.length,writes:writes.length},beforeRoleHelp,"Reading role help does not call permission APIs or save changes");
 await dialog().getByLabel("Email *",{exact:true}).scrollIntoViewIfNeeded();
 for(const [width,height] of [[1920,1080],[1366,768],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const bounds=await dialog().boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height);
  await shot("create-"+width);
 }
 await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();
 assert.equal(writes.length,0);assert.equal(await dialog().getByLabel("Email *",{exact:true}).getAttribute("aria-invalid"),"true");
 await dialog().getByRole("alert").filter({hasText:"Vui lòng kiểm tra"}).waitFor();await shot("validation-390");
 await fillCreate("á".repeat(37));await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();
 await dialog().getByText("Mật khẩu phải ít nhất 8 ký tự và tối đa 72 byte UTF-8.",{exact:true}).waitFor();assert.equal(writes.length,0);
 const password="á".repeat(36);await dialog().getByLabel("Mật khẩu ban đầu *",{exact:true}).fill(password);
 await dialog().getByRole("button",{name:"Hiện mật khẩu",exact:true}).click();assert.equal(await dialog().getByLabel("Mật khẩu ban đầu *",{exact:true}).getAttribute("type"),"text");
 await dialog().getByRole("button",{name:"Ẩn mật khẩu",exact:true}).click();
 await dialog().getByLabel("Vai trò *",{exact:true}).selectOption("ENGINEER");
 await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();
 await dialog().getByRole("heading",{name:"Xác nhận tạo tài khoản",exact:true}).waitFor();
 assert.equal(writes.length,0);assert.equal((await dialog().innerText()).includes(password),false);assert.equal(await dialog().getByLabel("Mật khẩu ban đầu *",{exact:true}).count(),0);
 assert.equal(await dialog().getByRole("button",{name:"Quay lại",exact:true}).evaluate(el=>el===document.activeElement),true);
 await shot("create-review-390");
 await dialog().getByRole("region",{name:"Quyền của vai trò Kỹ sư",exact:true}).getByText(/Không duyệt khuyến nghị/).waitFor();
 await page.keyboard.press("Escape");assert.equal(await dialog().getByLabel("Mật khẩu ban đầu *",{exact:true}).inputValue(),password);
 await page.keyboard.press("Escape");await dialog().getByRole("heading",{name:"Bỏ thay đổi chưa lưu?",exact:true}).waitFor();
 assert.equal(await dialog().getByRole("button",{name:"Tiếp tục chỉnh sửa",exact:true}).evaluate(el=>el===document.activeElement),true);await shot("discard-390");
 await dialog().getByRole("button",{name:"Tiếp tục chỉnh sửa",exact:true}).click();assert.equal(await dialog().getByLabel("Email *",{exact:true}).inputValue(),"NEW-FORM@EXAMPLE.INVALID");
 // A rejected create preserves even the password, with a focused server error and no fake success.
 await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();await dialog().getByRole("button",{name:"Xác nhận tạo",exact:true}).click();
 await dialog().getByRole("alert").filter({hasText:"email đã được sử dụng"}).waitFor();assert.equal(await dialog().getByLabel("Mật khẩu ban đầu *",{exact:true}).inputValue(),password);
 assert.equal(await dialog().getByRole("alert").evaluate(el=>el===document.activeElement),true);
 assert.equal(users.some(user=>user.email==="new-form@example.invalid"),false);await shot("create-server-error-390");
 saveMode="slow";await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();
 const beforeCreate=writes.length;await dialog().getByRole("button",{name:"Xác nhận tạo",exact:true}).evaluate(el=>{el.click();el.click();});
 await dialog().getByRole("button",{name:"Đang lưu…",exact:true}).waitFor();assert.equal(writes.length,beforeCreate+1);
 await page.keyboard.press("Escape");assert.equal(await dialog().isVisible(),true);assert.equal(await dialog().getByRole("button",{name:"Đóng biểu mẫu",exact:true}).isDisabled(),true);assert.equal(await dialog().getByRole("button",{name:"Quay lại",exact:true}).isDisabled(),true);
 release("save");await dialog().waitFor({state:"hidden"});await ready();await frame.getByText("Nguyễn Thị Fixture",{exact:true}).waitFor();
 const createdFeedback=frame.getByRole("status").filter({hasText:"Đã lưu thành công."});
 assert((await createdFeedback.innerText()).includes("new-form@example.invalid"));assert(await createdFeedback.evaluate(el=>el===document.activeElement));
 await shot("create-success-390");
 const creation=writes.at(-1);assert.equal(creation.method,"POST");assert.equal(creation.body.email,"new-form@example.invalid");assert.equal(creation.body.password,password);assert.equal(creation.body.is_active,true);
 assert.deepEqual(Object.keys(creation.body).sort(),["email","first_name","is_active","last_name","middle_name","password","role"]);

 await page.setViewportSize({width:1366,height:768});await open(users[1].email);
 assert.equal(await dialog().getByRole("button",{name:"Lưu thay đổi",exact:true}).isDisabled(),true);
 assert.equal(await dialog().getByText("Ngày tạo",{exact:true}).count(),1);
 assert.equal(await dialog().getByLabel("Mật khẩu ban đầu *",{exact:true}).count(),0);await shot("edit-details-1366");
 for(let i=0;i<18;i++){await page.keyboard.press("Tab");assert.equal(await dialog().evaluate(el=>el.contains(document.activeElement)),true);}
 await page.keyboard.press("Shift+Tab");assert.equal(await dialog().evaluate(el=>el.contains(document.activeElement)),true);
 const oldName=users[1].first_name;await dialog().getByLabel("Tên *",{exact:true}).fill("Tên đã chỉnh");
 await confirmEdit();assert.equal(await dialog().getByLabel("Ảnh hưởng của thay đổi",{exact:true}).count(),0);
 await dialog().getByText("Chỉ cập nhật thông tin họ tên; email, vai trò và trạng thái giữ nguyên.",{exact:true}).waitFor();await shot("name-review-1366");
 await dialog().getByRole("button",{name:"Quay lại",exact:true}).click();await discard();assert.equal(users[1].first_name,oldName);
 assert.equal(await frame.getByRole("button",{name:"Chỉnh sửa tài khoản "+users[1].email,exact:true}).evaluate(el=>el===document.activeElement),true);

 await open(users[1].email);await dialog().getByLabel("Vai trò *",{exact:true}).selectOption("REVIEWER");await dialog().getByLabel("Tài khoản đang hoạt động",{exact:true}).uncheck();
 await confirmEdit();await dialog().getByText("Tài khoản sẽ không thể đăng nhập sau khi bị khóa.",{exact:true}).waitFor();
 const review=dialog().getByRole("region",{name:"Nội dung xác nhận tài khoản",exact:true});assert.equal((await review.innerText()).includes("Kỹ sư"),true);assert.equal((await review.innerText()).includes("Người duyệt"),true);
 const roleReview=dialog().getByRole("region",{name:"Quyền của vai trò Người duyệt",exact:true});
 await roleReview.getByText(/chấp nhận\/từ chối khuyến nghị/).waitFor();
 await roleReview.getByText("Các quyền này chỉ sử dụng được khi tài khoản ở trạng thái hoạt động.",{exact:true}).waitFor();
 await dialog().getByText("Vai trò mới có hiệu lực ở cấp hệ thống, không chỉ trong một workspace.",{exact:true}).waitFor();
 await roleReview.scrollIntoViewIfNeeded();
 await shot("role-lock-review-1366");await page.setViewportSize({width:390,height:844});await shot("role-lock-review-390");
 saveMode="dependency";await dialog().getByRole("button",{name:"Xác nhận lưu",exact:true}).click();await dialog().getByRole("alert").filter({hasText:"Chuyển toàn bộ workspace"}).waitFor();
 assert.equal(await dialog().getByLabel("Vai trò *",{exact:true}).inputValue(),"REVIEWER");assert.equal(await dialog().getByLabel("Tài khoản đang hoạt động",{exact:true}).isChecked(),false);assert.equal(users[1].is_active,true);
 for(const behavior of ["forbidden","quota","network"]){
  saveMode=behavior;await confirmEdit();await dialog().getByRole("button",{name:"Xác nhận lưu",exact:true}).click();await dialog().getByRole("alert").waitFor();
  assert.equal(await dialog().getByLabel("Vai trò *",{exact:true}).inputValue(),"REVIEWER");assert.equal(users[1].role,"ENGINEER");
 }
 saveMode="success";await confirmEdit();const beforeSave=writes.length;await dialog().getByRole("button",{name:"Xác nhận lưu",exact:true}).click();await dialog().waitFor({state:"hidden"});await ready();
 assert.equal(writes.length,beforeSave+1);assert.equal(users[1].role,"REVIEWER");assert.equal(users[1].is_active,false);assert.equal(Object.hasOwn(writes.at(-1).body,"password"),false);
 await open(users[1].email);await dialog().getByLabel("Tài khoản đang hoạt động",{exact:true}).check();await confirmEdit();await dialog().getByText("Tài khoản có thể đăng nhập lại. Các phiên đã thu hồi không được khôi phục.",{exact:true}).waitFor();await dialog().getByRole("button",{name:"Quay lại",exact:true}).click();await discard();

 // Wrong target and late detail responses cannot open another user's form or replace an Add draft.
 detailMode="mismatch";await frame.getByRole("button",{name:"Chỉnh sửa tài khoản "+users[2].email,exact:true}).click();await frame.getByRole("alert").filter({hasText:"không khớp"}).waitFor();assert.equal(await dialog().count(),0);
 detailMode="slow";await frame.getByRole("button",{name:"Chỉnh sửa tài khoản "+users[2].email,exact:true}).click();assert.equal(await frame.getByRole("button",{name:"Thêm mới",exact:true}).isDisabled(),true);
 await frame.getByLabel("Vai trò",{exact:true}).selectOption("REVIEWER");await frame.getByRole("button",{name:"Bỏ lọc vai trò",exact:true}).waitFor();await ready();
 const late=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/users/102"));release("detail");await late;assert.equal(await dialog().count(),0);detailMode="normal";
 await page.goto(base+"/admin/users");await ready();await page.setViewportSize({width:1366,height:768});await open(actor.email);
 assert.equal(await dialog().getByLabel("Vai trò *",{exact:true}).isDisabled(),true);assert.equal(await dialog().getByLabel("Tài khoản đang hoạt động",{exact:true}).isDisabled(),true);
 assert((await roleHelp().innerText()).includes("Bạn không thể tự đổi vai trò hoặc khóa tài khoản của mình."));
 await dialog().getByLabel("Email *",{exact:true}).fill("self-new@example.invalid");await confirmEdit();await dialog().getByText("Phiên hiện tại của bạn sẽ hết hiệu lực. Hãy đăng nhập lại bằng email mới.",{exact:true}).waitFor();await shot("self-email-review-1366");
 await dialog().getByRole("button",{name:"Xác nhận lưu",exact:true}).click();await page.waitForURL(base+"/login");assert.equal(await page.evaluate(()=>localStorage.getItem("vehicsim_access_token")),null);
 revoked=false;
 for(const nextRole of ["MANAGER","ENGINEER","REVIEWER","EXPERIENCER"]){
  role=nextRole;await page.evaluate(()=>localStorage.setItem("vehicsim_access_token","role-fixture-only"));await page.goto(base+"/admin/users");
  const before=writes.length;await page.getByRole("heading",{name:"Trang này yêu cầu quyền truy cập",exact:true}).waitFor();assert.equal(await dialog().count(),0);assert.equal(writes.length,before);
  await page.evaluate(()=>localStorage.removeItem("vehicsim_access_token"));await page.goto(base+"/login");
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",screenshots,checks:["fixture login, create fields/defaults/inline validation/UTF8 72-byte boundary","password visibility; review redacts password; exact normalized create payload","dirty Escape/cancel keep/discard and focus return; native modal Tab trap","explicit target and before-after; name-only vs role/lock/unlock/self-email consequences","five role explanations, system scope, unchanged options/no permission APIs, create/edit review and locked account semantics","ref double-submit lock and busy close/Escape prevention","409/400 dependency/403/429/network error retains fields; only server success closes and refetches","no password on update; self role/status disabled; expired self-email session","mismatched/stale detail rejected; Add disabled while opening","four non-Admin roles cannot open form; no real API writes"],fixtureWriteCount:writes.length,liveBackendVerified:false,figmaVerified:false},null,2));
 console.log("PASS user forms: "+screenshots.length+" screenshots; browser HTTP fixtures only. Live backend/auth/DB/Figma NOT verified.");
}finally{for(const item of pending)item.resolve();await browser.close();}
