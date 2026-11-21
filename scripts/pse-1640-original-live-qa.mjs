/** Postrelease strict original #1640 Joomla -> native WP -> Astro 2 archive-backed JPEGs, GET ONLY. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const commit="test(pse): verify original Joomla 1640 two archive photos postrelease";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||event.head_commit?.message!==commit)
 throw Error("Wrong original #1640 postrelease QA context");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const source=state.articles?.["1640"]?.source_url||"";
if(state.schema!=="pse-legacy-article-migration-v1"||source!==
 "https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/1640-nhung-giai-dieu-dep-ve-dong-nam-bo.html")
 throw Error("Original #1640 source identity not verified");
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function origin(key){const found=lines.filter(x=>x.startsWith(key+"="));if(found.length!==1)throw Error("Missing "+key);
 const u=new URL(found[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.port||!["","/"].includes(u.pathname))
  throw Error("Unexpected public/CMS origin");return u.origin}
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("Public frontend is WordPress origin");
const slug="nhung-giai-dieu-dep-ve-dong-nam-bo";
const title="Những giai điệu đẹp về Đông Nam Bộ";
const day="2025-05-14";
const pics=[
 {url:"https://www.baobariavungtau.com.vn/dataimages/202505/original/images2017799_Ca_kh_c.jpg",sha:"ee965c7187188869a123688a3d9d4d2ada804724ed952fd252a68896add813f4"},
 {url:"https://www.baobariavungtau.com.vn/dataimages/202505/original/images2017800_16_2025_acondao.jpg",sha:"bb8a5f29dc3abbc3de791b10d5b85c74aa7bb6905386a3c6a9e178a626b83ae6"}
].map(p=>({...p,filename:"pse-original-1640-"+createHash("sha256").update(p.url).digest("hex").slice(0,16)+".jpg"}));
const sha=b=>createHash("sha256").update(b).digest("hex");
 // Strict idempotent GET transport retry, never retry unexpected 4xx or
 // forgive a wrong JPEG digest/content type. CMS media responses occasionally
 // reset long-lived connections under FTPS traffic.
 const verifiedGet=async(url,opts={})=>{
  const path=new URL(url).pathname;
  for(let attempt=1;attempt<=3;attempt++){
   try{
    const r=await net.get(url,{...opts,failOnStatusCode:false});
    if(r.status()<500||attempt===3)return r;
    console.warn("PSE_1640_QA_SOURCE_GET_RETRY="+JSON.stringify({path,attempt,reason:"upstream-5xx"}));
    await r.dispose();
   }catch(e){
    if(attempt===3||!/ECONNRESET|ETIMEDOUT|Timeout|socket hang up|ERR_CONNECTION_RESET/i.test(String(e?.message||e)))
     throw e;
    console.warn("PSE_1640_QA_SOURCE_GET_RETRY="+JSON.stringify({path,attempt,reason:"transient-network"}));
   }
   await new Promise(resolve=>setTimeout(resolve,attempt*950));
  }
  throw Error("Source/media read-only GET retry exhausted "+path);
 };
const strip=s=>String(s||"").replace(/<[^>]*>/g," ").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:50000});
const report={schema:"pse-original-1640-full-postrelease-source-parity-v1",sourceId:1640,
 originalSource:source,wpOriginBound:true,sourceDate:day,readOnly:true,originalPhotos:[],rows:[],
 sourceText:null,nativePost:null,noCmsWrites:true,noBuild:true};
try{
 const [rawSource,posts,cats]=await Promise.all([
  net.get(source,{timeout:65000}),
  net.get(wp+"/wp-json/wp/v2/posts?slug="+slug+"&per_page=5&_fields=id,slug,title,status,date,acf,content,featured_media,categories",{timeout:40000}),
  net.get(wp+"/wp-json/wp/v2/categories?slug=tin-cong-ty&hide_empty=false&_fields=id,slug,parent",{timeout:40000})
 ]);
 if(rawSource.status()!==200||posts.status()!==200||cats.status()!==200)
  throw Error("Native original Joomla/WP registry unavailable");
 const originalHtml=await rawSource.text(),published=await posts.json(),categories=await cats.json();
 if(!Array.isArray(published)||published.length!==1||published[0].status!=="publish"||
 published[0].slug!==slug||published[0].date?.slice(0,10)!==day||
 !Array.isArray(categories)||categories.length!==1||categories[0].id!==1742||
 !published[0].categories?.includes(1742)||Number(categories[0].parent)!==0)
 throw Error("Native original #1640 date/title/taxonomy publication missing");
 const post=published[0];
 if(!Number.isSafeInteger(Number(post.id))||!Number.isSafeInteger(Number(post.featured_media))||
  post.featured_media<1||String(post.acf?.origin_page_id||"")!=="1640")
  throw Error("Original Joomla native WP ownership/featured source invalid");
 const inert=await browser.newContext({javaScriptEnabled:false});
 await inert.route("**/*",r=>r.abort());
 const page=await inert.newPage();
 await page.setContent('<base href="'+source+'">'+originalHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
 const original=await page.evaluate(()=>{
  const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page")||document.querySelector("article");
  if(!root)return null;
  const norm=s=>String(s||"").replace(/\s+/g," ").trim();
  return{title:norm(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent),
   body:norm(root.textContent),images:[...root.querySelectorAll("img[src]")].map(x=>new URL(x.getAttribute("src"),document.baseURI).href)};
 });
 if(!original||original.title!==title||original.body.length!==4421||
  original.images.length!==2||pics.some((x,i)=>original.images[i]!==x.url))
  throw Error("Joomla source original identity/body/photos changed");
 const native=await inert.newPage();
 await native.setContent('<base href="'+wp+'/">'+String(post.content?.rendered||""),{waitUntil:"domcontentloaded"});
 const nativeImageUrls=await native.locator("img[src]").evaluateAll(list=>list.map(img=>img.src));
 const nativeText=strip(await native.locator("body").innerText());
 if(nativeImageUrls.length!==2||nativeText.length<4200||nativeText.length>4650||
  !nativeText.includes(original.body.slice(0,105)))
  throw Error("WordPress native body or original image source/order missing");
 report.sourceText={originalCharacters:original.body.length,nativeCharacters:nativeText.length,openingVerified:true};
 for(const [index,p] of pics.entries()){
  const u=new URL(nativeImageUrls[index]);
  if(u.origin!==wp||u.search||u.hash||!u.pathname.startsWith("/wp-content/uploads/")||
   !u.pathname.endsWith("/"+p.filename)||
   (index===0&&Number(post.featured_media)<1))throw Error("Native original #1640 Media identity mismatch index "+index);
  const response=await verifiedGet(u.href,{timeout:45000,failOnStatusCode:false});
  const content=await response.body();
  if(response.status()!==200||!String(response.headers()["content-type"]||"").startsWith("image/jpeg")||
   sha(content)!==p.sha)throw Error("Native original archive JPEG digest mismatch index "+index);
  const proxy=front+"/api/files"+u.pathname;
  const viaFront=await verifiedGet(proxy,{timeout:45000,failOnStatusCode:false});
  const bytes=await viaFront.body();
  if(viaFront.status()!==200||!String(viaFront.headers()["content-type"]||"").startsWith("image/jpeg")||
   sha(bytes)!==p.sha)throw Error("Frontend original JPEG bytes do not match publisher capture");
  report.originalPhotos.push({index,originalPublisherUrl:p.url,originalDigest:p.sha,
   filename:p.filename,wpPath:u.pathname,wpHTTP:200,frontendOriginalHTTP:200,sourceBytesMatch:true});
 }
 await inert.close();
 report.nativePost={id:post.id,sourceCreatedDay:day,categories:post.categories,featuredMediaId:post.featured_media};
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  const leaks=[];page.on("request",r=>{try{if(new URL(r.url()).origin===wp)leaks.push("direct-CMS-origin")}catch{}});
  try{
   const response=await page.goto(front+"/"+slug,{waitUntil:"domcontentloaded",timeout:65000});
   if(response?.status()!==200)throw Error("Original #1640 public Post HTTP "+response?.status());
   const imgs=page.locator("#article-content img");
   if(await imgs.count()!==2)throw Error("Public Post original JPEG count changed");
   const browserPaths=await imgs.evaluateAll(xs=>xs.map(x=>new URL(x.getAttribute("src")||"",location.href).pathname));
   if(browserPaths.some((x,i)=>!/^(?:\/api\/files\/wp-content\/uploads\/|\/api\/images\/)/.test(x)||
     !x.includes(pics[i].filename.slice(0,-4))&&
     !x.includes(pics[i].filename)))
    throw Error("Public original image filenames no longer source-owned or ordered");
   const dom=await page.evaluate(()=>({
    h1:[...document.querySelectorAll("h1")].map(x=>(x.textContent||"").replace(/\s+/g," ").trim()),
    canonical:document.querySelector('link[rel="canonical"]')?.href||"",
    overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2
   }));
   const canonical=dom.canonical?new URL(dom.canonical,front):null;
   if(dom.h1.length!==1||dom.h1[0]!==title||!canonical||canonical.origin!==front||
    canonical.pathname!=="/"+slug||canonical.search||canonical.hash||dom.overflow||leaks.length)
    throw Error("Original #1640 public SEO/overflow/CMS leak mismatch width "+width);
   // Lazy images are individually scrolled; original bytes already checked on frontend.
   for(let n=0;n<2;n++){
    const img=imgs.nth(n);await img.scrollIntoViewIfNeeded();
    await img.evaluate(async e=>{if(!e.complete)await new Promise(resolve=>{
     e.addEventListener("load",resolve,{once:true});e.addEventListener("error",resolve,{once:true});
     setTimeout(resolve,35000)})});
    if(!(await img.evaluate(e=>e.complete&&e.naturalWidth>0)))
     throw Error("Original #1640 public image browser decode failed index "+n+" width "+width);
   }
   report.rows.push({width,http:200,h1:dom.h1[0],canonical:canonical.pathname,
    originalImageCount:2,decoded2of2:true,bodyOverflow:false,cmsLeak:false});
   console.log("PSE_1640_ORIGINAL_LIVE_ROW="+JSON.stringify(report.rows.at(-1)));
  }finally{await page.close()}
 }
 if(report.rows.length!==2||report.originalPhotos.length!==2)throw Error("Incomplete original 1640 live acceptance");
 console.log("PSE_1640_ORIGINAL_LIVE_PASS="+JSON.stringify({sourceId:1640,sourceDate:day,
  wpPostId:post.id,originalArchiveJPEGs:2,originalProxySha256Pass:2,
  responsiveRows:2,decodedBrowserPhotos:4,canonical:true,readOnly:true,noBuild:true}));
}finally{
 await mkdir("artifacts/pse-original-1640-live",{recursive:true});
 await writeFile("artifacts/pse-original-1640-live/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
