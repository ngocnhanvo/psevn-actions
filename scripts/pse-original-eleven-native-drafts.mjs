/** Owner-provided original Joomla SQL -> WordPress native quarantined drafts.
 * Strict read-only preflight unless signed --apply + fresh Updraft backup.
 * Never publish, redirect, upload images, change Astro/PHP or touch unrelated Posts.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const apply=process.argv.includes("--apply");
const repo=process.env.GITHUB_REPOSITORY;
const reportDir="artifacts/pse-original-eleven-native-drafts";
await mkdir(reportDir,{recursive:true});
const ids=[114,121,127,178,186,196,202,237,341,382,1090];
const signedMessage="cms(pse): stage eleven source-authenticated Joomla posts as private drafts";
if(repo!=="ngocnhanvo/psevn-actions")throw Error("Wrong repository");
if(apply){
 const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
 if(process.env.GITHUB_REF!=="refs/heads/main"||
    ev.head_commit?.message!==signedMessage||
    process.env.PSE_ELEVEN_FRESH_BACKUP_VERIFIED!=="yes")throw Error("No authenticated writer lease or rollback");
}
const data=JSON.parse(await readFile("docs/source/pse-original-public-articles-11-2026-11-22.json","utf8"));
if(data.schema!=="pse-original-joomla-selected-public-articles-v1"||
   JSON.stringify(data.source_ids)!==JSON.stringify(ids)||
   !data.release_blocked||data.entries.length!==11)throw Error("Public-only original DB source identity changed");
const source=new Map(data.entries.map(x=>[x.source_id,x]));
if(source.size!==11)throw Error("Source ID duplicates");
const cats={
 75:{parent:"kien-thuc-nong-nghiep",child:"huong-dan-su-dung-phan-bon"},
 101:{parent:"tin-cong-ty",child:"tin-tong-hop"},
 93:{parent:"hoat-dong-kinh-doanh",child:"thong-tin-thi-truong"}
};
const hash=s=>createHash("sha256").update(String(s)).digest("hex");
const htmlText=async(page,html)=>page.evaluate(html=>{
 const d=document.createElement("div");d.innerHTML=html;
 for(const el of [...d.querySelectorAll("script,style,iframe,object,embed")])el.remove();
 return String(d.textContent||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
},html);
const safeHtml=html=>!/<\s*(?:script|iframe|object|embed|form)\b|(?:\son\w+\s*=)|javascript\s*:/i.test(html);
const opts=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const findEnv=n=>{
 const v=opts.filter(x=>x.startsWith(n+"="));
 if(v.length!==1)throw Error("Missing "+n);
 const u=new URL(v[0].slice(n.length+1).replace(/^["']|["']$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unsafe WP host");
 return u.origin;
};
const wp=findEnv("WC_URL");
if(wp!=="https://admin-pse.webnvn.com")throw Error("WordPress target mismatch");
const front=findEnv("WC_URL_CLIENT");
if(front!=="https://pse.webnvn.com")throw Error("Frontend target mismatch");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:860}});
const page=await ctx.newPage();
const report={schema:"pse-original-eleven-native-drafts-v1",target:wp,readOnly:!apply,
 sourceFile:"owner-provided Joomla DB public-article selection",scopedIds:ids,
 status:"NOT_TESTED",preflight:[],created:[],existingVerified:[],blocked:[],wpWrites:0,mediaWrites:0,published:0,redirects:0};
const save=async()=>writeFile(reportDir+"/report.json",JSON.stringify(report,null,2)+"\n");
try{
 const start=await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(!start||start.status()>=500)throw Error("WP admin unavailable");
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=(await page.locator("#loginform").innerText()).slice(0,850);
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],value=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("Unsupported WP challenge");
   await field.fill(String(value));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())throw Error("WP Admin authentication unavailable");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce unavailable");
  return(await r.text()).trim();
 });
 if(!/^[a-zA-Z0-9]{8,24}$/.test(nonce))throw Error("Invalid REST nonce");
 const api=async(path,method="GET",payload)=>page.evaluate(async({path,method,payload,nonce})=>{
  const res=await fetch(path,{method,credentials:"same-origin",
   headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(payload?{"Content-Type":"application/json"}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})});
  return {http:res.status,data:await res.json().catch(()=>null)};
 },{path,method,payload,nonce});
 const categories={};
 for(const [id,map] of Object.entries(cats)){
  const [p,c]=await Promise.all(["parent","child"].map(typ=>api("/wp-json/wp/v2/categories?slug="+encodeURIComponent(map[typ])+"&hide_empty=false&_fields=id,slug,parent")));
  if(p.http!==200||c.http!==200||p.data?.length!==1||c.data?.length!==1||
    !Number.isSafeInteger(p.data[0].id)||c.data[0].parent!==p.data[0].id)
    throw Error("Native category taxonomy mismatch "+id);
  categories[id]=[p.data[0].id,c.data[0].id];
 }
 const reference=await api("/wp-json/wp/v2/posts/82119?context=edit&_fields=id,status,acf");
 if(reference.http!==200||reference.data?.id!==82119||reference.data?.status!=="publish"||
    reference.data?.acf?.action!=="PostDetails"||reference.data?.acf?.key!=="ssr-post")
    throw Error("Native Post ACF reference mismatch");
 for(const id of ids){
  const x=source.get(id),html=String(x.intro_html||"")+String(x.body_html||"");
  if(!x||x.state_joomla!==1||x.publication_status!=="QUARANTINED_NEEDS_MEDIA_PROOF"||
     x.category_id!==([114,121,127,178].includes(id)?75:id===341?93:101)||
     !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(x.created_at_joomla)||
     x.publish_up_joomla!==x.created_at_joomla||
     typeof x.title!=="string"||x.title.length<12||
     typeof x.slug!=="string"||!x.slug.match(/^[a-z0-9-]{10,160}$/)||
     html.length<300||html.length>100000||!safeHtml(html)||
     x.inline_image_src.length<1)throw Error("Owner DB source content unsafe "+id);
  const native=await api("/wp-json/wp/v2/posts?context=edit&status=any&slug="+encodeURIComponent(x.slug)+
    "&per_page=20&_fields=id,slug,status,title,content,categories,acf,date");
  if(native.http!==200||!Array.isArray(native.data)||native.data.length>1)throw Error("Slug lookup conflict "+id);
  const existing=native.data[0]||null;
  // Never overwrite an existing public Post or duplicate unknown native content.
  if(existing&&existing.status!=="draft")throw Error("Existing published Post conflicts "+id);
  const bodyText=await htmlText(page,html);
  if(bodyText.length<110)throw Error("Original article body unexpectedly empty "+id);
  let unchanged=false;
  if(existing){
   const other=await htmlText(page,String(existing.content?.raw||""));
   unchanged=other===bodyText&&String(existing.title?.raw||"").trim()===x.title.trim()&&
    JSON.stringify((existing.categories||[]).sort((a,b)=>a-b))===
      JSON.stringify(categories[x.category_id].slice().sort((a,b)=>a-b))&&
    existing.date===x.created_at_joomla.replace(" ","T")&&
    existing.acf?.action==="PostDetails"&&existing.acf?.key==="ssr-post";
   if(!unchanged)throw Error("Existing draft cannot be adopted without provenance proof "+id);
   report.existingVerified.push({sourceId:id,wpId:existing.id});
  }
  report.preflight.push({sourceId:id,slug:x.slug,categoryIds:categories[x.category_id],
    originalTextChars:bodyText.length,bodySha256:hash(bodyText),
    mandatoryMediaCount:x.inline_image_src.length,alreadyDraft:!!existing,verifiedSame:unchanged});
 }
 report.status="PREFLIGHT_PASS";
 await save();
 console.log("PSE_SQL_ELEVEN_DRAFT_PREFLIGHT="+JSON.stringify({
  count:report.preflight.length,alreadyDraft:report.existingVerified.length,
  newDraftsExpected:11-report.existingVerified.length,categoryMap:categories,
  noOriginalMediaProven:true,readOnly:!apply,backup:apply
 }));
 if(!apply)process.exitCode=0;
 else{
  for(const row of report.preflight){
   const src=source.get(row.sourceId);
   if(row.alreadyDraft)continue;
   const html=src.intro_html+src.body_html;
   const payload={status:"draft",slug:src.slug,title:src.title,content:html,
     date:src.created_at_joomla.replace(" ","T"),
     categories:row.categoryIds,acf:{action:"PostDetails",key:"ssr-post"}};
   const made=await api("/wp-json/wp/v2/posts","POST",payload);
   if(made.http!==201||!Number.isSafeInteger(made.data?.id))throw Error("Draft creation failed id "+row.sourceId+" HTTP "+made.http);
   report.wpWrites++;report.created.push({sourceId:row.sourceId,wpId:made.data.id});
   await save();
   const id=made.data.id,check=await api("/wp-json/wp/v2/posts/"+id+"?context=edit&_fields=id,slug,status,title,content,date,acf,categories");
   const expectedText=await htmlText(page,html);
   const savedText=await htmlText(page,String(check.data?.content?.raw||""));
   if(check.http!==200||check.data?.id!==id||check.data.slug!==src.slug||
      check.data.status!=="draft"||
      String(check.data.title?.raw||"").trim()!==src.title.trim()||
      savedText!==expectedText||
      check.data.date!==src.created_at_joomla.replace(" ","T")||
      check.data.acf?.action!=="PostDetails"||check.data.acf?.key!=="ssr-post"||
      JSON.stringify((check.data.categories||[]).sort((a,b)=>a-b))!==
        JSON.stringify(row.categoryIds.slice().sort((a,b)=>a-b)))
      throw Error("Native draft read-back failed "+row.sourceId+" WP "+id);
  }
  report.status="DRAFTS_ONLY_PASS";
  await save();
  console.log("PSE_SQL_ELEVEN_DRAFTS_PASS="+JSON.stringify({
   created:report.created,existingVerified:report.existingVerified,
   originalSourceIds:ids,allPrivate:true,published:0,redirects:0,mediaWrites:0,
   noProductionBuild:true,freshBackup:true
  }));
 }
}catch(e){
 report.status="FAILED";report.blocked.push({errorType:e.constructor?.name||"Error",errorMessage:String(e.message||"").slice(0,160)});
 await save();throw e;
}finally{await ctx.close();await browser.close()}
