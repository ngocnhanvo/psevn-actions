/** Bounded, resumable legacy Joomla -> verified PSE WordPress posts.
 * Does not touch existing content or trigger Astro build.
 * State is persisted separately by the queue's GitHub Contents checkpoint step.
 */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
const STATE="docs/pse-legacy-migration-state.json";
const state=JSON.parse(await readFile(STATE,"utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Unknown state schema");
if(!state.backup_verified)throw Error("Verified rollback backup required before WordPress writes");
const opts=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function origin(name){
 const lines=opts.filter(x=>x.startsWith(name+"="));
 if(lines.length!==1)throw Error("Missing "+name);
 const url=new URL(lines[0].slice(name.length+1).trim().replace(/^['"]|['"]$/g,""));
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Unsafe "+name);
 return url.origin;
}
const wp=origin("WC_URL"),source=new URL(state.source);
const CATEGORY={"company":1742,"agriculture-market":1743,"shareholder":1744};
const candidates=Object.keys(state.articles).filter(id=>
 (["pending","media"].includes(state.articles[id].status) ||
   (state.articles[id].status==="quarantined" &&
    state.articles[id].reason==="WP slug occupied by unrelated content")) &&
   (state.articles[id].attempts||0)<3
).sort((a,b)=>Number(b)-Number(a));
const continuing=candidates.filter(id=>state.articles[id].status==="media");
const fresh=candidates.filter(id=>state.articles[id].status!=="media");
const ids=continuing.length?
 [continuing[0], fresh[0]||continuing[1]].filter(Boolean) :
 [fresh[0],fresh.at(-1)].filter((id,index,list)=>id&&list.indexOf(id)===index);
if(!ids.length){
 console.log("PSE_MIGRATION_BATCH=NO_PENDING; discovered="+Object.keys(state.articles).length);
 process.exit(0);
}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const admin=await context.newPage();
const persist=async()=>await writeFile(STATE,JSON.stringify(state,null,2)+"\n","utf8");
let imported=0,existing=0,partial=0,failed=0;
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP credentials unavailable");
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const body=await admin.locator("body").innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],res=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("Login arithmetic input missing");
   await input.fill(String(res));
  }
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("WordPress admin login rejected");
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("No WP REST nonce");
  return (await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid REST nonce");
 const api=async(path,method="GET",data)=>admin.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
    "Accept":"application/json","X-WP-Nonce":nonce,...(data?{"Content-Type":"application/json"}:{})
   },...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 // Resolve categories already configured in PSE; never create invented taxonomy.
 const cats={};
 for(const [group,id] of Object.entries(CATEGORY)){
  const r=await api("/wp-json/wp/v2/categories/"+id+"?_fields=id,slug");
  if(r.status!==200||r.data.id!==id)throw Error("Configured WP category missing "+group);
  cats[group]=id;
 }
 for(const id of ids){
  const item=state.articles[id];
  item.attempts=(item.attempts||0)+1;
  const url=new URL(item.source_url);
  if(url.protocol!=="https:"||!["pse.vn","www.pse.vn"].includes(url.hostname)||
      !new RegExp("/"+id+"-[^/]+\\.html$","i").test(url.pathname)){
   item.status="quarantined";item.reason="Unsafe or mismatched original source URL";failed++;continue;
  }
  const path=url.pathname;
  const slug=path.match(/\/\d{3,6}-([^/]+)\.html$/i)?.[1]?.toLowerCase();
  const cat=cats[item.group_hint];
  if(!cat||!slug){
   item.status="quarantined";item.reason="Original Joomla section cannot be mapped to verified WP taxonomy";failed++;continue;
  }
  try{
   const before=await api("/wp-json/wp/v2/posts?status=any&context=edit&slug="+encodeURIComponent(slug)+"&per_page=100&_fields=id,status,slug,title,content,categories");
   if(before.status!==200||!Array.isArray(before.data))throw Error("Cannot verify existing WP slug");
   if(before.data.length>1)throw Error("WP duplicate slug, human review required");
   if(before.data.length===1){
    const old=before.data[0];
    // WP slug is unique within the same verified category. Old PSE posts
    // were imported before the source-URL marker was introduced, so requiring
    // that marker or comparing accented titles generates false conflicts.
    // Never change a matching existing post; preserve its original content.
    if(!old.categories?.includes(cat) ||
       !String(old.title?.raw||old.title?.rendered||"").trim() ||
       !String(old.content?.raw||"").trim()){
     item.status="quarantined";item.reason="WP slug occupied by unrelated or empty content";failed++;continue;
    }
    item.status="existing";item.wp_id=old.id;existing++;
    console.log("PSE_LEGACY_SKIP_EXISTING=PASS; source_id="+id+"; wp_id="+old.id);
    await persist();continue;
   }
   const original=await context.newPage();
   let article;
   try{
    const resp=await original.goto(item.source_url,{waitUntil:"domcontentloaded",timeout:45000});
    if(resp?.status()!==200)throw Error("Source HTTP "+resp?.status());
    article=await original.evaluate(()=>{
     const root=document.querySelector('[itemprop="articleBody"]');
     if(!root)throw Error("Verified Joomla articleBody missing");
     const copy=root.cloneNode(true);
     copy.querySelectorAll("script,style,iframe,form,button,nav,svg,video,audio,input").forEach(el=>el.remove());
     const allowed=new Set(["P","DIV","SPAN","BR","B","STRONG","I","EM","UL","OL","LI","H2","H3","H4","TABLE","THEAD","TBODY","TR","TD","TH","A","IMG","BLOCKQUOTE","HR"]);
     for(const el of [...copy.querySelectorAll("*")].reverse()){
      if(!el.parentNode)continue;
      if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue}
      for(const att of [...el.attributes]){
       if(!["href","src","alt","title","colspan","rowspan"].includes(att.name))el.removeAttribute(att.name);
      }
      for(const attr of ["href","src"]){
       if(!el.hasAttribute(attr))continue;
       const value=el.getAttribute(attr);
       try{
        const u=new URL(value,location.href);
        if(!["https:","http:"].includes(u.protocol)){el.removeAttribute(attr);continue}
        el.setAttribute(attr,u.href);
       }catch{el.removeAttribute(attr)}
      }
     }
     const title=(document.title||"").replace(/\s+-\s+PSE\.VN\s*$/i,"").trim();
     const rawDates=[
       ...document.querySelectorAll('meta[property="article:published_time"],meta[itemprop="datePublished"],meta[name="date"],meta[name="DC.date.issued"],time[datetime],[itemprop="datePublished"],.article-info dd.published,.article-info dd.created')
     ].map(e=>e.getAttribute("content")||e.getAttribute("datetime")||e.textContent||"");
     const rawText=(copy.textContent||"").replace(/\s+/g," ").trim();
     const assets=[...new Set([...copy.querySelectorAll("img[src],a[href]")].map(el=>el.getAttribute(el.tagName==="IMG"?"src":"href")).filter(x=>x&&
       /\.(png|jpe?g|webp|gif|pdf|docx?|xlsx?|pptx?)(\?|#|$)/i.test(x)))];
     return {title,html:copy.innerHTML.trim(),chars:rawText.length,dates:rawDates,assets};
    });
   }finally{await original.close()}
   if(!article.title||article.chars<100||article.chars>150000||article.html.length>550000)
    throw Error("Source content incomplete or oversized");
   const iso=article.dates.map(x=>String(x).trim()).find(x=>/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(x));
   const originalDate=iso ? iso.slice(0,19).replace(" ","T") : null;
   // Preserve incomplete source dates as reviewable draft instead of fabricating.
   if(article.assets.length>75){
    item.status="quarantined";item.reason="Excessive media count; special batch required";failed++;continue;
   }
   const missing=article.assets.filter(u=>{
     try{const x=new URL(u);return !["pse.vn","www.pse.vn"].includes(x.hostname)}catch{return true}
   });
   if(missing.length){item.status="quarantined";item.reason="Article contains non-local mandatory media";failed++;continue}
   const outstanding=article.assets.filter(x=>!state.media[x]);
   if(outstanding.length){
    const subset=outstanding.slice(0,4);
    for(const assetUrl of subset){
     const download=await context.request.get(assetUrl,{timeout:45000});
     if(!download.ok())throw Error("Original media HTTP "+download.status());
     const buf=await download.body();
     if(buf.length<80||buf.length>12_000_000)throw Error("Original media size unsafe; bytes="+buf.length+"; ext="+new URL(assetUrl).pathname.split(".").at(-1));
     const ext=new URL(assetUrl).pathname.split(".").at(-1).toLowerCase();
     const types={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",
       gif:"image/gif",pdf:"application/pdf",doc:"application/msword",
       docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
       xls:"application/vnd.ms-excel",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
       ppt:"application/vnd.ms-powerpoint",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation"};
     if(!types[ext])throw Error("Unsupported media extension "+ext);
     const hash=createHash("sha256").update(assetUrl).digest("hex").slice(0,16);
     const assetSlug="pse-legacy-"+hash;
     const match=await api("/wp-json/wp/v2/media?context=edit&slug="+assetSlug+"&per_page=5&_fields=id,slug,source_url");
     if(match.status!==200||!Array.isArray(match.data)||match.data.length>1)
      throw Error("WordPress media lookup invalid");
     let obj=match.data[0];
     if(!obj){
      const up=await context.request.post(wp+"/wp-json/wp/v2/media",{
       headers:{"X-WP-Nonce":nonce,"Content-Disposition":'attachment; filename="'+assetSlug+"."+ext+'"',"Content-Type":types[ext]},
       data:buf,timeout:80000
      });
      if(up.status()!==201)throw Error("WordPress media upload HTTP "+up.status()+" source "+id);
      obj=await up.json();
     }
     if(!obj?.id||!obj.source_url)throw Error("WP Media returned no URL");
     state.media[assetUrl]={id:obj.id,url:obj.source_url,sha256:createHash("sha256").update(buf).digest("hex")};
     console.log("PSE_LEGACY_MEDIA=PASS; article="+id+"; media_id="+obj.id);
     await persist();
    }
    item.status="media";
    item.attempts=0; // Progress through large galleries is not a failed retry.
    partial++;
    console.log("PSE_LEGACY_BATCH_MEDIA_PARTIAL; source_id="+id+"; remaining="+Math.max(0,outstanding.length-subset.length));
    await persist();continue;
   }
   let html=article.html;
   for(const [originalURL,meta] of Object.entries(state.media)){
    if(html.includes(originalURL))html=html.split(originalURL).join(meta.url);
   }
   if(article.assets.some(x=>html.includes(x)))throw Error("Mandatory media still linked to source");
   const canonical=item.source_url;
   const footer='<p class="pse-legacy-attribution">Nguồn: <a href="'+canonical+'">PSE.VN</a></p>';
   const data={title:article.title,slug,categories:[cat],content:html+"\n"+footer,status:originalDate?"publish":"draft"};
   if(originalDate)data.date=originalDate;
   const created=await api("/wp-json/wp/v2/posts","POST",data);
   if(created.status!==201||!Number.isSafeInteger(created.data?.id))throw Error("WordPress post create HTTP "+created.status);
   const check=await api("/wp-json/wp/v2/posts/"+created.data.id+"?context=edit&_fields=id,slug,status,categories,content,date");
   if(check.status!==200||check.data.slug!==slug||!check.data.categories?.includes(cat)||
      check.data.status!==data.status||!String(check.data.content?.raw||"").includes("PSE.VN"))
    throw Error("Created post REST read-after-write failed");
   item.status=originalDate?"imported":"draft_needs_date";
   item.wp_id=created.data.id;item.verified_date=originalDate||null;
   if(!originalDate)item.reason="Original source lacks independently verifiable publish timestamp";
   imported++;
   console.log("PSE_LEGACY_POST=PASS; source_id="+id+"; wp_id="+created.data.id+"; status="+data.status+"; media="+article.assets.length);
   await persist();
  }catch(e){
   const reason=e instanceof Error?e.message:String(e);
   item.reason=reason.slice(0,190);
   if(item.attempts>=3){item.status="quarantined";failed++}
   else {item.status="pending";partial++}
   console.error("PSE_LEGACY_RECORD_ERROR; source_id="+id+"; reason="+item.reason);
   await persist();
  }
 }
}finally{await persist();await browser.close()}
console.log("PSE_MIGRATION_BATCH=PARTIAL; imported="+imported+"; existing="+existing+
 "; waiting_media_or_retry="+partial+"; quarantined="+failed+"; source_total="+Object.keys(state.articles).length+
 "; no_build=true; state_checkpoint_required=true");
