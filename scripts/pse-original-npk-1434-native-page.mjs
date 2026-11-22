/** Authenticated one-record WordPress native Page restore of exact Joomla #1434.
 * Owner PSE 19 original photos SHA-pinned to independently audited public/FTPS bytes.
 * Third-party dpm.vn image keeps original src, not imported. No Astro or Product edits.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const signed="cms(pse): restore original NPK 1434 Page and owned photos";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 event.head_commit?.message!==signed||process.env.PSE_NPK_ORIGINAL_FRESH_BACKUP!=="yes")
 throw Error("Unsigned NPK #1434 CMS writer or rollback absent");
const input=JSON.parse(await readFile("inputs/npk/report.json","utf8"));
const article=JSON.parse(await readFile("inputs/npk/source-1434.json","utf8"));
const dateProof=JSON.parse(await readFile("inputs/date/report.json","utf8"));
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const original=state.articles?.[1434];
const sourceSHA="128f19004566d9635f5fd790b2695414384da294f85f0775e81806a961b7e1ce";
const wp="https://admin-pse.webnvn.com",front="https://pse.webnvn.com",slug="npk-phu-my",
 title="NPK Phú Mỹ",key="pse-historical-npk-1434";
const hash=b=>createHash("sha256").update(b).digest("hex");
const norm=x=>String(x||"").normalize("NFKC").replace(/\s+/g," ").trim();
const originalDate="2021-06-17T00:00:00";
if(state.schema!=="pse-legacy-article-migration-v1"||
 original?.status!=="quarantined"||!original?.source_url?.endsWith("/1434-npk-phu-my.html")||
 input.schema!=="pse-original-1434-full-public-source-and-images-v1"||!input.success||
 input.sourceId!==1434||input.sourceBodySha256!==sourceSHA||
 input.originalImages?.length!==20||input.exactPsePhotoCount!==19||input.externalOriginalPhotoCount!==1||
 !input.originalTextVerified||input.originalTitle!==title||
 norm(article.body).length!==6108||hash(norm(article.body))!==sourceSHA||
 article.title!==title||article.tableCount!==3||article.imageUrls?.length!==20||
 dateProof.schema!=="pse-1434-original-public-com-search-created-day-v1"||
 dateProof.date?.id!==1434||dateProof.date?.day!=="2021-06-17"||
 dateProof.date?.source!=="joomla_com_search_created"||
 dateProof.date?.title!==title)
 throw Error("Independent Joomla public body/date/owner-media fixture mismatch");
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function origin(key){
 const lines=vars.filter(x=>x.startsWith(key+"="));
 if(lines.length!==1)throw Error("Missing original PSE WP runtime endpoint "+key);
 const val=lines[0].slice(key.length+1).replace(/^['"]|['"]$/g,"").replace(/\/$/,"");
 const url=new URL(val);if(url.origin!==val||url.protocol!=="https:"||url.username||url.password||url.search||url.hash)throw Error("Invalid configured target");
 return url.origin;
}
if(origin("WC_URL")!==wp||origin("WC_URL_CLIENT")!==front)throw Error("Wrong PSE WP/frontend destination");
const files=new Map(),seenNames=new Set();
for(const asset of input.originalImages){
 const idx=asset.index;
 if(!Number.isInteger(idx)||idx<0||idx>=20||
  asset.sourcePath!==new URL(article.imageUrls[idx]).pathname||
  asset.sourceUrl!==article.imageUrls[idx])throw Error("Wrong original photo image ordering "+idx);
 if(asset.externalOriginal){
  if(idx!==4||asset.ownerSite||new URL(asset.sourceUrl).hostname!=="dpm.vn"||
   asset.thirdPartyPolicy!=="preserve_exact_original_absolute_src"||asset.assetName)
   throw Error("Unexpected original third-party-only photo");
  continue;
 }
 if(!asset.ownerSite||!["pse.vn","www.pse.vn"].includes(new URL(asset.sourceUrl).hostname)||
  !/^[a-f0-9]{64}$/.test(asset.sha256||"")||
  !Number.isSafeInteger(asset.expectedMediaBytes)||asset.expectedMediaBytes<180||
  !asset.assetName||!/^original-index-\d\d\.(?:png|jpg)$/.test(asset.assetName))
  throw Error("Invalid original owned image identity "+idx);
 const filename=asset.originalSourceFilename;
 if(!/^[a-zA-Z0-9_.-]+\.(?:png|jpg)$/i.test(filename)||filename.length>100||
  seenNames.has(filename.toLowerCase()))throw Error("Unsafe or duplicate original PSE basename "+idx);
 seenNames.add(filename.toLowerCase());
 const bytes=await readFile("inputs/npk/"+asset.assetName);
 if(bytes.length!==asset.expectedMediaBytes||hash(bytes)!==asset.sha256||
   (filename.endsWith(".png")&&bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")||
   (filename.endsWith(".jpg")&&bytes.subarray(0,3).toString("hex")!=="ffd8ff"))
  throw Error("Original Joomla uploaded file SHA/magic mismatch "+idx);
 files.set(idx,{...asset,bytes});
}
if(files.size!==19)throw Error("Exactly 19 original PSE hosted images required");
const out="artifacts/pse-native-original-npk-1434";
await mkdir(out,{recursive:true});
const report={schema:"pse-original-npk-1434-wp-native-page-v1",sourceId:1434,
 wpHost:wp,sourceDate:"2021-06-17",dateEvidence:"joomla_com_search_created",
 bodySha256:sourceSHA,originalPsePhotos:19,preservedOutsidePhotos:1,
 imageMedia:[],postWrites:[],postId:null,slug,preflight:[],
 noWooProductWrites:true,noWordPressCategoryWrites:true,noRedirectWrites:true,
 sourceOriginalMediaVerified:true,backupVerified:true,result:"STARTED"};
const save=()=>writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:850}}),parserCtx=await browser.newContext({javaScriptEnabled:false});
await parserCtx.route("**/*",r=>r.abort());
const page=await ctx.newPage(),parser=await parserCtx.newPage(),net=await request.newContext({timeout:50000});
let nonce;
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const challenge=(await page.locator("#loginform").innerText()).slice(0,850);
  const m=challenge.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],value=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Unrecognized native WP admin challenge");
   await f.fill(String(value));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())throw Error("WordPress administrative authorization missing");
 nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const res=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!res.ok)throw Error("REST nonce unavailable");
  return(await res.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Invalid native WP REST nonce");
 const api=async(path,method="GET",payload)=>page.evaluate(async({path,method,payload,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,
    Accept:"application/json",...(payload?{"Content-Type":"application/json"}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{})});
  return {http:r.status,body:await r.json().catch(()=>null)};
 },{path,method,payload,nonce});
 // Check the target slug across all native post types *before* any photo upload.
 const aliases={};
 for(const type of ["pages","posts","product"]){
  const q=await api("/wp-json/wp/v2/"+type+"?context=edit&status=any&slug="+slug+
    "&per_page=30&_fields=id,slug,status,acf,title,content,date,featured_media");
  if(q.http!==200||!Array.isArray(q.body)||q.body.length>1)throw Error("Native WordPress slug registry ambiguous "+type);
  aliases[type]=q.body;
 }
 if(aliases.posts.length||aliases.product.length)throw Error("Unowned WordPress Post or Product slug collision");
 let owned=aliases.pages[0]||null;
 if(owned&&(owned.acf?.action!=="PublicPage"||owned.acf?.key!==key||
    !["draft","publish"].includes(owned.status)))throw Error("Existing WordPress Page not source-owned #1434");
 // Normalize editorial HTML once. Keep true external-source links and the
 // original ordered 20 <img> slots, with verified 19 native upload placeholders.
 const clean=await parser.evaluate(({html,originalUrl,sourceUrls})=>{
  const root=document.createElement("div");root.innerHTML=html;
  for(const el of root.querySelectorAll("script,style,iframe,object,embed,form,input,button,svg,video,audio,link,meta,base"))el.remove();
  const allowed=new Set(["P","DIV","SPAN","BR","B","STRONG","I","EM","U","UL","OL","LI","H1","H2","H3","H4",
   "TABLE","THEAD","TBODY","TFOOT","TR","TD","TH","A","IMG","BLOCKQUOTE","HR","FIGURE","FIGCAPTION","SUP","SUB","SECTION","CAPTION"]);
  const imgs=[...root.querySelectorAll("img[src]")];
  if(imgs.length!==20)throw Error("Source original image slot count changed");
  for(let i=0;i<imgs.length;i++){
   const src=new URL(imgs[i].getAttribute("src"),originalUrl).href;
   if(src!==sourceUrls[i])throw Error("Original source image slot ordering mismatch "+i);
   imgs[i].setAttribute("src","__PSE_NPK_IMG_"+i+"__");
  }
  for(const el of [...root.querySelectorAll("*")].reverse()){
   if(!el.parentNode)continue;
   if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue;}
   for(const attr of [...el.attributes]){
    if(el.tagName==="IMG"&&["src","alt","title"].includes(attr.name))continue;
    if(el.tagName==="A"&&["href","title"].includes(attr.name))continue;
    if(["colspan","rowspan","scope","headers","dir","lang"].includes(attr.name))continue;
    el.removeAttribute(attr.name);
   }
   if(el.tagName==="A"&&el.hasAttribute("href")){
    const originalHref=el.getAttribute("href");
    try{
     const url=new URL(originalHref,originalUrl);
     if(["https:","http:","mailto:","tel:"].includes(url.protocol)&&!url.username&&!url.password)
      el.setAttribute("href",url.href);
     else el.removeAttribute("href");
    }catch{el.removeAttribute("href")}
   }
  }
  const n=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();
  return {html:root.innerHTML,text:n(root.textContent),images:root.querySelectorAll("img[src]").length,
   tables:root.querySelectorAll("table").length};
 },{html:article.html,originalUrl:input.originalUrl,sourceUrls:article.imageUrls});
 if(clean.images!==20||clean.tables!==3||hash(clean.text)!==sourceSHA||
    norm(clean.text)!==norm(article.body))throw Error("Sanitized native Page changed original Joomla text, tables or image order");
 report.preflight.push({sourceBodySHA:sourceSHA,originalMedia:19,externalImageReferences:1,
    originalTables:3,originalTextLength:clean.text.length,existingPage:owned?.id||null});
 await save();
 const ownedMedia=new Map();
 const sourceMedia=async media=>{
  if(!media?.mime_type||!Number.isSafeInteger(media.id))return null;
  const mf=String(media.media_details?.file||"");
  const raw=media.source_url||("/wp-content/uploads/"+mf);
  const url=new URL(raw,wp+"/");
  if(url.origin!==wp||!url.pathname.startsWith("/wp-content/uploads/")||url.search||url.hash)return null;
  return {id:media.id,url,basename:decodeURIComponent(url.pathname.split("/").at(-1)),mime:media.mime_type};
 };
 const exactPhoto=async(media,asset)=>{
  const info=await sourceMedia(media);
  if(!info)return null;
  const wanted=asset.originalSourceFilename;
  if(info.basename!==wanted)return null;
  const expectedMime=wanted.toLowerCase().endsWith(".jpg")?"image/jpeg":"image/png";
  if(info.mime!==expectedMime)return null;
  for(let attempt=1;attempt<=2;attempt++){
   try{
    const h=await net.head(info.url.href,{timeout:22000,failOnStatusCode:false,maxRedirects:0});
    const bytes=Number(h.headers()["content-length"]||0);
    if(h.status()===200&&bytes>0&&bytes!==asset.bytes.length)return null;
    const r=await net.get(info.url.href,{timeout:50000,failOnStatusCode:false,maxRedirects:0});
    if(r.status()!==200)return null;
    const body=await r.body();
    if(body.length!==asset.bytes.length||hash(body)!==asset.sha256)return null;
    return {id:info.id,url:info.url.pathname,sha256:asset.sha256,originalName:wanted};
   }catch(e){
    if(attempt===2||!/Timeout|ECONNRESET|socket hang up/i.test(String(e?.message||"")+" "+String(e?.name||"")))
     throw Error("Native original candidate photo verification unavailable");
    console.log("PSE_NPK_NATIVE_MEDIA_GET_RETRY="+JSON.stringify({originalIndex:asset.index,attempt}));
    await new Promise(resolve=>setTimeout(resolve,900*attempt));
   }
  }
  return null;
 };
 // Strict complete inventory and source-name conflict check BEFORE any photo writes.
 const entries=[];
 for(const asset of input.originalImages.filter(a=>a.ownerSite)){
  const stem=asset.originalSourceFilename.replace(/\.[a-z0-9]+$/i,"");
  const search=await api("/wp-json/wp/v2/media?context=edit&per_page=100&search="+encodeURIComponent(stem)+
    "&_fields=id,source_url,media_details,mime_type,slug");
  if(search.http!==200||!Array.isArray(search.body)||search.body.length>100)throw Error("Native photo filename search incomplete "+asset.index);
  const candidates=search.body.filter(m=>{
   const file=String(m.media_details?.file||"").split("/").at(-1);
   return file===asset.originalSourceFilename;
  });
  if(candidates.length>1)throw Error("Ambiguous already named Media "+asset.originalSourceFilename);
  let reused=null;
  if(candidates.length===1){
   reused=await exactPhoto(candidates[0],files.get(asset.index));
   if(!reused)throw Error("Existing original PSE filename with different bytes "+asset.originalSourceFilename);
  }
  entries.push({asset,existing:reused});
  console.log("PSE_NPK_EXACT_SOURCE_MEDIA_PREFLIGHT="+JSON.stringify({index:asset.index,
    name:asset.originalSourceFilename,sha256:asset.sha256,reused:reused?.id||null}));
 }
 if(entries.length!==19)throw Error("Original 19 source photo preflight changed");
 await save();
 // One bounded new media upload per actual missing original asset.
 for(const {asset,existing} of entries){
  let matched=existing;
  if(!matched){
   const row=files.get(asset.index);
   const mime=asset.originalSourceFilename.toLowerCase().endsWith(".jpg")?"image/jpeg":"image/png";
   const upload=await ctx.request.post(wp+"/wp-json/wp/v2/media",{data:row.bytes,
    timeout:90000,headers:{"X-WP-Nonce":nonce,Accept:"application/json",
      "Content-Disposition":'attachment; filename="'+asset.originalSourceFilename+'"',
      "Content-Type":mime}});
   const record=await upload.json().catch(()=>null);
   if(upload.status()!==201||!Number.isSafeInteger(record?.id))
    throw Error("Native original PSE media upload failed index "+asset.index+" HTTP "+upload.status());
   report.postWrites.push({type:"media",id:record.id,sourceImageIndex:asset.index});
   await save();
   const check=await api("/wp-json/wp/v2/media/"+record.id+"?context=edit");
   if(check.http!==200)throw Error("Native upload media REST readback failed index "+asset.index);
   matched=await exactPhoto(check.body,files.get(asset.index));
   if(!matched)throw Error("Native owned photo bytes/filename changed after import index "+asset.index);
  }
  ownedMedia.set(asset.index,matched);
  report.imageMedia.push({sourceIndex:asset.index,sourceName:asset.originalSourceFilename,
   wpId:matched.id,wpSrc:matched.url,sourceSha256:asset.sha256});
  await save();
  console.log("PSE_NPK_ORIGINAL_MEDIA_READY="+JSON.stringify(report.imageMedia.at(-1)));
 }
 if(ownedMedia.size!==19)throw Error("Native 19 original photos incomplete");
 let content=clean.html;
 for(let i=0;i<20;i++){
  const tag="__PSE_NPK_IMG_"+i+"__";
  if(content.split(tag).length!==2)throw Error("Original img position duplicate/missing "+i);
  content=content.replace(tag,ownedMedia.get(i)?.url||input.originalImages[i].sourceUrl);
 }
 if(!content.includes(input.originalImages[4].sourceUrl)||content.includes("admin-pse.webnvn.com"))
  throw Error("Wrong WordPress/third-party source image URL in final HTML");
 const payload={title,slug,date:originalDate,content,status:"draft",
  featured_media:ownedMedia.get(0).id,
  acf:{action:"PublicPage",key,product_lang:"vi",label:title}};
 let id=owned?.id||null;
 if(!id){
  const r=await api("/wp-json/wp/v2/pages","POST",payload);
  if(r.http!==201||!Number.isSafeInteger(r.body?.id))throw Error("Native #1434 Page creation failed");
  id=r.body.id;report.postWrites.push({type:"page-draft",id});await save();
 }else{
  const current=String(owned.content?.raw||"");
  if(current!==content||owned.title?.raw!==title||owned.date!==originalDate)
   throw Error("Existing source-owned Page content differs; not overwriting");
 }
 const verify=async(status)=>{
  const r=await api("/wp-json/wp/v2/pages/"+id+"?context=edit&_fields=id,slug,status,title,content,date,acf,featured_media");
  const p=r.body||{},html=String(p.content?.raw||"");
  const canonicalText=await parser.evaluate(html=>{
   const el=document.createElement("div");el.innerHTML=html;
   return String(el.textContent||"").normalize("NFKC").replace(/\s+/g," ").trim();
  },html);
  if(r.http!==200||p.id!==id||p.slug!==slug||p.status!==status||
     p.title?.raw!==title||p.date!==originalDate||
     p.acf?.action!=="PublicPage"||p.acf?.key!==key||
     (p.acf?.product_lang?.value??p.acf?.product_lang)!=="vi"||
     p.featured_media!==ownedMedia.get(0).id||
     hash(canonicalText)!==sourceSHA||
     [...html.matchAll(/<img\b/gi)].length!==20||
     [...html.matchAll(/<table\b/gi)].length!==3||
     input.originalImages.some((asset,i)=>!html.includes(ownedMedia.get(i)?.url||asset.sourceUrl)))
   throw Error("Native original #1434 Page verified body/media/date/ACF mismatch");
  return p;
 };
 await verify("draft");
 const published=await api("/wp-json/wp/v2/pages/"+id,"POST",{status:"publish"});
 if(published.http!==200||published.body?.id!==id||published.body.status!=="publish")
  throw Error("Native owner original Page publish failed");
 report.postWrites.push({type:"page-publish",id});await save();
 await verify("publish");
 const pub=await net.get(wp+"/wp-json/wp/v2/pages/"+id+"?_fields=id,slug,status,acf,date",{timeout:40000,failOnStatusCode:false});
 const p=await pub.json().catch(()=>null);
 if(pub.status()!==200||p.id!==id||p.status!=="publish"||p.slug!==slug||
    p.date!==originalDate||p.acf?.key!==key)
  throw Error("Native publicly published NPK source Page not independently readable");
 report.postId=id;report.result="NATIVE_ORIGINAL_NPK_PAGE_PUBLISHED_WITH_NINETEEN_SHA_MEDIA_AND_ONE_THIRDPARTY_HOTLINK";
 await save();
 console.log("PSE_NATIVE_NPK_1434_PUBLISHED="+JSON.stringify({id,slug,date:originalDate,
  originalBodySHA:sourceSHA,originalPhotos:19,thirdPartyUrlsRetained:1,tables:3,
  postWrites:report.postWrites.length,noProductWrites:true,noRedirectWrites:true}));
}catch(e){report.result="FAILED_OR_PARTIAL";report.errorType=e?.constructor?.name||"Error";report.errorMessage=String(e?.message||"").slice(0,160);await save();throw e}
finally{await net.dispose();await ctx.close();await parserCtx.close();await browser.close()}
