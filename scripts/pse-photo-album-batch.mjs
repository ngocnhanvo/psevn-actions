/** PSE bounded native WordPress gallery importer. No UI hardcoding, source media copied to WP only.
 * Use audit(pse): gallery ID batch N for read-only validation; cms(pse) for apply.
 * Each batch uploads at most 48 originals (12 for older albums), and publishes the Post only after all images verify.
 */
import { chromium,request } from "playwright";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const evt = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const message = String(evt.head_commit?.message||"").trim();
// Explicit one-time four-gallery recovery is a separate owner-authorized
// commit gate, never enabled by environmental inputs alone. The existing
// individual batch markers remain completely unchanged.
const bulkAuthorized=message==="cms(pse): complete four verified historical galleries"&&
 process.env.GITHUB_REPOSITORY==="ngocnhanvo/psevn-actions"&&
 process.env.GITHUB_REF==="refs/heads/main";
if(message==="cms(pse): complete four verified historical galleries"&&!bulkAuthorized)
 throw Error("Untrusted repository or ref for four-gallery recovery");
let command=message.match(/^(audit|cms)\(pse\): gallery (\d+) batch (\d+)$/);
if(bulkAuthorized){
 const id=String(process.env.PSE_GALLERY_ID||"");
 const batch=String(process.env.PSE_GALLERY_BATCH||"");
 if(!["1053","990","980","975"].includes(id)||!/^(?:0|[1-9][0-9]?)$/.test(batch))
  throw Error("Unsafe four-gallery recovery task");
 command=["cms(pse): gallery "+id+" batch "+batch,"cms",id,batch];
}
const galleries = new Map([
  [1053,{slug:"1053-ngay-hoi-truyen-thong-2014",title:"Ngày Hội Truyền Thống 2014",countMin:76}],
  [990,{slug:"990-dai-hoi-chi-doan-2010",title:"Đại hội chi đoàn 2010",countMin:80}],
  [988,{slug:"988-doan-thanh-nien-2011",title:"Đoàn thanh niên 2011",countMin:32}],
  [980,{slug:"980-cong-trinh-dtn-kho-chua-dong-nai",title:"Công trình DTN kho chứa Đồng Nai",countMin:80}],
  [995,{slug:"995-phu-nu-viet-nam",title:"Phụ nữ Việt Nam",countMin:11}],
  [991,{slug:"991-ngay-hoi-truyen-thong-2011",title:"Ngày Hội Truyền Thống 2011",countMin:10}],
  [987,{slug:"987-khai-truong-cua-hang-ngay-3-6",title:"Khai trương cửa hàng ngày 3/6",countMin:10}],
  [975,{slug:"975-dai-hoi-cong-doan-nhiem-ky-ii-10-2013",title:"Đại hội công đoàn nhiệm kỳ II 10/2013",countMin:80}],
  [986,{slug:"986-hoi-thao-tong-ket-vuon-thuc-nghiem-ngay-3-6-2013",title:"Hội thảo tổng kết vườn thực nghiệm ngày 3/6/2013",countMin:35}],
  [997,{slug:"997-truong-sa",title:"Trường Sa",countMin:7}],
  [993,{slug:"993-ngay-truyen-thong",title:"Ngày truyền thống",countMin:11}],
  [989,{slug:"989-hoi-dong-co-dong-le-ra-mat-va-don-nhan-iso",title:"Hội đồng cổ đông, lễ ra mắt và đón nhận ISO",countMin:98}],
  [985,{slug:"985-hinh-anh-marketing-2010",title:"Hình ảnh Marketing 2010",countMin:44}],
  [996,{slug:"996-hoc-van-hoa-doanh-nghiep",title:"Học văn hóa doanh nghiệp",countMin:6}],
  [992,{slug:"992-mau-bao-bi",title:"Mẫu bao bì",countMin:2}]
]);
if(!command){console.log("PSE_GALLERY_BATCH=NOT_REQUESTED; code_ready=true; noWordPressWrite=true");process.exit(0)}
const mode=command[1],id=Number(command[2]),batch=Number(command[3]),entry=galleries.get(id);
if(bulkAuthorized&&batch>=Math.ceil((({1053:76,990:98,980:180,975:110})[id]||0)/48))
 throw Error("Out-of-range source-verified gallery batch");
