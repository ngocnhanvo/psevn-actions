/** Continue the PSE native published Post same-project image HEAD audit from an actual
prior Actions report. Never repeat already successful URLs, never write CMS, and
never equate HEAD with content bytes or Joomla parity. Limit one run to 420 new URLs. */
import {mkdir,writeFile,readFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main")throw Error("Wrong Actions main");
const wp="https://admin-pse.webnvn.com",front="https://pse.webnvn.com";
const urlBase=wp+"/wp-json/wp/v2/posts?status=publish&per_page=100&_fields=id,slug,status,title,content,featured_media";
const report={schema:"pse-native-post-image-head-followup-v1",readOnly:true,
 noCmsWrites:true,noBuild:true,noFtp:true,note:"Checks same-project image HEAD only; does not prove original Joomla source equality or browser pixel decoding.",
 totalPosts:0,inlineImgTags:0,inlineSrcRefs:0,srcsetRefs:0,uniqueImageUrls:0,
 featuredIdsReferenced:0,byKind:{},byHead:{},issues:[],external:[],checks:[],
 originalJoomlaSourceUntouched:true,summary:null};
const getPage=async n=>{
 const r=await fetch(urlBase+"&page="+n,{redirect:"manual",signal:AbortSignal.timeout(45000),
  headers:{Accept:"application/json"}});
 if(r.status!==200)throw Error("WP public Post page "+n+" HTTP "+r.status);
 const pages=Number(r.headers.get("x-wp-totalpages")||0);
 const total=Number(r.headers.get("x-wp-total")||0);
 if(!(total>=730&&total<=950&&pages>=7&&pages<=12))throw Error("Unexpected native Post registry "+total+" pages "+pages);
 const list=await r.json();
 if(!Array.isArray(list)||list.length>100)throw Error("Bad WP Posts page");
 return{pages,total,list};
};
const p0=await getPage(1);const all=Array(p0.pages);all[0]=p0.list;
let next=2;
await Promise.all(Array.from({length:3},async()=>{for(;;){
 const n=next++;if(n>p0.pages)return;
 const res=await getPage(n);
 if(res.pages!==p0.pages||res.total!==p0.total)throw Error("CMS registry changed during read");
 all[n-1]=res.list;
}}));
const posts=all.flat();
if(posts.length!==p0.total||new Set(posts.map(x=>x.id)).size!==posts.length||
 posts.length!==758)throw Error("Public WP Post count changed; audit baseline must be reviewed");
report.totalPosts=posts.length;
const items=new Map(),featuredIds=new Set();
const entityDecode=x=>String(x||"").replace(/&amp;/gi,"&").replace(/&#0?38;/gi,"&")
 .replace(/&quot;/gi,'"').replace(/&#0?39;/gi,"'");
function attr(tag,key){
 const pat=new RegExp("(?:^|\\s)"+key+"\\s*=\\s*([\"'])(.*?)\\1","i");
 return tag.match(pat)?.[2]||null;
}
function add(raw,post,source){
 const text=entityDecode(raw).trim();
 if(!text||text.startsWith("data:")||text.startsWith("javascript:"))return;
 // Absolute media URLs and root-relative paths are resolved to their real
 // public consumer: Astro owns /api/files and /api/images; CMS owns public WP uploads.
 let u;try{
  const hostBase=/^\/api\/(?:files|images)(?:\/|\?)/i.test(text)?front+"/":wp+"/";
  u=new URL(text,hostBase);
 }catch{return}
 if(!["http:","https:"].includes(u.protocol)||u.username||u.password)return;
 const kind=u.origin===wp&&u.pathname.startsWith("/wp-content/uploads/")?"CMS_UPLOAD":
  u.origin===front&&u.pathname.startsWith("/api/files/wp-content/uploads/")?"ASTRO_FILES_PROXY":
  u.origin===front&&u.pathname.startsWith("/api/images")?"ASTRO_IMAGE_OPTIMIZER":
  u.origin===front&&u.pathname.startsWith("/wp-content/uploads/")?"FRONTEND_UPLOAD":
  ["pse.vn","www.pse.vn"].includes(u.hostname)&&u.pathname.startsWith("/images/")?"OLD_JOOMLA_IMAGES":
  [wp,front].includes(u.origin)?"OTHER_PSE_PATH":"EXTERNAL";
 const key=u.href,entry=items.get(key)||{url:key,kind,postIds:[],kindsOfRef:[]};
 if(!entry.postIds.includes(post.id))entry.postIds.push(post.id);
 if(!entry.kindsOfRef.includes(source))entry.kindsOfRef.push(source);
 items.set(key,entry);
 if(source==="src")report.inlineSrcRefs++;else report.srcsetRefs++;
}
for(const p of posts){
 if(p.status!=="publish")throw Error("WordPress published inventory includes another status");
 if(Number.isInteger(p.featured_media)&&p.featured_media>0)featuredIds.add(p.featured_media);
 const html=String(p.content?.rendered||"");
 for(const img of html.match(/<img\b[^>]*>/gi)||[]){
  report.inlineImgTags++;
  const s=attr(img,"src");
  if(s)add(s,p,"src");
  const srcset=attr(img,"srcset");
  if(srcset)for(const variant of srcset.split(",")){
   const link=variant.trim().split(/\s+/)[0];
   if(link)add(link,p,"srcset");
  }
 }
 for(const tag of html.match(/<source\b[^>]*>/gi)||[]){
  const srcset=attr(tag,"srcset");
  if(srcset)for(const variant of srcset.split(",")){
   const link=variant.trim().split(/\s+/)[0];if(link)add(link,p,"srcset");
  }
 }
}
report.featuredIdsReferenced=featuredIds.size;
report.uniqueImageUrls=items.size;
for(const entry of items.values())report.byKind[entry.kind]=(report.byKind[entry.kind]||0)+1;
const targets=[...items.values()].filter(x=>
 ["CMS_UPLOAD","ASTRO_FILES_PROXY","ASTRO_IMAGE_OPTIMIZER","FRONTEND_UPLOAD"].includes(x.kind))
 .sort((a,b)=>a.url.localeCompare(b.url));
// A downloaded, immutable previous GitHub Actions report is the coverage oracle.
const previous=JSON.parse(await readFile("prior-image-head/report.json","utf8"));
const validSchemas=["pse-758-published-post-inline-image-head-integrity-v1","pse-native-post-image-head-followup-v1"];
if(!validSchemas.includes(previous.schema)||previous.readOnly!==true||previous.noCmsWrites!==true||
   previous.noBuild!==true||previous.totalPosts!==758||
   previous.summary?.localImageUrlsEligible!==3242||targets.length!==3242)
 throw Error("Prior audit or current inventory differs from reviewed scope");
const targetByUrl=new Map(targets.map(x=>[x.url,x]));
const priorChecks=previous.schema===validSchemas[0]?previous.checks:previous.verifiedChecks;
if(!Array.isArray(priorChecks)||priorChecks.length<420||priorChecks.length>3242)
 throw Error("Unverified prior coverage manifest");
const covered=new Map();
for(const x of priorChecks){
 if(!targetByUrl.has(x.url)||covered.has(x.url)||x.status!==200||x.reason||
    x.kind!==targetByUrl.get(x.url).kind||
    (x.contentType&&!x.contentType.startsWith("image/")&&x.contentType!=="application/octet-stream"))
   throw Error("Prior image coverage mismatch: "+String(x.url).slice(0,400));
 covered.set(x.url,{url:x.url,kind:x.kind,status:200,contentType:x.contentType,
   reason:null,runId:x.runId||String(process.env.PRIOR_RUN_ID||""),checkedAt:x.checkedAt||null});
}
const maxHEAD=420;
const subset=targets.filter(x=>!covered.has(x.url)).slice(0,maxHEAD);
const verifiedBefore=covered.size;
const remainingBefore=targets.length-verifiedBefore;
let stopped=false, inconclusiveCount=0;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const lastIndex=subset.length,checks=Array(lastIndex);let counter=0;
await Promise.all(Array.from({length:2},async()=>{for(;;){
 if(stopped)return;
 const i=counter++;if(i>=lastIndex)return;
 await sleep(300);
 const x=subset[i],parsed=new URL(x.url);
 if(![wp,front].includes(parsed.origin))throw Error("Unexpected local image origin");
 const detail={url:x.url,kind:x.kind,postIds:x.postIds,ref:x.kindsOfRef,
  status:null,contentType:null,length:null,redirect:null,reason:null,error:null};
 try{
  const resp=await fetch(x.url,{method:"HEAD",redirect:"manual",
   signal:AbortSignal.timeout(16000)});
  detail.status=resp.status;
  if([429,503].includes(resp.status)) stopped=true;
  detail.contentType=String(resp.headers.get("content-type")||"").split(";")[0].toLowerCase();
  detail.redirect=resp.headers.get("location")||null;
  detail.length=Number(resp.headers.get("content-length")||0)||null;
  if([404,410].includes(resp.status))detail.reason="NATIVE_IMAGE_NOT_FOUND";
  else if([301,302,307,308].includes(resp.status))detail.reason="NATIVE_IMAGE_REDIRECT_REVIEW";
  else if([401,403,405,429].includes(resp.status)||resp.status>=500)detail.reason="HEAD_INCONCLUSIVE";
  else if(resp.status!==200)detail.reason="UNEXPECTED_IMAGE_HTTP";
  else if(!detail.contentType)detail.reason="HEAD_MISSING_CONTENT_TYPE";
  else if(detail.contentType==="text/html")detail.reason="IMAGE_URL_SERVES_HTML";
  else if(detail.contentType&&!detail.contentType.startsWith("image/")&&detail.contentType!=="application/octet-stream")
   detail.reason="UNEXPECTED_IMAGE_CONTENT_TYPE";
 }catch(e){
  detail.reason="HEAD_NETWORK_UNAVAILABLE";
  detail.error=String(e?.name||e?.message||"network").slice(0,110);
 }
 detail.checkedAt=new Date().toISOString();
 detail.runId=String(process.env.GITHUB_RUN_ID||"");
 checks[i]=detail;
 if(detail.reason==="HEAD_NETWORK_UNAVAILABLE"||detail.reason==="HEAD_INCONCLUSIVE"){
   if(++inconclusiveCount>=5)stopped=true;
 }
}}));
report.checks=checks.filter(Boolean);
report.issues=report.checks.filter(x=>x.reason);
for(const x of report.checks){if(!x.reason&&x.status===200) covered.set(x.url,x);}
report.verifiedChecks=[...covered.values()];
report.external=[...items.values()].filter(x=>x.kind==="EXTERNAL"||x.kind==="OLD_JOOMLA_IMAGES");
for(const c of report.checks){
 const code=c.reason||"HEAD_200_OR_OCTET";
 report.byHead[code]=(report.byHead[code]||0)+1;
}
report.summary={posts:posts.length,uniqueImageUrls:items.size,
 tagCount:report.inlineImgTags,srcRefs:report.inlineSrcRefs,srcsetRefs:report.srcsetRefs,
 featuredMediaIds:report.featuredIdsReferenced,kindCounts:report.byKind,
 localImageUrlsEligible:targets.length,verifiedBefore,remainingBefore,
 newlyChecked:report.checks.length,newlyVerified:covered.size-verifiedBefore,
 localImageUrlsChecked:covered.size,localNotYetChecked:targets.length-covered.size,
 unverifiedThisBatch:report.issues.length,stoppedByRateOrConnectivityGuard:stopped,
 previousRunId:String(process.env.PRIOR_RUN_ID||""),
 checkLimit:maxHEAD,concurrency:2,minDelayPerWorkerMs:300,
 sampleMethod:"Exact prior artifact URL exclusion; next bounded lexicographic unverified segment",
 localHeadIssues:report.issues.length,issueCounts:report.byHead,
 externalReferenced:report.external.length,readOnly:true,noCMSWrites:true,noBuild:true,
 sourceByteParityNotVerified:true};
console.log("PSE_INLINE_IMAGE_FOLLOWUP_SUMMARY="+JSON.stringify(report.summary));
for(const item of report.issues.slice(0,60))
 console.log("PSE_INLINE_IMAGE_FOLLOWUP_ISSUE="+JSON.stringify(item).slice(0,1900));
for(const item of report.external.slice(0,20))
 console.log("PSE_758_EXTERNAL_SOURCE_IMAGE="+JSON.stringify(item).slice(0,1200));
await mkdir("artifacts/pse-inline-image-followup",{recursive:true});
await writeFile("artifacts/pse-inline-image-followup/report.json",JSON.stringify(report,null,2)+"\n");
if(stopped||report.issues.length||report.checks.length!==subset.length)process.exitCode=1;
