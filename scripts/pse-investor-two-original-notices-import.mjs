/** Two verified source-owned investor notices; no Astro content or unrelated CMS writes. */
import {chromium,request} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {searchDate} from "./pse-legacy-search-date.mjs";
const msg="cms(pse): restore original shareholder notices 338 and 1085";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||evt.head_commit?.message!==msg||
 process.env.PSE_INVESTOR_FRESH_BACKUP!=="yes")throw Error("Missing owner approval or fresh native DB backup");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const docs=[
 {id:338,day:"2013-02-28",count:241,files:[
  ["https://www.pse.vn/images/web/news/qhcd/ThongTinCongBo/cv%20gi%20vsd%20cht%20danh%20sch%20c%20ng_001.jpg",199127,"450d2875fdd51c343e77e968122beb6d68f0e29827e7eb7392f77b4ba68c6b97"],
  ["https://www.pse.vn/images/web/news/qhcd/ThongTinCongBo/cv%20gi%20vsd%20cht%20danh%20sch%20c%20ng_002.jpg",159974,"7bb5dcb38ec11d0a99d9a59cbac4e83f305a275d333311de3d86a91cba80bd22"]]},
 {id:1085,day:"2015-03-04",count:385,files:[
  ["https://www.pse.vn/images/web/news/qhcd/Dai_Hoi_Co_Dong_2013/gui_VSD_choDS_001.jpg",203816,"c569532d3707b1e1757b4b0705e6d7d18609367d4fa7f1f92eb23422650762ac"],
  ["https://www.pse.vn/images/web/news/qhcd/Dai_Hoi_Co_Dong_2013/gui_VSD_choDS_002.jpg",120319,"0f786bc97f0a14589a366f84f6024fd35a28c09754350bb8720605948fe921d4"]]}
];
if(state.schema!=="pse-legacy-article-migration-v1"||
 docs.some(d=>state.articles?.[d.id]?.status!=="quarantined"||
 state.articles[d.id].reason!=="Source content incomplete or oversized"))
 throw Error("Unexpected original Joomla source ownership");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/);
const site=k=>{const x=env.find(s=>s.trim().startsWith(k+"="));if(!x)throw Error("missing "+k);
 const u=new URL(x.trim().slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
 !["","/"].includes(u.pathname))throw Error("untrusted origin");return u.origin;};
