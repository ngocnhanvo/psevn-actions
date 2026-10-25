/**
 * Migrate published Contact content to native ESC Table items.
 * dry: audit only; tables: native WordPress TablePress Admin UI, no Page changes;
 * page: Insert Code UI twice + native Classic Editor Save, no direct shortcode REST writes.
 */
import {chromium} from "playwright";
import {mkdir,readFile,writeFile} from "node:fs/promises";
const mode=process.env.PSE_CONTACT_STRUCTURED_MODE||"dry";
if(!["dry","tables","page"].includes(mode))throw Error("Unknown migration mode");
const pageId=47222;
const officeId="pse_contact_office_vi",warehouseId="pse_contact_warehouses_vi",formId="contact_00_vi";
const cols=["name","address","phone","fax","email","mapUrl"];
const labels=["Tên địa điểm","Địa chỉ","Điện thoại","Fax","Email","Liên kết bản đồ"];
const oldCssMarker="/* PSE_CONTACT_WORDPRESS_OWNED_LAYOUT_V1 */";
const newCssMarker="/* PSE_CONTACT_ESC_OWNED_SECTIONS_V2 */";
const newCSS=await readFile(new URL("./pse-contact-structured-sections.css",import.meta.url),"utf8");
const oldCSSFile=await readFile(new URL("./pse-contact-cms-style.css",import.meta.url),"utf8");
if(!newCSS.startsWith(newCssMarker)||!oldCSSFile.startsWith(oldCssMarker))throw Error("Unexpected CSS ownership");
const config=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const hits=config.filter(x=>x.startsWith("WC_URL="));
if(hits.length!==1)throw Error("WordPress origin missing/ambiguous");
const source=new URL(hits[0].slice(7).replace(/^['"]|['"]$/g,""));
if(source.protocol!=="https:"||source.username||source.password||source.search||source.hash||!["","/"].includes(source.pathname))throw Error("WordPress origin invalid");
const origin=source.origin;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1050}});
page.on("dialog",async d=>{try{if(d.type()==="confirm")await d.accept();else await d.dismiss()}catch(e){if(!String(e).includes("already handled"))throw e}});
try{
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WP Admin secret");
   await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
   await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
   const text=await page.locator("body").innerText();
   const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
     const q=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!(await q.count()))throw Error("WP login math challenge missing");
     await q.fill(String(n));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress login failed");
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("REST nonce unavailable");return(await r.text()).trim();
 });
 if(!/^[0-9a-zA-Z]{8,24}$/.test(nonce))throw Error("Unexpected nonce type");
 const read=async route=>page.evaluate(async({route,nonce})=>{
   const r=await fetch(route,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json","Cache-Control":"no-cache"}});
   return {http:r.status,data:await r.json().catch(()=>null)};
 },{route,nonce});
 const getPage=async()=>read("/wp-json/wp/v2/pages/"+pageId+"?context=edit&_fields=id,slug,status,acf,content");
 const p=await getPage();
 if(p.http!==200||p.data?.id!==pageId||p.data.slug!=="lien-he"||p.data.status!=="publish"||p.data.acf?.action!=="PrivatePage"||p.data.acf?.key!=="contact")throw Error("Contact Page identity mismatch");
 const raw=String(p.data.content?.raw||"");
 const oldStyle=String(p.data.acf?.cssmore||"");
 if(raw.includes("Nội dung sẽ được cập nhật khi cấu hình website mới."))throw Error("Old public editorial placeholder");
 const alreadyMigrated=raw.includes("[table id="+officeId+" /]")&&raw.includes("[table id="+warehouseId+" /]");
 const parsed=await page.evaluate(({raw,alreadyMigrated})=>{
   const holder=document.createElement("div");holder.innerHTML=raw;
   if(alreadyMigrated)return{done:true};
   const section=holder.querySelector('section[data-pse-contact-locations="source-2026-10-25"]');
   if(!section)throw Error("Original source-owned Contact HTML section absent");
   const intro=section.querySelector(".pse-contact-locations__intro");
   const office=section.querySelector(".pse-contact-locations__office .pse-location-card");
   const warehouses=[...section.querySelectorAll(".pse-contact-locations__grid .pse-location-card")];
   if(!intro||!office||warehouses.length!==5)throw Error("Contact source sections/cards unexpected");
   const extract=card=>{
     const field=label=>{
       const pair=[...card.querySelectorAll("dl > div")].find(d=>(d.querySelector("dt")?.textContent||"").trim()===label);
       return(pair?.querySelector("dd")?.textContent||"").trim();
     };
     const map=(card.querySelector(".pse-location-card__map")?.getAttribute("href")||"").trim();
     return{name:(card.querySelector("h3")?.textContent||"").trim(),
       address:field("Địa chỉ"),phone:field("Điện thoại"),fax:field("Fax"),email:field("Email"),mapUrl:map};
   };
   const records=[extract(office),...warehouses.map(extract)];
   if(records.some(r=>!r.name||!r.address||!r.phone||!r.fax||!r.mapUrl))
     return {error:"Published Contact field missing",diagnostics:records.map(r=>({name:r.name,hasAddress:!!r.address,
       hasPhone:!!r.phone,hasFax:!!r.fax,hasEmail:!!r.email,hasMap:!!r.mapUrl})),
       sourceShape:office.outerHTML.slice(0,2100)};
   if(new Set(records.map(r=>r.name)).size!==6)throw Error("Duplicate location name");
   return{done:false,records,intro:intro.outerHTML,sectionOuter:section.outerHTML};
 },{raw,alreadyMigrated});
 if(parsed.error){console.log("PSE_CONTACT_CMS_FIELD_DIAGNOSTIC="+JSON.stringify(parsed.diagnostics));console.log("PSE_CONTACT_CMS_SOURCE_SHAPE="+String(parsed.sourceShape||"").slice(0,2100));throw Error(parsed.error)}
 const getTable=async id=>read("/wp-json/tablepress/v1/table/"+id);
 const form=await getTable(formId);
 if(form.http!==200||form.data?.items?.length!==6)throw Error("Existing ESC Contact form not preserved");
 if((raw.match(/\[table\s+id=contact_00_vi\s*\/\]/gi)||[]).length!==1)throw Error("Existing form shortcode count mismatch");
 const ids=[officeId,warehouseId];
 const currentTables=await Promise.all(ids.map(getTable));
 if(currentTables.some(t=>![200,404].includes(t.http)))throw Error("Unexpected ESC table REST status");
 const plan=parsed.done?null:[
   {id:officeId,name:"Trụ sở chính",rows:[cols,labels,cols.map(c=>parsed.records[0][c]||"")]},
   {id:warehouseId,name:"Hệ thống kho hàng",rows:[cols,labels,...parsed.records.slice(1).map(r=>cols.map(c=>r[c]||""))]}
 ];
 await mkdir("artifacts/pse-contact-structured",{recursive:true});
 await writeFile("artifacts/pse-contact-structured/backup.json",JSON.stringify({pageId,content:raw,cssmore:oldStyle,action:p.data.acf.action,key:p.data.acf.key,
   existingTableIds:ids.filter((_,i)=>currentTables[i].http===200)},null,2));
 console.log("PSE_CONTACT_STRUCTURED_PREFLIGHT="+JSON.stringify({mode,sourceCards:parsed.records?.length||0,
  migrated:alreadyMigrated,tableHttp:currentTables.map(x=>x.http),
  formTable:true,oldCssLength:oldStyle.length,shortcodes:(raw.match(/\[table\s+id=/gi)||[]).length}));
 if(alreadyMigrated&&oldStyle.includes(newCssMarker)){
   for(const [i,id] of ids.entries())if(currentTables[i].http!==200)throw Error("Migrated Page references missing ESC Table "+id);
   console.log("PSE_CONTACT_STRUCTURED=ALREADY_DONE; no_cms_write=true");process.exit(0);
 }
 if(!plan||!oldStyle.includes(oldCssMarker)||oldStyle.includes(newCssMarker))
   throw Error("Source legacy CSS or Page state changed unexpectedly");
 const checkTable=(res,spec)=>{
   if(res.http!==200||res.data?.id!==spec.id)throw Error("Expected new ESC Table missing "+spec.id);
   const actualKeys=res.data.fields?.map(f=>f.key);
   if(JSON.stringify(actualKeys)!==JSON.stringify(cols))throw Error("ESC field schema mismatch "+spec.id);
   const actualRows=res.data.items?.map(item=>cols.map(c=>String(item[c]??"")));
   if(JSON.stringify(actualRows)!==JSON.stringify(spec.rows.slice(2)))throw Error("ESC item parity mismatch "+spec.id);
   if(res.data.title!==spec.name)throw Error("ESC Table title mismatch "+spec.id);
 };
 if(mode==="dry"){
   console.log("PSE_CONTACT_STRUCTURED_DRY=PASS; source=WordPress; office=1; warehouses=5; no_writes=true");
   process.exit(0);
 }
 if(mode==="tables"){
   for(const spec of plan){
     let existing=await getTable(spec.id);
     if(existing.http===200){checkTable(existing,spec);console.log("PSE_CONTACT_TABLE=ALREADY_MATCHES "+spec.id);continue}
     if(existing.http!==404)throw Error("Invalid ESC Table state "+spec.id);
     await page.goto(origin+"/wp-admin/admin.php?page=tablepress",{waitUntil:"domcontentloaded",timeout:60000});
     if((await page.locator("#wpbody-content").innerText()).includes(spec.name))
       throw Error("ESC Table title may exist under another ID; prevent duplication "+spec.id);
     await page.goto(origin+"/wp-admin/admin.php?page=tablepress_add",{waitUntil:"domcontentloaded",timeout:60000});
     await page.locator('input[name="table[name]"]').fill(spec.name);
     await page.locator('textarea[name="table[description]"]').fill("Các mục thông tin liên hệ PSE quản trị trực tiếp, nguồn WordPress");
     const nums=page.locator('input[type="number"]');
     if((await nums.count())<2)throw Error("ESC dimension editor absent");
     await nums.nth(0).fill(String(spec.rows.length));
     await nums.nth(1).fill(String(cols.length));
     await page.getByRole("button",{name:"Add Table"}).click();
     await page.locator("#table-id").waitFor({state:"visible",timeout:45000});
     if(!/^\d+$/.test(await page.locator("#table-id").inputValue()))throw Error("Unrecognized new numeric ESC ID");
     await page.locator("#table-id").fill(spec.id);await page.locator("#table-name").focus();
     await page.getByRole("button",{name:"Save Changes",exact:true}).first().click();
     await page.waitForTimeout(2300);
     const created=await getTable(spec.id);
     if(created.http!==200)throw Error("ESC Table renamed ID not confirmed "+spec.id);
     await page.goto(origin+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+spec.id,
       {waitUntil:"domcontentloaded",timeout:60000});
     await page.waitForTimeout(800);
     const before=await page.evaluate(()=>({id:window.tp?.table?.id,rows:window.tp?.table?.data?.map(r=>Array.from(r)),
       canEdit:typeof window.tp?.editor?.setValueFromCoords==="function"}));
     if(before.id!==spec.id||!before.canEdit||before.rows?.length!==spec.rows.length||
       before.rows.some(row=>row.length!==cols.length||row.some(cell=>String(cell||"").trim())))
       throw Error("Unexpected nonblank ESC Table draft "+spec.id);
     await page.evaluate(rows=>{
       const tp=window.tp;
       rows.forEach((row,y)=>row.forEach((value,x)=>{
         if(value)tp.editor.setValueFromCoords(x,y,value);
       }));tp.helpers.unsaved_changes.set();
     },spec.rows);
     await page.getByRole("button",{name:"Save Changes",exact:true}).first().click();
     await page.waitForTimeout(2300);
     checkTable(await getTable(spec.id),spec);
     console.log("PSE_CONTACT_ESC_TABLE_CREATED=PASS id="+spec.id+" items="+(spec.rows.length-2)+" via_native_ui=true");
   }
   console.log("PSE_CONTACT_STRUCTURED_TABLES=PASS; source_html_unchanged=true; form_unchanged=true; no_astro_build=true");
   process.exit(0);
 }
 // Publishing step: tables MUST already exist from native UI and preserve exactly the source content.
 for(const spec of plan)checkTable(await getTable(spec.id),spec);
 if(oldStyle.split(oldCssMarker).length!==2||!oldStyle.trimEnd().endsWith(oldCSSFile.trimEnd()))
   throw Error("Cannot isolate prior CSS section without touching unrelated cssmore");
 const nextCSS=oldStyle.slice(0,oldStyle.lastIndexOf(oldCssMarker))+newCSS;
 const sectionMatch=raw.match(/<section\b[^>]*data-pse-contact-locations=["']source-2026-10-25["'][^>]*>[\s\S]*?<\/section>/i);
 if(!sectionMatch||raw.indexOf(sectionMatch[0],sectionMatch.index+1)!==-1)throw Error("Source CMS section not uniquely replaceable");
 const hero='<section class="pse-contact-hero" aria-label="Thông tin liên hệ">'+parsed.intro+"</section>";
 const replacement=raw.slice(0,sectionMatch.index)+hero+raw.slice(sectionMatch.index+sectionMatch[0].length);
 if(!replacement.includes("[table id="+formId+" /]")||replacement.includes('class="pse-contact-locations"')||
    replacement.includes("Kho Đồng Nai")||replacement.includes("pse-location-card"))
   throw Error("Proposed Page content still contains legacy location cards");
 await page.goto(origin+"/wp-admin/post.php?post="+pageId+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 await page.locator("#content-html").click();
 const editor=page.locator("#content");await editor.waitFor({state:"visible",timeout:20000});
 await editor.fill(replacement);
 for(const entry of [{id:officeId,beforeForm:true},{id:warehouseId,beforeForm:false}]){
   const target="[table id="+entry.id+" /]";
   const seen=await editor.inputValue();
   if(seen.includes(target))throw Error("Duplicate office/warehouse shortcode insertion");
   const beforePos=entry.beforeForm?seen.indexOf("[table id="+formId+" /]"):seen.length;
   if(beforePos<0)throw Error("Existing ESC Form shortcode vanished");
   await editor.evaluate((el,pos)=>{el.focus();el.setSelectionRange(pos,pos)},beforePos);
   const open=page.locator("#qt_content_tablepress_quicktags_button");
   if(await open.isVisible())await open.click();
   else await page.evaluate(()=>{
     if(typeof window.tablepress_open_shortcode_thickbox!=="function")throw Error("Native Insert Code action missing");
     window.tablepress_open_shortcode_thickbox();
   });
   const choice=page.frameLocator("#TB_iframeContent").locator('.insert-shortcode[title*="'+entry.id+'"]');
   await choice.waitFor({state:"visible",timeout:30000});
   const title=await choice.getAttribute("title");
   if(!title?.includes(target))throw Error("Native Insert Code target table mismatch "+entry.id);
   await page.evaluate(({target,pos})=>{
     window.wpActiveEditor="content";
     const original=window.send_to_editor;
     window.__pseStructuredNative=false;
     window.send_to_editor=function(snippet){
       if(snippet!==target)return original?.call(window,snippet);
       if(typeof window.switchEditors?.go!=="function"||typeof window.QTags?.insertContent!=="function")
         throw Error("Native Quicktags insertion API missing");
       window.switchEditors.go("content","html");
       const area=document.querySelector("#content");
       if(!(area instanceof HTMLTextAreaElement))throw Error("WordPress content textarea missing");
       area.focus();area.setSelectionRange(pos,pos);window.wpActiveEditor="content";
       window.QTags.insertContent(snippet);
       window.__pseStructuredNative=true;
       window.tb_remove?.();
     };
   },{target,pos:beforePos});
   await choice.click();await page.waitForTimeout(250);
   const confirmed=await page.evaluate(id=>({
     inserted:window.__pseStructuredNative===true,
     count:(document.querySelector("#content")?.value.match(new RegExp("\\[table id="+id+" \\/\\]","g"))||[]).length
   }),entry.id);
   if(!confirmed.inserted||confirmed.count!==1)throw Error("Native Insert Code failed "+entry.id);
   console.log("PSE_CONTACT_NATIVE_INSERT=PASS id="+entry.id);
 }
 const final=await editor.inputValue();
 if((final.match(/\[table\s+id=/gi)||[]).length!==3||
    !(final.indexOf(officeId)<final.indexOf(formId)&&final.indexOf(formId)<final.indexOf(warehouseId))||
    final.includes("pse-location-card")||!final.includes("pse-contact-hero"))
   throw Error("Contact Page proposed content lacks correct native shortcode order");
 const cssField=page.locator('.acf-field[data-name="cssmore"] textarea').first();
 if(!(await cssField.count()))throw Error("CMS cssmore editor missing");
 await cssField.fill(nextCSS);
 await page.locator("#publish").click();
 await page.waitForTimeout(2300);
 let saved=null;
 for(let retry=0;retry<6;retry++){
   try{await page.waitForLoadState("domcontentloaded",{timeout:14000});saved=await getPage();break}
   catch(e){if(!/navigation|Execution context was destroyed/i.test(String(e)))throw e;await page.waitForTimeout(650)}
 }
 if(!saved)throw Error("CMS editor save did not stabilize");
 const content=String(saved.data?.content?.raw||""),style=String(saved.data?.acf?.cssmore||"");
 if(saved.http!==200||saved.data.status!=="publish"||saved.data.acf?.key!=="contact"||
    !style.includes(newCssMarker)||style.includes(oldCssMarker)||
    (content.match(/\[table\s+id=/gi)||[]).length!==3||
    ![officeId,formId,warehouseId].every(id=>content.includes("[table id="+id+" /]"))||
    content.includes("pse-location-card")||!content.includes("pse-contact-hero"))
   throw Error("CMS native Page read-after-write failed; see backup");
 console.log("PSE_CONTACT_STRUCTURED_PAGE=PASS; native_esc_shortcodes=3; editable_items=6; source_html_cards=0; cssmore_owned=true; form_preserved=true; no_build=true");
}finally{await browser.close()}