/** PSE 758 published WP Post exact document URI references and local binary availability.
 * READ ONLY; original Joomla source-media content parity is not inferred.
 */
import {mkdir,writeFile} from "node:fs/promises";

if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||process.env.GITHUB_REF!=="refs/heads/main")
 throw Error("Unexpected repository/ref");
const cms="https://admin-pse.webnvn.com",front="https://pse.webnvn.com";
const asset=/\.(?:pdf|docx?|xlsx?|pptx?|zip|rar)$/i;
const base=cms+"/wp-json/wp/v2/posts?status=publish&per_page=100&_fields=id,slug,status,title,content,categories,modified";
async function request(url,opts={}){
 const u=new URL(url);
 if(u.origin!==cms)throw Error("Unexpected WordPress origin");
 const res=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(30000),...opts});
 return res;
}
async function pageFetch(n){
 const r=await request(base+"&page="+n,{headers:{Accept:"application/json"}});
 if(r.status!==200)throw Error("WordPress published posts page "+n+" HTTP "+r.status);
 const pages=Number(r.headers.get("x-wp-totalpages")),total=Number(r.headers.get("x-wp-total"));
 if(!(pages>=1&&pages<=12&&total>=700&&total<=1000))throw Error("Unexpected PSE published Post registry");
 const posts=await r.json();
 if(!Array.isArray(posts)||posts.length>100)throw Error("Bad WP public page");
 return{pages,total,posts};
}
const first=await pageFetch(1);
const all=Array(first.pages);all[0]=first.posts;let next=2;
await Promise.all(Array.from({length:3},async()=>{for(;;){
 const n=next++;if(n>first.pages)return;
 const p=await pageFetch(n);
 if(p.pages!==first.pages||p.total!==first.total)throw Error("WP live public inventory changed");
 all[n-1]=p.posts;
}}));
const posts=all.flat();
if(posts.length!==first.total||new Set(posts.map(x=>x.id)).size!==posts.length)
 throw Error("Post registry incomplete");
