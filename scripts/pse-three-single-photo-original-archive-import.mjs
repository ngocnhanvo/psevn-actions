/** Strict original Joomla #344/#348/#370 source import from verified exact historic publisher URL captures. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
const message="cms(pse): restore three original one-photo agriculture articles";
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||ev.head_commit?.message!==message||
 process.env.PSE_THREE_SINGLE_FRESH_BACKUP!=="yes")
 throw Error("Source 3-Post writer not authorized or fresh DB backup missing");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const docs=[
 {id:344,day:"2013-03-14",title:"Vì sao măng cụt ra trái cách năm?",
  media:"http://nongnghiep.vn/Upload/Image/2013/3/6/06032013140714_1.JPG",
  capture:"20140111185652",bytes:44770,
  sha:"4246317da9b3e3ea1e26759168061ef5ddf71a4e9e8049b00e3115440c20041d"},
 {id:348,day:"2013-03-18",title:"Phân bón giả hại nhà nông",
  media:"http://www.thesaigontimes.vn/Uploads/Articles/92473/15279_phan_050313.jpg",
  capture:"20131129125321",bytes:87201,
  sha:"198bb4babd0c6b0172983c26eb9324382e5189fecc92c3652e54deb63b1ccbfc"},
 {id:370,day:"2013-06-17",title:"Triển vọng cây mắc ca",
  media:"http://nongnghiep.vn/Upload/Image/2013/6/12/12062013131916.JPG",
  capture:"20141225082218",bytes:52327,
  sha:"355f3a5ec88c0e7baee051771e3a4b2c9867cff085a1ce44cac25fbcc6200b56"}
];
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 docs.some(d=>state.articles?.[d.id]?.status!=="quarantined"||
 state.articles[d.id].reason!=="Article contains non-local mandatory media"||
 !state.articles[d.id].source_url?.startsWith("https://www.pse.vn/hoat-dong-kinh-doanh/kien-thuc-nong-nghiep/"+d.id+"-")))
 throw Error("Original Joomla 3-Post source ownership changed");
const sha=b=>createHash("sha256").update(b).digest("hex");
const config=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function site(key){const matches=config.filter(x=>x.startsWith(key+"="));if(matches.length!==1)throw Error("Missing "+key);
 const u=new URL(matches[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))
  throw Error("Unsafe WordPress/frontend origin");return u.origin}
const wp=site("WC_URL"),front=site("WC_URL_CLIENT");
if(wp===front)throw Error("CMS/frontend same origin");
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:55000});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",r=>r.abort());
const dateCtx=await browser.newContext();
await dateCtx.route(/\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const admin=await browser.newPage();
const report={schema:"pse-three-original-single-image-source-cms-v1",sources:[344,348,370],
 originalPhotos:3,backedUp:true,media:[],posts:[],wrote:{newMedia:0,newPost:0,publishedPost:0},
 cleanup:[],success:false,buildTriggered:false};
const draftIds=[];
let api=null;
try{
 const prepared=[];
 // Verify all three source records before any CMS write.
 for(const d of docs){
  const source=state.articles[d.id].source_url;
  const r=await net.get(source,{timeout:65000,maxRedirects:2});
  if(r.status()!==200)throw Error("Source Joomla Article HTTP "+r.status()+" id "+d.id);
  const html=await r.text();
  if(html.length<250||html.length>8000000)throw Error("Source HTML length unsafe "+d.id);
  const page=await ctx.newPage();let data;
  try{
   await page.setContent('<base href="'+source+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""));
   data=await page.evaluate(()=>{
    const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page")||document.querySelector("article");
    const text=s=>String(s||"").replace(/\s+/g," ").trim();
    if(!root)return null;
    return{title:text(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent),
      body:text(root.textContent),images:[...root.querySelectorAll("img[src]")].map(x=>x.src),
      sourceMediaLinks:[...root.querySelectorAll("a[href]")].map(a=>a.href).filter(x=>/\.(?:jpe?g|png|gif|webp)(?:\?|$)/i.test(x))};
   });
  }finally{await page.close()}
  if(!data||data.title!==d.title||data.body.length<130||data.images.length!==1||
    data.images[0]!==d.media||data.sourceMediaLinks.some(x=>x!==d.media))
   throw Error("Exact Joomla Article title/body/original photo changed "+d.id);
  const datePage=await dateCtx.newPage();let date;
  try{date=await searchDate(datePage,{id:d.id,sourceUrl:source,title:data.title,opening:data.body.slice(0,350)})}
  finally{await datePage.close()}
  if(date.source!=="joomla_com_search_created"||date.day!==d.day)
   throw Error("Created day source ID/date mismatch "+d.id);
  const archive="https://web.archive.org/web/"+d.capture+"id_/"+d.media;
  const media=await net.get(archive,{timeout:55000,maxRedirects:0,failOnStatusCode:false});
  const bytes=await media.body(),mime=String(media.headers()["content-type"]||"").toLowerCase().split(";")[0];
  if(media.status()!==200||mime!=="image/jpeg"||bytes.length!==d.bytes||
    sha(bytes)!==d.sha||bytes.subarray(0,2).toString("hex")!=="ffd8"||
    bytes.subarray(-2).toString("hex")!=="ffd9")
   throw Error("Exact historic publisher image capture digest changed "+d.id);
  const slug=new URL(source).pathname.split("/").at(-1).replace(new RegExp("^"+d.id+"-"),"").replace(/\.html$/i,"");
  if(!/^[a-z0-9-]+$/.test(slug))throw Error("Untrusted Joomla source slug "+d.id);
  prepared.push({...d,source,html,body:data.body,slug,
   originalMediaBytes:bytes,filename:"pse-original-"+d.id+"-"+sha(d.media).slice(0,16)+".jpg"});
  console.log("PSE_THREE_SINGLE_SOURCE_PREFLIGHT="+JSON.stringify({id:d.id,day:d.day,title:d.title,
   bodyChars:data.body.length,originalPhotoSha256:d.sha,archiveExactURL:true,slug}));
 }
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const m=(await admin.locator("#loginform").innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const field=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("WordPress auth challenge field missing");
   await field.fill(String(n));}
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(admin.url().includes("wp-login")||!await admin.locator("#adminmenu").count())
  throw Error("Authenticated native WordPress editor inaccessible");
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP nonce not available");return(await r.text()).trim()});
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Unexpected WP REST nonce");
 api=(path,method="GET",body)=>admin.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",
   headers:{"X-WP-Nonce":nonce,...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return{status:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const cat=await api("/wp-json/wp/v2/categories?slug=kien-thuc-nong-nghiep&_fields=id,slug,parent");
 if(cat.status!==200||cat.data?.length!==1||Number(cat.data[0].id)!==1755||
 Number(cat.data[0].parent)!==0)throw Error("Native source agricultural knowledge taxonomy invalid");
 const catId=1755;
 const allPosts=new Map();
 for(const d of prepared){
  const p=await api("/wp-json/wp/v2/posts?context=edit&status=any&slug="+d.slug+
   "&per_page=10&_fields=id,slug,status,acf,date,categories,featured_media,content");
  if(p.status!==200||!Array.isArray(p.data)||p.data.length>1)throw Error("Native Post collision "+d.id);
  if(p.data[0]&&String(p.data[0].acf?.origin_page_id||"")!==String(d.id))
   throw Error("Existing unrelated original slug "+d.id);
  allPosts.set(d.id,p.data[0]||null);
 }
 const wanted=new Set(prepared.map(d=>d.filename)),medias=new Map();let lastId=0;
 for(let n=1;n<=80;n++){
  const r=await api("/wp-json/wp/v2/media?context=edit&per_page=100&page="+n+
   "&orderby=id&order=asc&_fields=id,mime_type,media_details");
  if(r.status!==200||!Array.isArray(r.data)||!Number.isInteger(r.pages)||r.pages<1||r.pages>80)
   throw Error("Original native Media registry incomplete page "+n);
  for(const m of r.data){
   if(Number(m.id)<=lastId)throw Error("Media registry changed sort order");
   lastId=Number(m.id);
   const filename=String(m.media_details?.file||"").split("/").at(-1);
   if(!wanted.has(filename))continue;
   if(medias.has(filename))throw Error("Duplicate original photo filename "+filename);
   medias.set(filename,m);
  }
  if(n>=r.pages)break;
 }
 console.log("PSE_THREE_SINGLE_NATIVE_PREFLIGHT="+JSON.stringify({originalPosts:3,originalPhotos:3,
  existingPosts:[...allPosts].map(([id,p])=>({id,postId:p?.id||null})),
  existingOriginalMedia:medias.size,category:catId,hasBackup:true}));
 for(const d of prepared){
  let media=medias.get(d.filename);
  if(!media){
   const b64=d.originalMediaBytes.toString("base64");
   const up=await admin.evaluate(async({b64,filename,nonce})=>{
    const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    const r=await fetch("/wp-json/wp/v2/media",{method:"POST",credentials:"same-origin",
     headers:{"X-WP-Nonce":nonce,"Content-Type":"image/jpeg",
      "Content-Disposition":'attachment; filename="'+filename+'"',"Accept":"application/json"},
     body:bytes});
    return{status:r.status,data:await r.json().catch(()=>null)};
   },{b64,filename:d.filename,nonce});
   if(up.status!==201||!Number.isSafeInteger(Number(up.data?.id)))
    throw Error("Native original Media upload receipt not confirmed "+d.id);
   media={id:up.data.id};report.wrote.newMedia++;
  }
  const m=await api("/wp-json/wp/v2/media/"+media.id+"?context=edit&_fields=id,mime_type,media_details");
  const file=String(m.data?.media_details?.file||"");
  if(m.status!==200||m.data.mime_type!=="image/jpeg"||
   file.split("/").at(-1)!==d.filename)
   throw Error("Native original source image filename/mime mismatch "+d.id);
  const wpUrl=wp+"/wp-content/uploads/"+file;
  const check=await net.get(wpUrl,{timeout:45000,failOnStatusCode:false});
  if(check.status()!==200||sha(await check.body())!==d.sha)
   throw Error("Original publisher archive bytes not identical in WordPress "+d.id);
  d.native=wpUrl;d.mediaId=Number(media.id);
  report.media.push({sourceId:d.id,id:d.mediaId,sha256:d.sha,filename:d.filename});
  const page=await ctx.newPage();let sanitized;
  try{
   await page.setContent('<base href="'+d.source+'">'+d.html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""));
   sanitized=await page.evaluate(({original,native})=>{
    const root=document.querySelector(".item-page [itemprop=articleBody]")||
     document.querySelector(".item-page")||document.querySelector("article");
    const c=root.cloneNode(true);
    for(const img of c.querySelectorAll("img[src]")){
     if(img.src!==original)throw Error("Unexpected mandatory source image");
     img.setAttribute("src",native);img.removeAttribute("srcset");img.removeAttribute("sizes");
     if(!img.getAttribute("alt"))img.setAttribute("alt","Ảnh gốc minh họa bài viết");
    }
    for(const a of c.querySelectorAll("a[href]")){
     let u;try{u=new URL(a.getAttribute("href")||"",document.baseURI)}catch{a.removeAttribute("href");continue}
     if(!["http:","https:"].includes(u.protocol)){a.removeAttribute("href");continue}
     if(u.href===original)a.setAttribute("href",native);
     else if(/\.(?:png|jpe?g|pdf|gif|webp)(?:\?|$)/i.test(u.href))
      throw Error("Other linked mandatory source asset not verified");
     else a.setAttribute("href",u.href);
    }
    c.querySelectorAll("script,style,form,button,nav,iframe,object,embed,video,audio,svg").forEach(x=>x.remove());
    const allowed=new Set(["P","DIV","SPAN","BR","B","STRONG","I","EM","UL","OL","LI",
     "H2","H3","H4","TABLE","THEAD","TBODY","TR","TD","TH","A","IMG","BLOCKQUOTE","HR","FIGURE","FIGCAPTION"]);
    for(const el of [...c.querySelectorAll("*")].reverse()){
     if(!el.parentNode)continue;
     if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue}
     for(const attr of [...el.attributes])
      if(!["href","src","alt","title","colspan","rowspan"].includes(attr.name))el.removeAttribute(attr.name);
    }
    return{html:c.innerHTML.trim(),text:(c.textContent||"").replace(/\s+/g," ").trim(),
     images:[...c.querySelectorAll("img[src]")].map(x=>x.getAttribute("src"))};
   },{original:d.media,native:wpUrl});
  }finally{await page.close()}
  if(sanitized.text!==d.body||sanitized.images.length!==1||sanitized.images[0]!==wpUrl||
   sanitized.html.length<100)throw Error("Original Joomla sanitized text/photo parity mismatch "+d.id);
  let id=Number(allPosts.get(d.id)?.id||0);
  if(!id){
   const excerpt=sanitized.text.slice(0,159);
   const created=await api("/wp-json/wp/v2/posts","POST",{
    title:d.title,slug:d.slug,date:d.day+"T00:00:00",status:"draft",
    categories:[catId],content:sanitized.html,featured_media:d.mediaId,
    excerpt,pse_seo_description:excerpt,
    acf:{action:"PostDetails",key:"ssr-post",origin_page_id:String(d.id)}});
   if(created.status!==201||!Number.isSafeInteger(Number(created.data?.id)))
    throw Error("Native original Post draft creation not confirmed "+d.id);
   id=Number(created.data.id);draftIds.push({sourceId:d.id,id});report.wrote.newPost++;
  }
  const read=await api("/wp-json/wp/v2/posts/"+id+"?context=edit&_fields=id,status,slug,date,acf,categories,content,featured_media");
  if(read.status!==200||read.data.slug!==d.slug||String(read.data.acf?.origin_page_id)!==String(d.id)||
   read.data.date?.slice(0,10)!==d.day||!read.data.categories?.includes(catId)||
   Number(read.data.featured_media)!==d.mediaId||
   !String(read.data.content?.raw||"").includes(d.filename))
   throw Error("Original source native Post readback mismatch "+d.id);
  if(read.data.status!=="publish"){
   if(read.data.status!=="draft")throw Error("Unexpected existing original Post status "+d.id);
   const saved=await api("/wp-json/wp/v2/posts/"+id,"POST",{status:"publish"});
   if(saved.status!==200||saved.data.status!=="publish")throw Error("Native original Post publication failed "+d.id);
   report.wrote.publishedPost++;
  }
  report.posts.push({sourceId:d.id,wpId:id,createdDay:d.day,sourcePhotoSha256:d.sha,status:"publish"});
  console.log("PSE_THREE_SINGLE_ORIGINAL_POST_PASS="+JSON.stringify(report.posts.at(-1)));
 }
 if(report.posts.length!==3||report.media.length!==3)throw Error("Original source batch incomplete");
 report.success=true;
 console.log("PSE_THREE_SINGLE_ORIGINAL_NATIVE_APPLY_PASS="+JSON.stringify({
  sourceIds:[344,348,370],nativePublished:3,sourceCreatedDays:docs.map(d=>d.day),
  originalExactPublisherArchiveJPEG:3,wpMediaSha256Match:3,writerScopeOnly:true,
  newPostWrites:report.wrote.newPost,newMediaWrites:report.wrote.newMedia,
  buildTriggered:false
 }));
}finally{
 if(api){
  for(const d of draftIds){
   if(report.posts.some(p=>p.sourceId===d.sourceId&&p.status==="publish"))continue;
   try{
    const read=await api("/wp-json/wp/v2/posts/"+d.id+"?context=edit&_fields=id,status,acf");
    if(read.status===200&&read.data.status==="draft"&&String(read.data.acf?.origin_page_id)===String(d.sourceId)){
     const trash=await api("/wp-json/wp/v2/posts/"+d.id,"POST",{status:"trash"});
     const check=await api("/wp-json/wp/v2/posts/"+d.id+"?context=edit&_fields=id,status");
     if(trash.status!==200||check.status!==200||check.data.status!=="trash")
      throw Error("Original temporary draft cleanup not verified");
     report.cleanup.push({sourceId:d.sourceId,draftId:d.id,status:"trash",noActiveDraft:true});
    }
   }catch(e){report.cleanup.push({sourceId:d.sourceId,draftId:d.id,cleanupError:String(e?.message||e).slice(0,140)})}
  }
 }
 await mkdir("artifacts/pse-three-single-original",{recursive:true});
 await writeFile("artifacts/pse-three-single-original/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await ctx.close();await dateCtx.close();await browser.close();
 if(report.cleanup.some(c=>c.cleanupError))process.exitCode=1;
}
