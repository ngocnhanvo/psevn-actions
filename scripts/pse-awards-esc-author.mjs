/** Author isolated G8 WordPress ESC Table through native Add Table, Advanced Editor, Insert Image. Do not alter published Page. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const keys=lines.filter(x=>x.startsWith("WC_URL="));
if(keys.length!==1)throw Error("PSE origin missing");
const u=new URL(keys[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||!["","/"].includes(u.pathname)||u.search||u.hash)throw Error("Invalid CMS origin");
const origin=u.origin, tableId="pse_awards_vi";
const years=["Năm 2026","Năm 2015","Năm 2013","Năm 2012","Năm 2011","Năm 2010","Năm 2009","Năm 2008"];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1550,height:1000}});
page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
const api=async(route,nonce)=>page.evaluate(async({route,nonce})=>{const r=await fetch(route,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});return {status:r.status,body:await r.json().catch(()=>({}))}},{route,nonce});
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WP admin credentials");
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await page.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("WP captcha input missing");await f.fill(String(v))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress authentication rejected");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("WP nonce HTTP "+r.status);return (await r.text()).trim()});
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("WP nonce unavailable");
 const wp=await api("/wp-json/wp/v2/pages/79311?context=edit&_fields=id,slug,status,acf,content,modified",nonce);
 if(wp.status!==200||wp.body?.id!==79311||wp.body?.slug!=="thanh-tuu"||wp.body?.status!=="publish"||wp.body?.acf?.action!=="PublicPage"||wp.body?.acf?.key!=="pse-company-thanh-tuu")throw Error("Wrong awards Page");
 const raw=wp.body.content?.raw||"";
 const awards=await page.evaluate(html=>{
   const root=document.createElement("div");root.innerHTML=html;const nested=root.querySelector('table#Table_01 table');
   if(!nested)throw Error("Legacy award table missing");
   const rows=[...nested.querySelectorAll("tr")].filter(r=>r.closest("table")===nested);
   return rows.map(row=>{const cells=[...row.children].filter(c=>/^(TD|TH)$/.test(c.tagName));if(cells.length!==2)throw Error("Invalid award row structure");
    const img=cells[0].querySelector("img"),year=(cells[1].querySelector("div")?.textContent||"").trim().replace(/\s+/g," ");
    const list=[...cells[1].querySelectorAll("li")].map(li=>li.innerHTML);
    return {year,src:img?.getAttribute("src")||"",list};
   });
 },raw);
 if(awards.length!==8||awards.some((a,i)=>a.year!==years[i]||!a.src||!a.list.length)||awards.reduce((n,a)=>n+a.list.length,0)!==17)throw Error("CMS award content drift, refuse authoring");
 const media=await api("/wp-json/wp/v2/media?context=edit&search=pse-corp-thanh-tuu&per_page=100",nonce);
 if(media.status!==200||!Array.isArray(media.body))throw Error("WP media inventory failed");
 const images=awards.map(a=>{const name=decodeURIComponent(new URL(a.src,origin).pathname.split("/").at(-1)||"");const list=media.body.filter(m=>(m.media_details?.file||"").split("/").at(-1)===name);
  if(list.length!==1)throw Error("Media ID not unique for "+a.year);return {id:list[0].id,name};
 });
 await mkdir("artifacts/pse-awards-esc",{recursive:true});
 await writeFile("artifacts/pse-awards-esc/before-authoring.json",JSON.stringify({
   pageId:wp.body.id,pageStatus:wp.body.status,acf:wp.body.acf,modified:wp.body.modified,content:raw,
   sha256:createHash("sha256").update(raw).digest("hex"),awards,images,createdAt:new Date().toISOString()
 },null,2)+"\n");
 const keysExpected=["year","img","details"];
 const expectedDetails=awards.map(a=>a.list.map(li=>"<li>"+li+"</li>").join(""));
 const check=await api("/wp-json/tablepress/v1/table/"+tableId,nonce);
 if(check.status===200){
  if(check.body.id!==tableId||JSON.stringify(check.body.fields?.map(f=>f.key))!==JSON.stringify(keysExpected)||
     check.body.items?.length!==8||check.body.items.some((item,i)=>item.year!==awards[i].year||
       item.details!==expectedDetails[i]||!/<img\\b[^>]*\\balt=["'][^"']+["']/i.test(item.img||"")))
      throw Error("An ESC Table exists with incomplete/foreign data: no overwrite. ID "+tableId);
  console.log("PSE_AWARDS_ESC_AUTHOR=ALREADY_DONE; table="+tableId+"; count=8; no_page_edit=true");process.exit(0);
 }
 if(check.status!==404)throw Error("ESC Table route not safely absent, HTTP "+check.status);
 // Native ESC Table authoring, entirely separate from the published Page.
 await page.goto(origin+"/wp-admin/admin.php?page=tablepress_add",{waitUntil:"domcontentloaded",timeout:60000});
 await page.locator('input[name="table[name]"]').fill("PSE - Thành tựu, 8 giải thưởng");
 await page.locator('textarea[name="table[description]"]').fill("Mỗi dòng ESC Table là một giải thưởng có Năm, ảnh Insert Image và các nội dung chi tiết riêng.");
 const sizes=page.locator('input[type="number"]');if(await sizes.count()<2)throw Error("ESC Add Table schema missing");
 await sizes.nth(0).fill("10");await sizes.nth(1).fill("3");
 await page.getByRole("button",{name:"Add Table"}).click();
 await page.locator("#table-id").waitFor({state:"visible",timeout:30000});
 if(await page.locator("#table-id").getAttribute("readonly")!==null)throw Error("Cannot name ESC Table");
 await page.locator("#table-id").fill(tableId);
 await page.locator("#table-name").focus();
 await page.getByRole("button",{name:/Save Changes|Lưu thay đổi/i}).first().click();
 await page.waitForTimeout(1500);
 await page.goto(origin+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+tableId,{waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&typeof window.tp?.callbacks?.insert_image?.open_dialog==="function"&&typeof window.tp?.callbacks?.advanced_editor?.open_dialog==="function",null,{timeout:25000});
 const state=await page.evaluate(()=>({id:window.tp.table.id,rows:window.tp.table.data.length,cols:window.tp.table.data[0]?.length,blank:window.tp.table.data.every(r=>r.every(x=>!String(x||"").trim()))}));
 if(state.id!==tableId||state.rows!==10||state.cols!==3||!state.blank)throw Error("ESC Table newly created but blank schema mismatch "+JSON.stringify(state));
 await page.evaluate((awards)=>{
  const tp=window.tp;
  [["year","img","details"],["Năm giải thưởng","Ảnh giải thưởng (Insert Image)","Nội dung từng giải thưởng (Advanced Editor)"]].forEach((row,y)=>row.forEach((v,x)=>tp.editor.setValueFromCoords(x,y,v)));
  awards.forEach((a,i)=>tp.editor.setValueFromCoords(0,i+2,a.year));
  tp.helpers.unsaved_changes.set();
 },awards);
 for(let i=0;i<awards.length;i++){
  const row=i+2;
  // Native Advanced Editor is WordPress ESC Table's code authoring control.
  await page.evaluate(({row})=>{const tp=window.tp;tp.editor.updateSelectionFromCoords(2,row,2,row);tp.callbacks.advanced_editor.open_dialog(null)},{row});
  const edit=page.locator("#advanced-editor-content");
  await edit.fill(expectedDetails[i]);
  await page.locator(".ui-dialog .button-ok").last().click();
  const code=await page.evaluate(row=>String(window.tp.table.data[row][2]||""),row);
  if(code!==expectedDetails[i])throw Error("Native Advanced Editor output mismatch row "+row);
  const label=await page.evaluate(({year,html})=>{const root=document.createElement("div");root.innerHTML=html;const first=(root.querySelector("li")?.textContent||"").replace(/\s+/g," ").trim();return (first||"Thành tựu của PVFCCo-PSE")+" ("+year+")"},{year:awards[i].year,html:expectedDetails[i]});
  const alt=label.slice(0,170);
  // Use native ESC Table Insert Image, selecting the verified original WordPress Media attachment.
  await page.evaluate(row=>{const tp=window.tp;tp.editor.updateSelectionFromCoords(1,row,1,row);tp.editor.setValueFromCoords(1,row,"");tp.callbacks.insert_image.open_dialog(null)},row);
  await page.locator(".media-modal").waitFor({state:"visible",timeout:20000});
  const image=images[i];
  const chosen=await page.evaluate(async({id,alt})=>{const frame=window.wp.media.editor.get("textarea-insert-helper");if(!frame?.state?.())throw Error("Missing native WP media frame");const a=window.wp.media.attachment(id);await a.fetch();if(!a.get("url"))throw Error("Missing WP Media source");a.set("alt",alt);frame.state().get("selection").reset([a]);return {id:a.id,alt:a.get("alt")}},{id:image.id,alt});
  if(chosen.id!==image.id||chosen.alt!==alt)throw Error("Wrong WP attachment");
  const insert=page.locator(".media-modal .media-toolbar-primary button.media-button").last();
  await insert.waitFor({state:"visible",timeout:20000});
  if(await insert.isDisabled())throw Error("Insert Image button disabled");
  await insert.click();
  await page.locator(".media-modal").waitFor({state:"hidden",timeout:18000});
  const result=await page.evaluate(({row})=>{
   const tp=window.tp,helper=document.querySelector("#textarea-insert-helper");
   const html=String(helper?.value||"");
   if(/^<img\b/i.test(html)&&!String(tp.table.data[row][1]||"").includes("<img")){
    tp.helpers.selection={rows:[row],columns:[1]};
    tp.helpers.editor.insert_from_helper_textarea.call(helper);
   }
   return String(tp.table.data[row][1]||"");
  },{row});
  if(!/<img\b/i.test(result)||!result.includes("/"+image.name)||!/\balt=["'][^"']+["']/i.test(result))throw Error("Native Insert Image failed row "+row);
  console.log("PSE_AWARDS_ESC_CELL="+JSON.stringify({row:row+1,year:awards[i].year,mediaId:image.id,hasAlt:true,source:"native-editor"}));
 }
 const draft=await page.evaluate(()=>window.tp.table.data.map(row=>[...row]));
 if(draft.length!==10||draft.slice(2).some((r,i)=>r[0]!==awards[i].year||r[2]!==expectedDetails[i]||!/<img\b/i.test(r[1])))throw Error("Pre-save award schema mismatch");
 // Test native row move and reverse without persisting reordering.
 const moved=await page.evaluate(()=>{const tp=window.tp;const before=JSON.stringify(tp.table.data);
  tp.editor.updateSelectionFromCoords(0,2,0,2);
  if(typeof tp.callbacks.move!=="function")return {available:false};
  tp.callbacks.move("down","rows");tp.editor.updateSelectionFromCoords(0,3,0,3);tp.callbacks.move("up","rows");
  return {available:true,restored:JSON.stringify(tp.table.data)===before};
 });
 if(!moved.available||!moved.restored)throw Error("ESC Table row reorder/restore callback did not preserve schema");
 await page.getByRole("button",{name:"Save Changes",exact:true}).first().click();
 let verified=null;
 for(let i=0;i<18;i++){await page.waitForTimeout(1000);const r=await api("/wp-json/tablepress/v1/table/"+tableId,nonce);
  if(r.status===200&&JSON.stringify(r.body.fields?.map(f=>f.key))===JSON.stringify(keysExpected)&&r.body.items?.length===8&&r.body.items.every((x,i)=>x.year===awards[i].year&&x.details===expectedDetails[i]&&/<img\b/i.test(x.img||""))){verified=r.body;break}
 }
 if(!verified)throw Error("ESC Table REST read-after-write failed; inspect table before retry");
 console.log("PSE_AWARDS_ESC_AUTHOR=PASS; rows=8; bullets=17; native_insert_image=8; advanced_editor=8; row_move_restore=true; page_79311_unchanged=true; no_build=true");
}finally{await browser.close()}
