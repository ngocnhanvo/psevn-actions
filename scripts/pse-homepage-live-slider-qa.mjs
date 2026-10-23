// Live acceptance rerun after WordPress Build Website #39963151690 and signed FTPS #39963321072, Astro master 5ccac413.
/** Browser-only acceptance test of the WordPress-owned original PSE 11-image slider. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL_CLIENT="));
if(rows.length!==1)throw Error("PSE live URL missing");
const u=new URL(rows[0].slice("WC_URL_CLIENT=".length).trim().replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Bad PSE client URL");
const origin=u.origin;
const browser=await chromium.launch({headless:true});
const dir="artifacts/pse-homepage-slider-qa";
await mkdir(dir,{recursive:true});
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:920},deviceScaleFactor:1});
  try{
   const response=await page.goto(origin+"/",{waitUntil:"domcontentloaded",timeout:60000});
   if(!response||response.status()!==200)throw Error("PSE homepage HTTP "+response?.status());
   await page.locator("[data-pse-slider]").waitFor({state:"attached",timeout:25000});
   const slides=page.locator("[data-pse-slide]"),dots=page.locator("[data-pse-dot]");
   if(await slides.count()!==11||await dots.count()!==11)throw Error("Expected 11 genuine CMS slider items");
   // getData.ts turns native WordPress <img> markup into localized processed
   // image objects. The public src can be /images/pages/... or WP uploads;
   // never require a bare uploads URL after this transformation.
   const data=await page.evaluate(()=>[...document.querySelectorAll("[data-pse-slide]")].map(e=>{
     const im=e.querySelector("img");
     return {src:im?.getAttribute("src")||"",alt:im?.getAttribute("alt")||"",
       width:Number(im?.getAttribute("width")||0),height:Number(im?.getAttribute("height")||0),
       srcSet:im?.getAttribute("srcset")||""};
   }));
   if(data.length!==11||data.some(x=>!x.src||!x.alt.trim()||x.width<700||x.height<240))
      throw Error("Processed PSE hero images lack SEO alt, valid src or dimensions: "+JSON.stringify(data));
   console.log("PSE_PROCESSED_IMAGE_OBJECT_SEO=PASS; image_count=11; alt_count=11; valid_dimensions=11");
   await page.locator("[data-pse-slide].is-active img").first().waitFor({state:"visible",timeout:20000});
   if(width===1440){
    await page.mouse.move(3,3);
    const initial=await page.evaluate(()=>[...document.querySelectorAll("[data-pse-slide]")].findIndex(x=>x.classList.contains("is-active")));
    await page.waitForTimeout(6800);
    const next=await page.evaluate(()=>[...document.querySelectorAll("[data-pse-slide]")].findIndex(x=>x.classList.contains("is-active")));
    if(initial!==0||next!==1)throw Error("Original PSE desktop carousel autoplay did not advance after 6.2s: "+initial+" -> "+next);
    console.log("PSE_LEGACY_SLIDER_AUTOPLAY=PASS; desktop=true; from=0; to=1");
   }
   // Exercise ALL eleven real slides and force lazy-loaded pictures to decode
   // while each is active, including the original image and ten Media assets.
   for(let i=0;i<11;i++){
     await dots.nth(i).click();
     await page.waitForFunction(index=>{
       const slide=[...document.querySelectorAll("[data-pse-slide]")][index];
       const image=slide?.querySelector("img");
       return slide?.classList.contains("is-active") && Boolean(image?.complete && image.naturalWidth>0);
     },i,{timeout:20000});
   }
   console.log("PSE_PROCESSED_IMAGE_LOAD=PASS; width="+width+"; all_11_images_decode=true");
   const target=dots.nth(5);
   await target.click();
   if(!await slides.nth(5).evaluate(e=>e.classList.contains("is-active")))throw Error("Slider dots do not change active banner");
   await dots.first().click();
   const hero=await page.evaluate(()=>{
     const image=document.querySelector("[data-pse-slide].is-active .pse-hero__photo");
     return {
       overlays:document.querySelectorAll(".pse-hero__copy,.pse-hero__shade,.pse-hero__content").length,
       imageFilter:image?getComputedStyle(image).filter:null,
       imageOpacity:image?getComputedStyle(image).opacity:null
     };
   });
   if(hero.overlays!==0||hero.imageFilter!=="none"||Number(hero.imageOpacity)!==1)
     throw Error("Hero must show original photo without overlay or filters: "+JSON.stringify(hero));
   console.log("PSE_HERO_UNDIMMED=PASS; width="+width+"; original_photo_only=true");
   if(width===1440){
     const root=page.locator("#desktop-menu [data-menu-trigger]").filter({hasText:/QUAN HỆ NHÀ ĐẦU TƯ/i}).first();
     if(!await root.count())throw Error("Investor navigation trigger missing");
     await root.click();
     const rootId=await root.getAttribute("aria-controls");
     const rootPanel=page.locator('[id="'+rootId+'"]');
     await rootPanel.waitFor({state:"visible",timeout:8000});
     const sub=rootPanel.locator("[data-submenu-trigger]").filter({hasText:/Tin tức cổ đông/i}).first();
     if(!await sub.count())throw Error("Verified investor news submenu missing");
     await sub.click();
     const nestedId=await sub.getAttribute("aria-controls");
     const nested=page.locator('[id="'+nestedId+'"]');
     await nested.waitFor({state:"visible",timeout:8000});
     await page.waitForTimeout(300);
     const a=await rootPanel.boundingBox(),b=await nested.boundingBox();
     if(!a||!b)throw Error("Unable to measure open menu panels");
     const intersectX=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x);
     const intersectY=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
     if(intersectX>2&&intersectY>2)throw Error("Nested dropdown covers parent items: "+JSON.stringify({a,b}));
     if(b.x<0||b.x+b.width>1440)throw Error("Nested dropdown outside viewport");
     console.log("PSE_NESTED_DROPDOWN_COLLISION=PASS; overlap=false; viewport=1440");
     await page.keyboard.press("Escape");
   }
   await page.screenshot({path:dir+"/pse-slider-"+width+".png",fullPage:false,animations:"disabled",timeout:20000});
   console.log("PSE_LEGACY_SLIDER_LIVE=PASS; width="+width+"; slides=11; dots=11; processed_wordpress_media=true; alt=PASS; dot_navigation=PASS; unobstructed=PASS");
  }finally{await page.close()}
 }
 console.log("PSE_LEGACY_SLIDER_LIVE_QA=PASS; desktop_mobile=true; no_writes=true");
}finally{await browser.close()}
