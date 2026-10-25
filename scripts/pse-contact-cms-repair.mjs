import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const apply=process.env.PSE_CONTACT_CMS_APPLY==="true";
const tableId="contact_00_vi",pageId=47222,marker="/* PSE_CONTACT_WORDPRESS_OWNED_LAYOUT_V1 */";
const cells=[
 ["key","label","required"],
 ["Mã trường","Nhãn trên form","Bắt buộc (1/0)"],
 ["hoten","Họ và tên","1"],
 ["sodienthoai","Số điện thoại","1"],
 ["email","Email","1"],
 ["chude","Chủ đề","1"],
 ["noidung","Nội dung liên hệ","1"],
 ["cta","Gửi liên hệ","0"]
];
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const found=vars.filter(x=>x.startsWith("WC_URL="));if(found.length!==1)throw Error("Missing WordPress origin");
const url=new URL(found[0].slice(7).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Invalid WordPress origin");
const origin=url.origin;
const css=await readFile(new URL("./pse-contact-cms-style.css",import.meta.url),"utf8");
if(!css.includes(marker))throw Error("Missing CMS CSS marker");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on("dialog",async d=>{try{if(d.type()==="confirm")await d.accept();else await d.dismiss()}catch(e){if(!String(e).includes("already handled"))throw e}});
try{
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const txt=await page.locator("body").innerText();
  const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Captcha missing");await f.fill(String(n))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login failed");
 const n=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("REST nonce missing");return(await r.text()).trim()});
 if(!/^[A-Za-z0-9]{8,24}$/.test(n))throw Error("REST nonce malformed");
 const read=async route=>page.evaluate(async({route,n})=>{const r=await fetch(route,{credentials:"same-origin",headers:{"X-WP-Nonce":n,Accept:"application/json"}});return{http:r.status,data:await r.json().catch(()=>null)}},{route,n});
 const current=await read("/wp-json/wp/v2/pages/"+pageId+"?context=edit&_fields=id,slug,status,acf,content");
 if(current.http!==200||current.data?.id!==pageId||current.data.slug!=="lien-he"||current.data.status!=="publish"||current.data.acf?.action!=="PrivatePage"||current.data.acf?.key!=="contact")throw Error("PSE Contact Page identity mismatch");
 const raw=String(current.data.content?.raw||""),oldCSS=String(current.data.acf?.cssmore||"");
 const warehouses=["Kho Đồng Nai","Kho Long An","Kho Lâm Đồng","Kho Bình Phước","Kho Đắk Nông"];
 if(warehouses.some(x=>!raw.includes(x))||!raw.includes('data-pse-contact-locations="source-2026-10-25"'))throw Error("Original Contact content missing");
 if(raw.includes("Nội dung sẽ được cập nhật khi cấu hình website mới."))throw Error("Public editor note returned");
 const sc="[table id="+tableId+" /]";
 const scCount=(raw.match(/\[table\s+id=contact_00_vi\s*\/\]/g)||[]).length;
 if(scCount>1)throw Error("Duplicate ESC Table contact shortcode");
 const getTable=async()=>read("/wp-json/tablepress/v1/table/"+tableId);
 let t=await getTable();
 const expectedItems=cells.slice(2);
 const verifyTable=check=>{
  if(check.http!==200||check.data?.id!==tableId||
    JSON.stringify(check.data.fields?.map(x=>x.key))!==JSON.stringify(cells[0])||
    JSON.stringify(check.data.items?.map(x=>cells[0].map(k=>x[k]??"")))!==JSON.stringify(expectedItems))throw Error("ESC Table data mismatch");
 };
 await mkdir("artifacts/pse-contact-native",{recursive:true});
 await writeFile("artifacts/pse-contact-native/original.json",JSON.stringify({pageId,raw,cssmore:oldCSS,action:current.data.acf.action,key:current.data.acf.key},null,2));
 console.log("PSE_CONTACT_CMS_PREFLIGHT="+JSON.stringify({mode:apply?"apply":"dry",pageId,warehouses:warehouses.length,tableHttp:t.http,shortcodeCount:scCount,cssMoreLength:oldCSS.length,cssOwned:oldCSS.includes(marker)}));
 if(!apply){console.log("PSE_CONTACT_CMS=DRY_PASS; no_writes=true");process.exit(0)}
 if(t.http===404){
  await page.goto(origin+"/wp-admin/admin.php?page=tablepress_add",{waitUntil:"domcontentloaded",timeout:60000});
  await page.locator('input[name="table[name]"]').fill("Gửi thông tin liên hệ");
  await page.locator('textarea[name="table[description]"]').fill("Trường liên hệ PSE quản trị trong ESC Table");
  const nums=page.locator('input[type="number"]');if(await nums.count()<2)throw Error("Native TablePress fields missing");
  await nums.nth(0).fill(String(cells.length));await nums.nth(1).fill("3");
  await page.getByRole("button",{name:"Add Table"}).click();
  await page.locator("#table-id").waitFor({state:"visible",timeout:45000});
  if(!/^\d+$/.test(await page.locator("#table-id").inputValue()))throw Error("Unexpected new table ID");
  await page.locator("#table-id").fill(tableId);await page.locator("#table-name").focus();
  await page.getByRole("button",{name:"Save Changes",exact:true}).first().click();
  await page.waitForTimeout(2300);
  t=await getTable();if(t.http!==200)throw Error("New ESC Table not saved; refuse duplicate");
  console.log("PSE_CONTACT_ESC_CREATED=PASS via_native_admin=true");
 }else if(t.http!==200)throw Error("ESC REST HTTP "+t.http);
 try{verifyTable(t)}
 catch(e){
  await page.goto(origin+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+tableId,{waitUntil:"domcontentloaded",timeout:60000});
  await page.waitForTimeout(900);
  const state=await page.evaluate(()=>({id:window.tp?.table?.id,data:window.tp?.table?.data?.map(row=>Array.from(row)),editor:typeof window.tp?.editor?.setValueFromCoords==="function"}));
  if(state.id!==tableId||!state.editor||state.data?.length!==cells.length||state.data.some(row=>row.length!==3))throw Error("ESC editor structure mismatch");
  if(state.data.some((row,y)=>row.some((v,x)=>String(v||"").trim()&&String(v).trim()!==cells[y][x])))throw Error("Existing ESC author data conflict");
  await page.evaluate(rows=>{for(let y=0;y<rows.length;y++)for(let x=0;x<3;x++)
     if(!String(window.tp.table.data[y][x]||"").trim())window.tp.editor.setValueFromCoords(x,y,rows[y][x]);window.tp.helpers.unsaved_changes.set()},cells);
  await page.getByRole("button",{name:"Save Changes",exact:true}).first().click();
  await page.waitForTimeout(2300);t=await getTable();verifyTable(t);
 }
 console.log("PSE_CONTACT_ESC_TABLE=PASS six_fields=true native_ui=true");
 if(scCount===1&&oldCSS.includes(marker)){console.log("PSE_CONTACT_CMS=ALREADY_DONE no_writes=true");process.exit(0)}
 await page.goto(origin+"/wp-admin/post.php?post="+pageId+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(scCount===0){
  await page.locator("#content-html").click();
  const textarea=page.locator("#content");await textarea.waitFor({state:"attached"});
  await textarea.evaluate(el=>{el.focus();el.selectionStart=el.value.length;el.selectionEnd=el.value.length});
  const insert=page.locator("#qt_content_tablepress_quicktags_button");
  if(!await insert.count())throw Error("Native TablePress Insert Code Quicktags tool unavailable");
  const state=await page.evaluate(()=>({
   visibleTextArea:document.querySelector("#content")?.getClientRects().length>0,
   visibleInsert:document.querySelector("#qt_content_tablepress_quicktags_button")?.getClientRects().length>0,
   hasNativeInsert:typeof window.tablepress_open_shortcode_thickbox==="function"
  }));
  if(state.visibleInsert)await insert.click();
  else{
   if(!state.hasNativeInsert)throw Error("ESC Table native Insert Code handler missing");
   if(!state.visibleTextArea){
    await page.locator("#content-tmce").click();
    await page.waitForTimeout(450);
    await page.evaluate(()=>{
     const editor=window.tinymce?.get("content");
     if(!editor||editor.isHidden())throw Error("Native WordPress Visual Editor unavailable");
     editor.focus();editor.selection.select(editor.getBody(),true);editor.selection.collapse(false);
    });
   }
   await page.evaluate(()=>window.tablepress_open_shortcode_thickbox());
  }
  const match=page.frameLocator("#TB_iframeContent").locator('.insert-shortcode[title*="contact_00_vi"]');
  await match.waitFor({state:"visible",timeout:25000});
  const title=await match.getAttribute("title");if(!title?.includes(sc))throw Error("Wrong native Insert Code table");
  await page.evaluate(()=>{window.wpActiveEditor="content";const ed=window.tinymce?.get("content");if(ed&&!ed.isHidden()){ed.focus();ed.selection.select(ed.getBody(),true);ed.selection.collapse(false)}});
  await match.click();await page.waitForTimeout(400);
  const insertTarget=await page.evaluate(()=>{
   const rich=window.tinymce?.get("content");
   const acf=window.tinymce?.get("acf_content");
   return {active:window.wpActiveEditor,
     textareaHasShortcode:(document.getElementById("content")?.value||"").includes("[table id=contact_00_vi /]"),
     richHasShortcode:(rich?.getContent()||"").includes("[table id=contact_00_vi /]"),
     acfHasShortcode:(acf?.getContent()||"").includes("[table id=contact_00_vi /]")};
  });
  console.log("PSE_CONTACT_INSERT_TARGET="+JSON.stringify(insertTarget));
  const edited=await page.evaluate(()=>{
    const text=document.querySelector("#content")?.value||"";
    const rich=window.tinymce?.get("content");
    return text.includes("[table id=contact_00_vi /]")?text:(rich&&!rich.isHidden()?rich.getContent():text);
  });
  console.log("PSE_CONTACT_NATIVE_INSERT_DIAGNOSTICS="+JSON.stringify({
    shortcodeInEditor:(edited.match(/\[table\s+id=contact_00_vi\s*\/\]/g)||[]).length,
    editorLength:edited.length,sourceLength:raw.length,
    sourcePrefixPreserved:edited.includes(raw.slice(0,150)),
    sectionIdentifierPresent:edited.includes('data-pse-contact-locations="source-2026-10-25"'),
    officePresent:edited.includes("pse-contact-locations__office"),
    warehousesPresent:warehouses.every(w=>edited.includes(w)),
    locationCards:(edited.match(/pse-location-card/g)||[]).length
  }));
  if((edited.match(/\[table\s+id=contact_00_vi\s*\/\]/g)||[]).length!==1||
     !edited.includes('data-pse-contact-locations="source-2026-10-25"')||
     !edited.includes("pse-contact-locations__office")||
     warehouses.some(w=>!edited.includes(w)))throw Error("Native Insert Code did not preserve location structure");
  console.log("PSE_CONTACT_ESC_INSERT=PASS native_quicktags=true");
 }
 if(!oldCSS.includes(marker)){
  const f=page.locator('.acf-field[data-name="cssmore"] textarea').first();if(!await f.count())throw Error("WordPress cssmore ACF field unavailable");
  await f.fill(oldCSS+"\n"+css);
 }
 await page.locator("#publish").click();await page.waitForTimeout(2300);
 const saved=await read("/wp-json/wp/v2/pages/"+pageId+"?context=edit&_fields=id,slug,status,acf,content");
 const content=String(saved.data?.content?.raw||""),c=String(saved.data?.acf?.cssmore||"");
 if(saved.http!==200||saved.data?.status!=="publish"||saved.data?.acf?.key!=="contact"||
   (content.match(/\[table\s+id=contact_00_vi\s*\/\]/g)||[]).length!==1||
   warehouses.some(x=>!content.includes(x))||c.split(marker).length!==2)
   throw Error("Native Contact Page readback failed; preserve backup");
 console.log("PSE_CONTACT_CMS=PASS native_shortcode=true native_cssmore=true five_warehouses=true no_astro_build=true");
}finally{await browser.close()}