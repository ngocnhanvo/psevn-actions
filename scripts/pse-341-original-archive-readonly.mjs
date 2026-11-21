/** Exact Joomla #341 historical HTML/body/date recovery evidence; GET ONLY, never CMS writes.
 * A Wayback capture timestamp is NOT a Joomla-created/published date.
 */
import {chromium, request} from "playwright";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";

const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const expected="https://www.pse.vn/hoat-dong-kinh-doanh/thong-tin-thi-truong/341-du-nuoc-tuoi-cho-633000-ha-lua-xuan-2013.html";
const original=state.articles?.["341"];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 !original||original.source_url!==expected||original.status!=="quarantined"||
 original.reason!=="Source content incomplete or oversized")
 throw Error("Original source identity/quarantine drift: fail closed");

const src=new URL(expected);
const path=src.pathname, archive="https://web.archive.org";
const sources=["http://www.pse.vn","https://www.pse.vn","http://pse.vn","https://pse.vn"].map(h=>h+path);
const report={schema:"pse-341-exact-original-archive-html-v1",sourceId:341,sourceUrl:expected,
 readOnly:true,noCmsWrites:true,noBuild:true,
 priorLiveEvidence:"Exact Joomla current articleBody empty; unrelated injected links (Actions 44907222569)",
 captureTimestampNeverMeansPublishedDay:true,indexes:[],captures:[],
 decisions:[],status:"ORIGINAL_BODY_NOT_YET_PROVEN"};
