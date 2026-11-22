/** Owner-scoped repair: 34 original Joomla URLs have native published WP content.
 * Restore one broken Unicode-encoded WordPress Post slug (#1159) as ASCII,
 * then add 34 source-identity-matched native WordPress exact 301 records.
 * No Post content/SEO/title/date/category/media changes, no Astro hardcoding.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const expectedMessage="cms(pse): restore 34 original Joomla source redirects and encoded 1159 permalink";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 event.head_commit?.message!==expectedMessage||
 process.env.PSE_ORIGINAL_34_FRESH_UPDRAFT!=="yes")
 throw Error("Unauthorized PSE original 34 redirect writer or missing DB rollback");
const ledger=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const proof=JSON.parse(await readFile("inputs/preflight/report.json","utf8"));
const ids=[75,86,90,91,92,205,226,227,229,230,240,321,980,985,986,987,988,989,990,991,992,993,994,995,996,997,1053,1159,1184,1427,1668,1669,1677,1722].sort((a,b)=>a-b);
const postIDs={75:82477,86:82270,90:82437,91:82434,92:82431,205:83430,226:83432,
 227:83440,229:83442,230:83434,240:83436,321:83438,
 980:83318,985:81628,986:81175,987:81102,988:81296,989:82865,990:83136,
 991:81090,992:81106,993:81137,994:81064,995:81077,996:81115,997:81124,
 1053:83036,1159:79852,1184:79439};
const productIds=new Set([1427,1668,1669,1677,1722]);
const wp="https://admin-pse.webnvn.com",front="https://pse.webnvn.com",endpoint="/wp-json/wp/v2/chuyen-huong-link";
if(ledger.schema!=="pse-legacy-article-migration-v1"||!ledger.backup_verified||
 Object.keys(ledger.articles||{}).length!==804||
 proof.schema!=="pse-34-fully-published-original-joomla-paths-native-canonical-preflight-v1"||
 !proof.noCmsWrites||proof.rows?.length!==34||proof.summary?.passed!==33||
 JSON.stringify(proof.summary.rejected)!=="[1159]"||
 ids.length!==34||new Set(ids).size!==34||ids.includes(975)||
 proof.priorMissing404Run!==45048066030||proof.priorSourceIdentityRun!==45048074150)
 throw Error("Independent pinned 33/34 preflight or legacy-source scope changed");
const verified=new Map(proof.rows.filter(x=>x.pass).map(x=>[x.sourceId,x]));
if(verified.size!==33||[...verified.keys()].some(id=>!ids.includes(id)))
 throw Error("Independent verified source candidate set changed");
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
for(const [name,expected] of [["WC_URL",wp],["WC_URL_CLIENT",front]]){
 const a=vars.filter(x=>x.startsWith(name+"="));
 if(a.length!==1||a[0].slice(name.length+1).replace(/^['"]|['"]$/g,"").replace(/\/$/,"")!==expected)
  throw Error("Wrong PSE production origin");
}
const out="artifacts/pse-34-original-joomla-native-301s";await mkdir(out,{recursive:true});
const report={schema:"pse-34-source-proven-native-wordpress-301-and-1159-slug-repair-v1",
 originalSourceIds:ids,originalSourceCount:804,
 nativePosts:29,nativeProducts:5,independentPreflightRun:45048604092,
 sourceURLsPreserved:true,siteOwnedMediaUnchanged:true,externalMediaUnchanged:true,
 onlyPostSlugWriteId:79852,postsBodyWrites:0,productWrites:0,mediaWrites:0,
 dbBackupVerified:true,preflight:[],slugRepair:null,redirects:[],writes:[],result:"STARTED"};
const save=()=>writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:850}});
const page=await context.newPage(),net=await request.newContext({timeout:45000});
let api=null;
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing native WP credentials");
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=(await page.locator("#loginform").innerText()).slice(0,900);
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){
   const v=({"+":+m[1]+ +m[3],"-":+m[1]- +m[3],x:+m[1]* +m[3],"×":+m[1]* +m[3],"*":+m[1]* +m[3]})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Unrecognized native WordPress login challenge");
   await f.fill(String(v));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())
  throw Error("WordPress native authentication unavailable");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce unavailable");return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("WordPress REST nonce invalid");
 api=async (path,method="GET",body)=>{
  for(let n=1;n<= (method==="GET"?3:1);n++){
   try{
    const x=await page.evaluate(async({path,method,body,nonce})=>{
     const r=await fetch(path,{method,credentials:"same-origin",headers:{
      "X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})
     },...(body?{body:JSON.stringify(body)}:{})});
     return{http:r.status,pages:Number(r.headers.get("x-wp-totalpages")||1),
      body:await r.json().catch(()=>null)};
    },{path,method,body,nonce});
    return x;
   }catch(e){
    if(method!=="GET"||n===3||
       !/ECONNRESET|ETIMEDOUT|Timeout|socket hang up|fetch failed/i.test(String(e?.message||e)))
     throw Error("Native REST "+method+" transport failure at "+path.split("?")[0]);
    await new Promise(resolve=>setTimeout(resolve,n*850));
   }
  }
 };
 const original=ledger.articles[1159],u1159=new URL(original.source_url);
 const encodedSource=u1159.pathname.split("/").at(-1).replace(/^1159-/,"").replace(/\.html$/i,"");
 const asciiDecoded=decodeURIComponent(encodedSource).normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[đĐ]/g,"d").toLowerCase()
  .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
 const newSlug="pvfcco-se-phan-bon-phu-my-giup-tang-nang-suat-tren-cay-ho-tieu";
 if(original.wp_id!==79852||original.status!=="imported"||
    original.source_created_date!=="2015-12-11"||
    u1159.origin!=="https://www.pse.vn"||asciiDecoded!==newSlug)
  throw Error("Exact historical Joomla #1159 title/date/transliteration not independently pinned");
 const post=await api("/wp-json/wp/v2/posts/79852?context=edit&_fields=id,slug,status,title,date,acf,categories,content");
 const p=post.body||{},rawContent=String(p.content?.raw||"");
 if(post.http!==200||p.id!==79852||p.status!=="publish"||
   p.acf?.action!=="PostDetails"||p.acf?.key!=="ssr-post"||
   !Array.isArray(p.categories)||p.categories.length<1||
   !p.title?.raw||!rawContent.trim()||rawContent.length<100||
   p.date?.slice(0,10)!=="2015-12-11"||
   String(p.slug||"").toLowerCase()!==encodedSource.toLowerCase()&&p.slug!==newSlug)
  throw Error("Original #1159 authenticated WP source Post identity/title/body/date changed");
 const before={id:p.id,slug:p.slug,status:p.status,title:p.title.raw,date:p.date,
  categories:p.categories,content:rawContent,acf:p.acf};
 const collisionURLs=[
  "/wp-json/wp/v2/posts?context=edit&status=any&slug="+encodeURIComponent(newSlug)+"&_fields=id,slug,status",
  "/wp-json/wp/v2/pages?context=edit&status=any&slug="+encodeURIComponent(newSlug)+"&_fields=id,slug,status",
  "/wp-json/wp/v2/product?context=edit&status=any&slug="+encodeURIComponent(newSlug)+"&_fields=id,slug,status"
 ];
 for(const endpoint of collisionURLs){
  const r=await api(endpoint);
  if(r.http!==200||!Array.isArray(r.body)||r.body.some(x=>x.id!==79852))
   throw Error("Cannot establish collision-free original ASCII permalink");
 }
 const originalCurrent=await net.get(front+"/"+p.slug,{maxRedirects:0,failOnStatusCode:false});
 if(originalCurrent.status()===200&&p.slug!==newSlug)
  throw Error("Original Unicode source URL already accessible; refuse slug rewrite");
 report.slugRepair={sourceId:1159,wpPostId:79852,previousSlug:p.slug,newSlug,
  previousPathHttp:originalCurrent.status(),bodyUnchanged:true,dateUnchanged:true,
  ownerVerifiedOriginalSourceId:true,onlyNativeSlugWrite:true};
 // Build complete source/target registry BEFORE any WordPress mutation.
 const all=[];
 for(let pageIndex=1;pageIndex<=35;pageIndex++){
  const v=await api(endpoint+"?context=edit&status=any&per_page=100&page="+pageIndex+
   "&_fields=id,status,acf&orderby=id&order=asc");
  if(v.http!==200||!Array.isArray(v.body)||v.pages<1||v.pages>35)
   throw Error("Incomplete native WP redirect registry page "+pageIndex);
  all.push(...v.body);
  if(pageIndex>=v.pages)break;
 }
 const byPath=new Map();
 for(const r of all){
  const pth=String(r.acf?.from_link||"");
  if(!pth)continue;
  if(!byPath.has(pth))byPath.set(pth,[]);
  byPath.get(pth).push(r);
 }
 const nativeProducts=await api("/wp-json/wp/v2/product?status=publish&per_page=100&_fields=id,slug,status,title");
 if(nativeProducts.http!==200||!Array.isArray(nativeProducts.body)||nativeProducts.body.length!==53)
  throw Error("Current PSE Products registry no longer has exact 53 published entries");
 const productSlugs=nativeProducts.body;
 for(const id of ids){
  const source=ledger.articles[id],origin=new URL(source.source_url);
  if(origin.origin!=="https://www.pse.vn"||origin.search||origin.hash||
    !origin.pathname.endsWith(".html")||!origin.pathname.includes("/"+id+"-"))
   throw Error("Original source URL identity mismatch "+id);
  let to,type,wpId;
  if(id===1159){to="/"+newSlug;type="native-post";wpId=79852;}
  else{
   const q=verified.get(id);
   if(!q||q.sourcePath!==origin.pathname||q.legacyHttp!==404||
     q.targetHttp!==200||!q.canonicalOkay||!q.pass)
    throw Error("Independent original old URL/target parity changed "+id);
   to=q.target;type=q.nativeKind;wpId=q.nativeWpId;
   if(productIds.has(id)){
    const owners=productSlugs.filter(x=>x.status==="publish"&&x.slug.endsWith("-"+id));
    if(owners.length!==1||owners[0].id!==wpId||"/san-pham/"+owners[0].slug!==to)
     throw Error("Original native WooCommerce Product target identity mismatch "+id);
   }else{
    if(postIDs[id]!==wpId)throw Error("Historical verified WordPress Post ID mismatch "+id);
    const check=await api("/wp-json/wp/v2/posts/"+wpId+
     "?context=edit&_fields=id,status,slug,title,acf,date");
    if(check.http!==200||check.body?.id!==wpId||
      check.body.status!=="publish"||"/"+check.body.slug!==to||
      check.body.acf?.action!=="PostDetails"||check.body.acf?.key!=="ssr-post")
     throw Error("Source original native Post identity mismatch "+id);
    if(type==="native-photo-album"&&
      (check.body.slug!==id+"-"+origin.pathname.split("/").at(-1).replace(new RegExp("^"+id+"-"),"").replace(/\.html$/,"")||
       String(check.body.acf?.origin_page_id||"")!==String(id)))
     throw Error("Original Joomla gallery native Post ownership changed "+id);
   }
  }
  if(!to.startsWith("/")||to.startsWith("//")||/[?#\r\n\\]/.test(to))
   throw Error("Unsafe WP exact redirect target "+id);
  const other=(byPath.get(origin.pathname)||[]).filter(x=>x.status!=="trash");
  if(other.length>1||other.some(x=>String(x.acf?.type)!=="301"||
    x.acf?.to_link!==to||x.acf?.match_type!=="Exact"||x.acf?.enable!==true||
    !["draft","publish"].includes(x.status)))
   throw Error("Conflicting or duplicated exact Joomla route "+id);
  const rec={id,from:origin.pathname,to,wpId,kind:type,existingId:other[0]?.id||null,
   existingStatus:other[0]?.status||null};
  report.preflight.push(rec);
 }
 if(report.preflight.length!==34||new Set(report.preflight.map(x=>x.from)).size!==34)
  throw Error("Exact Joomla source route set incomplete");
 await save();
 console.log("PSE_34_NATIVE_PREFLIGHT_PASS="+JSON.stringify({
  originalSourceIds:ids,preflight:34,existing:report.preflight.filter(x=>x.existingId).length,
  publishedNativePosts:29,publishedNativeProducts:5,originalEncodedPost1159:79852,
  sourceSiteOwnedMediaWrites:0,rollbackAvailable:true
 }));
 // Only this source-owned post's slug is editable. Check POST's response and
 // independent WordPress REST readback before creating any aliases.
 if(p.slug!==newSlug){
  const r=await api("/wp-json/wp/v2/posts/79852","POST",{slug:newSlug});
  if(r.http!==200||r.body?.id!==79852||r.body.slug!==newSlug)
   throw Error("Guarded #1159 slug-only native WordPress write failed");
  report.writes.push({kind:"post-slug-only",wpId:79852,oldSlug:before.slug,newSlug});
  await save();
 }
 const after=await api("/wp-json/wp/v2/posts/79852?context=edit&_fields=id,slug,status,title,date,categories,content,acf");
 const a=after.body||{};
 if(after.http!==200||a.id!==79852||a.slug!==newSlug||
   a.status!==before.status||a.title?.raw!==before.title||
   a.date!==before.date||JSON.stringify(a.categories)!==JSON.stringify(before.categories)||
   String(a.content?.raw||"")!==before.content||
   a.acf?.action!==before.acf?.action||a.acf?.key!==before.acf?.key)
  throw Error("WordPress source #1159 slug-only update changed protected original data");
 report.slugRepair.wpReadbackPass=true;
 await save();console.log("PSE_1159_NATIVE_SLUG_ONLY_PASS="+JSON.stringify({
  id:1159,wpId:79852,previousSlug:before.slug,newSlug,status:"publish",
  historicalDate:a.date,originalHtmlPreserved:true,noMediaWrites:true
 }));
 // Do not retry blindly after a POST transport error; next signed attempt
 // must re-read full native registry and verify writes.
 for(const row of report.preflight){
  let routeId=row.existingId;
  if(!routeId){
   const created=await api(endpoint,"POST",{
    title:"PSE Joomla original source "+row.id+" exact 301",status:"draft",
    acf:{from_link:row.from,to_link:row.to,type:"301",match_type:"Exact",enable:true}
   });
   if(created.http!==201||!Number.isSafeInteger(created.body?.id))
    throw Error("Native WordPress Joomla 301 draft creation failed "+row.id);
   routeId=created.body.id;
   report.writes.push({kind:"native301draft",sourceId:row.id,redirectId:routeId});await save();
  }
  const read=async()=>api(endpoint+"/"+routeId+"?context=edit&_fields=id,status,acf");
  let r=await read();
  const shape=t=>t.http===200&&t.body?.id===routeId&&t.body?.acf?.from_link===row.from&&
   t.body.acf?.to_link===row.to&&String(t.body.acf?.type)==="301"&&
   t.body.acf?.match_type==="Exact"&&t.body.acf?.enable===true;
  if(!shape(r))throw Error("Native Joomla 301 exact original source readback failed "+row.id);
  if(r.body.status!=="publish"){
   if(r.body.status!=="draft")throw Error("Unexpected native Joomla redirect status "+row.id);
   const saved=await api(endpoint+"/"+routeId,"POST",{status:"publish"});
   if(saved.http!==200||saved.body?.status!=="publish")
    throw Error("Native WordPress Joomla 301 publish failed "+row.id);
   report.writes.push({kind:"native301publish",sourceId:row.id,redirectId:routeId});await save();
   r=await read();
  }
  if(!shape(r)||r.body.status!=="publish")throw Error("Published native Joomla 301 readback failed "+row.id);
  const rec={sourceId:row.id,native301Id:routeId,sourcePath:row.from,
   publishedCanonical:row.to,nativeTargetPostOrProduct:row.wpId,status:"publish"};
  report.redirects.push(rec);await save();
  console.log("PSE_34_NATIVE_301_READBACK="+JSON.stringify(rec));
 }
 if(report.redirects.length!==34||!report.slugRepair.wpReadbackPass)
  throw Error("Exact published original Joomla scope not complete");
 report.result="THIRTY_FOUR_NATIVE_SOURCE_301_AND_1159_SLUG_READY_FOR_NORMAL_PRODUCTION_BUILD";
 await save();
 console.log("PSE_34_SOURCE_NATIVE_301_PASS="+JSON.stringify({
  originalJoomlaURLs:34,publishedNative301:34,source1159PostSlug:newSlug,
  allTargetsNativeOwnerVerified:true,sourcePostsContentDatesPreserved:true,
  retainedExternalMedia:true,protectedRedirectWrites:report.writes.length,readyForBuild:true
 }));
}catch(e){
 report.result="FAILED_OR_PARTIAL";report.errorType=e?.constructor?.name||"Error";
 report.error=String(e?.message||e).slice(0,180);await save();throw e;
}finally{await net.dispose();await context.close();await browser.close();}
