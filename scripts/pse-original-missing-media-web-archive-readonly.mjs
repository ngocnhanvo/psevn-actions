/** Strict GET-only historical source-image archive search. No WordPress calls.
 * Internet Archive candidate is a documented historic capture of the exact
 * source URL, not assumed byte-equivalent to a currently missing original.
 */
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong repository");
const targets=[
 {id:382,url:"https://www.pse.vn/images/web/%C3%81o_2.JPG"},
 {id:382,url:"https://www.pse.vn/images/web/Ba_Lan.JPG"},
 {id:382,url:"https://www.pse.vn/images/web/M%E1%BB%8F_mu%E1%BB%91i_Wieliczka_d%C6%B0%E1%BB%9Bi_m%E1%BA%B7t_%C4%91%E1%BA%A5t_135m_-_Ba_lan.JPG"},
 {id:1640,url:"https://www.baobariavungtau.com.vn/dataimages/202505/original/images2017799_Ca_kh_c.jpg"},
 {id:1640,url:"https://www.baobariavungtau.com.vn/dataimages/202505/original/images2017800_16_2025_acondao.jpg"}
];
const allowed=new Set(["www.pse.vn","www.baobariavungtau.com.vn"]);
const archive="https://web.archive.org";
const maxBytes=12*1024*1024;
const last="20261121";
const report={schema:"pse-archived-original-broken-media-discovery-v1",
 readOnly:true,noCmsWrites:true,noBuild:true,originalSourceRecords:targets.length,rows:[]};
const sha=b=>createHash("sha256").update(b).digest("hex");
async function get(url,timeout=16000){
 const u=new URL(url);
 if(u.protocol!=="https:"||u.hostname!=="web.archive.org"||u.username||u.password)
  throw Error("Untrusted archive query");
 const res=await fetch(url,{signal:AbortSignal.timeout(timeout),headers:{"Accept":"application/json,image/jpeg,image/png;q=0.9,*/*;q=0.5"},redirect:"manual"});
 return res;
}
async function inspect(target){
 const url=new URL(target.url);
 if(url.protocol!=="https:"||!allowed.has(url.hostname)||url.search||url.hash)
  throw Error("Untrusted original URL");
 const row={id:target.id,original:url.href,candidates:[],archiveHttp:null,reason:null};
 try{
  const query=new URL(archive+"/cdx/search/cdx");
  query.searchParams.set("url",url.href);
  query.searchParams.set("output","json");
  query.searchParams.set("fl","timestamp,original,statuscode,mimetype,digest");
  query.searchParams.set("filter","statuscode:200");
  query.searchParams.set("collapse","digest");
  query.searchParams.set("limit","5");
  const res=await get(query.href);
  row.archiveHttp=res.status;
  if(res.status!==200){row.reason="ARCHIVE_INDEX_HTTP_"+res.status;return row}
  const body=await res.text();
  if(body.length>100000){row.reason="ARCHIVE_INDEX_OVERSIZED";return row}
  let entries;
  try{entries=JSON.parse(body)}catch{row.reason="ARCHIVE_INDEX_NOT_JSON";return row}
  if(!Array.isArray(entries)||!Array.isArray(entries[0])||entries[0][0]!=="timestamp"){
   row.reason="ARCHIVE_INDEX_UNEXPECTED";return row
  }
  for(const fields of entries.slice(1,6)){
   const [timestamp,original,status,mime,digest]=fields;
   if(!/^\d{14}$/.test(String(timestamp))||String(timestamp).slice(0,8)>last||
     String(status)!=="200"||typeof original!=="string")continue;
   const source=new URL(original);
   if(!allowed.has(source.hostname)||source.pathname!==url.pathname||
     !["http:","https:"].includes(source.protocol))continue;
   const capture=archive+"/web/"+timestamp+"id_/"+original;
   const item={timestamp,archiveUrl:capture,sourceUrl:original,indexMime:mime,indexDigest:digest,
      http:null,mime:null,bytes:null,sha256:null,jpegDecodeCandidate:false,error:null};
   try{
    const r=await get(capture,20000);
    item.http=r.status;
    item.mime=String(r.headers.get("content-type")||"").toLowerCase().split(";")[0];
    const len=Number(r.headers.get("content-length")||0);
    if(r.status===200&&item.mime.startsWith("image/")&&!(len>maxBytes)){
     const buf=Buffer.from(await r.arrayBuffer());
     item.bytes=buf.length;
     item.sha256=sha(buf);
     item.jpegDecodeCandidate=buf.length>=256&&buf.length<=maxBytes&&
      (buf.subarray(0,2).toString("hex")==="ffd8"||
      buf.subarray(0,8).toString("hex")==="89504e470d0a1a0a");
    }
   }catch(e){item.error=String(e?.name||e?.message||"network").slice(0,100)}
   row.candidates.push(item);
  }
  row.reason=row.candidates.some(x=>x.jpegDecodeCandidate)
   ?"EXACT_ORIGINAL_URL_ARCHIVE_CAPTURE_BYTES_CANDIDATE":"NO_VERIFIED_ARCHIVE_CAPTURE";
 }catch(e){row.reason="ARCHIVE_LOOKUP_UNAVAILABLE";row.networkError=String(e?.name||e?.code||"network").slice(0,120)}
 return row;
}
try{
 // Only two concurrent reads; every request is bounded and read-only.
 let cursor=0;
 await Promise.all(Array.from({length:2},async()=>{
  for(;;){const idx=cursor++;if(idx>=targets.length)break;
   const row=await inspect(targets[idx]);report.rows.push(row);
   console.log("PSE_ORIGINAL_MISSING_ARCHIVE_ROW="+JSON.stringify({id:row.id,
    path:new URL(row.original).pathname,indexHTTP:row.archiveHttp,
    reason:row.reason,candidates:row.candidates.map(c=>({timestamp:c.timestamp,
     indexMime:c.indexMime,http:c.http,mime:c.mime,bytes:c.bytes,sha256:c.sha256,sourceUrl:c.sourceUrl}))}));
  }
 }));
 report.rows.sort((a,b)=>a.id-b.id||a.original.localeCompare(b.original));
 report.summary={expectedOriginals:targets.length,
  exactOriginalUrlArchiveImageCandidates:report.rows.filter(r=>r.candidates.some(x=>x.jpegDecodeCandidate)).length,
  inaccessibleIndex:report.rows.filter(r=>r.archiveHttp!==200).length,
  noCmsWrites:true,readOnly:true};
 console.log("PSE_ORIGINAL_MISSING_ARCHIVE_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-original-archive",{recursive:true});
 await writeFile("artifacts/pse-original-archive/report.json",JSON.stringify(report,null,2)+"\n");
}
