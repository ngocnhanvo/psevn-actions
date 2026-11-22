/** Nine outstanding Joomla source identities: live legacy path and canonical target diagnostics.
 * Strictly read-only. A live 301 is routing evidence, not image/media or content identity proof.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Unexpected project");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const ids=[975,1425,1426,1434,1464,1484,1639,1676,1678];
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified)
 throw Error("Owner source provenance not verified");
const origin="https://pse.webnvn.com",wp="https://admin-pse.webnvn.com";
const out="artifacts/pse-nine-unresolved-live-paths";await mkdir(out,{recursive:true});
const report={schema:"pse-nine-unresolved-source-ids-public-route-diagnostics-2026-11-22-v1",
 onlyOriginalSourceIds:ids,readOnly:true,noWpWrites:true,noBuild:true,
 noHotlinkSubstitution:true,results:[],summary:{}};
const save=()=>writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
const get=async url=>{
 let last=null;
 for(let n=0;n<3;n++){
  try{
   const r=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(30000),headers:{"Accept":"text/html,application/json"}});
   if(r.status>=500&&n<2){last="HTTP"+r.status;await new Promise(z=>setTimeout(z,(n+1)*900));continue}
   let body="";
   if(r.status===200&&String(r.headers.get("content-type")||"").includes("text/html")){
    const t=await r.text();
    if(t.length>2500000)throw Error("Unexpected huge public response");
    body=t;
   }
   return {http:r.status,location:r.headers.get("location")||"",body};
  }catch(e){if(n>=2||!/ECONNRESET|ECONNABORTED|socket hang up|Timeout|fetch failed|ETIMEDOUT/i.test(String(e?.message||e)))throw e;
   last="transient";await new Promise(z=>setTimeout(z,(n+1)*900))}
 }
 throw Error("Public route not ready "+last);
};
const products=await fetch(wp+"/wp-json/wp/v2/product?status=publish&per_page=100&_fields=id,slug,title,status",{signal:AbortSignal.timeout(30000)});
if(products.status!==200)throw Error("Native WP Product registry not readable");
const inventory=await products.json();
if(!Array.isArray(inventory)||inventory.length<45)throw Error("Product inventory unexpectedly incomplete");
const registry=inventory.map(p=>({id:p.id,slug:p.slug,title:String(p.title?.rendered||"").replace(/<[^>]+>/g,"").trim()}));
try{
 for(const id of ids){
  const entry=state.articles[id];
  if(entry?.status!=="quarantined"||typeof entry.source_url!=="string")throw Error("Source status drift "+id);
  const old=new URL(entry.source_url);
  if(old.origin!=="https://www.pse.vn"||old.search||old.hash||!old.pathname.includes("/"+id+"-")||!old.pathname.endsWith(".html"))
    throw Error("Original source path identity invalid "+id);
  const page=await get(origin+old.pathname);
  let next=null,target=null,can=null,external=false,redirectMatch=false;
  if([301,302,307,308].includes(page.http)&&page.location){
   next=new URL(page.location,origin);
   external=next.origin!==origin;
   if(!external&&!next.search&&!next.hash){
    target=await get(next.href);
    const m=target.body.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||
      target.body.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i);
    can=m?.[1]?new URL(m[1],origin):null;
    redirectMatch=page.http===301&&target.http===200&&can?.origin===origin&&can.pathname===next.pathname;
   }
  }
  const productSlug=next?.pathname.startsWith("/san-pham/")?next.pathname.slice("/san-pham/".length):null;
  const matchingProduct=registry.filter(p=>productSlug===p.slug).map(p=>({id:p.id,slug:p.slug,title:p.title}));
  const publicRecord={id,legacyPath:old.pathname,legacyHttp:page.http,
   location:page.location||null,destinationPath:next?.pathname||null,destinationHttp:target?.http||null,
   canonicalPath:can?.pathname||null,validExact301:redirectMatch,
   targetIsNativePublishedProduct:matchingProduct.length===1,
   product:matchingProduct.length===1?matchingProduct[0]:null,
   isGallery:id===975,externalRedirect:external,ownerOriginalPhotosVerified:false,
   sourceSemanticsMatched:false};
  report.results.push(publicRecord);
  console.log("PSE_NINE_LEGACY_ROUTE_ROW="+JSON.stringify(publicRecord));
  await save();
 }
 report.summary={total:9,http301:report.results.filter(x=>x.legacyHttp===301).length,
  validCanonical301:report.results.filter(x=>x.validExact301).length,
  directlyVerifiedProduct301:report.results.filter(x=>x.validExact301&&x.targetIsNativePublishedProduct).length,
  http404:report.results.filter(x=>x.legacyHttp===404).length,
  unresolved:report.results.filter(x=>!x.validExact301).map(x=>x.id),
  contentSourceSemanticsNotAssumed:true,noCMSWrites:true};
 await save();console.log("PSE_NINE_LEGACY_ROUTE_SUMMARY="+JSON.stringify(report.summary));
}catch(e){report.summary.error=String(e?.message||e).slice(0,160);await save();throw e;}
