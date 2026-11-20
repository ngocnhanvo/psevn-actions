/** PSE investor disclosure recovery evidence - public Joomla READ ONLY. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Source checkpoint schema changed");
const pending=Object.entries(state.articles)
 .filter(([,r])=>r.status==="quarantined"&&!r.wp_id&&r.source_url?.includes("/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin/"))
 .map(([id,r])=>({id,url:r.source_url,previousReason:r.reason}));
const browser=await chromium.launch({headless:true});
const results=new Array(pending.length);
let cursor=0;
async function worker(){
 const page=await browser.newPage({viewport:{width:1280,height:840}});
 await page.route(/\.(?:jpe?g|png|gif|svg|webp|woff2?|ttf)(?:\?.*)?$/i,r=>r.abort());
 try{
  while(cursor<pending.length){
   const index=cursor++,record=pending[index];let response=null,error="";
   for(let attempt=1;attempt<=2;attempt++){
    try{
     response=await page.goto(record.url,{waitUntil:"domcontentloaded",timeout:22000});
     if(response?.status()!==200)throw Error("HTTP "+response?.status());
     error="";break;
    }catch(e){error=String(e).slice(0,210);response=null}
   }
   const result={...record,http:response?.status()||null,error};
   if(response){
    try{Object.assign(result,await page.evaluate(()=>{
      const root=document.querySelector('[itemprop="articleBody"]');
      const el=root||document.querySelector("main")||document.body;
      const text=String(el?.textContent||"").replace(/\s+/g," ").trim();
      const assets=[...new Set([...el.querySelectorAll("img[src],a[href],iframe[src],object[data],embed[src]")].map(x=>{
        const href=x.getAttribute(x.tagName==="IMG"?"src":x.tagName==="OBJECT"?"data":"href")||x.getAttribute("src");
        try{return new URL(href,location.href).href}catch{return null}
      }).filter(x=>x&&/\.(?:jpe?g|png|gif|webp|pdf|docx?|xlsx?|pptx?)(?:[?#]|$)/i.test(x)))];
      const meta=[...document.querySelectorAll('time[datetime],meta[property="article:published_time"],meta[itemprop="datePublished"],[itemprop="datePublished"],.article-info dd.published,.article-info dd.created')].map(x=>(x.getAttribute("datetime")||x.getAttribute("content")||x.textContent||"").trim()).filter(Boolean);
      return {title:document.title,hasArticleBody:!!root,chars:text.length,bodyExcerpt:text.slice(0,350),assetCount:assets.length,assets:assets.slice(0,15),dates:meta.slice(0,10)};
    }))}catch(e){result.error="parse: "+String(e).slice(0,150)}
   }
   results[index]=result;
   console.log("PSE_DISCLOSURE_RECOVERY_PROBE="+JSON.stringify({id:result.id,http:result.http,hasArticleBody:result.hasArticleBody,chars:result.chars,assetCount:result.assetCount,dates:result.dates,error:result.error}));
  }
 }finally{await page.close()}
}
try{await Promise.all([worker(),worker(),worker()])}finally{
 await mkdir("artifacts/pse-disclosure-recovery",{recursive:true});
 await writeFile("artifacts/pse-disclosure-recovery/source.json",JSON.stringify({schema:"pse-disclosure-recovery-source-v1",source:"www.pse.vn",scope:pending.length,results},null,2)+"\n");
 console.log("PSE_DISCLOSURE_RECOVERY_SUMMARY="+JSON.stringify({scope:pending.length,received:results.filter(x=>x?.http===200).length,parseable:results.filter(x=>x?.hasArticleBody).length,withAssets:results.filter(x=>x?.assetCount>0).length,failed:results.filter(x=>x?.http!==200).map(x=>x?.id),output:"artifacts/pse-disclosure-recovery/source.json",mode:"read-only"}));
 await browser.close();
}
