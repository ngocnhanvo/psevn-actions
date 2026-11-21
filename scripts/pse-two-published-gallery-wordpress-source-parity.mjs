/** Independent source-vs-native-WordPress ordered image parity for two
 * already-published Joomla albums. GET ONLY. Does not wait for Astro build.
 * Never publishes Posts or uploads/edits WordPress Media.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";

if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong PSE Actions project");
const albums=[
 {id:1053,slug:"1053-ngay-hoi-truyen-thong-2014",count:76},
 {id:990,slug:"990-dai-hoi-chi-doan-2010",count:98}
];
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const configured=env.filter(x=>x.startsWith("WC_URL="));
if(configured.length!==1)throw Error("Missing PSE WP origin");
const rawOrigin=new URL(configured[0].slice(7).replace(/^['"]|['"]$/g,""));
if(rawOrigin.protocol!=="https:"||rawOrigin.username||rawOrigin.password||
   rawOrigin.port||rawOrigin.search||rawOrigin.hash||!["","/"].includes(rawOrigin.pathname))
 throw Error("Unexpected WP origin");
const wp=rawOrigin.origin;
const browser=await chromium.launch({headless:true});
const inertCtx=await browser.newContext({javaScriptEnabled:false});
await inertCtx.route("**/*",r=>r.abort());
const net=await request.newContext({timeout:60000});
const admin=await browser.newPage({viewport:{width:1366,height:860}});
const report={schema:"pse-two-published-source-gallery-native-parity-v1",
 readOnly:true,wordpressWrites:0,builds:0,rows:[],expectedPhotos:174,verifiedOrderedPhotos:0};
