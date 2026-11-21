/** Read-only: Joomla #382 three broken /images/web/ photos versus exact source-host /images/ counterparts. */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const id="382",article=state.articles[id];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 state.schema!=="pse-legacy-article-migration-v1"||
 article?.status!=="quarantined"||article.reason!=="Original media HTTP 404"||
 !article.source_url?.startsWith("https://www.pse.vn/"))
 throw Error("Original source post identity changed");
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:45000});
const report={id:382,readOnly:true,source:article.source_url,photos:[],sourceCount:0};
try{
 const res=await net.get(article.source_url,{timeout:60000});
 if(res.status()!==200)throw Error("Source article HTTP "+res.status());
 const html=await res.text();
 const ctx=await browser.newContext({javaScriptEnabled:false});
 await ctx.route("**/*",r=>r.abort());
 const page=await ctx.newPage();
 await page.setContent('<base href="'+article.source_url+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded",timeout:20000});
 const imgs=await page.evaluate(()=>{
  const r=document.querySelector(".item-page [itemprop=articleBody],.item-page,article")||document.body;
  return [...new Set([...r.querySelectorAll("img[src]")].map(e=>e.src))].filter(x=>{
   try{return new URL(x).hostname==="www.pse.vn"&&new URL(x).pathname.startsWith("/images/web/")}catch{return false}});
 });
 await ctx.close();
 report.sourceCount=imgs.length;
 if(imgs.length!==3)throw Error("Original article photo count changed");
 for(const old of imgs){
  const x=new URL(old);
  const full=new URL(x.pathname.replace(/^\/images\/web\//,"/images/"),x.origin).href;
  const item={thumb:old,sourceHostFullUrl:full,http:null,mime:null,bytes:null,originalPhotoProven:false};
  for(let attempt=1;attempt<=2;attempt++){
   try{
    const r=await net.get(full,{maxRedirects:2,timeout:35000});
    item.http=r.status();item.mime=String(r.headers()["content-type"]||"").slice(0,60);
    if(r.ok()&&item.mime.startsWith("image/")){
     const bytes=await r.body();
     item.bytes=bytes.length;
     item.originalPhotoProven=bytes.length>=500&&bytes.length<18000000&&
      ((bytes[0]===255&&bytes[1]===216)||bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    }
    if(r.status()<500)break;
   }catch(e){
    item.error=String(e?.code||e?.name||"network").slice(0,40);
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,650));
   }
  }
  report.photos.push(item);
  console.log("PSE_382_SOURCE_FULL_PHOTO="+JSON.stringify(item));
 }
 console.log("PSE_382_SOURCE_PHOTO_SUMMARY="+JSON.stringify({references:3,
   exactSourceFullPhotoGet:report.photos.filter(x=>x.originalPhotoProven).length,readOnly:true}));
}finally{
 await mkdir("artifacts/pse-382-source-full-photo",{recursive:true});
 await writeFile("artifacts/pse-382-source-full-photo/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}