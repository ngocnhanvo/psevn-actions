/** Source Joomla #344/#348/#370 old path -> exact native published Post canonical, GET only. */
import {request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const marker="audit(pse): three original agriculture Joomla URL canonical aliases";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||ev.head_commit?.message!==marker)
 throw Error("Unapproved original agriculture old alias audit");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Original source provenance changed");
const info=[{id:344,wpId:83483,day:"2013-03-14"},{id:348,wpId:83486,day:"2013-03-18"},{id:370,wpId:83489,day:"2013-06-17"}];
const config=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const site=k=>{const x=config.filter(s=>s.startsWith(k+"="));if(x.length!==1)throw Error("Missing "+k);
 const u=new URL(x[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))
 throw Error("Untrusted "+k);return u.origin;};
const front=site("WC_URL_CLIENT"),cms=site("WC_URL");if(front===cms)throw Error("CMS/frontend overlap");
const net=await request.newContext({timeout:45000});
const report={schema:"pse-three-source-agriculture-old-route-v1",readOnly:true,rows:[],noCmsWrites:true,noBuild:true};
const get=async url=>{
 for(let i=1;i<=3;i++){
  try{const r=await net.get(url,{timeout:45000,maxRedirects:0,failOnStatusCode:false});
   if(r.status()<500||i===3)return r;
  }catch(e){if(i===3||!/ECONNRESET|ETIMEDOUT|Timeout|socket hang up/i.test(String(e?.message||e)))throw e}
  await new Promise(done=>setTimeout(done,900*i));
 }
 throw Error("Read-only public original route exhausted");
};
try{
 for(const def of info){
  const old=state.articles?.[def.id]?.source_url||"",u=new URL(old);
  if(u.protocol!=="https:"||u.hostname!=="www.pse.vn"||
   !u.pathname.startsWith("/hoat-dong-kinh-doanh/kien-thuc-nong-nghiep/"+def.id+"-")||
   u.search||u.hash||!u.pathname.endsWith(".html"))
   throw Error("Original Joomla agriculture source identity changed "+def.id);
  const slug=u.pathname.split("/").at(-1).replace(new RegExp("^"+def.id+"-"),"").replace(/\.html$/,"");
  const target="/"+slug;
  const [api,oldR,newR]=await Promise.all([
   get(cms+"/wp-json/wp/v2/posts?slug="+encodeURIComponent(slug)+"&per_page=5&_fields=id,slug,status,date,acf,categories"),
   get(front+u.pathname),get(front+target)
  ]);
  if(api.status()!==200||newR.status()!==200)throw Error("Published native source Post unavailable "+def.id);
  const posts=await api.json();
  if(posts.length!==1||posts[0].id!==def.wpId||posts[0].status!=="publish"||
   posts[0].date?.slice(0,10)!==def.day||String(posts[0].acf?.origin_page_id||"")!==String(def.id)||
   !posts[0].categories?.includes(1755))throw Error("Source agriculture canonical owner mismatch "+def.id);
  const html=await newR.text();
  const c=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||
   html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i);
  const canonical=c?.[1]?new URL(c[1],front):null;
  if(!canonical||canonical.origin!==front||canonical.pathname!==target||canonical.search||canonical.hash)
   throw Error("Original agriculture public canonical mismatch "+def.id);
  const loc=oldR.headers().location?new URL(oldR.headers().location,front):null;
  const exact301=oldR.status()===301&&loc?.origin===front&&loc.pathname===target&&!loc.search&&!loc.hash;
  const decision=exact301?"SOURCE_301_ALREADY_PASS":
   oldR.status()===404?"SOURCE_EXACT_NATIVE_301_REQUIRED":"SOURCE_URL_CONFLICT";
  const row={sourceId:def.id,wpId:def.wpId,from:u.pathname,to:target,
   oldHttp:oldR.status(),redirectLocation:oldR.headers().location||null,
   newHttp:newR.status(),newCanonical:canonical.href,exact301,decision};
  report.rows.push(row);
  console.log("PSE_THREE_AGRICULTURE_OLD_ROUTE_ROW="+JSON.stringify(row));
 }
 report.summary={sourceIds:info.map(x=>x.id),nativePublished:3,
  exact301Pass:report.rows.filter(x=>x.exact301).map(x=>x.sourceId),
  needsNative301:report.rows.filter(x=>x.decision==="SOURCE_EXACT_NATIVE_301_REQUIRED").map(x=>x.sourceId),
  conflicts:report.rows.filter(x=>x.decision==="SOURCE_URL_CONFLICT").map(x=>x.sourceId),
  readOnly:true,noCMSWrites:true};
 console.log("PSE_THREE_AGRICULTURE_OLD_ROUTE_SUMMARY="+JSON.stringify(report.summary));
 if(report.summary.conflicts.length)throw Error("Unexpected original agriculture public URL collision");
}finally{
 await mkdir("artifacts/pse-three-agriculture-old-routes",{recursive:true});
 await writeFile("artifacts/pse-three-agriculture-old-routes/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();
}
