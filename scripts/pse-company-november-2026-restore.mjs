/** Restore exact 2026 original Joomla company news 1739 and 1741 to native WP, with nine original JPEGs.
 * Guarded owner-marker only. No modification to 2025 similar-title WordPress Post.
 * Exact Joomla com_search created day/ID/title/source; native media and native Posts.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const message=String(event.head_commit?.message||"").split("\n")[0];
const marker=(await readFile(".pse-company-november-2026-restore-request","utf8")).trim();
const apply=marker==="MODE=APPLY"&&message==="cms(pse): restore two November 2026 company posts and nine original photos";
if(!["MODE=AUDIT","MODE=APPLY"].includes(marker)||(!apply&&message!=="audit(pse): preflight November company original posts"))
 throw Error("Owner guard: invalid exact native CMS request");
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||process.env.GITHUB_REF!=="refs/heads/main")
 throw Error("Wrong PSE repository/branch");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=name=>{const rows=env.filter(s=>s.startsWith(name+"="));
 if(rows.length!==1)throw Error("Missing configured "+name);
 const u=new URL(rows[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid "+name);
 return u.origin;
};
const wp=origin("WC_URL"),source="https://www.pse.vn";
const defs=[
 {id:1741,title:"Phú Mỹ Đông Nam Bộ tổ chức Lễ công bố và trao quyết định về công tác cán bộ",
  day:"2026-11-16",
  sourceUrl:source+"/21-tin-tuc-su-kien/tin-cong-ty/1741-phu-my-dong-nam-bo-to-chuc-le-cong-bo-va-trao-quyet-dinh-ve-cong-tac-can-bo.html",
  slug:"phu-my-dong-nam-bo-to-chuc-le-cong-bo-va-trao-quyet-dinh-ve-cong-tac-can-bo-2026",
  images:["PSE-2026-11-010.jpg","PSE-2026-11-011.jpg","PSE-2026-11-012.jpg","PSE-2026-11-013.jpg"],
  phrase:"Hoàng Tuấn Vinh",count:4},
 {id:1739,title:"PHÚ MỸ ĐÔNG NAM BỘ: MỘT NGÀY THỨ BẢY ĐẦY Ý NGHĨA",
  day:"2026-11-10",
  sourceUrl:source+"/21-tin-tuc-su-kien/tin-cong-ty/1739-phu-my-dong-nam-bo-mot-ngay-thu-bay-day-y-nghia.html",
  slug:"phu-my-dong-nam-bo-mot-ngay-thu-bay-day-y-nghia",
  images:["PSE-2026-11-001.jpg","PSE-2026-11-002.jpg","PSE-2026-11-003.jpg","PSE-2026-11-004.jpg","PSE-2026-11-005.jpg"],
  phrase:"Bán hàng dựa vào nội lực",count:5}
];
const expectedImages=defs.flatMap(d=>d.images);
if(new Set(expectedImages).size!==9)throw Error("Expected nine unique original image source filenames");
const browser=await chromium.launch({headless:true});
const adminCtx=await browser.newContext({viewport:{width:1400,height:900}});
const admin=await adminCtx.newPage();
const dateCtx=await browser.newContext({viewport:{width:1300,height:900}});
await dateCtx.route(/\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const sourceCtx=await browser.newContext({javaScriptEnabled:false});
await sourceCtx.route("**/*",r=>r.abort());
const network=await request.newContext({timeout:55000});
const report={schema:"pse-exact-november-2026-two-company-posts-v1",mode:apply?"APPLY":"AUDIT",
 date:new Date().toISOString(),sourceIds:[1741,1739],nativeCategory:1742,prepared:[],media:[],posts:[],
 existing2025Preserved:true,noPHPWrites:true};
