/** Strict read-only postrelease QA for exact source Joomla #379 -> WP Post 82119 -> Astro. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const marker="test(pse): validate published Joomla 379 on Astro";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||evt.head_commit?.message!==marker)
 throw Error("Unapproved Joomla 379 live source QA");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const orig="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/379-pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco.html";
const slug="pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco";
const rss="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop?format=feed&type=rss&limitstart=210";
const originalDay="2013-07-03",expectedDate="2013-07-03T02:10:17";
if(state.schema!=="pse-legacy-article-migration-v1"||state.articles?.["379"]?.source_url!==orig)
 throw Error("Original Joomla 379 identity changed");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function origin(key){const r=env.filter(x=>x.startsWith(key+"="));if(r.length!==1)throw Error("Origin missing "+key);
 const u=new URL(r[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
 !["","/"].includes(u.pathname))throw Error("Bad origin "+key);return u.origin}
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("Expected distinct WP and Astro origins");
const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .replace(/đ/gi,"d").replace(/\s+/g," ").trim().toLowerCase();
const xml=s=>String(s||"").replace(/^<!\[CDATA\[|\]\]>$/g,"").replace(/&amp;/g,"&").trim();
const field=(block,name)=>xml(block.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i"))?.[1]);
const net=await request.newContext({timeout:50000}),browser=await chromium.launch({headless:true});
const report={schema:"pse-joomla-379-source-wp-astro-live-qa-v1",readOnly:true,noBuild:true,
 sourceId:379,wpPostId:82119,originalRSS:expectedDate,originalImageCount:5,
 matchedImages:[],viewports:[],passed:false};
try{
 const [r,f,p]=await Promise.all([
  net.get(rss),net.get(orig),
  net.get(wp+"/wp-json/wp/v2/posts?slug="+slug+"&per_page=5&_fields=id,slug,status,date,title,categories,content,acf")
 ]);
 if(r.status()!==200||f.status()!==200||p.status()!==200)
  throw Error("Original Joomla or native WordPress source unavailable");
 const matches=( (await r.text()).match(/<item\b[\s\S]*?<\/item>/gi)||[])
 .map(item=>({url:field(item,"link"),title:field(item,"title"),pubDate:field(item,"pubDate")}))
 .filter(x=>{try{return new URL(x.url).pathname===new URL(orig).pathname}catch{return false}});
 if(matches.length!==1||matches[0].pubDate!=="Wed, 03 Jul 2013 02:10:17 +0700")
  throw Error("Original exact RSS publication changed");
 const posts=await p.json();
 if(!Array.isArray(posts)||posts.length!==1||posts[0].id!==82119||
 posts[0].slug!==slug||posts[0].status!=="publish"||
 posts[0].date!==expectedDate||!posts[0].categories?.includes(1742)||
 !posts[0].categories?.includes(1746))
  throw Error("WordPress original #379 not published under exact identity/date");
 const post=posts[0];
 const sourceHtml=await f.text();
 const ctx=await browser.newContext({javaScriptEnabled:false});await ctx.route("**/*",x=>x.abort());
 const origPage=await ctx.newPage();
 await origPage.setContent('<base href="'+orig+'">'+sourceHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
 const source=await origPage.evaluate(()=>{
  const root=document.querySelector('[itemprop="articleBody"]'),n=s=>String(s||"").replace(/\s+/g," ").trim();
  if(!root)throw Error("Original articleBody missing");
  const clone=root.cloneNode(true);const tail=clone.querySelector(".extranews_box");
  if(tail&&!/các bài viết khác/i.test(tail.textContent||""))throw Error("Unknown related articles tail");
  tail?.remove();clone.querySelectorAll(".extranews_separator").forEach(x=>x.remove());
  return{title:n(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent),
   text:n(clone.textContent),images:[...clone.querySelectorAll("img[src]")].map(e=>new URL(e.getAttribute("src"),document.baseURI).href)};
 });
 const wpPage=await ctx.newPage();
 await wpPage.setContent(String(post.content?.rendered||""),{waitUntil:"domcontentloaded"});
 const native=await wpPage.evaluate(()=>({text:(document.body.textContent||"").replace(/\s+/g," ").trim(),
  images:[...document.querySelectorAll("img[src]")].map(x=>x.getAttribute("src"))}));
 await ctx.close();
 if(source.images.length!==5||native.images.length!==5||normalize(source.text)!==normalize(native.text)||
 normalize(source.title)!==normalize(matches[0].title)||normalize(source.title)!==normalize(post.title?.rendered?.replace(/<[^>]*>/g," ")))
  throw Error("Joomla original body/5 media/native article identity parity failed");
 for(let i=0;i<5;i++){
  const mapped=state.media?.[source.images[i]]?.url;
  if(!mapped||mapped!==native.images[i])throw Error("Original media mapping wrong index="+i);
  const nativeURL=new URL(mapped,wp);
  if(nativeURL.origin!==wp||!nativeURL.pathname.startsWith("/wp-content/uploads/")||
     nativeURL.search||nativeURL.hash)
   throw Error("Original media resolves outside WordPress uploads index="+i);
  const a=await net.get(nativeURL.href,{timeout:45000,failOnStatusCode:false});
  const bytes=await a.body();
  if(a.status()!==200||!String(a.headers()["content-type"]||"").startsWith("image/")||bytes.length<80)
   throw Error("Original source-backed native image not downloadable index="+i);
  const proxy=front+"/api/files"+nativeURL.pathname;
  const b=await net.get(proxy,{timeout:45000,failOnStatusCode:false});
  const proxyBytes=await b.body();
  const digest=x=>createHash("sha256").update(x).digest("hex");
  if(b.status()!==200||digest(bytes)!==digest(proxyBytes))
   throw Error("Astro source-backed original image bytes mismatch index="+i);
  report.matchedImages.push({index:i,source:source.images[i],bytes:bytes.length,sha256:digest(bytes),wpAndFrontendIdentical:true});
 }
 const path="/"+slug;
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  const response=await page.goto(front+path,{waitUntil:"domcontentloaded",timeout:60000});
  if(response?.status()!==200)throw Error("Astro original #379 route HTTP "+response?.status());
  const info=await page.evaluate(()=>{
   const h1=(document.querySelector("h1")?.textContent||"").replace(/\s+/g," ").trim();
   const canonical=document.querySelector('link[rel="canonical"]')?.href||"";
   const overflow=document.documentElement.scrollWidth-window.innerWidth;
   const imgs=[...document.querySelectorAll("img[src]")].map(img=>img.currentSrc||img.src);
   const imgTrace=[...document.querySelectorAll("img")].map(img=>({
    src:img.getAttribute("src"),current:img.currentSrc||null,
    dataSrc:img.getAttribute("data-src"),srcset:img.getAttribute("srcset"),
    alt:img.getAttribute("alt")
   })).slice(0,45);
   return{h1,canonical,overflow,imgs,imgTrace};
  });
  if(normalize(info.h1)!==normalize(source.title)||
   info.canonical!==front+path||info.overflow>2)
   throw Error("Astro original #379 H1/canonical/responsive mismatch width "+width);
  for(const v of native.images){
   const basename=new URL(v,wp).pathname.split("/").at(-1);
   if(!info.imgs.some(x=>{try{return decodeURIComponent(new URL(x).pathname).includes(decodeURIComponent(basename))}
      catch{return false}}))
    {console.log("PSE_379_FRONTEND_IMAGE_DOM_DIAGNOSTIC="+JSON.stringify({
      width,expected:basename,imgs:info.imgTrace}).slice(0,13000));
     throw Error("Original Joomla native image absent on public Astro width "+width+" "+basename);}
  }
  report.viewports.push({width,route200:true,h1:true,canonical:true,allOriginalImagesPresent:true,overflow:info.overflow});
  await page.close();
 }
 report.passed=true;
 console.log("PSE_379_ORIGINAL_POSTRELEASE_LIVE_PASS="+JSON.stringify({
  sourceId:379,wpId:82119,date:originalDay,originalPhotos:5,sourceProxyShaPass:5,
  responsiveRows:report.viewports.length,canonical:true,readOnly:true,noBuild:true}));
}finally{
 await mkdir("artifacts/pse-379-postrelease",{recursive:true});
 await writeFile("artifacts/pse-379-postrelease/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();await net.dispose();
}
