/** Chrome DevTools smoke against the real QA app; no browser libraries or API mocks. */
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const state=JSON.parse(readFileSync("target/admin-qa/state.json","utf8"));
const config=JSON.parse(readFileSync("target/admin-qa/config.json","utf8"));
const origin="http://127.0.0.1:3001";
const created=await (await fetch("http://127.0.0.1:9223/json/new?"+encodeURIComponent("about:blank"),{method:"PUT"})).json();
const ws=new WebSocket(created.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let seq=0;
const waiting=new Map();
const networkErrors=[];
ws.onmessage=e=>{
  const msg=JSON.parse(e.data);
  if(msg.id){const p=waiting.get(msg.id);waiting.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);}
  if(msg.method==="Network.responseReceived" && msg.params.response.url.includes(":18001/") && msg.params.response.status>=400)
    networkErrors.push({url:msg.params.response.url,status:msg.params.response.status});
};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;waiting.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Page.addScriptToEvaluateOnNewDocument",{source:"if(location.pathname==='/login')localStorage.removeItem('vehicsim_access_token')"});
await send("Page.navigate",{url:origin+"/login"});
async function evaluate(expression){const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);return r.result.value;}
async function until(expression,label,ms=45000) {
  const start=Date.now();
  while(Date.now()-start<ms){try { if(await evaluate(expression))return; } catch { /* new document may still be loading */ } await new Promise(r=>setTimeout(r,200));}
  throw new Error("Timed out: "+label+"; "+await evaluate("document.body.innerText.slice(-1500)"));
}
async function fill(selector,value){
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await send("Input.insertText",{text:String(value)});
}
async function clickText(text){
  await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Missing button');button.click()})()`);
}
async function screenshot(name){
 const image=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});
 writeFileSync("target/admin-qa/"+name+".png",Buffer.from(image.data,"base64"));
}
await until("!!document.querySelector('#login-email')","login form");
await until("Object.keys(document.querySelector('#login-email')).some(k=>k.startsWith('__reactProps$'))","login hydration");
await new Promise(r=>setTimeout(r,1000));
console.log("Browser: login form hydrated");
await fill("#login-email",state.adminEmail);
await fill("#login-password",state.password);
await evaluate("document.querySelector('form').requestSubmit()");
await until("!!localStorage.getItem('vehicsim_access_token')","real UI login");
await send("Page.navigate",{url:origin+"/admin/users"});
await until("!!document.querySelector('table tbody tr button')","user list");
assert.equal(await evaluate("document.querySelector('h1').textContent"),"Tài khoản");
await screenshot("users-desktop"); console.log("Browser: real login and user list passed");
await clickText("Thêm mới");
await until("!!document.querySelector('#admin-email')","add user form");
const uiEmail="qa-browser-"+Date.now()+"@example.invalid";
await fill("#admin-email",uiEmail);await fill("#admin-last_name","QA");await fill("#admin-first_name","Browser");await fill("#admin-password",state.password);
await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
await until("document.body.innerText.includes('Đã lưu thành công.')","create user persisted");
await fill('[aria-label="Từ khóa tìm kiếm"]',uiEmail);
await evaluate("document.querySelector('main form').requestSubmit()");
await until(`document.querySelector('table tbody')?.innerText.includes(${JSON.stringify(uiEmail)})`,"search created user");
await clickText("Chỉnh sửa");
await until("!!document.querySelector('#admin-first_name')","edit user loaded");
await evaluate("document.querySelector('#admin-first_name').select()");
await send("Input.insertText",{text:"Browser Updated"});
await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
await until("document.body.innerText.includes('Xác nhận lưu thay đổi?')","confirmation");
await clickText("Xác nhận lưu");
await until("!document.querySelector('[role=dialog]')","edit saved");
await send("Page.reload");
await until("!!document.querySelector('table tbody tr button')","refresh persisted users");
assert(await evaluate("document.body.innerText.includes('Browser Updated')"));
await send("Page.navigate",{url:origin+"/admin/workspaces"});
await until("!!document.querySelector('table tbody tr button')","workspace DB data");
await screenshot("workspaces-desktop");
await clickText("Thêm mới");
await until("!!document.querySelector('#admin-name')","workspace form");
await until("document.querySelector('[role=dialog] select').options.length>1","real manager selector");
await screenshot("workspace-form");
const uiWorkspace="UI workspace "+Date.now();
await fill("#admin-name",uiWorkspace);
await evaluate("(()=>{const s=document.querySelector('[role=dialog] select');s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}));})()");
await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
await until("!document.querySelector('[role=dialog]')","workspace created from UI");
await clickText("Chỉnh sửa");
await until("!!document.querySelector('#admin-description')","workspace edit");
await fill("#admin-description","Updated in real browser");
await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
await clickText("Xác nhận lưu");
await until("!document.querySelector('[role=dialog]')","workspace edit saved");
await clickText("Thêm mới");
await until("!!document.querySelector('#admin-name')","duplicate workspace form");
await fill("#admin-name",uiWorkspace);
await until("document.querySelector('[role=dialog] select').options.length>1","managers for duplicate check");
await evaluate("(()=>{const s=document.querySelector('[role=dialog] select');s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}));})()");
await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
await until("!!document.querySelector('[role=dialog] [role=alert]')","duplicate name feedback");
assert.equal(await evaluate("document.querySelector('#admin-name').value"),uiWorkspace);
assert(networkErrors.some(e=>e.status===400 && e.url.endsWith("/admin/workspaces")));
networkErrors.splice(0);
await clickText("Hủy");
console.log("Browser: workspace create/edit/error preservation passed");
await send("Page.navigate",{url:origin+"/admin/tech-references"});
await until("!!document.querySelector('table tbody tr button')","reference list");
await screenshot("references-desktop");
await clickText("Thêm mới");
await until("!!document.querySelector('#admin-ref_code')","reference form");
await screenshot("reference-form");
const uiCode="UI_REF_"+Date.now();
await fill("#admin-ref_code",uiCode);
await fill("#admin-ref_name","UI constant "+Date.now());
await evaluate("(()=>{const s=document.querySelector('#admin-ref_type');s.value='CONSTANT';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
await until("!document.querySelector('#admin-ref_value').disabled","constant field enabled");
await fill("#admin-ref_value","123456789012345678.123456789012");
await fill("#admin-unit","m");
await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
await until("!document.querySelector('[role=dialog]')","reference created from UI");
await clickText("Chỉnh sửa");
await until("!!document.querySelector('#admin-ref_value')","reference edit");
assert.equal(await evaluate("document.querySelector('#admin-ref_value').value"),"123456789012345678.123456789012");
await evaluate("document.querySelector('[role=dialog] input[type=checkbox]').click()");
await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
await until("document.body.innerText.includes('Xác nhận lưu thay đổi?')","reference status confirmation");
await clickText("Xác nhận lưu");
await until("!document.querySelector('[role=dialog]')","reference disabled");
assert(await evaluate("document.querySelector('table tbody tr').innerText.includes('Đã tắt')"));
console.log("Browser: reference create/edit/disable passed");
await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
await screenshot("references-mobile");
const width=await evaluate("({viewport:innerWidth,document:document.documentElement.scrollWidth})");
assert(width.document<=width.viewport, "No horizontal page overflow at 390px");
await send("Emulation.clearDeviceMetricsOverride");
const apiUser=(await (await fetch(config.api+"/vehicsim/admin/users?role=MANAGER",{headers:{Authorization:"Bearer "+state.adminToken}})).json()).items[0];
const managerSession=await (await fetch(config.api+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:apiUser.email,password:state.password})})).json();
await evaluate(`localStorage.setItem('vehicsim_access_token',${JSON.stringify(managerSession.access_token)})`);
await send("Page.reload");
await until("document.body.innerText.includes('Quyền Hạn Không Đủ')","non-Admin route guard");
await screenshot("manager-denied");
assert.deepEqual(networkErrors,[]);
writeFileSync("target/admin-qa/browser-result.json",JSON.stringify({result:"PASS",checks:["real login","list","create user","search","edit + confirmation","refresh persistence","manager selector","references","route guard"],networkErrors,mobile:width},null,2));
console.log("PASS: real browser login/list/create/search/edit/refresh/guard; screenshots captured.");
await send("Page.close");ws.close();