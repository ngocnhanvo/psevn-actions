/** Move exactly verified original Joomla #382 Ba_Lan.JPG into WP native Media.
 * Only WordPress media exact source image, plus one src replacement in DRAFT83543.
 * User's remaining 2 missing photos MUST remain unchanged and unpublished.
 */
import {chromium,request} from "playwright";
import {readFile,writeFile,mkdir,unlink} from "node:fs/promises";
import {createHash} from "node:crypto";
const repo=process.env.GITHUB_REPOSITORY;
const commitMessage="cms(pse): stage exact original Ba_Lan photo in draft 382";
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(repo!=="ngocnhanvo/psevn-actions"||process.env.GITHUB_REF!=="refs/heads/main"||
 ev.head_commit?.message!==commitMessage||process.env.PSE_382_BACKUP_READY!=="yes")
 throw Error("Writer scope not authorized");
const source=JSON.parse(await readFile("docs/source/pse-original-public-articles-11-2026-11-22.json","utf8"));
const original=source.entries.find(x=>x.source_id===382);
const oldSrc="images/web/Ba_Lan.JPG",missing=["images/web/Áo_2.JPG","images/web/Mỏ_muối_Wieliczka_dưới_mặt_đất_135m_-_Ba_lan.JPG"];
if(source.schema!=="pse-original-joomla-selected-public-articles-v1"||
 original?.slug!=="pvfcco-se-to-chuc-thanh-cong-chuyen-du-lich-chau-au-cho-khach-hang-tieu-bieu-cua-cong-ty"||
 original?.inline_image_src?.length!==3||original.inline_image_src[1]!==oldSrc||
 missing.some(x=>!original.inline_image_src.includes(x)))throw Error("Source #382 original DB identity changed");
