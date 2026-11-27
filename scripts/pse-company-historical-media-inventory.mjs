/** Source-only 15 historically missing Joomla company Posts: integrity and image inventory, no CMS writes. */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const marker=(await readFile(".pse-company-historical-media-inventory-request","utf8")).trim();
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(marker!=="MODE=AUDIT"||String(event.head_commit?.message||"").split("\n")[0]!=="audit(pse): inspect fifteen missing original company post images")
 throw Error("Missing read-only audit marker");
const checkpoint=JSON.parse(await readFile("docs/checkpoints/pse-company-missing-source-articles-2026-11-27.json","utf8"));
const targets=checkpoint.pendingHistorical;
if(checkpoint.schema!=="pse-company-missing-source-articles-v1"||targets?.length!==15||
 targets.some(x=>x.categoryId!==1742||x.checkpointStatus!=="NOT_IMPORTED"))
 throw Error("Verified source checkpoint identity mismatch");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",r=>r.abort());
const http=await request.newContext({timeout:45000,userAgent:"Mozilla/5.0 (compatible; PSE Article Parity Audit)"});
const norm=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim().toLocaleLowerCase("vi");
const report={mode:"AUDIT",time:new Date().toISOString(),articles:[],mediaAvailability:[],sourceCount:15,noCmsWrites:true};
try{
 for(let n=0;n<targets.length;n+=3){
  const slice=targets.slice(n,n+3);
  const results=await Promise.all(slice.map(async d=>{
   const src=new URL(d.sourceUrl);
   if(src.hostname!=="www.pse.vn"||src.protocol!=="https:"||!src.pathname.startsWith("/21-tin-tuc-su-kien/tin-cong-ty/"))
    throw Error("Untrusted company source "+d.joomlaId);
   const res=await http.get(d.sourceUrl,{timeout:55000});
   if(res.status()!==200)throw Error("Missing original Joomla article "+d.joomlaId+" HTTP "+res.status());
   const html=await res.text(),page=await ctx.newPage();
   try{
    await page.setContent('<base href="'+d.sourceUrl+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded",timeout:25000});
    const data=await page.evaluate(()=>{
     const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page");
     if(!root)throw Error("No original Joomla articleBody");
     const title=(document.querySelector(".item-page h1,.item-page h2")?.textContent||"").replace(/\s+/g," ").trim();
     const imgs=[...root.querySelectorAll("img[src]")].map(img=>new URL(img.getAttribute("src"),document.baseURI).href);
     const fileLinks=[...root.querySelectorAll("a[href]")].map(a=>new URL(a.getAttribute("href"),document.baseURI).href)
      .filter(u=>/\.(?:pdf|docx?|xlsx?|zip)(?:[?#]|$)/i.test(u));
     return{title,articleHtmlLength:root.innerHTML.length,articleTextLength:(root.textContent||"").trim().length,
      images:imgs,fileLinks,iframe:root.querySelectorAll("iframe,embed,object,video,audio").length,
      hasTables:!!root.querySelector("table")};
    });
    return{joomlaId:d.joomlaId,sourceUrl:d.sourceUrl,day:d.createdDate,expectedTitle:d.title,
      title:data.title,match:norm(data.title)===norm(d.title),http:res.status(),...data};
   }finally{await page.close();}
  }));
  for(const result of results){
   report.articles.push(result);
   console.log("PSE_OLDER_COMPANY_MEDIA_ARTICLE="+JSON.stringify({id:result.joomlaId,match:result.match,
    images:result.images.length,htmlLength:result.articleHtmlLength,textLength:result.articleTextLength,
    fileLinks:result.fileLinks.length,iframe:result.iframe,hasTables:result.hasTables}));
  }
 }
 const allImages=[...new Set(report.articles.flatMap(x=>x.images))];
 report.allImages=allImages.length; report.articleImages=report.articles.reduce((n,x)=>n+x.images.length,0);
 if(allImages.length>160||report.articles.some(x=>!x.match||x.articleTextLength<100))
  throw Error("Original source title/content integrity needs manual review");
 // Check only the actual public source-owned original assets; do not probe arbitrary hosts.
 for(let i=0;i<allImages.length;i+=5){
  const group=allImages.slice(i,i+5);
  const heads=await Promise.all(group.map(async url=>{
   const u=new URL(url);
   if(u.protocol!=="https:"||!["pse.vn","www.pse.vn"].includes(u.hostname))
    return{url,status:"UNSUPPORTED_EXTERNAL"};
   try{const r=await http.head(url,{timeout:25000});
    return{url,status:r.status(),contentType:r.headers()["content-type"]||"",bytes:Number(r.headers()["content-length"]||0)}
   }catch(e){return{url,status:"ERROR",reason:String(e?.message||e).slice(0,120)}}
  }));
  report.mediaAvailability.push(...heads);
 }
 report.summary={totalArticles:report.articles.length,totalImageReferences:report.articleImages,
  distinctImageAssets:report.allImages,sourceTitlePass:report.articles.filter(x=>x.match).length,
  imageHTTP200:report.mediaAvailability.filter(x=>x.status===200).length,
  unavailable:report.mediaAvailability.filter(x=>x.status!==200).map(x=>({url:x.url,status:x.status})),
  attachedFiles:report.articles.reduce((n,x)=>n+x.fileLinks.length,0),
  multimedia:report.articles.reduce((n,x)=>n+x.iframe,0)};
 console.log("PSE_COMPANY_HISTORICAL_SOURCE_INVENTORY="+JSON.stringify(report.summary).slice(0,10000));
}finally{
 await mkdir("artifacts/pse-company-news",{recursive:true});
 await writeFile("artifacts/pse-company-news/historical-media-inventory.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();await http.dispose();
}
