/** Correct only one ESC-native WordPress Header item using the actual Menu Manager UI. */
import {chromium} from "playwright";
const vals=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const arr=vals.filter(x=>x.startsWith("WC_URL="));
if(arr.length!==1)throw Error("Configured WordPress origin not unique");
const o=new URL(arr[0].slice(7).replace(/^['"]|['"]$/g,""));
if(o.protocol!=="https:"||!o.hostname||o.username||o.password||o.search||o.hash||!["","/"].includes(o.pathname))throw Error("Invalid WordPress origin");
const browser=await chromium.launch({headless:true});
const p=await browser.newPage({viewport:{width:1520,height:990}});
const slug="xu-ly-khieu-nai-y-kien-khach-hang",itemId=77020,pageId=81087;
try{
 await p.goto(o.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await p.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("WordPress auth challenge field missing");await f.fill(String(v))}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 if(p.url().includes("wp-login"))throw Error("WordPress authentication refused");
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce unavailable");return(await r.text()).trim()});
 const api=path=>p.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:"same-origin",cache:"no-store",headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});
  return{http:r.status,data:await r.json().catch(()=>null)}},{path,nonce});
 const readMenu=async()=>{
  const r=await api("/wp-json/esc-api/v1/menus?_pse_nonce="+Date.now());
  if(r.http!==200||r.data?.success!==true)throw Error("ESC Menu API unavailable");
  const list=r.data.menus?.Header?.vi?.items;
  if(!Array.isArray(list))throw Error("Header/vi absent from menu API");
  const flat=items=>items.flatMap(x=>[{...x},...flat(x.children||[])]);
  return{flat:flat(list),item:flat(list).find(x=>Number(x.id)===itemId)};
 };
 const [native,pg,menuBefore]=await Promise.all([
  api("/wp-json/wp/v2/menu-items/"+itemId+"?context=edit"),
  api("/wp-json/wp/v2/pages/"+pageId+"?context=edit&_fields=id,slug,status,acf"),
  readMenu()
 ]);
 const m=native.data||{},v=pg.data||{},b=menuBefore.item;
 if(native.http!==200||m.id!==itemId||Number(m.parent)!==77004||
  m.type!=="post_type"||m.object!=="page"||Number(m.object_id)!==pageId||
  pg.http!==200||v.slug!==slug||v.status!=="publish"||
  v.acf?.action!=="PseComplaintPage"||v.acf?.key!=="pse-complaint"||
  !b||!String(b.label).includes("Xử lý khiếu nại"))
   throw Error("Untrusted Page/menu identity for ESC Menu repair");
 if(b.linkMode==="page"&&b.linkType==="internal"&&String(b.href).replace(/^\/|\/$/g,"")===slug){
  console.log("PSE_COMPLAINT_ESC_MENU=ALREADY_DONE; no_write=true");process.exit(0);
 }
 if(b.linkMode!=="custom"||b.linkType!=="external"||
   !String(b.href).includes("/hoat-dong-kinh-doanh/xu-ly-khieu-nai-y-kien-khach-hang.html"))
    throw Error("Unexpected ESC menu mode - do not overwrite");
 const menuId=Number(m.menus);
 if(!Number.isSafeInteger(menuId)||menuId<1)throw Error("WordPress menu term absent");
 console.log("PSE_COMPLAINT_ESC_MENU_PREFLIGHT="+JSON.stringify({itemId,pageId,term:menuId,mode:b.linkMode,linkType:b.linkType}));
 await p.goto(o.origin+"/wp-admin/nav-menus.php?menu="+menuId,{waitUntil:"load",timeout:90000});
 const item=p.locator("#menu-item-"+itemId);
 await item.waitFor({state:"attached",timeout:45000});
 const select=item.locator('select[name="esc-menu-item-link-type['+itemId+']"]');
 if(!await select.count())throw Error("Native ESC Menu link mode missing");
 const expand=p.locator(".esc-menu-bulk-toggle button").filter({hasText:"Mở rộng"}).first();
 if(await expand.count())await expand.click();
 // Native menus have animated/fixed overlays which can leave Playwright's
 // stability-based scroll action waiting forever. Scroll directly without
 // synthesizing a click, then open only the one verified menu item.
 await item.evaluate(el=>el.scrollIntoView({block:"center",behavior:"instant"}));
 const details=item.locator(".menu-item-settings");
 if(!(await details.isVisible())){
   // In wp-admin/nav-menus.php the native .item-edit control is visually
   // hidden while its menu item is collapsed; Playwright's locator.click()
   // waits for visibility forever. Trigger its native DOM click once.
   const ui=await item.evaluate(el=>{
     const settings=el.querySelector(".menu-item-settings");
     const edit=el.querySelector("a.item-edit");
     if(!settings||!edit)throw Error("Native WordPress item settings are missing");
     // Use WordPress's own menu edit controller. The hidden a.item-edit
     // cannot be activated by Playwright's visibility-based click action.
     const ctrl=window.wpNavMenu;
     if(!ctrl||typeof ctrl.eventOnClickEditLink!=="function")
       throw Error("WordPress native menu editor script not initialized");
     if(el.classList.contains("menu-item-edit-inactive"))
       ctrl.eventOnClickEditLink(edit);
     // WordPress animates settings with slideDown; do not synthesize a Save.
     return {active:el.classList.contains("menu-item-edit-active"),
       hasSettings:!!settings,hiddenParent:!el.getClientRects().length};
   });
   console.log("PSE_COMPLAINT_NATIVE_MENU_UI="+JSON.stringify(ui));
   if(!ui.active)throw Error("WordPress native item editor refused to expand");
   await details.waitFor({state:"visible",timeout:10000});
 }
 await select.selectOption("page");
 const pageSelect=item.locator('select[name="esc-menu-item-page-id['+itemId+']"]');
 await p.waitForFunction(id=>{
  const select=document.querySelector('select[name="esc-menu-item-page-id[77020]"]');
  return select&&!select.disabled&&[...select.options].some(option=>option.value===String(id));
 },pageId,{timeout:40000});
 await pageSelect.selectOption(String(pageId));
 if(await select.inputValue()!=="page"||await pageSelect.inputValue()!==String(pageId))
   throw Error("Native ESC Menu selection was not applied");
 const submit=p.locator("#save_menu_header");
 if(await submit.count())await submit.click();
 else await p.locator("#save_menu_footer").click();
 await p.waitForLoadState("domcontentloaded",{timeout:50000}).catch(()=>{});
 // Never press Save twice; read the authoritative API before retrying anything.
 const after=await readMenu();
 const itemAfter=after.item;
 const sameOther=menuBefore.flat.filter(x=>Number(x.id)!==itemId).every(old=>{
  const now=after.flat.find(x=>Number(x.id)===Number(old.id));
  return now&&old.label===now.label&&old.href===now.href&&old.linkMode===now.linkMode&&old.linkType===now.linkType;
 });
 if(!itemAfter||itemAfter.linkMode!=="page"||itemAfter.linkType!=="internal"||
    String(itemAfter.href).replace(/^\/|\/$/g,"")!==slug||!sameOther)
   throw Error("ESC Menu native Save readback failed / unrelated item changed");
 console.log("PSE_COMPLAINT_ESC_MENU=PASS item=77020 page=81087 linkMode=page hrefIsNative=true otherItemsUnchanged=true noBuild=true");
}finally{await browser.close()}
