/** Assert PSE historical 15 Joomla Posts and every original Media actually render on Astro production.
 * Read-only 15 article and 93 source image QA after signed deployment. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const marker=(await readFile(".pse-company-historical-live-qa-request","utf8")).trim();
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(marker!=="MODE=READONLY"||String(ev.head_commit?.message||"").split("\n")[0]!=="test(pse): verify all fifteen original company news Posts live")
 throw Error("Unauthorized PSE public article parity run");
const source=JSON.parse(await readFile("docs/checkpoints/pse-company-missing-source-articles-2026-11-27.json","utf8"));
const items=source.pendingHistorical;
if(source.schema!=="pse-company-missing-source-articles-v1"||items.length!==15||
 items.reduce((n,d)=>n+d.imageCount,0)!==93)throw Error("PSE exact source original checkpoint drift");
const base="https://pse.webnvn.com";
const browser=await chromium.launch({headless:true});
const http=await browser.newContext({viewport:{width:1440,height:900}});
const report={status:"RUNNING",time:new Date().toISOString(),publicSite:base,
 categories:[],articleCount:items.length,imagesExpected:93,articles:[],assets:[],noWrites:true};
const norm=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();
try{
 const archivePage=await http.newPage();
 try{
  const r=await archivePage.goto(base+"/tin-tuc-su-kien/tin-cong-ty",{waitUntil:"domcontentloaded",timeout:65000});
  if(r?.status()!==200)throw Error("Company SSR archive HTTP "+r?.status());
  const links=await archivePage.locator("a[href]").evaluateAll(nodes=>nodes.map(a=>({text:(a.textContent||"").trim(),href:a.href})));
  const all=links.filter(x=>x.text==="Tất cả"&&new URL(x.href).pathname.replace(/\/$/,"")==="/tin-tuc-su-kien/tin-cong-ty");
  if(all.length<1)throw Error("Native company all Menu header link missing");
  report.categories.push({url:base+"/tin-tuc-su-kien/tin-cong-ty",http:200,menuAll:all.length});
 }finally{await archivePage.close()}
 for(let offset=0;offset<items.length;offset+=3){
  const results=await Promise.all(items.slice(offset,offset+3).map(async d=>{
   const sourceName=new URL(d.sourceUrl).pathname.split("/").at(-1);
   const slug=sourceName.replace(new RegExp("^"+d.joomlaId+"-"),"").replace(/\.html$/i,"");
   if(!/^[a-z0-9-]+$/.test(slug))throw Error("Original Joomla slug unsafe "+d.joomlaId);
   const url=base+"/"+slug,page=await http.newPage();
   try{
    const res=await page.goto(url,{waitUntil:"domcontentloaded",timeout:65000});
    if(res?.status()!==200)throw Error("Published original Post SSR HTTP "+res?.status()+" source="+d.joomlaId+" url="+url);
    const data=await page.evaluate(()=>{
     const body=document.querySelector("#article-content");
     return{
      title:(document.querySelector("h1")?.textContent||"").replace(/\s+/g," ").trim(),
      content:(body?.textContent||"").replace(/\s+/g," ").trim().slice(0,350),
      contentLength:(body?.textContent||"").replace(/\s+/g," ").trim().length,
      images:[...(body?.querySelectorAll("img[src]")||[])].map(x=>({src:x.getAttribute("src"),alt:x.alt||""})),
      date:document.querySelector("main time[datetime]")?.getAttribute("datetime")||"",
      canonical:document.querySelector('link[rel="canonical"]')?.getAttribute("href")||""
     };
    });
    if(norm(data.title)!==norm(d.title)||data.contentLength<100||
     data.images.length!==d.imageCount||!data.date.startsWith(d.createdDate))
     throw Error("Published original source title/date/body/media parity mismatch id="+d.joomlaId+" expected="+JSON.stringify({
      images:d.imageCount,date:d.createdDate,title:d.title})+" got="+JSON.stringify({
      images:data.images.length,date:data.date,title:data.title,body:data.contentLength}));
    const images=await Promise.all(data.images.map(async x=>{
     const asset=new URL(x.src,url);
     if(asset.origin!==base||!asset.pathname.startsWith("/api/images/"))
      throw Error("Original image is not safe same-origin Astro proxy "+x.src);
     const result=await page.request.get(asset.href,{timeout:45000,failOnStatusCode:false});
     if(result.status()!==200||!String(result.headers()["content-type"]||"").startsWith("image/"))
      throw Error("Original optimized article image asset not HTTP200 source="+d.joomlaId+" src="+x.src+" status="+result.status());
     return{path:asset.pathname,status:result.status(),type:result.headers()["content-type"]};
    }));
    return{sourceId:d.joomlaId,url,http:200,images:images.length,sourceDay:data.date.slice(0,10),
     textLength:data.contentLength,assets:images};
   }finally{await page.close()}
  }));
  for(const r of results){
   report.articles.push({...r,assets:undefined});
   report.assets.push(...r.assets.map(x=>({...x,sourceId:r.sourceId})));
   console.log("PSE_COMPANY_HISTORICAL_LIVE_ARTICLE_PASS="+JSON.stringify({id:r.sourceId,images:r.images,day:r.sourceDay,url:r.url}));
  }
 }
 if(report.articles.length!==15||report.assets.length!==93)
  throw Error("Historical all-source public parity incomplete");
 report.status="PASS";
 console.log("PSE_COMPANY_HISTORICAL_LIVE_PARITY=PASS 15_POSTS_93_ORIGINAL_IMAGES_MENU");
}finally{
 await mkdir("artifacts/pse-company-news",{recursive:true});
 await writeFile("artifacts/pse-company-news/live-historical-15-qa.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
