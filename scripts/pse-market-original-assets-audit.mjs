/** Read-only asset/source audit for the market Joomla articles quarantined by importer. */
import {chromium} from "playwright";
import {readFile} from "node:fs/promises";
const s=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(s.schema!=="pse-legacy-article-migration-v1"||!s.backup_verified)throw Error("Unexpected checkpoint");
const rows=Object.entries(s.articles).filter(([id,v])=>
 v.source_url?.includes("/hoat-dong-kinh-doanh/thong-tin-thi-truong/")&&v.status==="quarantined");
if(rows.length!==8)throw Error("Unexpected quarantine selection: "+rows.length);
const browser=await chromium.launch({headless:true});
try{
 const p=await browser.newPage();await p.route(/\.(?:woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
 const result=[];
 for(const [id,v] of rows){
  const response=await p.goto(v.source_url,{waitUntil:"domcontentloaded",timeout:60000});
  const info=await p.evaluate(()=>{
   const root=document.querySelector('[itemprop="articleBody"]')||document.querySelector(".item-page");
   if(!root)return{hasBody:false};
   const imgs=[...root.querySelectorAll("img[src]")].map(x=>({
    src:x.src,original:x.getAttribute("src"),alt:x.getAttribute("alt")||""}));
   const links=[...root.querySelectorAll("a[href]")].map(x=>({src:x.href,text:x.textContent.trim().slice(0,80)}));
   return{hasBody:true,title:document.title,textLength:root.textContent?.trim().length||0,
     htmlLength:root.innerHTML.length,imageCount:imgs.length,images:imgs.slice(0,25),
     externalLinks:links.filter(x=>!x.src.startsWith(location.origin)).slice(0,12),
     visibleText:root.textContent?.replace(/\s+/g," ").trim().slice(0,250)};
  });
  const assets=[];
  for(const img of info.images||[]){
   try{
    const r=await p.request.get(img.src,{timeout:25000});
    let buf=await r.body();
    const sig=buf.subarray(0,16).toString("hex");
    const validImg=(sig.startsWith("ffd8ff")||sig.startsWith("89504e470d0a1a0a")||sig.startsWith("474946383961")||sig.startsWith("474946383761")||sig.startsWith("52494646"));
    assets.push({url:img.src,http:r.status(),contentType:r.headers()["content-type"]||"",bytes:buf.length,validImage:validImg});
   }catch(e){assets.push({url:img.src,error:String(e).slice(0,130)})}
  }
  result.push({id,reason:v.reason,sourceHttp:response?.status(),info,assets});
  console.log("PSE_MARKET_QUARANTINE_AUDIT="+JSON.stringify(result.at(-1)));
 }
 console.log("PSE_MARKET_QUARANTINE_SUMMARY="+JSON.stringify({
   checked:result.length,
   shortSource:result.filter(x=>x.info?.textLength<65).map(x=>x.id),
   withExternalImages:result.filter(x=>x.info?.images?.some(i=>!i.src.startsWith("https://www.pse.vn/"))).map(x=>x.id),
   failedImages:result.filter(x=>x.assets.some(a=>a.http!==200||!a.validImage)).map(x=>x.id),
   noImage:result.filter(x=>!x.info?.imageCount).map(x=>x.id),readonly:true
 }));
}finally{await browser.close()}
