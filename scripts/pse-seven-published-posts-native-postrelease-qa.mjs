/** Read-only independent postrelease of seven verified historical PSE Posts.
 * Original Joomla is currently unavailable. Prior source equivalence is NOT reasserted.
 * Verify native WordPress date/Media/ACF vs publicly deployed Astro after signed release.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const repo="ngocnhanvo/psevn-actions";
if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=="refs/heads/main")throw Error("PSE actions main only");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified)throw Error("Native provenance manifest missing");
const samples=[
 {id:205,count:10,day:"2011-08-23"},
 {id:226,count:1,day:"2011-10-06"},
 {id:227,count:11,day:"2011-10-13"},
 {id:229,count:11,day:"2011-10-25"},
 {id:230,count:2,day:"2011-10-25"},
 {id:240,count:6,day:"2012-03-16"},
 {id:321,count:5,day:"2012-12-04"}
];
const cfg=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=key=>{
 const lines=cfg.filter(x=>x.startsWith(key+"="));
 if(lines.length!==1)throw Error("Missing unique "+key);
 const url=new URL(lines[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||
    !["","/"].includes(url.pathname)||url.port&&url.port!=="443")throw Error("Unsafe "+key);
 return url.origin;
};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("Wrong site origins");
const browser=await chromium.launch({headless:true});
const report={schema:"pse-seven-published-original-posts-native-postrelease-v1",readOnly:true,
 noCmsWrites:true,noFTPS:true,noBuild:true,
 warning:"Checks previously verified original Post identities in WP and Astro; not a fresh comparison to unavailable Joomla host.",
 posts:[],views:[],errors:[],summary:null};
async function loadNative(t) {
 const row=state.articles?.[t.id];
 if(!row?.wp_id||!row?.source_url?.startsWith("https://www.pse.vn/")||row.status==="quarantined") {
  throw Error("Unverified original migration identity #"+t.id);
 }
 const slug=new URL(row.source_url).pathname.split("/").at(-1).replace(/^\d+-/,"").replace(/\.html$/i,"");
 const u=wp+"/wp-json/wp/v2/posts?slug="+encodeURIComponent(slug)+
   "&status=publish&per_page=5&_fields=id,slug,status,date,title,acf,content,featured_media,categories";
 const r=await fetch(u,{redirect:"manual",headers:{Accept:"application/json"},signal:AbortSignal.timeout(45000)});
 if(r.status!==200)throw Error("WP native REST unavailable #"+t.id+" "+r.status);
 const entries=await r.json();
 if(!Array.isArray(entries)||entries.length!==1)throw Error("WP identity missing or duplicated #"+t.id);
 const p=entries[0];
 if(p.id!==row.wp_id||p.slug!==slug||p.status!=="publish"||p.date?.slice(0,10)!==t.day||
   !p.featured_media||p.acf?.action!=="PostDetails"||p.acf?.key!=="ssr-post") {
   throw Error("WP original identity/date/ACF mismatch #"+t.id);
 }
 const ctx=await browser.newContext({javaScriptEnabled:false});
 await ctx.route("**/*",route=>route.abort());
 const page=await ctx.newPage();
 let imagePaths=[];
 try{
  await page.setContent('<base href="'+wp+'/">'+String(p.content?.rendered||""),{waitUntil:"domcontentloaded",timeout:30000});
  imagePaths=await page.locator("img[src]").evaluateAll(es=>es.map(e=>new URL(e.getAttribute("src"),document.baseURI).href));
 } finally {await ctx.close()}
 if(imagePaths.length!==t.count||new Set(imagePaths).size!==t.count)throw Error("Native restored Post image count/uniqueness #"+t.id);
 const paths=imagePaths.map(u=>{
  const x=new URL(u);
  if(x.origin!==wp||!/^\/wp-content\/uploads\/(?:\d{4}\/\d{2}\/)?pse-gallery-\d+-[a-f0-9]{16}\.(?:jpg|png|webp)$/i.test(x.pathname)||
    x.search||x.hash)throw Error("Unverified original native Media path #"+t.id);
  return x.pathname;
 });
 const title=String(p.title?.rendered||"").replace(/<[^>]+>/g," ").replace(/&amp;/gi,"&").replace(/&#039;/gi,"'").replace(/\s+/g," ").trim();
 return {id:t.id,slug,postId:p.id,count:t.count,day:t.day,paths,title};
}
async function check(frontPost,width) {
 const ctx=await browser.newContext({viewport:{width,height:850}});
 const page=await ctx.newPage();
 let privateLeak=0;
 page.on("request",r=>{try{if(new URL(r.url()).origin===wp)privateLeak++}catch{}});
 try {
  const req=await page.goto(front+"/"+frontPost.slug,{waitUntil:"domcontentloaded",timeout:65000});
  if(!req||req.status()!==200)throw Error("Public restored article #"+frontPost.id+" HTTP "+req?.status());
  const imgs=page.locator("#article-content img");
  if(await imgs.count()!==frontPost.count)throw Error("Frontend restored article image count #"+frontPost.id);
  const actual=await imgs.evaluateAll(es=>es.map(e=>new URL(e.getAttribute("src")||"",location.href).href));
  if(new Set(actual).size!==frontPost.count||actual.some((v,i)=>{
    const u=new URL(v),path=frontPost.paths[i],ext=path.split(".").at(-1).toLowerCase();
    return u.origin!==front||u.search||u.hash||![("/api/files"+path),
      ("/api/images/1024/"+ext+path.replace(/\.[^.]+$/i,".webp"))].includes(u.pathname);
  }))throw Error("Frontend original image owner/order mismatch #"+frontPost.id);
  const d=await page.evaluate(()=>({
    h1:document.querySelectorAll("h1").length,
    text:(document.querySelector("h1")?.textContent||"").replace(/\s+/g," ").trim(),
    canonical:document.querySelector('link[rel="canonical"]')?.href||"",
    overflow:document.body.scrollWidth>window.innerWidth+1
  }));
  const canonical=d.canonical?new URL(d.canonical,front):null;
  if(d.h1!==1||!canonical||canonical.origin!==front||canonical.pathname!=="/"+frontPost.slug||
   canonical.search||canonical.hash||d.overflow||privateLeak!==0)
   throw Error("Public restored article SEO/overflow/privacy #"+frontPost.id+" width "+width);
  let decoded=0;
  for(const idx of [...new Set([0,Math.floor((frontPost.count-1)/2),frontPost.count-1])]){
   const img=imgs.nth(idx);
   await img.scrollIntoViewIfNeeded({timeout:30000});
   await img.evaluate(async el=>{
     if(!el.complete)await Promise.race([
       new Promise(resolve=>{el.addEventListener("load",resolve,{once:true});el.addEventListener("error",resolve,{once:true})}),
       new Promise(resolve=>setTimeout(resolve,25000))
     ]);
   });
   if(!await img.evaluate(e=>e.complete&&e.naturalWidth>0&&e.naturalHeight>0))
     throw Error("Original article image browser-decode fail #"+frontPost.id+" width "+width+" image "+idx);
   decoded++;
  }
  const value={sourceId:frontPost.id,wpPostId:frontPost.postId,width,images:frontPost.count,
    decoded,canonical:true,overflow:false,adminRequests:0};
  report.views.push(value);
  console.log("PSE_SEVEN_PUBLISHED_POST_NATIVE_ROW="+JSON.stringify(value));
 } finally {await ctx.close()}
}
try {
 for(const t of samples) {
  const n=await loadNative(t);
  report.posts.push({sourceId:t.id,wpPostId:n.postId,slug:n.slug,images:n.count,date:n.day,status:"publish"});
  await check(n,390);
  await check(n,1440);
 }
 report.summary={previouslyProvenSourcePosts:7,nativePostImages:report.posts.reduce((a,x)=>a+x.images,0),
  responsiveChecks:report.views.length,decodeSamples:report.views.reduce((a,x)=>a+x.decoded,0),
  noJoomlaFetch:true,upstreamSourceParityNotRechecked:true,noCmsWrites:true};
 if(report.summary.nativePostImages!==46||report.summary.responsiveChecks!==14||report.summary.decodeSamples<28) {
  throw Error("Published original Post QA incomplete");
 }
 console.log("PSE_SEVEN_PUBLISHED_NATIVE_POSTS_POSTRELEASE=PASS "+JSON.stringify(report.summary));
} catch(e) {
 report.errors.push(String(e?.message||e).slice(0,240));
 console.error("PSE_SEVEN_PUBLISHED_NATIVE_POSTS_POSTRELEASE=FAIL "+report.errors[0]);
 throw e;
} finally {
 await mkdir("artifacts/pse-seven-post-native-postrelease",{recursive:true});
 await writeFile("artifacts/pse-seven-post-native-postrelease/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