if(!entry||!Number.isSafeInteger(batch)||batch<0||batch>100)throw Error("Unknown approved source album/batch");
// After the original 12-photo galleries are complete, use source-verified
// 48-item batches only for the four remaining large albums. Preserve all
// existing gallery batch numbering, especially #989 batch 8 (indices 96-97).
const largeSourceAlbums=new Set([1053,990,980,975]);
const apply=mode==="cms",size=largeSourceAlbums.has(id)?48:12,offset=batch*size;
const config=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function site(key) {
  const arr=config.filter(x=>x.startsWith(key+"="));if(arr.length!==1)throw Error("Invalid "+key);
  const u=new URL(arr[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
  if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid WordPress site");
  return u.origin;
}
const wp=site("WC_URL"),front=site("WC_URL_CLIENT");if(wp===front)throw Error("WordPress origin leak");
const legacy="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/"+entry.slug+".html";
const sha=x=>createHash("sha256").update(x).digest("hex");
const esc=x=>String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1280,height:800}}),admin=await ctx.newPage();
const network=await request.newContext({timeout:65000});
try{
 const source=await ctx.newPage();
 // Prior original-source browser inventory verifies exact gallery anchors.
 // The four newly source-proven large galleries also passed inert HTML source
 // audit #44858808136. Avoid third-party subresources while reading source.
 const staticHtmlAlbums=new Set([986,997,993,989,985,996,992,1053,990,980,975]);
 if(staticHtmlAlbums.has(id)){
   const raw=await network.get(legacy,{timeout:110000,maxRedirects:3});
   if(!raw.ok())throw Error("Source gallery HTML unavailable HTTP "+raw.status());
   const html=await raw.text();
   if(html.length<200||html.length>8000000)throw Error("Untrusted gallery source HTML size");
   await source.route("**/*",route=>route.abort());
   const inert=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
   await source.setContent('<base href="'+legacy+'">'+inert,{waitUntil:"domcontentloaded",timeout:25000});
 }else{
   const response=await source.goto(legacy,{waitUntil:"domcontentloaded",timeout:70000});
   if(response?.status()!==200)throw Error("Source gallery unavailable HTTP "+response?.status());
 }
 const info=await source.evaluate(()=>{
  const block=document.querySelector(".item-page [itemprop=articleBody],.item-page,article,.blog")||document.body;
  return {name:(document.querySelector("h1,h2")?.textContent||"").trim(),
   links:[...block.querySelectorAll("a[href]")].map(a=>a.href).filter(x=>{try{let u=new URL(x);return u.hostname==="www.pse.vn" && u.pathname.startsWith("/images/gallery/") && /\.(?:jpe?g|png|webp)$/i.test(u.pathname)}catch{return false}})};
 });
 const links=[...new Set(info.links)];
 if(links.length<entry.countMin||links.length>350)throw Error("Unverified gallery count "+links.length+" for "+id);
 if(bulkAuthorized&&links.length!==({1053:76,990:98,980:180,975:110})[id])
  throw Error("Four-gallery original source count changed, refusing CMS writes "+id);
 if(offset>=links.length)throw Error("Batch offset exceeds gallery count");
 const items=links.map((url,n)=>{
  const u=new URL(url);
  const ext=u.pathname.split(".").at(-1).toLowerCase().replace("jpeg","jpg");
  const marker="pse-gallery-"+id+"-"+sha(url).slice(0,16);
  return {url,index:n,ext,marker,filename:marker+"."+ext,name:decodeURIComponent(u.pathname.split("/").at(-1))};
 });
 console.log("PSE_GALLERY_SOURCE=PASS id="+id+" total="+items.length+" batch="+batch+" chunk="+size+" offset="+offset+" apply="+apply);
 if(!apply){console.log("PSE_GALLERY_BATCH=DRY_PASS; noCmsWrites=true");process.exit(0)}
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const loginText=(await admin.locator("#loginform").innerText()).slice(0,500);
  const m=loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const field=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("WordPress auth challenge not found");
   await field.fill(String(n));
  }
  await admin.locator("#wp-submit").click();
 }
 // Verify the actual protected editor after the asynchronous login redirect.
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",{
  waitUntil:"domcontentloaded",timeout:60000});
 if(admin.url().includes("wp-login")||!(await admin.locator("#adminmenu").count()))
  throw Error("WordPress authorization failed on protected-page readback");
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("WordPress nonce unavailable");return(await r.text()).trim()});
 const api=(path,method="GET",body)=>admin.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,data:await r.json().catch(()=>({}))};
 },{path,method,body,nonce});
 // Only GET is retryable. Never blindly repeat an upload, Post publication,
 // or native REST write after a transport interruption.
 const readNative=async path=>{
  let lastReason="unknown";
  for(let attempt=1;attempt<=3;attempt++){
   try{
    const r=await api(path);
    if(r.http<500)return r; // 4xx is a hard, provenance-relevant failure.
    lastReason="WP HTTP "+r.http;
   }catch(e){lastReason=String(e?.code||e?.name||"network").slice(0,70)}
   if(attempt<3){
    console.warn("PSE_GALLERY_NATIVE_READ_RETRY attempt="+attempt+" reason="+lastReason);
    await new Promise(resolve=>setTimeout(resolve,750*attempt));
   }
  }
  throw Error("Native WordPress GET retries exhausted reason="+lastReason);
 };
 // Bounded read-only concurrency reduces 2x complete-gallery Media scans.
 // All CMS writes/uploads remain strictly serialized by the existing loop.
 const scanMedia=async(records,fn)=>{
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,records.length)},async()=>{
   for(;;){
    const i=cursor++;
    if(i>=records.length)return;
    await fn(records[i]);
   }
  }));
 };
 const cat=await readNative("/wp-json/wp/v2/categories?slug=anh");
 if(cat.http!==200||cat.data?.length!==1||cat.data[0].slug!=="anh")throw Error("WP photo category changed");
 const category=cat.data[0].id;
 const posts=await readNative("/wp-json/wp/v2/posts?context=edit&slug="+entry.slug+"&per_page=5&_fields=id,slug,categories,status,content,acf,featured_media");
 if(posts.http!==200||!Array.isArray(posts.data)||posts.data.length>1)throw Error("WP Post slug collision");
 let post=posts.data[0];
 if(post&&(!post.categories.includes(category)||post.acf?.key!=="ssr-post"||post.acf?.action!=="PostDetails"||!String(post.content?.raw||"").includes('data-pse-gallery-id="'+id+'"')))
   throw Error("Existing Post does not match verified gallery provenance");
 // Read only native attachment registry first, preserving already imported bytes.
 await scanMedia(items,async item=>{
  const m=await readNative("/wp-json/wp/v2/media?context=edit&search="+item.marker+"&per_page=50&_fields=id,slug,mime_type,source_url,media_details");
  if(m.http!==200||!Array.isArray(m.data))throw Error("WP media search denied");
  const found=m.data.filter(x=>x.slug===item.marker);
  if(found.length>1)throw Error("Ambiguous existing gallery image");
  item.id=found[0]?.id||null;
  item.nativeMedia=found[0]||null;
 });
 // A second agent/session may enqueue the same marker before the first
 // import finishes. Published, source-complete galleries are immutable for
 // this run; do not repeat media HEAD requests or POST write/readback.
 if(post?.status==="publish" && items.every(item=>
   Boolean(item.id) && String(post.content?.raw||"").includes(item.filename))
   && Number(post.featured_media)===Number(items[0].id)){
   console.log("PSE_GALLERY_BATCH=ALREADY_DONE id="+id+" post="+post.id+
     " photos="+items.length+" duplicateRunSkipped=true noCmsWrites=true");
   await network.dispose();
   await browser.close();
   process.exit(0);
 }
 const subset=items.slice(offset,offset+size);
 let created=0;
 // Distinct source URL hashes guarantee disjoint native Media IDs. Two uploads
 // at once shorten large albums without changing WP Post publication order.
 // On failure, drain both workers before closing the authenticated context.
 let uploadCursor=0,uploadError=null;
 const uploadOne=async item=>{
  let id=item.id;
  if(!id){
   // Read-only original Joomla image GET may be reset by old hosting under
   // sustained download. Retry only transport/5xx, NEVER a CMS mutation.
   let response=null;
   for(let attempt=1;attempt<=4;attempt++){
    try{
     const candidate=await network.get(item.url,{timeout:45000,maxRedirects:2});
     if(candidate.ok()){response=candidate;break}
     if(candidate.status()<500)throw Error("Original image HTTP "+candidate.status());
     if(attempt===4)throw Error("Original image HTTP "+candidate.status());
     console.warn("PSE_GALLERY_ORIGINAL_GET_RETRY sourceIndex="+item.index+
       " attempt="+attempt+" reason=HTTP"+candidate.status());
    }catch(e){
     if(/^Original image HTTP 4/.test(String(e?.message||"")))throw e;
     if(attempt===4)throw Error("Original source GET retries exhausted sourceIndex="+item.index+
       " reason="+String(e?.code||e?.name||"network").slice(0,40));
     console.warn("PSE_GALLERY_ORIGINAL_GET_RETRY sourceIndex="+item.index+
       " attempt="+attempt+" reason="+String(e?.code||e?.name||"network").slice(0,40));
    }
    await new Promise(resolve=>setTimeout(resolve,attempt*1000));
   }
   if(!response)throw Error("Original source image not verified sourceIndex="+item.index);
   const bytes=await response.body();
   const valid=(item.ext==="jpg"&&bytes[0]===255&&bytes[1]===216) ||
       (item.ext==="png"&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
       (item.ext==="webp"&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP");
   if(!valid||bytes.length<500||bytes.length>18000000)throw Error("Original gallery signature invalid");
   const mime=item.ext==="jpg"?"image/jpeg":"image/"+item.ext;
   try{
    // The upload is NOT blindly retryable: WordPress can commit the image but
    // drop the HTTP response. Confirm its exact source-derived marker first.
    const upload=await ctx.request.post(wp+"/wp-json/wp/v2/media",{data:bytes,headers:{"X-WP-Nonce":nonce,"Content-Type":mime,"Content-Disposition":'attachment; filename="'+item.filename+'"',Accept:"application/json"},timeout:120000});
    const data=await upload.json().catch(()=>({}));
    if(upload.status()!==201||!Number.isSafeInteger(Number(data.id))||data.mime_type!==mime)throw Error("Gallery upload rejected HTTP "+upload.status());
    id=Number(data.id);created++;
   }catch(e){
    const reason=String(e?.message||e);
    if(!/ECONNRESET|ETIMEDOUT|socket hang up|Timeout/i.test(reason))throw e;
    for(let probe=1;probe<=4&&!id;probe++){
     await new Promise(resolve=>setTimeout(resolve,probe*1250));
     const search=await readNative("/wp-json/wp/v2/media?context=edit&search="+item.marker+
       "&per_page=50&_fields=id,slug,mime_type,media_details");
     if(search.http!==200||!Array.isArray(search.data))throw Error("WP media upload receipt reconciliation unavailable");
     const found=search.data.filter(x=>x.slug===item.marker);
     if(found.length>1)throw Error("Duplicate native Media marker after ambiguous upload");
     if(found.length===1){
      const photo=found[0],path=String(photo.media_details?.file||"");
      if(photo.mime_type!==mime||path.split("/").at(-1)!==item.filename)
       throw Error("Ambiguous upload receipt returned different file");
      id=Number(photo.id);
      if(!Number.isSafeInteger(id)||id<1)throw Error("Unsafe reconciled Media ID");
      console.log("PSE_GALLERY_UPLOAD_RECOVERED id="+id+" sourceIndex="+item.index+" receipt="+String(e?.code||"network"));
     }
    }
    if(!id)throw Error("Transient WordPress upload ECONNRESET; receipt unconfirmed sourceIndex="+item.index);
   }
   item.id=id;
  }
  const m=await readNative("/wp-json/wp/v2/media/"+id+"?context=edit");
  if(m.http!==200)throw Error("Native photo media readback failed");
  const media=m.data;
  if(media.mime_type!==(item.ext==="jpg"?"image/jpeg":"image/"+item.ext))
   throw Error("Native photo MIME mismatch");
  const requiredAlt=entry.title+" – ảnh "+(item.index+1);
  const currentTitle=String(media.title?.raw||media.title?.rendered||"");
  if(media.alt_text!==requiredAlt||currentTitle!==requiredAlt){
   // Previously uploaded but interrupted before alt/title save: correct that
   // exact native ID only. This is a real diff, not a no-op CMS write.
   const updated=await api("/wp-json/wp/v2/media/"+id,"POST",{alt_text:requiredAlt,title:requiredAlt});
   if(updated.http!==200)throw Error("Could not save missing native gallery alt/title");
   const reread=await readNative("/wp-json/wp/v2/media/"+id+"?context=edit");
   if(reread.http!==200||reread.data?.alt_text!==requiredAlt)throw Error("Native Media alt readback failed");
  }
  const nativeFile=String(media.media_details?.file||"").replace(/^\/+/,"");
  if(nativeFile.split("/").at(-1)!==item.filename)throw Error("Uploaded file identity mismatch");
  const pathParts=nativeFile.split("/");
  if(pathParts.some(x=>!x||x==="."||x===".."||!/^[-a-z0-9._]+$/i.test(x)))throw Error("Invalid WP Media path");
  const native=wp+"/wp-content/uploads/"+nativeFile;
  // Original images were already verified by native Media read-back.
  // An occasional upstream HEAD ECONNRESET after successful upload is not
  // evidence of absent bytes. Retry only this idempotent GET-like probe.
  let nativeMediaVerified=false;
  for(let attempt=1;attempt<=3;attempt++){
   try{
    const head=await network.head(native,{timeout:30000,maxRedirects:2});
    if(head.ok()&&(head.headers()["content-type"]||"").toLowerCase().startsWith("image/")){
     nativeMediaVerified=true;break;
    }
    if(head.status()<500)throw Error("Native Media HEAD rejected HTTP "+head.status());
   }catch(e){
    if(attempt===3)throw Error("Native Media HEAD transient failures exhausted sourceIndex="+item.index+
      " cause="+String(e?.code||e?.name||"network").slice(0,40));
    console.warn("PSE_GALLERY_NATIVE_HEAD_RETRY sourceIndex="+item.index+" attempt="+attempt+
      " reason="+String(e?.code||e?.name||"network").slice(0,40));
   }
   if(attempt<3)await new Promise(resolve=>setTimeout(resolve,attempt*750));
  }
  if(!nativeMediaVerified)throw Error("WordPress gallery image HEAD never confirmed sourceIndex "+item.index);
  item.native=native;
  console.log("PSE_GALLERY_IMPORTED id="+id+" sourceIndex="+item.index+" wpMediaId="+item.id+" bytesVerified=true");
 };
 const uploadWorker=async()=>{
  for(;;){
   if(uploadError)return;
   const i=uploadCursor++;
   if(i>=subset.length)return;
   try{await uploadOne(subset[i])}catch(e){uploadError||=e;return}
  }
 };
 await Promise.all(Array.from({length:Math.min(largeSourceAlbums.has(id)?2:1,subset.length)},()=>uploadWorker()));
 if(uploadError)throw uploadError;
 // Resolve all previously saved media to determine a complete ordered gallery.
 const missing=items.filter(item=>!item.id);
 await scanMedia(items.filter(item=>item.id&&!item.native),async item=>{
  if(!item.native){
   const media=await readNative("/wp-json/wp/v2/media/"+item.id+"?context=edit");
   if(media.http!==200)throw Error("Stored gallery image readback failed");
   const filename=String(media.data.media_details?.file||"").replace(/^\/+/,"");
   if(filename.split("/").at(-1)!==item.filename)throw Error("Stored gallery image identity mismatch");
   item.native=wp+"/wp-content/uploads/"+filename;
  }
 });
 if(missing.length){
  console.log("PSE_GALLERY_BATCH=PARTIAL id="+id+" uploadedThisRun="+created+" remaining="+missing.length+" nextBatch="+(batch+1)+" noPostPublished=true");
 }else{
  const html='<div class="pse-photo-album wp-block-gallery" data-pse-gallery-id="'+id+'">'+items.map((x,i)=>
   '<figure class="wp-block-image"><img src="'+esc(x.native)+'" alt="'+esc(entry.title+" – ảnh "+(i+1))+'" loading="lazy" decoding="async"></figure>').join("")+'</div>';
  let postId=post?.id;
  if(!postId){
   const res=await api("/wp-json/wp/v2/posts","POST",{title:entry.title,slug:entry.slug,status:"draft",content:html,categories:[category],featured_media:items[0].id,acf:{action:"PostDetails",key:"ssr-post",origin_page_id:String(id)}});
   if(res.http!==201||!Number.isSafeInteger(Number(res.data?.id)))throw Error("Gallery Post draft create failed");
   postId=Number(res.data.id);
  }else{
   const updated=await api("/wp-json/wp/v2/posts/"+postId,"POST",{content:html,featured_media:items[0].id});
   if(updated.http!==200)throw Error("Gallery Post content update failed");
  }
  const read=await readNative("/wp-json/wp/v2/posts/"+postId+"?context=edit");
  if(read.http!==200||read.data.slug!==entry.slug||read.data.acf?.key!=="ssr-post"||read.data.acf?.action!=="PostDetails"||!read.data.categories.includes(category)||!items.every(x=>String(read.data.content?.raw||"").includes(x.filename)))
    throw Error("Post native CMS readback failed");
  if(read.data.status!=="publish"){
   const publish=await api("/wp-json/wp/v2/posts/"+postId,"POST",{status:"publish"});
   if(publish.http!==200||publish.data.status!=="publish")throw Error("Gallery Post publish failed");
  }
  console.log("PSE_GALLERY_BATCH=COMPLETE id="+id+" post="+postId+" photos="+items.length+" wordpressOwned=true");
 }
}finally{await network.dispose();await browser.close()}
