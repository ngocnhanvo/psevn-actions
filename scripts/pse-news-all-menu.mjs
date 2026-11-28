/** PSE Header/vi — audit/remove the owner-requested redundant "Tất cả"
 * directly under "Tin Công ty" > "Tin tức - Sự kiện".
 * No generated menu fallback. Native WP Menu REST with read-before/delete/readback.
 */
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const marker = (await readFile(".pse-news-all-menu-request","utf8")).trim().split(/\r?\n/);
const mode = marker[0];
if (!["MODE=AUDIT","MODE=APPLY"].includes(mode)) throw Error("Invalid news menu mode");
const evt = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const message = String(evt.head_commit?.message||"").split("\n")[0];
const expectedMessage=mode==="MODE=AUDIT"
  ?"audit(pse): identify News all menu item"
  :"cms(pse): remove News company all menu item";
if (message!==expectedMessage) throw Error("Unauthorized CMS menu request");
const selectedId = mode==="MODE=APPLY" ? Number(marker.find(x=>x.startsWith("EXPECTED_ITEM_ID="))?.split("=")[1]) : null;
const selectedParentId = mode==="MODE=APPLY" ? Number(marker.find(x=>x.startsWith("EXPECTED_PARENT_ID="))?.split("=")[1]) : null;
if (mode==="MODE=APPLY" && (!Number.isSafeInteger(selectedId)||selectedId<1||
    !Number.isSafeInteger(selectedParentId)||selectedParentId<1)) throw Error("Missing audited menu IDs");

