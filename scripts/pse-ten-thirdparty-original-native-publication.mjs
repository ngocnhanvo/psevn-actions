/** Publish only ten Joomla-public source Posts, preserving all original external img src.
 * Explicit owner decision: third-party media is allowed to remain third-party.
 * Do NOT claim external sources are still reachable; no WP Media uploads or content rewrite.
 */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const repository="ngocnhanvo/psevn-actions";
const signed="cms(pse): publish ten original Joomla posts retaining external media URLs";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!==repository||process.env.GITHUB_REF!=="refs/heads/main"||
 event.head_commit?.message!==signed||process.env.PSE_EXTERNAL_MEDIA_BACKUP_READY!=="yes")
 throw Error("Signed authoring / rollback gate not met");
const source=JSON.parse(await readFile("docs/source/pse-original-public-articles-11-2026-11-22.json","utf8"));
const ids=[114,121,127,178,186,196,202,237,341,1090],wpIds=[83534,83535,83536,83537,83538,83539,83540,83541,83542,83544];
const fixtureIds=[114,121,127,178,186,196,202,237,341,382,1090];
if(source.schema!=="pse-original-joomla-selected-public-articles-v1"||
 JSON.stringify(source.source_ids)!==JSON.stringify(fixtureIds)||source.entries?.length!==11||
 !source.release_blocked)throw Error("Owner original public SQL fixture changed");
