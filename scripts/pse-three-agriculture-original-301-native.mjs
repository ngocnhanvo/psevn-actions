/** Three exact Joomla agriculture Article originals -> their source-owned native WP canonical Posts.
 * Guarded, idempotent, one-to-one 301 using existing WordPress routing manager.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const msg="cms(pse): redirect three exact original agriculture articles 344 348 370";
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||ev.head_commit?.message!==msg||
 process.env.PSE_THREE_AGRICULTURE_301_BACKUP_VERIFIED!=="yes")
 throw Error("Unapproved exact agriculture 301 native WP write or missing fresh DB rollback");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified)
 throw Error("Original Joomla state missing");
const defs=[{id:344,wpId:83483,day:"2013-03-14"},{id:348,wpId:83486,day:"2013-03-18"},{id:370,wpId:83489,day:"2013-06-17"}];
const rows=defs.map(({id,wpId,day})=>{
 const original=state.articles?.[id]?.source_url||"",u=new URL(original);
 if(u.protocol!=="https:"||u.hostname!=="www.pse.vn"||u.search||u.hash||
  !u.pathname.startsWith("/hoat-dong-kinh-doanh/kien-thuc-nong-nghiep/"+id+"-")||
  !new RegExp("/"+id+"-[a-z0-9-]+\\.html$","i").test(u.pathname))
  throw Error("Joomla agriculture source URL changed "+id);
 const slug=u.pathname.split("/").at(-1).replace(new RegExp("^"+id+"-"),"").replace(/\.html$/i,"");
 if(!/^[a-z0-9-]+$/.test(slug))throw Error("Original source slug invalid "+id);
 return{id,wpId,day,from:u.pathname,to:"/"+slug,source:original,existing:null,createdId:null,published:false};
});
const e=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=k=>{const a=e.filter(x=>x.startsWith(k+"="));if(a.length!==1)throw Error("Missing "+k);
 const u=new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))
 throw Error("Unexpected "+k);
 return u.origin;};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");if(wp===front)throw Error("CMS/public origins overlap");
const net=await request.newContext({timeout:45000});
const browser=await chromium.launch({headless:true}),page=await browser.newPage();
const report={schema:"pse-344-348-370-exact-native-301-v1",sourceIds:[344,348,370],
 readOnly:false,rollbackFresh:true,rows:[],writes:[],noBuild:true,sourceProvenance:true};
let api=null,success=false;
try{
 // Check BOTH original source identities and BOTH native published targets
 // before creating or modifying any WordPress routing records.
 for(const d of rows){
  const [source,post,target,old]=await Promise.all([
   net.get(d.source,{timeout:60000,failOnStatusCode:false}),
   net.get(wp+"/wp-json/wp/v2/posts?status=publish&slug="+encodeURIComponent(d.to.slice(1))+
    "&_fields=id,status,slug,date,acf,categories,featured_media&per_page=5",{failOnStatusCode:false}),
   net.get(front+d.to,{maxRedirects:0,failOnStatusCode:false}),
   net.get(front+d.from,{maxRedirects:0,failOnStatusCode:false})
  ]);
  if(source.status()!==200||post.status()!==200||target.status()!==200)
   throw Error("Original Joomla/source-owned native published target not ready "+d.id);
  const posts=await post.json();
  if(posts.length!==1||posts[0].id!==d.wpId||posts[0].status!=="publish"||
   String(posts[0].acf?.origin_page_id)!==String(d.id)||
   posts[0].date?.slice(0,10)!==d.day||!posts[0].categories?.includes(1755)||
   !Number.isSafeInteger(Number(posts[0].featured_media))||posts[0].featured_media<1)
   throw Error("Native Joomla agriculture Post ownership/date/category mismatch "+d.id);
  const html=await target.text();
  const m=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||
   html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i);
  const canonical=m?.[1]?new URL(m[1],front):null;
  if(!canonical||canonical.origin!==front||canonical.pathname!==d.to||canonical.search||canonical.hash)
   throw Error("Source owned target canonical mismatch "+d.id);
  if(old.status()!==404&&old.status()!==301)throw Error("Old Joomla agriculture link collision "+d.id);
  if(old.status()===301){
   const loc=new URL(old.headers().location||"",front);
   if(loc.origin!==front||loc.pathname!==d.to||loc.search||loc.hash)
    throw Error("Existing old Joomla agriculture redirect leads elsewhere "+d.id);
  }
  d.legacyStatus=old.status();
 }
 const categories=await net.get(wp+"/wp-json/wp/v2/categories?slug=kien-thuc-nong-nghiep&_fields=id,slug,parent");
 if(categories.status()!==200)throw Error("WordPress agriculture taxonomy unavailable");
 const cat=await categories.json();
 if(cat.length!==1||cat[0].id!==1755||Number(cat[0].parent)!==0)
  throw Error("Source-owned agriculture category changed");
 // Protected WordPress editor + nonce, no generic write API fallback.
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const m=(await page.locator("#loginform").innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){
   const a=+m[1],b=+m[3],val=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const fld=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await fld.count())throw Error("WP captcha field missing");
   await fld.fill(String(val));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())
  throw Error("Authenticated source-owned WP routing editor unavailable");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WordPress nonce unavailable");
  return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Native WordPress REST nonce invalid");
 api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,"Accept":"application/json",...(body?{"Content-Type":"application/json"}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),
   data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const registry=[];
 for(let n=1;n<=40;n++){
  const r=await api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&page="+n+
   "&orderby=id&order=asc&_fields=id,status,acf");
  if(r.http!==200||!Array.isArray(r.data)||!Number.isSafeInteger(r.pages)||r.pages<1||r.pages>40)
   throw Error("Native 301 registry incomplete page "+n);
  registry.push(...r.data);if(n===r.pages)break;
 }
 for(const d of rows){
  const found=registry.filter(x=>x.acf?.from_link===d.from);
  if(found.length>1)throw Error("Duplicate exact source Joomla agriculture route "+d.id);
  const existing=found[0];
  if(existing&&(existing.acf?.to_link!==d.to||String(existing.acf?.type)!=="301"||
   existing.acf?.match_type!=="Exact"||existing.acf?.enable!==true))
   throw Error("Conflicting original agriculture redirect "+d.id);
  d.existing=existing?{id:existing.id,status:existing.status}:null;
 }
 console.log("PSE_AGRICULTURE_TWO_301_PREFLIGHT="+JSON.stringify({sourceIds:[344,348,370],
  originalPosts:rows.map(x=>x.wpId),legacyStatuses:rows.map(x=>x.legacyStatus),
  existingRoutes:rows.map(x=>x.existing),targetCanonicalsVerified:true,freshDBBackup:true}));
 await mkdir("artifacts/pse-original-agriculture-301",{recursive:true});
 await writeFile("artifacts/pse-original-agriculture-301/rollback.json",
  JSON.stringify({sources:rows.map(x=>({id:x.id,from:x.from,to:x.to,previous:x.existing}))},null,2)+"\n");
 for(const d of rows){
  let id=d.existing?.id||null;
  if(!id){
   const created=await api("/wp-json/wp/v2/chuyen-huong-link","POST",{
    status:"draft",title:"PSE: Joomla kiến thức nông nghiệp "+d.id+" → Post gốc",
    acf:{from_link:d.from,to_link:d.to,type:"301",match_type:"Exact",enable:true}
   });
   if(created.http!==201||!Number.isSafeInteger(Number(created.data?.id))||created.data.id<1)
    throw Error("Original native agriculture redirect draft missing "+d.id);
   id=Number(created.data.id);d.createdId=id;
   report.writes.push({sourceId:d.id,kind:"draft",id});
   await writeFile("artifacts/pse-original-agriculture-301/rollback.json",
    JSON.stringify({sources:rows.map(x=>({id:x.id,from:x.from,to:x.to,
      previous:x.existing,createdId:x.createdId||null}))},null,2)+"\n");
  }
  const check=await api("/wp-json/wp/v2/chuyen-huong-link/"+id+"?context=edit&_fields=id,status,acf");
  if(check.http!==200||check.data?.acf?.from_link!==d.from||
   check.data.acf?.to_link!==d.to||String(check.data.acf?.type)!=="301"||
   check.data.acf?.match_type!=="Exact"||check.data.acf?.enable!==true)
   throw Error("Native agriculture route source/target proof failed "+d.id);
  if(check.data.status!=="publish"){
   const p=await api("/wp-json/wp/v2/chuyen-huong-link/"+id,"POST",{status:"publish"});
   if(p.http!==200||p.data?.status!=="publish")throw Error("Native agriculture redirect publish failed "+d.id);
   report.writes.push({sourceId:d.id,kind:"publish",id});
  }
  const verified=await api("/wp-json/wp/v2/chuyen-huong-link/"+id+
   "?context=edit&_fields=id,status,acf");
  if(verified.http!==200||verified.data.status!=="publish"||
   verified.data.acf?.from_link!==d.from||verified.data.acf?.to_link!==d.to)
   throw Error("Published exact agriculture 301 readback failed "+d.id);
  d.published=true;report.rows.push({sourceId:d.id,redirectId:id,from:d.from,to:d.to,published:true});
  console.log("PSE_AGRICULTURE_EXACT_301_ROW_PASS="+JSON.stringify(report.rows.at(-1)));
 }
 if(report.rows.length!==3)throw Error("Three original agriculture redirect rows not published");
 success=true;
 console.log("PSE_AGRICULTURE_TWO_EXACT_301_APPLY_PASS="+JSON.stringify({sourceIds:[344,348,370],
  sourceRoutes:report.rows.map(x=>x.redirectId),otherLinksUnchanged:true,nativeWordPress:true,
  publishedSourcePosts:3,freshDBBackup:true,buildTriggered:false,writes:report.writes.length}));
}finally{
 if(!success&&api){
  for(const d of rows.filter(x=>x.createdId&&!x.published)){
   try{
    const b=await api("/wp-json/wp/v2/chuyen-huong-link/"+d.createdId+
     "?context=edit&_fields=id,status,acf");
    if(b.http===200&&b.data?.status==="draft"&&b.data.acf?.from_link===d.from){
     const del=await api("/wp-json/wp/v2/chuyen-huong-link/"+d.createdId+"?force=true","DELETE");
     const after=await api("/wp-json/wp/v2/chuyen-huong-link/"+d.createdId+"?context=edit");
     if(del.http!==200||after.http!==404)throw Error("Native draft cleanup not verified");
     report.writes.push({sourceId:d.id,kind:"failedDraftRemoved",id:d.createdId});
    }
   }catch(e){console.warn("PSE_AGRICULTURE_301_CLEANUP_REVIEW="+JSON.stringify({id:d.id,error:String(e?.message||e).slice(0,120)}))}
  }
 }
 await mkdir("artifacts/pse-original-agriculture-301",{recursive:true});
 await writeFile("artifacts/pse-original-agriculture-301/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