let wpTransport=null;
let nonce="";
const normalize=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim().toLocaleLowerCase("vi");
try{
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await admin.locator("body").innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],value=({"+":a+b,"-":a-b,"×":a*b,"*":a*b,x:a*b})[m[2]];
   const field=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("Source-owned math CAPTCHA missing");
   await field.fill(String(value));
  }
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("Protected WordPress login failed");
 nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WordPress REST nonce missing");return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Unexpected native WP REST nonce");
 const api=async(path,method="GET",body)=>admin.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",cache:"no-store",headers:{
   "X-WP-Nonce":nonce,"Accept":"application/json",...(body?{"Content-Type":"application/json"}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return{status:r.status,data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const [cat,archive,old2025]=await Promise.all([
  api("/wp-json/wp/v2/categories?slug=tin-cong-ty&hide_empty=false&_fields=id,slug,parent"),
  api("/wp-json/wp/v2/pages/77030?context=edit&_fields=id,slug,status,acf"),
  api("/wp-json/wp/v2/posts/77291?context=edit&_fields=id,title,slug,date,status,categories")
 ]);
 if(cat.status!==200||cat.data?.length!==1||Number(cat.data[0].id)!==1742||
  archive.status!==200||archive.data?.slug!=="tin-tuc-su-kien"||archive.data?.acf?.key!=="ssr-posts"||
  old2025.status!==200||old2025.data?.date?.slice(0,10)!=="2025-10-21"||
  Number(old2025.data?.id)!==77291||!old2025.data.categories.includes(1742))
  throw Error("Native WordPress taxonomy/2025 collision guard failed");
 for(const def of defs){
  const original=await network.get(def.sourceUrl,{timeout:55000,maxRedirects:3});
  if(original.status()!==200)throw Error("Joomla exact article not HTTP200 "+def.id);
  const raw=await original.text();
  if(raw.length<1000||raw.length>1000000)throw Error("Joomla source raw length untrusted "+def.id);
  const page=await sourceCtx.newPage();
  let body;
  try{
   await page.setContent('<base href="'+def.sourceUrl+'">'+raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{
    waitUntil:"domcontentloaded",timeout:25000});
   body=await page.evaluate(()=>{
    const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page");
    if(!root)throw Error("Joomla article body missing");
    const title=(document.querySelector(".item-page h1,.item-page h2")?.textContent||"").replace(/\s+/g," ").trim();
    const copy=root.cloneNode(true);
    copy.querySelectorAll(".page-header,.article-info,.pager,.readmore,script,style,form,button,nav,svg,input,iframe,embed,object").forEach(el=>el.remove());
    const img=[...copy.querySelectorAll("img[src]")].map(el=>({src:new URL(el.getAttribute("src"),document.baseURI).href,alt:el.getAttribute("alt")||""}));
    const text=(copy.textContent||"").replace(/\s+/g," ").trim();
    const allowed=new Set(["P","DIV","SPAN","BR","B","STRONG","I","EM","UL","OL","LI","H2","H3","H4",
      "TABLE","THEAD","TBODY","TR","TD","TH","A","IMG","BLOCKQUOTE","HR","FIGURE","FIGCAPTION"]);
    for(const el of [...copy.querySelectorAll("*")].reverse()){
     if(!el.parentNode)continue;
     if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue;}
     for(const attr of [...el.attributes]){
      if(!["href","src","alt","title","colspan","rowspan"].includes(attr.name))el.removeAttribute(attr.name);
     }
     for(const attr of ["href","src"]){
      if(!el.hasAttribute(attr))continue;
      try{const u=new URL(el.getAttribute(attr),document.baseURI);
       if(u.protocol!=="https:"&&u.protocol!=="http:")throw Error("Bad scheme");
       el.setAttribute(attr,u.href);
      }catch{el.removeAttribute(attr)}
     }
    }
    return{title,text,images:img,html:copy.innerHTML.trim()};
   });
  }finally{await page.close()}
  if(normalize(body.title)!==normalize(def.title)||!body.text.includes(def.phrase)||
   body.html.length<700||body.images.length!==def.count||
   body.images.map(m=>new URL(m.src).pathname.split("/").at(-1)).join(",")!==def.images.join(","))
   throw Error("Original Joomla HTML/image/title identity changed "+def.id);
  const datePage=await dateCtx.newPage();let exact;
  try{exact=await searchDate(datePage,{id:def.id,sourceUrl:def.sourceUrl,title:def.title,opening:body.text.slice(0,360)})}
  finally{await datePage.close()}
  if(exact.source!=="joomla_com_search_created"||exact.day!==def.day||
   exact.matchedUrl!==def.sourceUrl||normalize(exact.title)!==normalize(def.title))
   throw Error("Joomla native original created date/permalink not verified id="+def.id);
  const existing=await api("/wp-json/wp/v2/posts?context=edit&status=any&slug="+encodeURIComponent(def.slug)+
   "&per_page=10&_fields=id,slug,status,acf,categories,date,content,featured_media");
  if(existing.status!==200||!Array.isArray(existing.data)||existing.data.length>1)
   throw Error("Native WP target slug ambiguous "+def.id);
  const prior=existing.data[0]||null;
  if(prior&&(String(prior.acf?.origin_page_id||"")!==String(def.id)||
   !prior.categories?.includes(1742)))throw Error("WP slug belongs to another original Post "+def.id);
  report.prepared.push({id:def.id,title:def.title,date:def.day,source:def.sourceUrl,originalImages:body.images.length,
   exactCreatedFrom:exact.source,existingWpId:prior?.id||null,slug:def.slug});
  def.body=body;def.prior=prior;
  console.log("PSE_NOVEMBER_COMPANY_SOURCE_PREFLIGHT="+JSON.stringify(report.prepared.at(-1)));
 }
 if(report.prepared.length!==2||report.prepared.reduce((n,x)=>n+x.originalImages,0)!==9)
  throw Error("Two verified originals and nine photo guards failed");
 const photos=new Map();
 for(const def of defs){for(const img of def.body.images){
  if(!img.src.startsWith(source+"/images/PSE-2026-11-"))throw Error("Untrusted source image "+img.src);
  const filename=new URL(img.src).pathname.split("/").at(-1);
  const existing=await api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(filename.replace(/\.jpg$/i,""))+
   "&per_page=30&_fields=id,slug,source_url,media_details,mime_type");
  if(existing.status!==200||!Array.isArray(existing.data))throw Error("WP Media registry unavailable "+filename);
  const exact=existing.data.filter(m=>String(m.media_details?.file||"").split("/").at(-1)===filename);
  if(exact.length>1)throw Error("Duplicate native WP photo filenames "+filename);
  const m=exact[0]||null;
  if(m&&m.mime_type!=="image/jpeg")throw Error("Incompatible existing WP media "+filename);
  const original=await network.get(img.src,{timeout:55000});
  if(original.status()!==200||!String(original.headers()["content-type"]||"").startsWith("image/jpeg"))
   throw Error("Joomla publisher JPEG unavailable "+filename);
  const bytes=await original.body();
  if(bytes.length<1000||bytes.length>9000000||bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff)
   throw Error("Original Joomla JPEG byte guard failed "+filename);
  const digest=createHash("sha256").update(bytes).digest("hex");
  photos.set(img.src,{...img,filename,existing:m,bytes,sha256:digest});
  report.media.push({source:img.src,originalBytes:bytes.length,sha256:digest,existingWpId:m?.id||null});
 }}
 if(photos.size!==9||report.media.length!==9)throw Error("Missing original complete 9 image source");
 console.log("PSE_NOVEMBER_COMPANY_READONLY_MEDIA=PASS 9/9");
 if(apply){
  wpTransport=await request.newContext({storageState:await adminCtx.storageState(),timeout:60000});
  for(const photo of photos.values()){
   if(photo.existing){photo.wpMedia=photo.existing;continue}
   // No blind retry on POST: WordPress itself can complete a write before transport failure.
   const response=await wpTransport.post(wp+"/wp-json/wp/v2/media",{data:photo.bytes,headers:{
    "X-WP-Nonce":nonce,Accept:"application/json","Content-Type":"image/jpeg",
    "Content-Disposition":'attachment; filename="'+photo.filename+'"',
    "Origin":wp,"Referer":wp+"/wp-admin/"
   },timeout:60000});
   const data=await response.json().catch(()=>({}));
   if(response.status()!==201||!Number.isSafeInteger(Number(data.id))||Number(data.id)<1){
    throw Error("Native original image REST upload denied "+photo.filename+" HTTP "+response.status()+" code="+String(data.code||"unknown"));
   }
   photo.wpMedia=data;
   console.log("PSE_NOVEMBER_COMPANY_MEDIA_CREATED "+JSON.stringify({filename:photo.filename,id:data.id}));
  }
  for(const photo of photos.values()){
   const r=await api("/wp-json/wp/v2/media/"+Number(photo.wpMedia.id)+
    "?context=edit&_fields=id,slug,source_url,media_details,mime_type");
   const m=r.data,filename=photo.filename,file=String(m?.media_details?.file||"").replace(/^\/+/,"");
   const u=new URL(String(m?.source_url||""),wp);
   if(r.status!==200||Number(m?.id)!==Number(photo.wpMedia.id)||m?.mime_type!=="image/jpeg"||
    file.split("/").at(-1)!==filename||u.origin!==wp||u.pathname!=="/wp-content/uploads/"+file)
    throw Error("Uploaded source original Media readback failed "+filename);
   photo.wpUrl=u.href;
   photo.wpId=Number(m.id);
  }
  console.log("PSE_NOVEMBER_COMPANY_MEDIA_READBACK=PASS 9/9");
  for(const def of defs){
   const replacements=new Map(def.body.images.map(x=>[x.src,photos.get(x.src)?.wpUrl]));
   const temp=await sourceCtx.newPage();
   let article;
   try{
    await temp.setContent("<div id='pse-source-root'>"+def.body.html+"</div>",{waitUntil:"domcontentloaded",timeout:20000});
    article=await temp.evaluate(replacementsArr=>{
     const map=new Map(replacementsArr);
     const root=document.querySelector("#pse-source-root");
     if(!root)throw Error("Sanitized content wrapper missing");
     for(const img of root.querySelectorAll("img[src]")){
      const native=map.get(img.getAttribute("src"));
      if(!native)throw Error("Original JPEG has no verified native WP media mapping");
      img.setAttribute("src",native);
     }
     for(const a of root.querySelectorAll("a[href]")){
      const native=map.get(a.getAttribute("href"));
      if(native)a.setAttribute("href",native);
     }
     return{html:root.innerHTML.trim(),text:(root.textContent||"").replace(/\s+/g," ").trim(),
      images:[...root.querySelectorAll("img[src]")].map(x=>x.src)};
    },[...replacements]);
   }finally{await temp.close()}
   if(article.images.length!==def.count||article.images.some(x=>!x.startsWith(wp+"/wp-content/uploads/"))||
    article.html.length<700||!article.text.includes(def.phrase))
    throw Error("Original article native Media replacement incomplete "+def.id);
   const expectedNative=def.body.images.map(m=>photos.get(m.src).wpUrl);
   if(article.images.join("|")!==expectedNative.join("|"))throw Error("Original photo order changed");
   const excerpt=article.text.slice(0,156).trim();
   const first=photos.get(def.body.images[0].src);
   let postId=Number(def.prior?.id||0);
   if(!postId){
    const created=await api("/wp-json/wp/v2/posts","POST",{
     title:def.title,slug:def.slug,date:def.day+"T00:00:00",categories:[1742],
     featured_media:first.wpId,content:article.html,excerpt,status:"draft",
     pse_seo_description:excerpt,
     acf:{action:"PostDetails",key:"ssr-post",origin_page_id:String(def.id)}
    });
    if(created.status!==201||!Number.isSafeInteger(Number(created.data?.id)))
     throw Error("Native WP draft creation rejected id="+def.id+" code="+String(created.data?.code||created.status));
    postId=Number(created.data.id);
   }
   const check=await api("/wp-json/wp/v2/posts/"+postId+
    "?context=edit&_fields=id,slug,status,acf,categories,date,title,content,featured_media");
   const p=check.data;
   if(check.status!==200||Number(p?.id)!==postId||p.slug!==def.slug||
    String(p.acf?.origin_page_id||"")!==String(def.id)||
    p.acf?.action!=="PostDetails"||p.acf?.key!=="ssr-post"||
    p.date?.slice(0,10)!==def.day||p.categories?.length!==1||Number(p.categories[0])!==1742||
    Number(p.featured_media)!==first.wpId||
    !expectedNative.every(u=>String(p.content?.raw||"").includes(u)))
    throw Error("Native WP exact draft Post/ACF/media readback failed "+def.id);
   if(p.status!=="publish"){
    const published=await api("/wp-json/wp/v2/posts/"+postId,"POST",{status:"publish"});
    if(published.status!==200||published.data?.status!=="publish")
     throw Error("WordPress source publication rejected "+def.id);
   }
   const publicPost=await api("/wp-json/wp/v2/posts/"+postId+"?_fields=id,status,slug,categories,date");
   if(publicPost.status!==200||publicPost.data?.status!=="publish"||publicPost.data.slug!==def.slug||
    publicPost.data.date?.slice(0,10)!==def.day||!publicPost.data.categories?.includes(1742))
    throw Error("Published WordPress original Post not publicly retrievable "+def.id);
   report.posts.push({sourceId:def.id,wpId:postId,day:def.day,slug:def.slug,photos:expectedNative.length,category:1742,status:"publish"});
   console.log("PSE_NOVEMBER_COMPANY_PUBLISHED="+JSON.stringify(report.posts.at(-1)));
  }
  const old=await api("/wp-json/wp/v2/posts/77291?context=edit&_fields=id,date,slug,status");
  if(old.status!==200||old.data?.date?.slice(0,10)!=="2025-10-21"||
   old.data?.slug!=="phu-my-dong-nam-bo-to-chuc-le-cong-bo-va-trao-quyet-dinh-ve-cong-tac-can-bo")
   throw Error("2025 original must remain unchanged; verify before build");
  console.log("PSE_NOVEMBER_COMPANY_CMS_PASS=2_POSTS_9_MEDIA_OLD_2025_UNCHANGED");
 }else{
  console.log("PSE_NOVEMBER_COMPANY_READONLY_PREFLIGHT=PASS 2_POSTS_9_IMAGES_NO_CMS_WRITE");
 }
}finally{
 await mkdir("artifacts/pse-company-news",{recursive:true});
 // Save small report (never emit original JPEG bytes in logs or artifacts).
 await writeFile("artifacts/pse-company-news/november-2026-restore.json",JSON.stringify(report,null,2)+"\n");
 await wpTransport?.dispose();await browser.close();await network.dispose();
}
