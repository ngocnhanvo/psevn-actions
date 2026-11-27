/** Restore exactly fifteen original historical company news Posts and their 93 JPEGs.
 * All source identities/dates, image HTTP200 and expected media counts were proved
 * in Actions #45951948522 and #45952542164. Safe resume is by exact native WP slug
 * + ACF origin_page_id, never by fuzzy title and never overwrite other Posts.
 * A valid exact owner marker and main branch are mandatory before any write.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const marker=(await readFile(".pse-company-historical-restore-request","utf8")).trim();
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const msg=String(ev.head_commit?.message||"").split("\n")[0];
const apply=marker==="MODE=APPLY;SOURCE_SQL_SHA256=ec85436b4e7a475b13c2955e8e0adcbbae11c87e8502669b3ae77e51f2bc4f2c"&&msg==="cms(pse): restore fifteen missing original company articles and images";
if(!((marker==="MODE=AUDIT"&&msg==="audit(pse): preflight fifteen original company news Posts")||apply))
 throw Error("Invalid owner-approved native CMS restoration request");
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||process.env.GITHUB_REF!=="refs/heads/main")
 throw Error("Wrong repository or branch");
const checkpoint=JSON.parse(await readFile("docs/checkpoints/pse-company-missing-source-articles-2026-11-27.json","utf8"));
const defs=checkpoint.pendingHistorical;
if(checkpoint.schema!=="pse-company-missing-source-articles-v1"||defs.length!==15||
 new Set(defs.map(d=>d.joomlaId)).size!==15||
 defs.some(d=>d.checkpointStatus!=="PENDING_NATIVE_WORDPRESS_POST_AND_MEDIA_IMPORT"||
  d.mediaStatus!=="ALL_ORIGINAL_SOURCE_IMAGES_HTTP_200"||d.categoryId!==1742||!d.imageCount))
 throw Error("PSE immutable original source checkpoint missing/inconsistent");
const expectedImageCount=defs.reduce((n,x)=>n+x.imageCount,0);
if(expectedImageCount!==93)throw Error("Historical source image inventory drift");
const manifest=JSON.parse(await readFile("docs/source/pse-company-15-joomla-created-seconds.json","utf8"));
const sourceRows=manifest.records;
if(manifest.schema!=="pse-company-joomla-created-second-v1"||
 manifest.source?.sha256!=="ec85436b4e7a475b13c2955e8e0adcbbae11c87e8502669b3ae77e51f2bc4f2c"||manifest.source?.table!=="ckiv4_content"||
 manifest.source?.joomlaCategoryId!==21||manifest.wordpressCategoryId!==1742||
 manifest.timezone!=="UTC+7"||sourceRows?.length!==15||
 new Set(sourceRows.map(r=>r.joomlaId)).size!==15||
 sourceRows.some((r,i)=>r.joomlaId!==defs[i].joomlaId||
  r.slug!==new URL(defs[i].sourceUrl).pathname.match(/\/[0-9]+-([a-z0-9-]+)\.html$/)?.[1]||
  r.created.slice(0,10)!==defs[i].createdDate||
  r.created!==r.publishUp||r.catid!==21||r.state!==1||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(r.created)))
 throw Error("Exact Joomla SQL created/publish_up source manifest mismatch");
if(apply&&process.env.PSE_COMPANY_FRESH_DB_BACKUP!=="yes")
 throw Error("Fresh verified WordPress DB backup is required before write");
const createdByJoomlaId=new Map(sourceRows.map(r=>[r.joomlaId,r.created]));
console.log("PSE_COMPANY_SOURCE_SQL_CREATED=PASS; rows=15; seconds=15");
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=name=>{const rows=lines.filter(s=>s.startsWith(name+"="));
 if(rows.length!==1)throw Error("Missing CMS origin "+name);
 const u=new URL(rows[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
  throw Error("Unsafe WordPress CMS origin");return u.origin;};
const wp=origin("WC_URL");
const browser=await chromium.launch({headless:true});
const sourceCtx=await browser.newContext({javaScriptEnabled:false});
await sourceCtx.route("**/*",r=>r.abort());
const adminCtx=await browser.newContext({viewport:{width:1366,height:900}});
const admin=await adminCtx.newPage();
const http=await request.newContext({timeout:55000});
let wpHttp=null;
const norm=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim().toLocaleLowerCase("vi");
const repoPrefix="https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/";
const report={schema:"pse-15-historical-original-company-news-v1",mode:apply?"APPLY":"AUDIT",
 startedAt:new Date().toISOString(),articleCount:defs.length,mediaCount:expectedImageCount,
 prepared:[],media:[],posts:[],warnings:[],phase:"start"};