const owners=new Map(),links=new Map();
const tags=/<(a|iframe|embed|object)\b[^>]*>/gi;
const attr=(html,key)=>{
 const re=new RegExp("\\b"+key+"\\s*=\\s*([\"'])(.*?)\\1","i");
 return html.match(re)?.[2]||null;
};
const decode=s=>String(s||"").replace(/&amp;/g,"&").replace(/&#0?38;/g,"&");
const title=s=>String(s||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
let documentTagRefs=0;
for(const p of posts){
 if(p.status!=="publish")throw Error("Draft unexpectedly in public inventory");
 const html=String(p.content?.rendered||"");
 const matches=[...html.matchAll(tags)];
 for(const m of matches){
  const tag=m[1].toLowerCase(),raw=tag==="a"?attr(m[0],"href"):
   tag==="object"?attr(m[0],"data"):attr(m[0],"src");
  if(!raw)continue;
  let url;try{const ref=decode(raw);url=new URL(ref,ref.startsWith("/api/files/wp-content/uploads/")?front+"/":cms+"/")}catch{continue}
  if(!["http:","https:"].includes(url.protocol)||!asset.test(url.pathname))continue;
  if(url.username||url.password)continue;
  const path=url.pathname;
  let kind=url.origin===cms&&path.startsWith("/wp-content/uploads/")?"WP_NATIVE_UPLOAD":
   url.origin===front&&path.startsWith("/api/files/wp-content/uploads/")?"FRONTEND_PROXY":
   url.origin===front&&path.startsWith("/wp-content/uploads/")?"FRONTEND_UPLOAD":
   ["pse.vn","www.pse.vn"].includes(url.hostname)&&path.startsWith("/images/")?"ORIGINAL_JOOMLA_FILE":
   url.origin===cms?"WP_OTHER_FILE":"EXTERNAL_FILE";
  const k=url.href;
  const item=links.get(k)||{url:k,kind,posts:[],mimeExtension:path.split(".").at(-1).toLowerCase()};
  if(!item.posts.some(x=>x.wpId===p.id))item.posts.push({wpId:p.id,slug:p.slug,title:title(p.title?.rendered).slice(0,125),tag});
  links.set(k,item);documentTagRefs++;
 }
}
const resources=[...links.values()].sort((a,b)=>a.url.localeCompare(b.url));
const countByKind={};for(const item of resources)countByKind[item.kind]=(countByKind[item.kind]||0)+1;
const eligible=resources.filter(x=>x.kind==="WP_NATIVE_UPLOAD"||x.kind==="FRONTEND_UPLOAD");
const proxies=resources.filter(x=>x.kind==="FRONTEND_PROXY");
// WordPress relative /api/files URLs resolve on ASTRO public site, not WP CMS.
// Previously verified 397 native HEAD: #44917101264 + #44917251484.
// Exact annual proxy↔WP PDF SHA and live href QA: #44917675053, #44917814607.
if(posts.length!==758||documentTagRefs!==503||resources.length!==400||
 eligible.length!==397||countByKind.WP_NATIVE_UPLOAD!==397||
 proxies.length!==2||countByKind.EXTERNAL_FILE!==1)
 throw Error("Native Posts/document inventory drift; cannot reuse previous evidence");
const priorRunIds=[44917101264,44917251484],priorVerifiedNativeHEAD=397;
const toCheck=proxies;
const checks=[];let cursor=0;
await Promise.all(Array.from({length:5},async()=>{for(;;){
 const i=cursor++;if(i>=toCheck.length)return;
 const item=toCheck[i],u=new URL(item.url);
 if(u.origin!==front||!u.pathname.startsWith("/api/files/wp-content/uploads/"))
  throw Error("Unexpected native media url");
 const checked={url:item.url,wpIds:item.posts.map(x=>x.wpId),kind:item.kind,status:null,mime:null,length:null,reason:null};
 try{
  const r=await fetch(item.url,{method:"HEAD",redirect:"manual",signal:AbortSignal.timeout(13000)});
  checked.status=r.status;checked.mime=String(r.headers.get("content-type")||"").split(";")[0];
  checked.length=Number(r.headers.get("content-length")||0)||null;
  if([404,410].includes(r.status))checked.reason="SOURCE_NATIVE_FILE_NOT_FOUND_HEAD";
  else if(r.status===301||r.status===302||r.status===307||r.status===308)
   checked.reason="SOURCE_NATIVE_FILE_REDIRECT_REVIEW";
  else if(r.status===403||r.status===405||r.status===429||r.status>=500)
   checked.reason="SOURCE_HEAD_INCONCLUSIVE";
  else if(r.status===200&&checked.mime==="text/html")
   checked.reason="SOURCE_FILE_CONTENT_TYPE_HTML";
  else if(r.status!==200)checked.reason="SOURCE_UNEXPECTED_HTTP";
 }catch(e){checked.reason="SOURCE_HEAD_UNAVAILABLE";checked.error=String(e?.name||e?.message||"network").slice(0,95)}
 checks.push(checked);
}}));
const issues=checks.filter(x=>x.reason);
const originalLinks=resources.filter(x=>x.kind==="ORIGINAL_JOOMLA_FILE");
const insecure=resources.filter(x=>new URL(x.url).protocol==="http:");
const result={schema:"pse-all-published-758-wordpress-document-link-inventory-v2",readOnly:true,noCmsWrites:true,noBuild:true,
 notes:"A relative /api/files route must be resolved against the public Astro domain, not against WordPress REST origin. 2014+2016 public annual link QA and PDF byte SHA PASS. HEAD only checks response status/type.",
 postCount:posts.length,documentTagRefs,uniqueDocumentUrls:resources.length,byKind:countByKind,
 wpUploadEligible:eligible.length,wpUploadPriorVerified:priorVerifiedNativeHEAD,
 wpUploadPriorRunIds:priorRunIds,wpUploadHeadUnchecked:0,
 frontendProxyUrls:proxies.length,frontendProxyHeadChecked:checks.length,
 issueCounts:Object.fromEntries([...new Set(issues.map(x=>x.reason))].map(x=>[x,issues.filter(y=>y.reason===x).length])),
 issues,originalLegacyFileUrls:originalLinks,insecureHttpDocs:insecure,
 checkedNativeFiles:checks,resources};
console.log("PSE_758_PUBLISHED_DOCUMENT_LINK_SUMMARY="+JSON.stringify({
 posts:result.postCount,documentTagRefs,uniqueDocumentUrls:resources.length,byKind:countByKind,
 nativePreviouslyVerified:priorVerifiedNativeHEAD,priorRunIds,
 proxyCheckedThisRun:checks.length,nativeUnchecked:0,
 originalJoomlaDocuments:originalLinks.length,insecureHttpDocuments:insecure.length,
 issues:result.issueCounts,readOnly:true,noCmsWrites:true}));
for(const item of issues.slice(0,25))console.log("PSE_758_NATIVE_DOCUMENT_ISSUE="+JSON.stringify(item).slice(0,850));
for(const item of insecure.slice(0,12))console.log("PSE_758_INSECURE_DOCUMENT="+JSON.stringify(item).slice(0,850));
await mkdir("artifacts/pse-758-post-document-links",{recursive:true});
await writeFile("artifacts/pse-758-post-document-links/report.json",JSON.stringify(result,null,2)+"\n");
