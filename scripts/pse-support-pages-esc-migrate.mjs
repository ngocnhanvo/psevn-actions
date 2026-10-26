/** Guarded migration: native WP ESC Table authoring then native Insert Code on two PSE Pages. No Astro build. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const mode=String(process.env.PSE_SUPPORT_MODE||"dry");
if(!["dry","tables","pages"].includes(mode))throw Error("Unsupported PSE support mode");
const hash=s=>createHash("sha256").update(String(s)).digest("hex");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const uris=env.filter(s=>s.startsWith("WC_URL="));
if(uris.length!==1)throw Error("PSE WordPress URL missing or ambiguous");
const u=new URL(uris[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid WordPress origin");
const origin=u.origin;
const specs=[
 {id:80932,slug:"duong-day-nong",key:"pse-business-duong-day-nong",
  table:"pse_hotline_vi",title:"PSE - Đường dây nóng",
  keys:["group","label","phone","note"],labels:["Nhóm thời gian","Tên liên hệ","Số điện thoại","Ghi chú"],
  expectedCount:3,oldModified:"2026-10-25T05:12:01"},
 {id:80930,slug:"hoi-dap",key:"pse-business-hoi-dap",
  table:"pse_faq_vi",title:"PSE - Hỏi đáp",
  keys:["question","answer","visible"],labels:["Câu hỏi","Câu trả lời HTML","Hiển thị (1/0)"],
  expectedCount:15,oldModified:"2026-10-25T05:11:55"}
];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1500,height:970}});
page.on("dialog",async d=>{try{if(d.type()==="confirm")await d.accept();else await d.dismiss()}catch(e){if(!String(e).includes("already handled"))throw e}});
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP Admin login secrets unavailable");
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const body=await page.locator("body").innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!(await f.count()))throw Error("WP login arithmetic input missing");
   await f.fill(String(v));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WordPress REST nonce HTTP "+r.status);return (await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Invalid WP REST nonce");
 const get=async route=>page.evaluate(async({route,nonce})=>{
  const r=await fetch(route,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});
  return {http:r.status,data:await r.json().catch(()=>null)};
 },{route,nonce});
 const readPage=spec=>get("/wp-json/wp/v2/pages/"+spec.id+"?context=edit&_fields=id,slug,status,acf,content,modified");
 const readTable=spec=>get("/wp-json/tablepress/v1/table/"+spec.table);
 const clean=x=>String(x||"").replace(/\s+/g," ").trim();
 const source=[];
 await mkdir("artifacts/pse-support-esc-migration",{recursive:true});
 for(const spec of specs){
  const r=await readPage(spec);
  if(r.http!==200||r.data?.id!==spec.id||r.data?.slug!==spec.slug||r.data?.status!=="publish"||
   r.data?.acf?.key!==spec.key||r.data?.acf?.action!=="PublicPage")throw Error("Page identity changed "+spec.slug);
  const raw=String(r.data.content?.raw||"");
  const inserted="[table id="+spec.table+" /]";
  const migrated=clean(raw)===inserted;
  if(!migrated&&(r.data.modified!==spec.oldModified||raw.includes("[table id=")))throw Error("Page changed since source audit, no overwrite "+spec.slug);
  const rows=migrated?null:await page.evaluate(({raw,kind})=>{
   const root=document.createElement("div");root.innerHTML=raw;
   if(kind==="hotline"){
    const tables=[...root.querySelectorAll("table")];
    const divisions=[...root.children].filter(c=>c.tagName==="DIV");
    if(tables.length!==2||divisions.length!==2)throw Error("Unexpected hotline source shape");
    const items=[];
    for(let i=0;i<2;i++){
     const group=(divisions[i].textContent||"").trim().replace(/\s*[:：]\s*$/,"");
     if(!group)throw Error("Empty hotline group");
     const records=[...tables[i].querySelectorAll("tr")];
     for(const tr of records){
      const cells=[...tr.children];
      if(cells.length!==2)throw Error("Hotline row shape changed");
      const label=(cells[0].textContent||"").trim().replace(/\s*[:：]\s*$/,"");
      const phone=(cells[1].textContent||"").trim();
      if(!label||!phone||!/[0-9]/.test(phone))throw Error("Hotline source missing phone");
      items.push({group,label,phone,note:""});
     }
    }
    return items;
   }
   const accordion=root.querySelector(".accordionfaq");
   if(!accordion)throw Error("Original FAQ accordion missing");
   const questions=[...accordion.querySelectorAll("h3")];
   const answers=[...accordion.querySelectorAll(".accordionfaqitem")];
   if(questions.length!==15||answers.length!==15)throw Error("FAQ source count changed");
   return questions.map((h,i)=>{
    const node=answers[i];
    const question=(h.textContent||"").trim().replace(/^\d+\.\s*/,"");
    if(!question||!node||!node.innerHTML.trim()||!node.textContent.trim())throw Error("FAQ entry empty "+i);
    // Read the authentic published rich HTML; HTML is no longer retained in Editor after migration.
    return{question,answer:node.innerHTML,visible:"1"};
   });
  },{raw,kind:spec.slug==="hoi-dap"?"faq":"hotline"});
  if(!migrated&&(rows.length!==spec.expectedCount||rows.some(x=>spec.keys.some(k=>x[k]==null))))throw Error("Source ESC item count/schema mismatch "+spec.slug);
  const existing=await readTable(spec);
  if(![200,404].includes(existing.http))throw Error("Unexpected table state "+spec.table+" HTTP "+existing.http);
  const entry={spec,record:r.data,raw,rows,table:existing,migrated};
  source.push(entry);
  await writeFile("artifacts/pse-support-esc-migration/"+spec.slug+"-before.json",
   JSON.stringify({id:spec.id,slug:spec.slug,key:spec.key,modified:r.data.modified,raw,rawSha256:hash(raw),
    cssmore:r.data.acf?.cssmore||"",tableHttp:existing.http,parsedCount:rows?.length||0},null,2)+"\n");
  console.log("PSE_ESC_PREFLIGHT="+JSON.stringify({slug:spec.slug,pageId:spec.id,rawLength:raw.length,rawSha256:hash(raw),
   modified:r.data.modified,migrated,rows:rows?.length||0,tableStatus:existing.http,tableId:spec.table}));
 }
 const matches=(entry,r)=>{
  const {spec,rows}=entry;
  if(r.http!==200||r.data?.id!==spec.table||JSON.stringify(r.data?.fields?.map(x=>x.key))!==JSON.stringify(spec.keys)||
    r.data?.items?.length!==spec.expectedCount)return false;
  if(!rows)return true;
  return rows.every((item,i)=>spec.keys.every(k=>clean(r.data.items[i]?.[k])===clean(item[k])));
 };
 if(mode==="dry"){
  console.log("PSE_SUPPORT_ESC_DRY=PASS pages=2 no_writes=true");
  process.exit(0);
 }
 if(mode==="tables"){
  for(const entry of source){
   const {spec,rows}=entry;
   if(entry.migrated){if(!matches(entry,entry.table))throw Error("Already migrated Page references invalid ESC Table "+spec.table);continue}
   if(matches(entry,entry.table)){console.log("PSE_SUPPORT_TABLE=EXISTING "+spec.table);continue}
   if(entry.table.http!==404)throw Error("Refuse to overwrite nonmatching existing ESC Table "+spec.table);
   // Create via native TablePress Admin (never direct DB/REST write).
   await page.goto(origin+"/wp-admin/admin.php?page=tablepress_add",{waitUntil:"domcontentloaded",timeout:60000});
   await page.locator('input[name="table[name]"]').fill(spec.title);
   await page.locator('textarea[name="table[description]"]').fill("Các hàng có cấu trúc, quản lý và sắp xếp trong WordPress ESC Table.");
   const inputs=page.locator('input[type="number"]');
   if(await inputs.count()<2)throw Error("Native ESC dimensions unavailable");
   await inputs.nth(0).fill(String(rows.length+2));await inputs.nth(1).fill(String(spec.keys.length));
   await page.getByRole("button",{name:"Add Table"}).click();
   await page.locator("#table-id").waitFor({state:"visible",timeout:45000});
   if(!/^\d+$/.test(await page.locator("#table-id").inputValue()))throw Error("Native numeric Table ID missing");
   await page.locator("#table-id").fill(spec.table);await page.locator("#table-name").focus();
   await page.getByRole("button",{name:/Save Changes|Lưu thay đổi/i}).first().click();await page.waitForTimeout(2300);
   if((await readTable(spec)).http!==200)throw Error("Native ESC Table rename not saved "+spec.table);
   await page.goto(origin+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+spec.table,{waitUntil:"domcontentloaded",timeout:60000});
   await page.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&typeof window.tp?.editor?.setValueFromCoords==="function",null,{timeout:30000});
   const initial=await page.evaluate(()=>({id:window.tp.table.id,data:window.tp.table.data.map(r=>[...r])}));
   if(initial.id!==spec.table||initial.data.length!==rows.length+2||
    initial.data.some(r=>r.length!==spec.keys.length||r.some(x=>String(x||"").trim())))throw Error("ESC Table initial cells not blank "+spec.table);
   await page.evaluate(({spec,rows})=>{
    const tp=window.tp;
    [spec.keys,spec.labels].forEach((r,y)=>r.forEach((val,x)=>tp.editor.setValueFromCoords(x,y,val)));
    rows.forEach((r,i)=>spec.keys.forEach((k,x)=>{const val=r[k];if(val&&k!=="answer")tp.editor.setValueFromCoords(x,i+2,val)}));
    tp.helpers.unsaved_changes.set();
   },{spec,rows});
   if(spec.slug==="hoi-dap"){
    for(let i=0;i<rows.length;i++){
     await page.evaluate(row=>{
      const tp=window.tp;tp.editor.updateSelectionFromCoords(1,row,1,row);
      tp.callbacks.advanced_editor.open_dialog(null);
     },i+2);
     const editor=page.locator("#advanced-editor-content");
     await editor.waitFor({state:"visible",timeout:10000});
     await editor.fill(rows[i].answer);
     await page.locator(".ui-dialog .button-ok").last().click();
     const actual=await page.evaluate(row=>window.tp.table.data[row][1],i+2);
     if(clean(actual)!==clean(rows[i].answer))throw Error("FAQ native rich-text cell mismatch item "+i);
    }
   }
   await page.getByRole("button",{name:/Save Changes|Lưu thay đổi/i}).first().click();
   let ok=false;
   for(let n=0;n<13;n++){await page.waitForTimeout(1100);if(matches(entry,await readTable(spec))){ok=true;break}}
   if(!ok)throw Error("Native ESC Table read-after-write mismatch "+spec.table);
   console.log("PSE_SUPPORT_ESC_TABLE=PASS id="+spec.table+" items="+rows.length+" native=true");
  }
  console.log("PSE_SUPPORT_TABLES=PASS mode=tables original_pages_unchanged=true no_build=true");process.exit(0);
 }
 // Pages mode: already saved tables are required; native Classic Editor Insert Code only.
 for(const entry of source){
  const {spec,raw,rows}=entry;
  const table=await readTable(spec);
  if(!matches(entry,table))throw Error("Page requires validated matching ESC Table "+spec.table);
  if(entry.migrated){console.log("PSE_SUPPORT_PAGE=ALREADY_DONE "+spec.slug);continue}
  // Verify source before each write and prevent concurrent editor changes.
  const readback=await readPage(spec);
  if(readback.data?.modified!==entry.record.modified||String(readback.data?.content?.raw||"")!==raw)
   throw Error("Concurrent WP Page update detected "+spec.slug);
  await page.goto(origin+"/wp-admin/post.php?post="+spec.id+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
  await page.locator("#content-html").click();
  const editor=page.locator("#content");await editor.waitFor({state:"attached",timeout:20000});
  await page.evaluate(()=>{
   const textarea=document.querySelector("#content");
   if(!(textarea instanceof HTMLTextAreaElement))throw Error("Native WP Editor textarea missing");
   textarea.value="";textarea.dispatchEvent(new Event("input",{bubbles:true}));textarea.focus();textarea.setSelectionRange(0,0);
   window.wpActiveEditor="content";
  });
  const button=page.locator("#qt_content_tablepress_quicktags_button");
  if(await button.isVisible())await button.click();
  else await page.evaluate(()=>{
   if(typeof window.tablepress_open_shortcode_thickbox!=="function")throw Error("Native Insert Code picker absent");
   window.tablepress_open_shortcode_thickbox();
  });
  const target="[table id="+spec.table+" /]";
  const choice=page.frameLocator("#TB_iframeContent").locator('.insert-shortcode[title*="'+spec.table+'"]');
  await choice.waitFor({state:"visible",timeout:30000});
  if(!(await choice.getAttribute("title"))?.includes(target))throw Error("Native ESC picker mismatched "+spec.table);
  await page.evaluate(target=>{
   window.wpActiveEditor="content";
   const original=window.send_to_editor;
   window.__pseSupportNative=false;
   window.send_to_editor=function(shortcode){
    if(shortcode!==target)return original?.call(window,shortcode);
    if(typeof window.QTags?.insertContent!=="function")throw Error("Native Quicktags insertContent unavailable");
    const area=document.querySelector("#content");
    if(!(area instanceof HTMLTextAreaElement))throw Error("WordPress textarea disappeared");
    area.focus();area.setSelectionRange(0,0);window.wpActiveEditor="content";
    window.QTags.insertContent(shortcode);window.__pseSupportNative=true;window.tb_remove?.();
   };
  },target);
  await choice.click();await page.waitForTimeout(280);
  const current=await editor.inputValue();
  if(!(await page.evaluate(()=>window.__pseSupportNative===true))||clean(current)!==target)
   throw Error("Insert Code did not produce exactly one shortcode "+spec.table);
  await page.locator("#publish").click();await page.waitForTimeout(2400);
  let saved=null;
  for(let n=0;n<6;n++){
   try{saved=await readPage(spec);break}
   catch(e){if(!/navigation|Execution context was destroyed/i.test(String(e)))throw e;await page.waitForTimeout(850)}
  }
  if(saved?.http!==200||saved.data?.acf?.key!==spec.key||clean(saved.data?.content?.raw)!==target)
   throw Error("WordPress native Page read-after-write mismatch "+spec.slug);
  console.log("PSE_SUPPORT_PAGE=PASS "+spec.slug+" table="+spec.table+" original_rows="+rows.length+" native_insert_code=true");
 }
 console.log("PSE_SUPPORT_PAGES=PASS editor_data_removed=true esc_tables_verified=true no_build=true");
}finally{await browser.close()}
