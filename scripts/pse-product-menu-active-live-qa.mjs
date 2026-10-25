/** Read-only browser acceptance: WordPress Product category Header active state after signed PHP-controlled release. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const configured = String(process.env.ENV_FILE || "").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const values=configured.filter(s=>s.startsWith("WC_URL_CLIENT="));
if(values.length!==1)throw Error("Missing frontend origin");
const url=new URL(values[0].slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||!url.hostname||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Invalid frontend origin");
const cases=[
  {path:"/san-pham/dam-phu-my",name:"Đạm Phú Mỹ"},
  {path:"/san-pham/huu-co-phu-my",name:"Hữu cơ Phú Mỹ"},
  {path:"/san-pham",name:""},
];
const browser=await chromium.launch({headless:true});
await mkdir("artifacts/pse-product-live",{recursive:true});
const results=[];
try{
 for(const width of [390,768,1440]) for(const sample of cases){
   const page=await browser.newPage({viewport:{width,height:900}});
   try{
     const res=await page.goto(url.origin+sample.path,{waitUntil:"domcontentloaded",timeout:60000});
     if(res?.status()!==200)throw Error("Category not HTTP 200: "+res?.status());
     const desktop=page.locator("#desktop-menu");
     const isDesktop=await desktop.isVisible();
     let panel;
     if(isDesktop){
       const root=desktop.locator('button[data-menu-trigger][aria-label*="HOẠT ĐỘNG KINH DOANH"]').first();
       if(await root.count()!==1)throw Error("Business desktop trigger missing");
       await root.click();
       if(await root.getAttribute("aria-expanded")!=="true")throw Error("Business menu not expanded on click");
       const rootId=await root.getAttribute("aria-controls");
       panel=page.locator("#"+rootId);
       const products=panel.locator('button[data-submenu-trigger][aria-label*="Sản phẩm"]').first();
       if(await products.count()!==1)throw Error("Product submenu missing");
       await products.click();
       if(await products.getAttribute("aria-expanded")!=="true")throw Error("Product submenu not expanded on click");
       panel=page.locator("#"+await products.getAttribute("aria-controls"));
     }else{
       await page.locator("#hamburger-btn").click();
       const nav=page.locator("#mobile-menu-container");
       if(await nav.getAttribute("aria-hidden")!=="false")throw Error("Mobile menu remained closed");
       const root=nav.locator('button[data-menu-toggle][aria-label*="HOẠT ĐỘNG KINH DOANH"]').first();
       await root.click();
       const rootPanel=page.locator("#"+await root.getAttribute("aria-controls"));
       const products=rootPanel.locator('button[data-menu-toggle][aria-label*="Sản phẩm"]').first();
       await products.click();
       panel=page.locator("#"+await products.getAttribute("aria-controls"));
     }
     if(await panel.isHidden())throw Error("Category submenu still hidden");
     const links=panel.locator("a[href]");
     const all=links.filter({hasText:/^Xem tất cả Sản phẩm$/}).first();
     if(await all.count()!==1)throw Error("WordPress Product view-all link missing");
     const allActive=await all.getAttribute("aria-current")==="page";
     let selected=null;
     if(sample.name){
       const matches=links.filter({hasText:sample.name});
       if(await matches.count()!==1)throw Error("Wrong Product category menu membership "+sample.name);
       const link=matches.first();
       selected={name:sample.name,href:await link.getAttribute("href"),active:await link.getAttribute("aria-current")==="page"};
       const target=new URL(selected.href,url.origin);
       if(target.pathname!==sample.path||!selected.active||allActive)throw Error("Wrong category active state/href");
     }else{
       if(!allActive)throw Error("View all not active on catalog root");
       const active=await links.evaluateAll(nodes=>nodes.filter(n=>n.getAttribute("aria-current")==="page").map(n=>n.textContent?.trim()));
       if(active.length!==1)throw Error("Unexpected multiple Product active links");
     }
     if(width===1440&&sample.name)await page.screenshot({path:"artifacts/pse-product-live/active-"+sample.path.split("/").pop()+".png",fullPage:false,animations:"disabled"});
     const result={width,path:sample.path,layout:isDesktop?"desktop":"mobile",selected,viewAllActive:allActive,pass:true};
     results.push(result);console.log("PSE_PRODUCT_HEADER_ACTIVE="+JSON.stringify(result));
   }catch(error){
     const result={width,path:sample.path,pass:false,error:String(error).slice(0,500)};
     results.push(result);console.log("PSE_PRODUCT_HEADER_ACTIVE="+JSON.stringify(result));
   }finally{await page.close()}
 }
 const passed=results.filter(x=>x.pass).length;
 console.log("PSE_PRODUCT_HEADER_ACTIVE_SUMMARY="+JSON.stringify({passed,total:results.length,readOnly:true}));
 if(passed!==results.length)process.exitCode=1;
}finally{await browser.close()}
