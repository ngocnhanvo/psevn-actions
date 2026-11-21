/** Exact original Joomla 379 -> its source-verified published WP 82119 article.
 * Native WordPress chuyen-huong-link only. Fresh backup required, one exact 301.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const message="cms(pse): redirect original Joomla 379 to verified published article";
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH||"","utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 ev?.head_commit?.message!==message||
 process.env.PSE_379_301_FRESH_BACKUP_VERIFIED!=="yes")
 throw Error("Unapproved Joomla 379 301 writer/no rollback");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const from="/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/379-pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco.html";
const source="https://www.pse.vn"+from;
const to="/pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco";
if(state.schema!=="pse-legacy-article-migration-v1"||state.articles?.["379"]?.source_url!==source)
 throw Error("Original 379 Joomla exact path drift");
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=k=>{
 const r=lines.filter(x=>x.startsWith(k+"="));
 if(r.length!==1)throw Error("Missing "+k);
 const u=new URL(r[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
 u.port||!["","/"].includes(u.pathname))throw Error("Disallowed PSE origin "+k);
 return u.origin;
};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("CMS/frontend origins overlap");
const net=await request.newContext({timeout:45000});
const browser=await chromium.launch({headless:true}),admin=await browser.newPage();
let api=null,createdId=null,published=false;
const report={schema:"pse-379-exact-native-original-301-v1",originalId:379,postId:82119,
 from,to,backupVerified:true,writes:[],otherRecordsChanged:0,buildTriggered:false,readOnly:false};
try{
 const [sourceResp,postResp,catResp,targetResp,oldResp]=await Promise.all([
  net.get(source,{failOnStatusCode:false}),
  net.get(wp+"/wp-json/wp/v2/posts?slug="+to.slice(1)+"&per_page=5&_fields=id,slug,status,date,title,acf,categories,content",{failOnStatusCode:false}),
  net.get(wp+"/wp-json/wp/v2/categories?slug=tin-tong-hop&hide_empty=false&_fields=id,slug,parent",{failOnStatusCode:false}),
  net.get(front+to,{maxRedirects:0,failOnStatusCode:false}),
  net.get(front+from,{maxRedirects:0,failOnStatusCode:false})
 ]);
 if(sourceResp.status()!==200||postResp.status()!==200||catResp.status()!==200||
 targetResp.status()!==200)throw Error("Original Joomla source/native WordPress Astro target unavailable");
 const posts=await postResp.json(),cats=await catResp.json();
 if(!Array.isArray(posts)||posts.length!==1||posts[0].id!==82119||
 posts[0].slug!==to.slice(1)||posts[0].status!=="publish"||
 posts[0].date!=="2013-07-03T02:10:17"||
 !posts[0].categories?.includes(1742)||!posts[0].categories?.includes(1746)||
 !Array.isArray(cats)||cats.length!==1||cats[0].id!==1746||cats[0].parent!==1742)
  throw Error("Native Joomla 379 published original identity/taxonomy missing");
 const html=await targetResp.text();
 const canonical=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||
  html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i);
 const canonicalUrl=canonical?.[1]?new URL(canonical[1],front):null;
 if(!canonicalUrl||canonicalUrl.origin!==front||canonicalUrl.pathname!==to||
  canonicalUrl.search||canonicalUrl.hash)
  throw Error("Original Joomla 379 frontend canonical mismatch");
 const oldStatus=oldResp.status(),oldLoc=oldResp.headers().location||"";
 if(oldStatus!==404&&oldStatus!==301)throw Error("Original Joomla 379 old frontend status unexpected "+oldStatus);
 if(oldStatus===301){
  const dest=new URL(oldLoc,front);
  if(dest.origin!==front||dest.pathname!==to||dest.search||dest.hash)
   throw Error("Conflicting old Joomla 379 legacy redirect");
 }
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=(await admin.locator("#loginform").innerText()).slice(0,650);
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const fld=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await fld.count())throw Error("WordPress login challenge cannot be identified");
   await fld.fill(String(v))}
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(admin.url().includes("wp-login")||!await admin.locator("#adminmenu").count())
  throw Error("WordPress protected administrator authentication failed");
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Protected REST nonce missing");
  return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Bad WordPress nonce");
 api=(path,method="GET",body)=>admin.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,Accept:"application/json",
   ...(body?{"Content-Type":"application/json"}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),
   data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const registry=[];
 for(let page=1;page<=40;page++){
  const r=await api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&page="+page+
    "&orderby=id&order=asc&_fields=id,status,acf");
  if(r.http!==200||!Array.isArray(r.data)||r.pages<1||r.pages>40)
   throw Error("Native WordPress redirect list incomplete page "+page);
  registry.push(...r.data);
  if(page===r.pages)break;
 }
 const prior=registry.filter(x=>x.acf?.from_link===from);
 if(prior.length>1)throw Error("Duplicate Joomla 379 exact old URL rule");
 const existing=prior[0]||null;
 if(existing&&(existing.acf?.to_link!==to||String(existing.acf?.type)!=="301"||
  existing.acf.match_type!=="Exact"||existing.acf.enable!==true))
  throw Error("Conflicting original Joomla 379 native route ACF fields");
 console.log("PSE_379_NATIVE_301_PREFLIGHT="+JSON.stringify({
  sourceId:379,wpId:82119,originalRSSDate:"2013-07-03",
  previousRuleId:existing?.id||null,oldStatus,registryRows:registry.length,
  publishedCanonical200:true,backup:true}));
 let redirectId=existing?.id||null;
 if(existing?.status==="publish"&&oldStatus===301){
  published=true;report.status="ALREADY_PUBLISHED_EXACT";
 }else{
  if(!redirectId){
   const created=await api("/wp-json/wp/v2/chuyen-huong-link","POST",{
    status:"draft",title:"PSE: Joomla bài gốc 379 → Tin tổng hợp",
    acf:{from_link:from,to_link:to,type:"301",match_type:"Exact",enable:true}
   });
   if(created.http!==201||!Number.isSafeInteger(Number(created.data?.id)))
    throw Error("Cannot stage source-owned original Joomla 379 301");
   redirectId=Number(created.data.id);createdId=redirectId;
   report.writes.push({action:"create_draft",id:redirectId});
  }
  const before=await api("/wp-json/wp/v2/chuyen-huong-link/"+redirectId+
   "?context=edit&_fields=id,status,acf");
  if(before.http!==200||before.data?.id!==redirectId||
   before.data.acf?.from_link!==from||before.data.acf?.to_link!==to||
   String(before.data.acf?.type)!=="301"||before.data.acf?.match_type!=="Exact"||
   before.data.acf?.enable!==true)
   throw Error("Native original 379 redirect readback mismatch");
  if(before.data.status!=="publish"){
   const r=await api("/wp-json/wp/v2/chuyen-huong-link/"+redirectId,"POST",{status:"publish"});
   if(r.http!==200||r.data?.status!=="publish")
    throw Error("Cannot publish source-owned exact Joomla 379 native redirect");
   report.writes.push({action:"publish",id:redirectId});
  }
  const end=await api("/wp-json/wp/v2/chuyen-huong-link/"+redirectId+
   "?context=edit&_fields=id,status,acf");
  if(end.http!==200||end.data?.status!=="publish"||
   end.data.acf?.from_link!==from||end.data.acf?.to_link!==to||
   String(end.data.acf.type)!=="301"||end.data.acf.match_type!=="Exact"||
   end.data.acf.enable!==true)
   throw Error("Original Joomla 379 published redirect final readback mismatch");
  published=true;report.status="NATIVE_EXACT_301_PUBLISHED";
 }
 report.redirectId=redirectId;
 console.log("PSE_379_ORIGINAL_301_APPLY_PASS="+JSON.stringify({
  sourceId:379,wpId:82119,redirectId,from,to,writes:report.writes.length,
  originalPublishedPost:true,otherRecordsChanged:0,buildTriggeredByWriter:false}));
}finally{
 if(createdId&&!published&&api){
  try{
   const d=await api("/wp-json/wp/v2/chuyen-huong-link/"+createdId+
    "?context=edit&_fields=id,status,acf");
   if(d.http===200&&d.data?.status==="draft"&&d.data?.acf?.from_link===from){
    const del=await api("/wp-json/wp/v2/chuyen-huong-link/"+createdId,"DELETE");
    const verify=await api("/wp-json/wp/v2/chuyen-huong-link/"+createdId+
      "?context=edit&_fields=id,status");
    if(del.http!==200||verify.data?.status!=="trash")
     throw Error("Temp draft cleanup incomplete");
    console.log("PSE_379_301_TEMP_CLEANUP_PASS id="+createdId);
   }else console.warn("PSE_379_301_TEMP_REVIEW id="+createdId);
  }catch(e){console.warn("PSE_379_301_TEMP_CLEANUP_REVIEW="+String(e?.message||e).slice(0,120))}
 }
 await mkdir("artifacts/pse-379-original-301",{recursive:true});
 await writeFile("artifacts/pse-379-original-301/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
