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
   const data=await page.evaluate(()=>[...document.querySelectorAll("[data-pse-slide]")].map(e=>e.querySelector("img")?.getAttribute("src")||""));
   if(data.length!==11||data.some(src=>!src||!src.includes("/wp-content/uploads/")))throw Error("Slider has missing/non-WP media");
   await page.locator("[data-pse-slide].is-active img").first().waitFor({state:"visible",timeout:20000});
   if(width===1440){
    await page.mouse.move(3,3);
    const initial=await page.evaluate(()=>[...document.querySelectorAll("[data-pse-slide]")].findIndex(x=>x.classList.contains("is-active")));
    await page.waitForTimeout(6800);
    const next=await page.evaluate(()=>[...document.querySelectorAll("[data-pse-slide]")].findIndex(x=>x.classList.contains("is-active")));
    if(initial!==0||next!==1)throw Error("Original PSE desktop carousel autoplay did not advance after 6.2s: "+initial+" -> "+next);
    console.log("PSE_LEGACY_SLIDER_AUTOPLAY=PASS; desktop=true; from=0; to=1");
   }
   const target=dots.nth(5);
   await target.click();
   if(!await slides.nth(5).evaluate(e=>e.classList.contains("is-active")))throw Error("Slider dots do not change active banner");
   await dots.first().click();
   const copy=page.locator("[data-pse-slide].is-active .pse-hero__copy");
   if(width===1440){
    await page.mouse.move(6,6);
    await page.waitForTimeout(400);
    const before=await copy.evaluate(e=>getComputedStyle(e).opacity);
    await page.locator("[data-pse-slide].is-active").hover({position:{x:250,y:120}});
    await page.waitForTimeout(420);
    const after=await copy.evaluate(e=>getComputedStyle(e).opacity);
    if(Number(before)>.15||Number(after)<.85)throw Error("Desktop hover hero overlay opacity is wrong: "+before+" / "+after);
   }else{
    const opacity=await copy.evaluate(e=>getComputedStyle(e).opacity);
    if(Number(opacity)<.85)throw Error("Mobile hero overlay must stay readable");
   }
   await page.screenshot({path:dir+"/pse-slider-"+width+".png",fullPage:false,animations:"disabled",timeout:20000});
   console.log("PSE_LEGACY_SLIDER_LIVE=PASS; width="+width+"; slides=11; dots=11; original_wp_media=true; dot_navigation=PASS; overlay=PASS");
  }finally{await page.close()}
 }
 console.log("PSE_LEGACY_SLIDER_LIVE_QA=PASS; desktop_mobile=true; no_writes=true");
}finally{await browser.close()}
