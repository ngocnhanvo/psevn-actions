/** Publish ONLY recovered Joomla #382 after 3/3 SHA-pinned source photos verify.
 * All authoring is native WP; exact single Joomla legacy URL -> new SSR permalink
 * handled by existing WordPress chuyen-huong-link. No Astro hardcoded HTML.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 event.head_commit?.message!=="cms(pse): publish Joomla 382 after all three exact original media verified"||
 process.env.PSE_382_RELEASE_BACKUP_READY!=="yes")throw Error("Unapproved one-Post production change");
const doc=JSON.parse(await readFile("docs/source/pse-original-public-articles-11-2026-11-22.json","utf8"));
const x=doc.entries?.find(r=>r.source_id===382),old=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const expectedSlug="pvfcco-se-to-chuc-thanh-cong-chuyen-du-lich-chau-au-cho-khach-hang-tieu-bieu-cua-cong-ty";
const oldPath="/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/382-"+expectedSlug+".html";
if(doc.schema!=="pse-original-joomla-selected-public-articles-v1"||
 x?.slug!==expectedSlug||x.inline_image_src?.length!==3||
 old.schema!=="pse-legacy-article-migration-v1"||old.articles?.["382"]?.status!=="quarantined"||
 new URL(old.articles["382"].source_url).pathname!==oldPath)
 throw Error("Owner Joomla article/legacy URL preflight mismatch");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const setting=n=>{
 const rows=env.filter(s=>s.startsWith(n+"="));
 if(rows.length!==1)throw Error("WP env missing");
 return rows[0].slice(n.length+1).replace(/^['"]|['"]$/g,"").replace(/\/$/,"");
};
const wp=setting("WC_URL"),site=setting("WC_URL_CLIENT");
if(wp!=="https://admin-pse.webnvn.com"||site!=="https://pse.webnvn.com")throw Error("Wrong target host");
const sha=b=>createHash("sha256").update(b).digest("hex");
const expected=[
 {sha:"7a190b8e1c4144e8b9f4aeab0a7aedf415cc74281212ce100cc61dd31db08964",match:/\/Ao_2\.jpe?g$/i,size:269085},
 {sha:"f2587f776be8f888ae78cae1de5c0c5767855d2e01309245182d62cb1d3c1fe3",match:/\/Ba_Lan\.jpe?g$/i,size:163574},
 {sha:"206537e10a6bf2a95c5943aa17140b0a83ccc3b8b9921b9f8d59c5d5eaffaa5b",match:/wieliczka.*\.jpe?g$/i,size:143031}
];
const dir="artifacts/pse-382-exact-source-publication";await mkdir(dir,{recursive:true});
const report={schema:"pse-382-all-original-media-native-publication-v1",sourceId:382,wpPostId:83543,
 expectedOriginalPhotos:3,originalPhotosVerified:0,postPublished:false,legacyRedirectId:null,
 redirectPublished:false,publicPageHttp:null,publicPageVerified:false,writeOperations:0,
 freshBackup:true,targetLegacyPath:oldPath,targetCanonicalPath:"/"+expectedSlug,
 result:"STARTED"};
const save=()=>writeFile(dir+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:860}});
const page=await ctx.newPage(),net=await request.newContext({timeout:45000});
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const txt=(await page.locator("#loginform").innerText()).slice(0,850);
  const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("WP challenge unsupported");
   await f.fill(String(v));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())
  throw Error("WP authenticated session absent");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP REST nonce fetch failed");
  return(await r.text()).trim();
 });
 if(!/^[a-zA-Z0-9]{8,24}$/.test(nonce))throw Error("WP invalid REST nonce");
 const api=async(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,totalPages:Number(r.headers.get("X-WP-TotalPages")||0),
   data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const postUrl="/wp-json/wp/v2/posts/83543?context=edit&_fields=id,slug,status,date,title,acf,categories,content";
 const check=await api(postUrl);
 const html=String(check.data?.content?.raw||"");
 if(check.status!==200||check.data?.id!==83543||check.data.slug!==expectedSlug||
  check.data.status!=="draft"||check.data.title?.raw!==x.title||
  check.data.date!==x.created_at_joomla.replace(" ","T")||
  check.data.acf?.action!=="PostDetails"||check.data.acf?.key!=="ssr-post"||
  JSON.stringify((check.data.categories||[]).sort((a,b)=>a-b))!==JSON.stringify([1742,1746]))
  throw Error("Native Post original source identity changed");
 const photos=[...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
 if(photos.length!==3||photos.some((v,i)=>!expected[i].match.test(new URL(v,wp).pathname)))
  throw Error("Three original source image positions/URLs not intact");
 const photoOrigins=photos.map(src=>{const u=new URL(src,wp);return {origin:u.origin,uploadsPath:u.pathname.startsWith("/wp-content/uploads/"),name:u.pathname.split("/").at(-1)}});
 const sourceLegacyDouble=html.includes('src="images/web/'),sourceLegacySingle=html.includes("src='images/web/");
 console.log("PSE_382_RELEASE_MEDIA_SOURCE_PREFLIGHT="+JSON.stringify({images:photoOrigins,sourceLegacyDouble,sourceLegacySingle,expectedOrigin:wp}));
 if(photoOrigins.some(p=>p.origin!==wp||!p.uploadsPath)||sourceLegacyDouble||sourceLegacySingle)
  throw Error("One or more original photos still external/unmigrated");
 for(let i=0;i<3;i++){
  const res=await net.get(photos[i],{timeout:45000,failOnStatusCode:false});
  if(res.status()!==200)throw Error("WP original image not reachable at index "+i);
  const b=await res.body();
  if(b.length!==expected[i].size||sha(b)!==expected[i].sha)
   throw Error("WP original JPEG byte mismatch at index "+i);
  report.originalPhotosVerified++;await save();
 }
 // Native routing fallback for /<slug> must already exist before publishing.
 const endpoint="/wp-json/wp/v2/chuyen-huong-link";
 let routes=[];
 for(let pageNo=1;pageNo<=25;pageNo++){
  const r=await api(endpoint+"?context=edit&status=any&per_page=100&page="+pageNo+
   "&_fields=id,status,acf,route_priority,route_conditions");
  if(r.status!==200||!Array.isArray(r.data)||r.totalPages>25)
   throw Error("Redirect registry incomplete; do not publish");
  routes.push(...r.data);
  if(pageNo>=r.totalPages)break;
 }
 const fallback=routes.filter(r=>r.acf?.from_link==="^/([^/.]+)$");
 if(fallback.length!==1||fallback[0].status!=="publish"||
  fallback[0].acf?.to_link!=="/ssr/posts/$1/detail"||
  String(fallback[0].acf?.type).toLowerCase()!=="rewrite"||
  fallback[0].acf?.match_type!=="Regex"||!fallback[0].acf?.enable)
  throw Error("Post SSR routing fallback not safely prevalidated");
 const exact=routes.filter(r=>r.acf?.from_link===oldPath);
 if(exact.length>1)throw Error("Duplicate exact Joomla source redirect");
 if(exact.length===1 && (String(exact[0].acf?.type)!=="301"||
    exact[0].acf?.to_link!=="/"+expectedSlug||
    exact[0].acf?.match_type!=="Exact"||!exact[0].acf?.enable))
  throw Error("Conflicting old Joomla redirect exists");
 // The old Joomla archive path is not a real current WP Post, so set explicit exact redirect.
 let redirect=exact[0]||null;
 if(!redirect){
  const created=await api(endpoint,"POST",{
   title:"Joomla source #382 exact article permalink",
   status:"draft",acf:{from_link:oldPath,to_link:"/"+expectedSlug,
    type:301,match_type:"Exact",enable:true}
  });
  if(created.status!==201||!Number.isSafeInteger(created.data?.id))
   throw Error("Native exact redirect draft creation failed");
  redirect=created.data;report.writeOperations++;report.legacyRedirectId=redirect.id;await save();
 }
 const rule=await api(endpoint+"/"+redirect.id+"?context=edit&_fields=id,status,acf");
 if(rule.status!==200||rule.data?.id!==redirect.id||
  rule.data.acf?.from_link!==oldPath||rule.data.acf?.to_link!=="/"+expectedSlug||
  String(rule.data.acf?.type)!=="301"||rule.data.acf?.match_type!=="Exact"||!rule.data.acf?.enable)
  throw Error("Exact Joomla redirect native metadata not saved");
 report.legacyRedirectId=redirect.id;await save();
 // All photo bytes and exact redirect draft prepared; publish only one original Post.
 const published=await api("/wp-json/wp/v2/posts/83543","POST",{status:"publish"});
 if(published.status!==200||published.data?.status!=="publish"||published.data?.id!==83543)
  throw Error("Original native post publication failed");
 report.postPublished=true;report.writeOperations++;await save();
 const recheck=await api(postUrl);
 if(recheck.status!==200||recheck.data?.status!=="publish"||
  String(recheck.data?.content?.raw||"")!==html||
  recheck.data.date!==x.created_at_joomla.replace(" ","T")||
  recheck.data.slug!==expectedSlug||
  recheck.data.acf?.action!=="PostDetails"||recheck.data.acf?.key!=="ssr-post")
  throw Error("Published Post native content/date/ACF readback mismatch");
 // Make new direct link work before activating old-site link redirect.
 const direct=await net.get(site+"/"+expectedSlug,{timeout:50000,failOnStatusCode:false,maxRedirects:2});
 report.publicPageHttp=direct.status();
 const body=await direct.text();
 report.publicPageVerified=direct.status()===200&&
  body.includes("PVFCCo SE")&&body.includes("Wieliczka")&&
  body.includes("Ba_Lan.jpg")&&body.includes("Ao_2.jpg");
 await save();
 if(!report.publicPageVerified)throw Error("Frontend SSR original news article public route QA failed");
 if(rule.data.status!=="publish"){
  const re=await api(endpoint+"/"+redirect.id,"POST",{status:"publish"});
  if(re.status!==200||re.data?.status!=="publish")throw Error("Cannot publish exact original Joomla redirect");
  report.writeOperations++;
 }
 report.redirectPublished=true;await save();
 const live=await net.get(site+oldPath,{timeout:35000,failOnStatusCode:false,maxRedirects:0});
 const location=String(live.headers()["location"]||"");
 report.legacyRedirectHttp=live.status();
 report.legacyRedirectLocation=location.slice(0,220);
 report.redirectLiveVerified=[301,302,307,308].includes(live.status())&&
  new URL(location,site).pathname==="/"+expectedSlug;
 await save();
 if(!report.redirectLiveVerified)throw Error("Exact Joomla -> new WordPress article production redirect QA failed");
 report.result="PUBLISHED_ORIGINAL_ARTICLE_THREE_SOURCE_PHOTOS_AND_LEGACY_REDIRECT";
 await save();
 console.log("PSE_382_ALL_ORIGINAL_ARTICLE_PUBLISH_PASS="+JSON.stringify(report));
}catch(e){
 report.result="FAILED";report.errorName=e?.constructor?.name||"Error";
 await save();throw e;
}finally{
 await net.dispose();await ctx.close();await browser.close();
}
