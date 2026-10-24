/** Live QA after native PHP WordPress build for migrated business Pages and news archive. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const x=String(process.env.ENV_FILE||"").split(/\r?\n/).filter(v=>v.trim().startsWith("WC_URL_CLIENT="));if(x.length!==1)throw Error("Missing frontend URL");
const u=new URL(x[0].trim().slice(14).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password)throw Error("Invalid frontend URL");
const cases=[
 {path:"/hoi-dap/",kind:"page",min:10000},
 {path:"/duong-day-nong/",kind:"page",min:80},
 {path:"/tin-tuc-su-kien/?cat=thong-tin-co-dong",kind:"posts",minCards:1,label:"Thông tin cổ đông"},
 {path:"/tin-tuc-su-kien/?cat=thong-tin-thi-truong",kind:"posts",minCards:1,label:"Tin mùa vụ thị trường"},
 {path:"/tin-tuc-su-kien/?cat=video",kind:"posts",minCards:0,label:"Video"},
 {path:"/lien-he/",kind:"contact"}
];
await mkdir("artifacts/pse-new-pages-qa",{recursive:true});
const browser=await chromium.launch({headless:true});const errors=[];let passed=0;
try{
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  try{
   for(const spec of cases){
    try{
     const response=await page.goto(u.origin+spec.path,{waitUntil:"domcontentloaded",timeout:60000});
     const result=await page.evaluate(()=>{
      const main=document.querySelector("#main-content");
      const imgs=[...(main?.querySelectorAll("img")||[])];
      const content=main?.querySelector(".article-content")||main;
      const cards=main?.querySelectorAll("#posts-grid .grid > div").length||0;
      const h1=[...(main?.querySelectorAll("h1")||[])].map(x=>(x.textContent||"").trim());
      const dropdown=document.querySelector("#category-dropdown-container");
      return {title:h1,main:!!main,header:!!document.querySelector(".pse-header"),footer:!!document.querySelector(".pse-footer"),
       text:(content?.textContent||"").replace(/\s+/g," ").trim().slice(0,150),textLength:(content?.textContent||"").replace(/\s+/g," ").trim().length,cards,dropdown:!!dropdown,
       overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
       internalScroll:[...(main?.querySelectorAll("*")||[])].filter(el=>{const s=getComputedStyle(el);return /scroll|auto/.test(s.overflowY)&&el.scrollHeight>el.clientHeight+4}).slice(0,5).map(x=>x.tagName),
       oldHostLinks:main?[...main.querySelectorAll("a[href]")].filter(x=>{try{return new URL(x.href).hostname==="www.pse.vn"}catch{return false}}).length:0,
       imgs:imgs.length,imgOk:imgs.filter(i=>i.complete&&i.naturalWidth>0).length};
     });
     const ok=response?.status()===200&&result.main&&result.header&&result.footer&&!result.overflow&&
       (spec.kind==="page"?result.textLength>=spec.min&&result.title.length===1:spec.kind==="posts"?result.dropdown&&result.cards>=spec.minCards&&result.title.length===1&&result.title[0]===spec.label:result.textLength>40);
     console.log("PSE_NEW_SUBPAGE_QA="+JSON.stringify({width,path:spec.path,http:response?.status(),...result,pass:ok}));
     if(!ok)errors.push({width,path:spec.path});else passed++;
     if(response?.status()===200&&[390,1440].includes(width))await page.screenshot({path:"artifacts/pse-new-pages-qa/"+encodeURIComponent(spec.path).replace(/%/g,"_")+"-"+width+".png",fullPage:true});
    }catch(e){errors.push({width,path:spec.path,error:String(e).slice(0,200)})}
   }
  }finally{await page.close()}
 }
 console.log("PSE_NEW_SUBPAGE_QA_SUMMARY="+JSON.stringify({checked:cases.length*3,passed,failures:errors,readOnly:true,noBuild:true}));
 if(errors.length)process.exitCode=1;
}finally{await browser.close()}
