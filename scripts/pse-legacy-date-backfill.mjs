/** Dedicated date-only worker for PSE Joomla articles already linked to WordPress.
 * Never changes the import checkpoint, title, body, category, SEO or any published date.
 * Uses its own GitHub Contents SHA checkpoint and an independent Actions concurrency lock.
 */
import {chromium} from "playwright";
import {searchDate} from "./pse-legacy-search-date.mjs";
import {readFile} from "node:fs/promises";
const MIGRATION="docs/pse-legacy-migration-state.json";
const DATE_STATE="docs/pse-legacy-date-backfill-state.json";
const migration=JSON.parse(await readFile(MIGRATION,"utf8"));
const progress=JSON.parse(await readFile(DATE_STATE,"utf8"));
if(migration.schema!=="pse-legacy-article-migration-v1"||migration.tracker_issue!==3||
 progress.schema!=="pse-legacy-date-backfill-v1"||!migration.backup_verified)
 throw Error("Unexpected migration scope or missing verified backup");
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||!process.env.GITHUB_TOKEN)
 throw Error("Wrong GitHub worker context");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const wc=env.filter(x=>x.startsWith("WC_URL="));
if(wc.length!==1)throw Error("Missing WC_URL");
const url=new URL(wc[0].slice(7).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))
 throw Error("Invalid WordPress origin");
const wp=url.origin;
const eligible=Object.entries(migration.articles).filter(([id,r])=>{
 const p=progress.records[id];
 return r.status==="draft_needs_date"&&!r.verified_date&&Number.isSafeInteger(Number(r.wp_id))&&
 Number(r.wp_id)>0&&p?.wp_id!==Number(r.wp_id)||
 r.status==="draft_needs_date"&&!r.verified_date&&Number.isSafeInteger(Number(r.wp_id))&&
 Number(r.wp_id)>0&&(!p||(!["published_preserved","source_day_applied","review"].includes(p.status)&&
 (p.attempts||0)<2));
}).map(([id])=>id).sort((a,b)=>Number(b)-Number(a));
const MAX_ITEMS=8,MAX_MS=10*60*1000,started=Date.now();
const items=eligible.slice(0,MAX_ITEMS);
console.log("PSE_DATE_QUEUE; eligible="+eligible.length+"; selected="+items.length+
 "; import_state_read_only=true; independent_writer=true");