const allowed=new Set(["www.sieuthinongnghiep.com","www.spchcmc.com.vn",
 "dateh.lamdong.gov.vn","images.danviet.vn","library.petrotimes.vn",
 "baobinhphuoc.com.vn","dpm.vn","www.dpm.vn","baodientu.chinhphu.vn"]);
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(v=>v.trim().replace(/^export\s+/,""));
const getEnv=k=>{
 const a=vars.filter(x=>x.startsWith(k+"="));
 if(a.length!==1)throw Error("Missing scoped WordPress origin configuration");
 const v=a[0].slice(k.length+1).replace(/^['"]|['"]$/g,"").replace(/\/$/,"");
 const u=new URL(v);
 if(u.origin!==v||u.protocol!=="https:"||u.username||u.password||u.search||u.hash)
  throw Error("Noncanonical scoped WordPress origin");
 return v;
};
const wp=getEnv("WC_URL"),site=getEnv("WC_URL_CLIENT");
if(wp!=="https://admin-pse.webnvn.com"||site!=="https://pse.webnvn.com")
 throw Error("Unexpected PSE WordPress frontend target");
const rows=ids.map((id,i)=>({id,wpId:wpIds[i],source:source.entries.find(x=>x.source_id===id)}));
let mediaCount=0;
for(const row of rows){
 const x=row.source;
 if(!x||x.state_joomla!==1||x.publication_status!=="QUARANTINED_NEEDS_MEDIA_PROOF"||
  x.inline_image_src.length<1||x.inline_image_src.length>25||
  typeof x.intro_html!=="string"||typeof x.body_html!=="string"||
  !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(x.created_at_joomla)||
  !/^[a-z0-9-]+$/.test(x.slug)||x.slug.length<12||x.slug.length>180)
  throw Error("Joomla source item out of original scope "+row.id);
 const html=x.intro_html+x.body_html;
 if(/<\s*(script|iframe|object|embed|form)\b|\son\w+\s*=|javascript\s*:/i.test(html))
  throw Error("Unsafe original source body "+row.id);
 for(const url of x.inline_image_src){
  const parsed=new URL(url);
  if(!["http:","https:"].includes(parsed.protocol)||!allowed.has(parsed.hostname)||parsed.username||parsed.password||parsed.port||
     !/\.(?:jpe?g|png|gif|webp)$/i.test(parsed.pathname)||!html.includes(url))
   throw Error("External source URL identity mismatch for Joomla "+row.id);
  mediaCount++;
 }
}
if(mediaCount!==56)throw Error("Original 56 external image src occurrences changed");
const reportDir="artifacts/pse-original-ten-external-link-publication";
await mkdir(reportDir,{recursive:true});
const report={schema:"pse-external-source-media-retained-native-publication-v1",
 ownerDecision:"Preserve original third-party image URLs; WordPress Media upload not required",
 joomlaIds:ids,wpPostIds:wpIds,sourceImageOccurrences:56,
 externalMediaAvailabilityNotGuaranteed:true,mediaUploads:0,contentEdits:0,
 redirectWrites:0,freshUpdraft:true,publishedNow:[],alreadyPublished:[],
 preflight:[],readback:[],wpPostStatusWrites:0,result:"STARTED"};
const save=()=>writeFile(reportDir+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:860}});
const page=await context.newPage();
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const login=(await page.locator("#loginform").innerText()).slice(0,800);
  const m=login.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("WP auth challenge unsupported");
   await f.fill(String(v));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())
  throw Error("WordPress admin authenticated session absent");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce unavailable");
  return(await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("WP REST nonce invalid");
 const api=async(route,method="GET",data)=>page.evaluate(async({route,method,data,nonce})=>{
  const r=await fetch(route,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,Accept:"application/json",...(data?{"Content-Type":"application/json"}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {http:r.status,record:await r.json().catch(()=>null)};
 },{route,method,data,nonce});
 const before=new Map();
 // All-or-nothing preflight for identity and source URLs; no writes before this finishes.
 for(const row of rows){
  const x=row.source;
  const route="/wp-json/wp/v2/posts/"+row.wpId+"?context=edit&_fields=id,slug,status,date,title,categories,acf,content";
  const r=await api(route);const post=r.record||{},html=String(post.content?.raw||"");
  const expectedTitle=x.title.trimEnd();
  if(r.http!==200||post.id!==row.wpId||post.slug!==x.slug||
     !["draft","publish"].includes(post.status)||
     (row.id!==178?post.title?.raw!==x.title:post.title?.raw!==expectedTitle)||
     post.date!==x.created_at_joomla.replace(" ","T")||
     post.acf?.action!=="PostDetails"||post.acf?.key!=="ssr-post"||
     !Array.isArray(post.categories)||post.categories.length<1||
     x.inline_image_src.some(url=>!html.includes(url)))
   throw Error("Native WordPress source identity failed preflight "+row.id);
  const imageUrls=[...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
  if(imageUrls.length!==x.inline_image_src.length||
     imageUrls.some((v,i)=>v!==x.inline_image_src[i]))
   throw Error("Original third-party image src positions changed "+row.id);
  before.set(row.id,{html,source:x,postStatus:post.status,route});
  const record={sourceId:row.id,wpId:row.wpId,status:post.status,
   originalExternalImageOccurrences:imageUrls.length,thirdPartyUrlsPreserved:true,
   originalDatePreserved:true,noLocalMediaUpload:true};
  report.preflight.push(record);
  console.log("PSE_TEN_EXTERNAL_PREFLIGHT="+JSON.stringify(record));
 }
 await save();
 for(const row of rows){
  const original=before.get(row.id);
  if(original.postStatus==="draft"){
   const updated=await api("/wp-json/wp/v2/posts/"+row.wpId,"POST",{status:"publish"});
   if(updated.http!==200||updated.record?.id!==row.wpId||updated.record.status!=="publish")
    throw Error("Native Post status-only publish rejected "+row.id);
   report.wpPostStatusWrites++;
   report.publishedNow.push({sourceId:row.id,wpPostId:row.wpId});
   await save();
  }else report.alreadyPublished.push(row.id);
  const again=await api(original.route);
  const p=again.record||{},after=String(p.content?.raw||"");
  if(again.http!==200||p.id!==row.wpId||p.slug!==original.source.slug||
     p.status!=="publish"||after!==original.html||
     p.date!==original.source.created_at_joomla.replace(" ","T")||
     p.acf?.action!=="PostDetails"||p.acf?.key!=="ssr-post"||
     original.source.inline_image_src.some(url=>!after.includes(url)))
   throw Error("Native Post source hotlinks/status changed after publication "+row.id);
  report.readback.push({sourceId:row.id,status:"publish",unchangedOriginalExternalImages:original.source.inline_image_src.length,
   verifiedNoContentChange:true});
  await save();
  console.log("PSE_TEN_EXTERNAL_PUBLISH_READBACK="+JSON.stringify(report.readback.at(-1)));
 }
 report.result="TEN_ORIGINAL_JOOMLA_POSTS_PUBLISHED_WITH_EXACT_THIRD_PARTY_SRC";
 await save();console.log("PSE_TEN_EXTERNAL_PUBLICATION_PASS="+JSON.stringify({
  publishedNow:report.publishedNow.length,alreadyPublished:report.alreadyPublished.length,
  originalExternalImageOccurrences:56,contentEdits:0,mediaUploads:0,postStatusWrites:report.wpPostStatusWrites,
  redirectWrites:0,externalImageReachabilityNotGuaranteed:true}));
}catch(e){
 report.result="PARTIAL_OR_FAILED";report.errorType=e?.constructor?.name||"Error";
 await save();throw e;
}finally{
 await context.close();await browser.close();
}
