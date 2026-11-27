/** Compare exact owner-supplied Joomla #93 creation times against published WP category #1743. No writes. */
import {readFile} from "node:fs/promises";
const manifest=JSON.parse(await readFile("docs/source/pse-market-joomla-created-2026-11-27.json","utf8"));
const fail=msg=>{throw Error("PSE_MARKET_JOOMLA_DATE_PREFLIGHT: "+msg)};
if(manifest.schema!=="pse-market-joomla-created-date-v1" ||
 manifest.source?.sha256!=="ec85436b4e7a475b13c2955e8e0adcbbae11c87e8502669b3ae77e51f2bc4f2c" ||
 manifest.source.sourceCatId!==93 || manifest.source.moduleOrdering!=="created_dsc" ||
 manifest.source.moduleDateType!=="created" ||manifest.source.moduleSourceCategories.join(",")!=="22,93,73,74"||
 manifest.target?.wordpressCategoryId!==1743 || manifest.records?.length!==14 ||
 new Set(manifest.records.map(x=>x.joomlaId)).size!==14 ||
 new Set(manifest.records.map(x=>x.slug)).size!==14)fail("Source/target identity, module contract or 14 original post IDs drifted");
const dates=manifest.records.map(x=>{
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(x.created)|| x.created!==x.publishUp)
   fail("Original Joomla created/publish_up not verified for "+x.joomlaId);
 return x.created;
});
if(dates.some((d,i)=>i && d>=dates[i-1]))fail("Original Joomla ordering timestamps aren't strictly descending");
const origin="https://admin-pse.webnvn.com",catId=1743;
const cat=await fetch(origin+"/wp-json/wp/v2/categories/"+catId+"?_fields=id,slug,name,parent",{signal:AbortSignal.timeout(30000)});
const category=await cat.json().catch(()=>null);
if(cat.status!==200||category?.id!==catId)fail("WordPress category missing or moved");
const res=await fetch(origin+"/wp-json/wp/v2/posts?categories="+catId+"&status=publish&orderby=date&order=desc&per_page=100&page=1&_fields=id,slug,title,date,date_gmt,categories,status,modified",{signal:AbortSignal.timeout(45000)});
const wp=await res.json().catch(()=>null);
const total=Number(res.headers.get("x-wp-total"));
if(res.status!==200||!Array.isArray(wp)||total!==14||wp.length!==14)fail("WordPress published market category must have exactly 14 records; total="+total+" HTTP "+res.status);
const bySlug=new Map(wp.map(x=>[x.slug,x]));
if(bySlug.size!==14)fail("Duplicate WordPress slugs");
const normalizeTitle=x=>String(x||"").replace(/&(?:amp|nbsp|quot|#0?39);/gi," ").replace(/\s+/g," ").trim().toLocaleLowerCase("vi");
const rows=manifest.records.map((source,index)=>{
 const target=bySlug.get(source.slug);
 if(!target||target.status!=="publish"||!target.categories.includes(catId)||
     !target.title?.rendered||normalizeTitle(target.title.rendered)!==normalizeTitle(source.title))
  fail("Published article title, slug or category drift for Joomla ID "+source.joomlaId);
 return {joomlaId:source.joomlaId,wpId:target.id,slug:source.slug,
   sourceCreated:source.created,current:target.date,alreadyEqual:source.created===target.date,
   sourceRank:index+1,wpRank:wp.findIndex(x=>x.id===target.id)+1};
});
const report={schema:"pse-market-date-readonly-v1",verified:14,
 sourceSha256:manifest.source.sha256,
 changed:rows.filter(r=>!r.alreadyEqual).length,
 alreadyMatching:rows.filter(r=>r.alreadyEqual).length,
 expectedTop5:rows.slice(0,5).map(x=>x.slug),
 currentTop5:wp.slice(0,5).map(x=>x.slug),
 identity:"14/14 title+slug+category PASS",rows};
console.log("PSE_MARKET_DATE_PREFLIGHT="+JSON.stringify(report));
if(process.argv.includes("--require-all-matched")&&rows.some(r=>!r.alreadyEqual))fail("Not all WP dates equal Joomla created");
