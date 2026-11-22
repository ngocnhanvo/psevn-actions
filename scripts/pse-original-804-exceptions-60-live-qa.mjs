/** 804 Joomla source URL coverage: 60 exact URLs not included among the 765 verified native 301s.
 * Source oracle: docs/pse-legacy-migration-state.json. Remaining 744 paths already
 * independently passed exact native live QA run 45043136174. Zero writes.
 * No guesses about product/category targets or source article publication dates.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
const ids=[75,86,90,91,92,114,121,127,178,186,196,198,202,204,205,226,227,229,230,237,240,321,338,341,344,348,370,379,382,975,980,985,986,987,988,989,990,991,992,993,994,995,996,997,1053,1085,1090,1159,1184,1425,1426,1427,1434,1639,1640,1668,1669,1677,1678,1722];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 ids.length!==60||new Set(ids).size!==60)
 throw Error("Wrong audit scope or duplicate source IDs");
const ledger=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(ledger.schema!=="pse-legacy-article-migration-v1"||
 Object.keys(ledger.articles||{}).length!==804||!ledger.backup_verified)
 throw Error("Source Joomla manifest changed; do not claim full site coverage");
const front="https://pse.webnvn.com";
const report={schema:"pse-804-original-joomla-60-previously-uncovered-url-live-qa-v1",
 previousExisting301SourceRoutes:744,previousExistingNativeRulesVerified:765,
 priorPublicInventoryRun:45042854764,priorFull301Run:45043136174,
 originalUrlsChecked:ids.length,onlyGet:true,noCmsWrites:true,noBuild:true,
 sameOriginOnly:true,rows:[],summary:{}};
const path="artifacts/pse-804-source-route-coverage";await mkdir(path,{recursive:true});
const save=()=>writeFile(path+"/report.json",JSON.stringify(report,null,2)+"\n");
const get=async(u)=>{
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const r=await fetch(u,{redirect:"manual",signal:AbortSignal.timeout(40000),headers:{"Accept":"text/html"}});
   if(r.status>=500&&attempt<3){await new Promise(x=>setTimeout(x,attempt*850));continue}
   const loc=r.headers.get("location")||"";
   let body="";
   if(r.status===200&&/text\/html/i.test(r.headers.get("content-type")||"")){
    const len=Number(r.headers.get("content-length")||0);
    if(len>4500000)throw Error("Unexpected huge public response");
    body=await r.text();if(body.length>4500000)throw Error("Unexpected body size");
   }else await r.body?.cancel().catch(()=>{});
   return{http:r.status,location:loc,body};
  }catch(e){
   const reason=String(e?.message||e);
   if(attempt===3||!/fetch failed|socket hang up|ECONNRESET|ETIMEDOUT|timeout|abort|network/i.test(reason))throw e;
   await new Promise(x=>setTimeout(x,attempt*900));
  }
 }
 throw Error("Unreachable GET retry");
};
const results=new Array(ids.length);let cursor=0;
await Promise.all(Array.from({length:3},async()=>{
 for(;;){
  const i=cursor++;if(i>=ids.length)break;
  const id=ids[i],x=ledger.articles[id],r={sourceId:id,status:x?.status||null,legacyPath:null,
   oldHttp:null,location:null,targetHttp:null,canonical:null,canonicalOkay:false,
   exact301:false,error:null};
  results[i]=r;
  try{
   const src=new URL(x.source_url);
   if(src.origin!=="https://www.pse.vn"||src.search||src.hash||
     !src.pathname.endsWith(".html")||!src.pathname.includes("/"+id+"-"))
    throw Error("Unexpected exact Joomla source identity");
   r.legacyPath=src.pathname;
   const old=await get(front+src.pathname);r.oldHttp=old.http;r.location=old.location;
   if(old.http===301&&old.location){
    const dest=new URL(old.location,front);
    if(dest.origin!==front||dest.search||dest.hash)throw Error("Unsafe redirect target");
    const page=await get(dest.href);
    r.targetHttp=page.http;
    r.targetPath=dest.pathname;
    if(page.http===200){
     const m=page.body.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||
      page.body.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i);
     const canon=m?.[1]?new URL(m[1],front):null;
     r.canonical=canon?.href||null;
     r.canonicalOkay=Boolean(canon&&canon.origin===front&&canon.pathname===dest.pathname&&
      !canon.search&&!canon.hash);
    }
    r.exact301=page.http===200&&r.canonicalOkay;
   }
  }catch(e){r.error=String(e?.message||e).slice(0,160)}
  console.log("PSE_804_EXTRA_SOURCE_ROUTE_ROW="+JSON.stringify(r));
 }
}));
report.rows=results;report.summary={
 totalOriginalJoomlaSource:804,
 previouslyVerifiedUniqueOriginalNative301:744,
 extraOriginalPaths:60,
 exact301:results.filter(x=>x.exact301).length,
 unresolved:results.filter(x=>!x.exact301).map(x=>({sourceId:x.sourceId,oldHttp:x.oldHttp,location:x.location,targetHttp:x.targetHttp,error:x.error})),
 potentialTotalOriginalSource301:744+results.filter(x=>x.exact301).length,
 editorialSourceContentNotAssumed:true,noCMSWrites:true};
await save();
console.log("PSE_804_EXTRA_60_ROUTE_SUMMARY="+JSON.stringify(report.summary));
if(report.summary.unresolved.length)throw Error("Outstanding old Joomla URL redirects: "+report.summary.unresolved.map(x=>x.sourceId).join(","));
