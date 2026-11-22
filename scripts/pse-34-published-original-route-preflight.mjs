/** Exact 34 source-owned published PSE content identities missing Joomla 301s.
 * GET-only preflight. Posts come from owner-scoped original article ID -> WP ID
 * recorded in full live published inventory 45048074150. Native products match
 * one unique source-ID suffix; no approximate name/title destination matching.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong repo");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 Object.keys(state.articles||{}).length!==804)throw Error("Original Joomla ledger changed");
const wp="https://admin-pse.webnvn.com",front="https://pse.webnvn.com";
const wpPosts={
 75:82477,86:82270,90:82437,91:82434,92:82431,
 205:83430,226:83432,227:83440,229:83442,230:83434,240:83436,321:83438,
 980:83318,985:81628,986:81175,987:81102,988:81296,989:82865,990:83136,
 991:81090,992:81106,993:81137,994:81064,995:81077,996:81115,997:81124,
 1053:83036,1159:79852,1184:79439
};
const products=[1427,1668,1669,1677,1722];
const ids=[...Object.keys(wpPosts).map(Number),...products].sort((a,b)=>a-b);
if(ids.length!==34||new Set(ids).size!==34||ids.includes(975))
 throw Error("Unexpected migration scope");
const output="artifacts/pse-34-published-source-redirect-preflight";
await mkdir(output,{recursive:true});
const report={schema:"pse-34-fully-published-original-joomla-paths-native-canonical-preflight-v1",
 scope:ids,ownerSourceCount:804,sourceDeficitsResolvedWithoutMediaImport:true,
 nativePostCount:29,productCount:5,readOnly:true,noCmsWrites:true,noBuild:true,
 priorMissing404Run:45048066030,priorSourceIdentityRun:45048074150,rows:[],summary:null};
const save=()=>writeFile(output+"/report.json",JSON.stringify(report,null,2)+"\n");
const get=async url=>{
 for(let n=1;n<=3;n++){
  try{
   const r=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(45000),headers:{Accept:"text/html,application/json"}});
   if(r.status>=500&&n<3){await new Promise(z=>setTimeout(z,900*n));continue}
   const body=await r.text();if(body.length>5000000)throw Error("Unexpected large response");
   return{http:r.status,body,location:r.headers.get("location")||""};
  }catch(e){
   if(n>=3||!/ECONNRESET|ECONNABORTED|ETIMEDOUT|socket|fetch failed|Timeout|abort/i.test(String(e?.message||e)))throw e;
   await new Promise(z=>setTimeout(z,850*n));
  }
 }
 throw Error("GET retry failed");
};
const [pr,productResult]=await Promise.all([
 Promise.resolve(1),
 get(wp+"/wp-json/wp/v2/product?status=publish&per_page=100&_fields=id,slug,status,title,acf")
]);
if(productResult.http!==200)throw Error("Published native product inventory unavailable");
const nativeProducts=JSON.parse(productResult.body);
if(!Array.isArray(nativeProducts)||nativeProducts.length!==53)
 throw Error("Published WooCommerce source catalog changed");
const fetchCandidate=async id=>{
 const source=state.articles[id]?.source_url,u=source?new URL(source):null;
 if(!u||u.origin!=="https://www.pse.vn"||u.search||u.hash||
    !new RegExp("/"+id+"-[^/]+\\.html$","i").test(u.pathname))
  throw Error("Original Joomla path changed "+id);
 const originalSlug=u.pathname.split("/").at(-1).replace(new RegExp("^"+id+"-"),"").replace(/\.html$/i,"");
 let target,owner,kind;
 if(products.includes(id)){
  const matches=nativeProducts.filter(x=>x.status==="publish"&&x.slug.endsWith("-"+id));
  if(matches.length!==1)throw Error("Native Product source ID not unique "+id);
  owner=matches[0];kind="native-product";target="/san-pham/"+owner.slug;
 }else{
  const res=await get(wp+"/wp-json/wp/v2/posts/"+wpPosts[id]+"?_fields=id,slug,status,title,acf,date,featured_media");
  if(res.http!==200)throw Error("Mapped native WordPress Post not public "+id+" HTTP"+res.http);
  owner=JSON.parse(res.body);
  kind=id>=980&&id<=1053?"native-photo-album":"native-post";
  if(id===1159)console.log("PSE_1159_PUBLIC_POST_SANITIZED="+JSON.stringify({
    id:owner.id,slug:owner.slug,status:owner.status,
    acfAction:owner.acf?.action||null,acfKey:owner.acf?.key||null,
    titleChars:String(owner.title?.rendered||"").trim().length,
    originPageId:owner.acf?.origin_page_id||null
   }));
  const safeNativeSlug=typeof owner.slug==="string"&&owner.slug.length>=6&&
   owner.slug.length<=240&&!/[/?#\\\s]/.test(owner.slug);
  if(owner.id!==wpPosts[id]||owner.status!=="publish"||
   owner.acf?.action!=="PostDetails"||owner.acf?.key!=="ssr-post"||
   !safeNativeSlug||
   !String(owner.title?.rendered||"").trim())
   throw Error("Source-owned WordPress Post identity changed "+id);
  if(kind==="native-photo-album"&&
   (owner.slug!==id+"-"+originalSlug||String(owner.acf?.origin_page_id||"")!==String(id)))
   throw Error("Original gallery source Post slug/ACF mismatch "+id);
  if(owner.acf?.origin_page_id&&String(owner.acf.origin_page_id)!==String(id))
   throw Error("Original source ownership mismatch "+id);
  target="/"+owner.slug;
 }
 if(!target.startsWith("/")||target.startsWith("//")||target.includes("?")||target.includes("#"))
  throw Error("Invalid canonical target "+id);
 const [old,dest]=await Promise.all([get(front+u.pathname),get(front+target)]);
 if(![404,301].includes(old.http))throw Error("Unexpected occupied original Joomla path "+id+" HTTP"+old.http);
 if(old.http===301&&new URL(old.location,front).pathname!==target)
  throw Error("Conflicting prior exact redirect "+id);
 const canonical=dest.body.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||
  dest.body.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
 const cn=canonical?new URL(canonical,front):null;
 if(id===1159){
  const variants=[target,decodeURIComponent(target),encodeURI(target)];
  const checks=await Promise.all([...new Set(variants)].map(async variant=>{
   const v=await get(front+variant);
   const c=v.body.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||
     v.body.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
   return{variant,http:v.http,location:v.location,canonical:c.slice(0,230)};
  }));
  console.log("PSE_1159_TARGET_CANONICAL_DIAGNOSTIC="+JSON.stringify({
   target,targetHttp:dest.http,actualCanonical:cn?.pathname||null,checks
  }));
 }
 if(dest.http!==200||!cn||cn.origin!==front||cn.pathname!==target||cn.search||cn.hash)
  throw Error("Target 200/canonical mismatch "+id);
 const row={sourceId:id,sourcePath:u.pathname,nativeKind:kind,nativeWpId:owner.id,
  nativeSlug:owner.slug,sourceSlug:originalSlug,target,legacyHttp:old.http,
  targetHttp:dest.http,canonicalOkay:true,originPageId:owner.acf?.origin_page_id||null,
  ownership:"source original ledger + unique published native ID",pass:true};
 console.log("PSE_34_SOURCE_ROUTE_PREFLIGHT_ROW="+JSON.stringify(row));
 return row;
};
let cursor=0;const result=new Array(ids.length);
await Promise.all(Array.from({length:3},async()=>{
 for(;;){const i=cursor++;if(i>=ids.length)break;const id=ids[i];
  try{result[i]=await fetchCandidate(id)}
  catch(e){result[i]={sourceId:id,pass:false,error:String(e?.message||e).slice(0,180)};
   console.log("PSE_34_SOURCE_ROUTE_PREFLIGHT_REVIEW="+JSON.stringify(result[i]))}
 }
}));
report.rows=result;
report.summary={total:34,passed:result.filter(x=>x.pass).length,
 rejected:result.filter(x=>!x.pass).map(x=>x.sourceId),
 publishedPosts:result.filter(x=>x.pass&&x.nativeKind==="native-post").length,
 publishedAlbums:result.filter(x=>x.pass&&x.nativeKind==="native-photo-album").length,
 publishedProducts:result.filter(x=>x.pass&&x.nativeKind==="native-product").length,
 zeroCmsWrites:true,ready:result.every(x=>x.pass)};
await save();
console.log("PSE_34_SOURCE_ROUTE_PREFLIGHT_SUMMARY="+JSON.stringify(report.summary));
if(!report.summary.ready)throw Error("Original exact 34 source URL preflight mismatch");
