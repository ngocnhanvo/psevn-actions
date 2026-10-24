/** Live-only PSE corporate Page regression after native WordPress Build Website.
 * No authentication, no mutation; screenshots at mobile/desktop breakpoints.
 */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const entry=lines.filter(x=>x.startsWith("WC_URL_CLIENT="));
if(entry.length!==1)throw Error("Frontend origin missing");
const url=new URL(entry[0].slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||
   !["","/"].includes(url.pathname))throw Error("Invalid PSE frontend origin");
const slugs=[
 "thong-diep","hoi-dong-quan-tri","ban-kiem-soat","ban-giam-doc",
 "so-do-to-chuc","qua-trinh-hinh-thanh-phat-trien","tam-nhin-su-menh",
 "dinh-huong-phat-trien","nganh-nghe-kinh-doanh","thanh-tuu"
];
const visual=new Set(["thong-diep","so-do-to-chuc","thanh-tuu"]);
const browser=await chromium.launch({headless:true});
const dir="artifacts/pse-corporate-live";
await mkdir(dir,{recursive:true});
let failures=0,success=0;
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  try{
   for(const slug of slugs){
    const res=await page.goto(url.origin+"/"+slug,{waitUntil:"domcontentloaded",timeout:65000});
    const scan=await page.evaluate(()=>{
     const main=document.querySelector("#main-content.pse-public-page");
     const title=main?.querySelector("h1");
     const breadcrumb=document.querySelector('nav[aria-label="Đường dẫn trang"]');
     const images=main?[...main.querySelectorAll("img")].map(i=>({
       src:i.currentSrc||i.src,loaded:i.complete&&i.naturalWidth>0,
       alt:i.getAttribute("alt")||""
     })):[];
     const viewportWidth=document.documentElement.clientWidth;
     return {h1:!!title,heading:(title?.textContent||"").trim().slice(0,90),
       main:!!main,breadcrumb:!!breadcrumb,
       pseHeader:!!document.querySelector(".pse-header"),
       pseFooter:!!document.querySelector(".pse-footer"),
       horizontalOverflow:document.documentElement.scrollWidth>viewportWidth+2,
       hasLegacySidebar:!!main?.querySelector(".sidebar,.sidebar-left,#sidebar,.moduletable"),
       hasRelatedChrome:(main?.textContent||"").includes("Các bài viết khác"),
       images};
    });
    const pass=res?.status()===200&&scan.main&&scan.h1&&scan.breadcrumb&&
      scan.pseHeader&&scan.pseFooter&&!scan.horizontalOverflow&&!scan.hasLegacySidebar&&
      !scan.hasRelatedChrome&&scan.images.every(img=>img.loaded);
    console.log("PSE_CORPORATE_LIVE="+JSON.stringify({slug,width,http:res?.status()||0,
      ...scan,ok:pass}));
    if(pass)success++;else failures++;
    if(visual.has(slug)&&res?.status()===200)
      await page.screenshot({path:dir+"/"+slug+"-"+width+".png",fullPage:true});
   }
  }finally{await page.close()}
 }
 console.log("PSE_CORPORATE_LIVE_SUMMARY="+JSON.stringify({checked:20,success,failures,
   no_wp_write:true,no_build:true,source:"published WordPress Page+Astro"}));
 if(failures)process.exitCode=1;
}finally{await browser.close()}