const net=await request.newContext({timeout:19000,ignoreHTTPSErrors:false});
const chrome=await chromium.launch({headless:true});
const ctx=await chrome.newContext({javaScriptEnabled:false});
await ctx.route("**/*",r=>r.abort());
const sha=s=>createHash("sha256").update(s).digest("hex");
const norm=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();
const validDate=v=>{
 const m=String(v||"").match(/(?:^|[^\d])(19\d{2}|20\d{2})-(\d{2})-(\d{2})(?:[T ]|$|[^\d])/);
 if(!m)return null;
 const date=m[1]+"-"+m[2]+"-"+m[3];
 const parsed=new Date(date+"T12:00:00Z");
 return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:null;
};
async function get(url,timeout=18000){
 const u=new URL(url);
 if(u.origin!==archive||u.username||u.password)throw Error("Outside approved archive host");
 return net.get(url,{timeout,maxRedirects:0,failOnStatusCode:false});
}
try{
 const seen=new Map();
 for(const url of sources){
  const cd=new URL(archive+"/cdx/search/cdx");
  for(const [key,val] of Object.entries({url,output:"json",fl:"timestamp,original,statuscode,mimetype",
   filter:"statuscode:200",collapse:"timestamp:4",limit:"14"}))cd.searchParams.set(key,val);
  const index={sourceVariant:url,http:null,eligible:0,reason:null};
  report.indexes.push(index);
  try{
   const r=await get(cd.href);
   index.http=r.status();
   if(r.status()!==200){index.reason="CDX_HTTP_"+r.status();continue}
   const body=await r.text();
   if(body.length>150000){index.reason="INDEX_TOO_LARGE";continue}
   let rows;try{rows=JSON.parse(body)}catch{index.reason="INDEX_NOT_JSON";continue}
   if(!Array.isArray(rows)||rows[0]?.[0]!=="timestamp"){
    index.reason="NO_INDEX_CAPTURE";continue
   }
   for(const [ts,orig,status,mime] of rows.slice(1)){
    if(!/^\d{14}$/.test(String(ts))||String(ts).slice(0,8)>"20261121"||
     String(status)!=="200"||seen.has(ts+"|"+orig))continue;
    let o;try{o=new URL(orig)}catch{continue}
    if(!["www.pse.vn","pse.vn"].includes(o.hostname)||o.pathname!==path||
     !["http:","https:"].includes(o.protocol)||o.search||o.hash)continue;
    seen.set(ts+"|"+orig,{timestamp:ts,originalUrl:orig,indexMime:mime});
    index.eligible++;
   }
  }catch(e){index.reason="CDX_NETWORK_UNAVAILABLE";index.error=String(e?.code||e?.name||"network").slice(0,60)}
  console.log("PSE_341_ARCHIVE_INDEX="+JSON.stringify(index));
 }
 const candidate=[...seen.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)).slice(0,18);
 for(const found of candidate){
  const row={timestamp:found.timestamp,originalUrl:found.originalUrl,indexMime:found.indexMime,
   http:null,bodyChars:0,bodySha256:null,sourceTitleMatch:false,sourceCreatedDay:[],
   sourcePublishedDay:[],externalMedia:0,decision:"NO_PROVEN_ORIGINAL_BODY"};
  report.captures.push(row);
  try{
   const url=archive+"/web/"+found.timestamp+"id_/"+found.originalUrl;
   const r=await get(url,21000);
   row.http=r.status();
   if(r.status()!==200){row.decision="CAPTURE_HTTP_"+r.status();continue}
   const type=String(r.headers()["content-type"]||"").toLowerCase();
   if(!type.includes("text/html")){row.decision="NOT_HTML";continue}
   const html=await r.text();
   if(html.length<300||html.length>5500000){row.decision="INVALID_HTML_LENGTH";continue}
   const p=await ctx.newPage();
   let data;
   try{
    await p.setContent('<base href="'+found.originalUrl+'">'+
      html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded",timeout:18000});
    data=await p.evaluate(()=>{
     const norm=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();
     const root=document.querySelector('.item-page [itemprop="articleBody"]')||
      document.querySelector(".item-page")||document.querySelector("article");
     const title=norm(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||
      document.title.replace(/\s+-\s+PSE\.VN\s*$/i,""));
     const body=norm(root?.textContent);
     const dates=[...document.querySelectorAll("meta[property],meta[name],meta[itemprop],time[datetime],dd.created,dd.published")]
      .map(e=>({label:((e.getAttribute("property")||e.getAttribute("name")||
       e.getAttribute("itemprop")||e.className||"")+"").toLowerCase(),
       value:norm(e.getAttribute("content")||e.getAttribute("datetime")||e.textContent)}))
      .filter(e=>/date|publish|creat|pubdate/i.test(e.label)).slice(0,30);
     const media=[...root?.querySelectorAll("img[src],iframe[src],embed[src],object[data]")||[]]
      .map(e=>e.getAttribute("src")||e.getAttribute("data")).filter(Boolean);
     const external=media.filter(v=>{
      try{return !["www.pse.vn","pse.vn"].includes(new URL(v,document.baseURI).hostname)}
      catch{return true}
     });
     return{title,body,dates,mediaCount:media.length,externalMediaCount:external.length,
      htmlLength:root?.innerHTML.length||0,
      contaminated:/Подробнее на сайте|(?:https?:\/\/)?(?:ducauto|sedoauto|domstroiplus)\.ru/i.test(body)};
    });
   }finally{await p.close()}
   row.sourceTitleMatch=norm(data.title).toLowerCase()==="đủ nước tưới cho 633.000 ha lúa xuân 2013";
   row.bodyChars=data.body.length;
   row.bodySha256=data.body?sha(data.body):null;
   row.bodyHtmlChars=data.htmlLength;
   row.mediaCount=data.mediaCount;
   row.externalMedia=data.externalMediaCount;
   row.contaminated=data.contaminated;
   row.sourceCreatedDay=[...new Set(data.dates.filter(d=>/created|datecreated|creat/i.test(d.label))
    .map(d=>validDate(d.value)).filter(Boolean))];
   row.sourcePublishedDay=[...new Set(data.dates.filter(d=>/published|datepublished|pubdate/i.test(d.label))
    .map(d=>validDate(d.value)).filter(Boolean))];
   row.decision=row.sourceTitleMatch&&row.bodyChars>=180&&!row.contaminated?
    (row.mediaCount===0?"HISTORICAL_ORIGINAL_BODY_CANDIDATE_NEEDS_DATE_REVIEW":
     "HISTORICAL_BODY_CANDIDATE_MEDIA_BYTES_NOT_PROVEN"):
    "ARCHIVE_BODY_OR_IDENTITY_UNVERIFIED";
  }catch(e){row.decision="CAPTURE_FETCH_OR_PARSE_FAILED";row.error=String(e?.code||e?.name||"network").slice(0,70)}
  console.log("PSE_341_ARCHIVE_CAPTURE="+JSON.stringify(row));
 }
 const clean=report.captures.filter(r=>r.sourceTitleMatch&&r.bodyChars>=180&&!r.contaminated);
 report.status=clean.length?"HISTORICAL_SOURCE_CANDIDATE_REVIEW":"ORIGINAL_BODY_NOT_YET_PROVEN";
 report.decisions=clean.map(r=>({timestamp:r.timestamp,bodySha256:r.bodySha256,
  createdDays:r.sourceCreatedDay,publishedDays:r.sourcePublishedDay,
  mediaCount:r.mediaCount,decision:r.decision}));
 console.log("PSE_341_ARCHIVE_SUMMARY="+JSON.stringify({sourceId:341,indexQueries:report.indexes.length,
  eligibleCaptures:seen.size,checkedCaptures:report.captures.length,
  historicalOriginalBodyCandidates:clean.length,status:report.status,readOnly:true,noCmsWrites:true,noBuild:true}));
}finally{
 await mkdir("artifacts/pse-341-source-archive",{recursive:true});
 await writeFile("artifacts/pse-341-source-archive/report.json",JSON.stringify(report,null,2)+"\n");
 await ctx.close();await chrome.close();await net.dispose();
}
