/**
 * Owner-approved native PSE WordPress restore: Joomla Tin tong hop #1743-1746.
 * Only these four native Posts and their exact-source 13 JPEGs can be created.
 * All originals must pass RSS ID/title/local-second/HTML/media checks before
 * any CMS write. No unrelated CMS object is mutated, and no Astro/FTP writes.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const file="docs/source/pse-tin-tong-hop-four-20261127.json";
const m=JSON.parse(await readFile(file,"utf8"));
const marker=(await readFile(".pse-tin-tong-hop-four-apply-request","utf8")).trim();
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const msg=String(event.head_commit?.message||"").split("\n")[0];
const ids=[1746,1745,1744,1743];
if(marker!=="APPLY=OWNER_APPROVED;SOURCE=JOOMLA_RSS_101;POSTS=1746,1745,1744,1743"||
 msg!=="cms(pse): publish exact four newest Joomla Tin tong hop native Posts"||
 process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 process.env.PSE_TTH_VERIFIED_DB_BACKUP!=="yes"||
 m.schema!=="pse-tin-tong-hop-4-source-rss-20261127-v1"||
 m.joomlaCategoryId!==101||m.wpCategoryId!==1746||m.parentWpCategoryId!==1742||
 m.timezone!=="Asia/Ho_Chi_Minh"||
 m.records?.length!==4||m.records.map(x=>x.joomlaId).join(",")!==ids.join(",")||
 m.records.reduce((n,r)=>n+r.images,0)!==13)
 throw Error("Unauthorized or unverified 4-Post Joomla source/CMS apply");
const env=Object.fromEntries(String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""))
 .filter(x=>/^(WC_URL|WC_URL_CLIENT)=/.test(x)).map(x=>{const i=x.indexOf("=");return[x.slice(0,i),x.slice(i+1).trim().replace(/^['"]|['"]$/g,"")]}));
const validOrigin=x=>{const u=new URL(x);if(u.protocol!=="https:"||!u.hostname||
 u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))
 throw Error("Invalid WP origin");return u.origin};
const wp=validOrigin(env.WC_URL),front=validOrigin(env.WC_URL_CLIENT);
if(wp!=="https://admin-pse.webnvn.com"||front!=="https://pse.webnvn.com"||
 !process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
 throw Error("Unexpected CMS/site tenant or missing authorized credentials");
const sha=x=>createHash("sha256").update(x).digest("hex");
const normalize=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim().toLocaleLowerCase("vi");
const browser=await chromium.launch({headless:true});
const adminCtx=await browser.newContext({viewport:{width:1366,height:860}});
const sourceCtx=await browser.newContext({javaScriptEnabled:false});
await sourceCtx.route("**/*",route=>route.abort());
const http=await request.newContext({timeout:60000});
const admin=await adminCtx.newPage();
let wpUpload=null,nonce="";
const report={schema:"pse-tth-4-exact-native-20261127",startedAt:new Date().toISOString(),
 joomlaIds:ids,wpCategory:1746,mode:"APPLY",phase:"SOURCE_PREFLIGHT",prepared:[],media:[],posts:[],status:"STARTED"};
