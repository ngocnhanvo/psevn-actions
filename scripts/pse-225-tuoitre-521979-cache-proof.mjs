/**
 * Recover exact historical Tuoi Tre ImageView ThumbnailID=521979 via legacy
 * static redirect cache candidate Tianyon/Cache/Image/979/521979.jpg.
 *
 * READ ONLY. Route rule observed for separate ThumbnailID=639445 in 2013:
 * ImageView.aspx?ThumbnailID=639445 -> Tianyon/Cache/Image/445/639445.jpg.
 * Deriving 979/521979.jpg creates a CANDIDATE, not proof until exact
 * original-host JPEG from Wayback or publisher is recovered and validated.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main")
 throw Error("Unexpected repository or branch");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||
 state.articles?.["225"]?.wp_id!==79574||
 !state.articles?.["225"]?.source_url?.includes("/225-"))
 throw Error("Joomla original #225 / WP Post #79574 mapping drift");
const cms="https://admin-pse.webnvn.com",archive="https://web.archive.org";
const raw="http://images1.tuoitre.vn/tianyon/ImageView.aspx?ThumbnailID=521979";
const path="/Tianyon/Cache/Image/979/521979.jpg";
const sourceHost="images1.tuoitre.vn";
const variants=[
 "http://images1.tuoitre.vn"+path,
 "https://images1.tuoitre.vn"+path,
 "http://images.tuoitre.vn"+path,
 "https://images.tuoitre.vn"+path,
];
const report={schema:"pse-225-tuoitre-521979-legacy-image-cache-archive-candidate-v1",
 readOnly:true,noCmsWrites:true,noBuild:true,sourceId:225,wpPostId:79574,
 originalImageView:raw,legacyCacheCandidate:path,
 derivedFromIndependent2013ObservedRedirect:
  "ThumbnailID=639445 -> Tianyon/Cache/Image/445/639445.jpg",
 originalImageBinaryVerified:false,direct:[],archiveQueries:[],imageCandidates:[],summary:null};
const MAX=12*1024*1024;
const valid=b=>b.length>=1024&&b.length<=MAX&&b.subarray(0,2).toString("hex")==="ffd8"&&
 b.subarray(-2).toString("hex")==="ffd9";
const hash=b=>createHash("sha256").update(b).digest("hex");
const get=async(url,timeout=18000,limit=MAX)=>{
 const parsed=new URL(url);
 if(!["http:","https:"].includes(parsed.protocol)||
 !["images1.tuoitre.vn","images.tuoitre.vn","web.archive.org",new URL(cms).hostname].includes(parsed.hostname)||
 parsed.username||parsed.password)throw Error("Disallowed origin");
 const r=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(timeout),
 headers:{Accept:"image/jpeg,application/json;q=0.8,*/*;q=0.3"}});
 const length=Number(r.headers.get("content-length")||0);
 if(length>limit)throw Error("Untrusted remote file too large");
 return r;
};
const publicPost=await get(cms+"/wp-json/wp/v2/posts/79574?_fields=id,slug,status,content,title");
if(publicPost.status!==200)throw Error("Target WordPress #79574 unreachable");
const p=await publicPost.json();
if(p.id!==79574||p.status!=="publish"||
 !String(p.content?.rendered||"").includes("ThumbnailID=521979"))
 throw Error("Original inline TuoiTre ImageView reference drift");
