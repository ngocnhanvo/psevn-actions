/** Idempotent native Insert Code attachment for PSE corporate history. */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const env=rows.filter(s=>s.startsWith("WC_URL="));
if(env.length!==1)throw Error("WP origin missing");
const u=new URL(env[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Bad WP origin");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WordPress credentials unavailable");
const origin=u.origin,pageId=79301,tableId="pse_history_vi",shortcode="[table id=pse_history_vi /]";
const hash=s=>createHash("sha256").update(s).digest("hex");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1500,height:950}});
page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
try{
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await page.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("WP login input missing");await f.fill(String(v));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress login failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce missing");return (await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Invalid WP nonce");
 const get=route=>page.evaluate(async({route,nonce})=>{
  const r=await fetch(route,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});
  return {http:r.status,data:await r.json().catch(()=>({}))}
 },{route,nonce});
 const [p,t]=await Promise.all([
  get("/wp-json/wp/v2/pages/"+pageId+"?context=edit&_fields=id,slug,status,acf,content,modified"),
  get("/wp-json/tablepress/v1/table/"+tableId)
 ]);
 if(p.http!==200||p.data?.id!==pageId||p.data.slug!=="qua-trinh-hinh-thanh-phat-trien"||
  p.data.status!=="publish"||p.data.acf?.key!=="pse-company-qua-trinh-hinh-thanh-phat-trien"||
  p.data.acf?.action!=="PublicPage")throw Error("Wrong PSE corporate Page; no write");
 const dates=["07/08/2008","01/09/2008","22/12/2010","12/01/2011","30/01/2011","01/02/2011"];
 if(t.http!==200||t.data?.id!==tableId||
    JSON.stringify(t.data.fields?.map(f=>f.key))!==JSON.stringify(["date","title","details"])||
    JSON.stringify(t.data.items?.map(x=>x.date))!==JSON.stringify(dates)||
    t.data.items.some(item=>!item.title||!item.details))throw Error("Native ESC Table incomplete; Page untouched");
 const raw=String(p.data.content?.raw||"");
 if(raw.includes(shortcode)&&!/<table\b/i.test(raw)&&raw.includes("pse-history-cover")&&/<img\b/i.test(raw)){
  console.log("PSE_HISTORY_ESC_ATTACH=ALREADY_DONE; no_duplicate=true");process.exit(0);
 }
 if(raw.includes(shortcode))throw Error("Partial existing shortcode; Page untouched");
 const sourceText=await page.evaluate(html=>{
   const root=document.createElement("div");root.innerHTML=html;
   const table=root.querySelector("table");
   if(root.children.length!==1||root.querySelectorAll("table").length!==1)throw Error("Unexpected history source table count");
   const cells=[...table.querySelectorAll("td")];
   if(cells.length!==7||cells[0].querySelectorAll("img").length!==1||
      !cells[0].querySelector("img")?.getAttribute("alt"))throw Error("Source image/table changed");
   const paras=[...cells[2].querySelectorAll("p")];
   if(paras.length!==6)return "";
   return paras.map(p=>(p.textContent||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim()).join(" ");
 },raw);
 const tableText=await page.evaluate(items=>{
  const node=document.createElement("div");
  return items.map(item=>{node.innerHTML=item.details;
   return (node.textContent||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim()}).join(" ");
 },t.data.items);
 if(sourceText!==tableText){
  console.log("PSE_HISTORY_SOURCE_PARITY="+JSON.stringify({sourceHash:hash(sourceText),escHash:hash(tableText),sourceLen:sourceText.length,escLen:tableText.length}));
  throw Error("History content source vs ESC items differs; refuse migration");
 }
 await mkdir("artifacts/pse-history-esc",{recursive:true});
 await writeFile("artifacts/pse-history-esc/before-attach.json",JSON.stringify({
  pageId,slug:p.data.slug,status:p.data.status,modified:p.data.modified,
  acf:p.data.acf,raw,sha256:hash(raw),items:t.data.items
 },null,2)+"\n");
 await page.goto(origin+"/wp-admin/post.php?post="+pageId+"&action=edit",
  {waitUntil:"domcontentloaded",timeout:60000});
 const state=await page.evaluate(()=>({
  path:location.pathname,login:!!document.querySelector("#user_login"),
  nativeEditor:!!document.querySelector("form#post"),
  tab:!!document.querySelector("#content-html"),
  textVisible:!!document.querySelector("textarea#content")&&
    getComputedStyle(document.querySelector("textarea#content")).display!=="none",
  tinymce:!!window.tinymce?.get("content")?.getBody(),
  activeMode:document.querySelector("#wp-content-wrap")?.className||""
 }));
 console.log("PSE_HISTORY_EDITOR_PREFLIGHT="+JSON.stringify(state));
 if(state.login||!state.nativeEditor||!state.tab)throw Error("Expected native WP Page editor, no write");
 if(!state.textVisible){
  // The editor may be configured in Text mode and never initialize TinyMCE.
  // Wait only for the editor control, not for a Visual-mode-only iframe.
  await page.waitForFunction(()=>Boolean(window.tinymce?.get("content")?.getBody())||
     document.querySelector("#wp-content-wrap")?.classList.contains("html-active"),
     null,{timeout:20000}).catch(()=>null);
 }
 await page.locator("#content-html").click();
 const textarea=page.locator("textarea#content");
 if(!await textarea.isVisible()){
  await page.evaluate(()=>window.switchEditors?.go("content","html"));
  await page.waitForTimeout(900);
 }
 if(!await textarea.isVisible())throw Error("WP Classic Editor Text mode unavailable");
 const segment=await page.evaluate(raw=>{
  const el=document.querySelector("textarea#content");
  if(!(el instanceof HTMLTextAreaElement))throw Error("Editor textarea missing");
  if(el.value!==raw){el.value=raw;el.dispatchEvent(new Event("input",{bubbles:true}))}
  if(el.value!==raw)throw Error("Cannot restore original WordPress body");
  const matches=[...raw.matchAll(/<table\b[^>]*>/gi)];
  if(matches.length!==1)throw Error("History Page no longer has one legacy table");
  const start=matches[0].index;
  let depth=0,end=-1;
  for(const m of raw.slice(start).matchAll(/<\/?table\b[^>]*>/gi)){
   depth+=/^<\//.test(m[0])?-1:1;
   if(depth===0){end=start+m.index+m[0].length;break}
  }
  if(end<=start)throw Error("Unbalanced historical table");
  const old=raw.slice(start,end);
  const container=document.createElement("div");container.innerHTML=old;
  const table=container.querySelector("table");
  const image=table?.querySelector("img");
  if(!["07/08/2008","01/02/2011"].every(d=>old.includes(d))||
    table?.querySelectorAll("img").length!==1||!image?.getAttribute("alt")||
    !image.getAttribute("src")||table.querySelectorAll("td").length!==7)
    throw Error("Historical source changed, refuse replacement");
  // Preserve the exact existing CMS image as regular WordPress editorial HTML.
  // Only the timeline shortcode below is inserted by the native Insert Code UI.
  const cover='<figure class="pse-history-cover">'+image.outerHTML+"</figure>\n\n";
  const next=raw.slice(0,start)+cover+raw.slice(end);
  el.value=next;el.dispatchEvent(new Event("input",{bubbles:true}));
  el.focus();el.setSelectionRange(start+cover.length,start+cover.length);
  return {before:raw.slice(0,start),after:raw.slice(end),cover,oldLength:old.length};
 },raw);
 const button=page.locator("#qt_content_tablepress_quicktags_button");
 if(!await button.isVisible())throw Error("Native ESC Table Insert Code button missing");
 await button.click();
 const iframe=page.locator("#TB_iframeContent");
 await iframe.waitFor({state:"visible",timeout:25000});
 await page.frameLocator("#TB_iframeContent").locator('input.insert-shortcode[title="'+shortcode+'"]').click();
 await iframe.waitFor({state:"hidden",timeout:30000});
 const inserted=await textarea.inputValue();
 const ids=[...inserted.matchAll(/\[table\s+id=([A-Za-z0-9_-]+)\s*\/\]/g)].map(x=>x[1]);
 const body=inserted.slice(segment.before.length,inserted.length-segment.after.length);
 const preview=/<div\b(?=[^>]*\bclass=(["'])[^"']*\btablepress-preview-wrap\b[^"']*\1)[^>]*>\s*(?:<img\b[^>]*>\s*)?<span\b(?=[^>]*\bclass=(["'])[^"']*\btablepress-preview-badge\b[^"']*\2)[^>]*>\s*(\[table\s+id=([a-z0-9_-]+)\s*\/\])\s*<\/span>\s*<\/div>/gi;
 const unwrap=s=>s.replace(preview,(all,_a,_b,token,id)=>{
  const div=all.slice(0,all.indexOf(">")+1);
  const mark=/\bdata-table-id=(["'])([a-z0-9_-]+)\1/i.exec(div)?.[2];
  return id===tableId&&mark===tableId&&token===shortcode?shortcode:all;
 });
 if(JSON.stringify(ids)!==JSON.stringify([tableId])||!inserted.startsWith(segment.before)||
    !inserted.endsWith(segment.after)||!body.startsWith(segment.cover)||unwrap(body.slice(segment.cover.length)).trim()!==shortcode) {
  console.log("PSE_HISTORY_INSERT_DIAGNOSTIC="+JSON.stringify({
   ids,prefix:inserted.startsWith(segment.before),suffix:inserted.endsWith(segment.after),
   body:body.slice(0,350),oldLength:segment.oldLength
  }));
  throw Error("Native Insert Code output does not isolate history table, Page untouched");
 }
 if(process.env.PSE_HISTORY_ATTACH_DRY==="1"){
  console.log("PSE_HISTORY_ESC_ATTACH=PREFLIGHT_PASS; no_page_write=true");process.exit(0);
 }
 const navigation=page.waitForNavigation({waitUntil:"domcontentloaded",timeout:18000}).catch(()=>null);
 await page.locator("#publish").click();await navigation;
 let saved="",result=null;
 for(let n=0;n<10;n++){
  result=await get("/wp-json/wp/v2/pages/"+pageId+"?context=edit&_fields=id,slug,status,acf,content,modified");
  saved=String(result.data?.content?.raw||"");
  if(saved!==raw)break;
  await page.waitForTimeout(900);
 }
 const tokens=[...saved.matchAll(/\[table\s+id=([A-Za-z0-9_-]+)\s*\/\]/g)].map(x=>x[1]);
 const middle=saved.startsWith(segment.before)&&saved.endsWith(segment.after)
  ?saved.slice(segment.before.length,saved.length-segment.after.length):"";
 if(result?.http!==200||result.data?.id!==pageId||result.data?.status!=="publish"||
  result.data.acf?.key!=="pse-company-qua-trinh-hinh-thanh-phat-trien"||
  result.data.acf?.action!=="PublicPage"||
  JSON.stringify(tokens)!==JSON.stringify([tableId])||
  !middle.startsWith(segment.cover)||unwrap(middle.slice(segment.cover.length)).trim()!==shortcode||/<table\b/i.test(saved))
  throw Error("Native Page save/readback not verified, inspect revision");
 console.log("PSE_HISTORY_ESC_ATTACH=PASS; page=79301; table="+tableId+
  "; native_insert_code=true; six_milestones_preserved=true; no_astro_build=true");
}finally{await browser.close()}