const get=async(url)=>{
 let error="UNKNOWN";
 for(let attempt=1;attempt<=4;attempt++){
  try{
   const r=await http.get(url,{timeout:50000,failOnStatusCode:false});
   if(r.status()===200)return r;
   error="HTTP "+r.status();
   if(r.status()===404||r.status()===403)break;
  }catch(e){error=String(e?.message||e).slice(0,120)}
  if(attempt<4)await new Promise(done=>setTimeout(done,1000*attempt));
 }
 throw Error("SOURCE_HTTP_UNAVAILABLE "+new URL(url).hostname+" "+error);
};
const api=async(path,method="GET",data)=>admin.evaluate(async({path,method,data,nonce})=>{
 const res=await fetch(path,{method,credentials:"same-origin",cache:"no-store",headers:{
 "X-WP-Nonce":nonce,Accept:"application/json",...(data?{"Content-Type":"application/json"}:{})},
 ...(data?{body:JSON.stringify(data)}:{})});
 return {status:res.status,data:await res.json().catch(()=>null)};
},{path,method,data,nonce});
function mediaName(url,joomlaId){return "pse-tth-"+joomlaId+"-"+sha(url).slice(0,14)+".jpg"}
function sameTitle(a,b){return normalize(a)===normalize(b)}
async function mediaLookup(filename){
 const name=filename.replace(/\.jpg$/,"");
 const found=await api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(name)+
  "&per_page=100&_fields=id,source_url,media_details,mime_type");
 if(found.status!==200||!Array.isArray(found.data))throw Error("WP_MEDIA_LOOKUP_UNAVAILABLE "+name);
 const exact=found.data.filter(p=>String(p.media_details?.file||"").split("/").at(-1)===filename);
 if(exact.length>1)throw Error("WP_MEDIA_DUPLICATE_ID "+filename);
 return exact[0]||null;
}
async function verifyBytes(post,original,filename){
 if(!post||post.mime_type!=="image/jpeg")throw Error("WP_MEDIA_IDENTITY_BAD "+filename);
 const raw=await get(new URL(post.source_url,wp).href);
 if(sha(await raw.body())!==sha(original))throw Error("WP_MEDIA_SHA256_MISMATCH "+filename);
 return Number(post.id);
}
async function originalBody(def,raw){
 const pg=await sourceCtx.newPage();
 try{
 await pg.setContent('<base href="'+def.sourceUrl+'">'+raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),
  {waitUntil:"domcontentloaded",timeout:28000});
 return await pg.evaluate(()=>{
  const original=document.querySelector(".item-page [itemprop=articleBody]")||
   document.querySelector(".item-page");
  if(!original)throw Error("Original articleBody missing");
  const title=(document.querySelector(".item-page h1,.item-page h2")?.textContent||"").replace(/\s+/g," ").trim();
  const root=original.cloneNode(true);
  root.querySelectorAll(".itemRelated,.related,.page-header,.article-info,.pager,.readmore,script,style,form,button,nav,iframe,embed,object,svg").forEach(n=>n.remove());
  const clean=t=>(t||"").replace(/\s+/g," ").trim().toLocaleLowerCase("vi");
  for(const heading of [...root.querySelectorAll("h2,h3,h4,h5,h6,p,strong,b")]){
   if(!["các bài viết khác","other posts"].includes(clean(heading.textContent)))continue;
   let n=heading;
   while(n.parentElement&&["P","DIV"].includes(n.parentElement.tagName)&&
    clean(n.parentElement.textContent)===clean(heading.textContent))n=n.parentElement;
   let next=n.nextElementSibling;
   while(next&&["UL","OL","P","DIV","SECTION","TABLE","A"].includes(next.tagName)&&
    next.querySelector("a[href]")&&!next.querySelector("img,video,iframe")){
    const following=next.nextElementSibling;next.remove();next=following;
   }
   n.remove();
  }
  const allowed=new Set(["P","DIV","SPAN","BR","B","STRONG","I","EM","U","UL","OL","LI",
   "H2","H3","H4","TABLE","THEAD","TBODY","TR","TD","TH","A","IMG","BLOCKQUOTE","HR","FIGURE","FIGCAPTION"]);
  for(const el of [...root.querySelectorAll("*")].reverse()){
   if(!el.parentNode)continue;
   if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue}
   for(const attr of [...el.attributes])
    if(!["href","src","alt","title","colspan","rowspan"].includes(attr.name))el.removeAttribute(attr.name);
   for(const attr of ["src","href"]){
    if(!el.hasAttribute(attr))continue;
    try{const u=new URL(el.getAttribute(attr),document.baseURI);
      if(!["https:","http:"].includes(u.protocol))throw Error("Unsafe URL");
      el.setAttribute(attr,u.href);
    }catch{el.removeAttribute(attr)}
   }
  }
  return {title,html:root.innerHTML.trim(),text:(root.textContent||"").replace(/\s+/g," ").trim(),
   images:[...root.querySelectorAll("img[src]")].map(el=>el.src)};
 });
 }finally{await pg.close()}
}
try{
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const t=(await admin.locator("#loginform").innerText()).slice(0,800);
  const match=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(match){
   const a=Number(match[1]),b=Number(match[3]),v=match[2]==="+"?a+b:match[2]==="-"?a-b:a*b;
   const field=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("WP_MATH_CAPTCHA_FIELD_MISSING");await field.fill(String(v));
  }
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wp+"/wp-admin/options-general.php",{waitUntil:"domcontentloaded",timeout:65000});
 if(admin.url().includes("wp-login")||!await admin.locator("#adminmenu").count())
  throw Error("WP_CMS_EDITOR_AUTHENTICATION_FAILED");
 const zone=await admin.locator('select#timezone_string,select[name="timezone_string"]').first().inputValue();
 if(!["UTC+7","Asia/Ho_Chi_Minh","Asia/Saigon","Asia/Bangkok","Etc/GMT-7"].includes(zone))
  throw Error("WP_TZ_DIFFERS_FROM_JOOMLA "+zone);
 nonce=await admin.evaluate(async()=>window.wpApiSettings?.nonce||
  await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("WP_REST_NONCE_MISSING");
 const [cat,parent]=await Promise.all([
  api("/wp-json/wp/v2/categories/1746?_fields=id,parent,slug"),
  api("/wp-json/wp/v2/categories/1742?_fields=id,slug")
 ]);
 if(cat.status!==200||cat.data?.id!==1746||cat.data?.parent!==1742||cat.data?.slug!=="tin-tong-hop"||
  parent.status!==200||parent.data?.id!==1742||parent.data?.slug!=="tin-cong-ty")
  throw Error("WP_CATEGORY_BOUNDARY_CHANGED");
 const rss=await get(m.rss),xml=await rss.text();
 if(!/<rss[\s>]/i.test(xml))throw Error("JOOMLA_RSS_NOT_VALID");
 const feeds=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match=>{
  const value=tag=>match[1].match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+tag+">","i"))?.[1]?.trim()||"";
  return{title:value("title").replace(/<!\[CDATA\[|\]\]>/g,""),guid:value("guid"),date:value("pubDate")};
 });
 const originals=[],allMedia=new Map();
 // Full four-post article and byte preflight BEFORE first WordPress mutation.
 for(const row of m.records){
  if(!ids.includes(row.joomlaId)||row.sourceUrl!==m.source+row.joomlaId+"-"+row.slug+".html"||
   !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(row.created))
   throw Error("JOOMLA_SOURCE_ID_URL_INVALID "+row.joomlaId);
  const fed=feeds.filter(x=>x.guid===row.sourceUrl);
  if(fed.length!==1||!sameTitle(fed[0].title,row.title)||
   new Date(fed[0].date).toISOString()!==new Date(row.created+"+07:00").toISOString())
   throw Error("JOOMLA_RSS_ID_DATE_TITLE_CHANGED "+row.joomlaId);
  const source=await get(row.sourceUrl);
  const body=await originalBody(row,await source.text());
  if(!sameTitle(body.title,row.title)||body.text.length<120||
   body.images.length!==row.images||/các\s+bài\s+viết\s+khác/i.test(body.text))
   throw Error("JOOMLA_BODY_TITLE_IMAGE_OR_RELATED_CHANGED "+row.joomlaId);
  const posts=await api("/wp-json/wp/v2/posts?context=edit&status=any&slug="+encodeURIComponent(row.slug)+
   "&per_page=20&_fields=id,slug,status,title,acf,categories,date,content,featured_media");
  if(posts.status!==200||!Array.isArray(posts.data)||posts.data.length>1)
   throw Error("NATIVE_WP_POST_SLUG_AMBIGUOUS "+row.joomlaId);
  const prior=posts.data[0]||null;
  if(prior&&(String(prior.acf?.origin_page_id||"")!==String(row.joomlaId)||
   !prior.categories?.includes(1746)||!prior.categories?.includes(1742)||
   !sameTitle(prior.title?.raw||prior.title?.rendered,row.title)))
   throw Error("WP_POST_IDENTITY_COLLISION "+row.joomlaId);
  originals.push({...row,body,prior});
  for(const url of body.images){
   const u=new URL(url);
   if(u.protocol!=="https:"||!["pse.vn","www.pse.vn","cdn.petrotimes.vn"].includes(u.hostname))
    throw Error("ORIGINAL_MEDIA_UNTRUSTED_HOST "+row.joomlaId);
   if(!allMedia.has(url)){
    const sourcePhoto=await get(url),bytes=await sourcePhoto.body();
    if(bytes.length<200||bytes.length>9000000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)
     throw Error("ORIGINAL_JPEG_MISSING "+row.joomlaId+" "+u.pathname.slice(-36));
    allMedia.set(url,{url,bytes,sha256:sha(bytes),filename:mediaName(url,row.joomlaId),id:0,wpUrl:""});
   }
  }
  report.prepared.push({id:row.joomlaId,originalCreated:row.created,media:body.images.length,
   bodyChars:body.text.length,alreadyPublished:prior?.status==="publish"});
  console.log("PSE_TTH_FOUR_SOURCE_PREFLIGHT="+JSON.stringify(report.prepared.at(-1)));
 }
 if(originals.length!==4||[...allMedia].length!==13||
  originals.reduce((n,d)=>n+d.body.images.length,0)!==13)
  throw Error("SOURCE_FOUR_ARTICLE_THIRTEEN_IMAGES_INCOMPLETE");
 console.log("PSE_TTH_FOUR_PREFLIGHT_ALL=PASS 4_IDS_13_ORIGINAL_JPEGS_TIME_SECOND");
 report.phase="SOURCE_4_POSTS_13_IMAGES_VERIFIED";
 // All Media registration reads happen before Media writes, with deterministic names.
 for(const media of allMedia.values())media.existing=await mediaLookup(media.filename);
 report.phase="WP_MEDIA_IDENTITY_VERIFIED";
 wpUpload=await request.newContext({storageState:await adminCtx.storageState(),timeout:75000});
 for(const media of allMedia.values()){
  if(media.existing)media.id=await verifyBytes(media.existing,media.bytes,media.filename);
  else{
   let sent=null;
   try{
    sent=await wpUpload.post(wp+"/wp-json/wp/v2/media",{
      data:media.bytes,headers:{"X-WP-Nonce":nonce,Accept:"application/json",
       "Content-Disposition":'attachment; filename="'+media.filename+'"',
       "Content-Type":"image/jpeg","Origin":wp,Referer:wp+"/wp-admin/"},
       timeout:75000});
   }catch{
     // Upload response might have dropped after WordPress committed the file.
     // Never blindly POST twice: detect an identical already-committed image.
     for(let a=1;a<=7&&!media.id;a++){
      await new Promise(done=>setTimeout(done,a*2700));
      try{const saved=await mediaLookup(media.filename);
       if(saved)media.id=await verifyBytes(saved,media.bytes,media.filename)}
      catch{ /* transient protected API condition; never leak cookies */ }
     }
     if(!media.id)throw Error("WP_UPLOAD_UNVERIFIED; safe resume "+media.filename);
   }
   if(sent){
    const data=await sent.json().catch(()=>null);
    if(sent.status()!==201||!Number.isSafeInteger(Number(data?.id))||Number(data.id)<1)
     throw Error("WP_MEDIA_HTTP "+sent.status()+" "+media.filename);
    media.id=Number(data.id);
   }
  }
  const verified=await api("/wp-json/wp/v2/media/"+media.id+
   "?context=edit&_fields=id,source_url,mime_type,media_details");
  const data=verified.data,url=new URL(String(data?.source_url||""),wp);
  if(verified.status!==200||Number(data?.id)!==media.id||data.mime_type!=="image/jpeg"||
    String(data.media_details?.file||"").split("/").at(-1)!==media.filename||
    url.origin!==wp||!url.pathname.startsWith("/wp-content/uploads/"))
   throw Error("WP_MEDIA_REST_INTEGRITY_FAIL "+media.filename);
  media.wpUrl=url.href;
  report.media.push({original:media.url,wpId:media.id,filename:media.filename,
   sha256:media.sha256,reused:!!media.existing});
  console.log("PSE_TTH_FOUR_MEDIA_PASS="+JSON.stringify({n:report.media.length,total:13,id:media.id,reused:!!media.existing}));
  if(!media.existing)await new Promise(done=>setTimeout(done,1800));
 }
 if(report.media.length!==13)throw Error("WP_13_MEDIA_INCOMPLETE");
 console.log("PSE_TTH_FOUR_NATIVE_IMAGES=PASS 13/13");
 report.phase="MEDIA_13_VERIFIED";
 for(const row of originals){
  const pg=await sourceCtx.newPage();let converted;
  try{
   await pg.setContent('<div id="article-root">'+row.body.html+'</div>',{waitUntil:"domcontentloaded",timeout:22000});
   converted=await pg.evaluate(list=>{
    const map=new Map(list),root=document.querySelector("#article-root");
    for(const x of root.querySelectorAll("img[src]")){
     const src=x.getAttribute("src"),replacement=map.get(src);
     if(!replacement)throw Error("Original image URL has no native WP replacement");
     x.setAttribute("src",replacement);
    }
    for(const x of root.querySelectorAll("a[href]")){
     const next=map.get(x.getAttribute("href"));if(next)x.setAttribute("href",next);
    }
    return{html:root.innerHTML.trim(),text:(root.textContent||"").replace(/\s+/g," ").trim(),
     images:[...root.querySelectorAll("img[src]")].map(x=>x.src)};
   },[...allMedia].map(([url,value])=>[url,value.wpUrl]));
  }finally{await pg.close()}
  if(converted.images.length!==row.images||converted.text.length<120||
   /các\s+bài\s+viết\s+khác/i.test(converted.text))
   throw Error("WP_POST_CONTENT_ORIGINAL_INTEGRITY_FAIL "+row.joomlaId);
  const expected=row.body.images.map(url=>allMedia.get(url).wpUrl);
  if(JSON.stringify(expected)!==JSON.stringify(converted.images))
   throw Error("WP_POST_PHOTO_ORDER_DIFFERS "+row.joomlaId);
  const excerpt=converted.text.slice(0,156),featured=row.body.images.length?
   allMedia.get(row.body.images[0]).id:0;
  let id=Number(row.prior?.id||0);
  if(!id){
   const created=await api("/wp-json/wp/v2/posts","POST",{
    title:row.title,slug:row.slug,date:row.created,categories:[1742,1746],
    content:converted.html,excerpt,status:"draft",featured_media:featured,
    pse_seo_description:excerpt,
    acf:{action:"PostDetails",key:"ssr-post",origin_page_id:String(row.joomlaId)}
   });
   if(created.status!==201||!Number.isSafeInteger(Number(created.data?.id)))
    throw Error("WP_POST_DRAFT_CREATE_FAILED "+row.joomlaId+" status="+created.status);
   id=Number(created.data.id);
  }
  const read=id=>api("/wp-json/wp/v2/posts/"+id+
   "?context=edit&_fields=id,status,slug,date,title,categories,acf,content,featured_media");
  const before=await read(id),post=before.data;
  if(before.status!==200||post.id!==id||post.slug!==row.slug||post.date!==row.created||
   !sameTitle(post.title?.raw||post.title?.rendered,row.title)||
   post.acf?.action!=="PostDetails"||post.acf?.key!=="ssr-post"||
   String(post.acf?.origin_page_id||"")!==String(row.joomlaId)||
   !post.categories?.includes(1742)||!post.categories?.includes(1746)||
   Number(post.featured_media||0)!==featured||
   expected.some(url=>!String(post.content?.raw||"").includes(url)))
   throw Error("WP_POST_DRAFT_READBACK_MISMATCH "+row.joomlaId);
  if(post.status!=="publish"){
   if(post.status!=="draft")throw Error("WP_POST_UNEXPECTED_STATE "+row.joomlaId);
   const published=await api("/wp-json/wp/v2/posts/"+id,"POST",{status:"publish"});
   if(published.status!==200||published.data?.status!=="publish")
    throw Error("WP_POST_PUBLISH_REFUSED "+row.joomlaId);
  }
  const after=await read(id);
  if(after.status!==200||after.data?.status!=="publish"||after.data.date!==row.created)
   throw Error("WP_PUBLISHED_LOCAL_SECOND_READBACK_FAILED "+row.joomlaId);
  report.posts.push({joomlaId:row.joomlaId,wpId:id,created:row.created,images:expected.length,
   slug:row.slug,status:"publish"});
  console.log("PSE_TTH_FOUR_POST_PUBLISHED="+JSON.stringify(report.posts.at(-1)));
 }
 if(report.posts.length!==4||report.posts.reduce((n,p)=>n+p.images,0)!==13)
  throw Error("WP_FOUR_POSTS_IMAGE_COUNT_NOT_VERIFIED");
 report.status="PASS";report.phase="POSTS_PUBLISHED";
 console.log("PSE_TTH_FOUR_NATIVE_RESTORE_PASS=4_POSTS_13_ORIGINAL_JPEGS_EXACT_JOOMLA_SECONDS_NO_RELATED");
}catch(e){report.status="FAIL";report.error=String(e?.message||e).slice(0,450);
 console.error("PSE_TTH_FOUR_NATIVE_RESTORE_FAIL="+report.error);process.exitCode=1}
finally{
 await mkdir("artifacts/pse-tth-four",{recursive:true});
 await writeFile("artifacts/pse-tth-four/apply.json",JSON.stringify(report,null,2)+"\n");
 await wpUpload?.dispose();await http.dispose();await sourceCtx.close();await adminCtx.close();await browser.close();
}
