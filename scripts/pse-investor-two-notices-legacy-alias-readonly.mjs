/** Read-only original Joomla #338/#1085 route -> published native Post canonical audit. */
import {request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const marker="audit(pse): original two shareholder notices public aliases";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||evt.head_commit?.message!==marker)
 throw Error("Unapproved investor original old-link read-only audit");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const ids=[338,1085];
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Source legacy state changed");
const e=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function origin(k){const a=e.filter(x=>x.startsWith(k+"="));if(a.length!==1)throw Error("Missing "+k);
 const u=new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))
 throw Error("Invalid origin "+k);return u.origin}
const front=origin("WC_URL_CLIENT"),wp=origin("WC_URL");
if(front===wp)throw Error("Public CMS host overlap");
const net=await request.newContext({timeout:40000});
const report={schema:"pse-two-original-shareholder-joomla-route-audit-v1",readOnly:true,noCmsWrites:true,noBuild:true,rows:[]};
try{
 for(const id of ids){
  const source=state.articles[id]?.source_url||"",u=new URL(source);
  if(u.protocol!=="https:"||u.hostname!=="www.pse.vn"||
    !new RegExp("/"+id+"-[a-z0-9-]+\\.html$","i").test(u.pathname))
    throw Error("Joomla source owner changed "+id);
  const slug=u.pathname.split("/").at(-1).replace(new RegExp("^"+id+"-"),"").replace(/\.html$/i,"");
  const target="/"+slug;
  const registry=await net.get(wp+"/wp-json/wp/v2/posts?status=publish&slug="+slug+
   "&per_page=10&_fields=id,slug,acf,date,status",{failOnStatusCode:false});
  if(registry.status()!==200)throw Error("Native WP investor Post registry unavailable "+id);
  const posts=await registry.json();
  const sources=posts.filter(p=>p.status==="publish"&&
    String(p.acf?.origin_page_id||"")===String(id));
  if(sources.length!==1)throw Error("Native investor original Post does not own source "+id);
  const expectedDay=id===338?"2013-02-28":"2015-03-04";
  if(sources[0].date?.slice(0,10)!==expectedDay)throw Error("Native investor original date mismatch "+id);
  const rows=[];
  for(const path of [u.pathname,target]){
   const r=await net.get(front+path,{maxRedirects:0,timeout:45000,failOnStatusCode:false});
   const body=r.status()===200?await r.text():"";
   const m=body.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||
    body.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i);
   rows.push({path,http:r.status(),location:r.headers().location||null,canonical:m?.[1]||null});
  }
  const [old,now]=rows;
  const canonical=now.canonical?new URL(now.canonical,front):null;
  if(now.http!==200||!canonical||canonical.origin!==front||
   canonical.pathname!==target||canonical.search||canonical.hash)
   throw Error("Investor public Post not ready for old redirect "+id);
  const destination=old.location?new URL(old.location,front):null;
  const correct=old.http===301&&destination?.origin===front&&
   destination.pathname===target&&!destination.search&&!destination.hash;
  const decision=correct?"SOURCE_ORIGINAL_301_ALREADY_PASS":
   old.http===404?"SOURCE_ORIGINAL_EXACT_NATIVE_REDIRECT_REQUIRED":"SOURCE_OLD_URL_CONFLICT_REVIEW";
  const row={sourceId:id,wpId:sources[0].id,originalPath:u.pathname,target,correct301:correct,decision,rows};
  report.rows.push(row);
  console.log("PSE_INVESTOR_OLD_URL_ROW="+JSON.stringify(row));
 }
 report.summary={sourcePostCount:2,old301Pass:report.rows.filter(r=>r.correct301).map(r=>r.sourceId),
  exact301Needed:report.rows.filter(r=>r.decision==="SOURCE_ORIGINAL_EXACT_NATIVE_REDIRECT_REQUIRED").map(r=>r.sourceId),
  conflicts:report.rows.filter(r=>r.decision==="SOURCE_OLD_URL_CONFLICT_REVIEW").map(r=>r.sourceId),
  bothPublicCanonical200:true,readOnly:true,noCmsWrites:true};
 console.log("PSE_INVESTOR_OLD_URL_SUMMARY="+JSON.stringify(report.summary));
 if(report.summary.conflicts.length)throw Error("Unexpected existing original Joomla shareholder URL route");
}finally{
 await mkdir("artifacts/pse-original-investor-old-links",{recursive:true});
 await writeFile("artifacts/pse-original-investor-old-links/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();
}
