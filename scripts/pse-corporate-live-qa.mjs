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
    // The optimized Astro Page images may be srcset-only. DOMContentLoaded is
    // earlier than image selection/download; wait for decode before QA verdict.
    const hasImages=await page.locator("#main-content.pse-public-page img").count();
    if(res?.status()===200 && hasImages>0){
      await page.waitForFunction(()=>{
        const imgs=[...document.querySelectorAll("#main-content.pse-public-page img")];
        return imgs.length>0 && imgs.every(img=>img.complete && img.naturalWidth>0);
      },null,{timeout:18000}).catch(()=>{});
    }
    const scan=await page.evaluate(()=>{
     const main=document.querySelector("#main-content.pse-public-page");
     const title=main?.querySelector("h1");
     const breadcrumb=document.querySelector('nav[aria-label="Đường dẫn trang"]');
     const images=main?[...main.querySelectorAll("img")].map(i=>({
       src:i.currentSrc||i.src,loaded:i.complete&&i.naturalWidth>0,
       alt:i.getAttribute("alt")||"",
       srcAttribute:i.getAttribute("src")||"",
       srcsetPrefix:(i.getAttribute("srcset")||"").slice(0,120),
       complete:i.complete,
       naturalWidth:i.naturalWidth
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
 // G3 verification is required after changes to the shared Header menu,
 // so the same run detects regressions on corporate Pages and news archives.
 const newsRoutes=[
  {path:"/tin-tuc-su-kien/",posts:true},
  {path:"/tin-tuc-su-kien/?cat=tin-cong-ty",posts:true},
  {path:"/tin-tuc-su-kien/?cat=thong-tin-co-dong",posts:true},
  {path:"/tin-tuc-su-kien/?cat=tin-tong-hop"},
  {path:"/tin-tuc-su-kien/?cat=anh"},
  {path:"/tin-tuc-su-kien/2",posts:true}
 ];
 let newsPass=0,newsFail=0;
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  try{
   for(let n=0;n<newsRoutes.length;n++){
    const route=newsRoutes[n];
    let http=0;
    try{
     const r=await page.goto(url.origin+route.path,{waitUntil:"domcontentloaded",timeout:45000});
     http=r?.status()||0;
     const detail=await page.evaluate(()=>{
       const main=document.querySelector("#main-content.pse-posts");
       const cards=main?.querySelectorAll("#posts-grid .grid > div").length||0;
       const crumbs=document.querySelector('nav[aria-label="Đường dẫn trang"]');
       return {main:!!main,h1:main?.querySelectorAll("h1").length||0,
        cards,breadcrumb:!!crumbs,sidebar:!!main?.querySelector(".sidebar,.moduletable,#sidebar"),
        overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
        filter:!!main?.querySelector("#category-dropdown-container"),
        seoDescription:!!document.querySelector('meta[name="description"]')
       };
     });
     const pass=http===200&&detail.main&&detail.h1===1&&detail.breadcrumb&&
       detail.filter&&!detail.sidebar&&!detail.overflow&&(!route.posts||detail.cards>0);
     console.log("PSE_NEWS_LIVE="+JSON.stringify({width,path:route.path,http,...detail,ok:pass}));
     if(pass)newsPass++;else newsFail++;
     if(http===200&&n<=2)await page.screenshot({
       path:dir+"/news-"+width+"-"+n+".png",fullPage:true
     });
    }catch(e){
     newsFail++;
     console.log("PSE_NEWS_LIVE_ERROR="+JSON.stringify({width,path:route.path,
       http,error:String(e).slice(0,230)}));
    }
   }
  }finally{await page.close()}
 }
 console.log("PSE_NEWS_LIVE_SUMMARY="+JSON.stringify({
   checked:12,success:newsPass,failures:newsFail,no_wp_write:true,no_build:true
 }));
 if(newsFail)process.exitCode=1;
 if(failures)process.exitCode=1;
}finally{await browser.close()}
