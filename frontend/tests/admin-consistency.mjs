/** Batch 8: HTTP fixtures only. No live backend/auth/DB/CARLA/Figma. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),output=path.resolve(root,process.env.ADMIN_UI_OUTPUT||"data/admin-batch8-ui");
await fs.mkdir(output,{recursive:true});
const base=process.env.ADMIN_UI_URL||"http://localhost:3100",stamp="2026-11-04T08:30:00";
const actor={id:999999,email:"admin-consistency@example.invalid",full_name:"Admin Fixture",last_name:"Admin",first_name:"Fixture",role:"ADMIN",is_active:true};
const kinds=["CONSTANT","PRINCIPLE","THEORY","DEFINITION","UNIT","STANDARD"],exact="123456789012345678.123456789012";
const records=Array.from({length:61},(_,i)=>({id:i===0?888888:400+i,ref_code:"REF-"+String(i).padStart(3,"0"),ref_name:i===0?"Tài liệu với tên dài để kiểm tra bảng và hộp thoại trên màn hình nhỏ":"Tài liệu "+String(i).padStart(3,"0"),ref_type:kinds[i%6],ref_value:i%6===0?exact:null,unit:"m/s²",description:i===0?"Mô tả ban đầu":null,source_type:"Journal",source_title:"Nguồn fixture",author:"Author",organization:"Organization",publication_year:2026,page:"1–5",url:"https://example.invalid/source",doi:"10.0000/fixture",is_active:i%3!==1,updated_at:i===60?null:stamp}));
let role="ADMIN",mode="normal",detailMode="normal",saveMode="reject",delaySearch=null;
const requests=[],writes=[],pending=[],errors=[],unexpected=[],screenshots=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
try{
 const context=await browser.newContext({viewport:{width:1366,height:768}});
 await context.route("**/api/v1/**",async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname.replace("/api/v1","");
  const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body),headers:{"Access-Control-Allow-Origin":"*"}});
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"GET,POST,PUT,OPTIONS"}});
  requests.push({method:req.method(),path:p,query:Object.fromEntries(url.searchParams)});
  if(p==="/auth/login")return reply({access_token:"admin-consistency-fixture-only",token_type:"bearer",expires_in:3600,user:{...actor,role}});
  if(p==="/auth/me")return reply({...actor,role});
  if(p==="/vehicsim/projects")return reply({items:[],total:0,page:1,page_size:20,active_count:0,archived_count:0});
  if(p==="/vehicsim/context")return reply({project:{id:1,name:"Fixture"},workspace:null,vehicle:{id:1,name:"Fixture"},system:{id:1,baseline:null},versions:[],families:[],parameters:[],reviewer_projects:[],reviewer_can_decide:false});
  if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
  if(p==="/vehicsim/admin/users")return reply({items:[{...actor,role:url.searchParams.get("role")||"ADMIN"}],total:1,page:1,page_size:Number(url.searchParams.get("page_size")||20)});
  if(p==="/vehicsim/admin/workspaces")return reply({items:[],total:0,page:1,page_size:Number(url.searchParams.get("page_size")||20)});
  const match=p.match(new RegExp("^/vehicsim/admin/tech-references(?:/([0-9]+))?$"));
  if(match){
   const row=records.find(item=>item.id===Number(match[1]));
   if(req.method()!=="GET"){
    const body=req.postDataJSON(),behavior=saveMode;writes.push({method:req.method(),path:p,body});
    if(behavior==="slow")await new Promise(resolve=>pending.push({kind:"save",resolve}));
    if(behavior==="network")return route.abort("failed");
    if(behavior==="reject")return reply({detail:"Fixture: mã hoặc tên tài liệu đã được sử dụng"},409);
    if(behavior==="invalid")return reply({detail:"Fixture: giá trị số tối đa 18 chữ số nguyên và 12 chữ số thập phân"},400);
    if(behavior==="forbidden")return reply({detail:"Fixture: không có quyền lưu"},403);
    if(behavior==="quota")return reply({detail:"Fixture: thao tác quá nhiều, thử lại sau"},429);
    const target=row||{id:900000+records.length,updated_at:stamp};Object.assign(target,body);if(!row)records.push(target);
    return reply(target,row?200:201);
   }
   if(match[1]){
    const behavior=detailMode;if(behavior==="slow")await new Promise(resolve=>pending.push({kind:"detail",resolve}));
    if(behavior==="error")return reply({detail:"Fixture: không mở được tài liệu"},503);
    return reply(behavior==="mismatch"?{...row,id:777777}:row||{},row?200:404);
   }
   const q=url.searchParams.get("q")||"",kind=url.searchParams.get("role"),status=url.searchParams.get("status"),sort=url.searchParams.get("sort"),number=Number(url.searchParams.get("page")||1),size=Number(url.searchParams.get("page_size")||20),behavior=mode;
   const rows=records.filter(item=>(!q||(item.ref_code+" "+item.ref_name).toLowerCase().includes(q.toLowerCase()))&&(!kind||item.ref_type===kind)&&(!status||item.is_active===(status==="ACTIVE")));
   rows.sort((a,b)=>sort==="name"?a.ref_name.localeCompare(b.ref_name)||b.id-a.id:sort==="oldest"?a.id-b.id:b.id-a.id);
   const data={items:rows.slice((number-1)*size,number*size),total:rows.length,page:number,page_size:size};
   if(behavior==="slow"||q===delaySearch)await new Promise(resolve=>pending.push({kind:"list",resolve}));
   if(behavior==="error"||q==="old-response")return reply({detail:"Fixture: không tải được tài liệu"},503);
   if(behavior==="forbidden")return reply({detail:"Fixture: không có quyền"},403);
   if(behavior==="network")return route.abort("failed");
   if(behavior==="expired")return reply({detail:"Fixture: hết phiên"},401);
   if(behavior==="malformed")return reply({...data,total:null});
   if(behavior==="empty")return reply({...data,items:[],total:0});
   return reply(data);
  }
  unexpected.push(p);return reply({detail:"Unhandled "+p},404);
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on("pageerror",error=>errors.push(error.message));
 const frame=page.locator("[data-admin-frame]"),region=()=>frame.getByRole("region",{name:"Bảng tài liệu kỹ thuật, cuộn ngang",exact:true}),dialog=()=>page.getByRole("dialog",{name:/^(Thêm mới|Chỉnh sửa) · Tài liệu kỹ thuật$/});
 const readCount=()=>requests.filter(item=>item.path==="/vehicsim/admin/tech-references"&&item.method==="GET").length;
 const query=()=>Object.fromEntries(new URL(page.url()).searchParams),release=kind=>{const item=pending.find(item=>item.kind===kind);assert.ok(item);pending.splice(pending.indexOf(item),1);item.resolve();};
 const shot=async name=>{await page.screenshot({path:path.join(output,name+".png"),fullPage:false});screenshots.push(name+".png");};
 const ready=async()=>{
  const params=new URL(page.url()).searchParams,q=(params.get("q")||"").trim().slice(0,100),kind=kinds.includes(params.get("role"))?params.get("role"):"",status=["ACTIVE","INACTIVE"].includes(params.get("status"))?params.get("status"):"",sort=["newest","oldest","name"].includes(params.get("sort"))?params.get("sort"):"newest",size=[10,20,50,100].includes(Number(params.get("page_size")))?Number(params.get("page_size")):20;
  const rows=mode==="empty"?[]:records.filter(item=>(!q||(item.ref_code+" "+item.ref_name).toLowerCase().includes(q.toLowerCase()))&&(!kind||item.ref_type===kind)&&(!status||item.is_active===(status==="ACTIVE")));
  rows.sort((a,b)=>sort==="name"?a.ref_name.localeCompare(b.ref_name)||b.id-a.id:sort==="oldest"?a.id-b.id:b.id-a.id);
  const raw=Number(params.get("page")||1),valid=Number.isInteger(raw)&&raw>0&&raw<=100000?raw:1,number=Math.min(valid,Math.max(1,Math.ceil(rows.length/size)));
  await page.waitForFunction(expected=>{
   const frame=document.querySelector("[data-admin-frame]"),region=frame?.querySelector('[aria-label="Bảng tài liệu kỹ thuật, cuộn ngang"]');if(!region)return false;
   const cells=[...region.querySelectorAll("tbody tr th")],labels=[...frame.querySelectorAll("button[aria-label]")].map(button=>button.getAttribute("aria-label"));
   return labels.includes("Bỏ tìm kiếm: "+expected.q)===!!expected.q&&labels.includes("Bỏ lọc loại")===!!expected.kind&&labels.includes("Bỏ lọc trạng thái")===!!expected.status&&frame.textContent.includes(expected.total.toLocaleString("vi-VN")+" kết quả · Trang "+expected.page+"/"+Math.max(1,Math.ceil(expected.total/expected.size)))&&cells.length===expected.ids.length&&cells.every((cell,i)=>cell.textContent.includes("ID #"+expected.ids[i]));
  },{q,kind,status,total:rows.length,page:number,size,ids:rows.slice((number-1)*size,number*size).map(item=>item.id)});
 };
 const goto=async search=>{await page.goto(base+"/admin/tech-references"+search);await ready();};
 const search=async q=>{await frame.getByLabel("Từ khóa tìm kiếm",{exact:true}).fill(q);await frame.getByRole("button",{name:"Tìm",exact:true}).click();await ready();};
 const open=async row=>{await frame.getByRole("button",{name:"Chỉnh sửa tài liệu "+row.ref_code,exact:true}).click();await dialog().waitFor();};
 const review=async()=>{await dialog().getByRole("button",{name:"Lưu thay đổi",exact:true}).click();await dialog().getByRole("heading",{name:"Xác nhận thay đổi tài liệu",exact:true}).waitFor();};
 const discard=async()=>{await dialog().getByRole("button",{name:"Hủy",exact:true}).click();await dialog().getByRole("button",{name:"Bỏ thay đổi",exact:true}).click();await dialog().waitFor({state:"hidden"});};
 await page.goto(base+"/login");await page.getByLabel("Email",{exact:true}).fill(actor.email);await page.getByLabel("Mật khẩu",{exact:true}).fill("Fixture-browser-only-12");await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();await page.waitForURL(base+"/admin/users");await goto("");
 assert.equal(await region().locator("tbody tr").count(),20);assert.equal(await region().getByText(exact,{exact:true}).count()>0,true);
 const focusTheme=await frame.evaluate(element=>{const css=getComputedStyle(element);return {admin:css.getPropertyValue("--admin-focus").trim(),shared:css.getPropertyValue("--color-vehicsim-primary").trim()};});assert.notEqual(focusTheme.shared,"");assert.equal(focusTheme.admin,focusTheme.shared,"Admin focus follows the shared theme");
 for(const [width,height] of [[1920,1080],[1366,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot("references-"+width);}
 await region().focus();await page.keyboard.press("ArrowRight");await page.waitForFunction(()=>document.querySelector('[aria-label="Bảng tài liệu kỹ thuật, cuộn ngang"]').scrollLeft>0);
 const bounds=await region().getByRole("button").first().boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);await page.setViewportSize({width:1366,height:768});
 const reads=readCount();await frame.getByLabel("Từ khóa tìm kiếm",{exact:true}).fill("  REF  ");assert.equal(readCount(),reads);await frame.getByRole("button",{name:"Tìm",exact:true}).click();await ready();assert.equal(query().q,"REF");
 await frame.getByRole("button",{name:"Sau",exact:true}).click();await ready();assert.equal(query().page,"2");await frame.getByLabel("Sắp xếp",{exact:true}).selectOption("name");await ready();assert.equal(query().page,undefined);
 for(const size of ["10","50","100"]){await frame.getByLabel("Số dòng mỗi trang",{exact:true}).selectOption(size);await ready();assert.equal(await region().locator("tbody tr").count(),Math.min(Number(size),61));}
 await frame.getByLabel("Loại",{exact:true}).selectOption("CONSTANT");await ready();await frame.getByLabel("Trạng thái",{exact:true}).selectOption("ACTIVE");await ready();
 const scope=page.url();await page.reload();await ready();assert.equal(page.url(),scope);
 await page.goto(base+"/admin/workspaces?status=ARCHIVED");await frame.getByRole("region",{name:"Bảng workspace, cuộn ngang",exact:true}).waitFor();await page.goBack();await ready();assert.equal(page.url(),scope);
 await page.goto(base+"/admin/users?role=ENGINEER&status=ACTIVE");await frame.getByRole("region",{name:"Bảng tài khoản, cuộn ngang",exact:true}).waitFor();await page.goBack();await ready();assert.equal(page.url(),scope);
 await frame.getByRole("button",{name:"Bỏ lọc loại",exact:true}).click();await ready();await page.goBack();await ready();assert.equal(query().role,"CONSTANT");await page.goForward();await ready();
 await goto("?q=%20REF%20&role=constructor&status=hack&sort=bad&page=-1&page_size=999");assert.deepEqual(query(),{q:"REF"});
 await goto("?page=999");assert.equal(query().page,"4");await goto("?q=missing&page=999");assert.equal(query().page,undefined);await frame.getByText("Không có dữ liệu phù hợp.",{exact:true}).waitFor();
 delaySearch="old-response";await frame.getByLabel("Từ khóa tìm kiếm",{exact:true}).fill("old-response");await frame.getByRole("button",{name:"Tìm",exact:true}).click();await frame.getByRole("status").filter({hasText:"Đang tải dữ liệu tài liệu"}).waitFor();await search("REF");const late=page.waitForResponse(response=>new URL(response.url()).searchParams.get("q")==="old-response");release("list");await late;assert.equal(await frame.getByRole("alert").count(),0);delaySearch=null;
 for(const behavior of ["error","forbidden","network","malformed"]){mode=behavior;await frame.getByRole("button",{name:"Làm mới danh sách",exact:true}).click();await frame.getByRole("alert").waitFor();assert.equal(await region().count(),0);await shot("list-"+behavior);mode="normal";await frame.getByRole("button",{name:"Thử lại",exact:true}).click();await ready();}
 mode="empty";await goto("");await frame.getByText("Chưa có tài liệu kỹ thuật",{exact:true}).waitFor();mode="normal";await goto("");
 await frame.getByRole("button",{name:"Thêm mới",exact:true}).click();await dialog().waitFor();assert.equal(await dialog().getByLabel("Loại *",{exact:true}).inputValue(),"PRINCIPLE");
 for(const [width,height] of [[1366,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});const box=await dialog().boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);await shot("reference-form-"+width);}
 await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();await dialog().getByText("Vui lòng nhập mã.",{exact:true}).waitFor();assert.equal(writes.length,0);
 await dialog().getByLabel("Mã *",{exact:true}).fill("  REF-NEW  ");await dialog().getByLabel("Tên *",{exact:true}).fill("  Tài liệu fixture  ");await dialog().getByLabel("Loại *",{exact:true}).selectOption("CONSTANT");
 await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();await dialog().getByText("Nhập giá trị số hợp lệ cho hằng số.",{exact:true}).waitFor();
 const inputs={"Giá trị hằng số *":exact,"Đơn vị":" m/s² ","Mô tả":" Mô tả mới ","Loại nguồn":" Journal ","Tên nguồn":" Nguồn mới ","Tác giả":" Author ","Tổ chức":" Organization ","Năm xuất bản":"2026","Trang":" 1–5 ","Đường dẫn nguồn":"https://example.invalid/new","DOI":" 10.0000/new "};
 for(const [label,value] of Object.entries(inputs))await dialog().getByLabel(label,{exact:true}).fill(value);
 await dialog().getByLabel("Đường dẫn nguồn",{exact:true}).fill("ftp://example.invalid/new");await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();await dialog().getByText("URL phải là địa chỉ http hoặc https hợp lệ.",{exact:true}).waitFor();await dialog().getByLabel("Đường dẫn nguồn",{exact:true}).fill(inputs["Đường dẫn nguồn"]);
 await dialog().getByLabel("Năm xuất bản",{exact:true}).fill("10000");await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();await dialog().getByText("Năm xuất bản là số nguyên từ 1 đến 9999.",{exact:true}).waitFor();await dialog().getByLabel("Năm xuất bản",{exact:true}).fill("2026");
 await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();await dialog().getByRole("region",{name:"Nội dung xác nhận tài liệu",exact:true}).waitFor();assert.ok((await dialog().innerText()).includes(exact));await shot("create-review-390");
 await page.keyboard.press("Escape");await page.keyboard.press("Escape");await dialog().getByRole("heading",{name:"Bỏ thay đổi chưa lưu?",exact:true}).waitFor();await dialog().getByRole("button",{name:"Tiếp tục chỉnh sửa",exact:true}).click();assert.equal(await dialog().getByLabel("Giá trị hằng số *",{exact:true}).inputValue(),exact);
 await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();await dialog().getByRole("button",{name:"Xác nhận tạo",exact:true}).click();await dialog().getByRole("alert").filter({hasText:"đã được sử dụng"}).waitFor();assert.equal(records.length,61);assert.equal(await dialog().getByLabel("Giá trị hằng số *",{exact:true}).inputValue(),exact);await shot("create-error-390");
 saveMode="slow";await dialog().getByRole("button",{name:"Tạo mới",exact:true}).click();const beforeCreate=writes.length;await dialog().getByRole("button",{name:"Xác nhận tạo",exact:true}).evaluate(button=>{button.click();button.click();});await dialog().getByRole("button",{name:"Đang lưu…",exact:true}).waitFor();assert.equal(writes.length,beforeCreate+1);await page.keyboard.press("Escape");assert.equal(await dialog().isVisible(),true);assert.equal(await dialog().getAttribute("aria-busy"),"true");release("save");await dialog().waitFor({state:"hidden"});await ready();
 const creation=writes.at(-1);assert.equal(creation.method,"POST");assert.equal(creation.body.ref_value,exact);assert.equal(typeof creation.body.ref_value,"string");assert.equal(creation.body.ref_code,"REF-NEW");assert.equal(creation.body.ref_name,"Tài liệu fixture");assert.equal(creation.body.publication_year,2026);assert.equal(creation.body.is_active,true);assert.equal(Object.keys(creation.body).length,15);
 for(const [label,key] of [["Loại nguồn","source_type"],["Tên nguồn","source_title"],["Tác giả","author"],["Tổ chức","organization"],["Trang","page"],["Đường dẫn nguồn","url"],["DOI","doi"]])assert.equal(creation.body[key],inputs[label].trim());
 await page.setViewportSize({width:1366,height:768});const target=records[0];await goto("?role=CONSTANT&status=ACTIVE");await open(target);assert.equal(await dialog().getByRole("button",{name:"Lưu thay đổi",exact:true}).isDisabled(),true);
 for(let i=0;i<25;i++){await page.keyboard.press("Tab");assert.equal(await dialog().evaluate(element=>element.contains(document.activeElement)),true);}await page.keyboard.press("Shift+Tab");assert.equal(await dialog().evaluate(element=>element.contains(document.activeElement)),true);
 await dialog().getByLabel("Giá trị hằng số *",{exact:true}).fill("1e3");await review();assert.ok((await dialog().innerText()).includes("1e3"));await dialog().getByRole("button",{name:"Quay lại",exact:true}).click();await discard();assert.equal(await frame.getByRole("button",{name:"Chỉnh sửa tài liệu "+target.ref_code,exact:true}).evaluate(element=>element===document.activeElement),true);
 await open(target);await dialog().getByLabel("Giá trị hằng số *",{exact:true}).fill("0");await review();
 for(const behavior of ["invalid","forbidden","quota","network"]){saveMode=behavior;await dialog().getByRole("button",{name:"Xác nhận lưu",exact:true}).click();await dialog().getByRole("alert").waitFor();assert.equal(target.ref_value,exact);assert.equal(writes.at(-1).body.ref_value,"0");assert.equal(await dialog().getByLabel("Giá trị hằng số *",{exact:true}).inputValue(),"0");await review();}
 await dialog().getByRole("button",{name:"Quay lại",exact:true}).click();await dialog().getByLabel("Loại *",{exact:true}).selectOption("STANDARD");assert.equal(await dialog().getByLabel("Giá trị hằng số",{exact:true}).isDisabled(),true);await dialog().getByLabel("Tài liệu đang bật",{exact:true}).uncheck();await review();await dialog().getByText("Tài liệu sẽ được tắt sau khi lưu thành công; bản ghi vẫn được giữ lại.",{exact:true}).waitFor();await shot("disable-review-1366");await page.setViewportSize({width:390,height:844});await shot("disable-review-390");
 saveMode="success";const scoped=page.url();await dialog().getByRole("button",{name:"Xác nhận lưu",exact:true}).click();await dialog().waitFor({state:"hidden"});await ready();assert.equal(page.url(),scoped);assert.equal(writes.at(-1).method,"PUT");assert.equal(writes.at(-1).body.ref_value,null);assert.equal(target.is_active,false);assert.equal(await frame.getByRole("button",{name:"Chỉnh sửa tài liệu "+target.ref_code,exact:true}).count(),0);
 await goto("");await page.setViewportSize({width:1366,height:768});detailMode="mismatch";await frame.getByRole("button",{name:"Chỉnh sửa tài liệu "+target.ref_code,exact:true}).click();await frame.getByRole("alert").filter({hasText:"không khớp"}).waitFor();assert.equal(await dialog().count(),0);
 detailMode="slow";await frame.getByRole("button",{name:"Chỉnh sửa tài liệu "+target.ref_code,exact:true}).click();assert.equal(await frame.getByRole("button",{name:"Thêm mới",exact:true}).isDisabled(),true);await frame.getByLabel("Loại",{exact:true}).selectOption("THEORY");await ready();const detail=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/tech-references/"+target.id));release("detail");await detail;assert.equal(await dialog().count(),0);
 for(const nextRole of ["MANAGER","ENGINEER","REVIEWER","EXPERIENCER"]){role=nextRole;const before=readCount();await page.goto(base+"/admin/tech-references");await page.getByRole("heading",{name:"Trang này yêu cầu quyền truy cập",exact:true}).waitFor();assert.equal(readCount(),before);}
 role="ADMIN";mode="expired";await page.goto(base+"/admin/tech-references");await page.waitForURL(base+"/login");assert.equal(await page.evaluate(()=>localStorage.getItem("vehicsim_access_token")),null);const before=readCount();await page.goto(base+"/admin/tech-references");await page.waitForURL(base+"/login");assert.equal(readCount(),before);
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",screenshots,checks:["shared scoped tokens; desktop/tablet/mobile and named scroll/sticky actions","server q/type/status/name sort/page sizes; canonical URL/page clamp/reload/Back/Forward across three resource scopes","no stale rows/actions on error/malformed/retry; late errors/detail ignored","all 14 fields retained, normalized 15-key payload; exact 18+12 decimal string, zero, scientific review and non-CONSTANT null","URL/year/required/numeric validation; create/update review and on/off consequence","dirty Escape/keep/discard, Tab/ShiftTab/focus return, busy Escape and ref double-submit lock","409/400/403/429/network preserve fields; only server success refetches same query and removes filtered row","four denied roles, 401/guest; no real API writes"],fixtureWriteCount:writes.length,liveBackendVerified:false,figmaVerified:false},null,2));
 console.log("PASS Admin consistency: "+screenshots.length+" screenshots; HTTP fixtures only. Live backend/auth/DB/Figma NOT verified.");
}finally{for(const item of pending)item.resolve();await browser.close();}
