/** Read-only residuals after source-proven 7+1 Joomla Posts recovery. */
import {request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong repository");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const dates=JSON.parse(await readFile("docs/pse-legacy-date-backfill-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 dates.schema!=="pse-legacy-date-backfill-v1")throw Error("Unexpected source checkpoint");
const expected={
 "tin-tong-hop":[186,196,198,202,204,205,226,227,229,237,240,379,382,1090],
 "hoat-dong-cong-doan":[230,321],
 "tin-cong-ty":[1640],
 "tin-tuc-co-dong":[338,1085],
 "thong-tin-thi-truong":[341],
 "huong-dan-su-dung-phan-bon":[114,121,127,178],
 "kien-thuc-nong-nghiep":[344,348,370]
};
const originals=Object.entries(expected).flatMap(([family,ids])=>ids.map(id=>({id,family,source:state.articles[String(id)],date:dates.records?.[String(id)]||null})));
if(originals.length!==27||new Set(originals.map(r=>r.id)).size!==27)throw Error("Legacy expected cohort changed");
const config=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const vs=config.filter(x=>x.startsWith("WC_URL="));if(vs.length!==1)throw Error("Missing WP URL");
const u=new URL(vs[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.port||!["","/"].includes(u.pathname))
 throw Error("Invalid CMS origin");
const wp=u.origin,net=await request.newContext({timeout:45000});
const records=[];
try{
 let cursor=0;
 const fetchOne=async row=>{
  const src=row.source;
  if(!src?.source_url?.startsWith("https://www.pse.vn/")||
   !new RegExp("/"+row.id+"-[^/]+\\.html$","i").test(new URL(src.source_url).pathname))
   throw Error("Historic original source identity mismatch "+row.id);
  const slug=new URL(src.source_url).pathname.split("/").at(-1).replace(new RegExp("^"+row.id+"-"),"").replace(/\.html$/i,"");
  if(!/^[a-z0-9-]+$/.test(slug))throw Error("Untrusted Joomla source slug "+row.id);
  const path="/wp-json/wp/v2/posts?status=publish&slug="+encodeURIComponent(slug)+
   "&per_page=10&_fields=id,slug,date,status,categories,acf";
  let r;
  for(let attempt=1;attempt<=3;attempt++){
   try{
    r=await net.get(wp+path,{timeout:45000,failOnStatusCode:false});
    if(r.status()===200)break;
    if(r.status()<500||attempt===3)throw Error("Public WP Post lookup HTTP "+r.status()+" id "+row.id);
   }catch(e){if(attempt===3||!/ECONNRESET|ETIMEDOUT|Timeout|socket hang up|WP Post lookup HTTP 5/i.test(String(e?.message||e)))throw e}
   await new Promise(resolve=>setTimeout(resolve,1000*attempt));
  }
  const posts=await r.json();
  if(!Array.isArray(posts))throw Error("Unexpected WP Posts response "+row.id);
  const proven=posts.filter(p=>String(p.acf?.origin_page_id||"")===String(row.id));
  if(proven.length>1)throw Error("Duplicate native original Joomla Post id "+row.id);
  const status=proven.length===1?"SOURCE_IDENTIFIED_PUBLISHED":
   posts.length?"SLUG_COLLISION_NEEDS_SOURCE_PROOF":"NOT_PUBLISHED";
  return {id:row.id,family:row.family,slug,sourceStatus:src.status,sourceReason:src.reason||null,
   dateStatus:row.date?.status||null,dateEvidence:row.date?.source_created_day||null,
   wpId:proven[0]?.id||null,wpDay:proven[0]?.date?.slice(0,10)||null,
   sourceMatchedPostCount:proven.length,publicSlugCandidates:posts.length,status};
 };
 await Promise.all(Array.from({length:3},async()=>{
  for(;;){const i=cursor++;if(i>=originals.length)break;records.push(await fetchOne(originals[i]))}
 }));
 records.sort((a,b)=>a.id-b.id);
 const rows=records.map(r=>({...r,
  next:r.status!=="NOT_PUBLISHED"?"NONE":
   r.id===379?"ORIGINAL_DAY_UNVERIFIED":
   r.id===382?"ORIGINAL_THREE_PHOTOS_HTTP404_AND_ARCHIVE_NOT_PROVEN":
   "RECHECK_SOURCE_ORIGINAL_DAY_AND_MEDIA"}));
 const summary={cohort:27,
  provenPublished:rows.filter(r=>r.status==="SOURCE_IDENTIFIED_PUBLISHED").length,
  slugNotProven:rows.filter(r=>r.status==="SLUG_COLLISION_NEEDS_SOURCE_PROOF").length,
  notPublished:rows.filter(r=>r.status==="NOT_PUBLISHED").length,
  outstandingSourceIds:rows.filter(r=>r.status!=="SOURCE_IDENTIFIED_PUBLISHED").map(r=>r.id),
  sourcesByFamily: Object.fromEntries(Object.keys(expected).map(f=>[f,{count:rows.filter(r=>r.family===f).length,
   provenPublished:rows.filter(r=>r.family===f&&r.status==="SOURCE_IDENTIFIED_PUBLISHED").length}])),
  readOnly:true,noCmsWrites:true};
 console.log("PSE_HISTORICAL_27_LIVE_DELTA_SUMMARY="+JSON.stringify(summary));
 for(const row of rows.filter(r=>r.status!=="SOURCE_IDENTIFIED_PUBLISHED"))
  console.log("PSE_HISTORICAL_27_UNRESOLVED_ROW="+JSON.stringify(row));
 await mkdir("artifacts/pse-historical-27-live",{recursive:true});
 await writeFile("artifacts/pse-historical-27-live/report.json",JSON.stringify({schema:"pse-historical-27-source-identity-live-v1",summary,rows},null,2)+"\n");
}finally{await net.dispose()}
