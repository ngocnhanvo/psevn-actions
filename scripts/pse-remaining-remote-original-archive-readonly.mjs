/** 11 still-unrecovered source articles: strictly original source-URL Wayback media, GET ONLY. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
const original=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const ids=[114,121,127,178,186,196,198,202,204,237,1090];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 original.schema!=="pse-legacy-article-migration-v1"||!original.backup_verified||
 ids.some(id=>original.articles?.[id]?.status!=="quarantined"||
 original.articles[id].reason!=="Article contains non-local mandatory media"))
 throw Error("Expected exact 11 original Joomla source identities or quarantine changed");
const chrome=await chromium.launch({headless:true});
const pageCtx=await chrome.newContext({javaScriptEnabled:false});
await pageCtx.route("**/*",r=>r.abort());
const dateCtx=await chrome.newContext({viewport:{width:1366,height:850}});
await dateCtx.route(/\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const net=await request.newContext({timeout:35000});
const dig=b=>createHash("sha256").update(b).digest("hex");
const cap=8*1024*1024;
const report={schema:"pse-11-unrecovered-source-url-archive-media-proof-v1",readOnly:true,
 originalIds:ids,rows:[],noCMSWrites:true,noBuild:true};
const mimeOkay=(url,mime,buf)=>{
 const ext=new URL(url).pathname.split(".").at(-1).toLowerCase();
 if(buf.length<160||buf.length>cap)return false;
 if(["jpg","jpeg"].includes(ext))return mime==="image/jpeg"&&buf.subarray(0,2).toString("hex")==="ffd8"&&buf.subarray(-2).toString("hex")==="ffd9";
 if(ext==="png")return mime==="image/png"&&buf.subarray(0,8).toString("hex")==="89504e470d0a1a0a";
 if(ext==="webp")return mime==="image/webp"&&buf.subarray(0,4).toString("hex")==="52494646"&&buf.subarray(8,12).toString("ascii")==="WEBP";
 if(ext==="gif")return mime==="image/gif"&&["GIF87a","GIF89a"].includes(buf.subarray(0,6).toString("ascii"));
 if(ext==="pdf")return mime==="application/pdf"&&buf.subarray(0,5).toString("ascii")==="%PDF-";
 return false;
};
const get=async url=>{
 const u=new URL(url);
 if(u.protocol!=="https:"||u.hostname!=="web.archive.org")throw Error("Archive origin not trusted");
 return net.get(url,{timeout:22000,maxRedirects:0,failOnStatusCode:false});
};
async function probe(source){
 const u=new URL(source);const output={url:source,archiveIndexHTTP:null,archiveCandidates:[],reason:null};
 if(!["http:","https:"].includes(u.protocol)||u.username||u.password||u.hash||u.search){
  output.reason="UNSUPPORTED_SOURCE_URL";return output
 }
 try{
  const query=new URL("https://web.archive.org/cdx/search/cdx");
  for(const [k,v] of Object.entries({url:source,output:"json",
    fl:"timestamp,original,statuscode,mimetype,digest",filter:"statuscode:200",collapse:"digest",limit:"5"}))
   query.searchParams.set(k,v);
  const r=await get(query.href);output.archiveIndexHTTP=r.status();
  if(r.status()!==200){output.reason="ARCHIVE_INDEX_HTTP_"+r.status();return output}
  const b=await r.text();
  if(b.length>100000){output.reason="INDEX_OVERSIZED";return output}
  let rows;try{rows=JSON.parse(b)}catch{output.reason="INDEX_NOT_JSON";return output}
  if(!Array.isArray(rows)||!Array.isArray(rows[0])||rows[0][0]!=="timestamp"){
   output.reason="INDEX_NO_CAPTURE";return output
  }
  for(const x of rows.slice(1,6)){
   const [when,original,mstatus,mime,indexDigest]=x;
   if(!/^\d{14}$/.test(String(when))||when.slice(0,8)>"20261121"||
     String(mstatus)!=="200"||original!==source)continue;
   const archiveUrl="https://web.archive.org/web/"+when+"id_/"+original;
   const row={captureTime:when,sourceUrl:original,indexMime:mime,indexDigest,
    http:null,mime:null,bytes:0,sha256:null,actualOriginalBytes:false};
   try{
    const content=await get(archiveUrl);
    row.http=content.status();row.mime=String(content.headers()["content-type"]||"").toLowerCase().split(";")[0];
    const length=Number(content.headers()["content-length"]||0);
    if(row.http===200&&row.mime.startsWith("image/")&&length<=cap){
     const bytes=await content.body();
     row.bytes=bytes.length;row.sha256=dig(bytes);
     row.actualOriginalBytes=mimeOkay(original,row.mime,bytes);
    }
   }catch(e){row.networkError=String(e?.code||e?.name||"network").slice(0,80)}
   output.archiveCandidates.push(row);
   if(row.actualOriginalBytes)break;
  }
  output.reason=output.archiveCandidates.some(x=>x.actualOriginalBytes)?
   "EXACT_ORIGINAL_URL_ARCHIVE_CAPTURE_BYTES_VERIFIED":"ORIGINAL_ARCHIVE_BYTES_NOT_VERIFIED";
 }catch(e){output.reason="ARCHIVE_REQUEST_UNAVAILABLE";output.error=String(e?.code||e?.name||"network").slice(0,70)}
 return output;
}
try{
 for(const id of ids){
  const source=original.articles[id].source_url,u=new URL(source);
  if(u.protocol!=="https:"||u.hostname!=="www.pse.vn"||
   !new RegExp("/"+id+"-[^/]+\\.html$","i").test(u.pathname))
   throw Error("Untrusted original Joomla article "+id);
  const row={id,source,title:null,textChars:0,requiredSources:[],
   archived:[],allExactSourceMedia:false,createdDay:null,createdEvidence:null,
   decision:"SOURCE_MEDIA_BLOCKED",error:null};
  report.rows.push(row);
  try{
   const resp=await net.get(source,{timeout:45000,failOnStatusCode:false,maxRedirects:2});
   if(resp.status()!==200)throw Error("Original Joomla source HTTP "+resp.status());
   const html=await resp.text();if(html.length<250||html.length>8_000_000)throw Error("Unsafe original Joomla HTML size");
   const page=await pageCtx.newPage();
   let info;
   try{
    await page.setContent('<base href="'+source+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
    info=await page.evaluate(()=>{
     const el=document.querySelector(".item-page [itemprop=articleBody]")||
      document.querySelector(".item-page")||document.querySelector("article");
     if(!el)return null;
     const norm=s=>String(s||"").replace(/\s+/g," ").trim();
     const links=[];
     for(const e of el.querySelectorAll("img[src],video[src],audio[src],iframe[src],source[src],object[data],embed[src],a[href]")){
      const v=e.getAttribute("src")||e.getAttribute("data")||e.getAttribute("href");
      if(!v)continue;
      let u;try{u=new URL(v,document.baseURI)}catch{continue}
      if(!["http:","https:"].includes(u.protocol))continue;
      if(e.tagName==="A"&&!/\.(?:jpe?g|gif|png|pdf|webp)$/i.test(u.pathname))continue;
      if(["www.pse.vn","pse.vn"].includes(u.hostname))continue;
      links.push(u.href);
     }
     return{title:norm(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent),
      text:norm(el.textContent),urls:[...new Set(links)]};
    });
   }finally{await page.close()}
   if(!info||info.title.length<8||info.text.length<60||info.urls.length<1||info.urls.length>15)
    throw Error("Source article body/media inventory changed");
   row.title=info.title;row.textChars=info.text.length;row.requiredSources=info.urls;
   // No unaudited source domain aliases, never use visually similar pictures.
   for(const url of info.urls)row.archived.push(await probe(url));
   row.allExactSourceMedia=row.archived.every(x=>x.archiveCandidates.some(y=>y.actualOriginalBytes));
   if(row.allExactSourceMedia){
    const datePage=await dateCtx.newPage();let d;
    try{d=await searchDate(datePage,{id,sourceUrl:source,title:info.title,opening:info.text.slice(0,350)})}
    finally{await datePage.close()}
    row.createdDay=d.source==="joomla_com_search_created"?d.day:null;
    row.createdEvidence=d.source;
   }
   row.decision=row.allExactSourceMedia&&row.createdDay?"FULL_SOURCE_WITH_CREATED_DAY_CANDIDATE":
    row.allExactSourceMedia?"MEDIA_READY_ORIGINAL_DATE_UNVERIFIED":"MISSING_MANDATORY_ORIGINAL_ARCHIVE_MEDIA";
  }catch(e){row.error=String(e?.message||e).slice(0,140)}
  console.log("PSE_11_ARCHIVE_SOURCE_ROW="+JSON.stringify({id,source:row.source,title:row.title,
   requiredImages:row.requiredSources.length,verifiedMedia:row.archived.filter(x=>x.archiveCandidates.some(y=>y.actualOriginalBytes)).length,
   evidence:row.archived.map(x=>({sourceUrl:x.url,result:x.reason,
    captures:x.archiveCandidates.filter(y=>y.actualOriginalBytes).map(y=>({captureTime:y.captureTime,sha256:y.sha256,bytes:y.bytes})).slice(0,1)})),
   createdDay:row.createdDay,decision:row.decision,error:row.error}));
 }
 report.summary={sources:ids.length,ready:report.rows.filter(r=>r.decision==="FULL_SOURCE_WITH_CREATED_DAY_CANDIDATE").map(r=>r.id),
  exactSourceArchiveMediaReady:report.rows.filter(r=>r.allExactSourceMedia).map(r=>r.id),
  stillBlocked:report.rows.filter(r=>!r.allExactSourceMedia).map(r=>r.id),readOnly:true,noCMSWrites:true,noBuild:true};
 console.log("PSE_11_ARCHIVE_SOURCE_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-remaining-eleven-archive",{recursive:true});
 await writeFile("artifacts/pse-remaining-eleven-archive/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await pageCtx.close();await dateCtx.close();await chrome.close();
}
