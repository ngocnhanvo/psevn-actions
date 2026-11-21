/** Joomla investor articles #338, #1085 original scanned notices: verify native-source image bytes. GET ONLY. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const originals=[{id:338,day:"2013-02-28",expectedImages:2},{id:1085,day:"2015-03-04",expectedImages:2}];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 state.schema!=="pse-legacy-article-migration-v1"||
 originals.some(x=>state.articles[x.id]?.reason!=="Source content incomplete or oversized"))
 throw Error("Source checkpoint or article identity changed");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",r=>r.abort());
const dateCtx=await browser.newContext();
await dateCtx.route(/\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const net=await request.newContext({timeout:45000});
const sha=b=>createHash("sha256").update(b).digest("hex");
const matches=b=>b.length>=200&&b.length<14_000_000&&
 (b.subarray(0,2).toString("hex")==="ffd8"&&b.subarray(-2).toString("hex")==="ffd9"||
 b.subarray(0,8).toString("hex")==="89504e470d0a1a0a");
const report={schema:"pse-two-source-investor-scan-media-original-v1",readOnly:true,noCmsWrites:true,noBuild:true,rows:[]};
const get=async(url,timeout=35000)=>{
 const r=await net.get(url,{timeout,maxRedirects:0,failOnStatusCode:false});
 const mime=String(r.headers()["content-type"]||"").toLowerCase().split(";")[0];
 const buf=r.status()===200&&mime.startsWith("image/")?await r.body():null;
 return{http:r.status(),mime,bytes:buf?.length||null,sha256:buf?sha(buf):null,valid:!!buf&&matches(buf)};
};
try{
 for(const article of originals){
  const url=state.articles[article.id].source_url;
  const row={sourceId:article.id,source:url,dayExpected:article.day,dayProven:false,
    title:null,textChars:0,media:[],decision:"SOURCE_REVIEW"};
  report.rows.push(row);
  const u=new URL(url);
  if(u.hostname!=="www.pse.vn"||!new RegExp("/"+article.id+"-[^/]+\\.html$").test(u.pathname))
   throw Error("Exact original investor article source ID changed");
  const source=await net.get(url,{timeout:60000});
  if(source.status()!==200)throw Error("Source investor Article HTTP "+source.status());
  const html=await source.text(),page=await ctx.newPage();
  let info;
  try{
   await page.setContent('<base href="'+url+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
   info=await page.evaluate(()=>{
    const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page");
    const norm=s=>String(s||"").replace(/\s+/g," ").trim();
    return{title:norm(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent),
      text:norm(root?.textContent),imgs:[...root.querySelectorAll("img[src]")].map(i=>i.src)};
   });
  }finally{await page.close()}
  if(!info?.title||info.text.length<180||info.imgs.length!==article.expectedImages||
   info.imgs.some(x=>!x.startsWith("https://www.pse.vn/images/web/news/qhcd/")))
   throw Error("Original investor source body/media altered "+article.id);
  row.title=info.title;row.textChars=info.text.length;
  const datePage=await dateCtx.newPage();let date;
  try{date=await searchDate(datePage,{id:article.id,sourceUrl:url,title:info.title,opening:info.text.slice(0,350)})}
  finally{await datePage.close()}
  row.dayProven=date?.source==="joomla_com_search_created"&&date.day===article.day;
  if(!row.dayProven)throw Error("Source investor created date no longer verified "+article.id);
  for(let i=0;i<info.imgs.length;i++){
   const original=info.imgs[i],img={source:original,index:i,original:null,captures:[],accepted:null};
   row.media.push(img);
   const live=await get(original);
   img.original=live;
   if(live.valid){img.accepted={origin:"CURRENT_SOURCE_URL",bytes:live.bytes,sha256:live.sha256};continue}
   const u=new URL("https://web.archive.org/cdx/search/cdx");
   u.searchParams.set("url",original);
   u.searchParams.set("output","json");
   u.searchParams.set("fl","timestamp,original,statuscode,mimetype,digest");
   u.searchParams.set("filter","statuscode:200");
   u.searchParams.set("limit","3");
   let archiveResp;
   try{archiveResp=await net.get(u.href,{timeout:18000,failOnStatusCode:false,maxRedirects:0})}
   catch(e){img.archiveIndexError=String(e?.name||e?.message).slice(0,70);continue}
   img.indexHttp=archiveResp.status();
   if(archiveResp.status()!==200)continue;
   const raw=await archiveResp.text();
   let entries;
   try{entries=JSON.parse(raw)}catch{img.archiveIndexError="NOT_JSON";continue}
   if(!Array.isArray(entries)||entries[0]?.[0]!=="timestamp")continue;
   for(const e of entries.slice(1,4)){
    const [ts,sourceUrl,status,mime]=e;
    if(!/^\d{14}$/.test(String(ts))||String(ts).slice(0,8)>"20261121"||
     String(status)!=="200"||new URL(sourceUrl).pathname!==new URL(original).pathname)continue;
    const archive="https://web.archive.org/web/"+ts+"id_/"+sourceUrl;
    let proof;
    try{proof=await get(archive,25000)}
    catch(e){proof={error:String(e?.name||e?.message).slice(0,80),valid:false}}
    img.captures.push({timestamp:ts,indexMime:mime,originalPath:sourceUrl,...proof});
    if(proof.valid){img.accepted={origin:"ARCHIVED_EXACT_SOURCE_URL",timestamp:ts,
      bytes:proof.bytes,sha256:proof.sha256};break}
   }
  }
  row.decision=row.media.length===article.expectedImages&&row.media.every(m=>m.accepted)?
   "TWO_ORIGINAL_NOTICE_IMAGES_VERIFIED_WITH_SOURCE_DAY":"ORIGINAL_NOTICE_IMAGES_MISSING";
  console.log("PSE_ORIGINAL_INVESTOR_NOTICE_ROW="+JSON.stringify({sourceId:row.sourceId,
   day:article.day,dayProven:row.dayProven,bodyChars:row.textChars,
   photos:row.media.map(m=>({index:m.index,path:new URL(m.source).pathname,liveHttp:m.original.http,
    archiveCandidates:m.captures.length,accepted:m.accepted})),
   decision:row.decision}));
 }
 report.summary={sourcePosts:originals.length,
  bothPhotosReady:report.rows.filter(r=>r.decision==="TWO_ORIGINAL_NOTICE_IMAGES_VERIFIED_WITH_SOURCE_DAY").map(r=>r.sourceId),
  stillBlocked:report.rows.filter(r=>r.decision!=="TWO_ORIGINAL_NOTICE_IMAGES_VERIFIED_WITH_SOURCE_DAY").map(r=>r.sourceId),
  noCmsWrites:true,readOnly:true};
 console.log("PSE_ORIGINAL_INVESTOR_NOTICE_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-investor-two-notices",{recursive:true});
 await writeFile("artifacts/pse-investor-two-notices/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await ctx.close();await dateCtx.close();await browser.close();
}
