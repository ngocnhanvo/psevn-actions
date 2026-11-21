/**
 * Independent, read-only Joomla RSS origin provenance:
 *  - verify gallery #975 dates against other identifiable original gallery IDs
 *  - determine whether historical article #379 is reachable by feed pagination.
 * No WordPress/FTP calls; no inferred publication day; no update from archive timestamps.
 */
import {mkdir,writeFile} from "node:fs/promises";

if (process.env.GITHUB_REPOSITORY !== "ngocnhanvo/psevn-actions") throw new Error("Wrong PSE project");
const base="https://www.pse.vn";
const gallery="/tin-tuc-su-kien/thu-vien/anh";
const news="/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop";
const target379="/379-pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco.html";
const expectedGalleryIds=new Set([1053,990,980,975]);
const requiredHost=new Set(["pse.vn","www.pse.vn"]);
const decode=s=>String(s||"").replace(/^<!\[CDATA\[|\]\]>$/g,"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').trim();
const field=(xml,tag)=>decode(xml.match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+tag+">","i"))?.[1]);
const dateDay=s=>{const d=new Date(s);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):null};
const get=async(path)=>{
  const u=new URL(path,base);
  if(u.origin!==base||u.username||u.password)throw new Error("Untrusted source");
  const response=await fetch(u.href,{signal:AbortSignal.timeout(22000),redirect:"manual",
    headers:{Accept:"application/rss+xml, application/xml, text/xml"}});
  const record={url:u.href,status:response.status,type:response.headers.get("content-type")||""};
  if(response.status!==200||!/xml|rss/i.test(record.type)){return {...record,reason:"HTTP_OR_TYPE",entries:[]}}
  const xml=await response.text();
  if(xml.length<100||xml.length>8000000)return {...record,reason:"SOURCE_SIZE",entries:[]};
  const entries=[];
  for(const item of xml.match(/<item\b[\s\S]*?<\/item>/gi)||[]){
    const raw=field(item,"link"), title=field(item,"title"), published=field(item,"pubDate");
    let u2;try{u2=new URL(raw,base)}catch{continue}
    if(!requiredHost.has(u2.hostname)||!["http:","https:"].includes(u2.protocol))continue;
    entries.push({path:u2.pathname,title:title.slice(0,250),
      rssPubDate:published.slice(0,125),day:dateDay(published)});
  }
  return {...record,entryCount:entries.length,entries};
};
const report={schema:"pse-original-feed-historical-pagination-crosscheck-v1",readOnly:true,
 noCmsWrites:true,noDeploy:true,originalCatalog:[],originalNewsPagination:[],original379:null};
const catalog=await get(gallery+"?format=feed&type=rss");
report.originalCatalog=catalog.entries.map(e=>{
  const id=Number(e.path.match(/\/(\d+)-[^/]+\.html$/)?.[1]||0);
  const titleYears=[...new Set((e.title.match(/(?:19|20)\d{2}/g)||[]))].sort();
  return {...e,sourceId:id,titleYears,yearConflict:titleYears.some(y=>e.day && e.day.slice(0,4)<y)};
});
const matches=report.originalCatalog.filter(e=>expectedGalleryIds.has(e.sourceId));
console.log("PSE_ORIGINAL_GALLERY_FEED_REFERENCE="+JSON.stringify({
  catalogStatus:catalog.status,totalRows:catalog.entryCount,
  knownOriginals:matches.map(r=>({id:r.sourceId,title:r.title,day:r.day,titleYears:r.titleYears,yearConflict:r.yearConflict})),
  allTitleChronologyConflicts:report.originalCatalog.filter(r=>r.yearConflict).map(r=>r.sourceId),
  dateIsEvidenceNotInstruction:true,readOnly:true}));
const variants=[
 news+"?format=feed&type=rss&limitstart=10",
 news+"?format=feed&type=rss&start=10",
 news+"?format=feed&type=rss&limitstart=100",
 news+"?format=feed&type=rss&limitstart=300",
 news+".feed?type=rss&limitstart=300"
];
for(const variant of variants){
  try{
    const result=await get(variant);
    const ids=result.entries.map(e=>Number(e.path.match(/\/(\d+)-[^/]+\.html$/)?.[1]||0));
    const found=result.entries.filter(e=>e.path.endsWith(target379));
    const record={url:result.url,status:result.status,entryCount:result.entries.length,
      firstFiveIds:ids.slice(0,5),lastId:ids.at(-1)||null,
      exact379:found,reason:result.reason||null};
    report.originalNewsPagination.push(record);
    if(found.length)report.original379=found[0];
    console.log("PSE_379_FEED_PAGINATION="+JSON.stringify(record));
  }catch(err){
    const record={url:new URL(variant,base).href,status:null,reason:"SOURCE_UNAVAILABLE",
      error:String(err?.name||"request").slice(0,100)};
    report.originalNewsPagination.push(record);
    console.log("PSE_379_FEED_PAGINATION="+JSON.stringify(record));
  }
}
report.gallery975=report.originalCatalog.find(e=>e.sourceId===975)||null;
report.summary={
 referenceOriginalGalleryCount:matches.length,
 referenceDates:matches.map(e=>({sourceId:e.sourceId,day:e.day,titleYears:e.titleYears,yearConflict:e.yearConflict})),
 gallery975DateChronologyResolved:!!report.gallery975?.day&&!report.gallery975.yearConflict,
 article379ExactFeedIdentityFound:!!report.original379,
 status:"READ_ONLY_REVIEW_REQUIRED"
};
await mkdir("artifacts/pse-feed-pagination-crosscheck",{recursive:true});
await writeFile("artifacts/pse-feed-pagination-crosscheck/report.json",JSON.stringify(report,null,2)+"\n");
console.log("PSE_FEED_HISTORICAL_CROSSCHECK_SUMMARY="+JSON.stringify(report.summary));
