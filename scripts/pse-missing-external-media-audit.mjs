/** Read-only diagnostic for original Joomla articles blocked by required third-party media.
 * Does not edit WordPress, publish content, omit assets, or synthesize dates.
 */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||
   process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Untrusted PSE source state");
const entries=Object.entries(state.articles).filter(([id,x])=>
 x.status==="quarantined"&&x.reason==="Article contains non-local mandatory media"&&
 x.source_url?.startsWith("https://www.pse.vn/"));
if(entries.length!==17)throw Error("Unexpected original external-media group "+entries.length);
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({ignoreHTTPSErrors:false});
const results=[],jobs=[...entries];
const isExternal=url=>{try{const u=new URL(url);return ["https:","http:"].includes(u.protocol)&&
 !["www.pse.vn","pse.vn"].includes(u.hostname)}catch{return false}};
const worker=async()=>{
 while(jobs.length){
  const [id,item]=jobs.shift(),page=await ctx.newPage();
  const row={id:Number(id),source:item.source_url,legacyReason:item.reason,sourceHttp:null,
    title:"",bodyChars:0,publishedMetadata:[],external:[],error:null};
  try{
   const r=await page.goto(item.source_url,{waitUntil:"domcontentloaded",timeout:45000});
   row.sourceHttp=r?.status()||null;
   if(row.sourceHttp===200){
    const dom=await page.evaluate(()=>{
     const root=document.querySelector(".item-page [itemprop=articleBody]")||
       document.querySelector(".item-page")||document.querySelector("article");
     const title=(document.querySelector("h1")?.textContent||document.title||"").trim();
     const bodyChars=(root?.textContent||"").replace(/\s+/g," ").trim().length;
     const published=[...document.querySelectorAll('meta[property="article:published_time"],meta[name="date"],time[datetime]')]
       .map(n=>n.getAttribute("content")||n.getAttribute("datetime")||"").filter(Boolean).slice(0,8);
     const external=[];
     for(const n of root?.querySelectorAll("img[src],iframe[src],video[src],source[src],audio[src],object[data],embed[src],a[href]")||[]){
      const raw=n.getAttribute("src")||n.getAttribute("href")||n.getAttribute("data")||"";
      let u;try{u=new URL(raw,location.href)}catch{continue}
      if(!["https:","http:"].includes(u.protocol)||["pse.vn","www.pse.vn"].includes(u.hostname))continue;
      external.push({tag:n.tagName.toLowerCase(),url:u.href});
     }
     return{title,bodyChars,published,external:[...new Map(external.map(x=>[x.tag+":"+x.url,x])).values()].slice(0,25)};
    });
    row.title=dom.title;row.bodyChars=dom.bodyChars;row.publishedMetadata=dom.published;
    for(const asset of dom.external){
     if(!isExternal(asset.url))continue;
     const media={...asset,http:null,mime:"",bytes:null,finalHost:null,error:null};
     try{
      const head=await ctx.request.head(asset.url,{timeout:12000,maxRedirects:4});
      media.http=head.status();
      media.mime=String(head.headers()["content-type"]||"").slice(0,90);
      media.bytes=Number(head.headers()["content-length"]||0)||null;
      media.finalHost=new URL(head.url()).hostname;
     }catch(e){media.error=String(e).slice(0,140)}
     row.external.push(media);
    }
   }
  }catch(e){row.error=String(e).slice(0,200)}
  finally{await page.close()}
  results.push(row);
  console.log("PSE_NONLOCAL_SOURCE_ROW="+JSON.stringify({
   id:row.id,http:row.sourceHttp,bodyChars:row.bodyChars,
   external:row.external.map(x=>({tag:x.tag,http:x.http,mime:x.mime,host:x.finalHost||new URL(x.url).hostname})),
   dateCandidates:row.publishedMetadata.length,error:row.error
  }).slice(0,2500));
 }
};
try{
 await Promise.all([worker(),worker(),worker()]);
 results.sort((a,b)=>a.id-b.id);
 const summary={total:results.length,source200:results.filter(r=>r.sourceHttp===200).length,
  externalAssets:results.reduce((n,r)=>n+r.external.length,0),
  external200:results.reduce((n,r)=>n+r.external.filter(x=>x.http===200).length,0),
  missingOrUnavailable:results.filter(r=>r.sourceHttp!==200||r.error).map(r=>r.id),
  withDateMetadata:results.filter(r=>r.publishedMetadata.length>0).map(r=>r.id)};
 await mkdir("artifacts/pse-content-parity",{recursive:true});
 await writeFile("artifacts/pse-content-parity/external-media.json",JSON.stringify({schema:"pse-nonlocal-blocker-proof-v1",readOnly:true,summary,results},null,2)+"\n");
 console.log("PSE_NONLOCAL_MEDIA_AUDIT="+JSON.stringify(summary)+"; no_wp_write=true; no_build=true");
}finally{await ctx.close();await browser.close()}