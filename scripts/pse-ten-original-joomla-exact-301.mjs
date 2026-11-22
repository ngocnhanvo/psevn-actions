/** One-claim Joomla 10 historic article exact 301s to native published WordPress Posts.
 * Keep third-party img src in CMS untouched per owner's explicit preference.
 * WordPress native chuyen-huong-link is the ONLY writer target.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const message="cms(pse): route ten original Joomla articles to published WordPress Posts";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 event.head_commit?.message!==message||process.env.PSE_TEN_REDIRECTS_BACKUP_READY!=="yes")
 throw Error("Unauthorized exact Joomla source redirect writer");
const original=JSON.parse(await readFile("docs/source/pse-original-public-articles-11-2026-11-22.json","utf8"));
const oldState=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const ids=[114,121,127,178,186,196,202,237,341,1090];
const wpIds=[83534,83535,83536,83537,83538,83539,83540,83541,83542,83544];
if(original.schema!=="pse-original-joomla-selected-public-articles-v1"||
 original.entries?.length!==11||oldState.schema!=="pse-legacy-article-migration-v1")
 throw Error("Original Joomla public sources unexpectedly changed");
const rows=ids.map((id,i)=>{
 const x=original.entries.find(r=>r.source_id===id),legacy=oldState.articles?.[id];
 if(!x||!legacy||legacy.status!=="quarantined"||x.state_joomla!==1||
    x.publication_status!=="QUARANTINED_NEEDS_MEDIA_PROOF"||
    !Number.isSafeInteger(wpIds[i]))throw Error("Unexpected Joomla identity "+id);
 const u=new URL(legacy.source_url);
 if(u.protocol!=="https:"||!["www.pse.vn","pse.vn"].includes(u.hostname)||
  !u.pathname.endsWith("/"+id+"-"+x.slug+".html")||u.search||u.hash||
  !/^\/(?:hoat-dong-kinh-doanh|tin-tuc-su-kien)\//.test(u.pathname))
  throw Error("Original Joomla legacy canonical URL not verified "+id);
 return{id,postId:wpIds[i],slug:x.slug,title:x.title.trim(),source:x,oldPath:u.pathname,target:"/"+x.slug};
});
if(new Set(rows.map(x=>x.oldPath)).size!==10||
 new Set(rows.map(x=>x.target)).size!==10)
 throw Error("Duplicate Joomla legacy or WordPress canonical paths");
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(v=>v.trim().replace(/^export\s+/,""));
const env=n=>{
 const rows=vars.filter(v=>v.startsWith(n+"="));if(rows.length!==1)throw Error("Scoped WordPress origin missing");
 return rows[0].slice(n.length+1).replace(/^['"]|['"]$/g,"").replace(/\/$/,"");
};
const wp=env("WC_URL"),site=env("WC_URL_CLIENT");
if(wp!=="https://admin-pse.webnvn.com"||site!=="https://pse.webnvn.com")
 throw Error("Wrong CMS/frontend origin");
const dir="artifacts/pse-original-ten-external-article-301s";
await mkdir(dir,{recursive:true});
const report={schema:"pse-ten-original-third-party-source-post-301-v1",
 sourceIds:ids,wpPostIds:wpIds,ownerExternalImagePolicy:"Preserve original 56 external URL occurrences",
 externalImagesMayBeUnavailable:true,preflight:[],created:[],published:[],existing:[],
 redirectsPlanned:10,redirectsReadback:[],redirectWrites:0,postWrites:0,mediaWrites:0,
 freshBackup:true,requiresAstroBuild:true,result:"STARTED"};
const save=()=>writeFile(dir+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:860}});
const page=await ctx.newPage(),net=await request.newContext({timeout:40000});
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const log=(await page.locator("#loginform").innerText()).slice(0,850);
  const m=log.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Unrecognized native WP auth math input");
   await f.fill(String(v));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())
  throw Error("Native WP auth expired");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce fetch failed");
  return(await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Unexpected REST nonce");
 const api=async(path,method="GET",data)=>page.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,Accept:"application/json",...(data?{"Content-Type":"application/json"}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {http:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||0),
   data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 const endpoint="/wp-json/wp/v2/chuyen-huong-link";
 // Registry preflight. Check every page, not only latest 100 rules.
 const registry=[];
 for(let n=1;n<=25;n++){
  const r=await api(endpoint+"?context=edit&status=any&per_page=100&page="+n+
    "&_fields=id,status,acf,route_priority,route_conditions");
  if(r.http!==200||!Array.isArray(r.data)||r.pages>25||r.pages<1)
   throw Error("Original WordPress redirect registry incomplete");
  registry.push(...r.data);
  if(n>=r.pages)break;
 }
 const known=new Map();
 for(const row of rows){
  const post=await api("/wp-json/wp/v2/posts/"+row.postId+
   "?context=edit&_fields=id,slug,status,title,date,acf,content");
  const p=post.data||{},html=String(p.content?.raw||"");
  if(post.http!==200||p.id!==row.postId||p.slug!==row.slug||p.status!=="publish"||
     p.title?.raw!==row.title||p.date!==row.source.created_at_joomla.replace(" ","T")||
     p.acf?.action!=="PostDetails"||p.acf?.key!=="ssr-post"||
     row.source.inline_image_src.some(src=>!html.includes(src)))
   throw Error("Target article not exact published Joomla source "+row.id);
  const links=registry.filter(x=>x.acf?.from_link===row.oldPath);
  if(links.length>1)throw Error("Duplicate exact source redirects "+row.id);
  const existing=links[0];
  if(existing&&(
    existing.acf?.to_link!==row.target||
    String(existing.acf?.type)!=="301"||
    existing.acf?.match_type!=="Exact"||!existing.acf?.enable||
    !["draft","publish"].includes(existing.status)))
   throw Error("Conflicting existing Joomla redirect "+row.id);
  known.set(row.id,existing||null);
  let live=null;
  for(let retry=0;retry<3;retry++){
   try{
    live=await net.get(site+row.target,{failOnStatusCode:false,timeout:40000,maxRedirects:2});
    break;
   }catch(e){
    // Only retry temporary connection failures, never content mismatches or bad HTTP status.
    if(retry>=2||!/(ECONNRESET|ETIMEDOUT|ECONNABORTED|socket hang up)/i.test(String(e?.message||"")))throw e;
    console.log("PSE_ORIGINAL_ARTICLE_FRONT_NETWORK_RETRY="+JSON.stringify({sourceId:row.id,attempt:retry+1,kind:"transient_transport"}));
    await new Promise(resolve=>setTimeout(resolve,(retry+1)*1000));
   }
  }
  if(!live||live.status()!==200)throw Error("Published WordPress canonical route not ready "+row.id);
  const rendered=await live.text();
  const h1=(rendered.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
  if(!h1.includes(row.title.slice(0,20)))
   throw Error("Canonical 200 page shows wrong original Joomla article "+row.id);
  // The owner explicitly keeps media external; no image byte checks or local imports.
  const pre={sourceId:row.id,targetPostId:row.postId,targetHttp:200,
   path:row.oldPath,sourceImageOccurrences:row.source.inline_image_src.length,
   sourceExternalLinksUnchanged:true,existingRedirect:existing?.id||null};
  report.preflight.push(pre);console.log("PSE_TEN_JOOMLA_ALIAS_PREFLIGHT="+JSON.stringify(pre));
 }
 await save();
 for(const row of rows){
  let alias=known.get(row.id);
  if(!alias){
   const created=await api(endpoint,"POST",{
    title:"Original Joomla article "+row.id+" exact legacy URL",
    status:"draft",acf:{from_link:row.oldPath,to_link:row.target,
      type:301,match_type:"Exact",enable:true}
   });
   if(created.http!==201||!Number.isSafeInteger(created.data?.id))
    throw Error("Cannot create bounded native Joomla 301 "+row.id);
   alias=created.data;report.created.push({sourceId:row.id,redirectId:alias.id});
   report.redirectWrites++;await save();
  }else report.existing.push({sourceId:row.id,redirectId:alias.id});
  let check=await api(endpoint+"/"+alias.id+"?context=edit&_fields=id,status,acf");
  if(check.http!==200||check.data?.id!==alias.id||
     check.data.acf?.from_link!==row.oldPath||
     check.data.acf?.to_link!==row.target||
     String(check.data.acf?.type)!=="301"||
     check.data.acf?.match_type!=="Exact"||!check.data.acf?.enable)
   throw Error("Native original Joomla alias draft readback failed "+row.id);
  if(check.data.status==="draft"){
   const published=await api(endpoint+"/"+alias.id,"POST",{status:"publish"});
   if(published.http!==200||published.data?.id!==alias.id||published.data.status!=="publish")
    throw Error("Native original Joomla 301 publish failed "+row.id);
   report.redirectWrites++;await save();
  }
  check=await api(endpoint+"/"+alias.id+"?context=edit&_fields=id,status,acf");
  if(check.http!==200||check.data?.id!==alias.id||check.data.status!=="publish"||
     check.data.acf?.from_link!==row.oldPath||
     check.data.acf?.to_link!==row.target||
     String(check.data.acf?.type)!=="301"||
     check.data.acf?.match_type!=="Exact"||!check.data.acf?.enable)
   throw Error("Native published Joomla 301 readback failed "+row.id);
  const rec={sourceId:row.id,redirectId:alias.id,
    sourcePath:row.oldPath,targetPath:row.target,wpStatus:"publish"};
  report.redirectsReadback.push(rec);
  await save();console.log("PSE_TEN_JOOMLA_ALIAS_NATIVE_READBACK="+JSON.stringify(rec));
 }
 report.result="TEN_PUBLISHED_NATIVE_JOOMLA_EXACT_301_READY_FOR_ASTRO_BUILD";
 await save();console.log("PSE_TEN_JOOMLA_REDIRECTS_PASS="+JSON.stringify({
  verified:report.redirectsReadback.length,created:report.created.length,
  alreadyPresent:report.existing.length,wordpressStatusWrites:report.redirectWrites,
  wpPostWrites:0,wpMediaWrites:0,needsAstroProductionBuild:true}));
}catch(e){
 report.result="FAILED_OR_PARTIAL";report.errorType=e?.constructor?.name||"Error";
 await save();throw e;
}finally{
 await net.dispose();await ctx.close();await browser.close();
}
