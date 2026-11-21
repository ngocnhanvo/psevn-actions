/** Strict GET-only exact archival recovery for the ONE broken Joomla #1434
 * inline DPM thumbnail. An inferred full-size original is only an alternate lead.
 * Never substitute a visually similar image and never write WordPress.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong source repository");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 state.articles?.["1434"]?.status!=="quarantined")
 throw Error("Joomla source identity changed; stop");
const path="/_thumbs/w270-h372-q80-b0-f0-v2019.12.30.1-eorig-wt0/static/upload/users/dpm.vn/2021/SP%20Phan%20bon%20luu%20hanh/02.png";
const original="https://dpm.vn"+path;
const variants=["http://dpm.vn","https://dpm.vn","http://www.dpm.vn","https://www.dpm.vn"].map(h=>h+path);
const archive="https://web.archive.org";
const report={schema:"pse-1434-single-exact-original-dpm-thumbnail-archive-v1",
 sourceId:1434,sourceImageIndex:4,original,readOnly:true,noCmsWrites:true,noBuild:true,
 originalSourceHttp404ObservedRun:44908317772,indexes:[],captures:[],
 verifiedExactOriginalBytes:0,alternativePublisherOriginal:null,
 verdict:"NO_PROVEN_EXACT_THUMBNAIL_ARCHIVED"};
const dig=b=>createHash("sha256").update(b).digest("hex");
const png=b=>b.length>=160&&b.length<8500000&&
 b.subarray(0,8).toString("hex")==="89504e470d0a1a0a"&&
 b.includes(Buffer.from("IEND"));
async function get(url,timeoutMs=16000){
 const u=new URL(url);
 if(u.origin!==archive||u.username||u.password)throw Error("Only Wayback archive accepted");
 return fetch(url,{signal:AbortSignal.timeout(timeoutMs),redirect:"manual"});
}
const seen=new Map();
try{
 for(const variant of variants){
  const url=new URL(archive+"/cdx/search/cdx");
  for(const [key,value] of Object.entries({url:variant,output:"json",
    fl:"timestamp,original,statuscode,mimetype",filter:"statuscode:200",collapse:"digest",limit:"12"}))
   url.searchParams.set(key,value);
  const entry={variant,http:null,records:0,reason:null};
  report.indexes.push(entry);
  try{
   const res=await get(url.href);
   entry.http=res.status;
   if(res.status!==200){entry.reason="CDX_HTTP_"+res.status;continue}
   const body=await res.text();
   if(body.length>120000){entry.reason="OVERSIZED_INDEX";continue}
   let rows;try{rows=JSON.parse(body)}catch{entry.reason="INDEX_NOT_JSON";continue}
   if(!Array.isArray(rows)||rows[0]?.[0]!=="timestamp"){
    entry.reason="NO_CAPTURE";continue
   }
   for(const [stamp,href,status,mime] of rows.slice(1)){
    if(!/^\d{14}$/.test(String(stamp))||String(stamp).slice(0,8)>"20261121"||
     String(status)!=="200")continue;
    let u;try{u=new URL(href)}catch{continue}
    if(!["dpm.vn","www.dpm.vn"].includes(u.hostname)||u.pathname!==path||
     !["http:","https:"].includes(u.protocol)||u.search||u.hash)continue;
    if(!seen.has(stamp+"|"+href)){seen.set(stamp+"|"+href,{stamp,href,mime});entry.records++}
   }
  }catch(e){entry.reason="CDX_NETWORK_FAILURE";entry.error=String(e?.name||"network")}
  console.log("PSE_1434_THUMB_ARCHIVE_INDEX="+JSON.stringify(entry));
 }
 const candidates=[...seen.values()].sort((a,b)=>a.stamp.localeCompare(b.stamp)).slice(0,15);
 for(const candidate of candidates){
  const item={timestamp:candidate.stamp,originalUrl:candidate.href,http:null,
   bytes:0,sha256:null,validPng:false,reason:null};
  report.captures.push(item);
  try{
   const response=await get(archive+"/web/"+candidate.stamp+"id_/"+candidate.href,20000);
   item.http=response.status;
   if(response.status!==200){item.reason="CAPTURE_HTTP_"+response.status;continue}
   const len=Number(response.headers.get("content-length")||0);
   if(len>8500000){item.reason="CAPTURE_TOO_LARGE";continue}
   const bytes=Buffer.from(await response.arrayBuffer());
   item.bytes=bytes.length;
   item.validPng=png(bytes);
   item.reason=item.validPng?"EXACT_ORIGINAL_URL_ARCHIVE_PNG_VERIFIED":"NOT_VALID_EXACT_PNG";
   if(item.validPng){
    item.sha256=dig(bytes);report.verifiedExactOriginalBytes++;
    await mkdir("artifacts/pse-1434-thumb-exact",{recursive:true});
    await writeFile("artifacts/pse-1434-thumb-exact/02.png",bytes);
    break;
   }
  }catch(e){item.reason="ARCHIVE_DOWNLOAD_FAILURE";item.error=String(e?.name||"network")}
  console.log("PSE_1434_THUMB_ARCHIVE_CAPTURE="+JSON.stringify(item));
 }
 // The image server's transform path contains a presumed original filename.
 // Checking its reachability does not prove pixel/byte identity to the missing thumb.
 const lead="https://dpm.vn/static/upload/users/dpm.vn/2021/SP%20Phan%20bon%20luu%20hanh/02.png";
 const alt={url:lead,reachable:false,validPng:false,sha256:null,decision:"ALTERNATE_ONLY_NOT_SOURCE_PROVEN"};
 try{
  const response=await fetch(lead,{signal:AbortSignal.timeout(15000),redirect:"manual"});
  alt.http=response.status;
  if(response.status===200){
   const len=Number(response.headers.get("content-length")||0);
   if(len<=8500000){
    const bytes=Buffer.from(await response.arrayBuffer());
    alt.validPng=png(bytes);alt.reachable=alt.validPng;
    if(alt.validPng)alt.sha256=dig(bytes);
   }
  }
 }catch(e){alt.error=String(e?.name||"network")}
 report.alternativePublisherOriginal=alt;
 report.verdict=report.verifiedExactOriginalBytes?
  "EXACT_ORIGINAL_THUMB_ARCHIVED_SOURCE_BYTES_VERIFIED":
  "NO_PROVEN_EXACT_THUMBNAIL_ARCHIVED";
 console.log("PSE_1434_THUMB_ARCHIVE_SUMMARY="+JSON.stringify({
  sources:variants.length,indexedMatches:seen.size,checkedCaptures:report.captures.length,
  exactOriginalBytes:report.verifiedExactOriginalBytes,
  originalAlternativeReachable:alt.reachable,
  verdict:report.verdict,readOnly:true,noCmsWrites:true,noBuild:true}));
}finally{
 await mkdir("artifacts/pse-1434-thumb-exact",{recursive:true});
 await writeFile("artifacts/pse-1434-thumb-exact/report.json",JSON.stringify(report,null,2)+"\n");
}
