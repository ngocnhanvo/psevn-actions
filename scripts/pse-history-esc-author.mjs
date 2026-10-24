/** One-time, idempotent native ESC Table authoring for PSE corporate history. */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const vars=env.filter(x=>x.startsWith("WC_URL="));
if(vars.length!==1)throw Error("PSE WordPress origin missing");
const u=new URL(vars[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
 throw Error("Invalid WordPress origin");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WordPress credentials unavailable");
const origin=u.origin, tableId="pse_history_vi", pageId=79301;
const expectedDates=["07/08/2008","01/09/2008","22/12/2010","12/01/2011","30/01/2011","01/02/2011"];
const headlines=[
 "Thành lập công ty",
 "Chính thức đi vào hoạt động",
 "Chuyển đổi mô hình công ty TNHH",
 "Chuyển đổi thành công ty cổ phần",
 "Cấp giấy chứng nhận đăng ký doanh nghiệp",
 "Công ty cổ phần chính thức hoạt động"
];
const escapeHtml=x=>String(x).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const hash=x=>createHash("sha256").update(x).digest("hex");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1000}});
page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
try {
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await page.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Login arithmetic input missing");await f.fill(String(v));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP authentication failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP REST nonce unavailable");return (await r.text()).trim();
 });
 if(!/^[a-zA-Z0-9]{8,24}$/.test(nonce))throw Error("Invalid WP nonce");
 const get=route=>page.evaluate(async({route,nonce})=>{
  const r=await fetch(route,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});
  return {http:r.status,data:await r.json().catch(()=>({}))}
 },{route,nonce});
 const record=await get("/wp-json/wp/v2/pages/"+pageId+"?context=edit&_fields=id,slug,status,acf,content,modified");
 if(record.http!==200||record.data?.id!==pageId||record.data.slug!=="qua-trinh-hinh-thanh-phat-trien"||
   record.data.status!=="publish"||record.data.acf?.key!=="pse-company-qua-trinh-hinh-thanh-phat-trien"||
   record.data.acf?.action!=="PublicPage")throw Error("PSE history page identity mismatch");
 const raw=String(record.data.content?.raw||"");
 const extracted=await page.evaluate(html=>{
  const node=document.createElement("div");node.innerHTML=html;
  const rich=[...node.querySelectorAll("a,img,iframe,script,form")].map(x=>({
   tag:x.tagName.toLowerCase(),parent:x.parentElement?.tagName||"",
   insideTable:!!x.closest("table"),insideTd:!!x.closest("td"),
   text:(x.textContent||"").trim().slice(0,70)}));
  if(rich.length) console.log("PSE_HISTORY_RICH_SOURCE="+JSON.stringify({rich,
   tables:[...node.querySelectorAll("table")].map(t=>({chars:t.textContent.length,
    dates:[...t.textContent.matchAll(/\\b\\d{2}\\/\\d{2}\\/\\d{4}\\b/g)].map(m=>m[0]),
    hasImage:!!t.querySelector("img"),hasLinks:!!t.querySelector("a")}))}));
  if(rich.length)throw Error("Unexpected rich source, refuse conversion");
  const txt=(node.textContent||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
  return txt.split(/;\s*/).map(x=>x.trim()).filter(Boolean);
 },raw);
 if(extracted.length!==6||extracted.some((x,i)=>{
  const matches=[...x.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)].map(m=>m[0]);
  return !matches.includes(expectedDates[i])||matches.some(d=>d!==expectedDates[i]);
 }))throw Error("Original six verified milestones changed; page untouched");
 const events=extracted.map((text,i)=>({
  date:expectedDates[i],title:headlines[i],
  details:"<p>"+escapeHtml(text)+(i<extracted.length-1?";":"")+"</p>"
 }));
 await mkdir("artifacts/pse-history-esc",{recursive:true});
 await writeFile("artifacts/pse-history-esc/original-page.json",JSON.stringify({
  pageId,slug:record.data.slug,key:record.data.acf.key,action:record.data.acf.action,
  modified:record.data.modified,raw,rawSha256:hash(raw),dates:expectedDates,
  sourceMilestones:extracted,events,readBeforeWrite:true
 },null,2)+"\n");

 let table=await get("/wp-json/tablepress/v1/table/"+tableId);
 const valid=t=>t.http===200&&t.data?.id===tableId&&
  JSON.stringify(t.data.fields?.map(x=>x.key))===JSON.stringify(["date","title","details"])&&
  t.data.items?.length===6&&t.data.items.every((item,i)=>
   item.date===events[i].date&&item.title===events[i].title&&item.details===events[i].details);
 if(valid(table)){
   console.log("PSE_HISTORY_ESC_AUTHOR=ALREADY_DONE; page_unchanged=true");
   process.exit(0);
 }
 if(table.http!==404)throw Error("ESC Table exists with unexpected content or API unavailable, no overwrite");

 // Native WordPress ESC Table Add Table + native advanced editor per long text cell.
 await page.goto(origin+"/wp-admin/admin.php?page=tablepress_add",{waitUntil:"domcontentloaded",timeout:60000});
 await page.locator('input[name="table[name]"]').fill("PSE - Quá trình hình thành và phát triển");
 await page.locator('textarea[name="table[description]"]').fill("Mỗi dòng là một cột mốc; có thể sửa, thêm, sắp xếp ngày, tiêu đề và nội dung từng mốc.");
 const sizes=page.locator('input[type="number"]');if(await sizes.count()<2)throw Error("Native ESC Table Add form missing");
 await sizes.nth(0).fill("8");await sizes.nth(1).fill("3");
 await page.getByRole("button",{name:"Add Table"}).click();
 await page.locator("#table-id").waitFor({state:"visible",timeout:30000});
 if(await page.locator("#table-id").getAttribute("readonly")!==null)throw Error("Cannot set ESC Table ID");
 await page.locator("#table-id").fill(tableId);
 await page.locator("#table-name").focus();
 await page.getByRole("button",{name:/Save Changes|Lưu thay đổi/i}).first().click();
 await page.waitForTimeout(1300);
 await page.goto(origin+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+tableId,
  {waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&
  typeof window.tp?.callbacks?.advanced_editor?.open_dialog==="function",null,{timeout:25000});
 const state=await page.evaluate(()=>({id:window.tp.table.id,
  rows:window.tp.table.data.length,cols:window.tp.table.data[0]?.length,
  blank:window.tp.table.data.every(r=>r.every(x=>!String(x||"").trim()))}));
 if(state.id!==tableId||state.rows!==8||state.cols!==3||!state.blank)throw Error("New ESC Table schema mismatch "+JSON.stringify(state));
 await page.evaluate(events=>{
  const tp=window.tp;
  [["date","title","details"],["Ngày / tháng / năm","Tiêu đề cột mốc","Nội dung cột mốc"]]
   .forEach((row,y)=>row.forEach((v,x)=>tp.editor.setValueFromCoords(x,y,v)));
  events.forEach((event,i)=>{
   tp.editor.setValueFromCoords(0,i+2,event.date);
   tp.editor.setValueFromCoords(1,i+2,event.title);
  });tp.helpers.unsaved_changes.set();
 },events);
 for(let i=0;i<events.length;i++){
  const row=i+2;
  await page.evaluate(row=>{
   const tp=window.tp;tp.editor.updateSelectionFromCoords(2,row,2,row);
   tp.callbacks.advanced_editor.open_dialog(null)
  },row);
  await page.locator("#advanced-editor-content").fill(events[i].details);
  await page.locator(".ui-dialog .button-ok").last().click();
  const actual=await page.evaluate(row=>window.tp.table.data[row][2],row);
  if(actual!==events[i].details)throw Error("Native Advanced Editor mismatch at item "+i);
 }
 const moved=await page.evaluate(()=>{
  const tp=window.tp;const before=JSON.stringify(tp.table.data);
  if(typeof tp.callbacks.move!=="function")return {available:false};
  tp.editor.updateSelectionFromCoords(0,2,0,2);tp.callbacks.move("down","rows");
  tp.editor.updateSelectionFromCoords(0,3,0,3);tp.callbacks.move("up","rows");
  return {available:true,restored:before===JSON.stringify(tp.table.data)};
 });
 if(!moved.available||!moved.restored)throw Error("ESC Table row move/restore failed");
 await page.getByRole("button",{name:"Save Changes",exact:true}).first().click();
 for(let n=0;n<16;n++){
  await page.waitForTimeout(1000);
  table=await get("/wp-json/tablepress/v1/table/"+tableId);
  if(valid(table))break;
 }
 if(!valid(table))throw Error("ESC Table read-after-write mismatch");
 console.log("PSE_HISTORY_ESC_AUTHOR=PASS; table="+tableId+"; items=6; native_advanced_editor=6; row_move_restore=true; page_79301_unchanged=true; no_build=true");
}finally{await browser.close()}
