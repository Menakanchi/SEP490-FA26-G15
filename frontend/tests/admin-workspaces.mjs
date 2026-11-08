/** Batch 5: production browser + HTTP fixtures only; no live auth/backend/database/Figma. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),output=path.join(root,"data/admin-batch5-ui");
await fs.mkdir(output,{recursive:true});
const base=process.env.ADMIN_UI_URL||"http://localhost:3100",stamp="2026-11-04T08:30:00";
const actor={id:999999,email:"workspace-admin@example.invalid",full_name:"Admin Fixture",last_name:"Admin",first_name:"Fixture",role:"ADMIN",is_active:true};
const managers=Array.from({length:121},(_,i)=>({id:1000+i,full_name:"Manager "+String(i).padStart(3,"0"),email:"manager-"+String(i).padStart(3,"0")+"@example.invalid",role:"MANAGER",is_active:true}));
const workspaces=Array.from({length:61},(_,i)=>({id:i===0?888888:2000+i,name:i===0?"Workspace với tên rất dài để kiểm tra bố cục trên màn hình nhỏ và thao tác quản trị":"Lab "+String(i).padStart(3,"0"),description:i===0?"Mô tả kiểm thử, không có dữ liệu thật.":null,manager_id:managers[i].id,manager_name:managers[i].full_name,manager_email:managers[i].email,member_count:i+2,project_count:i%7,status:i%4===1?"ARCHIVED":"ACTIVE",created_date:i===60?null:stamp,updated_at:stamp}));
let role="ADMIN",mode="normal",managerMode="normal",detailMode="normal",saveMode="reject",delaySearch=null,delayManager=null;
const requests=[],writes=[],pending=[],errors=[],unexpected=[],screenshots=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
try{
 const context=await browser.newContext({viewport:{width:1366,height:768}});
 await context.route("**/api/v1/**",async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname.replace("/api/v1","");
  const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body),headers:{"Access-Control-Allow-Origin":"*"}});
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"GET,POST,PUT,OPTIONS"}});
  requests.push({path:p,method:req.method(),query:Object.fromEntries(url.searchParams)});
  if(p==="/auth/login")return reply({access_token:"workspace-browser-fixture-only",token_type:"bearer",expires_in:3600,user:{...actor,role}});
  if(p==="/auth/me")return reply({...actor,role});
  if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
  if(p==="/vehicsim/context")return reply({project:{id:1,name:"Fixture"},workspace:null,vehicle:{id:1,name:"Fixture"},system:{id:1,baseline:null},versions:[],families:[],parameters:[]});
  if(p==="/vehicsim/admin/users"){
   const page=Number(url.searchParams.get("page")||1),size=Number(url.searchParams.get("page_size")||20),q=url.searchParams.get("q")||"";
   if(url.searchParams.get("role")!=="MANAGER")return reply({items:[actor],total:1,page,page_size:size});
   assert.equal(url.searchParams.get("status"),"ACTIVE");assert.equal(size,20);assert.equal(url.searchParams.get("sort"),"name");
   const behavior=managerMode,rows=managers.filter(item=>(item.full_name+" "+item.email).toLowerCase().includes(q.toLowerCase()));
   const response={items:rows.slice((page-1)*size,page*size),total:rows.length,page,page_size:size};
   if(behavior==="slow"||q===delayManager)await new Promise(resolve=>pending.push({kind:"manager",resolve}));
   if(q==="old-managers"||behavior==="error")return reply({detail:"Fixture: không tải được Manager"},503);
   if(behavior==="forbidden")return reply({detail:"Fixture: không có quyền xem Manager"},403);
   if(behavior==="network")return route.abort("failed");
   if(behavior==="malformed")return reply({...response,items:[{...managers[0],role:"ENGINEER"}]});
   if(behavior==="empty")return reply({...response,items:[],total:0});
   return reply(response);
  }
  const match=p.match(new RegExp("^/vehicsim/admin/workspaces(?:/([0-9]+))?$"));
  if(match){
   const row=workspaces.find(item=>item.id===Number(match[1]));
   if(req.method()!=="GET"){
    const body=req.postDataJSON(),behavior=saveMode;writes.push({method:req.method(),path:p,body});
    if(behavior==="slow")await new Promise(resolve=>pending.push({kind:"save",resolve}));
    if(behavior==="network")return route.abort("failed");
    if(behavior==="reject")return reply({detail:"Tên workspace đã được sử dụng"},409);
    if(behavior==="manager")return reply({detail:"Chọn tài khoản MANAGER đang hoạt động"},400);
    if(behavior==="archived")return reply({detail:"Workspace đã lưu trữ, không thay đổi được"},400);
    if(behavior==="forbidden")return reply({detail:"Fixture: không có quyền lưu workspace"},403);
    if(behavior==="quota")return reply({detail:"Fixture: thao tác quá nhiều, thử lại sau"},429);
    const manager=managers.find(item=>item.id===body.manager_id);
    const target=row||{id:900000+workspaces.length,status:"ACTIVE",created_date:stamp,updated_at:stamp,member_count:0,project_count:0};
    Object.assign(target,body,{manager_name:manager.full_name,manager_email:manager.email});
    if(!row)workspaces.push(target);
    return reply(target,row?200:201);
   }
   if(match[1]){
    const behavior=detailMode;
    if(behavior==="slow")await new Promise(resolve=>pending.push({kind:"detail",resolve}));
    if(behavior==="error")return reply({detail:"Fixture: không mở được workspace"},503);
    return reply(behavior==="mismatch"?{...row,id:777777}:row||{},row?200:404);
   }
   const behavior=mode,q=url.searchParams.get("q")||"",page=Number(url.searchParams.get("page")||1),size=Number(url.searchParams.get("page_size")||20),sort=url.searchParams.get("sort"),status=url.searchParams.get("status");
   assert.equal(url.searchParams.has("role"),false);
   let rows=workspaces.filter(item=>(!q||(item.name+" "+item.manager_name+" "+item.manager_email).toLowerCase().includes(q.toLowerCase()))&&(!status||item.status===status));
   rows.sort((a,b)=>sort==="name"?a.name.localeCompare(b.name)||b.id-a.id:sort==="oldest"?a.id-b.id:b.id-a.id);
   const response={items:rows.slice((page-1)*size,page*size),total:rows.length,page,page_size:size};
   if(behavior==="slow"||q===delaySearch)await new Promise(resolve=>pending.push({kind:"list",resolve}));
   if(behavior==="error"||q==="old-response")return reply({detail:"Fixture: không tải được workspace"},503);
   if(behavior==="forbidden")return reply({detail:"Fixture: không có quyền"},403);
   if(behavior==="expired")return reply({detail:"Fixture: hết phiên"},401);
   if(behavior==="network")return route.abort("failed");
   if(behavior==="malformed")return reply({...response,total:null});
   if(behavior==="empty")return reply({...response,items:[],total:0});
   return reply(response);
  }
  if(p==="/vehicsim/admin/tech-references")return reply({items:[],total:0,page:1,page_size:20});
  unexpected.push(p);return reply({detail:"Unhandled fixture "+p},404);
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on("pageerror",error=>errors.push(error.message));
 const frame=page.locator("[data-admin-frame]"),region=()=>frame.getByRole("region",{name:"Bảng workspace, cuộn ngang",exact:true});
 const dialog=()=>page.getByRole("dialog",{name:/^(Thêm mới|Chỉnh sửa|Chi tiết) · Workspace$/});
 const readCount=()=>requests.filter(item=>item.path==="/vehicsim/admin/workspaces"&&item.method==="GET").length;
 const managerReads=()=>requests.filter(item=>item.path==="/vehicsim/admin/users"&&item.query.role==="MANAGER").length;
 const query=()=>Object.fromEntries(new URL(page.url()).searchParams);
 const release=kind=>{const item=pending.find(item=>item.kind===kind);assert.ok(item,"pending "+kind);pending.splice(pending.indexOf(item),1);item.resolve();};
 const shot=async name=>{await page.screenshot({path:path.join(output,name+".png"),fullPage:false});screenshots.push(name+".png");};
 const ready=async()=>{
  const params=new URL(page.url()).searchParams,q=(params.get("q")||"").trim().slice(0,100),status=["ACTIVE","ARCHIVED"].includes(params.get("status"))?params.get("status"):"",sort=["newest","oldest","name"].includes(params.get("sort"))?params.get("sort"):"newest";
  const size=[10,20,50,100].includes(Number(params.get("page_size")))?Number(params.get("page_size")):20;
  const rows=mode==="empty"?[]:workspaces.filter(item=>(!q||(item.name+" "+item.manager_name+" "+item.manager_email).toLowerCase().includes(q.toLowerCase()))&&(!status||item.status===status));
  rows.sort((a,b)=>sort==="name"?a.name.localeCompare(b.name)||b.id-a.id:sort==="oldest"?a.id-b.id:b.id-a.id);
  const raw=Number(params.get("page")||1),valid=Number.isInteger(raw)&&raw>0&&raw<=100000?raw:1,num=Math.min(valid,Math.max(1,Math.ceil(rows.length/size)));
  await page.waitForFunction(expected=>{
   const frame=document.querySelector("[data-admin-frame]"),region=frame?.querySelector('[aria-label="Bảng workspace, cuộn ngang"]');
   if(!region)return false;
   const cells=[...region.querySelectorAll("tbody tr th")],labels=[...frame.querySelectorAll("button[aria-label]")].map(button=>button.getAttribute("aria-label"));
   return labels.includes("Bỏ tìm kiếm: "+expected.q)===!!expected.q&&labels.includes("Bỏ lọc trạng thái")===!!expected.status&&frame.textContent.includes(expected.total.toLocaleString("vi-VN")+" kết quả · Trang "+expected.page+"/"+Math.max(1,Math.ceil(expected.total/expected.size)))&&cells.length===expected.ids.length&&cells.every((cell,i)=>cell.textContent.includes("ID #"+expected.ids[i]));
  },{q,status,total:rows.length,page:num,size,ids:rows.slice((num-1)*size,num*size).map(item=>item.id)});
 };
 const goto=async search=>{await page.goto(base+"/admin/workspaces"+search);await ready();};
 const search=async q=>{await frame.getByLabel("Từ khóa tìm kiếm",{exact:true}).fill(q);await frame.getByRole("button",{name:"Tìm",exact:true}).click();await ready();};
 const managersReady=async(total=121,number=1)=>{if(total>0)await dialog().getByRole("radiogroup",{name:"Kết quả tìm Manager",exact:true}).waitFor();await dialog().getByText(total+" Manager · Trang "+number+"/"+Math.max(1,Math.ceil(total/20)),{exact:true}).waitFor();};
 const searchManager=async q=>{await dialog().getByLabel("Tìm Manager theo tên/email",{exact:true}).fill(q);await dialog().getByRole("button",{name:"Tìm Manager",exact:true}).click();};
 const open=async row=>{await frame.getByRole("button",{name:(row.status==="ARCHIVED"?"Xem chi tiết workspace ":"Chỉnh sửa workspace ")+row.name,exact:true}).click();await dialog().waitFor();if(row.status!=="ARCHIVED")await managersReady();};
 const add=async()=>{await frame.getByRole("button",{name:"Thêm mới",exact:true}).click();await dialog().waitFor();await managersReady();};
 const review=async()=>{await dialog().getByRole("button",{name:"Lưu thay đổi",exact:true}).click();await dialog().getByRole("heading",{name:"Xác nhận thay đổi workspace",exact:true}).waitFor();};
 const discard=async()=>{await dialog().getByRole("button",{name:"Hủy",exact:true}).click();await dialog().getByRole("button",{name:"Bỏ thay đổi",exact:true}).click();await dialog().waitFor({state:"hidden"});};

 await page.goto(base+"/login");await page.getByLabel("Email",{exact:true}).fill(actor.email);await page.getByLabel("Mật khẩu",{exact:true}).fill("Fixture-only-123");await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();await page.waitForURL(base+"/admin/users");await goto("");
 assert.equal(await region().locator("tbody tr").count(),20);assert.equal(readCount(),1);
 assert.equal(await frame.getByRole("columnheader",{name:"Manager phụ trách",exact:true}).count(),1);
 for(const [width,height] of [[1920,1080],[1366,768],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot("list-"+width);
 }
 await region().focus();await page.keyboard.press("ArrowRight");await page.waitForFunction(()=>document.querySelector('[aria-label="Bảng workspace, cuộn ngang"]').scrollLeft>0);
 const action=await region().getByRole("button").first().boundingBox();assert.ok(action.x>=0&&action.x+action.width<=390);
 await page.setViewportSize({width:1366,height:768});
 const reads=readCount();await frame.getByLabel("Từ khóa tìm kiếm",{exact:true}).fill("  Lab  ");assert.equal(readCount(),reads);assert.equal(query().q,undefined);
 await frame.getByRole("button",{name:"Tìm",exact:true}).click();await ready();assert.equal(query().q,"Lab");
 await frame.getByRole("button",{name:"Sau",exact:true}).click();await ready();assert.equal(query().page,"2");
 await frame.getByLabel("Sắp xếp",{exact:true}).selectOption("name");await ready();assert.equal(query().page,undefined);
 await frame.getByLabel("Số dòng mỗi trang",{exact:true}).selectOption("10");await ready();assert.equal(await region().locator("tbody tr").count(),10);
 await frame.getByLabel("Trạng thái",{exact:true}).selectOption("ARCHIVED");await ready();assert.equal(await region().getByText("Hoạt động",{exact:true}).count(),0);
 const scope=page.url();await page.reload();await ready();assert.equal(page.url(),scope);
 await page.getByRole("navigation",{name:"Quản trị hệ thống",exact:true}).filter({visible:true}).getByRole("link",{name:/^Tài khoản/}).click();await frame.getByRole("region",{name:"Bảng tài khoản, cuộn ngang",exact:true}).waitFor();
 await page.goBack();await ready();assert.equal(page.url(),scope);
 await frame.getByRole("button",{name:"Bỏ lọc trạng thái",exact:true}).click();await ready();await page.goBack();await ready();assert.equal(query().status,"ARCHIVED");await page.goForward();await ready();assert.equal(query().status,undefined);
 await frame.getByRole("button",{name:"Xóa bộ lọc",exact:true}).click();await ready();assert.deepEqual(query(),{sort:"name",page_size:"10"});
 for(const size of ["50","100"]){await frame.getByLabel("Số dòng mỗi trang",{exact:true}).selectOption(size);await ready();assert.equal(await region().locator("tbody tr").count(),Math.min(61,Number(size)));}
 await search("manager-060@example.invalid");assert.equal(await region().locator("tbody tr").count(),1);
 await goto("?q=%20Lab%20&status=ROOT&role=MANAGER&sort=hack&page=-1&page_size=999");assert.deepEqual(query(),{q:"Lab"});
 await goto("?page=999");assert.equal(query().page,"4");assert.equal(await region().locator("tbody tr").count(),1);
 await goto("?q=not-present&page=999");assert.equal(query().page,undefined);await frame.getByText("Không có dữ liệu phù hợp.",{exact:true}).waitFor();await shot("empty-filtered");
 delaySearch="old-response";await frame.getByLabel("Từ khóa tìm kiếm",{exact:true}).fill("old-response");await frame.getByRole("button",{name:"Tìm",exact:true}).click();await frame.getByRole("status").filter({hasText:"Đang tải dữ liệu workspace"}).waitFor();
 await search("Lab");const late=page.waitForResponse(response=>new URL(response.url()).searchParams.get("q")==="old-response");release("list");await late;assert.equal(await frame.getByRole("alert").count(),0);delaySearch=null;
 mode="slow";await frame.getByRole("button",{name:"Làm mới danh sách",exact:true}).click();await frame.getByRole("status").filter({hasText:"Đang tải dữ liệu workspace"}).waitFor();assert.equal(await region().count(),0);await shot("list-loading");mode="normal";release("list");await ready();
 for(const behavior of ["error","forbidden","network","malformed"]){mode=behavior;await frame.getByRole("button",{name:"Làm mới danh sách",exact:true}).click();await frame.getByRole("alert").waitFor();assert.equal(await region().count(),0);await shot("list-"+behavior);mode="normal";await frame.getByRole("button",{name:"Thử lại",exact:true}).click();await ready();}
 mode="empty";await goto("");await frame.getByText("Chưa có workspace",{exact:true}).waitFor();mode="normal";await goto("");
 const archived=workspaces.find(item=>item.status==="ARCHIVED");await goto("?status=ARCHIVED");const beforeArchived=managerReads();await open(archived);assert.equal(managerReads(),beforeArchived);assert.equal(await dialog().getByRole("textbox").count(),0);assert.equal(await dialog().getByRole("button",{name:"Lưu thay đổi",exact:true}).count(),0);await shot("archived-details");await page.keyboard.press("Escape");await dialog().waitFor({state:"hidden"});assert.equal(writes.length,0);
 await goto("");await add();
 for(const [width,height] of [[1920,1080],[1366,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});const box=await dialog().boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot("create-"+width);}
 await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();await dialog().getByText("Vui lòng nhập tên workspace.",{exact:true}).waitFor();assert.equal(writes.length,0);
 await dialog().getByLabel("Tên workspace *",{exact:true}).fill("  New workspace fixture  ");await dialog().getByLabel("Mô tả",{exact:true}).fill("  Mô tả mới  ");
 await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();await dialog().getByText("Chọn một Manager đang hoạt động.",{exact:true}).waitFor();
 for(let number=2;number<=7;number++){await dialog().getByRole("button",{name:"Manager sau",exact:true}).click();await managersReady(121,number);}
 assert.equal(await dialog().getByRole("radio").count(),1);await dialog().getByRole("radio").check();await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();await dialog().getByRole("heading",{name:"Xác nhận tạo workspace",exact:true}).waitFor();await shot("create-review-390");assert.equal(writes.length,0);
 await page.keyboard.press("Escape");await dialog().getByLabel("Tên workspace *",{exact:true}).waitFor();await page.keyboard.press("Escape");await dialog().getByRole("heading",{name:"Bỏ thay đổi chưa lưu?",exact:true}).waitFor();await dialog().getByRole("button",{name:"Tiếp tục chỉnh sửa",exact:true}).click();
 assert.equal(await dialog().getByLabel("Tên workspace *",{exact:true}).inputValue(),"  New workspace fixture  ");await dialog().getByLabel("Manager đang chọn",{exact:true}).filter({hasText:"manager-120@"}).waitFor();
 await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();await dialog().getByRole("button",{name:"Xác nhận tạo",exact:true}).click();await dialog().getByRole("alert").filter({hasText:"Tên workspace đã được sử dụng"}).waitFor();assert.equal(await dialog().getByLabel("Mô tả",{exact:true}).inputValue(),"  Mô tả mới  ");assert.equal(workspaces.length,61);await shot("create-error-390");
 saveMode="slow";await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();const beforeCreate=writes.length;await dialog().getByRole("button",{name:"Xác nhận tạo",exact:true}).evaluate(button=>{button.click();button.click();});await dialog().getByRole("button",{name:"Đang lưu…",exact:true}).waitFor();assert.equal(writes.length,beforeCreate+1);await page.keyboard.press("Escape");assert.equal(await dialog().isVisible(),true);assert.equal(await dialog().getByRole("button",{name:"Đóng biểu mẫu",exact:true}).isDisabled(),true);release("save");await dialog().waitFor({state:"hidden"});await ready();
 assert.deepEqual(writes.at(-1).body,{name:"New workspace fixture",description:"Mô tả mới",manager_id:1120});assert.equal(writes.at(-1).method,"POST");
 await page.setViewportSize({width:1366,height:768});const target=workspaces[0];await open(target);assert.equal(await dialog().getByRole("button",{name:"Lưu thay đổi",exact:true}).isDisabled(),true);await shot("edit-details-1366");
 for(let i=0;i<30;i++){await page.keyboard.press("Tab");assert.equal(await dialog().evaluate(element=>element.contains(document.activeElement)),true);}await page.keyboard.press("Shift+Tab");assert.equal(await dialog().evaluate(element=>element.contains(document.activeElement)),true);
 await dialog().getByLabel("Tên workspace *",{exact:true}).fill("Tên đã đổi");await review();assert.equal(await dialog().getByLabel("Ảnh hưởng khi giao Manager",{exact:true}).count(),0);await dialog().getByText("Manager phụ trách giữ nguyên; thay đổi tên hoặc mô tả không gửi thông báo giao workspace.",{exact:true}).waitFor();
 await dialog().getByRole("button",{name:"Quay lại",exact:true}).click();await discard();assert.equal(await frame.getByRole("button",{name:"Chỉnh sửa workspace "+target.name,exact:true}).evaluate(element=>element===document.activeElement),true);
 await goto("?q=manager-000%40example.invalid&status=ACTIVE&sort=name&page_size=10");await open(target);const selected=await dialog().getByLabel("Manager đang chọn",{exact:true}).innerText();
 delayManager="old-managers";await searchManager("old-managers");await dialog().getByRole("status").filter({hasText:"Đang tải Manager"}).waitFor();await searchManager("120");await managersReady(1);
 const oldManager=page.waitForResponse(response=>new URL(response.url()).searchParams.get("q")==="old-managers");release("manager");await oldManager;assert.equal(await dialog().getByRole("alert").count(),0);assert.equal(await dialog().getByLabel("Manager đang chọn",{exact:true}).innerText(),selected);delayManager=null;
 managerMode="slow";await searchManager("");await dialog().getByRole("status").filter({hasText:"Đang tải Manager"}).waitFor();assert.equal(await dialog().getByRole("radio").count(),0);assert.equal(await dialog().getByRole("button",{name:"Lưu thay đổi",exact:true}).isDisabled(),true);managerMode="normal";release("manager");await managersReady();
 for(const behavior of ["error","forbidden","network","malformed"]){managerMode=behavior;await searchManager("");await dialog().getByRole("alert").waitFor();assert.equal(await dialog().getByRole("radio").count(),0);assert.equal(await dialog().getByLabel("Manager đang chọn",{exact:true}).innerText(),selected);managerMode="normal";await dialog().getByRole("button",{name:"Thử tải lại Manager",exact:true}).click();await managersReady();}
 await searchManager("not-present");await managersReady(0);await dialog().getByRole("status").filter({hasText:"Không có Manager phù hợp"}).waitFor();assert.equal(await dialog().getByLabel("Manager đang chọn",{exact:true}).innerText(),selected);
 await searchManager("120");await managersReady(1);await dialog().getByRole("radio").check();await review();await dialog().getByLabel("Ảnh hưởng khi giao Manager",{exact:true}).filter({hasText:"sẽ nhận thông báo"}).waitFor();const reviewText=await dialog().getByRole("region",{name:"Nội dung xác nhận workspace",exact:true}).innerText();assert.ok(reviewText.includes("manager-000@")&&reviewText.includes("manager-120@"));await shot("reassign-review-1366");await page.setViewportSize({width:390,height:844});await shot("reassign-review-390");
 for(const behavior of ["manager","archived","forbidden","quota","network"]){saveMode=behavior;await dialog().getByRole("button",{name:"Xác nhận lưu",exact:true}).click();await dialog().getByRole("alert").waitFor();assert.equal(target.manager_id,1000);await dialog().getByLabel("Manager đang chọn",{exact:true}).filter({hasText:"manager-120@"}).waitFor();await review();}
 saveMode="success";const beforeSave=writes.length,scoped=page.url();await dialog().getByRole("button",{name:"Xác nhận lưu",exact:true}).click();await dialog().waitFor({state:"hidden"});await ready();assert.equal(page.url(),scoped);assert.equal(await region().locator("tbody tr").count(),0);await frame.getByText("Không có dữ liệu phù hợp.",{exact:true}).waitFor();assert.equal(writes.length,beforeSave+1);assert.equal(target.manager_id,1120);assert.equal(writes.at(-1).method,"PUT");assert.deepEqual(Object.keys(writes.at(-1).body).sort(),["description","manager_id","name"]);assert.equal(target.member_count,2);assert.equal(target.project_count,0);
 await goto("");await page.setViewportSize({width:1366,height:768});detailMode="error";await frame.getByRole("button",{name:"Chỉnh sửa workspace "+target.name,exact:true}).click();await frame.getByRole("alert").filter({hasText:"không mở được"}).waitFor();assert.equal(await dialog().count(),0);
 detailMode="mismatch";await frame.getByRole("button",{name:"Chỉnh sửa workspace "+target.name,exact:true}).click();await frame.getByRole("alert").filter({hasText:"không khớp"}).waitFor();assert.equal(await dialog().count(),0);
 detailMode="slow";await frame.getByRole("button",{name:"Chỉnh sửa workspace "+target.name,exact:true}).click();assert.equal(await frame.getByRole("button",{name:"Thêm mới",exact:true}).isDisabled(),true);await frame.getByLabel("Trạng thái",{exact:true}).selectOption("ARCHIVED");await ready();
 const lateDetail=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/workspaces/"+target.id));release("detail");await lateDetail;assert.equal(await dialog().count(),0);detailMode="normal";
 for(const nextRole of ["MANAGER","ENGINEER","REVIEWER","EXPERIENCER"]){role=nextRole;const before=readCount();await page.goto(base+"/admin/workspaces");await page.getByRole("heading",{name:"Quyền Hạn Không Đủ",exact:true}).waitFor();assert.equal(readCount(),before);}
 role="ADMIN";mode="expired";await page.goto(base+"/admin/workspaces");await page.waitForURL(base+"/login");assert.equal(await page.evaluate(()=>localStorage.getItem("vehicsim_access_token")),null);const beforeGuest=readCount();await page.goto(base+"/admin/workspaces");await page.waitForURL(base+"/login");assert.equal(readCount(),beforeGuest);
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",screenshots,checks:["actual server workspace/Manager name/email search, status, name sort, page sizes, URL/reload/Back/Forward and clamp","four viewport bounds, scroll region keyboard/sticky actions","list loading/empty/503/403/network/malformed/retry and stale error isolation","archived read-only details, no Manager fetch or mutation","create validation/trim/null shape/review/409 preservation and Manager beyond first 100","dirty Escape/keep/discard, focus return, Tab trap, busy Escape/ref double-submit lock","Manager paging/search/selection outside results; loading/error/empty/malformed and stale isolation","reassignment before/after; notifications only create/Manager change; no membership/project mutation","server invalid Manager/archive/403/429/network retain draft; confirmed success/refetch full PUT","wrong/late detail rejected; Add disabled; nonAdmin roles denied; 401/guest"],fixtureWriteCount:writes.length,liveBackendVerified:false,figmaVerified:false},null,2));
 console.log("PASS workspace batch 5: "+screenshots.length+" screenshots; browser HTTP fixtures only. Live backend/auth/DB/Figma NOT verified.");
}finally{for(const item of pending)item.resolve();await browser.close();}
