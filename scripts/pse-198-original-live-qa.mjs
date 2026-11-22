/** Postrelease native WP and Astro 10 relocated DPM JPEGs, GET ONLY; historical URL byte parity unverified. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const commit="test(pse): verify original Joomla 198 ten relocated DPM photos postrelease";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||event.head_commit?.message!==commit)
 throw Error("Wrong original #198 postrelease QA context");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const source=state.articles?.["198"]?.source_url||"";
if(state.schema!=="pse-legacy-article-migration-v1"||source!==
 "https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/198-nha-may-dam-phu-my-don-tan-san-pham-ure-thu-5-trieu.html")
 throw Error("Original #198 source identity not verified");
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function origin(key){const found=lines.filter(x=>x.startsWith(key+"="));if(found.length!==1)throw Error("Missing "+key);
 const u=new URL(found[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.port||!["","/"].includes(u.pathname))
  throw Error("Unexpected public/CMS origin");return u.origin}
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("Public frontend is WordPress origin");
const slug="nha-may-dam-phu-my-don-tan-san-pham-ure-thu-5-trieu";
const title="Nhà máy Đạm Phú Mỹ đón tấn sản phẩm urê thứ 5 triệu";
const day="2011-08-15";
const pics=[
  {
    "url": "http://dpm.vn/Portals/0/110814%20E1.jpg",
    "sha": "5f30e2cb8d3263748600b428dc9472479c1a9da2f33f1542eec2d55e9eba9617"
  },
  {
    "url": "http://dpm.vn/Portals/0/110814%20E2.jpg",
    "sha": "bf8513220f7558b02f8e50eea7291a19b96df34559a965f7369bd4fb4d797ba3"
  },
  {
    "url": "http://dpm.vn/Portals/0/110814%20E3.jpg",
    "sha": "1e06bc5880c8dd5bfcc3e9af5a21c7af77dc4955bd681b853e1460570317c259"
  },
  {
    "url": "http://dpm.vn/Portals/0/110814%20E4.jpg",
    "sha": "698e197166ce226cfb7214ca95dae22924024368393b4fb26d808820edbbb3a4"
  },
  {
    "url": "http://dpm.vn/Portals/0/110814%20E5.jpg",
    "sha": "95f8937fd42a66e52f144f86cae0a46dc17e0679e9f59b3991fba8dcadd5deb3"
  },
  {
    "url": "http://dpm.vn/Portals/0/110814%20E5_1.jpg",
    "sha": "9f440981360dabf4010f96eeb6f76fe3dd6e7780083ae97ff26f3147931ef49e"
  },
  {
    "url": "http://dpm.vn/Portals/0/110814%20E6.jpg",
    "sha": "8420bceab2608136ba99c75258ebc2bd4bd7f615e4a39e29562418fd783c7883"
  },
  {
    "url": "http://dpm.vn/Portals/0/110814%20E7.jpg",
    "sha": "2058b3e40fdb1ef1a906539b8fc2770c4db23d46dec92fdb6fb0d8b97627aef0"
  },
  {
    "url": "http://dpm.vn/Portals/0/110814%20E8.jpg",
    "sha": "78468f5533730354f9168d199bf7fb53592c5564419dca99a863b037e3a56623"
  },
  {
    "url": "http://dpm.vn/Portals/0/110814%20E9.jpg",
    "sha": "be3f4385981232dd880aab6c1db4e1ca43bbde976f931ff526d8d34bb348a060"
  }
].map(p=>({...p,filename:"pse-original-198-"+createHash("sha256").update(p.url).digest("hex").slice(0,16)+".jpg"}));
const sha=b=>createHash("sha256").update(b).digest("hex");
const sameOriginalURL=(a,b)=>{const x=new URL(a),y=new URL(b);return x.protocol===y.protocol&&x.host===y.host&&x.pathname.replace(/%28/gi,'(').replace(/%29/gi,')')===y.pathname.replace(/%28/gi,'(').replace(/%29/gi,')')&&!x.search&&!y.search&&!x.hash&&!y.hash};
 // Strict idempotent GET transport retry, never retry unexpected 4xx or
 // forgive a wrong JPEG digest/content type. CMS media responses occasionally
 // reset long-lived connections under FTPS traffic.
 const verifiedGet=async(url,opts={})=>{
  const path=new URL(url).pathname;
  for(let attempt=1;attempt<=3;attempt++){
   try{
    const r=await net.get(url,{...opts,failOnStatusCode:false});
    if(r.status()<500||attempt===3)return r;
    console.warn("PSE_198_QA_SOURCE_GET_RETRY="+JSON.stringify({path,attempt,reason:"upstream-5xx"}));
    await r.dispose();
   }catch(e){
    if(attempt===3||!/ECONNRESET|ETIMEDOUT|Timeout|socket hang up|ERR_CONNECTION_RESET/i.test(String(e?.message||e)))
     throw e;
    console.warn("PSE_198_QA_SOURCE_GET_RETRY="+JSON.stringify({path,attempt,reason:"transient-network"}));
   }
   await new Promise(resolve=>setTimeout(resolve,attempt*950));
  }
  throw Error("Source/media read-only GET retry exhausted "+path);
 };
const strip=s=>String(s||"").replace(/<[^>]*>/g," ").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:50000});
const report={schema:"pse-original-198-full-postrelease-source-parity-v1",sourceId:198,
 originalSource:source,wpOriginBound:true,sourceDate:day,readOnly:true,originalPhotos:[],rows:[],
 sourceText:null,nativePost:null,noCmsWrites:true,noBuild:true,historicalUrlByteParityNotVerified:true};
try{
 const [posts,cats]=await Promise.all([
  net.get(wp+"/wp-json/wp/v2/posts?slug="+slug+"&per_page=5&_fields=id,slug,title,status,date,acf,content,featured_media,categories",{timeout:40000}),
  net.get(wp+"/wp-json/wp/v2/categories?slug=tin-tong-hop&hide_empty=false&_fields=id,slug,parent",{timeout:40000})
 ]);
 if(posts.status()!==200||cats.status()!==200)
  throw Error("Native original Joomla/WP registry unavailable");
 const published=await posts.json(),categories=await cats.json();
 if(!Array.isArray(published)||published.length!==1||published[0].status!=="publish"||
 published[0].slug!==slug||published[0].date?.slice(0,10)!==day||
 !Array.isArray(categories)||categories.length!==1||categories[0].id!==1746||
 !published[0].categories?.includes(1746)||!published[0].categories?.includes(1742)||Number(categories[0].parent)!==1742)
 throw Error("Native original #198 date/title/taxonomy publication missing");
 const post=published[0];
 if(post.id!==83516||!Number.isSafeInteger(Number(post.id))||!Number.isSafeInteger(Number(post.featured_media))||
  post.featured_media<1||String(post.acf?.origin_page_id||"")!=="198")
  throw Error("Original Joomla native WP ownership/featured source invalid");
 const inert=await browser.newContext({javaScriptEnabled:false});
 await inert.route("**/*",r=>r.abort());
 const native=await inert.newPage();
 await native.setContent('<base href="'+wp+'/">'+String(post.content?.rendered||""),{waitUntil:"domcontentloaded"});
 const nativeImageUrls=await native.locator("img[src]").evaluateAll(list=>list.map(img=>img.src));
 const nativeText=strip(await native.locator("body").innerText());
 const nativeDomText=await native.locator("body").evaluate(el=>(el.textContent||"").replace(/\s+/g," ").trim());
 if(nativeImageUrls.length!==10||nativeDomText.length!==6010)
  throw Error("WordPress native body or original image source/order missing");
 report.sourceText={verifiedOriginalSourceHash:"4b00b340cb5a6bd18e012698bccec582fd414ffb1338093253bcbeea359b2c58",nativeCharacters:nativeDomText.length,priorApplyRun:44984705336,sourceTextEqualityVerifiedInApply:true};
 for(const [index,p] of pics.entries()){
  const u=new URL(nativeImageUrls[index]);
  if(u.origin!==wp||u.search||u.hash||!u.pathname.startsWith("/wp-content/uploads/")||
   !u.pathname.endsWith("/"+p.filename)||
   (index===0&&Number(post.featured_media)<1))throw Error("Native original #198 Media identity mismatch index "+index);
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
   filename:p.filename,wpPath:u.pathname,wpHTTP:200,frontendOriginalHTTP:200,relocatedPublisherBytesMatch:true});
 }
 await inert.close();
 report.nativePost={id:post.id,sourceCreatedDay:day,categories:post.categories,featuredMediaId:post.featured_media};
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  const leaks=[];page.on("request",r=>{try{if(new URL(r.url()).origin===wp)leaks.push("direct-CMS-origin")}catch{}});
  try{
   const response=await page.goto(front+"/"+slug,{waitUntil:"domcontentloaded",timeout:65000});
   if(response?.status()!==200)throw Error("Original #198 public Post HTTP "+response?.status());
   const imgs=page.locator("#article-content img");
   if(await imgs.count()!==10)throw Error("Public Post original JPEG count changed");
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
    throw Error("Original #198 public SEO/overflow/CMS leak mismatch width "+width);
   // Lazy images are individually scrolled; original bytes already checked on frontend.
   for(let n=0;n<10;n++){
    const img=imgs.nth(n);await img.scrollIntoViewIfNeeded();
    await img.evaluate(async e=>{if(!e.complete)await new Promise(resolve=>{
     e.addEventListener("load",resolve,{once:true});e.addEventListener("error",resolve,{once:true});
     setTimeout(resolve,35000)})});
    if(!(await img.evaluate(e=>e.complete&&e.naturalWidth>0)))
     throw Error("Original #198 public image browser decode failed index "+n+" width "+width);
   }
   report.rows.push({width,http:200,h1:dom.h1[0],canonical:canonical.pathname,
    originalImageCount:10,decoded10of10:true,bodyOverflow:false,cmsLeak:false});
   console.log("PSE_198_ORIGINAL_LIVE_ROW="+JSON.stringify(report.rows.at(-1)));
  }finally{await page.close()}
 }
 if(report.rows.length!==2||report.originalPhotos.length!==10)throw Error("Incomplete original 198 live acceptance");
 const redirect=await net.get(front+new URL(source).pathname,{maxRedirects:0,failOnStatusCode:false});
 const location=redirect.headers().location||"";
 report.legacy={http:redirect.status(),location,exact301:redirect.status()===301&&new URL(location,front).href===front+"/"+slug};
 console.log("PSE_198_LEGACY_LIVE="+JSON.stringify(report.legacy));
 if(process.env.PSE_198_REQUIRE_LEGACY_301==="yes"&&!report.legacy.exact301)throw Error("Exact 198 legacy 301 missing");
 console.log("PSE_198_ORIGINAL_LIVE_PASS="+JSON.stringify({sourceId:198,sourceDate:day,
  wpPostId:post.id,relocatedPublisherJPEGs:10,originalProxySha256Pass:10,
  responsiveRows:2,decodedBrowserPhotos:20,canonical:true,readOnly:true,noBuild:true}));
}finally{
 await mkdir("artifacts/pse-original-198-live",{recursive:true});
 await writeFile("artifacts/pse-original-198-live/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
