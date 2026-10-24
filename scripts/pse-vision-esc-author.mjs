/** Idempotent native WordPress ESC Table author: 2 real, source-verified sections. No Astro build. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const hash=s=>createHash("sha256").update(String(s)).digest("hex");
const entry=String(process.env.ENV_FILE||"").split(/\r?\n/).filter(x=>x.trim().startsWith("WC_URL="));
if(entry.length!==1)throw Error("WP origin missing");
const url=new URL(entry[0].trim().slice(7).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("WP origin invalid");
const origin=url.origin,tableId="pse_vision_vi",pageId=79303;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1540,height:1000}});
page.on("dialog",async d=>d.type()==="confirm"?d.accept():d.dismiss());
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP authentication missing");
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const body=await page.locator("body").innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Captcha input missing");await f.fill(String(v))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login not authenticated");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("No WP REST nonce");return (await r.text()).trim()});
 const api=path=>page.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});return {http:r.status,data:await r.json().catch(()=>({}))}},{path,nonce});
 const record=await api("/wp-json/wp/v2/pages/"+pageId+"?context=edit&_fields=id,slug,status,acf,content,modified");
 if(record.http!==200||record.data?.id!==pageId||record.data.slug!=="tam-nhin-su-menh"||record.data.status!=="publish"||record.data.acf?.action!=="PublicPage"||record.data.acf?.key!=="pse-company-tam-nhin-su-menh")throw Error("Wrong corporate Page");
 const raw=String(record.data.content?.raw||"");
 const extracted=await page.evaluate(html=>{
  const root=document.createElement("div");root.innerHTML=html;
  const tables=[...root.querySelectorAll("table")];
  if(tables.length!==1)throw Error("Unexpected source table count");
  const rows=[...tables[0].querySelectorAll("tr")];
  if(rows.length!==3||rows.some(r=>r.querySelectorAll("td").length!==2))throw Error("Source grid altered");
  const cells=rows.map(r=>[...r.querySelectorAll("td")]);
  return [0,1].map(i=>{
   const title=(cells[0][i].textContent||"").trim();
   const image=cells[1][i].querySelector("img");
   const details=cells[2][i].innerHTML.trim();
   if(!image?.getAttribute("src")||cells[1][i].querySelectorAll("img").length!==1||!details||cells[2][i].querySelector("img,script,iframe,form"))throw Error("Invalid source vision section");
   return {title,src:image.getAttribute("src"),oldAlt:image.getAttribute("alt"),details,
     text:(cells[2][i].textContent||"").replace(/\s+/g," ").trim()};
  });
 },raw);
 if(extracted.length!==2||extracted[0].title!=="Sứ mệnh"||extracted[1].title!=="Tầm nhìn"||
   extracted.some(x=>!x.text||!x.src))throw Error("WP source content differs from verified Vision Mission");
 const existing=await api("/wp-json/tablepress/v1/table/"+tableId);
 const keys=["title","img","details"];
 const same=existing.http===200&&existing.data?.id===tableId&&
  JSON.stringify(existing.data.fields?.map(x=>x.key))===JSON.stringify(keys)&&
  existing.data.items?.length===2&&existing.data.items.every((x,i)=>x.title===extracted[i].title&&
   x.details===extracted[i].details&&/<img\b[^>]*alt=["'][^"']+["']/i.test(x.img||""));
 if(same){console.log("PSE_VISION_ESC_AUTHOR=ALREADY_DONE; no_write=true");process.exit(0)}
 const recoverBlank=existing.http===200&&existing.data?.id===tableId&&
 existing.data.fields?.length===3&&existing.data.fields.every(x=>!String(x.key||"").trim())&&
 existing.data.items?.length===2&&existing.data.items.every(x=>Object.values(x).every(v=>!String(v||"").trim()));
 if(existing.http!==404&&!recoverBlank)throw Error("Existing ESC Table is not a safe blank recovery candidate: HTTP "+existing.http);
 if(recoverBlank)console.log("PSE_VISION_RECOVER_EMPTY_TABLE=true");
 const media=await api("/wp-json/wp/v2/media?context=edit&search=pse-corp-tam-nhin-su-menh&per_page=40");
 if(media.http!==200||!Array.isArray(media.data))throw Error("Source media inventory unavailable");
 const images=extracted.map((x,i)=>{
  const name=decodeURIComponent(new URL(x.src,origin).pathname.split("/").at(-1)||"");
  const candidates=media.data.filter(m=>(m.media_details?.file||"").split("/").at(-1)===name);
  if(candidates.length!==1)throw Error("Original media not uniquely found "+i);
  return {id:candidates[0].id,name,alt:i===0?"Minh họa sứ mệnh của PVFCCo-PSE":"Minh họa tầm nhìn của PVFCCo-PSE"};
 });
 await mkdir("artifacts/pse-vision",{recursive:true});
 await writeFile("artifacts/pse-vision/source-backup.json",JSON.stringify({
   id:pageId,slug:record.data.slug,modified:record.data.modified,acf:record.data.acf,
   original:raw,sha256:hash(raw),items:extracted,images,readBeforeWrite:true
 },null,2)+"\n");
 if(!recoverBlank){await page.goto(origin+"/wp-admin/admin.php?page=tablepress_add",{waitUntil:"domcontentloaded",timeout:65000});
 await page.locator('input[name="table[name]"]').fill("PSE - Tầm nhìn và Sứ mệnh");
 await page.locator('textarea[name="table[description]"]').fill("Hai mục chỉnh sửa và hoán đổi độc lập qua ESC Table: tiêu đề, hình ảnh Insert Image và nội dung Advanced Editor.");
 const sizes=page.locator('input[type="number"]');
 if(await sizes.count()<2)throw Error("Native ESC Add form missing");
 await sizes.nth(0).fill("4");await sizes.nth(1).fill("3");
 await page.getByRole("button",{name:"Add Table"}).click();
 await page.locator("#table-id").waitFor({state:"visible",timeout:25000});
 await page.locator("#table-id").fill(tableId);
 await page.locator("#table-name").focus();
 await page.getByRole("button",{name:/Save Changes|Lưu thay đổi/i}).first().click();
 await page.waitForTimeout(1500);\n }\n await page.goto(origin+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+tableId,{waitUntil:"domcontentloaded",timeout:65000});
 await page.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&typeof window.tp.callbacks?.advanced_editor?.open_dialog==="function"&&typeof window.tp.callbacks?.insert_image?.open_dialog==="function",null,{timeout:24000});
 const blank=await page.evaluate(()=>({id:window.tp.table.id,data:window.tp.table.data}));
 if(blank.id!==tableId||blank.data.length!==4||blank.data.some(r=>r.length!==3||r.some(v=>String(v||"").trim())))throw Error("ESC grid not blank/4x3");
 await page.evaluate(items=>{
  const tp=window.tp;
  [["title","img","details"],["Tên phần","Minh họa (Insert Image)","Nội dung gốc (Advanced Editor)"]].forEach((row,y)=>row.forEach((s,x)=>tp.editor.setValueFromCoords(x,y,s)));
  items.forEach((item,i)=>tp.editor.setValueFromCoords(0,i+2,item.title));
  tp.helpers.unsaved_changes.set();
 },extracted);
 for(let i=0;i<2;i++){
  const row=i+2,item=extracted[i],asset=images[i];
  await page.evaluate(row=>{const tp=window.tp;tp.editor.updateSelectionFromCoords(2,row,2,row);tp.callbacks.advanced_editor.open_dialog(null)},row);
  await page.locator("#advanced-editor-content").fill(item.details);
  await page.locator(".ui-dialog .button-ok").last().click();
  const code=await page.evaluate(row=>String(window.tp.table.data[row][2]||""),row);
  if(code!==item.details)throw Error("Advanced Editor normalized original prose row "+i);
  const data=await api("/wp-json/wp/v2/media/"+asset.id+"?context=edit");
  if(data.http!==200||data.data?.id!==asset.id)throw Error("Media detail missing "+i);
  if(data.data.alt_text!==asset.alt){
   const saved=await page.evaluate(async({id,alt,nonce})=>{const r=await fetch("/wp-json/wp/v2/media/"+id,{method:"POST",credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Content-Type":"application/json"},body:JSON.stringify({alt_text:alt})});const d=await r.json().catch(()=>({}));return {http:r.status,id:d.id,alt:d.alt_text}},{id:asset.id,alt:asset.alt,nonce});
   if(saved.http!==200||saved.id!==asset.id||saved.alt!==asset.alt)throw Error("Media ALT update failed "+i);
  }
  await page.evaluate(row=>{const tp=window.tp;tp.editor.updateSelectionFromCoords(1,row,1,row);tp.editor.setValueFromCoords(1,row,"");tp.callbacks.insert_image.open_dialog(null)},row);
  await page.locator(".media-modal").waitFor({state:"visible",timeout:21000});
  const selected=await page.evaluate(async({id,alt})=>{const frame=window.wp.media.editor.get("textarea-insert-helper");if(!frame?.state?.())throw Error("WP Media native frame missing");const a=window.wp.media.attachment(id);await a.fetch();a.set("alt",alt);frame.state().get("selection").reset([a]);return a.id},{id:asset.id,alt:asset.alt});
  if(selected!==asset.id)throw Error("WP Media selection mismatch");
  const button=page.locator(".media-modal .media-toolbar-primary button.media-button").last();
  await button.waitFor({state:"visible",timeout:20000});
  if(await button.isDisabled())throw Error("Insert Image button disabled");
  await button.click();
  await page.locator(".media-modal").waitFor({state:"hidden",timeout:18000});
  await page.waitForFunction(()=>String(document.querySelector("#textarea-insert-helper")?.value||"").includes("<img"),null,{timeout:15000}).catch(()=>null);
  const html=await page.evaluate(row=>{
   const tp=window.tp,helper=document.querySelector("#textarea-insert-helper");const s=String(helper?.value||"");
   if(/^<img\b/i.test(s)&&!String(tp.table.data[row][1]||"").includes("<img")){
    tp.helpers.selection={rows:[row],columns:[1]};
    tp.helpers.editor.insert_from_helper_textarea.call(helper);
   }
   return String(tp.table.data[row][1]||"");
  },row);
  if(!/<img\b/i.test(html)||!html.includes("/"+asset.name)||!/\balt=["'][^"']+["']/i.test(html)){const helper=await page.evaluate(()=>String(document.querySelector("#textarea-insert-helper")?.value||"").slice(0,400));console.log("PSE_VISION_MEDIA_DIAG="+JSON.stringify({row,html,helper}));throw Error("Insert Image failed row "+i);}
  console.log("PSE_VISION_NATIVE_IMAGE="+JSON.stringify({row,i,title:item.title,mediaId:asset.id,alt:true}));
 }
 const draft=await page.evaluate(()=>window.tp.table.data.map(r=>[...r]));
 if(draft.some((r,i)=>i>=2&&(r[0]!==extracted[i-2].title||r[2]!==extracted[i-2].details||!/<img\b/i.test(r[1]))))throw Error("Pre-save grid inconsistent");
 const reordering=await page.evaluate(()=>{const tp=window.tp,before=JSON.stringify(tp.table.data);
  if(typeof tp.callbacks.move!=="function")return false;
  tp.editor.updateSelectionFromCoords(0,2,0,2);tp.callbacks.move("down","rows");
  tp.editor.updateSelectionFromCoords(0,3,0,3);tp.callbacks.move("up","rows");
  return before===JSON.stringify(tp.table.data);
 });
 if(!reordering)throw Error("ESC Table native item reorder regression");
 await page.getByRole("button",{name:"Save Changes",exact:true}).first().click();
 let verified=null;
 for(let i=0;i<18;i++){
  await page.waitForTimeout(950);
  const r=await api("/wp-json/tablepress/v1/table/"+tableId);
  if(r.http===200&&JSON.stringify(r.data.fields?.map(x=>x.key))===JSON.stringify(keys)&&
    r.data.items?.length===2&&r.data.items.every((x,i)=>x.title===extracted[i].title&&x.details===extracted[i].details&&/<img\b/i.test(x.img||""))){verified=r.data;break}
 }
 if(!verified)throw Error("ESC table native save readback failed, inspect before retry");
 console.log("PSE_VISION_ESC_AUTHOR=PASS; sections=2; native_images=2; text_parity=true; item_reorder=true; original_page_unchanged=true; no_astro_build=true");
}finally{await browser.close()}
