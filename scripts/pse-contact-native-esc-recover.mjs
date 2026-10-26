/** Recover only the two native TablePress/ESC references after Classic Editor saved partial section content.
 * Never create tables, duplicate form, rewrite business content, use REST writes, or build Astro.
 */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const apply=process.env.PSE_CONTACT_RECOVER_APPLY==="true";
const ids=["pse_contact_office_vi","contact_00_vi","pse_contact_warehouses_vi"];
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const hits=vars.filter(x=>x.startsWith("WC_URL="));if(hits.length!==1)throw Error("WP URL missing");
const u=new URL(hits[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unsafe CMS origin");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on("dialog",async d=>{try{if(d.type()==="confirm")await d.accept();else await d.dismiss()}catch(e){if(!String(e).includes("already handled"))throw e}});
try{
 await page.goto(u.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP secret absent");
   await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
   await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
   const text=await page.locator("body").innerText();
   const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
     const c=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!(await c.count()))throw Error("Missing login challenge");await c.fill(String(n));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login failed");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("No REST nonce");return(await r.text()).trim()});
 const read=async route=>page.evaluate(async({route,nonce})=>{
   const r=await fetch(route,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});
   return {http:r.status,data:await r.json().catch(()=>null)};
 },{route,nonce});
 const target="/wp-json/wp/v2/pages/47222?context=edit&_fields=id,slug,status,acf,content";
 const before=await read(target);
 if(before.http!==200||before.data?.id!==47222||before.data.slug!=="lien-he"||
    before.data.status!=="publish"||before.data.acf?.action!=="PrivatePage"||
    before.data.acf?.key!=="contact")throw Error("Wrong WordPress Page");
 const raw=String(before.data.content?.raw||""),css=String(before.data.acf?.cssmore||"");
 const shortcodeList=()=>[...raw.matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(m=>m[1]);
 const hasOriginal=raw.includes('data-pse-contact-locations="source-2026-10-25"');
 const hasNew=css.includes("PSE_CONTACT_ESC_OWNED_SECTIONS_V2");
 if(!hasNew||hasOriginal||!raw.includes("pse-contact-hero")||
    raw.includes("pse-location-card")||shortcodeList().filter(x=>x==="contact_00_vi").length!==1)
   throw Error("Contact page no longer in known partial CMS state");
 const tables=await Promise.all(ids.map(id=>read("/wp-json/tablepress/v1/table/"+id)));
 if(tables.some(t=>t.http!==200))throw Error("Required native ESC Table missing");
 if(tables[0].data?.items?.length!==1||tables[1].data?.items?.length!==6||
   tables[2].data?.items?.length!==5)throw Error("ESC item parity changed");
 const sc=shortcodeList();
 await mkdir("artifacts/pse-contact-native-recovery",{recursive:true});
 await writeFile("artifacts/pse-contact-native-recovery/original.json",JSON.stringify({
   id:47222,raw,cssmore:css,items:tables.map((t,i)=>({id:ids[i],items:t.data.items}))},null,2));
 console.log("PSE_CONTACT_RECOVERY_PREFLIGHT="+JSON.stringify({apply,shortcodes:sc,
   cmsBodyLength:raw.length,cssNative:true,tableItems:[1,6,5]}));
 if(sc.length===3&&ids.every(x=>sc.includes(x))){console.log("PSE_CONTACT_RECOVERY=ALREADY_DONE; no_writes=true");process.exit(0)}
 if(sc.length!==1||sc[0]!=="contact_00_vi")throw Error("Unexpected partial shortcode pattern; do not duplicate");
 if(!apply){console.log("PSE_CONTACT_RECOVERY=DRY_PASS; no_writes=true");process.exit(0)}
 await page.goto(u.origin+"/wp-admin/post.php?post=47222&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 await page.locator("#content-html").click();
 const editor=page.locator("#content");await editor.waitFor({state:"attached"});
 const start=await editor.inputValue();
 if(!start.includes("pse-contact-hero")||!start.includes("[table id=contact_00_vi /]"))
   throw Error("Wrong Classic Editor content");
 const diagnostics=await page.evaluate(()=>{
   const area=document.querySelector("#content");const tin=window.tinymce?.get("content");
   const wrapper=document.querySelector("#wp-content-wrap");
   return {codeTab:wrapper?.className,textareaHidden:area?.getClientRects().length===0,
     tinymcePresent:!!tin,tinymceHidden:tin?tin.isHidden():null,
     activeEditorId:window.tinymce?.activeEditor?.id||null,wpActiveEditor:window.wpActiveEditor};
 });
 console.log("PSE_CONTACT_RECOVERY_EDITOR_BEFORE="+JSON.stringify(diagnostics));
 for(const entry of [{id:ids[0],before:true},{id:ids[2],before:false}]){
   const source=await editor.inputValue(),snippet="[table id="+entry.id+" /]";
   if(source.includes(snippet))throw Error("Unexpected duplicate before UI insertion");
   const pos=entry.before?source.indexOf("[table id=contact_00_vi /]"):source.length;
   if(pos<0)throw Error("Contact form shortcode absent in editor");
   await editor.evaluate((area,pos)=>{area.focus();area.setSelectionRange(pos,pos)},pos);
   const button=page.locator("#qt_content_tablepress_quicktags_button");
   if(await button.isVisible())await button.click();
   else await page.evaluate(()=>{
     if(typeof window.tablepress_open_shortcode_thickbox!=="function")throw Error("Native Insert Code unavailable");
     window.tablepress_open_shortcode_thickbox();
   });
   const option=page.frameLocator("#TB_iframeContent").locator('.insert-shortcode[title*="'+entry.id+'"]');
   try {
     await option.waitFor({state:"visible",timeout:14000});
   } catch(e) {
     const modalState=await page.evaluate(()=>({
       thickboxVisible:!!document.querySelector("#TB_window")?.getClientRects().length,
       iframe:!!document.querySelector("#TB_iframeContent"),
       active:window.wpActiveEditor,
       list:document.querySelector("#TB_iframeContent")?.getAttribute("src")?.split("?")[0]||""
     }));
     let options=[];
     try{options=await page.frameLocator("#TB_iframeContent").locator(".insert-shortcode").evaluateAll(nodes=>nodes.map(x=>x.getAttribute("title")).slice(0,15))}catch{}
     console.log("PSE_CONTACT_NATIVE_INSERT_MODAL_DIAGNOSTIC="+JSON.stringify({id:entry.id,modalState,options}));
     throw e;
   }
   if(!(await option.getAttribute("title"))?.includes(snippet))throw Error("Wrong ESC Table in Insert Code");
   await page.evaluate(({snippet,pos})=>{
     window.wpActiveEditor="content";
     const original=window.send_to_editor;
     window.__pseNativeRecovered=false;
     window.send_to_editor=function(value){
       if(value!==snippet)return original?.call(window,value);
       if(typeof window.QTags?.insertContent!=="function")throw Error("Native Quicktags unavailable");
       const area=document.querySelector("#content");
       if(!(area instanceof HTMLTextAreaElement))throw Error("Missing editor textarea");
       area.focus();area.setSelectionRange(pos,pos);
       window.QTags.insertContent(value);
       window.__pseNativeRecovered=true;
       window.tb_remove?.();
     };
   },{snippet,pos});
   await option.click();
   const confirmed=await page.evaluate(id=>({
      native:window.__pseNativeRecovered===true,
      count:(document.querySelector("#content")?.value.match(new RegExp("\\[table id="+id+" \\/\\]","g"))||[]).length
   }),entry.id);
   if(!confirmed.native||confirmed.count!==1)throw Error("Native Insert Code did not insert "+entry.id);
   console.log("PSE_CONTACT_RECOVERY_INSERT=PASS "+entry.id);
   await page.locator("#TB_window").waitFor({state:"hidden",timeout:10000});
   await page.waitForTimeout(650);
 }
 const finalText=await editor.inputValue();
 const all=[...finalText.matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(m=>m[1]);
 if(JSON.stringify(all)!==JSON.stringify(ids))throw Error("Native editor shortcode order changed");
 // Synchronize with the active TinyMCE editor before Classic WordPress serializes
 // the form. Otherwise the stale Visual buffer silently overwrites Quicktags inserts.
 const synced=await page.evaluate(expected=>{
    const textarea=document.querySelector("#content");
    if(!(textarea instanceof HTMLTextAreaElement)||textarea.value!==expected)
      throw Error("Classic editor raw value changed");
    const editor=window.tinymce?.get("content");
    const result={hasTinyMce:!!editor,hidden:editor?.isHidden()??null};
    if(editor){
      if(typeof editor.setContent!=="function"||typeof editor.save!=="function")
        throw Error("TinyMCE editor synchronization unavailable");
      editor.setContent(expected);
      editor.save();
    }
    textarea.dispatchEvent(new Event("input",{bubbles:true}));
    textarea.dispatchEvent(new Event("change",{bubbles:true}));
    result.after=[...textarea.value.matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(x=>x[1]);
    return result;
 },finalText);
 console.log("PSE_CONTACT_RECOVERY_EDITOR_SYNC="+JSON.stringify(synced));
 if(JSON.stringify(synced.after)!==JSON.stringify(ids))throw Error("TinyMCE synchronization lost a native shortcode");
 await page.locator("#publish").click();
 await page.waitForTimeout(2400);
 const next=await read(target);
 const latest=String(next.data?.content?.raw||"");
 const actual=[...latest.matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(x=>x[1]);
 console.log("PSE_CONTACT_RECOVERY_READBACK="+JSON.stringify({http:next.http,ids:actual,
   length:latest.length,hero:latest.includes("pse-contact-hero"),noOldCards:!latest.includes("pse-location-card"),
   cssNative:String(next.data?.acf?.cssmore||"").includes("PSE_CONTACT_ESC_OWNED_SECTIONS_V2")}));
 if(next.http!==200||JSON.stringify(actual)!==JSON.stringify(ids)||
   !latest.includes("pse-contact-hero")||latest.includes("pse-location-card")||
   !String(next.data?.acf?.cssmore||"").includes("PSE_CONTACT_ESC_OWNED_SECTIONS_V2"))
   throw Error("Native WordPress recovery not persisted; do not claim success");
 console.log("PSE_CONTACT_RECOVERY=PASS; native_shortcodes=3; editable_locations=6; form_preserved=true; no_build=true");
}finally{await browser.close()}