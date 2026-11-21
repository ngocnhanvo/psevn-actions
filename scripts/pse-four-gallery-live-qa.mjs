/** Public PSE parity QA for four verified original Joomla galleries after normal signed release. No CMS writes. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function origin(key){const a=lines.filter(x=>x.startsWith(key+"="));if(a.length!==1)throw Error("Missing "+key);
 const u=new URL(a[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid "+key);
 return u.origin}
const front=origin("WC_URL_CLIENT"),wp=origin("WC_URL");
if(front===wp)throw Error("Frontend origin must differ from WordPress");
const allTargets=[
 {id:1053,slug:"1053-ngay-hoi-truyen-thong-2014",images:76},
 {id:990,slug:"990-dai-hoi-chi-doan-2010",images:98},
 {id:980,slug:"980-cong-trinh-dtn-kho-chua-dong-nai",images:180},
 {id:975,slug:"975-dai-hoi-cong-doan-nhiem-ky-ii-10-2013",images:110}
];
// Explicit partial acceptance never changes default full four-album QA.
const threeOnly=process.argv.includes("--published-three-only");
const targets=threeOnly?allTargets.filter(x=>x.id!==975):allTargets;
const totalImages=targets.reduce((n,x)=>n+x.images,0);
const browser=await chromium.launch({headless:true});
const report={schema:"pse-four-original-albums-live-v1",readOnly:true,scope:threeOnly?"published-three-only":"all-four",deferredSourceIds:threeOnly?[975]:[],front,rows:[],listing:[],sourceOracle:[],failures:[],imageGetChecks:[]};
 // The public site occasionally times out at the network/navigation layer
 // during FTPS releases. Retry navigation ONCE only for transport timeouts;
 // never downgrade 404, content, original photo identity or pixel failures.
 const visit=async(page,url)=>{
  for(let attempt=1;attempt<=2;attempt++){
   try{return await page.goto(url,{waitUntil:"domcontentloaded",timeout:65000})}
   catch(error){
    const reason=String(error?.message||error);
    if(attempt===2||!/Timeout|ECONNRESET|ERR_CONNECTION_RESET|socket hang up/i.test(reason))throw error;
    console.warn("PSE_GALLERY_NAV_RETRY="+JSON.stringify({path:new URL(url).pathname,attempt,reason:"transient-navigation"}));
   }
  }
  throw Error("Public gallery navigation failed");
 };
try{
 // Read and extract an independent original Joomla URL/order oracle, separate
 // from the importer manifests and WordPress. Literal source hrefs determine
 // each expected SHA-256 Media filename before checking target HTML.
 const sourceCtx=await browser.newContext({javaScriptEnabled:false});
 await sourceCtx.route("**/*",r=>r.abort());
 const expected=new Map();
 for(const target of targets){
  const sourceUrl="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/"+target.slug+".html";
  const raw=await sourceCtx.request.get(sourceUrl,{timeout:60000,maxRedirects:2});
  if(raw.status()!==200)throw Error("Original Joomla gallery source unavailable "+target.id+" HTTP "+raw.status());
  const html=await raw.text();
  if(html.length<250||html.length>8000000)throw Error("Source body unexpected "+target.id);
  const sourcePage=await sourceCtx.newPage();
  try{
   const inert=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
   await sourcePage.setContent('<base href="'+sourceUrl+'">'+inert,{waitUntil:"domcontentloaded",timeout:25000});
   const hrefs=await sourcePage.evaluate(()=>{
    const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article,.blog")||document.body;
    return [...new Set([...root.querySelectorAll("a[href]")].map(e=>e.href).filter(h=>{
     try{const u=new URL(h);return u.hostname==="www.pse.vn"&&u.pathname.startsWith("/images/gallery/")&&/\.(?:jpe?g|png|webp)$/i.test(u.pathname)}catch{return false}
    }))];
   });
   if(hrefs.length!==target.images)throw Error("Independent Joomla source image count changed "+target.id+" "+hrefs.length);
   const filenames=hrefs.map(url=>{
    const u=new URL(url),ext=u.pathname.split(".").at(-1).toLowerCase().replace("jpeg","jpg");
    return "pse-gallery-"+target.id+"-"+createHash("sha256").update(url).digest("hex").slice(0,16)+"."+ext;
   });
   expected.set(target.id,filenames);
   report.sourceOracle.push({id:target.id,sourceUrl,http:raw.status(),images:filenames.length,ordered:true});
   console.log("PSE_FOUR_GALLERY_ORACLE="+JSON.stringify(report.sourceOracle.at(-1)));
  }finally{await sourcePage.close()}
 }
 await sourceCtx.close();
 const samplePaths=[];
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const wpRequests=[];
  page.on("request",r=>{try{if(new URL(r.url()).origin===wp)wpRequests.push("leak")}catch{}});
  for(const target of targets){
   const response=await visit(page,front+"/"+target.slug);
   if(response?.status()!==200)throw Error("Gallery detail HTTP "+response?.status()+" "+target.slug);
   const images=page.locator("#article-content img");
   const count=await images.count();
   if(count!==target.images)throw Error("Original gallery count mismatch "+target.slug+" expected="+target.images+" got="+count);
   const srcs=await images.evaluateAll(es=>es.map(img=>new URL(img.getAttribute("src")||"",location.href).href));
   if(new Set(srcs).size!==count||srcs.some(x=>!x.startsWith(front+"/api/files/wp-content/uploads/")))
     throw Error("Duplicate, nonnative, or private images "+target.slug);
   const actualFilenames=srcs.map(x=>decodeURIComponent(new URL(x).pathname.split("/").at(-1)));
   if(actualFilenames.some((name,i)=>name!==expected.get(target.id)?.[i]))
     throw Error("Original Joomla source image identity/order mismatch at "+target.slug+" width "+width);
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
    const startWait=Date.now();
    await img.evaluate(async e=>{if(!e.complete)await new Promise(resolve=>{
      e.addEventListener("load",resolve,{once:true});
      e.addEventListener("error",resolve,{once:true});
      // WordPress image proxy can queue for up to 25s during release QA.
      // Don't label a still-pending network resource as corrupted at 12s.
      setTimeout(resolve,35000)})});
    const waitedMs=Date.now()-startWait;
    if(waitedMs>12000)console.warn("PSE_GALLERY_IMAGE_SLOW="+JSON.stringify({id:target.id,width,index:i,waitedMs}));
    if(!(await img.evaluate(e=>e.complete&&e.naturalWidth>0))){
     // Preserve original browser evidence. Probe the exact same public URL,
     // not a replacement asset. A successful network probe alone is NOT PASS.
     const state=await img.evaluate(e=>({src:e.src,currentSrc:e.currentSrc,complete:e.complete,naturalWidth:e.naturalWidth,loading:e.loading}));
     const u=new URL(state.currentSrc||state.src,front);
     const diagnostic={id:target.id,width,index:i,path:u.pathname,complete:state.complete,naturalWidth:state.naturalWidth,loading:state.loading,http:null,mime:null};
     if(u.origin===front&&u.href===srcs[i]){
      try{
       const r=await page.request.get(u.href,{timeout:35000,failOnStatusCode:false,maxRedirects:0});
       diagnostic.http=r.status();
       diagnostic.mime=String(r.headers()["content-type"]||"");
       diagnostic.bytes=(await r.body()).length;
       await r.dispose();
      }catch(e){diagnostic.networkError=String(e?.code||e?.name||"network")}
     }
     report.failures.push(diagnostic);
     console.log("PSE_GALLERY_PIXEL_DIAGNOSTIC="+JSON.stringify(diagnostic));
     throw Error("Gallery image pixel decode failed "+target.id+" index "+i);
    }
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
    const response=await visit(page,url.href);
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
   report.listing.push({pages:visited.size,uniqueCards:found.size,verifiedSourceAlbums:targets.length});
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
 if(checks.length!==targets.length*3||checks.some(x=>x.http!==200||!x.mime.startsWith("image/")))
  throw Error("Original WordPress media network GET sampling failed");
 console.log((threeOnly?"PSE_THREE_PUBLISHED_GALLERIES_LIVE_PASS=":"PSE_FOUR_GALLERY_LIVE_PASS=")+JSON.stringify({originalAlbums:targets.length,originalPhotos:totalImages,deferredSourceIds:report.deferredSourceIds,widths:2,checks:report.rows.length,
   mediaGetPass:checks.length,archivePages:report.listing[0]?.pages,wordpressOwned:true,readOnly:true}));
}finally{
 await mkdir("artifacts/pse-four-original-gallery-live",{recursive:true});
 await writeFile("artifacts/pse-four-original-gallery-live/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
