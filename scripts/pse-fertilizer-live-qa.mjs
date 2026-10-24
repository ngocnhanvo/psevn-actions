/** PSE newly published native Product & authentic fertilizer guides. Read-only live visual QA. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL_CLIENT="));
if(lines.length!==1)throw Error("Missing PSE frontend origin");
const url=new URL(lines[0].slice(14).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Invalid frontend origin");
const specs=[
 {kind:"catalog",path:"/san-pham/",title:"Sản phẩm",minCards:20},
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
       images:imgs.length,broken:imgs.filter(i=>i.complete&&i.naturalWidth===0).length,
       bodyOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
       insideScroll:[...(main?.querySelectorAll("*")||[])].filter(el=>{const s=getComputedStyle(el);return /scroll|auto/.test(s.overflowY)&&el.scrollHeight>el.clientHeight+5}).slice(0,5).map(x=>x.tagName)
      };
     });
     const good=res?.status()===200&&d.header&&d.footer&&!d.bodyOverflow
       &&(spec.kind==="catalog"?d.hasPseCatalog&&d.cards>=spec.minCards
         :spec.kind==="manual"?d.docs.length===7&&d.docs.every(x=>x.valid)
         :d.h1.length===1&&d.h1[0].includes("Hữu cơ Phú Mỹ")&&d.images>=1);
     const result={width,path:spec.path,http:res?.status(),...d,pass:good};results.push(result);if(good)passed++;
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