const vals = String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin = key => {
  const arr=vals.filter(x=>x.startsWith(key+"="));
  if(arr.length!==1)throw Error("Missing origin: "+key);
  const u=new URL(arr[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
  if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
    throw Error("Unexpected configured origin: "+key);
  return u.origin;
};
const wp=origin("WC_URL"),frontend=origin("WC_URL_CLIENT");
if(wp===frontend)throw Error("WP and frontend have identical origins");
const normalize=s=>String(s||"").normalize("NFC").trim().replace(/\s+/g," ").toLocaleLowerCase("vi");
const flatten=(items,parent=0)=>items.flatMap(n=>[{...n,parentID:parent},...flatten(n.children||[],Number(n.id))]);
const snapshot=items=>items.map(n=>({
  id:Number(n.id),parentID:Number(n.parentID),label:String(n.label||""),
  href:String(n.href||""),slug:String(n.slug||""),linkMode:String(n.linkMode||""),
  children:(n.children||[]).length
}));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
try {
  await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
  if(await page.locator("#user_login").count()){
    await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
    await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
    const body=await page.locator("body").innerText();
    const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=Number(m[1]),b=Number(m[3]);
      const val=({"+":a+b,"-":a-b,"x":a*b,"×":a*b,"*":a*b})[m[2]];
      const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await field.count())throw Error("Unresolved login challenge");
      await field.fill(String(val));
    }
    await Promise.all([page.waitForLoadState("domcontentloaded",{timeout:50000}),page.locator("#wp-submit").click()]);
  }
  if(page.url().includes("wp-login"))throw Error("WordPress authentication failed");

  const nonce=await page.evaluate(async ()=>{
    if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
    const res=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin",cache:"no-store"});
    if(!res.ok)throw Error("No REST nonce HTTP "+res.status);
    return(await res.text()).trim();
  });
  const api=async(path,method="GET")=>page.evaluate(async({path,method,nonce})=>{
    const r=await fetch(path,{method,credentials:"same-origin",cache:"no-store",
      headers:{"X-WP-Nonce":nonce,"Accept":"application/json","Cache-Control":"no-cache"}});
    return{http:r.status,body:await r.json().catch(()=>null)};
  },{path,method,nonce});
  const readMenu=async()=>{
    const r=await api("/wp-json/esc-api/v1/menus?_esc_preview="+Date.now());
    const menu=r.body?.menus?.Header?.vi;
    if(r.http!==200||r.body?.success!==true||!Array.isArray(menu?.items)||!Number.isSafeInteger(Number(menu.id)))
      throw Error("Header/vi API unavailable HTTP "+r.http);
    return menu;
  };
  const menu=await readMenu();
  if(Number(menu.id)!==1687)throw Error("Header/vi menu changed ID; abort");
  const roots=menu.items.filter(n=>normalize(n.label)==="tin tức - sự kiện");
  if(roots.length!==1)throw Error("Non-unique News root: "+JSON.stringify(menu.items.map(n=>n.label)));
  const root=roots[0];
  const companies=(root.children||[]).filter(n=>normalize(n.label)==="tin công ty");
  if(companies.length!==1)throw Error("Non-unique Tin Công ty submenu");
  const company=companies[0];
  const all=(company.children||[]).filter(n=>normalize(n.label)==="tất cả");
  if(all.length!==1)throw Error("Expected exactly one native Tất cả under Tin Công ty, found "+all.length);
  const target=all[0];
  if((target.children||[]).length||!Number.isSafeInteger(Number(target.id))||
    Number(target.id)<1||(company.children||[]).length<3)
    throw Error("Unexpected nested menu item; safe delete denied");
  const baseline=flatten(menu.items),before=snapshot(baseline);
  const result={mode,menuId:menu.id,rootId:root.id,rootLabel:root.label,
    parentId:company.id,parentLabel:company.label,parentHref:company.href||"",
    candidate:{id:target.id,label:target.label,href:target.href||"",slug:target.slug||"",
      linkMode:target.linkMode,children:(target.children||[]).length},
    retainedChildren:(company.children||[]).filter(x=>Number(x.id)!==Number(target.id))
      .map(x=>({id:x.id,label:x.label,href:x.href||"",childCount:(x.children||[]).length})),
    totalBefore:before.length,readOnly:mode==="MODE=AUDIT"};
  console.log("PSE_NEWS_ALL_PREFLIGHT="+JSON.stringify(result));
  if(mode==="MODE=AUDIT"){
    console.log("PSE_NEWS_ALL_AUDIT=PASS noCmsWrite=true");
  }else{
    if(Number(target.id)!==selectedId||Number(company.id)!==selectedParentId)
      throw Error("Target ID drift from audited selection; refusing deletion");
    // Validate ownership and exact identity through native WP API before DELETE.
    const native=await api("/wp-json/wp/v2/menu-items/"+selectedId+"?context=edit");
    const item=native.body;
    if(native.http!==200||Number(item?.id)!==selectedId||
      Number(item.parent)!==selectedParentId||
      Number(item.menus)!==Number(menu.id)||
      normalize(item.title?.raw||item.title?.rendered)!=="tất cả")
      throw Error("WordPress native menu item identity mismatch HTTP "+native.http);
    const repeat=flatten((await readMenu()).items);
    if(JSON.stringify(snapshot(repeat))!==JSON.stringify(before))
      throw Error("Menu changed during preflight; no write");
    const deleted=await api("/wp-json/wp/v2/menu-items/"+selectedId+"?force=true","DELETE");
    if(deleted.http!==200||deleted.body?.deleted!==true||
      Number(deleted.body?.previous?.id)!==selectedId)
      throw Error("Native item delete failed HTTP "+deleted.http);
    const after=flatten((await readMenu()).items);
    const actual=snapshot(after),expected=before.filter(x=>x.id!==selectedId);
    if(JSON.stringify(actual)!==JSON.stringify(expected))
      throw Error("Unexpected menu change after delete: check CMS immediately");
    if(after.some(x=>Number(x.parentID)===selectedParentId&&normalize(x.label)==="tất cả"))
      throw Error("Redundant news menu child remains after delete");
    console.log("PSE_NEWS_ALL_APPLY=PASS "+JSON.stringify({
      deletedId:selectedId,parentId:selectedParentId,rootId:root.id,
      totalBefore:before.length,totalAfter:actual.length,otherItemsPreserved:true,
      changed:1,skippedUnchanged:before.length-1,temporaryCreated:0,cleanupRemaining:0,
      needsAstroBuild:true
    }));
  }
}finally{await browser.close()}
