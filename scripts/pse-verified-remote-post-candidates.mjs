/** Read-only exact source date and binary provenance for two potentially recoverable posts. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Untrusted PSE checkpoint");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1380,height:900},ignoreHTTPSErrors:false});
const report={schema:"pse-two-remote-candidate-proof-v1",readOnly:true,records:[]};
try{
 for(const id of [1641,1651]){
  const entry=state.articles[String(id)];
  if(entry?.status!=="quarantined"||entry.reason!=="Article contains non-local mandatory media"||
    !entry.source_url?.startsWith("https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/"+id+"-"))
   throw Error("Provenance changed for historical source #"+id);
  const page=await ctx.newPage();
  const r=await page.goto(entry.source_url,{waitUntil:"domcontentloaded",timeout:55000});
  if(r?.status()!==200)throw Error("Original article #"+id+" HTTP "+r?.status());
  const item=await page.evaluate(()=>{
   const root=document.querySelector(".item-page [itemprop=articleBody]")||
     document.querySelector(".item-page");
   if(!root)throw Error("Original article body not present");
   const title=(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||document.title||"").replace(/\s+-\s+PSE\.VN\s*$/i,"").replace(/\s+/g," ").trim();
   const opening=(root.textContent||"").replace(/\s+/g," ").trim();
   const media=[...new Set([...root.querySelectorAll("img[src],a[href]")].map(el=>{
    const raw=el.getAttribute(el.tagName==="IMG"?"src":"href")||"";
    try{return new URL(raw,location.href).href}catch{return""}
   }).filter(url=>{
    try{const u=new URL(url);
     return /^https?:$/.test(u.protocol)&&!["www.pse.vn","pse.vn"].includes(u.hostname)&&
       /\.(?:png|jpe?g|webp|gif|pdf)(?:[?#]|$)/i.test(url);
    }catch{return false}
   }))];
   return{title,opening:opening.slice(0,600),chars:opening.length,media};
  });
  console.log("PSE_REMOTE_SOURCE_PREFLIGHT="+JSON.stringify({id,title:item.title,chars:item.chars,media:item.media}));
  if(item.chars<65||!item.title||item.media.length<1||item.media.length>10)
   throw Error("Original article #"+id+" body/media boundaries changed");
  await page.close();
  const datePage=await ctx.newPage();
  await datePage.route(/\.(?:png|jpe?g|webp|svg|gif|woff2?|ttf)(?:[?#]|$)/i,route=>route.abort());
  const created=await searchDate(datePage,{id,sourceUrl:entry.source_url,title:item.title,opening:item.opening});
  await datePage.close();
  const proof=[];
  for(const mediaUrl of item.media){
   const file={url:mediaUrl,http:null,bytes:0,mime:"",sha256:null,finalHost:null,valid:false,error:null};
   try{
    const download=await ctx.request.get(mediaUrl,{timeout:45000,maxRedirects:4});
    file.http=download.status();file.mime=String(download.headers()["content-type"]||"");
    const finalUrl=new URL(download.url()),orig=new URL(mediaUrl);
    file.finalHost=finalUrl.hostname;
    if(download.ok()){
     const buf=await download.body();file.bytes=buf.length;
     file.sha256=createHash("sha256").update(buf).digest("hex");
     const h=buf.subarray(0,16),ext=orig.pathname.split(".").at(-1).toLowerCase();
     const validImage=(["jpg","jpeg"].includes(ext)&&h.subarray(0,3).toString("hex")==="ffd8ff")||
       (ext==="png"&&h.subarray(0,8).toString("hex")==="89504e470d0a1a0a")||
       (ext==="gif"&&["GIF89a","GIF87a"].includes(h.subarray(0,6).toString("latin1")))||
       (ext==="webp"&&h.subarray(0,4).toString("latin1")==="RIFF"&&h.subarray(8,12).toString("latin1")==="WEBP");
     file.valid=download.ok()&&file.bytes>=80&&file.bytes<24_000_000&&
       finalUrl.protocol==="https:"&&finalUrl.hostname===orig.hostname&&
       file.mime.toLowerCase().startsWith("image/")&&validImage;
    }
   }catch(e){file.error=String(e).slice(0,200)}
   proof.push(file);
  }
  const record={sourceId:id,sourceUrl:entry.source_url,title:item.title,chars:item.chars,
   date:created,images:proof,ready:!!created.day&&proof.length===item.media.length&&proof.every(x=>x.valid)};
  report.records.push(record);
  console.log("PSE_RECOVERABLE_POST_PROOF="+JSON.stringify({id,title:record.title,
   originalCreatedDay:created.day||null,source:created.source,
   images:proof.map(x=>({host:x.finalHost,http:x.http,bytes:x.bytes,valid:x.valid,sha:x.sha256?.slice(0,16),error:x.error})),
   ready:record.ready}).slice(0,2800));
 }
 console.log("PSE_RECOVERABLE_POST_PROOF_SUMMARY="+JSON.stringify({
  total:report.records.length,ready:report.records.filter(x=>x.ready).map(x=>x.sourceId),
  blocked:report.records.filter(x=>!x.ready).map(x=>x.sourceId),readOnly:true}));
 await mkdir("artifacts/pse-content-parity",{recursive:true});
 await writeFile("artifacts/pse-content-parity/remote-post-candidates.json",JSON.stringify(report,null,2)+"\n");
}finally{await ctx.close();await browser.close()}