/** PSE 758 native posts: last 3 non-upload document links, verified exact WP owner/source. GET only. */
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong project");
const legacy=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(legacy.schema!=="pse-legacy-article-migration-v1"||!legacy.backup_verified)throw Error("Original manifest not verified");
const cms="https://admin-pse.webnvn.com",front="https://pse.webnvn.com";
const base=cms+"/wp-json/wp/v2/posts?status=publish&per_page=100&_fields=id,slug,status,title,content";
async function fetchLimited(url,timeout=20000,method="GET"){
 const u=new URL(url);
 if(method==="GET"&&u.origin!==cms&&u.origin!=="https://web.archive.org")throw Error("GET outside permitted host");
 if(method==="HEAD"&&!([cms,front,"http://www.mediafire.com","https://www.mediafire.com"].includes(u.origin)))throw Error("HEAD outside permitted host");
 return fetch(url,{method,signal:AbortSignal.timeout(timeout),redirect:"manual"});
}
async function getPage(n){
 const r=await fetchLimited(base+"&page="+n,40000);
 if(r.status!==200)throw Error("WP REST page HTTP "+r.status);
 const pages=Number(r.headers.get("x-wp-totalpages")),total=Number(r.headers.get("x-wp-total"));
 if(pages<1||pages>12||total<700||total>1000)throw Error("WP expected count changed");
 const posts=await r.json();if(!Array.isArray(posts))throw Error("Invalid WordPress REST page");
 return{posts,pages,total};
}
const first=await getPage(1),all=[...first.posts];for(let i=2;i<=first.pages;i++){
 const p=await getPage(i);if(p.total!==first.total||p.pages!==first.pages)throw Error("Public Posts changed");
 all.push(...p.posts);
}
if(all.length!==758||all.length!==first.total)throw Error("Prior 758 Post inventory drift");
const docs=new Map();
for(const p of all){
 for(const m of String(p.content?.rendered||"").matchAll(/<(a|iframe|object|embed)\b[^>]*>/gi)){
  const tag=m[1].toLowerCase(),attr=tag==="a"?"href":tag==="object"?"data":"src";
  const pattern=new RegExp("\\b"+attr+"\\s*=\\s*([\"'])(.*?)\\1","i");
  const raw=m[0].match(pattern)?.[2];if(!raw)continue;
  let u;try{const href=raw.replace(/&amp;/gi,"&");u=new URL(href,href.startsWith("/api/files/wp-content/uploads/")?front+"/":cms+"/")}catch{continue}
  if(!["http:","https:"].includes(u.protocol)||!/\.(?:pdf|docx?|xlsx?|pptx?|zip|rar)$/i.test(u.pathname))continue;
  const kind=u.origin===cms&&u.pathname.startsWith("/wp-content/uploads/")?"WP_NATIVE_UPLOAD":
    u.origin===front&&u.pathname.startsWith("/api/files/wp-content/uploads/")?"FRONTEND_PROXY":
   u.origin===front&&u.pathname.startsWith("/wp-content/uploads/")?"FRONTEND_UPLOAD":
   ["pse.vn","www.pse.vn"].includes(u.hostname)&&u.pathname.startsWith("/images/")?"ORIGINAL_JOOMLA_FILE":
   u.origin===cms?"WP_OTHER_FILE":"EXTERNAL_FILE";
  const rec=docs.get(u.href)||{url:u.href,kind,wpPostIds:[]};
  if(!rec.wpPostIds.includes(p.id))rec.wpPostIds.push(p.id);
  docs.set(u.href,rec);
 }
}
const unusual=[...docs.values()].filter(r=>r.kind!=="WP_NATIVE_UPLOAD"&&r.kind!=="FRONTEND_UPLOAD");
if(docs.size!==400||unusual.length!==3||unusual.filter(x=>x.kind==="FRONTEND_PROXY").length!==2||
 unusual.filter(x=>x.kind==="EXTERNAL_FILE").length!==1)
 throw Error("Previously audited three non-Uploads document URLs drift");
const proof={schema:"pse-last-three-non-native-document-url-verification-v2",readOnly:true,noCmsWrites:true,noBuild:true,
 previousFullWordPressUploadsHeadVerified:397,posts:758,docUrls:docs.size,nonUploads:[]};
for(const row of unusual){
 const entry={...row,sourceIdOwners:[],head:null,httpsVariant:null,verdict:"REVIEW_ONLY"};
 for(const id of row.wpPostIds){
  const matches=Object.entries(legacy.articles).filter(([,p])=>Number(p.wp_id)===id)
   .map(([srcId,p])=>({joomlaId:Number(srcId),url:p.source_url,status:p.status}));
  entry.sourceIdOwners.push({wpPostId:id,owners:matches});
 }
 const variants=[row.url];
 if(row.url.startsWith("http://www.mediafire.com/"))variants.push(row.url.replace("http:","https:"));
 for(const original of variants){
  const info={url:original,http:null,location:null,mime:null,reason:null};
  try{
   const r=await fetchLimited(original,18000,"HEAD");
   info.http=r.status;info.location=r.headers.get("location");info.mime=r.headers.get("content-type");
   info.reason=r.status===200?"HEAD_HTTP_200_CONTENT_NOT_PROVEN":
    [301,302,307,308].includes(r.status)?"REDIRECT_DESTINATION_REVIEW":
    r.status===404||r.status===410?"HTTP_NOT_FOUND":
    "HEAD_STATUS_OR_NETWORK_INCONCLUSIVE";
  }catch(e){info.reason="HEAD_NETWORK_UNAVAILABLE";info.error=String(e?.name||e?.message||"network").slice(0,100)}
  if(original===row.url)entry.head=info;else entry.httpsVariant=info;
 }
 entry.verdict=row.kind==="FRONTEND_PROXY"?"PUBLIC_FRONTEND_PROXY_PROVEN_SHA_INDEPENDENT_RUN_44917675053":
   "EXTERNAL_MEDIAFIRE_ORIGINAL_FILE_PROVENANCE_UNAVAILABLE";
 proof.nonUploads.push(entry);
 console.log("PSE_NONUPLOAD_DOCUMENT_ROW="+JSON.stringify(entry).slice(0,4500));
}
proof.summary={nonUploadUrls:unusual.length,frontendProxyUrls:2,externalMediafireHttp:1,
 priorWpUploadsVerified:397,noCMSWrites:true,noBuild:true};
console.log("PSE_NONUPLOAD_DOCUMENT_SUMMARY="+JSON.stringify(proof.summary));
await mkdir("artifacts/pse-last-three-doc-links",{recursive:true});
await writeFile("artifacts/pse-last-three-doc-links/report.json",JSON.stringify(proof,null,2)+"\n");
