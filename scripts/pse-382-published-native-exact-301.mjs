/** Finalize ONLY the already prepared Joomla #382 legacy 301 to published WP Post83543.
 * No Post writes, no Media writes, no Astro hardcoding; native WP CPT 83551 only.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const message="cms(pse): activate exact Joomla 382 legacy 301 after native publication";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 evt.head_commit?.message!==message||
 process.env.PSE_382_REDIRECT_BACKUP_READY!=="yes")throw Error("Unauthorized one-rule writer scope");
const original=JSON.parse(await readFile("docs/source/pse-original-public-articles-11-2026-11-22.json","utf8"));
const x=original.entries?.find(r=>r.source_id===382);
const slug="pvfcco-se-to-chuc-thanh-cong-chuyen-du-lich-chau-au-cho-khach-hang-tieu-bieu-cua-cong-ty";
const old="/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/382-"+slug+".html";
if(original.schema!=="pse-original-joomla-selected-public-articles-v1"||
 x?.slug!==slug||x.inline_image_src?.length!==3)throw Error("Joomla original #382 source changed");
const variables=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const val=n=>{
 const a=variables.filter(s=>s.startsWith(n+"="));
 if(a.length!==1)throw Error("WordPress target env ambiguous");
 return a[0].slice(n.length+1).replace(/^['"]|['"]$/g,"").replace(/\/$/,"");
};
const wp=val("WC_URL"),front=val("WC_URL_CLIENT");
if(wp!=="https://admin-pse.webnvn.com"||front!=="https://pse.webnvn.com")
 throw Error("Wrong PSE target");
const imageProof=[
 ["Ao_2.jpg",269085,"7a190b8e1c4144e8b9f4aeab0a7aedf415cc74281212ce100cc61dd31db08964"],
 ["Ba_Lan.jpg",163574,"f2587f776be8f888ae78cae1de5c0c5767855d2e01309245182d62cb1d3c1fe3"],
 ["Mo_muoi_Wieliczka_duoi_mat_dat_135m_-_Ba_lan.jpg",143031,"206537e10a6bf2a95c5943aa17140b0a83ccc3b8b9921b9f8d59c5d5eaffaa5b"]
];
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const out="artifacts/pse-382-final-native-original-redirect";
await mkdir(out,{recursive:true});
const report={schema:"pse-382-exact-original-published-post-301-v1",wpPostId:83543,redirectId:83551,
 sourceId:382,postPreviouslyPublished:false,photoHashesVerified:0,liveArticleBeforeRedirect:false,
 nativeRedirectPublished:false,redirectWriteCount:0,postWrites:0,mediaWrites:0,freshBackup:true,
 requiresWordPressBuild:true,oldSourcePath:old,destinationPath:"/"+slug,result:"STARTED"};
const save=()=>writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:860}});
const page=await context.newPage(),net=await request.newContext({timeout:45000});
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const content=(await page.locator("#loginform").innerText()).slice(0,850);
  const m=content.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("WP login math challenge unrecognized");
   await f.fill(String(v));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())
  throw Error("WordPress authenticated session unavailable");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP REST nonce missing");
  return(await r.text()).trim();
 });
 if(!/^[a-zA-Z0-9]{8,24}$/.test(nonce))throw Error("Wrong WP nonce");
 const api=async(route,method="GET",data)=>page.evaluate(async({route,method,data,nonce})=>{
  const r=await fetch(route,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,Accept:"application/json",...(data?{"Content-Type":"application/json"}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {http:r.status,data:await r.json().catch(()=>null)};
 },{route,method,data,nonce});
 const post=await api("/wp-json/wp/v2/posts/83543?context=edit&_fields=id,slug,status,title,date,categories,acf,content");
 const body=String(post.data?.content?.raw||"");
 if(post.http!==200||post.data?.id!==83543||post.data.slug!==slug||
    post.data.status!=="publish"||post.data.title?.raw!==x.title||
    post.data.date!==x.created_at_joomla.replace(" ","T")||
    post.data.acf?.action!=="PostDetails"||post.data.acf?.key!=="ssr-post"||
    JSON.stringify((post.data.categories||[]).sort((a,b)=>a-b))!==JSON.stringify([1742,1746]))
  throw Error("Published native article identity/date/categories changed");
 report.postPreviouslyPublished=true;await save();
 const imgs=[...body.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
 if(imgs.length!==3)throw Error("Exact three original images absent from published content");
 for(let i=0;i<imgs.length;i++){
  const u=new URL(imgs[i],wp),[filename,len,hash]=imageProof[i];
  if(u.origin!==wp||!u.pathname.startsWith("/wp-content/uploads/")||
     u.pathname.split("/").at(-1)!==filename)throw Error("WP photo canonical path changed at index "+i);
  const check=await net.get(u.href,{timeout:45000,failOnStatusCode:false});
  if(check.status()!==200)throw Error("WP photo not accessible at index "+i);
  const bytes=await check.body();
  if(bytes.length!==len||sha(bytes)!==hash)throw Error("Original WP JPEG hash mismatch at index "+i);
  report.photoHashesVerified++;
 }
 const publicRes=await net.get(front+"/"+slug,{timeout:50000,failOnStatusCode:false});
 const html=await publicRes.text();
 const transformed=["Ao_2.webp","Ba_Lan.webp","Mo_muoi_Wieliczka_duoi_mat_dat_135m_-_Ba_lan.webp"];
 if(publicRes.status()!==200||!html.includes("PVFCCo SE")||!html.includes("Wieliczka")||
   transformed.some(img=>!html.includes(img)))
  throw Error("Astro public article original three optimized photos not ready");
 report.liveArticleBeforeRedirect=true;await save();
 const endpoint="/wp-json/wp/v2/chuyen-huong-link/83551";
 let rule=await api(endpoint+"?context=edit&_fields=id,status,acf");
 if(rule.http!==200||rule.data?.id!==83551||
   rule.data.acf?.from_link!==old||rule.data.acf?.to_link!=="/"+slug||
   String(rule.data.acf?.type)!=="301"||rule.data.acf?.match_type!=="Exact"||
   !rule.data.acf?.enable||!["draft","publish"].includes(rule.data.status))
  throw Error("Owned native exact Joomla redirect CPT identity changed");
 if(rule.data.status==="draft"){
  const publish=await api(endpoint,"POST",{status:"publish"});
  if(publish.http!==200||publish.data?.id!==83551||publish.data?.status!=="publish")
    throw Error("Native Joomla original 301 cannot be published");
  report.redirectWriteCount++;await save();
 }
 rule=await api(endpoint+"?context=edit&_fields=id,status,acf");
 if(rule.http!==200||rule.data?.status!=="publish"||
  rule.data.acf?.from_link!==old||rule.data.acf?.to_link!=="/"+slug||
  String(rule.data.acf?.type)!=="301"||rule.data.acf?.match_type!=="Exact"||
  !rule.data.acf?.enable)throw Error("Native published Joomla 301 readback failed");
 report.nativeRedirectPublished=true;report.result="ORIGINAL_382_NATIVE_REDIRECT_PUBLISHED_NEEDS_ASTRO_BUILD";
 await save();
 console.log("PSE_382_NATIVE_301_READY_FOR_BUILD="+JSON.stringify(report));
}catch(e){
 report.result="FAILED";report.errorType=e?.constructor?.name||"Error";
 await save();throw e;
}finally{
 await net.dispose();await context.close();await browser.close();
}
