/** Final READ-ONLY PSE financial Yoast title readback using independently crawled same-day source-head proof. */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const source=JSON.parse(await readFile("artifacts/pse-finance-76-seo/report.json","utf8"));
const original=JSON.parse(await readFile("artifacts/pse-financial-original/report.json","utf8"));
if(source.schema!=="pse-finance-76-source-seo-audit-v1"||source.checked!==76||
 original.sourceArticles?.length!==76||source.sourceMetaDescriptionCount!==0||
 source.failed.length||source.sourceTitleCount!==76||source.rows.length!==76)
 throw Error("Original source SEO evidence cannot be trusted");
const ctxOrigin="https://admin-pse.webnvn.com";
const report={schema:"pse-finance-76-final-yoast-readback-v1",source:76,
 wordpress:null,verifiedTitles:0,missingDescriptionSource:76,
 targetDescriptionsRetained:0,missing:[],titleMismatch:[],metadataErrors:[],
 status:"UNVERIFIED"};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext();
try{
 const r=await ctx.request.get(ctxOrigin+"/wp-json/wp/v2/posts?categories=1754&per_page=100&page=1&_fields=id,slug,status,pse_seo_title,pse_seo_description",{timeout:60000});
 if(r.status()!==200||Number(r.headers()["x-wp-total"])!==76)throw Error("PSE financial archive taxonomy or count changed");
 const target=await r.json();
 if(target.length!==76)throw Error("Incorrect WordPress financial post page size");
 report.wordpress=target.length;
 const bySlug=new Map(target.map(x=>[x.slug,x]));
 const bySourceId=new Map(source.rows.map(x=>[x.id,x]));
 if(bySlug.size!==76||bySourceId.size!==76)throw Error("Duplicate original/WordPress financial entry");
 for(let i=0;i<original.sourceArticles.length;i++){
  const src=original.sourceArticles[i],seo=bySourceId.get(src.id),post=bySlug.get(src.slug);
  if(!seo||!post||post.id!==seo.wpId||post.status!=="publish"){
   report.missing.push({sourceId:src.id,slug:src.slug});continue;
  }
  if(target[i].id!==post.id)report.metadataErrors.push({sourceId:src.id,error:"Original archive rank changed"});
  if(post.pse_seo_title!==seo.sourceTitle)report.titleMismatch.push({
   sourceId:src.id,wpId:post.id,expected:seo.sourceTitle,actual:post.pse_seo_title
  });
  else report.verifiedTitles++;
  if(post.pse_seo_description)report.targetDescriptionsRetained++;
 }
 report.status=report.verifiedTitles===76&&!report.missing.length&&!report.titleMismatch.length&&
   !report.metadataErrors.length?"PASS_SOURCE_SEO_TITLES":"PARTIAL";
 console.log("PSE_FINANCE_SEO_FINAL="+JSON.stringify({
  status:report.status,source:76,wordpress:report.wordpress,
  verifiedTitles:report.verifiedTitles,missingSourceMetaDescriptions:76,
  existingTargetMetaDescriptionsPreserved:report.targetDescriptionsRetained,
  missing:report.missing,titleMismatch:report.titleMismatch.slice(0,10),
  errors:report.metadataErrors
 }));
}catch(e){report.status="FAIL";report.metadataErrors.push({error:String(e)});console.error("PSE_FINANCE_SEO_FINAL_FATAL="+String(e))}
finally{
 await mkdir("artifacts/pse-finance-seo-final",{recursive:true});
 await writeFile("artifacts/pse-finance-seo-final/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
if(report.status!=="PASS_SOURCE_SEO_TITLES")process.exitCode=1;
