/** Read-only provenance of older Joomla posts missing by exact title on PSE WP. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {sourceId,parseCreated} from "./pse-legacy-search-date.mjs";
const marker=(await readFile(".pse-company-older-provenance-request","utf8")).trim();
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(marker!=="MODE=READONLY"||String(ev.head_commit?.message||"").split("\n")[0]!=="audit(pse): trace older company Joomla posts to migration checkpoint")
 throw Error("Only owner-requested read-only legacy company provenance");
const artifact=JSON.parse(await readFile("artifacts/source/global-posts-parity.json","utf8"));
if(artifact.sourceRun!==45951216521||artifact.globalPosts!==771||artifact.sourceTitles!==55||
 artifact.summary.missingGlobalExact!==17)throw Error("Global WP source evidence changed");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||Object.keys(state.articles||{}).length!==804)throw Error("PSE legacy state changed");
const target=artifact.results.filter(x=>x.classification==="NO_EXACT_TITLE_IN_ALL_PUBLISHED_POSTS"&&
 x.sourcePage>1); // 16 older titles, excluding already verified November 2026 id 1739
if(target.length!==16)throw Error("Expected exactly 16 remaining older Joomla title mismatches");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1300,height:900}});
await page.route(/\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const norm=x=>String(x||"").normalize("NFKC").replace(/\s+/g," ").trim().toLocaleLowerCase("vi")
 .normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu," ").trim();
const report={mode:"READONLY",time:new Date().toISOString(),sources:[],readOnly:true,
 exactCategoryComparisonRun:45951216521,globalWPComparisonRun:45951534765};
try{
 for(const row of target){
  const title=row.sourceTitle;
  const queryOptions=[title,title.split(/\s+/).slice(0,10).join(" "),title.split(/\s+/).slice(0,6).join(" ")];
  const queries=[...new Set(queryOptions.filter(x=>x.length>12))];
  let matches=[],sample=[];
  for(const query of queries){
   try{
    const u=new URL("https://www.pse.vn/component/search/");
    u.searchParams.set("searchword",query);
    u.searchParams.set("ordering","newest");
    u.searchParams.set("searchphrase","all");
    const res=await page.goto(u.href,{waitUntil:"domcontentloaded",timeout:45000});
    if(res?.status()!==200)continue;
    const found=await page.evaluate(()=>[...document.querySelectorAll("dl.search-results dt.result-title a[href],.search-results a[href],.result-title a[href]")].map(a=>{
     let date="";let s=a.closest("dt")?.nextElementSibling;
     while(s&&s.tagName!=="DT"){if(s.matches(".result-created,[class*=result-created]")){date=s.textContent||"";break}s=s.nextElementSibling}
     if(!date)date=a.closest(".search-result,li,article")?.querySelector(".result-created,[class*=result-created]")?.textContent||"";
     return{title:(a.textContent||"").trim(),href:a.href,date};
    }));
    sample=found.slice(0,5).map(x=>({title:x.title,id:sourceId(x.href)}));
    matches=found.filter(x=>norm(x.title)===norm(title)&&Number.isSafeInteger(sourceId(x.href)));
    if(matches.length===1)break;
   }catch(e){sample=[{error:String(e?.message||e).slice(0,115)}]}
  }
  const id=matches.length===1?sourceId(matches[0].href):null;
  const checkpoint=id?state.articles[id]:null;
  report.sources.push({title,sourcePage:row.sourcePage,resolvedId:id,
   originalUrl:matches.length===1?matches[0].href:null,
   sourceCreated:matches.length===1?parseCreated(matches[0].date)?.day:null,
   inMigrationState:!!checkpoint,
   migrationStatus:checkpoint?.status||null,wpId:checkpoint?.wp_id||null,
   reason:checkpoint?.reason||null,group:checkpoint?.group_hint||null,
   checkpointUrl:checkpoint?.source_url||null,searchHits:matches.length,
   sample:matches.length===1?undefined:sample});
  console.log("PSE_OLDER_COMPANY_SOURCE="+JSON.stringify(report.sources.at(-1)).slice(0,2400));
 }
 report.summary={target:target.length,resolvedIds:report.sources.filter(x=>x.resolvedId).length,
  importedByOriginalId:report.sources.filter(x=>x.migrationStatus==="imported").length,
  quarantined:report.sources.filter(x=>x.migrationStatus==="quarantined").length,
  notInCheckpoint:report.sources.filter(x=>x.resolvedId&&!x.inMigrationState).length,
  unresolved:report.sources.filter(x=>!x.resolvedId).length};
 console.log("PSE_OLDER_COMPANY_PROVENANCE="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-company-news",{recursive:true});
 await writeFile("artifacts/pse-company-news/older-provenance.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
