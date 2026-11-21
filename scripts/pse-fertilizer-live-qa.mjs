/** PSE newly published native Product & authentic fertilizer guides. Read-only live visual QA. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL_CLIENT="));
if(lines.length!==1)throw Error("Missing PSE frontend origin");
const url=new URL(lines[0].slice(14).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Invalid frontend origin");

const cmsLines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL="));
if(cmsLines.length!==1)throw Error("Missing native WordPress origin");
const nativeURL=new URL(cmsLines[0].slice(7).replace(/^['"]|['"]$/g,""));
if(nativeURL.protocol!=="https:"||nativeURL.username||nativeURL.password||nativeURL.port||nativeURL.search||nativeURL.hash||
 !["","/"].includes(nativeURL.pathname)||nativeURL.origin===url.origin)throw Error("Invalid native WordPress origin");
const originalGardenSourceSlugs=["pmgarden009","pmgarden002","pmgarden003","pmgarden004","pmgarden005","pmgarden006","pmgarden007","pmgarden008"];
// The verified original six-category inventory remains 45 unique Products.
// Only the exact eight independently authenticated Garden variants may raise
// the expected public catalog size to 53 (4 SSR pages), never a generic count.
const productRegistry=await fetch(nativeURL.origin+"/wp-json/wp/v2/product?status=publish&per_page=100&_fields=id,slug",{signal:AbortSignal.timeout(35000)});
if(!productRegistry.ok)throw Error("Native product registry HTTP "+productRegistry.status);
const current=await productRegistry.json();
if(!Array.isArray(current))throw Error("Native Product registry unavailable");
const currentSlugs=new Set(current.map(x=>String(x.slug||"")));
const gardenCount=originalGardenSourceSlugs.filter(x=>currentSlugs.has("phu-my-garden-"+x)).length;
if(gardenCount!==0&&gardenCount!==8)throw Error("Incomplete original Garden migration "+gardenCount+"/8");
const expectedTotal=45+gardenCount;
if(current.length!==expectedTotal)throw Error("Unexpected native Product inventory "+current.length+" instead of "+expectedTotal);
console.log("PSE_PRODUCT_LIVE_SOURCE_COHORT="+JSON.stringify({coreOriginal:45,gardenOriginal:gardenCount,
 expectedPublicProducts:expectedTotal,expectedSSRPages:Math.ceil(expectedTotal/16),verifiedGardenSlugs:gardenCount}));

const specs=[
 {kind:"catalog",path:"/san-pham/",title:"Sản phẩm",minCards:16},
 {kind:"manual",path:"/tai-lieu-huong-dan-su-dung-phan-bon/",title:"Tài liệu hướng dẫn sử dụng phân bón",minCards:7},
 {kind:"detail",path:"/ssr/products/huu-co-phu-my-organic-80-1720/detail",title:"Hữu cơ Phú Mỹ Organic 80"}
];
await mkdir("artifacts/pse-product-live",{recursive:true});
const browser=await chromium.launch({headless:true}),results=[];let passed=0;
try{
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:880},deviceScaleFactor:1});
  try{
   for(const spec of specs){
    try{
     const res=await page.goto(url.origin+spec.path,{waitUntil:"domcontentloaded",timeout:60000});
     if(spec.kind==="catalog"&&res?.status()===200)
       await page.waitForFunction(()=>document.querySelectorAll("#product-grid article,article.pse-catalog-card").length>0,{timeout:15000}).catch(()=>{});
     let catalogAudit=null;
     if(spec.kind==="catalog"&&res?.status()===200){
       const ssrCount=await page.locator("article.pse-catalog-card").count();
       const collect=()=>page.evaluate(()=>[...document.querySelectorAll("article.pse-catalog-card")].map(card=>({
         href:card.querySelector("a[href]")?.getAttribute("href")||"",
         srcset:card.querySelector("img[srcset]")?.getAttribute("srcset")||""
       })));
       if(ssrCount){
         // The live PSE catalog uses SSR pagination, not the former client Load More.
         const cards=await collect(),pageSizes=[ssrCount];
         for(let index=2;index<=Math.ceil(expectedTotal/16);index++){
           const next=await page.goto(url.origin+"/san-pham/"+index,{waitUntil:"domcontentloaded",timeout:60000});
           if(next?.status()!==200)throw Error("SSR catalog page "+index+" HTTP "+next?.status());
           const group=await collect();cards.push(...group);pageSizes.push(group.length);
         }
         catalogAudit={mode:"ssr",initial:ssrCount,pageSizes,checkedCount:cards.length,
           uniqueHrefs:new Set(cards.map(x=>x.href)).size,allImgSrcSet:cards.filter(x=>x.srcset).length};
         await page.goto(url.origin+spec.path,{waitUntil:"domcontentloaded",timeout:60000});
       }else{
         const initial=await page.locator("#product-grid article").count();
         const payload=await page.locator("#main-content").getAttribute("data-products");
         const parsed=JSON.parse(payload||"[]");
         let clicks=0;
         while(clicks<4&&await page.locator("#load-more-btn:not(.hidden)").isVisible()){
           await page.locator("#load-more-btn").click();clicks++;
         }
         const cards=await page.locator("#product-grid article").evaluateAll(list=>list.map(card=>({
           href:card.querySelector("a[href]")?.getAttribute("href")||"",
           srcset:card.querySelector("img[srcset]")?.getAttribute("srcset")||""
         })));
         catalogAudit={mode:"client",initial,declared:parsed.length,clicks,checkedCount:cards.length,
           uniqueHrefs:new Set(cards.map(x=>x.href)).size,allImgSrcSet:cards.filter(x=>x.srcset).length};
       }
     }
     const d=await page.evaluate(()=>{
      const main=document.querySelector("#main-content")||document.querySelector("main");
      const imgs=[...(main?.querySelectorAll("img")||[])].filter(x=>!!x.currentSrc||!!x.src);
      const docs=[...(main?.querySelectorAll(".pse-download-card")||[])];
      const cards=main?.querySelectorAll("#product-grid article,article.pse-catalog-card").length||0;
      return{
       header:!!document.querySelector(".pse-header"),
       footer:!!document.querySelector("footer,[role=contentinfo],.pse-footer"),
       h1:[...(main?.querySelectorAll("h1")||[])].map(x=>(x.textContent||"").replace(/\s+/g," ").trim()),
       title:document.title,cards,docs:docs.map(x=>({label:(x.textContent||"").replace(/\s+/g," ").trim(),href:x.href,valid:!!x.href&&/\.pdf(?:$|\?)/i.test(new URL(x.href).pathname)})),
       hasPseCatalog:!!(main?.classList.contains("pse-products-catalog")||main?.querySelector(".pse-product-showcase")),
       images:imgs.length,imagesWithSrcset:(main?.querySelectorAll('img[srcset]').length||0),broken:imgs.filter(i=>i.complete&&i.naturalWidth===0).length,
       bodyOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
       insideScroll:[...(main?.querySelectorAll("*")||[])].filter(el=>{const s=getComputedStyle(el);return /scroll|auto/.test(s.overflowY)&&el.scrollHeight>el.clientHeight+5}).slice(0,5).map(x=>x.tagName)
      };
     });
     // Modern PSE FooterSection may render a CTA <section>, not .pse-footer.
     const good=res?.status()===200&&d.header&&!d.bodyOverflow
       &&(spec.kind==="catalog"?d.hasPseCatalog&&catalogAudit?.initial===spec.minCards&&
         catalogAudit?.checkedCount===45&&catalogAudit?.uniqueHrefs===45&&
         catalogAudit?.allImgSrcSet===45&&d.imagesWithSrcset>=spec.minCards
         :spec.kind==="manual"?d.docs.length===7&&d.docs.every(x=>x.valid)
         :d.h1.length===1&&d.h1[0].includes("Hữu cơ Phú Mỹ")&&d.images>=1);
     const result={width,path:spec.path,http:res?.status(),...d,catalogAudit,pass:good};results.push(result);if(good)passed++;
     console.log("PSE_FERTILIZER_LIVE="+JSON.stringify(result).slice(0,3500));
     if(res?.status()===200&&width!==768){
      const name=spec.kind+"-"+width;
      await page.screenshot({path:"artifacts/pse-product-live/"+name+".png",fullPage:true,animations:"disabled"});
     }
    }catch(e){results.push({width,path:spec.path,error:String(e).slice(0,240),pass:false})}
   }
  }finally{await page.close()}
 }
 console.log("PSE_FERTILIZER_LIVE_SUMMARY="+JSON.stringify({tested:results.length,passed,failed:results.filter(x=>!x.pass),readOnly:true,noBuild:true}));
 if(passed!==specs.length*3)process.exitCode=1;
}finally{await browser.close()}
