/** Native original #382 third JPEG into private WP draft; no publish/redirect.
 * Scoped to one verified URL and restored original three-image post only.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir,unlink} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 event.head_commit?.message!=="cms(pse): stage verified original Wieliczka photo in draft 382"||
 process.env.PSE_382_WIELICZKA_BACKUP_READY!=="yes")throw Error("Unauthorized one-Post writer");
const doc=JSON.parse(await readFile("docs/source/pse-original-public-articles-11-2026-11-22.json","utf8"));
const entry=doc.entries?.find(e=>e.source_id===382);
const old="images/web/Mỏ_muối_Wieliczka_dưới_mặt_đất_135m_-_Ba_lan.JPG";
const slug="pvfcco-se-to-chuc-thanh-cong-chuyen-du-lich-chau-au-cho-khach-hang-tieu-bieu-cua-cong-ty";
if(doc.schema!=="pse-original-joomla-selected-public-articles-v1"||
 entry?.slug!==slug||entry.inline_image_src?.length!==3||entry.inline_image_src[2]!==old)
 throw Error("Joomla #382 source identity mismatch");
const digest="206537e10a6bf2a95c5943aa17140b0a83ccc3b8b9921b9f8d59c5d5eaffaa5b",size=143031;
const fp="/tmp/pse-382-original-Wieliczka.JPG",sha=b=>createHash("sha256").update(b).digest("hex");
const jpeg=await readFile(fp);
if(jpeg.length!==size||sha(jpeg)!==digest||jpeg.subarray(0,3).toString("hex")!=="ffd8ff"||
 jpeg.subarray(-2).toString("hex")!=="ffd9")throw Error("Pinned source JPEG not equal");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function get(n){
 const rows=env.filter(s=>s.startsWith(n+"="));
 if(rows.length!==1)throw Error("WordPress target configuration missing");
 return rows[0].slice(n.length+1).replace(/^['"]|['"]$/g,"").replace(/\/$/,"");
}
const wp=get("WC_URL");
if(wp!=="https://admin-pse.webnvn.com"||get("WC_URL_CLIENT")!=="https://pse.webnvn.com")
 throw Error("Wrong target WordPress");
const out="artifacts/pse-382-wieliczka-native-staged";
await mkdir(out,{recursive:true});
const report={schema:"pse-382-verified-third-native-image-v1",
 sourceId:382,postId:83543,sha256:digest,expectedBytes:size,
 mediaCreated:false,mediaReused:false,mediaId:null,postUpdated:false,
 sourceImagesRestored:3,postRemainsDraft:true,redirects:0,wpWrites:0,
 freshBackup:true,readbackVerified:false,result:"STARTED"};
const save=()=>writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:860}});
const page=await context.newPage(),net=await request.newContext({timeout:45000});
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const login=(await page.locator("#loginform").innerText()).slice(0,850);
  const m=login.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("Cannot solve standard WP math challenge");
   await input.fill(String(v));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())
  throw Error("WP auth unavailable");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce unavailable");
  return(await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Unexpected WordPress nonce");
 const api=async(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||0),
   data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const postPath="/wp-json/wp/v2/posts/83543?context=edit&_fields=id,slug,title,date,status,acf,categories,content";
 const current=await api(postPath);const html=String(current.data?.content?.raw||"");
 if(current.status!==200||current.data?.id!==83543||current.data.slug!==slug||
  current.data.status!=="draft"||current.data.title?.raw!==entry.title||
  current.data.date!==entry.created_at_joomla.replace(" ","T")||
  current.data.acf?.action!=="PostDetails"||current.data.acf?.key!=="ssr-post"||
  JSON.stringify((current.data.categories||[]).sort((a,b)=>a-b))!==JSON.stringify([1742,1746])||
  html.split('src="'+old+'"').length!==2||
  !html.includes("/wp-content/uploads/2026/11/Ba_Lan.jpg")||
  !html.includes("/wp-content/uploads/2026/11/Ao_2.jpg")||
  html.includes('src="images/web/Áo_2.JPG"')||html.includes('src="images/web/Ba_Lan.JPG"'))
  throw Error("Original private draft media source scope changed");
 // Strict exact existing filename collision preflight, bounded search.
 const found=[];
 for(let pageNo=1;pageNo<=25;pageNo++){
  const r=await api("/wp-json/wp/v2/media?context=edit&search=Wieliczka&per_page=100&page="+pageNo+
   "&_fields=id,source_url,media_details,mime_type");
  if(r.status===400&&pageNo>1&&r.data?.code==="rest_post_invalid_page_number")break;
  if(r.status!==200||!Array.isArray(r.data))throw Error("WP Media registry search unavailable");
  const count=r.pages;
  if(!Number.isSafeInteger(count)||count<0||count>25)throw Error("WP media registry too broad");
  for(const item of r.data){
   const name=String(item.media_details?.file||"").split("/").at(-1).toLowerCase();
   if(name.includes("wieliczka")&&name.includes("135m")&&name.endsWith(".jpg")&&!found.some(x=>x.id===item.id))
    found.push(item);
  }
  if(pageNo>=count)break;
 }
 if(found.length>1)throw Error("Ambiguous existing original Wieliczka media");
 let media=found[0]||null;
 const canonical=async item=>{
  const u=new URL(item.source_url,wp);
  if(u.origin!==wp||u.protocol!=="https:"||!u.pathname.startsWith("/wp-content/uploads/")||
     !decodeURIComponent(u.pathname).toLowerCase().includes("wieliczka"))
   throw Error("WordPress file canonical URL unexpected");
  if(item.mime_type!=="image/jpeg")throw Error("Media wrong MIME");
  const res=await net.get(u.href,{timeout:45000,failOnStatusCode:false});
  if(res.status()!==200||sha(await res.body())!==digest)throw Error("WP Media not exact original JPEG");
  return u.href;
 };
 if(media){await canonical(media);report.mediaReused=true;}
 else{
  const logical="Mỏ_muối_Wieliczka_dưới_mặt_đất_135m_-_Ba_lan.JPG";
  const fallback="Mo_muoi_Wieliczka_duoi_mat_dat_135m_-_Ba_lan.JPG";
  const saved=await page.evaluate(async({nonce,data,fallback,logical})=>{
   const binary=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
   const r=await fetch("/wp-json/wp/v2/media",{method:"POST",credentials:"same-origin",
    headers:{"X-WP-Nonce":nonce,"Content-Type":"image/jpeg",
     "Content-Disposition":'attachment; filename="'+fallback+'"; filename*=UTF-8\'\''+encodeURIComponent(logical),
     Accept:"application/json"},body:binary});
   return {status:r.status,data:await r.json().catch(()=>null)};
  },{nonce,data:jpeg.toString("base64"),fallback,logical});
  if(saved.status!==201||!Number.isSafeInteger(saved.data?.id))
   throw Error("Native WP Media upload failed HTTP "+saved.status);
  media=saved.data;report.mediaCreated=true;report.wpWrites++;await save();
 }
 const response=await api("/wp-json/wp/v2/media/"+media.id+"?context=edit&_fields=id,source_url,media_details,mime_type");
 if(response.status!==200||response.data?.id!==media.id)throw Error("WP Media readback failed");
 const dest=await canonical(response.data);
 report.mediaId=media.id;await save();
 const updatedHtml=html.replace('src="'+old+'"','src="'+dest+'"');
 if(updatedHtml===html||updatedHtml.includes('src="'+old+'"'))
  throw Error("Scoped source body replacement not unique");
 const postSaved=await api("/wp-json/wp/v2/posts/83543","POST",{content:updatedHtml});
 if(postSaved.status!==200||postSaved.data?.id!==83543)
  throw Error("Post native draft update failed");
 report.postUpdated=true;report.wpWrites++;await save();
 const final=await api(postPath);const text=String(final.data?.content?.raw||"");
 if(final.status!==200||final.data?.status!=="draft"||
  final.data.slug!==slug||final.data.title?.raw!==entry.title||
  final.data.date!==entry.created_at_joomla.replace(" ","T")||
  final.data.acf?.action!=="PostDetails"||final.data.acf?.key!=="ssr-post"||
  JSON.stringify((final.data.categories||[]).sort((a,b)=>a-b))!==JSON.stringify([1742,1746])||
  text!==updatedHtml||text.includes('src="'+old+'"')||
  !text.includes("/wp-content/uploads/2026/11/Ba_Lan.jpg")||
  !text.includes("/wp-content/uploads/2026/11/Ao_2.jpg")||
  !text.includes(dest))
  throw Error("Final exact original image 3/3 private draft readback failed");
 report.result="THREE_ORIGINAL_PHOTOS_NATIVE_PRIVATE_DRAFT_COMPLETE";
 report.readbackVerified=true;await save();
 console.log("PSE_382_ORIGINAL_3_IMAGE_DRAFT_PASS="+JSON.stringify(report));
}catch(e){
 report.result="FAILED";report.errorType=e?.constructor?.name||"Error";
 await save();throw e;
}finally{
 await unlink(fp).catch(()=>{});
 await net.dispose();await context.close();await browser.close();
}
