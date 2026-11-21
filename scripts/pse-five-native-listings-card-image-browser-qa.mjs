/**
 * PSE native post listing actual public browser image & PDF tile QA.
 * No source Joomla requests (upstream original Joomla currently times out).
 * Verify only existing 5 canonical Vietnamese category/list pages on deployed Astro.
 * GET-only, no edits/build, 390px and 1440px actual Chrome.
 */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main")throw Error("Wrong PSE repo/ref");
const origin="https://pse.webnvn.com";
const paths=[
 "/tin-tuc-su-kien",
 "/tin-tuc-su-kien/tin-tong-hop",
 "/tin-tuc-su-kien/ban-cong-bo-thong-tin",
 "/tin-tuc-su-kien/bao-cao-thuong-nien",
 "/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty"
];
const viewportWidths=[390,1440];
const report={schema:"pse-five-original-news-listing-native-card-image-browser-qa-v1",
 readOnly:true,noCmsWrites:true,noBuild:true,noFtp:true,
 paths,viewportWidths,rows:[],summary:null};
const browser=await chromium.launch({headless:true});
try{
 for(const width of viewportWidths){
  const ctx=await browser.newContext({viewport:{width,height:900}});
  try{
   for(const path of paths){
    const page=await ctx.newPage(),row={url:origin+path,width,http:null,
     title:null,canonical:null,cardCount:null,imgCount:null,documentTiles:0,
     imageChecks:[],missingFallbackCount:null,overflowPx:null,decision:null,error:null};
    report.rows.push(row);
    try{
     page.setDefaultTimeout(13000);
     const r=await page.goto(row.url,{waitUntil:"domcontentloaded",timeout:55000});
     row.http=r?.status()||0;
     if(row.http!==200){row.decision="PUBLIC_LISTING_HTTP_NOT_200";continue}
     const meta=await page.evaluate(()=>{
      const main=document.querySelector("main");
      const cards=[...document.querySelectorAll("#posts-grid .grid > div")];
      const images=[...document.querySelectorAll("#posts-grid .post-card-img")];
      return{
       title:(main?.querySelector("h1")?.textContent||"").replace(/\s+/g," ").trim(),
       canonical:document.querySelector('link[rel="canonical"]')?.href||null,
       cards:cards.length,images:images.length,
       pdfTiles:document.querySelectorAll('#posts-grid [data-pse-document-thumb="pdf"]').length,
       missingFallback:document.querySelectorAll('#posts-grid img[src="/images/posts/no-image.svg"]').length,
       overflow:document.documentElement.scrollWidth-window.innerWidth
      };
     });
     row.title=meta.title;row.canonical=meta.canonical;row.cardCount=meta.cards;
     row.imgCount=meta.images;row.documentTiles=meta.pdfTiles;
     row.missingFallbackCount=meta.missingFallback;
     row.overflowPx=meta.overflow;
     const can=row.canonical?new URL(row.canonical,origin):null;
     if(!row.title||row.cardCount<1||row.cardCount>30||row.overflowPx>4||
      can?.origin!==origin||can.pathname.replace(/\/$/,"")!==path)
     {row.decision="PUBLIC_LISTING_LAYOUT_METADATA_REVIEW";continue}
     const imgs=page.locator("#posts-grid .post-card-img");
     const take=Math.min(4,row.imgCount);
     for(let i=0;i<take;i++){
      const im=imgs.nth(i);
      await im.scrollIntoViewIfNeeded({timeout:13000});
      await im.evaluate(e=>{if(!e.complete)e.loading="eager"});
      await page.waitForFunction(index=>{
       const e=document.querySelectorAll("#posts-grid .post-card-img")[index];
       return !e||e.complete||e.dataset.fallbackApplied==="true";
      },i,{timeout:13000}).catch(()=>{});
      const z=await im.evaluate(e=>({
       src:e.getAttribute("src")||"",
       currentSrc:e.currentSrc||"",
       loaded:e.complete&&e.naturalWidth>0&&e.naturalHeight>0,
       naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight,
       fallbackApplied:e.dataset.fallbackApplied==="true"
      }));
      if(z.src.startsWith("https://admin-pse.webnvn.com"))
       throw Error("Admin origin leaked into user card image");
      row.imageChecks.push({...z,sourcePosition:i});
     }
     const failed=row.imageChecks.filter(x=>!x.loaded||x.fallbackApplied);
     row.decision=failed.length?"PUBLIC_CARD_IMAGE_LOAD_ISSUES":"PASS";
    }catch(e){row.error=String(e?.name||e?.message||"browser").slice(0,350);
      row.decision="BROWSER_QA_INCONCLUSIVE"}
    console.log("PSE_POST_LISTING_BROWSER_QA_ROW="+JSON.stringify(row).slice(0,5000));
    await page.close();
   }
  }finally{await ctx.close()}
 }
 report.summary={
  pages:paths.length,viewports:viewportWidths.length,checked:report.rows.length,
  pass:report.rows.filter(x=>x.decision==="PASS").length,
  issues:report.rows.filter(x=>x.decision!=="PASS").map(x=>({path:new URL(x.url).pathname,
   width:x.width,reason:x.decision,error:x.error})),
  cards:report.rows.map(x=>x.cardCount||0).reduce((a,b)=>a+b,0),
  thumbnailsBrowserChecked:report.rows.reduce((n,r)=>n+r.imageChecks.length,0),
  pdfTilesVisible:report.rows.reduce((n,r)=>n+r.documentTiles,0),
  noCmsWrites:true,noBuild:true,noJoomlaRequests:true};
 console.log("PSE_POST_LISTING_BROWSER_QA_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-native-listing-browser",{recursive:true});
 await writeFile("artifacts/pse-native-listing-browser/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