const api=async(path,method="GET",data)=>admin.evaluate(async({path,method,data,nonce})=>{
 const r=await fetch(path,{method,credentials:"same-origin",cache:"no-store",headers:{
  "X-WP-Nonce":nonce,Accept:"application/json",...(data?{"Content-Type":"application/json"}:{})},
  ...(data?{body:JSON.stringify(data)}:{})});
 return{status:r.status,data:await r.json().catch(()=>null)};
},{path,method,data,nonce:report.nonce});
const retryGet=async(url)=>{
 let last;
 for(let n=0;n<3;n++){try{
  const r=await http.get(url,{timeout:60000});
  if(r.status()===200)return r;
  last="HTTP "+r.status();
 }catch(e){last=String(e?.message||e).slice(0,110)}
 if(n<2)await new Promise(resolve=>setTimeout(resolve,(n+1)*500));
 }
 throw Error("PSE original source HTTP200 required "+url+" "+last);
};
const unique=arr=>[...new Set(arr)];
try{
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await admin.locator("body").innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,"×":a*b,"*":a*b,x:a*b})[m[2]];
   const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Native login challenge missing");await f.fill(String(v));
  }
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("CMS authentication refused");
 if(apply){
  await admin.goto(wp+"/wp-admin/options-general.php",{waitUntil:"domcontentloaded",timeout:60000});
  if(!await admin.locator("#adminmenu").count())throw Error("WordPress timezone settings inaccessible");
  const zone=await admin.locator('select#timezone_string,select[name="timezone_string"]').first().inputValue();
  if(!["UTC+7","Asia/Ho_Chi_Minh","Asia/Saigon","Asia/Bangkok","Etc/GMT-7"].includes(zone))
   throw Error("WordPress timezone differs from original Joomla UTC+7 mapping: "+zone);
  console.log("PSE_COMPANY_WORDPRESS_TIMEZONE=PASS "+zone);
 }
 report.nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("No WordPress nonce");return(await r.text()).trim();});
 if(!/^[a-z0-9]{8,24}$/i.test(report.nonce))throw Error("WordPress REST nonce invalid");
 const [cat,old,latest1,latest2]=await Promise.all([
  api("/wp-json/wp/v2/categories?slug=tin-cong-ty&hide_empty=false&_fields=id,slug,parent"),
  api("/wp-json/wp/v2/posts/77291?context=edit&_fields=id,slug,date,status"),
  api("/wp-json/wp/v2/posts/83696?context=edit&_fields=id,slug,date,status,categories"),
  api("/wp-json/wp/v2/posts/83698?context=edit&_fields=id,slug,date,status,categories")
 ]);
 if(cat.status!==200||cat.data?.length!==1||Number(cat.data[0].id)!==1742||
  old.status!==200||old.data?.date?.slice(0,10)!=="2025-10-21"||
  latest1.status!==200||latest1.data?.status!=="publish"||
  latest2.status!==200||latest2.data?.status!=="publish"||
  !latest1.data.categories?.includes(1742)||!latest2.data.categories?.includes(1742))
  throw Error("WordPress source taxonomy/previously restored Post guards failed");
 const prepared=[];
 for(let offset=0;offset<defs.length;offset+=3){
  const batch=await Promise.all(defs.slice(offset,offset+3).map(async d=>{
   const url=new URL(d.sourceUrl);
   if(!d.sourceUrl.startsWith(repoPrefix)||url.protocol!=="https:"||url.hostname!=="www.pse.vn"||
     !/\/\d{3,5}-[a-z0-9-]+\.html$/.test(url.pathname)||
     !/^20\d\d-\d\d-\d\d$/.test(d.createdDate))
    throw Error("Untrusted original Joomla source identity "+d.joomlaId);
   const match=url.pathname.match(/\/(\d{3,5})-([a-z0-9-]+)\.html$/);
   if(Number(match?.[1])!==d.joomlaId)throw Error("Source URL article ID drift");
   const slug=match[2];
   const res=await retryGet(d.sourceUrl);
   const raw=await res.text();
   if(raw.length<1200||raw.length>1000000)throw Error("Untrusted Joomla article length "+d.joomlaId);
   const page=await sourceCtx.newPage();
   let article;
   try{
    await page.setContent('<base href="'+d.sourceUrl+'">'+raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{
     waitUntil:"domcontentloaded",timeout:30000});
    article=await page.evaluate(()=>{
     const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page");
     if(!root)throw Error("Missing Joomla articleBody");
     const title=(document.querySelector(".item-page h1,.item-page h2")?.textContent||"").replace(/\s+/g," ").trim();
     const clone=root.cloneNode(true);
     clone.querySelectorAll(".page-header,.article-info,.pager,.readmore,script,style,form,button,nav,svg,input,iframe,embed,object").forEach(el=>el.remove());
     const imgs=[...clone.querySelectorAll("img[src]")].map(img=>{
      const src=new URL(img.getAttribute("src"),document.baseURI).href;
      img.setAttribute("src",src);return src;
     });
     const text=(clone.textContent||"").replace(/\s+/g," ").trim();
     const allowed=new Set(["P","DIV","SPAN","BR","B","STRONG","I","EM","UL","OL","LI","H2","H3","H4",
      "TABLE","THEAD","TBODY","TR","TD","TH","A","IMG","BLOCKQUOTE","HR","FIGURE","FIGCAPTION"]);
     for(const el of [...clone.querySelectorAll("*")].reverse()){
      if(!el.parentNode)continue;
      if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue}
      for(const attr of [...el.attributes])
       if(!["href","src","alt","title","colspan","rowspan"].includes(attr.name))el.removeAttribute(attr.name);
      for(const key of ["src","href"]){
       if(!el.hasAttribute(key))continue;
       try{const u=new URL(el.getAttribute(key),document.baseURI);
        if(!["https:","http:"].includes(u.protocol))throw Error("Unsupported scheme");
        el.setAttribute(key,u.href);
       }catch{el.removeAttribute(key)}
      }
     }
     return{title,html:clone.innerHTML.trim(),text,images:imgs,tableCount:clone.querySelectorAll("table").length};
    });
   }finally{await page.close()}
   if(norm(article.title)!==norm(d.title)||article.text.length<110||
      article.images.length!==d.imageCount||article.html.length<450||
      article.images.some(img=>{
       const u=new URL(img);
       return u.protocol!=="https:"||!["www.pse.vn","pse.vn"].includes(u.hostname);
      }))
    throw Error("Joomla original article title/body/images changed "+d.joomlaId);
   const existing=await api("/wp-json/wp/v2/posts?context=edit&status=any&slug="+encodeURIComponent(slug)+
    "&per_page=10&_fields=id,slug,status,acf,categories,date,content,featured_media");
   if(existing.status!==200||!Array.isArray(existing.data)||existing.data.length>1)
    throw Error("Native WP Post slug ambiguous "+d.joomlaId);
   const prior=existing.data[0]||null;
   if(prior&&(String(prior.acf?.origin_page_id||"")!==String(d.joomlaId)||
    !prior.categories?.includes(1742)))
    throw Error("Native WP Post slug belongs to another Joomla identity "+d.joomlaId);
   return{sourceId:d.joomlaId,sourceUrl:d.sourceUrl,slug,title:d.title,date:createdByJoomlaId.get(d.joomlaId),
    images:article.images,html:article.html,text:article.text,tableCount:article.tableCount,prior};
  }));
  prepared.push(...batch);
  for(const a of batch){
   report.prepared.push({sourceId:a.sourceId,title:a.title,sourceDate:a.date,
    originalImages:a.images.length,oldWpId:a.prior?.id||null,tables:a.tableCount});
   console.log("PSE_HISTORICAL_COMPANY_SOURCE_PREPARED="+JSON.stringify(report.prepared.at(-1)));
  }
 }
 if(prepared.length!==15||prepared.reduce((n,a)=>n+a.images.length,0)!==93||
  unique(prepared.flatMap(a=>a.images)).length!==93)
  throw Error("Historical source inventory/media count drift (93/93 unique)");
 report.phase="original_sources_verified";
 console.log("PSE_HISTORICAL_COMPANY_PREFLIGHT=PASS all15 original articles/93 distinct images");
 const allImages=unique(prepared.flatMap(a=>a.images)),media=new Map();
 const memoName=new Map();
 const mimeByExt={jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",gif:"image/gif",webp:"image/webp"};
 // Joomla original images may use Unicode filenames (percent-encoded URLs).
 // Keep exact original bytes and order, but choose deterministic safe WordPress
 // filenames with a content-origin identity hash when needed. All WP files
 // remain native Media records and can be re-used after a partial retry.
 const metadata=allImages.map(sourceUrl=>{
  const u=new URL(sourceUrl),decoded=decodeURIComponent(u.pathname.split("/").at(-1));
  const ext=(decoded.match(/\.([a-z0-9]+)$/i)||[])[1]?.toLowerCase();
  const mime=mimeByExt[ext];
  if(!mime)throw Error("Unsupported original image type "+decoded+" source="+sourceUrl);
  const rawBase=decoded.slice(0,-(ext.length+1));
  const safeBase=rawBase.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[Đđ]/g,"d")
   .replace(/[^A-Za-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,45)||"source";
  const suffix=createHash("sha256").update(sourceUrl).digest("hex").slice(0,12);
  const filename=/^[A-Za-z0-9._-]+$/.test(decoded)&&!memoName.has(decoded)
   ?decoded:"pse-company-"+safeBase+"-"+suffix+"."+ext;
  if(memoName.has(filename)&&memoName.get(filename)!==sourceUrl)
   throw Error("Two different Joomla photos share normalized filename "+filename);
  memoName.set(filename,sourceUrl);
  return{sourceUrl,filename,ext,mime};
 });
 // Media registry lookups are READ ONLY and capped to five concurrent calls.
 // This preserves exact WP identities while reducing 93 sequential round-trips.
 for(let i=0;i<metadata.length;i+=5){
  await Promise.all(metadata.slice(i,i+5).map(async file=>{
   const stem=file.filename.replace(/\.[^.]+$/,"");
   const response=await api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(stem)+
    "&per_page=100&_fields=id,slug,source_url,media_details,mime_type");
   if(response.status!==200||!Array.isArray(response.data))
    throw Error("Native WP Media registry unavailable "+file.filename);
   const found=response.data.filter(m=>String(m.media_details?.file||"").split("/").at(-1)===file.filename);
   if(found.length>1)throw Error("Duplicate WP Media exact source filenames "+file.filename);
   const existing=found[0]||null;
   if(existing&&existing.mime_type!==file.mime)throw Error("Existing WP Media type differs "+file.filename);
   media.set(file.sourceUrl,{...file,existing});
  }));
 }
 console.log("PSE_HISTORICAL_COMPANY_IMAGE_FORMATS="+JSON.stringify(Object.fromEntries(
  [...new Set(metadata.map(x=>x.ext))].map(ext=>[ext,metadata.filter(x=>x.ext===ext).length]))));
 if(media.size!==93)throw Error("Media identity mapping incomplete");
 report.phase="native_media_registry_verified";
 if(!apply){
  console.log("PSE_HISTORICAL_COMPANY_READONLY_PREFLIGHT=PASS no WP writes; 15 Posts/93 original JPEGs");
 }else{
  wpHttp=await request.newContext({storageState:await adminCtx.storageState(),timeout:75000});
  const entries=[...media.values()];
  // Limit to one native Media POST at a time to protect the WordPress backend.
  // Sanitize all HTTP failures so protected session headers never enter public CI logs.
  for(let n=0;n<entries.length;n+=1){
   await Promise.all(entries.slice(n,n+1).map(async file=>{
    const res=await retryGet(file.sourceUrl);
    if(!String(res.headers()["content-type"]||"").toLowerCase().startsWith(file.mime))
     throw Error("Original source image HTTP content-type changed "+file.filename+" expected "+file.mime);
    const bytes=await res.body();
    const matchesMagic=file.mime==="image/jpeg"?(bytes[0]===255&&bytes[1]===216&&bytes[2]===255):
     file.mime==="image/png"?(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71):
     file.mime==="image/gif"?(bytes.toString("ascii",0,3)==="GIF"):
     file.mime==="image/webp"?(bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP"):false;
    if(bytes.length<200||bytes.length>9000000||!matchesMagic)
     throw Error("Original image file signature invalid "+file.filename);
    const digest=createHash("sha256").update(bytes).digest("hex");
    if(file.existing){
     const url=String(file.existing.source_url||"");
     const old=await http.get(new URL(url,wp).href,{timeout:50000});
     if(old.status()!==200||createHash("sha256").update(await old.body()).digest("hex")!==digest)
      throw Error("Existing same-filename Media has DIFFERENT bytes; abort "+file.filename);
     file.id=Number(file.existing.id);
    }else{
     let post;
     try{
      post=await wpHttp.post(wp+"/wp-json/wp/v2/media",{
       data:bytes,headers:{"X-WP-Nonce":report.nonce,Accept:"application/json","Content-Type":file.mime,
        "Content-Disposition":'attachment; filename="'+file.filename+'"',"Origin":wp,
        Referer:wp+"/wp-admin/"},timeout:75000
      });
     }catch(_transportFailure){
      // Playwright may embed WordPress cookies in raw network exceptions.
      // Never print/rethrow the exception. Verify whether the missing HTTP
      // response nonetheless committed the exact native WP Media image.
      let confirmed=0;
      for(let attempt=0;attempt<3&&!confirmed;attempt++){
       await new Promise(done=>setTimeout(done,1500*(attempt+1)));
       try{
        const probe=await api("/wp-json/wp/v2/media?context=edit&search="+
         encodeURIComponent(file.filename.replace(/\.[^.]+$/,""))+
         "&per_page=100&_fields=id,source_url,mime_type,media_details");
        if(probe.status!==200||!Array.isArray(probe.data))continue;
        const matches=probe.data.filter(m=>
         String(m.media_details?.file||"").split("/").at(-1)===file.filename&&m.mime_type===file.mime);
        if(matches.length!==1)continue;
        const remote=await retryGet(new URL(matches[0].source_url,wp).href);
        if(createHash("sha256").update(await remote.body()).digest("hex")===digest)
         confirmed=Number(matches[0].id);
       }catch{ /* Never expose protected network errors in logs. */ }
      }
      if(!Number.isSafeInteger(confirmed)||confirmed<1)
       throw Error("Native Media connection interrupted; file "+
        file.filename+" not verified. The importer can safely resume after WP recovers.");
      file.id=confirmed;
      console.log("PSE_HISTORICAL_COMPANY_MEDIA_LOST_RESPONSE_RECOVERED="+JSON.stringify({filename:file.filename,id:confirmed}));
     }
     if(post){
      const result=await post.json().catch(()=>({}));
      if(post.status()!==201||!Number.isSafeInteger(Number(result.id))||Number(result.id)<1)
       throw Error("Native WP Media refused "+file.filename+" HTTP "+post.status()+" code "+
        String(result.code||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,36));
      file.id=Number(result.id);
     }
    }
    file.sha256=digest;
    report.media.push({source:file.sourceUrl,name:file.filename,id:file.id,reused:!!file.existing,sha256:digest});
   }));
   console.log("PSE_HISTORICAL_COMPANY_MEDIA_PROGRESS="+report.media.length+"/93");
  }
  report.phase="original_media_uploaded";
  // Verify every WP file exists before creating any Post. Prevent orphaned
  // partially-published articles with missing source images.
  for(let i=0;i<entries.length;i+=3){
   await Promise.all(entries.slice(i,i+3).map(async file=>{
    const response=await api("/wp-json/wp/v2/media/"+file.id+
     "?context=edit&_fields=id,source_url,media_details,mime_type");
    const record=response.data,mfile=String(record?.media_details?.file||"").replace(/^\/+/,"");
    const url=new URL(String(record?.source_url||""),wp);
    if(response.status!==200||Number(record?.id)!==file.id||
       record?.mime_type!==file.mime||mfile.split("/").at(-1)!==file.filename||
       url.origin!==wp||url.pathname!=="/wp-content/uploads/"+mfile)
      throw Error("Native Media readback failed "+file.filename+" id="+file.id);
    file.publicUrl=url.href;
   }));
  }
  report.phase="media_verified";
  console.log("PSE_HISTORICAL_COMPANY_MEDIA=PASS verified 93/93 original image assets");
  for(const a of prepared){
   const photoMap=new Map(a.images.map(u=>[u,media.get(u).publicUrl]));
   const p=await sourceCtx.newPage();let article;
   try{
    await p.setContent("<div id='source-root'>"+a.html+"</div>",{waitUntil:"domcontentloaded",timeout:25000});
    article=await p.evaluate(list=>{
     const map=new Map(list),root=document.querySelector("#source-root");
     for(const img of root.querySelectorAll("img[src]")){
      const next=map.get(img.getAttribute("src"));
      if(!next)throw Error("Missing original image in WordPress Media mapping");
      img.setAttribute("src",next);
     }
     for(const link of root.querySelectorAll("a[href]")){
      const next=map.get(link.getAttribute("href"));
      if(next)link.setAttribute("href",next);
     }
     return{html:root.innerHTML.trim(),images:[...root.querySelectorAll("img[src]")].map(el=>el.src),
      text:(root.textContent||"").replace(/\s+/g," ").trim()};
    },[...photoMap]);
   }finally{await p.close()}
   if(article.images.length!==a.images.length||article.text.length<110||
      article.images.some((x,i)=>x!==photoMap.get(a.images[i])))
    throw Error("Original post media order/content altered "+a.sourceId);
   const excerpt=article.text.slice(0,156).trim(),featured=media.get(a.images[0]).id;
   let wpId=Number(a.prior?.id||0);
   if(!wpId){
    const created=await api("/wp-json/wp/v2/posts","POST",{
     title:a.title,slug:a.slug,date:a.date,categories:[1742],
     content:article.html,excerpt,status:"draft",featured_media:featured,
     pse_seo_description:excerpt,
     acf:{action:"PostDetails",key:"ssr-post",origin_page_id:String(a.sourceId)}
    });
    if(created.status!==201||!Number.isSafeInteger(Number(created.data?.id)))
     throw Error("Native historical WP Post draft creation failed "+a.sourceId+
      " code="+String(created.data?.code||created.status));
    wpId=Number(created.data.id);
   }
   const check=await api("/wp-json/wp/v2/posts/"+wpId+
    "?context=edit&_fields=id,slug,status,acf,categories,date,content,featured_media");
   const post=check.data;
   if(check.status!==200||Number(post?.id)!==wpId||post.slug!==a.slug||
     post.acf?.action!=="PostDetails"||post.acf?.key!=="ssr-post"||
     String(post.acf?.origin_page_id||"")!==String(a.sourceId)||
     post.date!==a.date||post.categories?.length!==1||
     Number(post.categories[0])!==1742||Number(post.featured_media)!==featured||
     !article.images.every(url=>String(post.content?.raw||"").includes(url)))
    throw Error("Native original WP Post source/date/content/Media integrity failed "+a.sourceId);
   if(post.status!=="publish"){
    const pub=await api("/wp-json/wp/v2/posts/"+wpId,"POST",{status:"publish"});
    if(pub.status!==200||pub.data?.status!=="publish")throw Error("Publish denied "+a.sourceId);
   }
   const published=await api("/wp-json/wp/v2/posts/"+wpId+"?_fields=id,slug,status,date,categories");
   if(published.status!==200||published.data?.status!=="publish"||published.data.slug!==a.slug||
      published.data.date!==a.date||!published.data.categories?.includes(1742))
    throw Error("Public native WP Post verify failed "+a.sourceId);
   report.posts.push({sourceId:a.sourceId,wpId,date:a.date,slug:a.slug,media:a.images.length});
   console.log("PSE_HISTORICAL_COMPANY_POST_PUBLISHED="+JSON.stringify(report.posts.at(-1)));
  }
  const preserved=await api("/wp-json/wp/v2/posts/77291?context=edit&_fields=id,date,slug,status");
  if(preserved.status!==200||preserved.data?.date?.slice(0,10)!=="2025-10-21")
   throw Error("2025 distinct Joomla article ownership changed");
  report.phase="native_posts_published_verified";
  if(report.posts.length!==15||report.posts.reduce((n,p)=>n+p.media,0)!==93)
   throw Error("Historical 15-Post/93-Media publication incomplete");
  console.log("PSE_HISTORICAL_COMPANY_RESTORE_PASS=15_POSTS_93_IMAGES_SECOND_PRECISION_2025_UNCHANGED");
 }
}finally{
 delete report.nonce;
 await mkdir("artifacts/pse-company-news",{recursive:true});
 await writeFile("artifacts/pse-company-news/historical-restore.json",JSON.stringify(report,null,2)+"\n");
 await wpHttp?.dispose();await http.dispose();await browser.close();
}
