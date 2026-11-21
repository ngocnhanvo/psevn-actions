/** Public PSE parity QA for four verified original Joomla galleries after normal signed release. No CMS writes. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function origin(key){const a=lines.filter(x=>x.startsWith(key+"="));if(a.length!==1)throw Error("Missing "+key);
 const u=new URL(a[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid "+key);
 return u.origin}
const front=origin("WC_URL_CLIENT"),wp=origin("WC_URL");
if(front===wp)throw Error("Frontend origin must differ from WordPress");
const targets=[
 {id:1053,slug:"1053-ngay-hoi-truyen-thong-2014",images:76},
 {id:990,slug:"990-dai-hoi-chi-doan-2010",images:98},
 {id:980,slug:"980-cong-trinh-dtn-kho-chua-dong-nai",images:180},
 {id:975,slug:"975-dai-hoi-cong-doan-nhiem-ky-ii-10-2013",images:110}
];
const browser=await chromium.launch({headless:true});
const report={schema:"pse-four-original-albums-live-v1",readOnly:true,front,rows:[],listing:[],failures:[],imageGetChecks:[]};
try{
 const samplePaths=[];
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const wpRequests=[];
  page.on("request",r=>{try{if(new URL(r.url()).origin===wp)wpRequests.push("leak")}catch{}});
  for(const target of targets){
   const response=await page.goto(front+"/"+target.slug,{waitUntil:"domcontentloaded",timeout:65000});
   if(response?.status()!==200)throw Error("Gallery detail HTTP "+response?.status()+" "+target.slug);
   const images=page.locator("#article-content img");
   const count=await images.count();
   if(count!==target.images)throw Error("Original gallery count mismatch "+target.slug+" expected="+target.images+" got="+count);
   const srcs=await images.evaluateAll(es=>es.map(img=>new URL(img.getAttribute("src")||"",location.href).href));
   if(new Set(srcs).size!==count||srcs.some(x=>!x.startsWith(front+"/api/files/wp-content/uploads/")))
     throw Error("Duplicate, nonnative, or private images "+target.slug);
   const doc=await page.evaluate(()=>({h1:document.querySelectorAll("h1").length,
    canonical:document.querySelector('link[rel="canonical"]')?.href||"",
    overflow:document.body.scrollWidth>window.innerWidth+1}));
   const canonical=doc.canonical?new URL(doc.canonical,front):null;
   if(doc.h1!==1||!canonical||canonical.origin!==front||canonical.pathname!=="/"+target.slug||
      canonical.search||canonical.hash||doc.overflow||wpRequests.length)throw Error("Gallery SEO/layout/privacy "+target.slug+" "+width);
   // Actual native Media pixels at distributed positions; lazy images scrolled
   // intentionally. Check names/count on all source entries separately above.
   const selected=[0,Math.floor((count-1)/4),Math.floor((count-1)/2),Math.floor((count-1)*3/4),count-1];
   for(const i of selected){
    const img=images.nth(i);await img.scrollIntoViewIfNeeded();
    await img.evaluate(async e=>{if(!e.complete)await new Promise(resolve=>{
      e.addEventListener("load",resolve,{once:true});e.addEventListener("error",resolve,{once:true});setTimeout(resolve,12000)})});
    if(!(await img.evaluate(e=>e.complete&&e.naturalWidth>0)))throw Error("Gallery image pixel decode failed "+target.id+" index "+i);
   }
   await images.first().click();
   const dialog=page.locator("[data-pse-gallery-dialog]");
   await dialog.waitFor({state:"visible",timeout:6000});
   await dialog.locator("[data-pse-gallery-next]").click();
   if(!(await dialog.locator("[data-pse-gallery-counter]").innerText()).includes("2 / "+count))
    throw Error("Lightbox navigation incorrect "+target.slug);
   await page.keyboard.press("Escape");
   if(await dialog.isVisible())throw Error("Lightbox close failed "+target.slug);
   if(wpRequests.length)throw Error("Admin-origin request leaked "+target.slug);
   report.rows.push({id:target.id,width,http:response.status(),images:count,decoded:5,seo:true,lightbox:true,overflow:false,adminOriginRequests:0});
   console.log("PSE_FOUR_GALLERY_LIVE_ROW="+JSON.stringify(report.rows.at(-1)));
   if(width===390)samplePaths.push(...[0,Math.floor(count/2),count-1].map(i=>srcs[i]));
  }
  if(width===390){
   const queue=["/tin-tuc-su-kien/anh"],visited=new Set(),found=new Set();
   while(queue.length){
    const path=queue.shift(),url=new URL(path,front);
    if(url.origin!==front||!/^\/tin-tuc-su-kien\/anh(?:\/[0-9]+)?\/?$/.test(url.pathname)||url.search)
      throw Error("Gallery archive pagination path unsafe");
    if(visited.has(url.href))continue;
    if(visited.size>=20)throw Error("Too many archive pages");
    visited.add(url.href);
    const response=await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:65000});
    if(response?.status()!==200)throw Error("Gallery category listing HTTP "+response?.status());
    for(const a of await page.locator("#posts-grid .pse-media-card a[href]").all()){
      found.add(await a.getAttribute("href"));
    }
    for(const a of await page.locator('nav[aria-label="Phân trang"] a[href]').all()){
      const next=await a.getAttribute("href");
      const targetUrl=new URL(next,front);
      if(!visited.has(targetUrl.href))queue.push(targetUrl.pathname);
    }
   }
   for(const target of targets)if(![...found].some(p=>String(p).includes(target.slug)))
    throw Error("Original album missing from WordPress SSR archive "+target.id);
   report.listing.push({pages:visited.size,uniqueCards:found.size,fourSourceAlbums:true});
  }
  await page.close();
 }
 const request=await browser.newContext();
 let next=0;const checks=new Array(samplePaths.length);
 await Promise.all(Array.from({length:3},async()=>{
  for(;;){
   const i=next++;if(i>=samplePaths.length)return;
   try{const r=await request.request.get(samplePaths[i],{timeout:35000,failOnStatusCode:false});
    checks[i]={http:r.status(),mime:String(r.headers()["content-type"]||"").slice(0,65)}}
   catch(e){checks[i]={error:String(e).slice(0,110)}}}
 }));
 await request.close();
 report.imageGetChecks=checks;
 if(checks.length!==12||checks.some(x=>x.http!==200||!x.mime.startsWith("image/")))
  throw Error("Original WordPress media network GET sampling failed");
 console.log("PSE_FOUR_GALLERY_LIVE_PASS="+JSON.stringify({originalAlbums:4,originalPhotos:464,widths:2,checks:report.rows.length,
   mediaGetPass:checks.length,archivePages:report.listing[0]?.pages,wordpressOwned:true,readOnly:true}));
}finally{
 await mkdir("artifacts/pse-four-original-gallery-live",{recursive:true});
 await writeFile("artifacts/pse-four-original-gallery-live/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