const wp=site("WC_URL"),front=site("WC_URL_CLIENT");if(wp===front)throw Error("overlapping origins");
const sha=v=>createHash("sha256").update(v).digest("hex");
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:55000});
const context=await browser.newContext({javaScriptEnabled:false});
await context.route("**/*",r=>r.abort());
const admin=await browser.newPage();
const report={sourceIds:[338,1085],sourceMedia:4,posts:[],media:[],writes:0,success:false,build:false,cleanup:[]};
let api=null;
const draftIds=[];
try{
 const prepared=[];
 for(const d of docs){
  const url=state.articles[d.id].source_url;
  const u=new URL(url);
  if(u.hostname!=="www.pse.vn"||!new RegExp("/"+d.id+"-[^/]+\\.html$").test(u.pathname))
   throw Error("Wrong Joomla source article "+d.id);
  const response=await net.get(url,{timeout:60000});
  if(response.status()!==200)throw Error("Joomla source not available "+d.id);
  const raw=await response.text(),page=await context.newPage();
  let info;
  try{
   await page.setContent('<base href="'+url+'">'+raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""));
   info=await page.evaluate(()=>{
    const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page");
    const norm=x=>String(x||"").replace(/\s+/g," ").trim();
    return{title:norm(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent),
     text:norm(root.textContent),images:[...root.querySelectorAll("img[src]")].map(x=>x.src)};
   });
  }finally{await page.close()}
  if(info.text.length!==d.count||info.images.length!==2||
   d.files.some((f,i)=>info.images[i]!==f[0]))throw Error("Joomla content/media changed "+d.id);
  const datePage=await browser.newPage();
  await datePage.route(/\.(?:jpe?g|png|gif|webp|svg|woff2?|ttf)/i,r=>r.abort());
  let day;
  try{day=await searchDate(datePage,{id:d.id,sourceUrl:url,title:info.title,opening:info.text.slice(0,350)})}
  finally{await datePage.close()}
  if(day.source!=="joomla_com_search_created"||day.day!==d.day)
   throw Error("Joomla created date not proven "+d.id);
  const images=[];
  for(const [src,size,digest] of d.files){
   const response=await net.get(src,{timeout:45000,maxRedirects:0,failOnStatusCode:false});
   if(response.status()!==200||!String(response.headers()["content-type"]||"").startsWith("image/jpeg"))
    throw Error("Original source JPEG HTTP invalid "+d.id);
   const bytes=await response.body();
   if(bytes.length!==size||sha(bytes)!==digest||
    bytes.subarray(0,2).toString("hex")!=="ffd8")
    throw Error("Original source JPEG SHA256 proof failed "+d.id);
   images.push({src,bytes,digest,filename:"pse-original-"+d.id+"-"+sha(src).slice(0,16)+".jpg"});
  }
  const slug=u.pathname.split("/").at(-1).replace(new RegExp("^"+d.id+"-"),"").replace(/\.html$/,"");
  prepared.push({...d,title:info.title,text:info.text,raw,url,slug,images});
 }
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const m=(await admin.locator("#loginform").innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],b=+m[3],ans=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("WP login challenge field missing");
   await input.fill(String(ans))}
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded"});
 if(admin.url().includes("wp-login")||!await admin.locator("#adminmenu").count())
  throw Error("WordPress authenticated admin access not verified");
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce missing");return(await r.text()).trim()});
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Unexpected WP nonce");
 api=(path,method="GET",body)=>admin.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,headers:{"X-WP-Nonce":nonce,
   ...(body?{"Content-Type":"application/json"}:{})},credentials:"same-origin",
   ...(body?{body:JSON.stringify(body)}:{})});
  return{status:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),
   data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const cat=await api("/wp-json/wp/v2/categories?slug=tin-tuc-co-dong&_fields=id,slug,parent");
 if(cat.status!==200||cat.data?.length!==1)throw Error("Native shareholder taxonomy missing");
 const catId=Number(cat.data[0].id);
 const allMedia=new Map(),wanted=new Set(prepared.flatMap(d=>d.images.map(m=>m.filename)));
 for(let n=1;n<=80;n++){
  const r=await api("/wp-json/wp/v2/media?context=edit&orderby=id&order=asc&per_page=100&page="+n+
   "&_fields=id,mime_type,media_details");
  if(r.status!==200||!Array.isArray(r.data)||r.pages>80)throw Error("Unverified complete Media registry");
  for(const m of r.data){
   const filename=String(m.media_details?.file||"").split("/").at(-1);
   if(!wanted.has(filename))continue;
   if(allMedia.has(filename))throw Error("Original media duplicate "+filename);
   allMedia.set(filename,m);
  }
  if(n>=r.pages)break;
 }
 for(const d of prepared){
  const existing=await api("/wp-json/wp/v2/posts?context=edit&status=any&slug="+d.slug+
   "&_fields=id,slug,status,acf,date,categories,featured_media,content");
  if(existing.status!==200||!Array.isArray(existing.data)||existing.data.length>1)
   throw Error("Native WP Post source ambiguity "+d.id);
  if(existing.data[0]&&String(existing.data[0].acf?.origin_page_id)!==String(d.id))
   throw Error("Original investor slug collides with unrelated WP Post");
  d.existing=existing.data[0]||null;
 }
 for(const d of prepared){
  for(const image of d.images){
   let m=allMedia.get(image.filename);
   if(!m){
    const b64=image.bytes.toString("base64");
    const upload=await admin.evaluate(async({b64,filename,nonce})=>{
     const b=Uint8Array.from(atob(b64),s=>s.charCodeAt(0));
     const r=await fetch("/wp-json/wp/v2/media",{method:"POST",credentials:"same-origin",
      headers:{"X-WP-Nonce":nonce,"Content-Type":"image/jpeg",
       "Content-Disposition":'attachment; filename="'+filename+'"'},body:b});
     return{status:r.status,data:await r.json().catch(()=>null)};
    },{b64,filename:image.filename,nonce});
    if(upload.status!==201||!upload.data?.id)throw Error("Original media upload receipt unconfirmed "+d.id);
    m={id:upload.data.id};report.writes++;
   }
   const read=await api("/wp-json/wp/v2/media/"+m.id+"?context=edit&_fields=id,mime_type,media_details");
   const file=String(read.data?.media_details?.file||"");
   if(read.status!==200||read.data.mime_type!=="image/jpeg"||
    file.split("/").at(-1)!==image.filename)throw Error("Native original scanned JPEG readback mismatch");
   image.native=wp+"/wp-content/uploads/"+file;image.id=Number(m.id);
   const probe=await net.get(image.native,{timeout:45000,failOnStatusCode:false});
   if(probe.status()!==200||sha(await probe.body())!==image.digest)
    throw Error("Native WP scanned JPEG SHA256 mismatch "+d.id);
   report.media.push({sourceId:d.id,id:image.id,filename:image.filename,digest:image.digest});
  }
  const page=await context.newPage();
  let body;
  try{
   await page.setContent('<base href="'+d.url+'">'+d.raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""));
   body=await page.evaluate(m=>{
    const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page");
    const c=root.cloneNode(true),lookup=new Map(m.map(x=>[x.src,x.native]));
    for(const img of c.querySelectorAll("img[src]")){
     const src=img.src,original=lookup.get(src);
     if(!original)throw Error("Unverified original image in Joomla content");
     img.setAttribute("src",original);
     img.removeAttribute("srcset");img.removeAttribute("sizes");
    }
    for(const a of c.querySelectorAll("a[href]")){
     const u=new URL(a.getAttribute("href")||"",document.baseURI).href;
     if(lookup.has(u))a.setAttribute("href",lookup.get(u));
     else if(/\.(?:png|jpe?g|pdf|webp|gif)(?:\?|$)/i.test(u))
      throw Error("Unverified mandatory original notice link");
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
    return{html:c.innerHTML.trim(),text:(c.textContent||"").replace(/\s+/g," ").trim()};
   },d.images.map(x=>({src:x.src,native:x.native})));
  }finally{await page.close()}
  if(body.text.length!==d.count||d.images.some(x=>!body.html.includes(x.filename)))
   throw Error("Joomla original text/media CMS body mismatch "+d.id);
  let id=Number(d.existing?.id||0);
  if(!id){
   const created=await api("/wp-json/wp/v2/posts","POST",{
    title:d.title,slug:d.slug,date:d.day+"T00:00:00",status:"draft",
    categories:[catId],content:body.html,featured_media:d.images[0].id,
    excerpt:body.text.slice(0,155),pse_seo_description:body.text.slice(0,155),
    acf:{action:"PostDetails",key:"ssr-post",origin_page_id:String(d.id)}});
   if(created.status!==201||!created.data?.id)throw Error("Investor Post draft receipt unconfirmed "+d.id);
   id=Number(created.data.id);draftIds.push({source:d.id,id});report.writes++;
  }
  const saved=await api("/wp-json/wp/v2/posts/"+id+"?context=edit&_fields=id,status,date,acf,content,categories,featured_media");
  if(saved.status!==200||String(saved.data?.acf?.origin_page_id)!==String(d.id)||
   saved.data.date?.slice(0,10)!==d.day||
   !saved.data.categories?.includes(catId)||Number(saved.data.featured_media)!==d.images[0].id||
   d.images.some(x=>!String(saved.data.content?.raw||"").includes(x.filename)))
   throw Error("Investor source draft readback unverified "+d.id);
  if(saved.data.status!=="publish"){
   const pub=await api("/wp-json/wp/v2/posts/"+id,"POST",{status:"publish"});
   if(pub.status!==200||pub.data?.status!=="publish")throw Error("Original notice publish failed "+d.id);
   report.writes++;
  }
  report.posts.push({id,sourceId:d.id,day:d.day,status:"publish",images:2});
  console.log("PSE_INVESTOR_SOURCE_POST_PASS="+JSON.stringify(report.posts.at(-1)));
 }
 report.success=report.posts.length===2&&report.media.length===4;
 if(!report.success)throw Error("Two original notices not fully published");
 console.log("PSE_INVESTOR_NATIVE_APPLY_PASS="+JSON.stringify({
  sourceIds:[338,1085],nativePosts:2,originalScans:4,days:docs.map(d=>d.day),
  exactOriginalSHA256:true,otherWrites:0,buildTriggered:false}));
}finally{
 if(!report.success&&api){
  for(const draft of draftIds){
   if(report.posts.some(p=>p.sourceId===draft.source&&p.status==="publish"))continue;
   try{
    const r=await api("/wp-json/wp/v2/posts/"+draft.id+"?context=edit&_fields=id,status,acf");
    if(r.status===200&&r.data?.status==="draft"&&
      String(r.data.acf?.origin_page_id)===String(draft.source)){
     const trash=await api("/wp-json/wp/v2/posts/"+draft.id,"POST",{status:"trash"});
     const after=await api("/wp-json/wp/v2/posts/"+draft.id+"?context=edit&_fields=id,status");
     if(trash.status!==200||after.status!==200||after.data?.status!=="trash")
      throw Error("Source-owned original notice draft cleanup failed");
     report.cleanup.push({postId:draft.id,sourceId:draft.source,status:"trash",noDraftResidue:true});
    }else if(r.status===200&&r.data.status==="publish"){
     report.cleanup.push({postId:draft.id,sourceId:draft.source,status:"publish",noAutomaticDeletion:true});
    }else{
     throw Error("Unexpected original notice draft state");
    }
   }catch(e){
    report.cleanup.push({postId:draft.id,sourceId:draft.source,cleanupFailed:String(e?.message||e).slice(0,120)});
   }
  }
 }
 if(report.cleanup.some(x=>x.cleanupFailed))process.exitCode=1;
 await mkdir("artifacts/pse-investor-two-native",{recursive:true});
 await writeFile("artifacts/pse-investor-two-native/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await context.close();await browser.close();
}
