/** PSE published WordPress Post body quality audit, never source-text parity.
 * Source inventory proves identity/taxonomy, NOT non-empty native rendered body.
 * Strict GET only. Never write CMS or trigger site build.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main")throw Error("Wrong PSE audit repo/ref");
const legacy=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(legacy.schema!=="pse-legacy-article-migration-v1"||!legacy.backup_verified)
 throw Error("Source manifest/provenance unknown");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origins=env.filter(s=>s.startsWith("WC_URL="));
if(origins.length!==1)throw Error("Missing unique WP site URL");
const u=new URL(origins[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.origin!=="https://admin-pse.webnvn.com"||!["","/"].includes(u.pathname)||u.search||u.hash||u.username||u.password)
 throw Error("Not the approved PSE WordPress origin");
const cms=u.origin;
const base=cms+"/wp-json/wp/v2/posts?status=publish&per_page=100&_fields=id,slug,status,title,content,acf,categories,featured_media,modified";
async function getPage(page){
 for(let attempt=0;attempt<2;attempt++){
  try{
   const r=await fetch(base+"&page="+page,{
    signal:AbortSignal.timeout(50000),headers:{Accept:"application/json"},redirect:"error"});
   if(r.status>=500&&attempt===0)continue;
   if(r.status!==200)throw Error("WordPress GET page "+page+" HTTP "+r.status);
   const json=await r.json();
   if(!Array.isArray(json)||json.length>100)throw Error("Invalid WordPress REST page "+page);
   const pages=Number(r.headers.get("x-wp-totalpages")||0);
   const total=Number(r.headers.get("x-wp-total")||0);
   if(pages<1||pages>12||total<700||total>1000)throw Error("PSE original inventory unexpectedly changed "+total+"/"+pages);
   return{data:json,pages,total};
  }catch(e){if(attempt===1)throw e}
 }
 throw Error("No WordPress response");
}
const first=await getPage(1);
const pages=[first.data];
let next=2;
await Promise.all(Array.from({length:2},async()=>{for(;;){
 const page=next++;if(page>first.pages)break;
 const data=await getPage(page);
 if(data.pages!==first.pages||data.total!==first.total)throw Error("PSE Posts changed during audit");
 pages[page-1]=data.data;
}}));
const posts=pages.flat();
if(posts.length!==first.total||new Set(posts.map(x=>x.id)).size!==posts.length)
 throw Error("Incomplete or duplicated WP public Posts inventory");
const sourceOwners=new Map();
for(const [id,record] of Object.entries(legacy.articles)){
 const postId=Number(record.wp_id);
 if(!Number.isSafeInteger(postId)||postId<=0)continue;
 if(!sourceOwners.has(postId))sourceOwners.set(postId,[]);
 sourceOwners.get(postId).push(Number(id));
}
function plain(html){
 return String(html||"").replace(/<!--[\s\S]*?-->/g," ")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/ig," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/ig," ")
  .replace(/<[^>]+>/g," ").replace(/&(?:nbsp|#160|zwnj);/ig," ")
  .replace(/&amp;/ig,"&").replace(/\s+/g," ").trim();
}
const rows=[];
for(const p of posts){
 if(p.status!=="publish"||!Number.isSafeInteger(p.id)||typeof p.slug!=="string")
  throw Error("Unexpected WP Post");
 const html=String(p.content?.rendered||"");
 const text=plain(html);
 const img=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);
 const srcCount=img.filter(tag=>/\bsrc\s*=\s*["'][^"']+["']/i.test(tag)).length;
 const oldMedia=[...html.matchAll(/(?:https?:)?\/\/(?:www\.)?pse\.vn\/images\/[^"'<\s)]+/gi)]
  .map(x=>x[0]).slice(0,12);
 const rawUrls=[...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(x=>x[1]);
 const badImages=rawUrls.filter(x=>/^http:\/\//i.test(x)||/^(?:data:|javascript:)/i.test(x)).slice(0,10);
 const acf=p.acf||{},refs=sourceOwners.get(p.id)||[];
 const originPage=String(acf.origin_page_id||"");
 const mismatch=originPage&&refs.length>0&&!refs.some(x=>String(x)===originPage);
 const missingBody=text.length===0&&img.length===0&&!/<(?:video|audio|iframe|table|embed|object|figure)\b/i.test(html);
 const missingImages=img.length>srcCount;
 const flags=[missingBody?"EMPTY_RENDERED_BODY":null,mismatch?"SOURCE_ACF_ID_CONFLICT":null,
  missingImages?"IMG_TAG_WITHOUT_SRC":null,oldMedia.length?"ORIGINAL_PSE_IMAGE_DEPENDENCY":null,
  badImages.length?"INSECURE_OR_INVALID_IMAGE_SRC":null].filter(Boolean);
 if(flags.length)rows.push({
  wpId:p.id,slug:p.slug,sourceIds:refs,originPageId:originPage||null,
  acfAction:String(acf.action||""),acfKey:String(acf.key||""),
  title:plain(p.title?.rendered||"").slice(0,130),
  textChars:text.length,imgTags:img.length,imgSrc:srcCount,featuredMedia:p.featured_media||0,
  flags,oldMediaUrls:oldMedia,badImages:badImages,modified:p.modified||null
 });
}
const perFlag={};
for(const row of rows)for(const flag of row.flags)perFlag[flag]=(perFlag[flag]||0)+1;
const report={schema:"pse-all-published-wordpress-post-content-integrity-readonly-v1",
 readOnly:true,noCmsWrites:true,noBuild:true,sourceManifestEntries:Object.keys(legacy.articles).length,
 liveWordPressPosts:posts.length,wpSourceIdentityOwners:sourceOwners.size,
 check:"native WordPress body existence and asset references ONLY; not original Joomla content equivalence",
 flaggedPostCount:rows.length,perFlag,rows};
console.log("PSE_WORDPRESS_PUBLISHED_BODY_INTEGRITY_SUMMARY="+JSON.stringify({
 liveWordPressPosts:posts.length,sourceIdentityOwners:sourceOwners.size,
 flaggedPostCount:rows.length,perFlag,noCmsWrites:true,notHistoricalParityProof:true}));
for(const row of rows.slice(0,45))
 console.log("PSE_WORDPRESS_NATIVE_BODY_REVIEW="+JSON.stringify({
  wpId:row.wpId,slug:row.slug,sourceIds:row.sourceIds,textChars:row.textChars,
  imgTags:row.imgTags,flags:row.flags,originPageId:row.originPageId}).slice(0,1000));
await mkdir("artifacts/pse-native-body-integrity",{recursive:true});
await writeFile("artifacts/pse-native-body-integrity/report.json",JSON.stringify(report,null,2)+"\n");
