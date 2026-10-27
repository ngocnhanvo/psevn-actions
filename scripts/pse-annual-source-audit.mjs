/** Read-only audit of unresolved PSE Joomla annual-report sources and public archive.
 * No WordPress credentials, writes, Astro build or new content are authorized here.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Unexpected PSE state");
const refs=["998","1000","1092"];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900}});
const report=[];
try{
 for(const id of refs){
  const original=state.articles[id]?.source_url||"";
  const u=new URL(original);
  if(u.protocol!=="https:"||u.hostname!=="www.pse.vn"||
     !u.pathname.startsWith("/quan-he-nha-dau-tu/bao-cao-thuong-nien/"+id+"-"))
   throw Error("Unverified annual original URL "+id);
  let http=0,detail={};
  try{
   const resp=await page.goto(original,{waitUntil:"domcontentloaded",timeout:55000});
   http=resp?.status()||0;
   detail=await page.evaluate(()=>{
    const root=document.querySelector('[itemprop="articleBody"]');
    if(!root)return {hasArticleBody:false,title:document.title?.slice(0,120)};
    const items=[...root.querySelectorAll("img[src],a[href]")].map(el=>{
     const kind=el.tagName==="IMG"?"image":"link",attr=kind==="image"?"src":"href";
     try{const u=new URL(el.getAttribute(attr),location.href);
       return {kind,ext:(u.pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]||"none").toLowerCase(),host:u.hostname};
     }catch{return {kind,ext:"invalid",host:""}}
    });
    const countBy=(name)=>Object.entries(items.reduce((a,x)=>(a[x[name]]=(a[x[name]]||0)+1,a),{}))
      .sort((a,b)=>b[1]-a[1]).slice(0,12);
    const text=(root.textContent||"").replace(/\s+/g," ").trim();
    return {hasArticleBody:true,textChars:text.length,textPreview:text.slice(0,230),
     totalMediaOrAnchors:items.length,images:items.filter(x=>x.kind==="image").length,
     byExtension:countBy("ext"),byHost:countBy("host"),
     pdfLinks:items.filter(x=>x.ext==="pdf").length,
     htmlChars:root.innerHTML.length,
     firstLinkLabels:[...root.querySelectorAll("a[href]")].slice(0,5).map(x=>(x.textContent||"").trim().slice(0,90))};
   });
  }catch(e){detail={error:String(e).slice(0,180)};}
  report.push({id,http,status:state.articles[id]?.status,reason:state.articles[id]?.reason,...detail});
  console.log("PSE_ANNUAL_READONLY_SOURCE="+JSON.stringify(report.at(-1)));
 }
 const dest="https://pse.webnvn.com/tin-tuc-su-kien/bao-cao-thuong-nien";
 const response=await page.goto(dest,{waitUntil:"domcontentloaded",timeout:55000});
 const archive=await page.evaluate(()=>({title:document.title,h1:[...document.querySelectorAll("h1")].map(x=>x.textContent.trim().slice(0,100)),
  bodyText:(document.body?.innerText||"").slice(0,4000),brokenImages:[...document.images].filter(x=>x.complete&&x.naturalWidth===0).length}));
 report.push({archive:true,http:response?.status(),url:page.url(),
  title:archive.title,h1:archive.h1,visibleYearMatches:[...new Set((archive.bodyText.match(/20(?:0[8-9]|1[0-9]|2[0-6])/g)||[]))],
  brokenImages:archive.brokenImages});
 console.log("PSE_ANNUAL_PUBLIC_ARCHIVE="+JSON.stringify(report.at(-1)));
 await mkdir("artifacts/pse-annual-source-audit",{recursive:true});
 await writeFile("artifacts/pse-annual-source-audit/report.json",JSON.stringify(report,null,2)+"\n");
}finally{await browser.close()}
