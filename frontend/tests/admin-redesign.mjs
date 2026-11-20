/** Admin layout regression with browser-only HTTP fixtures; no live auth/backend/DB/Figma. */
import { chromium } from "playwright";
import { browserOptions, captureScreenshot } from "./admin-test-utils.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.resolve(root, process.env.ADMIN_UI_OUTPUT || "data/admin-batch1-ui");
await fs.mkdir(output, { recursive: true });
const base = process.env.ADMIN_UI_URL || "http://localhost:3100";
const viewports = [[1920,1080],[1440,900],[1366,768],[1024,768],[768,1024],[390,844],[375,812]];
const shortViewports = [[320,256],[667,375],[1280,480]];
const sections = [["users","Tài khoản"],["workspaces","Workspace"],["tech-references","Tài liệu kỹ thuật"]];
const actor = { id:999999,email:"admin-ui@example.invalid",full_name:"Quản trị UI Fixture",role:"ADMIN" };
const stamp = "2026-11-04T08:00:00";
const user = {id:101,full_name:"Nguyễn Kiểm Thử",email:"user-ui@example.invalid",last_name:"Nguyễn",middle_name:"Kiểm",first_name:"Thử",role:"ENGINEER",is_active:true,created_date:stamp};
const workspace = {id:201,name:"Workspace kiểm thử giao diện",description:"Fixture",manager_id:301,manager_name:"Manager Fixture",manager_email:"manager-ui@example.invalid",member_count:3,project_count:2,status:"ACTIVE",created_date:stamp};
const reference = {id:401,ref_code:"UI-REF-001",ref_name:"Hằng số kiểm thử giao diện",ref_type:"CONSTANT",ref_value:"123456789012345678.123456789012",unit:"m/s²",is_active:true,updated_at:stamp};
let role="ADMIN",mode="normal";
const requests=[],writes=[],unexpected=[],errors=[],screenshots=[];
const backgroundIssues=[];
const pendingLists=[];
const browser=await chromium.launch(browserOptions());
try {
  const context=await browser.newContext({viewport:{width:1366,height:768}});
  await context.route("**/api/v1/**",async route=>{
    const req=route.request(),url=new URL(req.url()),p=url.pathname.replace("/api/v1","");
    const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body),headers:{"Access-Control-Allow-Origin":"*"}});
    if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"GET,POST,PUT,OPTIONS"}});
    requests.push({path:p,method:req.method(),query:Object.fromEntries(url.searchParams)});
    if(p==="/auth/login")return reply({access_token:"admin-browser-fixture-token",token_type:"bearer",expires_in:3600,user:{...actor,role}});
    if(p==="/auth/me")return reply({...actor,role});
    if(p==="/vehicsim/context")return reply({project:{id:999999,name:"UI Fixture"},workspace:null,vehicle:{id:1,name:"Audi e-tron"},system:{id:1,name:"AEB",baseline:null},versions:[],families:[],parameters:[],reviewer_projects:[],reviewer_can_decide:false});
    if(p==="/vehicsim/projects")return reply({items:[],total:0,page:1,page_size:20,active_count:0,archived_count:0});
    if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
    if(p.startsWith("/vehicsim/admin/")){
      if(req.method()!=="GET"){
        writes.push({path:p,method:req.method(),body:req.postDataJSON()});
        return reply({detail:"Fixture: không lưu được thay đổi. Dữ liệu nhập được giữ lại."},409);
      }
      const match=p.match(/^\/vehicsim\/admin\/(users|workspaces|tech-references)(?:\/(\d+))?$/);
      if(!match){unexpected.push(p);return reply({detail:"Unknown fixture"},404);}
      const resource=match[1],id=match[2];
      const row=resource==="users"?user:resource==="workspaces"?workspace:reference;
      if(id)return reply({...row,id:Number(id)});
      if(mode==="expired")return reply({detail:"Fixture: phiên đã hết hạn"},401);
      if(mode==="forbidden")return reply({detail:"Fixture: không có quyền"},403);
      if(mode==="error")return reply({detail:"Fixture: không tải được dữ liệu"},503);
      if(mode==="slow")await new Promise(resolve=>pendingLists.push(resolve));
      const page=Number(url.searchParams.get("page")||1);
      if(resource==="users"&&url.searchParams.get("role")==="MANAGER")return reply({items:[{...user,id:workspace.manager_id,full_name:workspace.manager_name,email:workspace.manager_email,role:"MANAGER"}],total:1,page,page_size:20});
      const items=mode==="empty"?[]:resource==="users"?Array.from({length:4},(_,i)=>({...row,id:row.id+i+(page-1)*20,full_name:i===1?"Tên tài khoản dài để kiểm tra bố cục và khoảng cách trong bảng":row.full_name,email:i===1?"email-very-long-for-layout-checks-ui-fixture-only@example.invalid":row.email})):resource==="workspaces"?[row,{...row,id:202,name:"Workspace lưu trữ",status:"ARCHIVED"}]:[row,{...row,id:402,ref_code:"UI-REF-002",ref_name:"Tiêu chuẩn kiểm thử",ref_type:"STANDARD",ref_value:null,is_active:false}];
      return reply({items,total:mode==="empty"?0:resource==="users"?24:items.length,page,page_size:20});
    }
    unexpected.push(p);return reply({detail:`Unhandled fixture ${p}`},404);
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on("pageerror",err=>errors.push(err.message));
  const frame=page.locator("[data-admin-frame]");
  const visibleNav=()=>page.getByRole("navigation",{name:"Quản trị hệ thống",exact:true}).filter({visible:true});
  const ready=async title=>{
    await frame.getByRole("heading",{level:1,name:title,exact:true}).waitFor();
    await frame.getByRole("table").waitFor();
  };
  const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"No document horizontal overflow");
  const shot=async name=>{await captureScreenshot(page,{path:path.join(output,`${name}.png`),fullPage:false},screenshots);};

  // Locator visibility alone misses controls clipped by an overflowing dialog/body.
  const tabToVisible=async(target,name)=>{
    await target.waitFor();
    for(let i=0;i<40&&!await target.evaluate(el=>el===document.activeElement);i++)await page.keyboard.press("Tab");
    assert.equal(await target.evaluate(el=>el===document.activeElement),true,"Keyboard reaches "+name);
    const visibility=await target.evaluate(el=>{
      const r=el.getBoundingClientRect(),d=el.closest("dialog").getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      const clippedBy=[];
      for(let parent=el.parentElement;parent;parent=parent.parentElement){
        const style=getComputedStyle(parent),p=parent.getBoundingClientRect();
        const top=p.top+parent.clientTop,left=p.left+parent.clientLeft;
        if((/auto|scroll|hidden|clip/.test(style.overflowY)&&(r.top<top-1||r.bottom>top+parent.clientHeight+1))||
           (/auto|scroll|hidden|clip/.test(style.overflowX)&&(r.left<left-1||r.right>left+parent.clientWidth+1)))clippedBy.push(parent.tagName+"."+parent.className);
        if(parent.tagName==="DIALOG")break;
      }
      return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,
        inViewport:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,
        inDialog:r.top>=d.top&&r.bottom<=d.bottom&&r.left>=d.left&&r.right<=d.right,
        hitTarget:hit===el||el.contains(hit),clippedBy,outline:getComputedStyle(el).outlineWidth};
    });
    await shot(name);
    assert(visibility.inViewport&&visibility.inDialog&&visibility.hitTarget&&!visibility.clippedBy.length,name+" is visible and not clipped: "+JSON.stringify(visibility));
    assert.equal(visibility.outline,"3px",name+" retains keyboard focus visibility");
  };

  // Exercise the actual login form against an intercepted response, never production credentials.
  await page.goto(base+"/login");
  await page.getByLabel("Email",{exact:true}).fill(actor.email);
  await page.getByLabel("Mật khẩu",{exact:true}).fill("Browser-fixture-only-12");
  await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();await ready("Tài khoản");
  assert.equal(new URL(page.url()).pathname,"/admin/users");
  await page.goto(base+"/admin");await ready("Tài khoản");assert.equal(new URL(page.url()).pathname,"/admin/users");

  for(const [resource,title] of sections){
    await page.goto(base+`/admin/${resource}`);await ready(title);
    await page.waitForFunction(expected=>document.title===expected,`${title} | Quản trị VehicSim`);
    assert.equal(await frame.getByRole("heading",{level:1}).count(),1);
    assert.equal(await page.getByRole("navigation",{name:"Đường dẫn"}).locator('[aria-current="page"]').innerText(),title);
    for(const [width,height] of viewports){
      await page.setViewportSize({width,height});await overflow();
      if(width>=1100){
        assert.equal(await page.getByRole("complementary",{name:"Khu vực quản trị"}).isVisible(),true);
        assert.equal(await page.locator("details").isVisible(),false);
      }else{
        assert.equal(await page.getByRole("complementary",{name:"Khu vực quản trị"}).isVisible(),false);
        await page.locator("summary").focus();await page.keyboard.press("Enter");
      }
      const nav=visibleNav();assert.equal(await nav.count(),1);
      const add=frame.getByRole("button",{name:"Thêm mới",exact:true});
      assert.equal(await add.evaluate(el=>getComputedStyle(el).fontSize),"13px");
      assert.equal(await add.evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(49, 87, 68)","Admin actions use the shared theme while retaining chuvv sizing");
      assert.equal(await frame.evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(245, 243, 237)","Admin canvas follows DESIGN.md");
      assert(await add.evaluate(el=>el.getBoundingClientRect().height)>=(width<640?44:40),"Shared control height");
      assert.equal(await frame.locator("h2").first().evaluate(el=>getComputedStyle(el).fontSize),"16px");
      await nav.locator('[aria-current="page"]').focus();
      assert.equal(await nav.locator('[aria-current="page"]').evaluate(el=>getComputedStyle(el).outlineWidth),"3px","Visible keyboard focus");

      assert.equal(await nav.getByRole("link").count(),3);
      assert.equal(await nav.locator('[aria-current="page"]').innerText(),`${title}\n${resource==="users"?"Người dùng và vai trò":resource==="workspaces"?"Không gian và người quản lý":"Danh mục và nguồn tham khảo"}`);
      assert.equal(await page.getByRole("link",{name:"Tổng quan VehicSim",exact:true}).filter({visible:true}).count(),1);
      assert.equal(await page.getByRole("button",{name:"Đăng xuất",exact:true}).filter({visible:true}).count(),1);
      assert.equal(await page.getByRole("link",{name:"Workspace cộng tác",exact:true}).count(),0);
      if(width<1100){
        await shot(`${resource}-${width}-menu`);
        await nav.getByRole("link").first().focus();await page.keyboard.press("Escape");
        assert.equal(await page.locator("details").getAttribute("open"),null);
        assert.equal(await page.locator("summary").evaluate(el=>el===document.activeElement),true);
      }
      await shot(`${resource}-${width}`);
    }
    // Existing Add/Editor remains reachable and Escape does not send mutations.
    const tableRegion=frame.getByRole("region",{name:/^Bảng /});
    await tableRegion.evaluate(el=>{el.scrollLeft=80;});
    await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
    const beforeModal=await page.evaluate(()=>({y:scrollY,overflow:document.documentElement.style.overflow,padding:document.documentElement.style.paddingRight,gutter:document.documentElement.style.scrollbarGutter,headingX:document.getElementById("admin-page-title").getBoundingClientRect().x,headingWidth:document.getElementById("admin-page-title").getBoundingClientRect().width}));
    await frame.getByRole("button",{name:"Thêm mới",exact:true}).click();
    const dialog=page.getByRole("dialog",{name:`Thêm mới · ${title}`,exact:true});await dialog.waitFor();
    if(resource==="workspaces")await dialog.getByRole("radiogroup",{name:"Kết quả tìm Manager",exact:true}).waitFor();
    assert.equal(await dialog.getAttribute("aria-modal"),"true");
    assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true,"Initial focus stays inside native modal");
    assert.equal(await dialog.evaluate(el=>el.matches(":modal")),true,"Open dialog uses native modality, not only aria-modal");
    await frame.getByRole("button",{name:"Thêm mới",exact:true}).evaluate(el=>el.focus());
    assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true,"Native inert background cannot receive programmatic focus");
    const openedY=await page.evaluate(()=>scrollY);
    assert.equal(await frame.locator("h1").evaluate(el=>el.getBoundingClientRect().x),beforeModal.headingX,"Opening does not shift background horizontally");
    assert.equal(await frame.locator("h1").evaluate(el=>el.getBoundingClientRect().width),beforeModal.headingWidth,"Opening retains background content width");
    if(openedY!==beforeModal.y)backgroundIssues.push({resource,kind:"open-scroll",before:beforeModal.y,after:openedY});
    await page.mouse.move(2,2);await page.mouse.wheel(0,400);await page.waitForTimeout(200);
    const wheelY=await page.evaluate(()=>scrollY);
    if(wheelY!==beforeModal.y)backgroundIssues.push({resource,kind:"backdrop-scroll",before:beforeModal.y,after:wheelY});
    await shot(resource+"-modal-background-scroll");
    await page.evaluate(y=>window.scrollTo({top:y,behavior:"instant"}),beforeModal.y);
    await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});
    assert.equal(await page.evaluate(()=>scrollY),beforeModal.y,"Closing restores background scroll position");
    assert.equal(await tableRegion.evaluate(el=>el.scrollLeft),80,"Closing retains horizontal table position");
    assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),beforeModal.overflow);
    assert.equal(await page.evaluate(()=>document.documentElement.style.paddingRight),beforeModal.padding);
    assert.equal(await page.evaluate(()=>document.documentElement.style.scrollbarGutter),beforeModal.gutter);
    const opener=frame.getByRole("button",{name:"Thêm mới",exact:true});
    assert.equal(await opener.evaluate(el=>el===document.activeElement),true,"Closing returns focus to opener");
    if(resource==="users"){
      const prior=await page.evaluate(()=>["overflow","padding-right","scrollbar-gutter"].map(name=>[name,document.documentElement.style.getPropertyValue(name),document.documentElement.style.getPropertyPriority(name)]));
      await page.evaluate(()=>{const root=document.documentElement;root.style.setProperty("overflow","hidden","important");root.style.setProperty("padding-right","7px","important");root.style.setProperty("scrollbar-gutter","stable");});
      await opener.click();await dialog.waitFor();await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});
      assert.deepEqual(await page.evaluate(()=>[document.documentElement.style.overflow,document.documentElement.style.getPropertyPriority("overflow"),document.documentElement.style.paddingRight,document.documentElement.style.getPropertyPriority("padding-right"),document.documentElement.style.scrollbarGutter]),["hidden","important","7px","important","stable"],"Closing Admin preserves a pre-existing outer scroll lock and styles");
      await page.evaluate(previous=>{for(const [name,value,priority] of previous)document.documentElement.style.setProperty(name,value,priority);},prior);
    }
    await opener.focus();await page.keyboard.press("Enter");await dialog.waitFor();
    if(resource==="workspaces")await dialog.getByRole("radiogroup",{name:"Kết quả tìm Manager",exact:true}).waitFor();
    assert.equal(await dialog.locator("input").first().evaluate(el=>getComputedStyle(el).fontSize),"14px");
    assert.equal(await dialog.locator("h2").evaluate(el=>getComputedStyle(el).fontSize),"20px","List typography must not override modal titles");
    assert.equal(await dialog.evaluate(el=>getComputedStyle(el).getPropertyValue("--admin-control-height").trim()),"44px","Native dialog inherits mobile foundations");

    // Reach actual fields/actions at low heights, including review/discard and focus wrap.
    const first=dialog.getByLabel(resource==="users"?"Email *":resource==="workspaces"?"Tên workspace *":"Mã *",{exact:true});
    for(const [width,height] of viewports.filter(([width])=>![1920,1366].includes(width))){
      await page.setViewportSize({width,height});await overflow();
      const bounds=await dialog.boundingBox();
      assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height,"Modal fits viewport at "+width);
      assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),true,"Modal has no horizontal overflow at "+width);
      assert.equal(await dialog.evaluate(el=>["aria-labelledby","aria-describedby"].every(name=>el.getAttribute(name)?.split(/\s+/).every(id=>document.getElementById(id)))),true,"Modal title and description reference existing elements");
      await tabToVisible(first,resource+"-modal-"+width);
    }
    if(resource==="users"){
      for(const [label,value] of [["Email *","short-viewport@example.invalid"],["Họ *","Nguyễn"],["Tên *","Kiểm thử"],["Mật khẩu ban đầu *","Fixture-only-123"]])await dialog.getByLabel(label,{exact:true}).fill(value);
    }else if(resource==="workspaces"){
      await first.fill("Workspace kiểm thử viewport thấp");
      await dialog.getByRole("radio").check();
    }else{
      await first.fill("SHORT-VIEWPORT");
      await dialog.getByLabel("Tên *",{exact:true}).fill("Tài liệu kiểm thử viewport thấp");
    }
    for(const [width,height] of shortViewports){
      await page.setViewportSize({width,height});await overflow();
      const prefix=resource+"-short-"+width+"x"+height;
      await dialog.evaluate(el=>{el.scrollTop=0;});
      const bounds=await dialog.boundingBox();
      await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
      await page.mouse.wheel(0,300);
      await page.waitForFunction(()=>document.querySelector("dialog[open]").scrollTop>0);
      await dialog.getByRole("button",{name:"Đóng biểu mẫu",exact:true}).focus();
      await tabToVisible(first,prefix+"-field");
      await tabToVisible(dialog.getByRole("button",{name:"Tạo mới",exact:true}),prefix+"-submit");
      await page.keyboard.press("Tab");
      assert.equal(await dialog.getByRole("button",{name:"Đóng biểu mẫu",exact:true}).evaluate(el=>el===document.activeElement),true,"Tab stays within dialog");
      await page.keyboard.press("Shift+Tab");
      await tabToVisible(dialog.getByRole("button",{name:"Tạo mới",exact:true}),prefix+"-wrap");
      await page.keyboard.press("Enter");
      await tabToVisible(dialog.getByRole("button",{name:"Xác nhận tạo",exact:true}),prefix+"-review");
      assert.equal(writes.length,0,"Review never sends a mutation");
      await page.keyboard.press("Escape");
      await first.waitFor();
      await page.keyboard.press("Escape");
      await tabToVisible(dialog.getByRole("button",{name:"Bỏ thay đổi",exact:true}),prefix+"-discard");
      await page.keyboard.press("Escape");
      assert.notEqual(await first.inputValue(),"","Escape from discard keeps draft");
    }
    await page.keyboard.press("Escape");
    await tabToVisible(dialog.getByRole("button",{name:"Bỏ thay đổi",exact:true}),resource+"-short-discard-final");
    await page.keyboard.press("Enter");await dialog.waitFor({state:"hidden"});
    assert.equal(await frame.getByRole("button",{name:"Thêm mới",exact:true}).evaluate(el=>el===document.activeElement),true,"Discard returns focus to opener");
    await page.setViewportSize({width:390,height:844});
  }
  assert.equal(writes.length,0);
  await fs.writeFile(path.join(output,"modal-scroll-observations.json"),JSON.stringify({backgroundIssues},null,2));
  assert.deepEqual(backgroundIssues,[],"Native Admin dialogs must prevent opening/backdrop scroll from moving the background");

  // Client navigation + history on both desktop and mobile, with one active Admin route.
  await page.setViewportSize({width:1366,height:768});
  await visibleNav().getByRole("link",{name:/^Tài khoản/}).click();await ready("Tài khoản");
  await visibleNav().getByRole("link",{name:/^Workspace/}).click();await ready("Workspace");
  await page.goBack();await ready("Tài khoản");
  await page.setViewportSize({width:768,height:1024});
  await page.locator("summary").click();await visibleNav().getByRole("link",{name:/^Tài liệu kỹ thuật/}).click();await ready("Tài liệu kỹ thuật");
  assert.equal(await page.locator("details").getAttribute("open"),null);
  await frame.getByRole("link",{name:"Đến nội dung quản trị",exact:true}).focus();await page.keyboard.press("Enter");
  assert.equal(await page.locator("#admin-content").evaluate(el=>el===document.activeElement),true);

  // Notifications fit a narrow viewport and stay accessible through the shared header.
  await page.setViewportSize({width:390,height:844});await page.getByRole("button",{name:"Thông báo",exact:true}).click();
  await page.getByRole("dialog",{name:"Thông báo",exact:true}).waitFor();await overflow();await shot("notifications-390");await page.keyboard.press("Escape");

  // Existing server query and paging contracts remain connected after removing old header/navigation.
  await page.goto(base+"/admin/users");await ready("Tài khoản");
  await frame.getByLabel("Từ khóa tìm kiếm",{exact:true}).fill("  Fixture  ");
  await Promise.all([page.waitForResponse(r=>new URL(r.url()).searchParams.get("q")==="Fixture"),frame.getByRole("button",{name:"Tìm",exact:true}).click()]);
  await frame.getByRole("button",{name:"Sau",exact:true}).click();await frame.getByText("24 kết quả · Trang 2/2",{exact:true}).waitFor();
  assert.equal(requests.filter(r=>r.path==="/vehicsim/admin/users").at(-1).query.page_size,"20");

  // PUT confirmation is still required; a rejected fixture save keeps editor values and shows no success.
  await page.setViewportSize({width:320,height:256});
  await frame.getByRole("button",{name:/^Chỉnh sửa tài khoản /}).first().click();
  const editor=page.getByRole("dialog",{name:"Chỉnh sửa · Tài khoản",exact:true});await editor.waitFor();
  const editorScroll=await page.evaluate(()=>scrollY);assert(editorScroll>0,"Edit opens from a scrolled table");
  await editor.getByLabel("Tên *",{exact:true}).fill("Giữ dữ liệu nhập");
  await editor.getByRole("button",{name:"Lưu thay đổi",exact:true}).click();
  assert.equal(writes.length,0);
  await editor.getByRole("button",{name:"Xác nhận lưu",exact:true}).click();
  await editor.getByRole("alert").filter({hasText:"Fixture: không lưu được"}).waitFor();
  assert.equal(await editor.getByLabel("Tên *",{exact:true}).inputValue(),"Giữ dữ liệu nhập");
  assert.equal(writes.length,1);assert.equal(writes[0].method,"PUT");
  assert.equal(writes[0].body.first_name,"Giữ dữ liệu nhập");
  assert.equal(await frame.getByText("Đã lưu thành công.",{exact:true}).count(),0);
  await tabToVisible(editor.getByLabel("Tên *",{exact:true}),"users-short-error-field");
  await tabToVisible(editor.getByRole("button",{name:"Lưu thay đổi",exact:true}),"users-short-error-submit");
  await editor.getByRole("button",{name:"Hủy",exact:true}).click();
  await editor.getByRole("button",{name:"Bỏ thay đổi",exact:true}).click();
  assert.equal(await page.evaluate(()=>scrollY),editorScroll,"Cancel after a failed save restores the scrolled table position");
  await page.setViewportSize({width:390,height:844});

  // Frame/navigation must remain usable independently of each resource's loading/data/error states.
  for(const [resource,title] of sections){
    for(const state of ["slow","empty","error","forbidden"]){
      mode=state;await page.goto(base+`/admin/${resource}`);
      await frame.getByRole("heading",{level:1,name:title,exact:true}).waitFor();
      if(state==="slow")await frame.getByRole("status").filter({hasText:"Đang tải dữ liệu"}).waitFor();
      else if(state==="empty")await frame.getByText(resource==="users"?"Chưa có tài khoản":resource==="workspaces"?"Chưa có workspace":"Chưa có tài liệu kỹ thuật",{exact:true}).waitFor();
      else await frame.getByRole("alert").filter({hasText:state==="error"?(resource==="tech-references"?"Máy chủ chưa thể tải tài liệu. Hãy thử lại sau.":"Fixture: không tải được"):"Fixture: không có quyền"}).waitFor();
      assert.equal(await frame.getByRole("link",{name:"Hồ sơ / Mật khẩu",exact:true}).isVisible(),true);
      if(state==="slow"){
        mode="normal";
        assert.equal(pendingLists.length,1,"Loading request is explicitly held until asserted");
        pendingLists.shift()();await ready(title);
      }
      if(state==="error"){
        mode="normal";await frame.getByRole("button",{name:"Thử lại",exact:true}).click();await ready(title);
      }
    }
  }
  mode="normal";

  // Leaving Admin restores the existing global shell; no Admin styling/container persists.
  const unlockedStyles=await page.evaluate(()=>["overflow","padding-right","scrollbar-gutter"].map(name=>[document.documentElement.style.getPropertyValue(name),document.documentElement.style.getPropertyPriority(name)]));
  await frame.getByRole("button",{name:"Thêm mới",exact:true}).click();await page.locator("dialog[open]").waitFor();
  await frame.getByRole("link",{name:"Hồ sơ / Mật khẩu",exact:true}).evaluate(link=>link.click());await page.waitForURL(base+"/profile");
  await page.getByRole("button",{name:/Lưu/}).first().waitFor();
  assert.equal(await frame.count(),0);assert.equal(await page.getByRole("complementary",{name:"Khu vực quản trị"}).count(),0);
  assert.equal(await page.locator("dialog[open]").count(),0);
  assert.deepEqual(await page.evaluate(()=>["overflow","padding-right","scrollbar-gutter"].map(name=>[document.documentElement.style.getPropertyValue(name),document.documentElement.style.getPropertyPriority(name)])),unlockedStyles,"Unmount restores original root styles");
  await page.setViewportSize({width:1366,height:768});
  assert.equal(await page.locator("#vehicsim-navigation").evaluate(el=>Math.round(el.getBoundingClientRect().width)),232);

  // Each non-Admin role is denied before mounting the Admin data fetching component.
  for(const nextRole of ["MANAGER","ENGINEER","REVIEWER","EXPERIENCER"]){
    role=nextRole;
    for(const [resource] of sections){
      const before=requests.filter(r=>r.path.startsWith("/vehicsim/admin/")).length;
      await page.goto(base+`/admin/${resource}`);await page.getByRole("heading",{name:"Trang này yêu cầu quyền truy cập",exact:true}).waitFor();
      assert.equal(await frame.count(),0);assert.equal(await page.getByRole("navigation",{name:"Quản trị hệ thống",exact:true}).count(),0);
      assert.equal(await page.locator("aside").isVisible(),true,"Denied non-Admin keeps the existing global navigation");
      assert.equal(requests.filter(r=>r.path.startsWith("/vehicsim/admin/")).length,before);
      if(nextRole==="ENGINEER"||nextRole==="REVIEWER")assert.equal(await page.getByRole("navigation",{name:"Điều hướng VehicSim",exact:true}).getByRole("link",{name:"Nhiệm vụ & báo cáo",exact:true}).getAttribute("href"),"/my-work");
    }
  }
  role="ADMIN";
  await page.goto(base+"/admin/users");await ready("Tài khoản");
  mode="expired";await page.reload();await page.waitForURL(base+"/login");
  assert.equal(await page.evaluate(()=>localStorage.getItem("vehicsim_access_token")),null);
  mode="normal";await page.goto(base+"/admin/workspaces");await page.waitForURL(base+"/login");
  // Log in again and verify the mobile menu can end the session through existing logout behavior.
  await page.getByLabel("Email",{exact:true}).fill(actor.email);await page.getByLabel("Mật khẩu",{exact:true}).fill("Browser-fixture-only-12");
  await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();await ready("Tài khoản");
  await page.setViewportSize({width:768,height:1024});await page.locator("summary").click();
  await page.getByRole("button",{name:"Đăng xuất",exact:true}).filter({visible:true}).click();await page.waitForURL(base+"/login");
  assert.equal(await page.evaluate(()=>localStorage.getItem("vehicsim_access_token")),null);
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",viewports,shortViewports,screenshots,checks:["fixture login and legacy /admin entry both lead to /admin/users","three routes, unique h1, breadcrumbs, metadata, active nav","shared typography/control dimensions, visible focus, dialog token inheritance","desktop/tablet/mobile and no document overflow","native menu keyboard/Escape/client navigation/history","three editors at short heights: unclipped fields/actions, Tab wrap, review/discard/Escape/draft/return focus; rejected PUT remains usable","skip link focus and notification popup bounds","existing editor open/cancel, PUT confirmation/error preserves values","server search/pagination remains connected","loading/empty/503/403/retry","profile exit restores global shell","four non-Admin roles denied on all resources without Admin API reads","expired token, unauthenticated redirect, mobile logout"],adminWrites:writes.length,liveBackendVerified:false,figmaVerified:false},null,2));
  console.log(`PASS Admin batch 1: ${screenshots.length} screenshots; browser HTTP fixtures only. Live backend/auth/DB/Figma NOT verified.`);
} finally {for(const release of pendingLists)release();await browser.close();}
