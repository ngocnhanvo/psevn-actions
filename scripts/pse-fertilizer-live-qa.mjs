/** PSE newly published native Product & authentic fertilizer guides. Read-only live visual QA. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL_CLIENT="));
if(lines.length!==1)throw Error("Missing PSE frontend origin");
const url=new URL(lines[0].slice(14).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Invalid frontend origin");
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
     if(spec.kind==="catalog"&&res?.status()===200)await page.waitForFunction(()=>document.querySelectorAll("#product-grid article").length>0,{timeout:15000}).catch(()=>{});
     let catalogAudit=null;
     if(spec.kind==="catalog"&&res?.status()===200){
       const initial=await page.locator("#product-grid article").count();
       const payload=await page.locator("#main-content").getAttribute("data-products");
       const parsed=JSON.parse(payload||"[]");
       const declared=Array.isArray(parsed)?parsed.length:0;
       let clicks=0;
       while(clicks<4&&await page.locator("#load-more-btn:not(.hidden)").isVisible()){
         await page.locator("#load-more-btn").click();
         clicks++;
       }
       await page.waitForFunction(count=>document.querySelectorAll("#product-grid article").length===count,declared,{timeout:14000}).catch(()=>{});
       catalogAudit={initial,declared,clicks,expanded:await page.locator("#product-grid article").count(),
         firstProductImageSource:await page.locator("#product-grid article img").first().getAttribute("srcset")};
     }
     const d=await page.evaluate(()=>{
      const main=document.querySelector("#main-content")||document.querySelector("main");
      const imgs=[...(main?.querySelectorAll("img")||[])].filter(x=>!!x.currentSrc||!!x.src);
      const docs=[...(main?.querySelectorAll(".pse-download-card")||[])];
      const cards=main?.querySelectorAll("#product-grid article").length||0;
      return{
       header:!!document.querySelector(".pse-header"),
       footer:!!document.querySelector(".pse-footer"),
       h1:[...(main?.querySelectorAll("h1")||[])].map(x=>(x.textContent||"").replace(/\s+/g," ").trim()),
       title:document.title,cards,docs:docs.map(x=>({label:(x.textContent||"").replace(/\s+/g," ").trim(),href:x.href,valid:!!x.href&&/\.pdf(?:$|\?)/i.test(new URL(x.href).pathname)})),
       hasPseCatalog:!!main?.classList.contains("pse-products-catalog"),
       images:imgs.length,imagesWithSrcset:(main?.querySelectorAll('img[srcset]').length||0),broken:imgs.filter(i=>i.complete&&i.naturalWidth===0).length,
       bodyOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
       insideScroll:[...(main?.querySelectorAll("*")||[])].filter(el=>{const s=getComputedStyle(el);return /scroll|auto/.test(s.overflowY)&&el.scrollHeight>el.clientHeight+5}).slice(0,5).map(x=>x.tagName)
      };
     });
     const good=res?.status()===200&&d.header&&d.footer&&!d.bodyOverflow
       &&(spec.kind==="catalog"?d.hasPseCatalog&&catalogAudit?.initial===spec.minCards&&catalogAudit?.declared===44&&catalogAudit?.expanded===44&&catalogAudit?.clicks>=2&&d.imagesWithSrcset>=44
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
