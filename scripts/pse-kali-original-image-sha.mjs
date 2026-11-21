/** Original Joomla Kali image bytes from exact Wayback path vs WordPress native Product Media.
 * READ ONLY; 4 historical source images and 4 current native products.
 */
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Unexpected repo");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const r=env.filter(x=>x.startsWith("WC_URL="));if(r.length!==1)throw Error("WordPress origin missing");
const u=new URL(r[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
 throw Error("Wrong WordPress CMS origin");
const wp=u.origin,archive="https://web.archive.org";
const paths=[
 {label:"Kali 00059 shared 1425/1426",file:"3__00059_-_Kali_Phu_My.png"},
 {label:"Kali MOP miếng 1426",file:"Kali-Phú-Mỹ-MOP_miểng-50-mat-truoc.png"},
 {label:"Kali MOP bột trắng 1426",file:"Kali-Phú-Mỹ-Bột_trắng-50-mat-truoc.png"},
 {label:"Kali miểng cải tiến 1678",file:"4_KALI-MIENG_Phu_My_2019_cai_tien.png"}
];
const dir="/images/23_mẫu_sản_phẩm_mới/";
const source={};
const allowedHost=new Set(["www.pse.vn","pse.vn"]);
const sha=b=>createHash("sha256").update(b).digest("hex");
const validPNG=b=>b.length>=180&&b.length<=10000000&&
 b.subarray(0,8).toString("hex")==="89504e470d0a1a0a";
async function fetchBound(url,limit=21000){
 const parsed=new URL(url);
 if(!["https:","http:"].includes(parsed.protocol))throw Error("Untrusted protocol");
 return fetch(url,{signal:AbortSignal.timeout(limit),redirect:"manual",headers:{Accept:"image/png,application/json,*/*;q=0.5"}});
}
const report={schema:"pse-four-kali-exact-original-image-byte-proof-v1",readOnly:true,noCmsWrites:true,noBuild:true,
 archiveImages:[],nativeMedia:[],matches:[],summary:null};
for(const item of paths){
 const path=new URL("https://www.pse.vn"+dir+item.file).pathname;
 const row={source:item.label,path,archiveIndexes:[],captures:[],sourceSha256:null};
 report.archiveImages.push(row);
 const variants=["http://www.pse.vn","https://www.pse.vn","http://pse.vn","https://pse.vn"].map(x=>x+path);
 const checks=await Promise.all(variants.map(async exact=>{
  const q=new URL(archive+"/cdx/search/cdx");
  for(const [k,v] of Object.entries({url:exact,output:"json",fl:"timestamp,original,statuscode,mimetype",
   filter:"statuscode:200",limit:"4"}))q.searchParams.set(k,v);
  const record={url:exact,indexHttp:null,found:[],reason:null};
  try{
   const resp=await fetchBound(q.href,19000);record.indexHttp=resp.status;
   if(resp.status!==200){record.reason="INDEX_HTTP_"+resp.status;return record}
   const text=await resp.text();if(text.length>80000){record.reason="INDEX_SIZE";return record}
   let entries;try{entries=JSON.parse(text)}catch{record.reason="INDEX_JSON";return record}
   for(const val of Array.isArray(entries)?entries.slice(1):[]){
    const [ts,orig,code,mime]=val;
    if(!/^\d{14}$/.test(String(ts))||String(ts).slice(0,8)>"20261121"||
     String(code)!=="200"||!/image|png|octet/i.test(String(mime||"")))continue;
    let uu;try{uu=new URL(orig)}catch{continue}
    if(!allowedHost.has(uu.hostname)||uu.pathname!==path||
     !["http:","https:"].includes(uu.protocol)||uu.search||uu.hash)continue;
    record.found.push({timestamp:ts,original:uu.href,mime});
   }
  }catch(e){record.reason="INDEX_UNAVAILABLE";record.error=String(e?.name||"network").slice(0,65)}
  return record;
 }));
 row.archiveIndexes=checks.map(x=>({variant:x.url,http:x.indexHttp,found:x.found.length,reason:x.reason}));
 const all=[...new Map(checks.flatMap(x=>x.found).map(x=>[x.timestamp+"|"+x.original,x])).values()].slice(0,5);
 for(const cap of all){
  const val={timestamp:cap.timestamp,original:cap.original,archiveHttp:null,bytes:0,
    sourceSha:null,verifiedExactPNG:false,error:null};
  row.captures.push(val);
  try{
   const target=archive+"/web/"+cap.timestamp+"id_/"+cap.original;
   const resp=await fetchBound(target,24000);val.archiveHttp=resp.status;
   if(resp.status===200){
    const len=Number(resp.headers.get("content-length")||0);
    if(len>10000000){val.error="TOO_LARGE";continue}
    const bytes=Buffer.from(await resp.arrayBuffer());
    val.verifiedExactPNG=validPNG(bytes);val.bytes=bytes.length;
    if(val.verifiedExactPNG){val.sourceSha=sha(bytes);row.sourceSha256=val.sourceSha}
   }
  }catch(e){val.error=String(e?.name||"network").slice(0,70)}
 }
 console.log("PSE_KALI_SOURCE_IMAGE_ARCHIVE="+JSON.stringify({label:item.label,path,
  indexCounts:row.archiveIndexes,validCaptures:row.captures.filter(c=>c.verifiedExactPNG).length,
  sourceHashes:row.captures.map(c=>c.sourceSha).filter(Boolean),errors:row.captures.filter(c=>c.error)}).slice(0,4900));
}
for(const id of [82837,80954,80952,80938]){
 const item={id,productTitle:null,wpImage:null,http:null,bytes:0,sha256:null};
 report.nativeMedia.push(item);
 try{
  const product=await fetchBound(wp+"/wp-json/wp/v2/product/"+id+"?_fields=id,slug,status,title,featured_media",23000);
  if(product.status!==200)throw Error("WP_PRODUCT_HTTP_"+product.status);
  const p=await product.json();
  if(p.id!==id||p.status!=="publish"||!p.featured_media)throw Error("WP_PRODUCT_IDENTITY");
  item.productTitle=p.title?.rendered||"";
  const media=await fetchBound(wp+"/wp-json/wp/v2/media/"+p.featured_media+"?_fields=id,source_url",23000);
  if(media.status!==200)throw Error("WP_MEDIA_HTTP_"+media.status);
  const m=await media.json(),url=new URL(m.source_url,wp);
  if(url.origin!==wp||!url.pathname.startsWith("/wp-content/uploads/"))throw Error("Media location outside WordPress");
  item.wpImage=url.pathname;
  const binary=await fetchBound(url.href,27000);item.http=binary.status;
  if(binary.status!==200)throw Error("WP_IMAGE_HTTP_"+binary.status);
  const len=Number(binary.headers.get("content-length")||0);
  if(len>10000000)throw Error("WP_MEDIA_TOO_LARGE");
  const bytes=Buffer.from(await binary.arrayBuffer());
  if(!validPNG(bytes))throw Error("WP_MEDIA_INVALID_PNG");
  item.bytes=bytes.length;item.sha256=sha(bytes);
 }catch(e){item.error=String(e?.message||e).slice(0,110)}
 console.log("PSE_KALI_NATIVE_MEDIA_SHA="+JSON.stringify(item).slice(0,1400));
}
for(const src of report.archiveImages){
 for(const media of report.nativeMedia){
  const same=src.captures.some(c=>c.verifiedExactPNG&&c.sourceSha===media.sha256);
  if(same)report.matches.push({source:src.source,originalPath:src.path,wpId:media.id,
    sourceByteEqualsNativeMedia:true,sha256:media.sha256});
 }
}
report.summary={originalImageFiles:report.archiveImages.length,
 archiveSourceImagesVerified:report.archiveImages.filter(x=>x.captures.some(c=>c.verifiedExactPNG)).length,
 nativeProductMediaShaVerified:report.nativeMedia.filter(x=>x.sha256).length,
 exactCrossOriginShaMatches:report.matches.length,
 result:"READ_ONLY_PROVENANCE_NOT_AUTOMATIC_REDIRECT",
 noCmsWrites:true,noBuild:true};
console.log("PSE_KALI_IMAGE_SHA_IDENTITY_SUMMARY="+JSON.stringify(report.summary));
console.log("PSE_KALI_IMAGE_SHA_MATCHES="+JSON.stringify(report.matches));
await mkdir("artifacts/pse-kali-image-sha",{recursive:true});
await writeFile("artifacts/pse-kali-image-sha/report.json",JSON.stringify(report,null,2)+"\n");
