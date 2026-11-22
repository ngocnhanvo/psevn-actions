/** Bounded HTTP(S) photo-byte probe: 11 original Joomla SQL public articles.
 * The source URL is exact original html src; no WordPress writes, no image artifact.
 * Do not treat re-hosted/replaced images as original without exact-source evidence.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const SOURCE="docs/source/pse-original-public-articles-11-2026-11-22.json";
const OUT="artifacts/pse-original-external-photos";
const MAX_BYTES=8*1024*1024, TIMEOUT_MS=17000, CONCURRENCY=4;
const expected=[114,121,127,178,186,196,202,237,341,382,1090];
const allowedHosts=new Set([
 "www.sieuthinongnghiep.com","www.spchcmc.com.vn","dateh.lamdong.gov.vn",
 "images.danviet.vn","library.petrotimes.vn","baobinhphuoc.com.vn",
 "dpm.vn","www.dpm.vn","baodientu.chinhphu.vn"
]);
const source=JSON.parse(await readFile(SOURCE,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong project scope");
if(source.schema!=="pse-original-joomla-selected-public-articles-v1"||
  JSON.stringify(source.source_ids)!==JSON.stringify(expected)||source.entries?.length!==11)throw Error("Original source fixture identity changed");
const records=[],jobs=new Map(),hash=x=>createHash("sha256").update(x).digest("hex");
for(const post of source.entries){
 for(let i=0;i<post.inline_image_src.length;i++){
  const raw=post.inline_image_src[i];
  if(post.source_id===382)continue; // 3 local pse.vn images have separate FTPS proof
  const u=new URL(raw);
  if(!["https:","http:"].includes(u.protocol)||!allowedHosts.has(u.hostname)||u.username||u.password||
     u.port||!/\.(?:jpg|jpeg|png|gif|webp)$/i.test(u.pathname))throw Error("Source image URL outside allowed list "+post.source_id);
  const ref={source_id:post.source_id,media_order:i+1,url_key:hash(raw).slice(0,20),host:u.hostname};
  records.push(ref);
  if(!jobs.has(raw))jobs.set(raw,[]);
  jobs.get(raw).push(ref);
 }
}
if(records.length!==56)throw Error("Unexpected original external photo refs "+records.length);
const originalJobs=[...jobs.entries()].map(([url,refs])=>({url,refs}));
function validateRedirect(from,to){
 const x=new URL(to,from);
 if(!["http:","https:"].includes(x.protocol)||!allowedHosts.has(x.hostname)||
     x.username||x.password||x.port||x.protocol==="http:"&&new URL(from).protocol==="https:")
  return null;
 const a=new URL(from).hostname,b=x.hostname;
 if(a!==b && !([a,b].every(v=>["www.dpm.vn","dpm.vn"].includes(v))))
  return null;
 return x;
}
function magicImage(body){
 if(body.length<400)return false;
 const jpg=body[0]===255&&body[1]===216&&body[2]===255&&body.at(-2)===255&&body.at(-1)===217;
 const png=body[0]===137&&body[1]===80&&body[2]===78&&body[3]===71;
 const gif=body.subarray(0,4).toString()==="GIF8";
 const webp=body.subarray(0,4).toString()==="RIFF"&&body.subarray(8,12).toString()==="WEBP";
 return jpg||png||gif||webp;
}
async function getLimited(raw){
 let u=new URL(raw),http=null,redirects=0;
 for(;redirects<=2;redirects++){
  const ctl=new AbortController(),stop=setTimeout(()=>ctl.abort(),TIMEOUT_MS);
  try{
   const response=await fetch(u,{method:"GET",redirect:"manual",signal:ctl.signal,
     headers:{"User-Agent":"PSE-source-content-migration-verification/1.0","Accept":"image/avif,image/webp,image/jpeg,image/png,image/gif,*/*;q=0.5"}});
   http=response.status;
   if([301,302,307,308].includes(http)){
    const loc=response.headers.get("location"),next=loc?validateRedirect(u,loc):null;
    if(!next)return{status:"UNTRUSTED_REDIRECT",http,redirects};
    u=next;continue;
   }
   if(http!==200)return{status:"SOURCE_HTTP_UNAVAILABLE",http,redirects};
   const length=Number(response.headers.get("content-length")||0);
   if(length>MAX_BYTES)return{status:"SOURCE_OVERSIZED",http,redirects};
   if(!response.body)return{status:"NO_BODY",http,redirects};
   const reader=response.body.getReader(),chunks=[];let total=0;
   while(true){
    const r=await reader.read();
    if(r.done)break;
    total+=r.value.byteLength;
    if(total>MAX_BYTES){await reader.cancel();return{status:"SOURCE_OVERSIZED",http,redirects}}
    chunks.push(Buffer.from(r.value));
   }
   const body=Buffer.concat(chunks);
   const type=String(response.headers.get("content-type")||"");
   if(!magicImage(body)||type.startsWith("text/"))return{status:"NOT_IMAGE_BYTES",http,redirects,bytes:total};
   return{status:"ORIGINAL_URL_IMAGE_BYTES_VERIFIED",http,redirects,
      originScheme:u.protocol.replace(":",""),bytes:total,sha256:hash(body),
      fileMagicValid:true};
  }catch(e){
   return{status:"SOURCE_REQUEST_ERROR",errorType:e.name==="AbortError"?"Timeout":"Network",redirects};
  }finally{clearTimeout(stop)}
 }
 return{status:"TOO_MANY_REDIRECTS",http,redirects};
}
let cursor=0;
const found=[];
async function worker(){
 while(cursor<originalJobs.length){
  const at=cursor++,job=originalJobs[at];
  const proof=await getLimited(job.url);
  for(const ref of job.refs)found.push({...ref,...proof});
 }
}
await Promise.all(Array.from({length:CONCURRENCY},()=>worker()));
const results=found.sort((a,b)=>a.source_id-b.source_id||a.media_order-b.media_order);
const statusCounts={};
for(const x of results)statusCounts[x.status]=(statusCounts[x.status]||0)+1;
const perPost={};
for(const id of expected.filter(x=>x!==382)){
 const rows=results.filter(x=>x.source_id===id);
 perPost[id]={original_image_occurrences:rows.length,verified_original_source_bytes:rows.filter(x=>x.status==="ORIGINAL_URL_IMAGE_BYTES_VERIFIED").length,
  blocked:rows.some(x=>x.status!=="ORIGINAL_URL_IMAGE_BYTES_VERIFIED")};
}
const report={schema:"pse-original-external-photo-exact-url-check-v1",sourceRecords:11,
 sourceExternalOccurrences:56,uniqueUrls:originalJobs.length,
 statuses:statusCounts,perPost,results,
 noWordPressWrites:true,noFTPWrites:true,noImageBodiesPublished:true,
 sourceUrlsFromOwnerJoomlaDB:true};
await mkdir(OUT,{recursive:true});
await writeFile(OUT+"/report.json",JSON.stringify(report,null,2)+"\n");
console.log("PSE_EXTERNAL_IMAGE_SOURCE_CHECK="+JSON.stringify({
 sourceExternalOccurrences:report.sourceExternalOccurrences,uniqueUrls:report.uniqueUrls,
 statuses:report.statuses,perPost:report.perPost,
 originalMediaNotUploaded:true,originalArticlePostsNotPublished:true
}));
