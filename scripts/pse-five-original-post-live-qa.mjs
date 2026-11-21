/** Native PSE WordPress -> Astro source and target independent five Post QA.
 * Never mutate original Joomla, CMS or deployment. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const targets=[
 {id:205,count:10,day:"2011-08-23"},
 {id:226,count:1,day:"2011-10-06"},
 {id:230,count:2,day:"2011-10-25"},
 {id:240,count:6,day:"2012-03-16"},
 {id:321,count:5,day:"2012-12-04"}
];
if(state.schema!=="pse-legacy-article-migration-v1"||
 process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 targets.some(t=>!state.articles[t.id]?.source_url?.startsWith("https://www.pse.vn/")))
 throw Error("Untrusted Joomla source Post manifest");
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function origin(name){const v=vars.filter(x=>x.startsWith(name+"="));if(v.length!==1)throw Error("Missing origin "+name);
 const u=new URL(v[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid configured origin");
 return u.origin}
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("CMS/frontend origin overlap");
const browser=await chromium.launch({headless:true});
const network=await request.newContext({timeout:50000});
const report={schema:"pse-five-original-posts-live-v1",readOnly:true,sourceBacked:true,front,rows:[],imageGet:[]};
try{
 const originals=[];
 for(const t of targets){
  const source=state.articles[t.id].source_url;
  const resp=await network.get(source,{timeout:50000});
  if(resp.status()!==200)throw Error("Joomla original Article not available "+t.id);
  const raw=await resp.text();
  if(raw.length<200||raw.length>8000000)throw Error("Unsafe source body");
  const ctx=await browser.newContext({javaScriptEnabled:false});
  await ctx.route("**/*",r=>r.abort());
  const page=await ctx.newPage();
  let data;
  try{
   await page.setContent('<base href="'+source+'">'+raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
   data=await page.evaluate(()=>{
    const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article")||document.body;
    return {title:(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||"").replace(/\s+/g," ").trim(),
      urls:[...new Set([...root.querySelectorAll("img[src]")].map(x=>x.src))].filter(x=>{
       try{let u=new URL(x);return u.hostname==="www.pse.vn"&&u.pathname.startsWith("/images/web/gallery/")}catch{return false}
      })};
   });
  }finally{await ctx.close()}
  if(data.urls.length!==t.count)throw Error("Original source photo inventory changed "+t.id);
  const expected=data.urls.map(src=>{
   const u=new URL(src),full=new URL(u.pathname.replace(/^\/images\/web\/gallery\//,"/images/gallery/"),u.origin).href;
   const ext=new URL(full).pathname.split(".").at(-1).toLowerCase().replace("jpeg","jpg");
   const album=({"205":991,"226":992,"230":997,"240":996,"321":997})[t.id];
   return "pse-gallery-"+album+"-"+createHash("sha256").update(full).digest("hex").slice(0,16)+"."+ext;
  });
  const slug=new URL(source).pathname.split("/").at(-1).replace(/^\d+-/,"").replace(/\.html$/i,"");
  const r=await network.get(wp+"/wp-json/wp/v2/posts?slug="+encodeURIComponent(slug)+
    "&per_page=5&_fields=id,slug,status,date,acf,content,featured_media,categories");
  if(r.status()!==200)throw Error("Native public WP Post not visible "+t.id);
  const posts=await r.json();
  if(!Array.isArray(posts)||posts.length!==1||posts[0].status!=="publish"||
   posts[0].date.slice(0,10)!==t.day||!posts[0].featured_media)
    throw Error("Published WordPress source identity/date missing "+t.id);
  originals.push({...t,source,slug,title:data.title,expected,postId:posts[0].id});
 }
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const leaked=[];
  page.on("request",r=>{try{if(new URL(r.url()).origin===wp)leaked.push("cms-origin")}catch{}});
  for(const orig of originals){
   const response=await page.goto(front+"/"+orig.slug,{waitUntil:"domcontentloaded",timeout:65000});
   if(response?.status()!==200)throw Error("Astro news Post not publicly visible "+orig.id+" HTTP "+response?.status());
   const imgs=page.locator("#article-content img");
   const count=await imgs.count();
   if(count!==orig.count)throw Error("Joomla → Astro original media count "+orig.id+" expected "+orig.count+" got "+count);
   const urls=await imgs.evaluateAll(es=>es.map(i=>new URL(i.getAttribute("src")||"",location.href).href));
   if(new Set(urls).size!==urls.length||urls.some(x=>!x.startsWith(front+"/api/files/wp-content/uploads/")))
    throw Error("Astro broken native image ownership "+orig.id);
   const filenames=urls.map(x=>decodeURIComponent(new URL(x).pathname.split("/").at(-1)));
   if(filenames.some((x,i)=>x!==orig.expected[i]))
    throw Error("Original article image filename identity/order mismatch "+orig.id);
   const dom=await page.evaluate(()=>({
    h1:[...document.querySelectorAll("h1")].map(x=>x.textContent.replace(/\s+/g," ").trim()),
    canonical:document.querySelector('link[rel="canonical"]')?.href||"",
    overflow:document.body.scrollWidth>window.innerWidth+1
   }));
   const canonical=dom.canonical?new URL(dom.canonical,front):null;
   if(dom.h1.length!==1||dom.h1[0]!==orig.title||
    !canonical||canonical.origin!==front||canonical.pathname!=="/"+orig.slug||
    canonical.search||canonical.hash||dom.overflow||leaked.length)
    throw Error("Original Post title/SEO/layout/privacy mismatch "+orig.id+" width "+width);
   for(const index of [...new Set([0,Math.floor((count-1)/2),count-1])]){
    const img=imgs.nth(index);await img.scrollIntoViewIfNeeded();
    await img.evaluate(async el=>{if(!el.complete)await new Promise(resolve=>{
     el.addEventListener("load",resolve,{once:true});el.addEventListener("error",resolve,{once:true});setTimeout(resolve,12000)})});
    if(!await img.evaluate(el=>el.complete&&el.naturalWidth>0))
     throw Error("Original Joomla image pixel decode failed "+orig.id+" index "+index);
   }
   const row={id:orig.id,wpPostId:orig.postId,width,http:response.status(),
    originalImages:orig.count,images:count,allOriginalFilenameOrder:true,
    decodedSample:Math.min(3,count),sourceCreatedDay:orig.day,seo:true,overflow:false,adminOriginRequests:0};
   report.rows.push(row);
   console.log("PSE_FIVE_ORIGINAL_POST_LIVE_ROW="+JSON.stringify(row));
   if(width===390)for(const x of [...new Set([urls[0],urls[Math.floor((urls.length-1)/2)],urls.at(-1)])])
    report.imageGet.push({url:x,sourceId:orig.id});
  }
  await page.close();
 }
 const checks=[];
 for(const x of report.imageGet){
  const r=await network.get(x.url,{timeout:25000,failOnStatusCode:false});
  checks.push({sourceId:x.sourceId,status:r.status(),mime:String(r.headers()["content-type"]||"")});
 }
 if(checks.some(x=>x.status!==200||!x.mime.toLowerCase().startsWith("image/")))
  throw Error("Original source image proxy HTTP not available");
 report.imageGet=checks;
 console.log("PSE_FIVE_ORIGINAL_POSTS_LIVE_PASS="+JSON.stringify({posts:5,originalImages:24,rows:report.rows.length,readOnly:true,sourceImageGet:checks.length}));
}finally{
 await mkdir("artifacts/pse-five-original-posts-live",{recursive:true});
 await writeFile("artifacts/pse-five-original-posts-live/report.json",JSON.stringify(report,null,2)+"\n");
 await network.dispose();await browser.close();
}