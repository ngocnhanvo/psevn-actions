/** GET-only historical Wayback original Joomla gallery #975 publication-day evidence.
 * A capture timestamp is NEVER a published date. Only original archived
 * HTML's explicit article publish metadata may authorize date restoration.
 */
import {mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repository");
const source="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/975-dai-hoi-cong-doan-nhiem-ky-ii-10-2013.html";
const src=new URL(source),archive="https://web.archive.org";
const report={schema:"pse-975-independent-original-archive-publication-metadata-v1",
 id:975,originalUrl:source,readOnly:true,noCmsWrites:true,createdDayComSearch:"2011-03-06",
 chronologicalTitleEvent:"2013-10",captures:[],indexStatus:null,explicitPublishedDay:null,
 decision:"SOURCE_PUBLISHED_DAY_NOT_PROVEN"};
const day=s=>{const m=String(s||"").match(/^(19\d\d|20\d\d)-(\d\d)-(\d\d)(?:[T ]|$)/);if(!m)return null;
 const d=m[1]+"-"+m[2]+"-"+m[3];return new Date(d+"T12:00:00Z").toISOString().slice(0,10)===d?d:null};
const get=async(path,timeout=16000)=>{const u=new URL(path,archive);
 if(u.origin!==archive||u.username||u.password)throw Error("Untrusted Wayback host");
 return await fetch(u.href,{signal:AbortSignal.timeout(timeout),redirect:"manual"})};
try{
 const url=new URL(archive+"/cdx/search/cdx");
 url.searchParams.set("url","www.pse.vn"+src.pathname);
 url.searchParams.set("output","json");
 url.searchParams.set("filter","statuscode:200");
 url.searchParams.set("fl","timestamp,original,statuscode,mimetype");
 url.searchParams.set("limit","12");
 let rows=[];
 try{
  const response=await get(url.href);
  report.indexStatus=response.status;
  if(response.status===200){
   const text=await response.text();
   if(text.length<100000){const json=JSON.parse(text);
    if(Array.isArray(json)&&Array.isArray(json[0])&&json[0][0]==="timestamp")rows=json.slice(1);}
  }
 }catch(e){report.indexError=String(e?.name||e?.message||"network").slice(0,120)}
 const found=new Set();
 for(const [ts,original,status,mime] of rows){
  if(!/^\d{14}$/.test(String(ts))||String(ts).slice(0,8)>"20261121"||
   String(status)!=="200"||found.has(ts))continue;
  let u;try{u=new URL(String(original))}catch{continue}
  if(u.hostname!=="www.pse.vn"||u.pathname!==src.pathname||!["http:","https:"].includes(u.protocol))continue;
  found.add(ts);
  const item={timestamp:ts,originalUrl:String(original),indexMime:mime,http:null,titleMatched:false,publishDateCandidates:[]};
  try{
   const response=await get(archive+"/web/"+ts+"id_/"+original,18000);
   item.http=response.status;
   const type=String(response.headers.get("content-type")||"").toLowerCase();
   if(response.status===200&&type.includes("text/html")){
    const html=(await response.text()).slice(0,4000000);
    item.titleMatched=html.toLowerCase().includes("975-dai-hoi-cong-doan")||
     html.toLowerCase().includes("đại hội công đoàn nhiệm kỳ ii");
    const patterns=[
     /<meta\b[^>]*(?:property|name|itemprop)=["'](?:article:published_time|datePublished|publish_date|pubdate)["'][^>]*content=["']([^"']+)["']/ig,
     /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["'](?:article:published_time|datePublished|publish_date|pubdate)["']/ig,
     /<time\b[^>]*itemprop=["']datePublished["'][^>]*datetime=["']([^"']+)["']/ig
    ];
    for(let i=0;i<patterns.length;i++){for(const match of html.matchAll(patterns[i])){
     const candidate=day(match[1]);if(candidate&&item.titleMatched)item.publishDateCandidates.push({day:candidate,kind:["meta","meta-reverse","time"][i]});
    }}
   }
  }catch(e){item.error=String(e?.name||e?.message||"network").slice(0,100)}
  report.captures.push(item);
  console.log("PSE_975_ARCHIVE_PUBLISH_SOURCE_ROW="+JSON.stringify(item));
 }
 const dates=[...new Set(report.captures.flatMap(x=>x.publishDateCandidates.map(y=>y.day)))];
 if(dates.length===1){report.explicitPublishedDay=dates[0];report.decision="SOURCE_ARCHIVED_EXPLICIT_PUBLISHED_DAY_CANDIDATE_REVIEW";}
 else if(dates.length>1)report.decision="ARCHIVED_PUBLICATION_DATE_CONFLICT";
 console.log("PSE_975_ARCHIVE_PUBLISHED_DAY_SUMMARY="+JSON.stringify({capturedOriginalPages:report.captures.length,
  originalHTMLPublishDates:dates,decision:report.decision,readOnly:true,neverUseArchiveCaptureAsPublication:true}));
}finally{
 await mkdir("artifacts/pse-975-wayback-date",{recursive:true});
 await writeFile("artifacts/pse-975-wayback-date/report.json",JSON.stringify(report,null,2)+"\n");
}
