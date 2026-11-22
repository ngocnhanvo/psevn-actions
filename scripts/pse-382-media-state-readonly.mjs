/** Precise read-only WP Media/post state after guarded original JPEG staging failed.
 * Never write media or posts. Safe output ID/path class/SHA only, no auth data.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const wp="https://admin-pse.webnvn.com",front="https://pse.webnvn.com",sha=v=>createHash("sha256").update(v).digest("hex");
const originalSha="f2587f776be8f888ae78cae1de5c0c5767855d2e01309245182d62cb1d3c1fe3";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("wrong repository");
const b=await chromium.launch({headless:true}),ctx=await b.newContext({viewport:{width:1320,height:900}}),p=await ctx.newPage(),net=await request.newContext({timeout:35000});
const out="artifacts/pse-382-media-state-readonly";await mkdir(out,{recursive:true});
const report={schema:"pse-382-original-jpeg-native-post-media-state-v1",readOnly:true,postId:83543,media:[],noWrites:true};
try{
 await p.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=(await p.locator("#loginform").innerText()).slice(0,850),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],c=+m[3],v=({"+":a+c,"-":a-c,"×":a*c,x:a*c,"*":a*c})[m[2]];
   const field=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("Unexpected challenge");await field.fill(String(v));
  }
  await p.locator("#wp-submit").click();
 }
 await p.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(p.url().includes("wp-login")||!await p.locator("#adminmenu").count())throw Error("unauthenticated");
 const nonce=await p.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("No nonce");return(await r.text()).trim();
 });
 const api=async(path)=>p.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});
  return {http:r.status,data:await r.json().catch(()=>null)};
 },{path,nonce});
 const post=await api("/wp-json/wp/v2/posts/83543?context=edit&_fields=id,slug,status,date,title,acf,categories,content");
 const h=String(post.data?.content?.raw||"");
 if(post.http!==200||post.data?.id!==83543||post.data?.status!=="draft")throw Error("Post382 identity changed");
 report.post={status:post.data.status,originalSrcCount:h.split('src="images/web/Ba_Lan.JPG"').length-1,
  sourceMissingTwoPresent:h.includes("images/web/Áo_2.JPG")&&h.includes("images/web/Mỏ_muối_Wieliczka_dưới_mặt_đất_135m_-_Ba_lan.JPG"),
  nativeUploadsSrcCount:(h.match(/wp-content\/uploads\/[^\s"<>]*Ba_Lan/i)||[]).length};
 const r=await api("/wp-json/wp/v2/media?context=edit&search=Ba_Lan&per_page=100&_fields=id,slug,source_url,mime_type,media_details");
 if(r.http!==200||!Array.isArray(r.data)||r.data.length>=100)throw Error("Media lookup unavailable");
 for(const item of r.data){
  const raw=String(item.source_url||"");
  const url=new URL(raw,wp);
  const safeOrigin=[wp,front].includes(url.origin)&&url.protocol==="https:";
  const basename=decodeURIComponent(url.pathname.split("/").at(-1)||"");
  const record={id:item.id,mime_type:item.mime_type,originType:url.origin===wp?"wp":url.origin===front?"frontend":"other",
   pathKind:url.pathname.includes("/wp-content/uploads/")?"wp_uploads":url.pathname.startsWith("/api/files/")?"api_files":"other",
   pathStarts:url.pathname.slice(0,45),filename:basename.slice(0,110),
   safeOrigin,sha256_match:false,bytes:null};
  if(safeOrigin&&item.mime_type==="image/jpeg"){
   try{
    const get=await net.get(raw,{maxRedirects:2,timeout:35000});
    if(get.status()===200){
      const buf=await get.body();
      if(buf.length<2*1024*1024){
       record.bytes=buf.length;record.sha256_match=sha(buf)===originalSha;
      }
    }
   }catch(e){record.downloadError=e.constructor?.name||"Error"}
  }
  report.media.push(record);
 }
 console.log("PSE_382_MEDIA_STATE_READONLY="+JSON.stringify(report));
}finally{
 await writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await ctx.close();await b.close();
}