const expectedSha="f2587f776be8f888ae78cae1de5c0c5767855d2e01309245182d62cb1d3c1fe3",expectedLen=163574;
const file="/tmp/pse-382-original-Ba_Lan.JPG";
const bytes=await readFile(file);
const sha=x=>createHash("sha256").update(x).digest("hex");
if(bytes.length!==expectedLen||sha(bytes)!==expectedSha||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)
 throw Error("Original private export did not match proof");
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const get=n=>{
 const a=vars.filter(x=>x.startsWith(n+"="));
 if(a.length!==1)throw Error("Missing host "+n);
 const url=a[0].slice(n.length+1).replace(/^['"]|['"]$/g,"").replace(/\/$/,"");
 if(url!== (n==="WC_URL"?"https://admin-pse.webnvn.com":"https://pse.webnvn.com"))throw Error("Wrong environment "+n);
 return url;
};
const wp=get("WC_URL");get("WC_URL_CLIENT");
const out="artifacts/pse-382-verified-original-media";
await mkdir(out,{recursive:true});
const report={schema:"pse-382-exact-source-native-media-v1",sourceId:382,wpPostId:83543,sourceSha256:expectedSha,
 wpMediaId:null,mediaCreated:false,mediaReused:false,postRewritten:false,otherMediaUnchanged:true,
 otherImagesStillMissing:2,published:false,redirects:0,wpWrites:0,result:"NOT_STARTED"};
const save=()=>writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1366,height:860}});
const page=await ctx.newPage(),net=await request.newContext({timeout:40000});
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=(await page.locator("#loginform").innerText()).slice(0,650);
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("Unrecognized WP challenge");
   await input.fill(String(n));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())throw Error("WordPress authenticated session unavailable");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WordPress REST nonce unavailable");return(await r.text()).trim();
 });
 if(!/^[a-zA-Z0-9]{8,24}$/.test(nonce))throw Error("Invalid WP nonce");
 const api=async(path,method="GET",body=null)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",
   headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const getPost=()=>api("/wp-json/wp/v2/posts/83543?context=edit&_fields=id,slug,status,date,title,acf,categories,content");
 let post=await getPost();
 const baseBody=String(post.data?.content?.raw||"");
 if(post.http!==200||post.data?.id!==83543||post.data.slug!==original.slug||
    post.data.status!=="draft"||post.data.title?.raw!==original.title||
    post.data.date!==original.created_at_joomla.replace(" ","T")||
    post.data.acf?.action!=="PostDetails"||post.data.acf?.key!=="ssr-post"||
    JSON.stringify((post.data.categories||[]).sort((a,b)=>a-b))!==JSON.stringify([1742,1746])||
    missing.some(x=>!baseBody.includes(x)))throw Error("Post382 draft identity/required other images changed");
 const matches=await api("/wp-json/wp/v2/media?context=edit&search=Ba_Lan&per_page=100&_fields=id,slug,source_url,mime_type");
 if(matches.http!==200||!Array.isArray(matches.data)||matches.data.length>=100)
  throw Error("Media search incomplete or rejected");
 const exact=matches.data.filter(x=>{
   try{const u=x.source_url||"",name=decodeURIComponent(u.split("?")[0].split("/").at(-1)||"");
    return name.toLowerCase()==="ba_lan.jpg";}catch{return false}
 });
 // Previous guarded apply created exact verified original JPEG Media83545,
 // but its immediate REST response did not satisfy an overly strict URL
 // guard. Real read-only browser audit #45031573631 proved Media83545:
 // original sha256, original byte length, WP own origin, image/jpeg.
 // Reuse ONLY that immutable Media; never upload a duplicate.
 if(exact.length!==1||exact[0].id!==83545)throw Error("Existing proven Media83545 not uniquely found");
 const media=exact[0];
 const u=new URL(media.source_url,wp);
 if(u.origin!==wp||u.protocol!=="https:"||!u.pathname.startsWith("/wp-content/uploads/")||
    decodeURIComponent(u.pathname.split("/").at(-1)||"").toLowerCase()!=="ba_lan.jpg"||
    media.mime_type!=="image/jpeg")throw Error("Media83545 actual canonical origin/path/mime mismatch");
 const proof=await page.evaluate(async uri=>{
  const u=new URL(uri,location.href);
  if(u.origin!==location.origin||!u.pathname.startsWith("/wp-content/uploads/"))
   throw Error("Media URL not same-origin uploads");
  const response=await fetch(u.href,{credentials:"same-origin"});
  if(!response.ok||!String(response.headers.get("content-type")||"").startsWith("image/jpeg"))
   throw Error("WP image not served as original JPEG");
  const buffer=await response.arrayBuffer();
  if(buffer.byteLength>500000)throw Error("Unexpected image length");
  const checksum=await crypto.subtle.digest("SHA-256",buffer);
  return{size:buffer.byteLength,sha256:[...new Uint8Array(checksum)].map(x=>x.toString(16).padStart(2,"0")).join("")};
 },media.source_url);
 if(proof.size!==expectedLen||proof.sha256!==expectedSha)
  throw Error("WP Media83545 bytes differ from exact owner-source JPEG");
 report.mediaReused=true;
 report.wpMediaId=83545;
 await save();
 let desired=baseBody;
 if(!baseBody.includes(media.source_url)){
   if(baseBody.split('src="'+oldSrc+'"').length!==2)throw Error("Source draft Ba_Lan src not unique");
   desired=baseBody.replace('src="'+oldSrc+'"','src="'+media.source_url+'"');
   const saved=await api("/wp-json/wp/v2/posts/83543","POST",{content:desired});
   if(saved.http!==200||saved.data?.id!==83543)throw Error("Source draft media URL write failed");
   report.postRewritten=true;report.wpWrites++;
   await save();
 }
 post=await getPost();
 const actual=String(post.data?.content?.raw||"");
 if(post.http!==200||post.data.status!=="draft"||post.data.slug!==original.slug||
    !actual.includes(media.source_url)||actual.includes('src="'+oldSrc+'"')||
    missing.some(x=>!actual.includes(x))||
    post.data.date!==original.created_at_joomla.replace(" ","T")||
    post.data.acf?.action!=="PostDetails"||post.data.acf?.key!=="ssr-post"||
    post.data.title?.raw!==original.title)
  throw Error("Exact-source draft post readback failed");
 report.result="VERIFIED_ORIGINAL_MEDIA_IN_PRIVATE_DRAFT";
 await save();
 console.log("PSE_382_ORIGINAL_MEDIA_STAGE_PASS="+JSON.stringify(report));
}catch(e){
 report.result="FAILED";report.errorType=e.constructor?.name||"Error";
 await save();throw e;
}finally{
 await unlink(file).catch(()=>{});
 await net.dispose();await ctx.close();await browser.close();
}
