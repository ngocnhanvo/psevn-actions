/** PSE desktop/mobile read-only QA of Tin Cong ty submenu after native
 * WordPress "Tất cả" removal. Hover on desktop, click/tap on mobile.
 */
import {chromium} from "playwright";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=key=>{
  const entries=vars.filter(x=>x.startsWith(key+"="));
  if(entries.length!==1)throw Error("Missing "+key);
  const u=new URL(entries[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
  if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
    throw Error("Invalid "+key);
  return u.origin;
};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
const norm=x=>String(x||"").trim().normalize("NFC").replace(/\s+/g," ").toLocaleLowerCase("vi");
const browser=await chromium.launch({headless:true});
try{
 const api=await browser.newPage();
 const r=await api.request.get(wp+"/wp-json/esc-api/v1/menus?_esc_preview="+Date.now(),{timeout:30000});
 if(!r.ok())throw Error("Native WP menu HTTP "+r.status());
 const data=await r.json();
 const roots=data?.menus?.Header?.vi?.items;
 if(data?.success!==true||!Array.isArray(roots))throw Error("WP Header/vi missing");
 const news=roots.filter(x=>norm(x.label)==="tin tức - sự kiện");
 if(news.length!==1)throw Error("News root mismatch");
 const company=(news[0].children||[]).filter(x=>norm(x.label)==="tin công ty");
 if(company.length!==1)throw Error("Tin Công ty parent mismatch");
 const remaining=company[0].children||[];
 if(remaining.length<3||remaining.some(x=>norm(x.label)==="tất cả"))
  throw Error("Redundant All still in WP menu or other items disappeared");
 const samples=remaining.map(x=>norm(x.label));
 for(const label of ["tin tổng hợp","hoạt động chi bộ - hđqt - bks"])
  if(!samples.some(x=>x===label))throw Error("Existing News child lost "+label);
 const output=[];
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  try{
   const response=await page.goto(front+"/",{waitUntil:"domcontentloaded",timeout:60000});
   if(response?.status()!==200)throw Error("PSE homepage HTTP "+response?.status());
   const desktop=width===1440;
   let panel;
   if(desktop){
    const root=page.locator('#desktop-menu button[data-menu-trigger]').filter({hasText:/TIN TỨC\s*-\s*SỰ KIỆN/i}).first();
    if(await root.count()!==1)throw Error("Missing desktop Tin tức root");
    await root.hover();
    if(await root.getAttribute("aria-expanded")!=="true")throw Error("News desktop hover failed");
    const rootPanel=page.locator("#"+await root.getAttribute("aria-controls"));
    const submenu=rootPanel.locator('button[data-submenu-trigger][aria-label="Mở mục con của Tin Công ty"]').first();
    if(await submenu.count()!==1)throw Error("Missing desktop Tin Công ty arrow");
    await submenu.hover();
    if(await submenu.getAttribute("aria-expanded")!=="true")throw Error("Tin Công ty desktop hover failed");
    panel=page.locator("#"+await submenu.getAttribute("aria-controls"));
   }else{
    await page.locator("#hamburger-btn").click();
    const root=page.locator('#mobile-menu-container button[data-menu-toggle]').filter({hasText:/TIN TỨC\s*-\s*SỰ KIỆN/i}).first();
    if(await root.count()!==1)throw Error("Missing mobile Tin tức root");
    await root.click();
    if(await root.getAttribute("aria-expanded")!=="true")throw Error("Mobile News menu did not open");
    const rootPanel=page.locator("#"+await root.getAttribute("aria-controls"));
    const submenu=rootPanel.locator('button[data-menu-toggle][aria-label="Mở mục con của Tin Công ty"]').first();
    if(await submenu.count()!==1)throw Error("Missing mobile Tin Công ty arrow");
    await submenu.click();
    if(await submenu.getAttribute("aria-expanded")!=="true")throw Error("Mobile Tin Công ty submenu did not open");
    panel=page.locator("#"+await submenu.getAttribute("aria-controls"));
   }
   if(await panel.getAttribute("hidden")!==null)throw Error("Tin Công ty panel is hidden at "+width);
   const labels=(await panel.locator('a[href],button[data-menu-toggle],button[data-submenu-trigger]').allTextContents())
     .map(norm).filter(Boolean);
   if(labels.includes("tất cả"))throw Error("Redundant All remains at "+width);
   for(const text of ["tin tổng hợp","hoạt động chi bộ - hđqt - bks"])
    if(!labels.includes(text))throw Error("News child unavailable at "+width+" "+text+" labels="+labels.join("|"));
   output.push({width,noAll:true,retainedChildren:remaining.length,navigation:desktop?"hover":"tap"});
  }finally{await page.close()}
 }
 console.log("PSE_NEWS_ALL_LIVE_QA=PASS "+JSON.stringify({results:output,wpMenuId:data.menus.Header.vi.id,readonly:true}));
}finally{await browser.close()}
