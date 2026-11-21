/** Original Joomla #1640: import exactly two URL-verified publisher captures and one native WP Post.
 * Provenance: original exact Joomla source + com_search CREATED day + pinned Archive captures.
 * This is a guarded CMS write, NEVER a public Astro content hardcode.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
const message="cms(pse): restore Joomla 1640 original article with two exact publisher archives";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||event.head_commit?.message!==message||
 process.env.PSE_1640_FRESH_DB_BACKUP_VERIFIED!=="yes")
 throw Error("Unapproved Joomla #1640 source CMS writer or missing fresh backup");
const legacy=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const entry=legacy.articles?.["1640"];
const source="https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/1640-nhung-giai-dieu-dep-ve-dong-nam-bo.html";
const headline="Những giai điệu đẹp về Đông Nam Bộ",sourceDay="2025-05-14";
if(legacy.schema!=="pse-legacy-article-migration-v1"||!legacy.backup_verified||
 entry?.source_url!==source||entry.status!=="quarantined")
 throw Error("Joomla #1640 source identity or quarantine unexpectedly changed");
const pictures=[
 {url:"https://www.baobariavungtau.com.vn/dataimages/202505/original/images2017799_Ca_kh_c.jpg",captured:"20250625183814",sha:"ee965c7187188869a123688a3d9d4d2ada804724ed952fd252a68896add813f4",bytes:272169},
 {url:"https://www.baobariavungtau.com.vn/dataimages/202505/original/images2017800_16_2025_acondao.jpg",captured:"20250624212508",sha:"bb8a5f29dc3abbc3de791b10d5b85c74aa7bb6905386a3c6a9e178a626b83ae6",bytes:333693}
].map((item,index)=>({...item,index,filename:"pse-original-1640-"+createHash("sha256").update(item.url).digest("hex").slice(0,16)+".jpg",
 native:null,wpId:null,originalBytes:null,existing:false}));
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function origin(key){const rows=env.filter(x=>x.startsWith(key+"="));if(rows.length!==1)throw Error("Missing "+key);
 const u=new URL(rows[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))
  throw Error("Unexpected WP/frontend origin");return u.origin;}
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("WordPress frontend origin overlap");
const sha=b=>createHash("sha256").update(b).digest("hex");
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:55000});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",r=>r.abort());
const admin=await browser.newPage();
let api=null,postId=null,postPublished=false,createdDraftId=null;
const newlyUploadedMedia=[];
const report={schema:"pse-original-1640-exact-archive-native-import-v1",sourceId:1640,
 source,originalCreatedDay:sourceDay,sourceDateMethod:"joomla_com_search_created",
 backup:true,scope:{maxPosts:1,maxMedia:2,otherWpWrites:0},media:[],cmsPost:null,
 didBuild:false,success:false,cleanup:[],sourceProvenance:"original-url-archive-capture-sha256"};
try{
 const sourceRes=await net.get(source,{timeout:65000,maxRedirects:2});
 if(sourceRes.status()!==200)throw Error("Original Joomla article HTTP "+sourceRes.status());
 const raw=await sourceRes.text();
 if(raw.length<250||raw.length>8000000)throw Error("Unsafe Joomla original HTML size");
 const page=await ctx.newPage();
 await page.setContent('<base href="'+source+'">'+raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
 const info=await page.evaluate(()=>{
  const root=document.querySelector(".item-page [itemprop=articleBody]")||
   document.querySelector(".item-page")||document.querySelector("article");
  if(!root)return null;
  const text=s=>String(s||"").replace(/\s+/g," ").trim();
  return{title:text(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent),
   bodyText:text(root.textContent),
   imageSrc:[...root.querySelectorAll("img[src]")].map(x=>new URL(x.getAttribute("src"),document.baseURI).href)};
 });
 if(!info||info.title!==headline||info.bodyText.length!==4421||
  info.imageSrc.length!==2||pictures.some((p,i)=>p.url!==info.imageSrc[i]))
  throw Error("Joomla exact #1640 heading/body/source media changed");
 await page.close();
 const dateCtx=await browser.newContext({viewport:{width:1366,height:850}});
 await dateCtx.route(/\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
 const datePage=await dateCtx.newPage();let date;
 try{date=await searchDate(datePage,{id:1640,sourceUrl:source,title:headline,opening:info.bodyText.slice(0,350)})}
 finally{await dateCtx.close()}
 if(date?.source!=="joomla_com_search_created"||date.day!==sourceDay)
  throw Error("Joomla exact created day cannot be independently verified");
 // Reconfirm exact original archive URLs AND bytes, not merely similar photos.
 for(const p of pictures){
  const archive="https://web.archive.org/web/"+p.captured+"id_/"+p.url;
  const r=await net.get(archive,{timeout:45000,maxRedirects:0,failOnStatusCode:false});
  const type=String(r.headers()["content-type"]||"").toLowerCase().split(";")[0];
  const buf=await r.body();
  if(r.status()!==200||type!=="image/jpeg"||buf.length!==p.bytes||sha(buf)!==p.sha||
   buf.subarray(0,2).toString("hex")!=="ffd8"||buf.subarray(-2).toString("hex")!=="ffd9")
   throw Error("Original publisher archive capture bytes no longer match "+p.index);
  p.originalBytes=buf;
  console.log("PSE_1640_ARCHIVED_SOURCE_IMAGE_PASS="+JSON.stringify({index:p.index,originalUrl:p.url,
   capture:p.captured,bytes:buf.length,sha256:p.sha}));
 }
 // Only protected WP REST, via the standard authenticated WordPress admin.
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=(await admin.locator("#loginform").innerText()).slice(0,600);
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,"×":a*b,x:a*b,"*":a*b})[m[2]];
   const fld=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await fld.count())throw Error("Native WordPress login math challenge missing");
   await fld.fill(String(v))}
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(admin.url().includes("wp-login")||!await admin.locator("#adminmenu").count())
  throw Error("Native WordPress protected authentication failed");
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Native WordPress REST nonce unavailable");
  return(await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Unexpected WP REST nonce");
 api=async(path,method="GET",body)=>{
  const payload=await admin.evaluate(async({path,method,body,nonce})=>{
   const r=await fetch(path,{method,credentials:"same-origin",headers:{
     "X-WP-Nonce":nonce,"Accept":"application/json",...(body?{"Content-Type":"application/json"}:{})
    },...(body?{body:JSON.stringify(body)}:{})});
   return{http:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),
    data:await r.json().catch(()=>null)};
  },{path,method,body,nonce});
  return payload;
 };
 const [table,cats,posts]=await Promise.all([
  api("/wp-json/tablepress/v1/table/pse_01_vi"),
  api("/wp-json/wp/v2/categories?slug=tin-cong-ty&hide_empty=false&_fields=id,slug,parent,name"),
  api("/wp-json/wp/v2/posts?context=edit&status=any&slug=nhung-giai-dieu-dep-ve-dong-nam-bo&per_page=10&_fields=id,slug,status,acf,categories,date,content,featured_media")
 ]);
 if(table.http!==200||table.data?.items?.length!==3||
    cats.http!==200||!Array.isArray(cats.data)||cats.data.length!==1||
    cats.data[0].id!==1742||posts.http!==200||!Array.isArray(posts.data)||posts.data.length>1)
   throw Error("Native WordPress Joomla Article category, Page or existing Post registry changed");
 const parentId=Number(table.data.items[0]?.categoryId);
 const parentSlug=String(table.data.items[0]?.categorySlug||"");
 const parent=await api("/wp-json/wp/v2/categories?slug="+encodeURIComponent(parentSlug)+"&_fields=id,slug,name");
 if(parent.http!==200||parent.data?.length!==1||parent.data[0].id!==parentId||
   Number(cats.data[0].parent)!==parentId||parentId<1)
  throw Error("PSE native company/tin-cong-ty category lineage invalid");
 const existingPost=posts.data[0]||null;
 if(existingPost&&String(existingPost.acf?.origin_page_id||"")!=="1640")
  throw Error("Conflicting native WordPress Post with original slug");
 if(existingPost&&existingPost.status!=="publish")throw Error("Existing original #1640 draft requires manual review; no overwrite");
 const registry=new Map(),seenIds=new Set();let prev=0;
 for(let n=1;n<=90;n++){
  const r=await api("/wp-json/wp/v2/media?context=edit&per_page=100&page="+n+
   "&orderby=id&order=asc&_fields=id,media_details,mime_type,alt_text");
  if(r.http!==200||!Array.isArray(r.data)||!Number.isInteger(r.pages)||r.pages<1||r.pages>90)
   throw Error("Native Media registry incomplete page "+n);
  for(const m of r.data){
   if(Number(m.id)<=prev||seenIds.has(m.id))throw Error("WP Media registry ID not strictly increasing");
   prev=Number(m.id);seenIds.add(m.id);
   const file=String(m.media_details?.file||"").split("/").at(-1);
   if(pictures.some(x=>x.filename===file)){
    if(registry.has(file))throw Error("Duplicate source archive Media filename");
    registry.set(file,m);
   }
  }
  if(n===r.pages)break;
 }
 console.log("PSE_1640_NATIVE_IMPORT_PREFLIGHT="+JSON.stringify({sourceId:1640,sourceDate:sourceDay,
  nativeNewsCategory:cats.data[0].id,newsRootCategory:parentId,existingPosts:posts.data.length,
  exactExistingMedia:registry.size,sourceArticleChars:info.bodyText.length,archiveProof:2,
  freshBackup:true,writeScope:"ONLY_ORIGINAL_1640"}));
 for(const p of pictures){
  const found=registry.get(p.filename);
  if(found){
   const file=String(found.media_details?.file||"");
   if(found.mime_type!=="image/jpeg"||!file||file.split("/").at(-1)!==p.filename)
    throw Error("Original #1640 existing Media identity collision");
   p.wpId=Number(found.id);p.native=wp+"/wp-content/uploads/"+file;p.existing=true;
  }else{
   // Raw WordPress attachment REST API, one upload at a time. Do not blindly
   // retry a POST after transport ambiguity; next run reconciles filenames.
   const data=p.originalBytes.toString("base64");
   const result=await admin.evaluate(async({nonce,filename,data})=>{
    const raw=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
    const r=await fetch("/wp-json/wp/v2/media",{method:"POST",credentials:"same-origin",
     headers:{"X-WP-Nonce":nonce,"Content-Type":"image/jpeg",
      "Content-Disposition":'attachment; filename="'+filename+'"',"Accept":"application/json"},
     body:raw});
    return{http:r.status,data:await r.json().catch(()=>null)};
   },{nonce,filename:p.filename,data});
   if(result.http!==201||!Number.isSafeInteger(Number(result.data?.id)))
    throw Error("Original archive Media upload failed index "+p.index+" HTTP "+result.http);
   p.wpId=Number(result.data.id);
   newlyUploadedMedia.push({id:p.wpId,filename:p.filename,sha:p.sha});
  }
  const m=await api("/wp-json/wp/v2/media/"+p.wpId+
   "?context=edit&_fields=id,mime_type,media_details,alt_text");
  const file=String(m.data?.media_details?.file||"");
  if(m.http!==200||m.data?.mime_type!=="image/jpeg"||file.split("/").at(-1)!==p.filename)
   throw Error("Source archive native attachment readback mismatched index "+p.index);
  p.native=wp+"/wp-content/uploads/"+file;
  const check=await net.get(p.native,{timeout:45000,failOnStatusCode:false});
  if(check.status()!==200||sha(await check.body())!==p.sha)
   throw Error("WordPress media original byte digest mismatch index "+p.index);
  if(!String(m.data.alt_text||"").includes(headline)){
   const update=await api("/wp-json/wp/v2/media/"+p.wpId,"POST",{
    alt_text:headline+" – ảnh "+(p.index+1),title:headline+" – ảnh "+(p.index+1)});
   if(update.http!==200)throw Error("Original Media ALT cannot be saved");
  }
  report.media.push({id:p.wpId,filename:p.filename,originalUrl:p.url,
   sha256:p.sha,verifiedNativeBytes:true,created:!p.existing});
 }
 const page2=await ctx.newPage();
 await page2.setContent('<base href="'+source+'">'+raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
 const article=await page2.evaluate(mapping=>{
  const root=document.querySelector(".item-page [itemprop=articleBody]")||
   document.querySelector(".item-page")||document.querySelector("article");
  const copy=root.cloneNode(true);
  const byOriginal=new Map(mapping.map(x=>[x.url,x.native]));
  for(const image of copy.querySelectorAll("img")){
   const url=new URL(image.getAttribute("src")||"",document.baseURI).href;
   const target=byOriginal.get(url);
   if(!target)throw Error("Source image missing original verified mapping "+url);
   image.setAttribute("src",target);
   image.removeAttribute("srcset");image.removeAttribute("sizes");
   image.setAttribute("loading","lazy");image.setAttribute("decoding","async");
   if(!image.getAttribute("alt"))image.setAttribute("alt","Những giai điệu đẹp về Đông Nam Bộ – ảnh");
  }
  for(const a of copy.querySelectorAll("a[href]")){
   let link;
   try{link=new URL(a.getAttribute("href"),document.baseURI)}catch{a.removeAttribute("href");continue}
   if(!["http:","https:"].includes(link.protocol)){a.removeAttribute("href");continue}
   a.setAttribute("href",byOriginal.get(link.href)||link.href);
  }
  copy.querySelectorAll("script,style,form,button,nav,svg,input,iframe,object,embed,video,audio").forEach(x=>x.remove());
  const allowed=new Set(["P","DIV","SPAN","BR","B","STRONG","I","EM","UL","OL","LI","H2","H3",
   "H4","TABLE","THEAD","TBODY","TR","TD","TH","A","IMG","BLOCKQUOTE","HR","FIGURE","FIGCAPTION"]);
  for(const el of [...copy.querySelectorAll("*")].reverse()){
   if(!el.parentNode)continue;
   if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue}
   for(const a of [...el.attributes])
    if(!["href","src","alt","title","colspan","rowspan","loading","decoding"].includes(a.name))
     el.removeAttribute(a.name);
  }
  return{html:copy.innerHTML.trim(),text:(copy.textContent||"").replace(/\s+/g," ").trim(),
   images:[...copy.querySelectorAll("img[src]")].map(x=>x.getAttribute("src"))};
 },pictures.map(x=>({url:x.url,native:x.native})));
 await page2.close();
 if(article.images.length!==2||article.images.some((x,i)=>x!==pictures[i].native)||
   article.text.length!==4421||article.html.length<150)
  throw Error("Sanitized exact Joomla source body and native media parity failed");
 const desc=article.text.slice(0,159).trim();
 if(existingPost?.status==="publish"){
  if(!existingPost.categories?.includes(parentId)||!existingPost.categories?.includes(1742)||
   existingPost.date?.slice(0,10)!==sourceDay||Number(existingPost.featured_media)!==pictures[0].wpId||
   pictures.some(x=>!String(existingPost.content?.raw||"").includes(x.filename)))
   throw Error("Published original #1640 exists but source parity differs; refuse overwrite");
  postId=existingPost.id;postPublished=true;
  console.log("PSE_1640_ALREADY_PUBLISHED_POST_SOURCE_PASS="+JSON.stringify({id:postId,photos:2,noPostWrite:true}));
 }else{
  const created=await api("/wp-json/wp/v2/posts","POST",{
   title:headline,slug:"nhung-giai-dieu-dep-ve-dong-nam-bo",
   categories:[parentId,1742],content:article.html,featured_media:pictures[0].wpId,
   date:sourceDay+"T00:00:00",excerpt:desc,status:"draft",pse_seo_description:desc,
   acf:{action:"PostDetails",key:"ssr-post",origin_page_id:"1640"}
  });
  if(created.http!==201||!Number.isSafeInteger(Number(created.data?.id)))
   throw Error("Source native 1640 Post draft create failed HTTP "+created.http);
  postId=Number(created.data.id);createdDraftId=postId;
  const read=await api("/wp-json/wp/v2/posts/"+postId+
   "?context=edit&_fields=id,status,slug,title,content,acf,featured_media,categories,date");
  if(read.http!==200||read.data?.status!=="draft"||
    read.data.slug!=="nhung-giai-dieu-dep-ve-dong-nam-bo"||
    read.data.acf?.action!=="PostDetails"||read.data.acf?.key!=="ssr-post"||
    String(read.data.acf?.origin_page_id)!=="1640"||
    read.data.date?.slice(0,10)!==sourceDay||!read.data.categories?.includes(parentId)||
    !read.data.categories?.includes(1742)||Number(read.data.featured_media)!==pictures[0].wpId||
    pictures.some(x=>!String(read.data.content?.raw||"").includes(x.filename)))
   throw Error("Native original 1640 draft readback did not preserve source");
  const pub=await api("/wp-json/wp/v2/posts/"+postId,"POST",{status:"publish"});
  if(pub.http!==200||pub.data?.status!=="publish")
   throw Error("Native original 1640 publication failed");
  postPublished=true;
 }
 const check=await api("/wp-json/wp/v2/posts/"+postId+
  "?context=edit&_fields=id,status,slug,title,content,acf,featured_media,categories,date");
 if(check.http!==200||check.data.status!=="publish"||
  String(check.data.acf?.origin_page_id)!=="1640"||check.data.date?.slice(0,10)!==sourceDay||
  check.data.slug!=="nhung-giai-dieu-dep-ve-dong-nam-bo"||
  pictures.some(x=>!String(check.data.content?.raw||"").includes(x.filename)))
  throw Error("Final published Joomla 1640 native source parity readback failed");
 report.cmsPost={id:postId,status:"publish",title:headline,
  date:check.data.date,sourceCreatedDay:sourceDay,originalMediaIds:pictures.map(x=>x.wpId)};
 report.success=true;
 console.log("PSE_1640_ARCHIVED_ORIGINAL_NATIVE_APPLY_PASS="+JSON.stringify({
  postId,originalSourceId:1640,sourceCreatedDay:sourceDay,originalJoomlaTextChars:4421,
  originalPublisherCapturedPhotos:2,matchedOriginalSourceUrls:2,
  archivedJPEGDigestsAndNativeBytes:true,wordpressOwned:true,
  unrelatedPostsChanged:0,buildTriggered:false
 }));
}finally{
 if(!postPublished&&api){
  if(createdDraftId){
   try{
    const b=await api("/wp-json/wp/v2/posts/"+createdDraftId+
     "?context=edit&_fields=id,status,acf");
    if(b.http===200&&b.data.status==="draft"&&String(b.data.acf?.origin_page_id)==="1640"){
     const del=await api("/wp-json/wp/v2/posts/"+createdDraftId+"?force=true","DELETE");
     const after=await api("/wp-json/wp/v2/posts/"+createdDraftId+"?context=edit");
     if(del.http!==200||after.http!==404)throw Error("Exact draft cleanup failed");
     report.cleanup.push({kind:"newSourcePostDraft",id:createdDraftId,deleted:true});
    }
   }catch(e){report.cleanup.push({kind:"draft",id:createdDraftId,error:String(e?.message||e).slice(0,150)})}
  }
  for(const media of newlyUploadedMedia.reverse()){
   try{
    const b=await api("/wp-json/wp/v2/media/"+media.id+
     "?context=edit&_fields=id,media_details");
    const file=String(b.data?.media_details?.file||"").split("/").at(-1);
    if(b.http===200&&file===media.filename){
     const del=await api("/wp-json/wp/v2/media/"+media.id+"?force=true","DELETE");
     const after=await api("/wp-json/wp/v2/media/"+media.id+"?context=edit");
     if(del.http!==200||after.http!==404)throw Error("Exact temporary Media cleanup failed");
     report.cleanup.push({kind:"newOriginalMedia",id:media.id,deleted:true});
    }
   }catch(e){report.cleanup.push({kind:"media",id:media.id,error:String(e?.message||e).slice(0,150)})}
  }
 }
 await mkdir("artifacts/pse-original-1640-native",{recursive:true});
 await writeFile("artifacts/pse-original-1640-native/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await ctx.close();await browser.close();
}