const directEndpoints=variants.filter(x=>x.startsWith("https://"));
for(const v of directEndpoints){
 const row={url:v,status:null,contentType:null,location:null,bytes:null,sha256:null,
 exactJpeg:false,error:null};
 try{
  const r=await get(v,18000);
  row.status=r.status;row.contentType=r.headers.get("content-type")||null;
  row.location=r.headers.get("location")||null;
  if(r.status===200&&String(row.contentType).toLowerCase().startsWith("image/")){
   const b=Buffer.from(await r.arrayBuffer());
   row.bytes=b.length;row.exactJpeg=valid(b);if(row.exactJpeg)row.sha256=hash(b);
  }
 }catch(e){row.error=String(e?.name||e?.message||"network").slice(0,110)}
 report.direct.push(row);
 console.log("PSE_225_CACHE_DIRECT="+JSON.stringify(row).slice(0,1800));
}
let cursor=0;
await Promise.all(Array.from({length:2},async()=>{for(;;){
 const idx=cursor++;if(idx>=variants.length)return;
 const source=variants[idx],query=new URL(archive+"/cdx/search/cdx");
 for(const [k,v] of Object.entries({url:source,output:"json",
  fl:"timestamp,original,statuscode,mimetype,digest",
  filter:"statuscode:200",collapse:"digest",limit:"8"}))query.searchParams.set(k,v);
 const row={source,indexStatus:null,archiveCaptures:[],error:null};report.archiveQueries.push(row);
 try{
  const res=await get(query.href,22000,160000);
  row.indexStatus=res.status;
  if(res.status!==200)continue;
  const text=await res.text();if(text.length>160000)throw Error("Archive CDX size out of bounds");
  const data=JSON.parse(text);
  if(!Array.isArray(data)||data[0]?.[0]!=="timestamp")continue;
  for(const [timestamp,original,http,mime,digest] of data.slice(1)){
   if(!/^\d{14}$/.test(String(timestamp))||timestamp.slice(0,8)>"20261121"||
    String(http)!=="200")continue;
   const url=new URL(original);
   if(url.pathname.toLowerCase()!==path.toLowerCase()||
    !["images1.tuoitre.vn","images.tuoitre.vn"].includes(url.hostname))continue;
   const capture=archive+"/web/"+timestamp+"id_/"+original;
   const item={timestamp,original,mime,digest,capture,status:null,bytes:null,sha256:null,
    jpegValid:false,error:null};row.archiveCaptures.push(item);
   try{
    const r=await get(capture,22000);
    item.status=r.status;
    if(r.status===200&&/image\/jpe?g/i.test(r.headers.get("content-type")||"")){
     const b=Buffer.from(await r.arrayBuffer());
     item.bytes=b.length;item.jpegValid=valid(b);if(item.jpegValid)item.sha256=hash(b);
    }
   }catch(e){item.error=String(e?.name||e?.message||"archive").slice(0,100)}
   if(item.jpegValid)report.imageCandidates.push({sourceUrl:original,sha256:item.sha256,
    bytes:item.bytes,archive:capture,verifiedExactOriginalSourcePath: url.hostname===sourceHost});
  }
 }catch(e){row.error=String(e?.name||e?.message||"archive").slice(0,100)}
 console.log("PSE_225_CACHE_WAYBACK="+JSON.stringify(row).slice(0,6000));
}}));
report.archiveQueries.sort((a,b)=>a.source.localeCompare(b.source));
report.originalImageBinaryVerified=report.imageCandidates.some(x=>x.verifiedExactOriginalSourcePath)||
 report.direct.some(x=>x.exactJpeg&&new URL(x.url).hostname===sourceHost);
report.summary={originalPhotoId:521979,directJpeg:report.direct.filter(x=>x.exactJpeg).length,
 waybackExactCacheJpeg:report.imageCandidates.length,
 originalPublisherHostJpeg:report.originalImageBinaryVerified,
 decision:report.originalImageBinaryVerified?
  "EXACT_PUBLISHER_LEGACY_CACHE_IMAGE_AVAILABLE_REQUIRES_VISUAL_SOURCE_ID_CONFIRMATION":
  "LEGACY_CACHE_PATH_NO_VERIFIED_PUBLISHER_BINARY",
 readOnly:true,noCmsWrites:true,noBuild:true};
console.log("PSE_225_IMAGEVIEW_STATIC_CACHE_SUMMARY="+JSON.stringify(report.summary));
await mkdir("artifacts/pse-225-tuoitre-static-cache",{recursive:true});
await writeFile("artifacts/pse-225-tuoitre-static-cache/report.json",JSON.stringify(report,null,2)+"\n");
