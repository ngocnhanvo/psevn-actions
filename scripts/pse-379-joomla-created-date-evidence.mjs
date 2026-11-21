/** Source-created date proof for quarantined original Joomla Article #379. GET only. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const e=state.articles?.["379"];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 !e?.source_url?.includes("/379-pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco.html"))
 throw Error("Original article #379 provenance changed");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
await page.route(/\.(?:jpe?g|png|webp|gif|woff2?|svg)(?:[?#]|$)/i,r=>r.abort());
const report={schema:"pse-joomla-379-original-date-evidence-v1",readOnly:true,sourceUrl:e.source_url,
 http:null,headline:null,candidates:[],httpLastModified:null,sourceDateVerified:false,noCmsWrites:true};
try{
 const resp=await page.goto(e.source_url,{waitUntil:"domcontentloaded",timeout:65000});
 report.http=resp?.status()||null;
 report.httpLastModified=resp?.headers()["last-modified"]||null;
 if(report.http!==200)throw Error("Original Joomla #379 source unavailable HTTP "+report.http);
 const data=await page.evaluate(()=>{
  const normalize=x=>String(x||"").replace(/\s+/g," ").trim().slice(0,200);
  const candidates=[];
  const selectors=[
    'meta[property="article:published_time"]','meta[property="article:modified_time"]',
    'meta[name="date"]','meta[name="pubdate"]','meta[itemprop="datePublished"]',
    'meta[itemprop="dateCreated"]','[itemprop="datePublished"]','[itemprop="dateCreated"]',
    'time[datetime]','.createdate','.published','.datePublished','.create','.article-info dd'
  ];
  for(const selector of selectors){
   for(const el of document.querySelectorAll(selector)){
    const raw=normalize(el.getAttribute("datetime")||el.getAttribute("content")||el.textContent);
    if(raw)candidates.push({selector,value:raw,verifiedCreatedField:/dateCreated|createdate|\bcreate\b/.test(selector)});
   }
  }
  for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
   try{
    const json=JSON.parse(script.textContent||"null");
    const walk=(v,depth=0)=>{
      if(depth>5||!v||typeof v!=="object")return;
      if(Array.isArray(v)){for(const item of v)walk(item,depth+1);return}
      for(const [key,value] of Object.entries(v)){
       if(["dateCreated","datePublished","dateModified"].includes(key)&&typeof value==="string")
         candidates.push({selector:"jsonld."+key,value:normalize(value),verifiedCreatedField:key==="dateCreated"});
       else if(value&&typeof value==="object")walk(value,depth+1);
      }
    };walk(json);
   }catch{}
  }
  return{headline:normalize(document.querySelector("h1")?.textContent||document.title),candidates};
 });
 report.headline=data.headline;report.candidates=data.candidates;
 // A Joomla created date is not established by only a modified timestamp,
 // neighboring article date, HTTP Last-Modified or a WordPress draft date.
 report.sourceDateVerified=data.candidates.some(x=>x.verifiedCreatedField&&/^\d{4}-\d{2}-\d{2}/.test(x.value));
 console.log("PSE_379_DATE_SOURCE_EVIDENCE="+JSON.stringify(report));
 await mkdir("artifacts/pse-original-379-date",{recursive:true});
 await writeFile("artifacts/pse-original-379-date/report.json",JSON.stringify(report,null,2)+"\n");
}finally{await browser.close()}
