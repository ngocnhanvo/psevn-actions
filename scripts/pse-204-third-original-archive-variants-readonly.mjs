/** Investigate ONE missing original Joomla #204 screenshot, no replacement guess or CMS write. */
import {request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const e=state.articles?.["204"];
const old="http://www.binhphuoc.gov.vn/3cms/upload//Image/a%20da%20cam/a33%281%29.jpg";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 state.schema!=="pse-legacy-article-migration-v1"||
 e?.status!=="quarantined"||
 e?.reason!=="Article contains non-local mandatory media"||
 !e.source_url.includes("/204-"))
 throw Error("Original source 204 quarantine identity unexpectedly changed");
const net=await request.newContext({timeout:35000});
const urls=[
 old,
 old.replace("/upload//Image/","/upload/Image/"),
 old.replace("a33%281%29.jpg","a33(1).jpg"),
 old.replace("/upload//Image/","/upload/Image/").replace("a33%281%29.jpg","a33(1).jpg"),
 old.replace("http://","https://"),
 old.replace("http://","https://").replace("/upload//Image/","/upload/Image/"),
 old.replace("http://www.","http://"),
 old.replace("a33%281%29.jpg","a33%281%29.JPG")
];
const report={schema:"pse-204-one-missing-original-image-exact-url-archive-variants-v1",
 sourceId:204,originalUrl:old,readOnly:true,rows:[],noCMSWrites:true,noBuild:true};
const sum=b=>createHash("sha256").update(b).digest("hex");
try{
 for(const u of urls){
  const source=new URL(u);
  if(!["http:","https:"].includes(source.protocol)||!["www.binhphuoc.gov.vn","binhphuoc.gov.vn"].includes(source.hostname))
   throw Error("Untrusted source host alias");
  const r={query:u,index:null,captures:[],exactSourceUrl:u===old,decision:"NO_CAPTURE"};
  try{
   const idx=new URL("https://web.archive.org/cdx/search/cdx");
   for(const [key,value] of Object.entries({url:u,output:"json",
     fl:"timestamp,original,statuscode,mimetype,digest",filter:"statuscode:200",
     collapse:"digest",limit:"6"}))idx.searchParams.set(key,value);
   const response=await net.get(idx.href,{timeout:20000,maxRedirects:0,failOnStatusCode:false});
   r.index=response.status();
   const body=await response.text();
   if(body.length>60000)throw Error("Archive index too large");
   let pairs=[];try{pairs=JSON.parse(body)}catch{}
   for(const entry of Array.isArray(pairs)?pairs.slice(1,7):[]){
    const [when,orig,status,mime,digest]=entry;
    if(!/^\d{14}$/.test(String(when))||String(when).slice(0,8)>"20261121"||
     !["http:","https:"].includes(new URL(orig).protocol)||
     String(status)!=="200")continue;
    const candidate={timestamp:when,original:orig,indexMime:mime,indexDigest:digest,
     http:null,mime:null,bytes:0,sha256:null,valid:false};
    try{
     const archived=await net.get("https://web.archive.org/web/"+when+"id_/"+orig,{
       timeout:25000,maxRedirects:0,failOnStatusCode:false});
     candidate.http=archived.status();
     candidate.mime=String(archived.headers()["content-type"]||"").toLowerCase().split(";")[0];
     if(candidate.http===200&&candidate.mime==="image/jpeg"){
      const bytes=await archived.body();
      candidate.bytes=bytes.length;candidate.sha256=sum(bytes);
      candidate.valid=bytes.length>=150&&bytes.length<=8000000&&
       bytes.subarray(0,2).toString("hex")==="ffd8"&&bytes.subarray(-2).toString("hex")==="ffd9";
     }
    }catch(err){candidate.network=String(err?.code||err?.name||"network").slice(0,70)}
    r.captures.push(candidate);
    if(candidate.valid)break;
   }
   r.decision=r.captures.some(x=>x.valid&&x.original===old)?
    "EXACT_ORIGINAL_URL_ARCHIVED_JPEG_PROOF":
    r.captures.some(x=>x.valid)?"ALIAS_CAPTURE_ONLY_NOT_PROVEN_EQUIVALENT":
    "NO_VERIFIED_ARCHIVE_JPEG";
  }catch(err){r.error=String(err?.name||err?.message||"network").slice(0,110)}
  report.rows.push(r);
  console.log("PSE_204_ORIGINAL_ARCHIVE_VARIANT="+JSON.stringify({query:r.query,exactSourceUrl:r.exactSourceUrl,
   index:r.index,decision:r.decision,captures:r.captures.map(x=>({
    timestamp:x.timestamp,original:x.original,http:x.http,mime:x.mime,
    bytes:x.bytes,sha256:x.sha256,valid:x.valid}))}));
 }
 const exact=report.rows.flatMap(x=>x.captures).filter(x=>x.valid&&x.original===old);
 const alias=report.rows.flatMap(x=>x.captures).filter(x=>x.valid&&x.original!==old);
 report.summary={exactOriginalCaptured:exact.length>0,
  normalizedPathAliasCandidates:alias.map(x=>({sourceUrl:x.original,sha256:x.sha256,timestamp:x.timestamp})),
  decision:exact.length?"EXACT_ARCHIVED_ORIGINAL_REVIEW_SOURCE_DATE":"SOURCE_204_MISSING_ONE_ORIGINAL_REMAINS_BLOCKED",
  neverSubstituteAliasWithoutProvenance:true,readOnly:true,noCMSWrites:true};
 console.log("PSE_204_THIRD_ORIGINAL_ARCHIVE_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-original-204-third-photo",{recursive:true});
 await writeFile("artifacts/pse-original-204-third-photo/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();
}
