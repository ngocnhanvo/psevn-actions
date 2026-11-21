/** Source #379 exact historical HTML date metadata probe, no publication-date guessing. */
import {mkdir,readFile,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repo");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const e=state.articles?.["379"],source=String(e?.source_url||"");
const u=new URL(source);
if(state.schema!=="pse-legacy-article-migration-v1"||u.hostname!=="www.pse.vn"||
 !u.pathname.endsWith("/379-pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco.html")||
 u.protocol!=="https:")throw Error("Original Joomla #379 source identity changed");
const archive="https://web.archive.org",report={schema:"pse-original-379-archived-html-date-evidence-v1",id:379,source,
 readOnly:true,wpWrites:0,noBuild:true,captures:[],status:"NO_ORIGINAL_DAY_EVIDENCE"};
const lookup=new URL(archive+"/cdx/search/cdx");
lookup.searchParams.set("url",u.hostname+u.pathname);lookup.searchParams.set("output","json");
lookup.searchParams.set("fl","timestamp,original,statuscode,mimetype");lookup.searchParams.set("filter","statuscode:200");
lookup.searchParams.set("collapse","timestamp:6");lookup.searchParams.set("limit","18");
const grab=async(url,timeoutMs)=>{const p=new URL(url);if(p.origin!==archive||p.username||p.password)throw Error("Disallowed host");
 return fetch(url,{signal:AbortSignal.timeout(timeoutMs),redirect:"manual"})};
const validDay=v=>{const s=String(v||"").trim(),m=s.match(/^(19\d\d|20\d\d)-(\d\d)-(\d\d)(?:[T ]|$)/);
 if(!m)return null;const d=m[1]+"-"+m[2]+"-"+m[3],date=new Date(d+"T12:00:00Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===d?d:null};
try{
 let data=[];try{
  const resp=await grab(lookup.href,17000);report.indexHttp=resp.status;
  if(resp.status===200){const body=await resp.text();if(body.length<200000){
   const all=JSON.parse(body);if(Array.isArray(all)&&all[0]?.[0]==="timestamp")data=all.slice(1,19);
  }}
 }catch(err){report.indexError=String(err?.name||err?.message||"network").slice(0,100)}
 for(const [ts,original,status,mime] of data){
  if(!/^\d{14}$/.test(String(ts))||String(ts)>"20261121000000"||status!=="200")continue;
  let url;try{url=new URL(original)}catch{continue}
  if(url.hostname!==u.hostname||url.pathname!==u.pathname||!["http:","https:"].includes(url.protocol))continue;
  const row={snapshot:ts,original,mime,http:null,titleVerified:false,
   originalCreatedDays:[],originalPublishedDays:[],reason:null};
  try{
   const resp=await grab(archive+"/web/"+ts+"id_/"+original,20000);
   row.http=resp.status;const kind=String(resp.headers.get("content-type")||"");
   if(resp.status===200&&kind.includes("text/html")){
    const html=(await resp.text()).slice(0,6000000);
    row.titleVerified=/379-pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco/i.test(html)||
     /tham quan phòng truyền thống pvfcco/i.test(html);
    const p=/<(?:meta|time)\b[^>]+>/gi;
    for(const m of html.matchAll(p)){
     const tag=m[0],label=(tag.match(/(?:property|name|itemprop)=["']([^"']+)/i)?.[1]||"").toLowerCase();
     const raw=tag.match(/(?:content|datetime)=["']([^"']+)/i)?.[1]||"";
     const day=validDay(raw);if(!day||!row.titleVerified)continue;
     if(/published_time|datepublished|pubdate|publish_date/.test(label))row.originalPublishedDays.push({label,day});
     else if(/datecreated|created_time|createdate/.test(label))row.originalCreatedDays.push({label,day});
    }
    if(!row.originalCreatedDays.length&&!row.originalPublishedDays.length)row.reason="NO_EXPLICIT_DATE_METADATA";
   }else row.reason="NOT_ORIGINAL_HTML";
  }catch(err){row.reason="ARCHIVE_FETCH_FAILED";row.error=String(err?.name||"network").slice(0,100)}
  report.captures.push(row);console.log("PSE_379_ARCHIVE_DATE_ROW="+JSON.stringify(row));
 }
 const published=[...new Set(report.captures.flatMap(x=>x.originalPublishedDays.map(y=>y.day)))],
  created=[...new Set(report.captures.flatMap(x=>x.originalCreatedDays.map(y=>y.day)))];
 report.sourcePublishedDays=published;report.sourceCreatedDays=created;
 report.status=published.length===1?"EXPLICIT_JOOMLA_ARCHIVE_PUBLISHED_DAY_NEEDS_REVIEW":
   created.length===1?"EXPLICIT_JOOMLA_ARCHIVE_CREATED_DAY_NEEDS_REVIEW":
   "NO_ORIGINAL_DAY_EVIDENCE";
 console.log("PSE_379_ARCHIVE_DATE_SUMMARY="+JSON.stringify({sourceId:379,
  capturedOriginalHTML:report.captures.filter(x=>x.http===200).length,
  actualPublishedDayCandidates:published,actualCreatedDayCandidates:created,
  status:report.status,readOnly:true,noCmsWrites:true,noGuessFromSnapshot:true}));
}finally{
 await mkdir("artifacts/pse-379-archive-dates",{recursive:true});
 await writeFile("artifacts/pse-379-archive-dates/report.json",JSON.stringify(report,null,2)+"\n");
}