if(!items.length)process.exit(0);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const admin=await context.newPage();
const statuses={published_preserved:0,source_day_applied:0,unverified:0,review:0};
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WP Admin credentials");
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await admin.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
   text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=Number(m[1]),b=Number(m[3]);
   const result=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("Login arithmetic field unavailable");
   await input.fill(String(result));
  }
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("WP Admin login failed");
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP REST nonce unavailable");
  return (await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid REST nonce");
 const api=async(path,method="GET",data)=>admin.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "Accept":"application/json","X-WP-Nonce":nonce,...(data?{"Content-Type":"application/json"}:{})
  },...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 const table=await api("/wp-json/tablepress/v1/table/pse_01_vi");
 const groups=["company","agriculture-market","shareholder"];
 if(table.status!==200||table.data?.items?.length!==groups.length)
  throw Error("Verified PSE category table unavailable");
 const cats={};
 for(const [i,group] of groups.entries()){
  const row=table.data.items[i],catId=Number(row?.categoryId),slug=String(row?.categorySlug||"").trim();
  if(!slug||!Number.isSafeInteger(catId)||catId<=0)throw Error("Invalid news category mapping");
  const verify=await api("/wp-json/wp/v2/categories?slug="+encodeURIComponent(slug)+"&_fields=id,slug");
  if(verify.status!==200||verify.data?.length!==1||verify.data[0].id!==catId)
   throw Error("News category slug lookup mismatch");
  cats[group]=catId;
 }
 for(const id of items){
  if(Date.now()-started>MAX_MS){console.log("PSE_DATE_TIME_BUDGET=STOP; remaining_queued=true");break}
  const article=migration.articles[id],wpId=Number(article.wp_id),prior=progress.records[id];
  const record={wp_id:wpId,attempts:(prior?.wp_id===wpId?prior.attempts||0:0),status:"retry"};
  progress.records[id]=record;
  try{
   const origin=new URL(article.source_url);
   const slug=origin.pathname.match(/\/(\d{3,6})-([^/]+)\.html$/i);
   if(!slug||Number(slug[1])!==Number(id)||origin.protocol!=="https:"||
     !["pse.vn","www.pse.vn"].includes(origin.hostname))
    throw Error("Untrusted legacy source identity");
   const expectedSlug=slug[2].toLowerCase(),catId=cats[article.group_hint];
   if(!Number.isSafeInteger(catId))throw Error("Unknown legacy category");
   const path="/wp-json/wp/v2/posts/"+wpId+"?context=edit&_fields=id,slug,status,title,date,categories";
   const read=()=>api(path);
   const verifyIdentity=r=>r.status===200&&r.data?.id===wpId&&
     r.data.slug===expectedSlug&&r.data.categories?.includes(catId)&&
     Boolean(String(r.data.title?.raw||"").trim());
   const existing=await read();
   if(!verifyIdentity(existing))throw Error("WordPress ID/slug/category/title verification failed");
   if(existing.data.status==="publish"){
    // Owner-edited publication timestamps must be preserved verbatim.
    if(!existing.data.date)throw Error("Published post has no readable date");
    record.status="published_preserved";record.attempts=0;
    console.log("PSE_DATE=SKIP_PUBLISHED; source_id="+id+"; wp_id="+wpId+"; date_unchanged=true");
    statuses.published_preserved++;continue;
   }
   if(existing.data.status!=="draft")throw Error("WordPress post is not a draft");
   const sourcePage=await context.newPage();
   let found;
   try{
    const response=await sourcePage.goto(article.source_url,{waitUntil:"domcontentloaded",timeout:45000});
    if(response?.status()!==200)throw Error("Joomla source not accessible: HTTP "+response?.status());
    const source=await sourcePage.evaluate(()=>({
     title:(document.title||"").replace(/\s+-\s+PSE\.VN\s*$/i,"").trim(),
     opening:(document.querySelector('[itemprop="articleBody"]')?.textContent||"").replace(/\s+/g," ").trim().slice(0,300)
    }));
    if(source.title!==String(existing.data.title?.raw||"").trim()||source.opening.length<70)
     throw Error("Joomla title/opening does not match WordPress");
    found=await searchDate(sourcePage,{
     id:Number(id),sourceUrl:article.source_url,title:source.title,opening:source.opening
    });
   }finally{await sourcePage.close()}
   record.attempts++;
   if(!found.day){
    record.status=record.attempts>=2?"review":"unverified";
    record.reason="No exact Joomla ID/title created day evidence";
    statuses[record.status==="review"?"review":"unverified"]++;
    console.log("PSE_DATE=UNVERIFIED; source_id="+id+"; no_wp_write=true");
    continue;
   }
   const before=await read();
   if(!verifyIdentity(before))throw Error("WordPress identity changed before publication");
   if(before.data.status==="publish"){
    record.status="published_preserved";record.attempts=0;
    console.log("PSE_DATE=SKIP_MANUAL_UPDATE; source_id="+id+"; wp_id="+wpId);
    statuses.published_preserved++;continue;
   }
   if(before.data.status!=="draft")throw Error("WordPress status changed; no write");
   // Joomla com_search exposes CREATED DAY ONLY, not an exact publication time.
   const normalized=found.day+"T00:00:00";
   // Single REST write after a fresh read, minimizing races with manual editing.
   const saved=await api("/wp-json/wp/v2/posts/"+wpId,"POST",{date:normalized,status:"publish"});
   if(saved.status!==200||saved.data?.status!=="publish"||saved.data?.date!==normalized)
    throw Error("WordPress date publish rejected or unexpected timestamp");
   const check=await read();
   if(!verifyIdentity(check)||check.data.status!=="publish"||check.data.date!==normalized)
    throw Error("WordPress publication verification failed");
   record.status="source_day_applied";record.source_created_day=found.day;
   record.date_precision="day";record.date_source="joomla_com_search_created";
   delete record.reason;
   statuses.source_day_applied++;
   console.log("PSE_DATE=APPLIED; source_id="+id+"; wp_id="+wpId+
    "; source_created_day="+found.day+"; source_date_precision=day");
  }catch(e){
   record.attempts++;
   record.status=record.attempts>=2?"review":"retry";
   record.reason=String(e instanceof Error?e.message:e).slice(0,160);
   statuses.review+=(record.status==="review"?1:0);
   console.log("PSE_DATE=RETRY_OR_REVIEW; source_id="+id+"; reason="+record.reason);
  }
 }
}finally{
 await browser.close();
 // Own checkpoint file only: never change importer source/state or Astro.
 progress.runs=(progress.runs||0)+1;
 progress.last_migration_batch_observed=migration.runs;
 const file="docs/pse-legacy-date-backfill-state.json",repo=process.env.GITHUB_REPOSITORY;
 const headers={Authorization:"Bearer "+process.env.GITHUB_TOKEN,
  Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
 const url="https://api.github.com/repos/"+repo+"/contents/"+file;
 const before=await fetch(url+"?ref=main",{headers});
 if(!before.ok)throw Error("Cannot read date checkpoint version "+before.status);
 const remote=await before.json(),base=JSON.parse(Buffer.from(remote.content.replace(/\s/g,""),"base64").toString("utf8"));
 if(base.schema!==progress.schema||base.runs>=progress.runs)throw Error("Date checkpoint SHA lease mismatch");
 const payload=Buffer.from(JSON.stringify(progress,null,2)+"\n").toString("base64");
 const update=await fetch(url,{method:"PUT",headers:{...headers,"Content-Type":"application/json"},
  body:JSON.stringify({message:"chore(pse): checkpoint independent publication date backfill",
   branch:"main",sha:remote.sha,content:payload})});
 if(!update.ok)throw Error("Cannot save independent date checkpoint "+update.status);
 console.log("PSE_DATE_CHECKPOINT=PASS; run="+progress.runs+"; "+
  JSON.stringify(statuses)+"; wordpress_dates_preserved=true; astro_build=false");
}
