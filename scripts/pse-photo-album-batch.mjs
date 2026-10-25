/** PSE bounded native WordPress gallery importer. No UI hardcoding, source media copied to WP only.
 * Use audit(pse): gallery ID batch N for read-only validation; cms(pse) for apply.
 * Each batch uploads <=12 originals and publishes the Post only after all items verify.
 */
import { chromium,request } from "playwright";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const evt = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const message = String(evt.head_commit?.message||"").trim();
const command = message.match(/^(audit|cms)\(pse\): gallery (\d+) batch (\d+)$/);
const galleries = new Map([
  [1053,{slug:"1053-ngay-hoi-truyen-thong-2014",title:"Ngày Hội Truyền Thống 2014",countMin:76}],
  [990,{slug:"990-dai-hoi-chi-doan-2010",title:"Đại hội chi đoàn 2010",countMin:80}],
  [988,{slug:"988-doan-thanh-nien-2011",title:"Đoàn thanh niên 2011",countMin:32}],
  [980,{slug:"980-cong-trinh-dtn-kho-chua-dong-nai",title:"Công trình DTN kho chứa Đồng Nai",countMin:80}],
  [995,{slug:"995-phu-nu-viet-nam",title:"Phụ nữ Việt Nam",countMin:11}],
  [991,{slug:"991-ngay-hoi-truyen-thong-2011",title:"Ngày Hội Truyền Thống 2011",countMin:10}],
  [987,{slug:"987-khai-truong-cua-hang-ngay-3-6",title:"Khai trương cửa hàng ngày 3/6",countMin:10}],
  [975,{slug:"975-dai-hoi-cong-doan-nhiem-ky-ii-10-2013",title:"Đại hội công đoàn nhiệm kỳ II 10/2013",countMin:80}]
]);
if(!command){console.log("PSE_GALLERY_BATCH=NOT_REQUESTED; code_ready=true; noWordPressWrite=true");process.exit(0)}
const mode=command[1],id=Number(command[2]),batch=Number(command[3]),entry=galleries.get(id);
if(!entry||!Number.isSafeInteger(batch)||batch<0||batch>100)throw Error("Unknown approved source album/batch");
const apply=mode==="cms",size=12,offset=batch*size;
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
 const source=await ctx.newPage(),response=await source.goto(legacy,{waitUntil:"domcontentloaded",timeout:70000});
 if(response?.status()!==200)throw Error("Source gallery unavailable HTTP "+response?.status());
 const info=await source.evaluate(()=>{
  const block=document.querySelector(".item-page [itemprop=articleBody],.item-page,article,.blog")||document.body;
  return {name:(document.querySelector("h1,h2")?.textContent||"").trim(),
   links:[...block.querySelectorAll("a[href]")].map(a=>a.href).filter(x=>{try{let u=new URL(x);return u.hostname==="www.pse.vn" && u.pathname.startsWith("/images/gallery/") && /\.(?:jpe?g|png|webp)$/i.test(u.pathname)}catch{return false}})};
 });
 const links=[...new Set(info.links)];
 if(links.length<entry.countMin||links.length>350)throw Error("Unverified gallery count "+links.length+" for "+id);
 if(offset>=links.length)throw Error("Batch offset exceeds gallery count");
 const items=links.map((url,n)=>{
  const u=new URL(url);
  const ext=u.pathname.split(".").at(-1).toLowerCase().replace("jpeg","jpg");
  const marker="pse-gallery-"+id+"-"+sha(url).slice(0,16);
  return {url,index:n,ext,marker,filename:marker+"."+ext,name:decodeURIComponent(u.pathname.split("/").at(-1))};
 });
 console.log("PSE_GALLERY_SOURCE=PASS id="+id+" total="+items.length+" batch="+batch+" apply="+apply);
 if(!apply){console.log("PSE_GALLERY_BATCH=DRY_PASS; noCmsWrites=true");process.exit(0)}
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  let text=await admin.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   let a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   let field=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("WordPress auth challenge not found");
   await field.fill(String(n));
  }
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("WordPress authorization unavailable");
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("WordPress nonce unavailable");return(await r.text()).trim()});
 const api=(path,method="GET",body)=>admin.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,data:await r.json().catch(()=>({}))};
 },{path,method,body,nonce});
 const cat=await api("/wp-json/wp/v2/categories?slug=anh");
 if(cat.http!==200||cat.data?.length!==1||cat.data[0].slug!=="anh")throw Error("WP photo category changed");
 const category=cat.data[0].id;
 const posts=await api("/wp-json/wp/v2/posts?context=edit&slug="+entry.slug+"&per_page=5&_fields=id,slug,categories,status,content,acf,featured_media");
 if(posts.http!==200||!Array.isArray(posts.data)||posts.data.length>1)throw Error("WP Post slug collision");
 let post=posts.data[0];
 if(post&&(!post.categories.includes(category)||post.acf?.key!=="ssr-post"||post.acf?.action!=="PostDetails"||!String(post.content?.raw||"").includes('data-pse-gallery-id="'+id+'"')))
   throw Error("Existing Post does not match verified gallery provenance");
 const allMedia=[];
 // Read only native attachment registry first, preserving already imported bytes.
 for(const item of items){
  const m=await api("/wp-json/wp/v2/media?context=edit&search="+item.marker+"&per_page=50&_fields=id,slug,mime_type,source_url,media_details");
  if(m.http!==200||!Array.isArray(m.data))throw Error("WP media search denied");
  const found=m.data.filter(x=>x.slug===item.marker);
  if(found.length>1)throw Error("Ambiguous existing gallery image");
  item.id=found[0]?.id||null;
  item.nativeMedia=found[0]||null;
 }
 const subset=items.slice(offset,offset+size);
 let created=0;
 for(const item of subset){
  let id=item.id;
  if(!id){
   const response=await network.get(item.url,{timeout:65000});
   if(!response.ok())throw Error("Original image HTTP "+response.status());
   const bytes=await response.body();
   const valid=(item.ext==="jpg"&&bytes[0]===255&&bytes[1]===216) ||
       (item.ext==="png"&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
       (item.ext==="webp"&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP");
   if(!valid||bytes.length<500||bytes.length>18000000)throw Error("Original gallery signature invalid");
   const mime=item.ext==="jpg"?"image/jpeg":"image/"+item.ext;
   const upload=await ctx.request.post(wp+"/wp-json/wp/v2/media",{data:bytes,headers:{"X-WP-Nonce":nonce,"Content-Type":mime,"Content-Disposition":'attachment; filename="'+item.filename+'"',Accept:"application/json"},timeout:120000});
   const data=await upload.json().catch(()=>({}));
   if(upload.status()!==201||!Number.isSafeInteger(Number(data.id))||data.mime_type!==mime)throw Error("Gallery upload rejected "+upload.status());
   id=Number(data.id);created++;
   const alt=entry.title+" – ảnh "+(item.index+1);
   const updated=await api("/wp-json/wp/v2/media/"+id,"POST",{alt_text:alt,title:alt});
   if(updated.http!==200)throw Error("Could not save photo alt text");
   item.id=id;
  }
  const m=await api("/wp-json/wp/v2/media/"+id+"?context=edit");
  if(m.http!==200)throw Error("Native photo media readback failed");
  const media=m.data;
  const nativeFile=String(media.media_details?.file||"").replace(/^\/+/,"");
  if(nativeFile.split("/").at(-1)!==item.filename)throw Error("Uploaded file identity mismatch");
  const pathParts=nativeFile.split("/");
  if(pathParts.some(x=>!x||x==="."||x===".."||!/^[-a-z0-9._]+$/i.test(x)))throw Error("Invalid WP Media path");
  const native=wp+"/wp-content/uploads/"+nativeFile;
  const head=await network.head(native,{timeout:40000});
  if(!head.ok()||!(head.headers()["content-type"]||"").startsWith("image/"))throw Error("WordPress gallery image unavailable");
  item.native=native;
  console.log("PSE_GALLERY_IMPORTED id="+id+" sourceIndex="+item.index+" wpMediaId="+item.id+" bytesVerified=true");
 }
 // Resolve all previously saved media to determine a complete ordered gallery.
 const missing=[];
 for(const item of items){
  if(!item.id){missing.push(item);continue}
  if(!item.native){
   const media=await api("/wp-json/wp/v2/media/"+item.id+"?context=edit");
   if(media.http!==200)throw Error("Stored gallery image readback failed");
   const filename=String(media.data.media_details?.file||"").replace(/^\/+/,"");
   if(filename.split("/").at(-1)!==item.filename)throw Error("Stored gallery image identity mismatch");
   item.native=wp+"/wp-content/uploads/"+filename;
  }
 }
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
  const read=await api("/wp-json/wp/v2/posts/"+postId+"?context=edit");
  if(read.http!==200||read.data.slug!==entry.slug||read.data.acf?.key!=="ssr-post"||read.data.acf?.action!=="PostDetails"||!read.data.categories.includes(category)||!items.every(x=>String(read.data.content?.raw||"").includes(x.filename)))
    throw Error("Post native CMS readback failed");
  if(read.data.status!=="publish"){
   const publish=await api("/wp-json/wp/v2/posts/"+postId,"POST",{status:"publish"});
   if(publish.http!==200||publish.data.status!=="publish")throw Error("Gallery Post publish failed");
  }
  console.log("PSE_GALLERY_BATCH=COMPLETE id="+id+" post="+postId+" photos="+items.length+" wordpressOwned=true");
 }
}finally{await network.dispose();await browser.close()}
