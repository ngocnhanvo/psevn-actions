/** Attach already-authored PSE awards ESC Table via native WordPress Insert Code.
 * Native Quicktags selector replaces only legacy Table_01; fail closed before Save.
 */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const vars=env.filter(x=>x.startsWith("WC_URL="));
if(vars.length!==1)throw Error("PSE WP origin not unique");
const url=new URL(vars[0].slice(7).trim().replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Invalid WP origin");
const origin=url.origin, tableId="pse_awards_vi", pageId=79311;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:950}});
page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
const hash=value=>createHash("sha256").update(value).digest("hex");
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing authorized WP credentials");
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const body=await page.locator("body").innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Login math challenge unsupported");await f.fill(String(v))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress authentication rejected");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Nonce HTTP "+r.status);return (await r.text()).trim()});
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("WP REST nonce unavailable");
 const api=route=>page.evaluate(async({route,nonce})=>{const r=await fetch(route,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});return {status:r.status,data:await r.json().catch(()=>({}))}},{route,nonce});
 const [record,table]=await Promise.all([
  api("/wp-json/wp/v2/pages/"+pageId+"?context=edit&_fields=id,status,slug,modified,content,acf,title"),
  api("/wp-json/tablepress/v1/table/"+tableId)
 ]);
 const p=record.data;
 if(record.status!==200||p?.id!==pageId||p.slug!=="thanh-tuu"||p.status!=="publish"||p.acf?.key!=="pse-company-thanh-tuu"||p.acf?.action!=="PublicPage")throw Error("Awards Page does not match verified PSE original");
 const expectedYears=["Năm 2026","Năm 2015","Năm 2013","Năm 2012","Năm 2011","Năm 2010","Năm 2009","Năm 2008"];
 const items=table.data?.items||[];
 if(table.status!==200||table.data?.id!==tableId||
   JSON.stringify(table.data.fields?.map(x=>x.key))!==JSON.stringify(["year","img","details"])||
   JSON.stringify(items.map(x=>x.year))!==JSON.stringify(expectedYears)||
   items.some(x=>!/<img\b[^>]*\balt=["'][^"']+["']/i.test(x.img||"")||!/<li[\s>]/i.test(x.details||"")))
   throw Error("ESC Table not ready or 8 awarded records drifted; Page untouched");
 const raw=String(p.content?.raw||"");
 const shortcode="[table id="+tableId+" /]";
 const existing=[...raw.matchAll(/\[table\s+id=([A-Za-z0-9_-]+)\s*\/\]/g)].map(m=>m[1]);
 if(existing.includes(tableId)&&!raw.includes("Table_01")){
   console.log("PSE_AWARDS_ESC_ATTACH=ALREADY_DONE; page="+pageId+"; do_not_save=true");
   process.exit(0);
 }
 if(existing.includes(tableId)||!raw.includes("Table_01"))throw Error("Page partially migrated; refuse overwrite");
 await mkdir("artifacts/pse-awards-esc",{recursive:true});
 await writeFile("artifacts/pse-awards-esc/before-page-attach.json",JSON.stringify({
   pageId,status:p.status,slug:p.slug,acf:p.acf,modified:p.modified,content:raw,sha256:hash(raw),tableId,
   tableYears:expectedYears,recordCount:8,readBeforeWrite:true
 },null,2)+"\n");
 await page.goto(origin+"/wp-admin/post.php?post="+pageId+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 // WordPress 7.1 Classic Editor's switchEditors.go requires a ready TinyMCE
 // iframe; switching immediately after DOMContentLoaded throws getSelection.
 await page.waitForFunction(()=>Boolean(window.tinymce?.get("content")?.getBody()),null,{timeout:25000}).catch(async()=>{
   const state=await page.evaluate(()=>({editors:(window.tinymce?.editors||[]).map(x=>({id:x.id,initialized:x.initialized})),mainEditor:!!document.querySelector("#wp-content-wrap")}));
   console.log("PSE_AWARDS_ESC_TINYMCE_DIAGNOSTIC="+JSON.stringify(state));
   throw Error("Classic Editor TinyMCE not ready; Page left unchanged");
 });
 const tab=page.locator("#content-html");
 if(!await tab.isVisible())throw Error("Native WordPress Classic Editor Text tab unavailable");
 await tab.click();
 const textarea=page.locator("textarea#content");
 if(!await textarea.isVisible()){
   await page.evaluate(()=>{
     if(typeof window.switchEditors?.go!=="function")throw Error("WordPress native switchEditors.go not available");
     window.switchEditors.go("content","html");
   });
   await page.waitForTimeout(850);
 }
 if(!await textarea.isVisible()){
   const state=await page.evaluate(()=>({wrapper:document.querySelector("#wp-content-wrap")?.className,textTab:document.querySelector("#content-html")?.className,visualTab:document.querySelector("#content-tmce")?.className,textareaHidden:document.querySelector("textarea#content")?.getAttribute("aria-hidden")}));
   console.log("PSE_AWARDS_ESC_NATIVE_TEXT_DIAGNOSTIC="+JSON.stringify(state));
   throw Error("Native WP editor text mode did not activate; no Page Save");
 }
 await textarea.waitFor({state:"visible",timeout:20000});
 const editor=await page.evaluate((raw)=>{
   const el=document.querySelector("textarea#content");
   if(!(el instanceof HTMLTextAreaElement))throw Error("WP Text editor missing");
   // WordPress's Visual -> Text conversion can rewrite the original HTML.
   // Restore the exact authenticated REST raw body in its Text editor before
   // letting the official ESC Table Insert Code UI replace ONLY Table_01.
   const wasNormalized=el.value!==raw;
   if(wasNormalized){el.value=raw;el.dispatchEvent(new Event("input",{bubbles:true}));}
   const text=el.value;
   if(text!==raw)throw Error("Cannot restore exact WordPress raw content in Text editor");
   const matches=[...text.matchAll(/<table\b[^>]*\bid\s*=\s*["']Table_01["'][^>]*>/gi)];
   if(matches.length!==1)throw Error("Expected exactly one outer legacy achievements table");
   const start=matches[0].index;
   const tail=text.slice(start);
   let depth=0,end=-1;
   const tags=/<\/?table\b[^>]*>/gi;
   for(const match of tail.matchAll(tags)){
     if(/^<\//.test(match[0]))depth--;else depth++;
     if(depth===0){end=start+match.index+match[0].length;break}
   }
   if(end<=start)throw Error("Cannot identify balanced original awards table");
   const old=text.slice(start,end);
   if(!old.includes("Table_01")||!old.includes("Năm 2026")||!old.includes("Năm 2008"))throw Error("Incorrect legacy table selected");
   const before=text.slice(0,start),after=text.slice(end);
   el.focus();el.setSelectionRange(start,end);
   return {start,end,oldLength:old.length,before,after};
 },raw);
 const insertButton=page.locator("#qt_content_tablepress_quicktags_button");
 if(!await insertButton.isVisible())throw Error("Native ESC Table Insert Code Quicktags button unavailable");
 await insertButton.click();
 const frame=page.locator("#TB_iframeContent");
 await frame.waitFor({state:"visible",timeout:25000});
 const nativeInsert=page.frameLocator("#TB_iframeContent").locator('input.insert-shortcode[title="'+shortcode+'"]');
 await nativeInsert.waitFor({state:"visible",timeout:20000});
 await nativeInsert.click();
 await frame.waitFor({state:"hidden",timeout:30000});
 const inserted=await textarea.inputValue();
 const tokens=[...inserted.matchAll(/\[table\s+id=([A-Za-z0-9_-]+)\s*\/\]/g)].map(x=>x[1]);
 if(JSON.stringify(tokens)!==JSON.stringify([tableId])||inserted.includes("Table_01")||
   !inserted.startsWith(editor.before)||!inserted.endsWith(editor.after)||
   inserted.slice(editor.before.length,inserted.length-editor.after.length).trim()!==shortcode) {
   console.log("PSE_AWARDS_ESC_ATTACH_INSERT_DIAGNOSTIC="+JSON.stringify({
      shortcodeCount:tokens.length,oldStillExists:inserted.includes("Table_01"),
      beforePreserved:inserted.startsWith(editor.before),
      afterPreserved:inserted.endsWith(editor.after),oldLength:editor.oldLength,newLength:inserted.length
   }));
   throw Error("Native Insert Code did not precisely replace legacy award table; Page not saved");
 }
 if(process.env.PSE_AWARDS_ESC_ATTACH_READONLY==="1"){
   console.log("PSE_AWARDS_ESC_ATTACH_PREVIEW=PASS; mode=read_only; no_page_save=true; old_len="+editor.oldLength);
   process.exit(0);
 }
 const update=page.locator("#publish");
 if(!await update.isVisible())throw Error("Published Page native Update button missing");
 await update.click();
 await page.waitForLoadState("domcontentloaded");
 const post=await api("/wp-json/wp/v2/pages/"+pageId+"?context=edit&_fields=id,status,slug,modified,content,acf");
 const saved=String(post.data?.content?.raw||"");
 if(post.status!==200||post.data.id!==pageId||post.data.status!=="publish"||
   post.data.acf?.action!=="PublicPage"||post.data.acf?.key!=="pse-company-thanh-tuu"||
   saved!==inserted)throw Error("WordPress native Page Save / REST readback mismatch; inspect and restore Page version");
 console.log("PSE_AWARDS_ESC_ATTACH=PASS; page=79311; section="+tableId+"; native_insert_code=true; legacy_removed=true; original_outer_content_preserved=true; no_astro_build=true");
}finally{await browser.close()}