const markup=async(html,originUrl,selector)=>{
 const page=await inertCtx.newPage();
 try{
  await page.setContent('<base href="'+originUrl+'">'+
    html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),
    {waitUntil:"domcontentloaded",timeout:25000});
  return await page.evaluate(({selector})=>{
   const root=document.querySelector(selector);
   if(!root)throw Error("Missing original gallery article section");
   return [...root.querySelectorAll("a[href]")].map(x=>x.href);
  },{selector});
 }finally{await page.close()}
};
try{
 // Authenticated REST: exact native source-ID and raw ordered HTML proof.
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const loginText=(await admin.locator("#loginform").innerText()).slice(0,500);
  const m=loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Unknown source-owned WP math challenge");
   await f.fill(String(v));
  }
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",
  {waitUntil:"domcontentloaded",timeout:65000});
 if(admin.url().includes("wp-login")||!await admin.locator("#adminmenu").count())
  throw Error("Protected WP admin read authentication failed");
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP REST nonce unavailable");
  return(await r.text()).trim();
 });
 const wpGet=async path=>admin.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{method:"GET",credentials:"same-origin",
   headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});
  return{http:r.status,data:await r.json().catch(()=>null)};
 },{path,nonce});
 const category=await wpGet("/wp-json/wp/v2/categories?slug=anh&_fields=id,slug");
 if(category.http!==200||category.data?.length!==1||category.data[0].slug!=="anh")
  throw Error("Native WordPress photo gallery category unavailable");
 const categoryId=Number(category.data[0].id);
 for(const album of albums){
  const source="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/"+album.slug+".html";
  const res=await net.get(source,{timeout:65000,maxRedirects:2});
  if(res.status()!==200)throw Error("Original Joomla source unavailable "+album.id+" HTTP "+res.status());
  const sourceHTML=await res.text();
  if(sourceHTML.length<250||sourceHTML.length>8000000)
   throw Error("Untrusted Joomla source HTML "+album.id);
  const links=await markup(sourceHTML,source,
   ".item-page [itemprop=articleBody],.item-page,article,.blog");
  const sourcePhotos=[...new Set(links)].filter(h=>{
   try{const u=new URL(h);return u.hostname==="www.pse.vn"&&
    u.pathname.startsWith("/images/gallery/")&&/\.(?:jpe?g|png|webp)$/i.test(u.pathname)}
   catch{return false}
  });
  if(sourcePhotos.length!==album.count)
   throw Error("Original source count mismatch "+album.id+" "+sourcePhotos.length);
  const expected=sourcePhotos.map(h=>{
   const ext=new URL(h).pathname.split(".").at(-1).toLowerCase().replace("jpeg","jpg");
   return "pse-gallery-"+album.id+"-"+
    createHash("sha256").update(h).digest("hex").slice(0,16)+"."+ext;
  });
  const wpPost=await wpGet("/wp-json/wp/v2/posts?context=edit&status=any&slug="+
   encodeURIComponent(album.slug)+"&per_page=5&_fields=id,slug,status,acf,categories,content,featured_media");
  if(wpPost.http!==200||!Array.isArray(wpPost.data)||wpPost.data.length!==1)
   throw Error("Native WordPress gallery identity unavailable "+album.id);
  const post=wpPost.data[0];
  if(post.status!=="publish"||post.slug!==album.slug||
     String(post.acf?.origin_page_id||"")!==String(album.id)||
     !post.categories?.includes(categoryId)||
     !String(post.content?.raw||"").includes('data-pse-gallery-id="'+album.id+'"'))
   throw Error("Native WordPress published source record mismatch "+album.id);
  const page=await inertCtx.newPage();
  let srcs=[];
  try{
   await page.setContent('<base href="'+wp+'/">'+post.content.raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),
    {waitUntil:"domcontentloaded",timeout:25000});
   srcs=await page.evaluate(()=>[...document.querySelectorAll('div[data-pse-gallery-id] img[src]')]
    .map(x=>({src:x.src,alt:x.getAttribute("alt")||""})));
  }finally{await page.close()}
  if(srcs.length!==album.count)throw Error("Native gallery image count mismatch "+album.id);
  const got=srcs.map(x=>{
   const u=new URL(x.src);
   if(u.origin!==wp||!u.pathname.startsWith("/wp-content/uploads/")||u.search||u.hash)
    throw Error("External/non-native original photo URL "+album.id);
   if(!x.alt.trim())throw Error("Gallery photo lacks native alt "+album.id);
   return decodeURIComponent(u.pathname.split("/").at(-1));
  });
  if(got.some((n,i)=>n!==expected[i]))
   throw Error("Original source photo filename/order mismatch "+album.id+
    " index "+got.findIndex((n,i)=>n!==expected[i]));
  if(new Set(got).size!==got.length)throw Error("Repeated original gallery image "+album.id);
  const featured=await wpGet("/wp-json/wp/v2/media/"+post.featured_media+
   "?context=edit&_fields=id,media_details,mime_type");
  if(featured.http!==200||!String(featured.data?.media_details?.file||"").endsWith("/"+expected[0]))
   throw Error("Native featured Media differs from source first photo "+album.id);
  const row={id:album.id,wpPostId:post.id,photos:got.length,orderedSourceHashNames:true,
   exactFirstFeaturedImage:true,published:true,categoryCorrect:true,duplicateOriginalFilenames:0};
  report.rows.push(row);report.verifiedOrderedPhotos+=got.length;
  console.log("PSE_TWO_PUBLISHED_SOURCE_GALLERY_PARITY_ROW="+JSON.stringify(row));
 }
 if(report.rows.length!==2||report.verifiedOrderedPhotos!==174)
  throw Error("Incomplete authenticated native source parity");
 console.log("PSE_TWO_PUBLISHED_SOURCE_GALLERY_PARITY_PASS="+JSON.stringify({
  publishedAlbums:2,orderedOriginalPhotos:174,wordpressWrites:0,builds:0,readOnly:true
 }));
}finally{
 await mkdir("artifacts/pse-two-published-gallery-native-parity",{recursive:true});
 await writeFile("artifacts/pse-two-published-gallery-native-parity/report.json",
  JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}