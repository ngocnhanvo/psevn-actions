/** PSE post-release real-browser QA; read only, no form submissions. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=key=>{const r=rows.filter(s=>s.startsWith(key+"="));if(r.length!==1)throw Error("Missing origin "+key);const u=new URL(r[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid origin");return u.origin};
const frontend=origin("WC_URL_CLIENT"),wp=origin("WC_URL");
if(frontend===wp)throw Error("CMS/public origin overlap");
const browser=await chromium.launch({headless:true});let passed=0;
await mkdir("artifacts/pse-media-visual",{recursive:true});
try{
 for(const width of [390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:width===390?844:900}});
   const wpUrls=[];
   page.on("request",req=>{try{if(new URL(req.url()).origin===wp)wpUrls.push(req.url())}catch{}});
   const list=await page.goto(frontend+"/tin-tuc-su-kien/anh",{waitUntil:"domcontentloaded",timeout:65000});
   if(list?.status()!==200)throw Error("Photo archive not available "+width+" HTTP "+list?.status());
   const cards=page.locator("#posts-grid .pse-media-card");
   const initialCards=await cards.count();
   if(initialCards<1)throw Error("Native WordPress photo album missing from SSR listing "+width);
   await page.screenshot({path:`artifacts/pse-media-visual/photos-${width}.png`,fullPage:true});
   // Once the archive exceeds one SSR page, verify albums across every
   // native pagination page. Never assume the first twelve cards are the
   // complete WordPress category or silently skip older published albums.
   const availableSet=new Set();
   const listingQueue=[page.url()],visitedListing=new Set();
   while(listingQueue.length){
     const next=new URL(listingQueue.shift(),frontend);
     if(next.origin!==frontend||!new RegExp("^/tin-tuc-su-kien/anh(?:/[0-9]+)?/?$").test(next.pathname)||next.search)
       throw Error("Unexpected gallery pagination destination");
     if(visitedListing.has(next.href))continue;
     if(visitedListing.size>=20)throw Error("Gallery SSR pagination exceeded safety bound");
     if(visitedListing.size){
       const response=await page.goto(next.href,{waitUntil:"domcontentloaded",timeout:65000});
       if(response?.status()!==200)throw Error("Gallery SSR pagination failed width "+width+" HTTP "+response?.status());
     }
     visitedListing.add(next.href);
     const pageCards=page.locator("#posts-grid .pse-media-card");
     if(await pageCards.count()===0)throw Error("Empty gallery pagination page "+visitedListing.size);
     const links=await pageCards.locator("a[href]").evaluateAll(elements=>[...new Set(elements.map(a=>a.getAttribute("href")||"").filter(Boolean))]);
     for(const link of links)availableSet.add(link);
     const html=await page.content();
     if(html.includes(wp)||wpUrls.length)throw Error("Private WordPress origin exposed in SSR gallery listing");
     const pagination=await page.locator('nav[aria-label="Phân trang"] a[href]').evaluateAll(elements=>elements.map(a=>a.href));
     for(const href of pagination){
       const target=new URL(href,frontend);
       if(target.origin!==frontend||!new RegExp("^/tin-tuc-su-kien/anh(?:/[0-9]+)?/?$").test(target.pathname)||target.search)
         throw Error("Unexpected gallery pagination link");
       if(!visitedListing.has(target.href))listingQueue.push(target.href);
     }
   }
   const available=[...availableSet];
   console.log("PSE_MEDIA_LISTING=PASS width="+width+" pages="+visitedListing.size+" uniqueCards="+available.length);
   const verifiedAlbums=[
     {slug:"994-nha-dai-doan-ket",count:3},
     {slug:"995-phu-nu-viet-nam",count:11},
     {slug:"991-ngay-hoi-truyen-thong-2011",count:10},
     {slug:"987-khai-truong-cua-hang-ngay-3-6",count:10},
     {slug:"992-mau-bao-bi",count:2},
     {slug:"996-hoc-van-hoa-doanh-nghiep",count:6},
     {slug:"997-truong-sa",count:7},
     {slug:"993-ngay-truyen-thong",count:11},
     {slug:"986-hoi-thao-tong-ket-vuon-thuc-nghiem-ngay-3-6-2013",count:35},
     {slug:"988-doan-thanh-nien-2011",count:32},
     {slug:"985-hinh-anh-marketing-2010",count:44}
   ];
   for(const album of verifiedAlbums){
   const href=available.find(path=>path.includes(album.slug));
   if(!href)throw Error("Verified WordPress album absent from SSR listing "+album.slug+" width "+width);
   const post=await page.goto(new URL(href,frontend).href,{waitUntil:"domcontentloaded",timeout:65000});
   if(post?.status()!==200)throw Error("Native album detail failed "+album.slug+" width "+width+" HTTP "+post?.status());
   const content=page.locator("#article-content");
   const imgs=content.locator("img");
   if(await imgs.count()!==album.count)throw Error("Gallery image count mismatch "+album.slug+" width "+width);
   // Original WordPress gallery images use native lazy loading.
   // Scroll each real image into view before assessing loaded pixels, rather
   // than mistaking intentional off-screen deferral for a broken upstream file.
   for(const image of await imgs.all())await image.scrollIntoViewIfNeeded();
   await imgs.evaluateAll(async elements=>{
      await Promise.all(elements.map(img=>img.complete?null:new Promise(resolve=>{
        img.addEventListener("load",resolve,{once:true});
        img.addEventListener("error",resolve,{once:true});
        setTimeout(resolve,20000);
      })));
   });
   const photos=await imgs.evaluateAll(elements=>elements.map(img=>({ok:img.complete&&img.naturalWidth>0,src:img.currentSrc||img.src})));
   if(photos.some(x=>!x.ok||!x.src.includes("/api/files/wp-content/uploads/")))throw Error("Photos not loaded from public same-origin proxy "+width);
   if(wpUrls.length)throw Error("Browser requested private WordPress hostname");
   const html=await page.content();
   const seo=await page.evaluate(()=>({
     h1:document.querySelectorAll("h1").length,
     canonical:document.querySelector('link[rel="canonical"]')?.href||"",
     ogUrl:document.querySelector('meta[property="og:url"]')?.content||"",
     ogImage:document.querySelector('meta[property="og:image"]')?.content||""
   }));
   const canonicalUrl=seo.canonical?new URL(seo.canonical,frontend):null;
   if(seo.h1!==1||!canonicalUrl||canonicalUrl.origin!==frontend||!canonicalUrl.pathname.includes(album.slug)||
     (seo.ogUrl&&new URL(seo.ogUrl,frontend).origin!==frontend)||
     (seo.ogImage&&new URL(seo.ogImage,frontend).origin!==frontend))
     throw Error("Gallery SEO contract mismatch "+album.slug+" width="+width+" safe="+JSON.stringify(seo));
   if(html.includes(wp)){
     const evidence=await page.evaluate(origin=>{
       const attrs=[];
       for(const el of document.querySelectorAll("*")){
         for(const attr of el.attributes)if(attr.value.includes(origin))
           attrs.push({tag:el.tagName.toLowerCase(),name:attr.name,elementId:el.id||null});
       }
       const scripts=[...document.scripts].filter(x=>x.textContent?.includes(origin))
           .map(x=>({tag:"script",type:x.type||"js",id:x.id||null,chars:x.textContent.length}));
       const styles=[...document.querySelectorAll("style")].filter(x=>x.textContent?.includes(origin))
           .map(x=>({tag:"style",id:x.id||null}));
       return{attrs:attrs.slice(0,15),scripts:scripts.slice(0,10),styles:styles.slice(0,10),all:attrs.length+scripts.length+styles.length};
     },wp);
     throw Error("WordPress admin origin leaked in public album HTML, safe DOM evidence="+JSON.stringify(evidence));
   }
   await imgs.first().click();
   const dialog=page.locator("[data-pse-gallery-dialog]");
   await dialog.waitFor({state:"visible",timeout:6000});
   await dialog.locator("[data-pse-gallery-next]").click();
   if(!(await dialog.locator("[data-pse-gallery-counter]").innerText()).includes("2 / "+album.count))throw Error("Gallery arrow navigation failed "+album.slug);
   await page.keyboard.press("Escape");
   if(await dialog.isVisible())throw Error("Gallery Escape did not close dialog");
   if(await page.evaluate(()=>document.body.scrollWidth>window.innerWidth+1))throw Error("Album horizontal overflow "+width);
   if(album.slug==="994-nha-dai-doan-ket")await page.screenshot({path:`artifacts/pse-media-visual/photo-detail-${width}.png`,fullPage:true});
   console.log("PSE_MEDIA_LIVE_PHOTO=PASS width="+width+" album="+album.slug+" photos="+album.count+" lightbox=PASS admin_origin=HIDDEN");
   } // every verified native WordPress album
   await page.goto(frontend+"/tin-tuc-su-kien/video",{waitUntil:"domcontentloaded",timeout:50000});
   if(await page.locator("#posts-grid .pse-media-card").count()!==0)console.log("PSE_MEDIA_VIDEO: native new content discovered; verify source");
   else console.log("PSE_MEDIA_LIVE_VIDEO=EMPTY_TRUE width="+width);
   const contact=await page.goto(frontend+"/lien-he",{waitUntil:"domcontentloaded",timeout:50000});
   if(contact?.status()!==200)throw Error("Contact Page HTTP "+contact?.status());
   const body=(await page.locator("main#main-content").first().innerText()).toLowerCase();
   const warehouses=["đồng nai","long an","lâm đồng","bình phước","đắk nông"];
   const present=warehouses.filter(x=>body.includes(x));
   if(present.length!==5)throw Error("Verified five warehouse cards missing: "+present.join(","));
   if(body.includes("nội dung sẽ được cập nhật khi cấu hình website mới"))
     throw Error("Internal CMS editor note leaked to public Contact page");
   const geometry=await page.locator("[data-pse-contact-two-column]").evaluate(root=>{
     const office=root.querySelector(".pse-contact-layout__office");
     const form=root.querySelector(".pse-contact-layout__form");
     const warehouses=root.querySelector(".pse-contact-layout__warehouses");
     if(!office||!form||!warehouses)throw Error("Contact layout regions missing");
     const a=office.getBoundingClientRect(),b=form.getBoundingClientRect(),c=warehouses.getBoundingClientRect();
     return {office:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},
       form:{left:b.left,top:b.top,bottom:b.bottom},
       warehousesTop:c.top};
   });
   if(width>900){
     if(Math.abs(geometry.office.top-geometry.form.top)>8 ||
       geometry.form.left<geometry.office.right-4)
       throw Error("Desktop contact information and form are not side by side");
   }else if(geometry.form.top<geometry.office.bottom-8)
     throw Error("Mobile/tablet contact form should stack below office information");
   if(geometry.warehousesTop<Math.max(geometry.office.bottom,geometry.form.bottom)-8)
     throw Error("Five contact warehouses must remain below office and form");
   console.log("PSE_CONTACT_TWO_COLUMN=PASS width="+width+" warehouse_below=true internal_note_absent=true");

   // Validate the live Contact form without submitting personal data or sending mail.
   // checkValidity() only evaluates native constraints; it never fires submit.
   const contactForms=page.locator("form#contact-form");
   if(await contactForms.count()!==1)throw Error("Contact form missing or duplicated at "+width);
   const formState=await contactForms.evaluate(form=>({
     fields:["name","phone","email","subject","message"].map(name=>{
       const el=form.elements.namedItem(name);
       return {name,exists:el instanceof HTMLElement,required:el instanceof HTMLElement&&el.hasAttribute("required"),type:el instanceof HTMLInputElement?el.type:null};
     }),
     invalidEmpty:!form.checkValidity(),
     captcha:!!form.querySelector("#cf-turnstile-container"),
     submit:!!form.querySelector('button[type="submit"]')
   }));
   if(formState.fields.some(x=>!x.exists||!x.required)||formState.fields.find(x=>x.name==="email")?.type!=="email"||!formState.invalidEmpty||!formState.captcha||!formState.submit)
     throw Error("Contact form structure/HTML5 validation failed at "+width+" safe="+JSON.stringify(formState));
   if((await page.content()).includes(wp)||wpUrls.length)throw Error("Private WordPress origin exposed on Contact page");
   console.log("PSE_MEDIA_CONTACT_FORM=PASS width="+width+" required=5 html5EmptyInvalid=true noSubmit=true noEmail=true");
   if(await page.evaluate(()=>document.body.scrollWidth>window.innerWidth+1))throw Error("Contact horizontal overflow "+width);
   await page.screenshot({path:`artifacts/pse-media-visual/contact-${width}.png`,fullPage:true});
   console.log("PSE_MEDIA_LIVE_CONTACT=PASS width="+width+" warehouses=5");
   await page.close();passed++;
 }
 const check=await browser.newPage();
 const res=await check.goto(frontend+"/hoat-dong-kinh-doanh/xu-ly-khieu-nai-y-kien-khach-hang",{waitUntil:"domcontentloaded",timeout:50000});
 console.log("PSE_COMPLAINT_LIVE_STATUS="+res?.status()+" (known CMS/config activation tracked separately; no emails sent)");
 await check.close();
 console.log("PSE_MEDIA_LIVE_QA=PASS; viewports="+passed+"; photoAndContactOnly=true; complaintActivationIndependent=true");
}finally{await browser.close()}
