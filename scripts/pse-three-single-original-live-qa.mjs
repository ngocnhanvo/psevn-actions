/** Strict read-only original archive-backed Joomla #344/#348/#370 native WordPress and public Astro QA. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 ev.head_commit?.message!=="test(pse): verify three original agriculture articles source and live photos")
 throw Error("Unapproved three-Post live QA");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Original Joomla source state unexpected");
const docs=[
 {id:344,day:"2013-03-14",title:"Vì sao măng cụt ra trái cách năm?",original:"http://nongnghiep.vn/Upload/Image/2013/3/6/06032013140714_1.JPG",sha:"4246317da9b3e3ea1e26759168061ef5ddf71a4e9e8049b00e3115440c20041d"},
 {id:348,day:"2013-03-18",title:"Phân bón giả hại nhà nông",original:"http://www.thesaigontimes.vn/Uploads/Articles/92473/15279_phan_050313.jpg",sha:"198bb4babd0c6b0172983c26eb9324382e5189fecc92c3652e54deb63b1ccbfc"},
 {id:370,day:"2013-06-17",title:"Triển vọng cây mắc ca",original:"http://nongnghiep.vn/Upload/Image/2013/6/12/12062013131916.JPG",sha:"355f3a5ec88c0e7baee051771e3a4b2c9867cff085a1ce44cac25fbcc6200b56"}
].map(d=>({...d,source:state.articles?.[d.id]?.source_url||"",
 filename:"pse-original-"+d.id+"-"+createHash("sha256").update(d.original).digest("hex").slice(0,16)+".jpg"}));
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=k=>{const a=lines.filter(s=>s.startsWith(k+"="));if(a.length!==1)throw Error("Missing "+k);
 const u=new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.port||!["","/"].includes(u.pathname))
  throw Error("Unsafe CMS/frontend URL");
 return u.origin;};
const cms=origin("WC_URL"),front=origin("WC_URL_CLIENT");if(cms===front)throw Error("CMS origin leaked");
const sha=b=>createHash("sha256").update(b).digest("hex");
const norm=s=>String(s||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
const exactChars=s=>norm(s).normalize("NFKC").replace(/\s+/gu,"");
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:50000});
const report={schema:"pse-three-original-agriculture-postlive-v1",readOnly:true,sourceIds:[344,348,370],source:[],native:[],media:[],responsive:[],noCmsWrites:true,noBuild:true};
const get=async(url,opts={})=>{
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const r=await net.get(url,{timeout:45000,failOnStatusCode:false,...opts});
   if(r.status()<500||attempt===3)return r;
   await r.dispose();
  }catch(e){if(attempt===3||!/ECONNRESET|Timeout|ETIMEDOUT|socket hang up|ERR_CONNECTION_RESET/i.test(String(e?.message||e)))throw e}
  await new Promise(resolve=>setTimeout(resolve,attempt*900));
 }
 throw Error("Verified source GET exhausted "+new URL(url).pathname);
};
try{
 const cat=await get(cms+"/wp-json/wp/v2/categories?slug=kien-thuc-nong-nghiep&_fields=id,slug,parent");
 if(cat.status()!==200)throw Error("Native agriculture source category unavailable");
 const cats=await cat.json();if(cats.length!==1||Number(cats[0].id)!==1755||Number(cats[0].parent)!==0)
  throw Error("Native agriculture source category identity changed");
 const inert=await browser.newContext({javaScriptEnabled:false});
 await inert.route("**/*",r=>r.abort());
 for(const d of docs){
  if(!d.source.startsWith("https://www.pse.vn/hoat-dong-kinh-doanh/kien-thuc-nong-nghiep/"+d.id+"-"))
   throw Error("Original Joomla source URL identity mismatch "+d.id);
  const slug=new URL(d.source).pathname.split("/").at(-1).replace(new RegExp("^"+d.id+"-"),"").replace(/\.html$/i,"");
  if(!/^[a-z0-9-]+$/.test(slug))throw Error("Untrusted original slug "+d.id);
  const [a,b]=await Promise.all([
   get(d.source,{timeout:60000}),
   get(cms+"/wp-json/wp/v2/posts?slug="+encodeURIComponent(slug)+
    "&per_page=10&_fields=id,slug,status,title,date,acf,content,featured_media,categories")
  ]);
  if(a.status()!==200||b.status()!==200)throw Error("Source/Post missing "+d.id);
  const orig=await a.text(),posts=await b.json();
  if(posts.length!==1||posts[0].status!=="publish"||posts[0].slug!==slug||
   posts[0].date?.slice(0,10)!==d.day||!posts[0].categories?.includes(1755)||
   String(posts[0].acf?.origin_page_id||"")!==String(d.id))
   throw Error("Published original native metadata/dates/ownership mismatch "+d.id);
  const o=await inert.newPage(),wp=await inert.newPage();
  try{
   await o.setContent('<base href="'+d.source+'">'+orig.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
   const source=await o.evaluate(()=>{
    const e=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page")||document.querySelector("article");
    if(!e)return null;
    const norm=s=>String(s||"").replace(/\s+/g," ").trim();
    return{title:norm(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent),
     body:norm(e.textContent),images:[...e.querySelectorAll("img[src]")].map(x=>x.src)};
   });
   if(!source||source.title!==d.title||source.body.length<130||
    source.images.length!==1||source.images[0]!==d.original)
    throw Error("Original Joomla article body/source image changed "+d.id);
   await wp.setContent('<base href="'+cms+'/">'+String(posts[0].content?.rendered||""),{waitUntil:"domcontentloaded"});
   const rendered=norm(await wp.locator("body").innerText());
   const images=await wp.locator("img[src]").evaluateAll(e=>e.map(x=>x.src));
   if(images.length!==1||exactChars(rendered)!==exactChars(source.body))
    throw Error("Original agriculture WordPress native text/source photos differ "+d.id);
   const u=new URL(images[0]);
   if(u.origin!==cms||u.search||u.hash||!u.pathname.startsWith("/wp-content/uploads/")||
    !u.pathname.endsWith("/"+d.filename)||!Number.isSafeInteger(Number(posts[0].featured_media))||
    Number(posts[0].featured_media)<1)
    throw Error("Original publisher Media filename/featured identity changed "+d.id);
   const [native,proxy]=await Promise.all([get(u.href),get(front+"/api/files"+u.pathname)]);
   if(native.status()!==200||proxy.status()!==200||
    !String(native.headers()["content-type"]||"").startsWith("image/jpeg")||
    !String(proxy.headers()["content-type"]||"").startsWith("image/jpeg")||
    sha(await native.body())!==d.sha||sha(await proxy.body())!==d.sha)
    throw Error("Archived original publisher JPEG digest mismatch WP/Astro "+d.id);
   report.source.push({id:d.id,sourceTitle:d.title,sourceBodyChars:source.body.length,sourcePhoto:d.original});
   report.native.push({id:d.id,wpId:posts[0].id,slug,day:d.day,category:1755,sourceBodyAllCharsMatch:true});
   report.media.push({id:d.id,filename:d.filename,sha256:d.sha,wpSha256:true,proxySha256:true});
   console.log("PSE_THREE_ORIGINAL_POST_SOURCE_ROW="+JSON.stringify(report.native.at(-1)));
  }finally{await o.close();await wp.close();}
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
   const leaks=[];page.on("request",r=>{try{if(new URL(r.url()).origin===cms)leaks.push(r.url())}catch{}});
   try{
    const response=await page.goto(front+"/"+slug,{waitUntil:"domcontentloaded",timeout:65000});
    if(response?.status()!==200)throw Error("Original agriculture Article not public HTTP200 "+d.id);
    const img=page.locator("#article-content img");
    if(await img.count()!==1)throw Error("Original agriculture public photo count mismatch "+d.id);
    const path=await img.first().getAttribute("src")||"";
    if(!path.includes(d.filename.slice(0,-4))||(!path.startsWith("/api/files/")&&!path.startsWith("/api/images/")))
     throw Error("Public agriculture image source identity mismatch "+d.id);
    const dom=await page.evaluate(()=>({
     h1:[...document.querySelectorAll("h1")].map(x=>(x.textContent||"").replace(/\s+/g," ").trim()),
     canonical:document.querySelector('link[rel="canonical"]')?.href||"",
     overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2
    }));
    const c=dom.canonical?new URL(dom.canonical,front):null;
    if(dom.h1.length!==1||dom.h1[0]!==d.title||!c||c.origin!==front||c.pathname!=="/"+slug||
      c.search||c.hash||dom.overflow||leaks.length)
     throw Error("Public agriculture source title/SEO/overflow/CMS leak "+d.id);
    await img.first().scrollIntoViewIfNeeded();
    await img.first().evaluate(async e=>{if(!e.complete)await new Promise(done=>{
      e.addEventListener("load",done,{once:true});e.addEventListener("error",done,{once:true});setTimeout(done,35000);
    })});
    if(!(await img.first().evaluate(e=>e.complete&&e.naturalWidth>0)))
     throw Error("Public original agriculture JPEG browser decode failed "+d.id+" width "+width);
    report.responsive.push({sourceId:d.id,width,originalPublisherJPEG:true,canonical:true,noCmsLeak:true,overflow:false});
    console.log("PSE_THREE_ORIGINAL_POST_LIVE_ROW="+JSON.stringify(report.responsive.at(-1)));
   }finally{await page.close()}
  }
 }
 await inert.close();
 if(report.source.length!==3||report.native.length!==3||report.media.length!==3||report.responsive.length!==6)
  throw Error("Missing strict agriculture original Post verification");
 console.log("PSE_THREE_ORIGINAL_AGRICULTURE_LIVE_PASS="+JSON.stringify({
  originalSourcePosts:3,originalPublisherArchivePhotos:3,wpAndFrontendSha256Verified:6,
  mobileDesktopRows:6,decodedBrowserImages:6,readOnly:true,noCmsWrites:true,noBuild:true}));
}finally{
 await mkdir("artifacts/pse-three-single-original-live",{recursive:true});
 await writeFile("artifacts/pse-three-single-original-live/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
