/** PSE EXACT five source-verified Joomla Posts: recover original photo assets
 * from already-published WordPress albums, preserving source CREATED day.
 * Preview by default. Only exact owner marker on main permits native CMS writes.
 * No Astro hardcoding, no media uploads, no unrelated WP Post edits.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";

const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const message=String(event.head_commit?.message||"").split("\n")[0];
const apply=message==="cms(pse): recover five original Joomla photo-backed posts";
const repository=process.env.GITHUB_REPOSITORY,ref=process.env.GITHUB_REF;
if(repository!=="ngocnhanvo/psevn-actions"||ref!=="refs/heads/main")
 throw Error("Wrong PSE Actions main branch");
const statePath="docs/pse-legacy-migration-state.json";
const state=JSON.parse(await readFile(statePath,"utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||state.tracker_issue!==3)
 throw Error("Original Joomla source and WordPress rollback guard failed");
const targets=[
 {id:205,album:991,count:10,day:"2011-08-23",category:"tin-tong-hop"},
 {id:226,album:992,count:1,day:"2011-10-06",category:"tin-tong-hop"},
 {id:230,album:997,count:2,day:"2011-10-25",category:"hoat-dong-cong-doan-doan-tn-nu-cong"},
 {id:240,album:996,count:6,day:"2012-03-16",category:"tin-tong-hop"},
 {id:321,album:997,count:5,day:"2012-12-04",category:"hoat-dong-cong-doan-doan-tn-nu-cong"}
];
const albumSlug=new Map([
 [991,"991-ngay-hoi-truyen-thong-2011"],[992,"992-mau-bao-bi"],
 [996,"996-hoc-van-hoa-doanh-nghiep"],[997,"997-truong-sa"]
]);
if(targets.some(x=>{
 const a=state.articles[x.id];return a?.status!=="quarantined"&&a?.status!=="imported"||
 (!a?.source_url?.startsWith("https://www.pse.vn/"))||a?.group_hint!=="company"||
 (a.status==="quarantined"&&a.reason!=="Original media HTTP 404");
}))throw Error("Original legacy source identity/quarantine changed");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function origin(key){
 const rows=env.filter(x=>x.startsWith(key+"="));
 if(rows.length!==1)throw Error("Missing unique WP origin "+key);
 const u=new URL(rows[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
  throw Error("Untrusted WP origin "+key);
 return u.origin;
}
const wp=origin("WC_URL");
const browser=await chromium.launch({headless:true});
const sourceCtx=await browser.newContext({javaScriptEnabled:false});
await sourceCtx.route("**/*",r=>r.abort());
const dateCtx=await browser.newContext({viewport:{width:1366,height:850}});
await dateCtx.route(/\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const adminCtx=await browser.newContext({viewport:{width:1366,height:850}});
const admin=await adminCtx.newPage();
const network=await request.newContext({timeout:40000});
const report={schema:"pse-five-original-gallery-backed-posts-v1",
 mode:apply?"apply":"audit",sourceEvidenceRun:44866509615,entries:[],prepared:[],written:[],issues:[]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchHtml(url){
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const r=await network.get(url,{timeout:50000,maxRedirects:2});
   if(r.status()!==200){
    if(r.status()<500)throw Error("Original Joomla HTTP "+r.status());
    if(attempt===3)throw Error("Original Joomla HTTP "+r.status());
   }else{
    const html=await r.text();
    if(html.length<250||html.length>8000000)throw Error("Untrusted Joomla source HTML size");
    return html;
   }
  }catch(e){
   if(attempt===3||/Original Joomla HTTP 4/.test(String(e?.message||"")))throw e;
   console.warn("PSE_FIVE_SOURCE_GET_RETRY attempt="+attempt+" reason="+String(e?.code||e?.name||"network").slice(0,45));
  }
  await sleep(attempt*800);
 }
 throw Error("Original HTML never confirmed");
}
async function sourcePage(url){
 const p=await sourceCtx.newPage();
 try{
  const raw=await fetchHtml(url);
  await p.setContent('<base href="'+url+'">'+raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{
   waitUntil:"domcontentloaded",timeout:25000});
  return await p.evaluate(()=>{
   const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article")||document.body;
   const thumbs=[...new Set([...root.querySelectorAll("img[src]")].map(x=>x.src))].filter(x=>{
    try{const u=new URL(x);return u.hostname==="www.pse.vn"&&
     u.pathname.startsWith("/images/web/gallery/")}catch{return false}
   });
   const photos=[...new Set([...root.querySelectorAll("a[href]")].map(x=>x.href))].filter(x=>{
    try{const u=new URL(x);return u.hostname==="www.pse.vn"&&
     u.pathname.startsWith("/images/gallery/")}catch{return false}
   });
   const title=(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||"").replace(/\s+/g," ").trim();
   return{title,bodyText:(root.textContent||"").replace(/\s+/g," ").trim(),
    thumbs,photos};
  });
 }finally{await p.close()}
}
let nonce;
const api=async(path,method="GET",data)=>{
 if(!path.startsWith("/wp-json/")||path.includes("..")||path.startsWith("//"))
  throw Error("Unsafe WP API path");
 return admin.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "Accept":"application/json","X-WP-Nonce":nonce,...(data?{"Content-Type":"application/json"}:{})
  },...(data?{body:JSON.stringify(data)}:{})});
  return{status:r.status,data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
};
async function readWp(path){
 let last;
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const r=await api(path);
   if(r.status<500)return r;
   last="HTTP "+r.status;
  }catch(e){last=String(e?.code||e?.name||"network").slice(0,50)}
  if(attempt<3)await sleep(attempt*750);
 }
 throw Error("WordPress read-only REST failed "+last);
}
try{
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=(await admin.locator("#loginform").innerText()).slice(0,500);
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],val=({"+":a+b,"-":a-b,"×":a*b,"*":a*b,x:a*b})[m[2]];
   const fld=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await fld.count())throw Error("Missing source-owned WP login challenge");
   await fld.fill(String(val));
  }
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(admin.url().includes("wp-login")||!await admin.locator("#adminmenu").count())
  throw Error("WordPress protected CMS authentication not verified");
 nonce=await admin.evaluate(async()=>{
  if(globalThis.wpApiSettings?.nonce)return globalThis.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Missing WordPress nonce");return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Unexpected WP REST nonce");
 const table=await readWp("/wp-json/tablepress/v1/table/pse_01_vi");
 if(table.status!==200||table.data?.items?.length!==3)
  throw Error("Source-owned PSE WordPress news category TablePress missing");
 const company=table.data.items[0];
 const companyCategory=Number(company?.categoryId);
 const companySlug=String(company?.categorySlug||"");
 const parent=await readWp("/wp-json/wp/v2/categories?slug="+encodeURIComponent(companySlug)+"&_fields=id,slug");
 if(parent.status!==200||parent.data?.length!==1||parent.data[0].id!==companyCategory)
  throw Error("PSE source-owned company taxonomy mismatch");
 const childCategories=new Map();
 for(const childSlug of [...new Set(targets.map(x=>x.category))]){
  const r=await readWp("/wp-json/wp/v2/categories?slug="+encodeURIComponent(childSlug)+"&_fields=id,slug,parent");
  if(r.status!==200||r.data?.length!==1||r.data[0].slug!==childSlug||
      Number(r.data[0].parent)!==companyCategory)throw Error("PSE child taxonomy mismatch "+childSlug);
  childCategories.set(childSlug,Number(r.data[0].id));
 }
 const gallery=new Map();
 for(const [album,slug] of albumSlug){
  const u="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/"+slug+".html";
  const item=await sourcePage(u);
  if(!item.photos.length)throw Error("Source gallery missing original images "+album);
  gallery.set(album,new Set(item.photos));
  console.log("PSE_FIVE_SOURCE_ALBUM=PASS id="+album+" photos="+item.photos.length);
 }
 // COMPLETE five-Post read-only preflight before the first CMS mutation.
 for(const def of targets){
  const source=state.articles[def.id].source_url;
  const original=await sourcePage(source);
  if(original.thumbs.length!==def.count||original.bodyText.length<30||!original.title)
   throw Error("Original Joomla article changed id="+def.id);
  const originalLinks=[];
  for(const broken of original.thumbs){
   const src=new URL(broken),full=new URL(src.pathname.replace(/^\/images\/web\/gallery\//,"/images/gallery/"),src.origin).href;
   if(!gallery.get(def.album)?.has(full))throw Error("Original full-size gallery evidence missing "+broken);
   const ext=new URL(full).pathname.split(".").at(-1).toLowerCase().replace("jpeg","jpg");
   const marker="pse-gallery-"+def.album+"-"+createHash("sha256").update(full).digest("hex").slice(0,16);
   const media=await readWp("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(marker)+
     "&per_page=50&_fields=id,slug,mime_type,source_url,media_details");
   if(media.status!==200||!Array.isArray(media.data))throw Error("Authenticated native photo registry unavailable "+def.id);
   const files=media.data.filter(m=>m.slug===marker);
   if(files.length!==1||files[0].mime_type!==(ext==="jpg"?"image/jpeg":"image/"+ext))
    throw Error("Source original photo ID not unique in WP "+def.id+" marker="+marker);
   const m=files[0],file=String(m.media_details?.file||"").replace(/^\/+/,"");
   if(file.split("/").at(-1)!==marker+"."+ext)throw Error("Source original WP filename mismatch "+def.id);
   const url=new URL(m.source_url||"");
   if(url.origin!==wp||url.pathname!=="/wp-content/uploads/"+file||
      !Number.isSafeInteger(Number(m.id))||Number(m.id)<1)throw Error("Source Media WP host/ID mismatch");
   originalLinks.push({broken,full,marker,wpId:Number(m.id),wpUrl:url.href,file});
  }
  const slug=new URL(source).pathname.split("/").at(-1).replace(new RegExp("^"+def.id+"-"),"").replace(/\.html$/i,"");
  if(!/^[a-z0-9-]+$/.test(slug))throw Error("Unsafe original Joomla slug "+def.id);
  const existing=await readWp("/wp-json/wp/v2/posts?context=edit&status=any&slug="+encodeURIComponent(slug)+
    "&per_page=10&_fields=id,slug,status,acf,content,date,categories,featured_media");
  if(existing.status!==200||!Array.isArray(existing.data)||existing.data.length>1)
   throw Error("Existing WP original Post ambiguity "+def.id);
  const match=existing.data[0]||null;
  if(match&&(String(match.acf?.origin_page_id||"")!==String(def.id)||
   !match.categories?.includes(companyCategory)||!match.categories?.includes(childCategories.get(def.category))))
   throw Error("Native WP slug is owned by another Joomla Post "+def.id);
  const datePage=await dateCtx.newPage();
  let exact;
  try{exact=await searchDate(datePage,{id:def.id,sourceUrl:source,title:original.title,opening:original.bodyText.slice(0,300)})}
  finally{await datePage.close()}
  if(exact.source!=="joomla_com_search_created"||exact.day!==def.day)
   throw Error("Exact original Joomla source day/title/ID evidence changed "+def.id);
  const srcImages=new Map();
  for(const m of originalLinks){srcImages.set(m.broken,m);srcImages.set(m.full,m)}
  const raw=await fetchHtml(source),page=await sourceCtx.newPage();
  let article;
  try{
   await page.setContent('<base href="'+source+'">'+raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{
    waitUntil:"domcontentloaded",timeout:25000});
   article=await page.evaluate(({mediaSource})=>{
    const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article");
    if(!root)throw Error("Joomla article body vanished");
    const mappings=new Map(mediaSource.flatMap(x=>[[x.broken,x.wpUrl],[x.full,x.wpUrl]]));
    const copy=root.cloneNode(true);
    for(const el of copy.querySelectorAll("img[src]")){
     const url=new URL(el.getAttribute("src"),document.baseURI).href;
     const replacement=mappings.get(url);
     if(!replacement)throw Error("Mandatory source image has no verified native Media: "+url);
     el.setAttribute("src",replacement);
    }
    for(const a of copy.querySelectorAll("a[href]")){
     const url=new URL(a.getAttribute("href"),document.baseURI).href;
     if(mappings.has(url))a.setAttribute("href",mappings.get(url));
     else if(/\.(?:png|jpe?g|gif|webp|pdf)(?:\?|$)/i.test(url))
      throw Error("Unverified linked mandatory media "+url);
    }
    const other=[...copy.querySelectorAll("video,audio,source,object,embed,iframe")];
    if(other.length)throw Error("Unsupported mandatory Joomla multimedia");
    copy.querySelectorAll("script,style,form,button,nav,svg,input").forEach(n=>n.remove());
    const allowed=new Set(["P","DIV","SPAN","BR","B","STRONG","I","EM","UL","OL","LI",
      "H2","H3","H4","TABLE","THEAD","TBODY","TR","TD","TH","A","IMG","BLOCKQUOTE","HR","FIGURE","FIGCAPTION"]);
    for(const el of [...copy.querySelectorAll("*")].reverse()){
     if(!el.parentNode)continue;
     if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue}
     for(const attr of [...el.attributes]){
      if(!["href","src","alt","title","colspan","rowspan"].includes(attr.name))el.removeAttribute(attr.name);
     }
     for(const attr of ["href","src"]){
      if(!el.hasAttribute(attr))continue;
      try{
       const url=new URL(el.getAttribute(attr),document.baseURI);
       if(!["https:","http:"].includes(url.protocol))throw Error("Unsupported scheme");
       el.setAttribute(attr,url.href);
      }catch{el.removeAttribute(attr)}
     }
    }
    return{html:copy.innerHTML.trim(),text:(copy.textContent||"").replace(/\s+/g," ").trim(),
     images:copy.querySelectorAll("img[src]").length};
   },{mediaSource:originalLinks});
  }finally{await page.close()}
  if(article.images!==def.count||article.text.length<30||article.html.length<100)
   throw Error("Sanitized Joomla Post image/text parity failed id="+def.id);
  if(originalLinks.some(x=>!article.html.includes(x.file)))
   throw Error("Original Post media filename unexpectedly omitted "+def.id);
  const excerpt=[...article.text].slice(0,158).join("").trim();
  const prepared={...def,slug,source,title:original.title,date:def.day+"T00:00:00",
    categoryIds:[companyCategory,childCategories.get(def.category)],
    originalLinks,body:article.html,excerpt,existing:match};
  report.prepared.push({id:def.id,title:original.title,originalImages:originalLinks.length,verifiedDay:def.day,
    exactPublishedDateSource:exact.source,sourceMediaIds:originalLinks.map(x=>x.wpId),existingWpPostId:match?.id||null});
  report.entries.push(prepared);
  console.log("PSE_FIVE_ORIGINAL_POST_PREFLIGHT="+JSON.stringify(report.prepared.at(-1)));
 }
 if(report.entries.length!==5||report.entries.reduce((n,x)=>n+x.originalLinks.length,0)!==24)
  throw Error("Incorrect five-Post guarded original content/image count");
 console.log("PSE_FIVE_ORIGINAL_POSTS_READONLY_PASS=5; images=24; date_created_exact=true");
 if(apply){
  for(const e of report.entries){
   const excerpt=e.excerpt.length>=35?e.excerpt:e.title+". "+e.excerpt;
   let postId=Number(e.existing?.id||0);
   if(!postId){
    const requestData={
     title:e.title,slug:e.slug,categories:e.categoryIds,
     content:e.body,featured_media:e.originalLinks[0].wpId,
     date:e.date,excerpt,status:"draft",
     pse_seo_description:excerpt,
     acf:{action:"PostDetails",key:"ssr-post",origin_page_id:String(e.id)}
    };
    const created=await api("/wp-json/wp/v2/posts","POST",requestData);
    if(created.status!==201||!Number.isSafeInteger(Number(created.data?.id)))
     throw Error("Original Joomla WordPress Post draft creation failed id="+e.id+" status="+created.status);
    postId=Number(created.data.id);
   }else if(e.existing.status==="publish"){
    const c=String(e.existing.content?.raw||"");
    if(e.existing.date?.slice(0,10)!==e.day||
      e.originalLinks.some(x=>!c.includes(x.file)))
     throw Error("Published original Post differs; never overwrite existing "+e.id);
    console.log("PSE_FIVE_ORIGINAL_POST_ALREADY_PUBLISHED id="+e.id+" wpId="+postId);
   }else{
    const upd=await api("/wp-json/wp/v2/posts/"+postId,"POST",{
     title:e.title,categories:e.categoryIds,content:e.body,date:e.date,
     featured_media:e.originalLinks[0].wpId,excerpt,
     acf:{action:"PostDetails",key:"ssr-post",origin_page_id:String(e.id)}
    });
    if(upd.status!==200)throw Error("Original draft readjustment rejected "+e.id);
   }
   const verify=await readWp("/wp-json/wp/v2/posts/"+postId+
     "?context=edit&_fields=id,slug,status,acf,date,title,content,categories,featured_media");
   const v=verify.data;
   if(verify.status!==200||v?.id!==postId||v.slug!==e.slug||
      String(v.acf?.origin_page_id||"")!==String(e.id)||
      v.acf?.key!=="ssr-post"||v.acf?.action!=="PostDetails"||
      !v.date?.startsWith(e.day)||v.categories.length!==e.categoryIds.length||
      e.categoryIds.some(x=>!v.categories.includes(x))||
      Number(v.featured_media)!==e.originalLinks[0].wpId||
      e.originalLinks.some(x=>!String(v.content?.raw||"").includes(x.file)))
    throw Error("Native Post source/title/date/Media CMS readback failed "+e.id);
   if(v.status!=="publish"){
    const pub=await api("/wp-json/wp/v2/posts/"+postId,"POST",{status:"publish"});
    if(pub.status!==200||pub.data?.status!=="publish")throw Error("WordPress Post publish failed "+e.id);
   }
   const publicPost=await readWp("/wp-json/wp/v2/posts/"+postId+"?_fields=id,slug,status,date,categories");
   if(publicPost.status!==200||publicPost.data?.status!=="publish"||
      !publicPost.data.date.startsWith(e.day))throw Error("Public Post readback failed "+e.id);
   e.wpId=postId;
   report.written.push({id:e.id,wpId:postId,day:e.day,media:e.originalLinks.length});
   console.log("PSE_FIVE_ORIGINAL_POST_PUBLISHED="+JSON.stringify(report.written.at(-1)));
  }
  // Persist exact source provenance only AFTER every native CMS record passes.
  // A failed intermediate run remains idempotent via verified WP slug+ACF.
  for(const e of report.entries){
   if(!e.wpId)throw Error("Incomplete batch: do not modify source checkpoint");
   const row=state.articles[e.id];
   row.wp_id=e.wpId;row.status="imported";row.verified_date=e.day;
   row.source_created_date=e.day;row.date_source="joomla_com_search_created";
   row.date_precision="day";row.gallery_source_recovery_run=44866220447;
   delete row.reason;
   for(const file of e.originalLinks){
    const prev=state.media[file.broken];
    if(prev&&(Number(prev.id)!==file.wpId||prev.url!=="/wp-content/uploads/"+file.file))
     throw Error("Source media checkpoint collision "+file.broken);
    state.media[file.broken]={id:file.wpId,
      url:"/wp-content/uploads/"+file.file,
      gallery_source_url:file.full,
      source_image_identity:"source_album_exact_url_verified"};
   }
  }
  state.runs=Number(state.runs||0)+1;
  await writeFile(statePath,JSON.stringify(state,null,2)+"\n","utf8");
  console.log("PSE_FIVE_ORIGINAL_POSTS_CMS_PASS=5; mediaReused=24; createdDatesPreserved=true; migrationCheckpointReady=true");
 }
}finally{
 await mkdir("artifacts/pse-five-original-joomla-posts",{recursive:true});
 const safe={...report,entries:report.entries.map(e=>({id:e.id,source:e.source,slug:e.slug,wpId:e.wpId||null,
   date:e.date,photos:e.originalLinks.length,originalMediaIds:e.originalLinks.map(x=>x.wpId)}))};
 await writeFile("artifacts/pse-five-original-joomla-posts/report.json",JSON.stringify(safe,null,2)+"\n");
 await network.dispose();await browser.close();
}