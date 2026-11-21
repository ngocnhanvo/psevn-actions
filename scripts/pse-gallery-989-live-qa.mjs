/** Read-only target acceptance for 98-image Joomla gallery #989 after native WP publication. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=key=>{
 const values=vars.filter(s=>s.startsWith(key+"="));
 if(values.length!==1)throw Error("Missing unique frontend origin");
 const u=new URL(values[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unexpected site origin");
 return u.origin;
};
const front=origin("WC_URL_CLIENT"),wp=origin("WC_URL");
if(front===wp)throw Error("Frontend and WordPress origin collision");
const slug="989-hoi-dong-co-dong-le-ra-mat-va-don-nhan-iso",expected=98;
const browser=await chromium.launch({headless:true}),report={album:slug,expected,readOnly:true,widths:[],allHeadProbes:[]};
try{
 const paths=[];
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const seenAdmin=[];
  page.on("request",r=>{try{if(new URL(r.url()).origin===wp)seenAdmin.push("request")}catch{}});
  const url=front+"/"+slug,resp=await page.goto(url,{waitUntil:"domcontentloaded",timeout:65000});
  if(resp?.status()!==200)throw Error("Gallery detail unavailable "+width+" "+resp?.status());
  const root=page.locator("#article-content"),images=root.locator("img");
  const count=await images.count();
  if(count!==expected)throw Error("Source gallery does not contain all 98 photos width "+width+" got "+count);
  const urls=await images.evaluateAll(items=>items.map(img=>new URL(img.getAttribute("src")||"",location.href).href));
  if(urls.some(u=>!u.startsWith(front+"/api/files/wp-content/uploads/"))||
     new Set(urls).size!==expected)throw Error("Gallery native media origin or image order duplicated");
  const seo=await page.evaluate(()=>({
    h1:document.querySelectorAll("h1").length,
    canonical:document.querySelector('link[rel="canonical"]')?.href||"",
    overflow:document.body.scrollWidth>window.innerWidth+1
  }));
  const cu=seo.canonical?new URL(seo.canonical,front):null;
  if(seo.h1!==1||!cu||cu.origin!==front||cu.pathname!=="/"+slug||seo.overflow||seenAdmin.length)
    throw Error("Gallery canonical/header/layout/WordPress-origin contract failed");
  for(const index of [0,24,49,74,97]){
    const image=images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(async img=>{
      if(!img.complete)await new Promise(resolve=>{
        img.addEventListener("load",resolve,{once:true});img.addEventListener("error",resolve,{once:true});
        setTimeout(resolve,15000);
      });
    });
    const ok=await image.evaluate(img=>img.complete&&img.naturalWidth>0);
    if(!ok)throw Error("Original WordPress-owned image did not decode "+index);
  }
  await images.first().click();
  const dialog=page.locator("[data-pse-gallery-dialog]");
  await dialog.waitFor({state:"visible",timeout:5000});
  await dialog.locator("[data-pse-gallery-next]").click();
  if(!(await dialog.locator("[data-pse-gallery-counter]").innerText()).includes("2 / 98"))
    throw Error("Gallery next/lightbox counter wrong");
  await page.keyboard.press("Escape");
  if(await dialog.isVisible())throw Error("Gallery modal did not close");
  if(seenAdmin.length)throw Error("Private WordPress origin leaked into browser requests");
  if(width===390)paths.push(...urls);
  report.widths.push({width,http:resp.status(),images:count,sampledDecode:5,lightbox:true,seo:true,overflow:false,wpOriginRequests:0});
  console.log("PSE_GALLERY_989_LIVE_WIDTH="+JSON.stringify(report.widths.at(-1)));
  await page.close();
 }
 const request=await browser.newContext();
 let next=0;
 const checks=new Array(paths.length);
 await Promise.all(Array.from({length:4},async()=>{
   for(;;){
     const i=next++;if(i>=paths.length)return;
     const response=await request.request.head(paths[i],{timeout:30000,failOnStatusCode:false});
     checks[i]={status:response.status(),mime:String(response.headers()["content-type"]||"").slice(0,70)};
   }
 }));
 report.allHeadProbes=checks;await request.close();
 if(checks.length!==expected||checks.some(x=>x.status!==200||!x.mime.startsWith("image/")))
   throw Error("Not all 98 WordPress media HEAD requests passed");
 console.log("PSE_GALLERY_989_LIVE_SUMMARY="+JSON.stringify({widths:report.widths.length,images:expected,headPass:checks.length,sourceAdminHostHidden:true}));
}finally{
 await mkdir("artifacts/pse-gallery-989-live",{recursive:true});
 await writeFile("artifacts/pse-gallery-989-live/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
