/** PSE post-release real-browser QA; read only, no form submissions. */
import { chromium } from "playwright";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=key=>{const r=rows.filter(s=>s.startsWith(key+"="));if(r.length!==1)throw Error("Missing origin "+key);const u=new URL(r[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid origin");return u.origin};
const frontend=origin("WC_URL_CLIENT"),wp=origin("WC_URL");
if(frontend===wp)throw Error("CMS/public origin overlap");
const browser=await chromium.launch({headless:true});let passed=0;
try{
 for(const width of [390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:width===390?844:900}});
   const wpUrls=[];
   page.on("request",req=>{try{if(new URL(req.url()).origin===wp)wpUrls.push(req.url())}catch{}});
   const list=await page.goto(frontend+"/tin-tuc-su-kien/anh",{waitUntil:"domcontentloaded",timeout:65000});
   if(list?.status()!==200)throw Error("Photo archive not available "+width+" HTTP "+list?.status());
   const cards=page.locator("#posts-grid .pse-media-card");
   if(await cards.count()<1)throw Error("Native WordPress photo album missing from SSR listing "+width);
   const href=await cards.first().locator("a[href]").first().getAttribute("href");
   if(!href||!href.includes("994-nha-dai-doan-ket"))throw Error("Expected verified album absent "+width);
   const post=await page.goto(new URL(href,frontend).href,{waitUntil:"domcontentloaded",timeout:65000});
   if(post?.status()!==200)throw Error("Native album detail failed "+width+" HTTP "+post?.status());
   const content=page.locator("#article-content");
   const imgs=content.locator("img");
   if(await imgs.count()!==3)throw Error("Gallery must contain exactly three genuine images "+width);
   await imgs.evaluateAll(async elements=>{await Promise.all(elements.map(img=>img.complete?null:new Promise(resolve=>{img.addEventListener("load",resolve,{once:true});img.addEventListener("error",resolve,{once:true});setTimeout(resolve,15000)})))});
   const photos=await imgs.evaluateAll(elements=>elements.map(img=>({ok:img.complete&&img.naturalWidth>0,src:img.currentSrc||img.src})));
   if(photos.some(x=>!x.ok||!x.src.includes("/api/files/wp-content/uploads/")))throw Error("Photos not loaded from public same-origin proxy "+width);
   if(wpUrls.length)throw Error("Browser requested private WordPress hostname");
   const html=await page.content();
   if(html.includes(wp))throw Error("WordPress admin origin leaked in public album HTML");
   await imgs.first().click();
   const dialog=page.locator("[data-pse-gallery-dialog]");
   await dialog.waitFor({state:"visible",timeout:6000});
   await dialog.locator("[data-pse-gallery-next]").click();
   if(!(await dialog.locator("[data-pse-gallery-counter]").innerText()).includes("2 / 3"))throw Error("Gallery arrow navigation failed");
   await page.keyboard.press("Escape");
   if(await dialog.isVisible())throw Error("Gallery Escape did not close dialog");
   if(await page.evaluate(()=>document.body.scrollWidth>window.innerWidth+1))throw Error("Album horizontal overflow "+width);
   console.log("PSE_MEDIA_LIVE_PHOTO=PASS width="+width+" cards="+await cards.count().catch(()=>0)+" photos=3 lightbox=PASS admin_origin=HIDDEN");
   await page.goto(frontend+"/tin-tuc-su-kien/video",{waitUntil:"domcontentloaded",timeout:50000});
   if(await page.locator("#posts-grid .pse-media-card").count()!==0)console.log("PSE_MEDIA_VIDEO: native new content discovered; verify source");
   else console.log("PSE_MEDIA_LIVE_VIDEO=EMPTY_TRUE width="+width);
   const contact=await page.goto(frontend+"/lien-he",{waitUntil:"domcontentloaded",timeout:50000});
   if(contact?.status()!==200)throw Error("Contact Page HTTP "+contact?.status());
   const body=(await page.locator("main").innerText()).toLowerCase();
   const warehouses=["đồng nai","long an","lâm đồng","bình phước","đắk nông"];
   const present=warehouses.filter(x=>body.includes(x));
   if(present.length!==5)throw Error("Verified five warehouse cards missing: "+present.join(","));
   if(await page.evaluate(()=>document.body.scrollWidth>window.innerWidth+1))throw Error("Contact horizontal overflow "+width);
   console.log("PSE_MEDIA_LIVE_CONTACT=PASS width="+width+" warehouses=5");
   await page.close();passed++;
 }
 const check=await browser.newPage();
 const res=await check.goto(frontend+"/hoat-dong-kinh-doanh/xu-ly-khieu-nai-y-kien-khach-hang",{waitUntil:"domcontentloaded",timeout:50000});
 console.log("PSE_COMPLAINT_LIVE_STATUS="+res?.status()+" (known CMS/config activation tracked separately; no emails sent)");
 await check.close();
 console.log("PSE_MEDIA_LIVE_QA=PASS; viewports="+passed+"; photoAndContactOnly=true; complaintActivationIndependent=true");
}finally{await browser.close()}
