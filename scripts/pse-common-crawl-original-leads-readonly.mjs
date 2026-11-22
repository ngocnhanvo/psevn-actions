/** Bounded exact URL index discovery of unavailable original source material.
 * Common Crawl index evidence is a recovery lead ONLY, not content proof.
 * Sequential requests, no source/WordPress writes, no build.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||process.env.GITHUB_REF!=="refs/heads/main")
 throw Error("PSE Actions/main required");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Wrong source state");
const article=state.articles?.["341"]?.source_url;
if(!article||!/^https:\/\/www\.pse\.vn\/[^?#]*\/341-[a-z0-9-]+\.html$/.test(article))
 throw Error("Exact original market source identity changed");
const targets=[
 {id:341,type:"article",url:article},
 {id:202,type:"image",url:"http://baobinhphuoc.com.vn/resources/newsimg/Nam%202011/8-2011/14/congty.jpg"},
 {id:225,type:"image",url:"http://images1.tuoitre.vn/tianyon/ImageView.aspx?ThumbnailID=521979"}
];
const result={schema:"pse-common-crawl-exact-original-source-index-leads-v1",
 readOnly:true,noCmsWrites:true,noBuild:true,targets,indexes:[],rows:[],leads:[],stopped:false};
const indexOrigin="https://index.commoncrawl.org";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(u){
 if(new URL(u).origin!==indexOrigin)throw Error("Wrong archive origin");
 return fetch(u,{redirect:"manual",signal:AbortSignal.timeout(20000),
  headers:{"User-Agent":"PSE-Source-Parity-ReadOnly-Audit/1.0 (web migration recovery; sequential bounded index lookup)","Accept":"application/json"}});
}
function sameOriginal(a,b){
 try{
  const x=new URL(a),y=new URL(b);
  return ["http:","https:"].includes(x.protocol)&&x.hostname.toLowerCase()===y.hostname.toLowerCase()&&
   decodeURIComponent(x.pathname)===decodeURIComponent(y.pathname)&&x.search===y.search&&!x.hash&&!x.username&&!x.password;
 }catch{return false}
}
try{
 const c=await get(indexOrigin+"/collinfo.json");
 if(c.status!==200)throw Error("Common Crawl collection index HTTP "+c.status);
 const collections=await c.json();
 if(!Array.isArray(collections))throw Error("Invalid archive collections");
 // Nine carefully chosen exact queries/three source identities, not bulk archive crawl.
 // Each year's earliest collection gives distinct historical samples.
 for(const year of [2014,2016,2020]){
  const candidates=collections.filter(x=>new RegExp("^CC-MAIN-"+year+"-[0-9]{2}$").test(x.id))
    .sort((a,b)=>a.id.localeCompare(b.id));
  if(candidates.length)result.indexes.push(candidates[0].id);
 }
 if(result.indexes.length!==3)throw Error("Historical collection list incomplete");
 for(const target of targets){
  for(const index of result.indexes){
   if(result.stopped)break;
   const row={id:target.id,index,http:null,exactHostPathCaptures:0,otherCaptures:0,error:null};
   result.rows.push(row);
   await sleep(2000);
   try{
    const u=new URL(indexOrigin+"/"+index+"-index");
    u.searchParams.set("url",target.url);
    u.searchParams.set("output","json");
    u.searchParams.set("filter","status:200");
    const response=await get(u.href);row.http=response.status;
    if([429,503].includes(row.http)){result.stopped=true;row.error="RATE_LIMIT_STOP";break}
    if(row.http===404)continue;
    if(row.http!==200){row.error="INDEX_HTTP_"+row.http;if(row.http>=500)result.stopped=true;continue}
    const body=await response.text();
    if(body.length>500000){row.error="INDEX_RESPONSE_OVERSIZED";result.stopped=true;break}
    for(const line of body.split(/\r?\n/).filter(Boolean)){
     let x;try{x=JSON.parse(line)}catch{row.error="INDEX_RECORD_INVALID";continue}
     const filename=String(x.filename||"");
     if(String(x.status)!=="200"||!sameOriginal(x.url,target.url)||
      !/^crawl-data\/CC-MAIN-[0-9]{4}-[0-9]{2}\/[A-Za-z0-9_./-]+\.warc\.gz$/.test(filename)||
      !/^[0-9]+$/.test(String(x.offset))||!/^[0-9]+$/.test(String(x.length))){
       row.otherCaptures++;continue;
     }
     row.exactHostPathCaptures++;
     result.leads.push({id:target.id,index,originalUrl:x.url,exactScheme:x.url===target.url,
      timestamp:x.timestamp,mime:x.mime,digest:x.digest,filename,offset:x.offset,length:x.length,
      decision:"INDEX_LEAD_ONLY_REQUIRES_WARC_BYTE_AND_ORIGINAL_CONTENT_VALIDATION"});
    }
   }catch(e){row.error=String(e?.name||e?.message||"network").slice(0,100);
    if(/Timeout|Abort|TypeError/.test(row.error))result.stopped=true;}
   console.log("PSE_COMMON_CRAWL_INDEX_ROW="+JSON.stringify(row));
  }
  if(result.stopped)break;
 }
}catch(e){result.error=String(e?.message||e).slice(0,200)}
finally{
 result.summary={indices:result.indexes,queries:result.rows.length,exactCaptureLeads:result.leads.length,
 exactSourceIds:[...new Set(result.leads.map(x=>x.id))],stopped:result.stopped,error:result.error||null,
 evidenceOnly:true,originalBytesVerified:0,noCmsWrites:true};
 console.log("PSE_COMMON_CRAWL_SOURCE_LEADS="+JSON.stringify(result.summary));
 for(const x of result.leads.slice(0,20))console.log("PSE_COMMON_CRAWL_WARC_POINTER="+JSON.stringify(x));
 await mkdir("artifacts/pse-common-crawl-original-leads",{recursive:true});
 await writeFile("artifacts/pse-common-crawl-original-leads/report.json",JSON.stringify(result,null,2)+"\n");
}
