/** Verify original Joomla 1137 financial report HTML attachment + 225 image source bytes.
 * Strictly read-only; Wayback capture is not publication date or arbitrary file replacement.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const legacy=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 legacy.schema!=="pse-legacy-article-migration-v1"||!legacy.backup_verified||
 legacy.articles[1137]?.wp_id!==82550||legacy.articles[225]?.wp_id!==79574)
 throw Error("Source identity or project not approved");
const source=legacy.articles[1137].source_url,original=new URL(source);
if(original.origin!=="https://www.pse.vn"||!/\/1137-[^/]+\.html$/.test(original.pathname))
 throw Error("Unexpected original Joomla 1137 path");
const archive="https://web.archive.org",web=new URL(archive);
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",r=>r.abort());
const page=await ctx.newPage();
const net=await browser.newContext({javaScriptEnabled:false});
const report={schema:"pse-1137-original-financial-document-and-225-image-v1",
 readOnly:true,noCmsWrites:true,noBuild:true,financial:{source,indexes:[],captures:[],decision:null},
 article225:{original:legacy.articles[225].source_url,image:"http://images1.tuoitre.vn/tianyon/ImageView.aspx?ThumbnailID=521979",responses:[],archives:[],decision:null},summary:null};
const sha=b=>createHash("sha256").update(b).digest("hex");
const get=async(url,timeout=19000)=>{
 const u=new URL(url);
 if(u.origin!==archive&&!["http://images1.tuoitre.vn","https://images1.tuoitre.vn"].includes(u.origin))
  throw Error("Untrusted read-only request "+u.origin);
 return net.request.get(url,{timeout,maxRedirects:0,failOnStatusCode:false});
};
try{
 const variants=["http://www.pse.vn","https://www.pse.vn","http://pse.vn","https://pse.vn"]
  .map(x=>x+original.pathname);
 const candidates=new Map();
 await Promise.all(variants.map(async variant=>{
  const q=new URL(archive+"/cdx/search/cdx");
  for(const [k,v] of Object.entries({url:variant,output:"json",
   fl:"timestamp,original,statuscode,mimetype",filter:"statuscode:200",
   collapse:"timestamp:4",limit:"12"}))q.searchParams.set(k,v);
  const row={url:variant,http:null,found:0,reason:null};
  report.financial.indexes.push(row);
  try{
   const r=await get(q.href,22000);row.http=r.status();
   if(r.status()!==200){row.reason="ARCHIVE_CDX_HTTP_"+r.status();return}
   const text=await r.text();if(text.length>100000){row.reason="INDEX_OVERSIZED";return}
   let arr;try{arr=JSON.parse(text)}catch{row.reason="INDEX_INVALID_JSON";return}
   if(!Array.isArray(arr)||arr[0]?.[0]!=="timestamp"){row.reason="INDEX_EMPTY";return}
   for(const [timestamp,archivedUrl,status,mime] of arr.slice(1)){
    if(!/^\d{14}$/.test(timestamp)||timestamp.slice(0,8)>"20261121"||
     String(status)!=="200"||!/html/i.test(mime||""))continue;
    let au;try{au=new URL(archivedUrl)}catch{continue}
    if(!["pse.vn","www.pse.vn"].includes(au.hostname)||au.pathname!==original.pathname||
     !["http:","https:"].includes(au.protocol))continue;
    const key=timestamp+"|"+au.href;
    if(!candidates.has(key)){candidates.set(key,{timestamp,original:au.href});row.found++}
   }
  }catch(e){row.reason="ARCHIVE_NETWORK_UNAVAILABLE";row.error=String(e?.name||e?.code||"network").slice(0,65)}
 }));
 console.log("PSE_1137_ORIGINAL_ARCHIVE_INDEX="+JSON.stringify({source,indexes:report.financial.indexes,unique:candidates.size}).slice(0,4000));
 for(const c of [...candidates.values()].sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,10)){
  const item={timestamp:c.timestamp,original:c.original,http:null,title:null,
   bodyChars:0,bodyStart:null,links:[],files:[],media:[],decision:null};
  report.financial.captures.push(item);
  try{
   const r=await get(archive+"/web/"+c.timestamp+"id_/"+c.original,24000);
   item.http=r.status();
   if(r.status()!==200){item.decision="CAPTURE_HTTP_"+r.status();continue}
   if(!String(r.headers()["content-type"]||"").includes("text/html")){item.decision="NOT_HTML";continue}
   const raw=await r.text();if(raw.length<300||raw.length>6000000){item.decision="BAD_HTML_SIZE";continue}
   await page.setContent('<base href="'+c.original+'">'+
    raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded",timeout:18000});
   const data=await page.evaluate(()=>{
    const t=x=>String(x||"").normalize("NFKC").replace(/\s+/g," ").trim();
    const root=document.querySelector(".item-page [itemprop=articleBody]")||
     document.querySelector(".item-page")||document.querySelector("article");
    const title=t(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||document.title);
    const links=[...(root?.querySelectorAll("a[href]")||[])].map(e=>({
     title:t(e.textContent).slice(0,120),
     url:(()=>{try{return new URL(e.getAttribute("href"),document.baseURI).href}catch{return null}})()
    })).filter(x=>x.url).slice(0,60);
    const files=links.filter(x=>/\.(?:pdf|docx?|xlsx?|zip|rar|jpg|jpeg)(?:$|[?#])/i.test(x.url)||
     /tải|download|đính kèm|pdf|bctc|báo cáo/i.test(x.title)).slice(0,35);
    const media=[...(root?.querySelectorAll("iframe[src],object[data],embed[src]")||[])]
     .map(e=>e.getAttribute("src")||e.getAttribute("data")).filter(Boolean).slice(0,20);
    return{title,body:t(root?.textContent||""),htmlChars:root?.innerHTML.length||0,links,files,media};
   });
   item.title=data.title;item.bodyChars=data.body.length;item.bodyStart=data.body.slice(0,470);
   item.links=data.links;item.files=data.files;item.media=data.media;item.bodyHtmlChars=data.htmlChars;
   item.decision=/báo cáo tài chính bán niên 2015/i.test(item.title)?
    (item.files.length?"EXACT_ORIGINAL_PDF_LINK_CANDIDATE":"EXACT_ORIGINAL_BODY_NO_ATTACHMENT_PROVEN"):
    "CAPTURE_TITLE_NOT_ORIGINAL";
  }catch(e){item.decision="ARCHIVE_FETCH_OR_PARSE_ERROR";item.error=String(e?.name||e?.code||"network").slice(0,70)}
  console.log("PSE_1137_ARCHIVED_ORIGINAL_DETAIL="+JSON.stringify(item).slice(0,12500));
 }
 report.financial.decision=report.financial.captures.some(x=>x.decision==="EXACT_ORIGINAL_PDF_LINK_CANDIDATE")?
  "ORIGINAL_DOCUMENT_URL_CANDIDATE_NEXT_VALIDATE_BINARY":"NO_ORIGINAL_DOCUMENT_LINK_PROVEN";
 const image="http://images1.tuoitre.vn/tianyon/ImageView.aspx?ThumbnailID=521979";
 for(const imgUrl of [image,image.replace(/^http:/,"https:")]){
  const rec={url:imgUrl,http:null,contentType:null,bytes:0,sha256:null,validImage:false,location:null,error:null};
  report.article225.responses.push(rec);
  try{
   const r=await get(imgUrl,23000);rec.http=r.status();
   rec.contentType=String(r.headers()["content-type"]||"").split(";")[0];
   rec.location=r.headers().location||null;
   const declared=Number(r.headers()["content-length"]||0);
   if(r.status()===200&&declared<=9000000){
    const b=await r.body();rec.bytes=b.length;
    rec.validImage=b.length>=160&&b.length<=9000000&&
     (b.subarray(0,3).toString("hex")==="ffd8ff"||
      b.subarray(0,8).toString("hex")==="89504e470d0a1a0a"||
      ["GIF87a","GIF89a"].includes(b.subarray(0,6).toString("ascii")));
    if(rec.validImage)rec.sha256=sha(b);
   }
  }catch(e){rec.error=String(e?.name||e?.code||"network").slice(0,75)}
 }
 console.log("PSE_225_ORIGINAL_AND_HTTPS_IMAGE="+JSON.stringify(report.article225.responses));
 // Query-string identity is mandatory: no substitution of other TuoiTre photographs.
 for(const variant of [image,image.replace(/^http:/,"https:")]){
  const q=new URL(archive+"/cdx/search/cdx");
  for(const [k,v] of Object.entries({url:variant,output:"json",
   fl:"timestamp,original,statuscode,mimetype",filter:"statuscode:200",limit:"8"}))q.searchParams.set(k,v);
  const rec={url:variant,indexHttp:null,indexMatches:0,originalImageSha256s:[],reason:null};
  report.article225.archives.push(rec);
  try{
   const r=await get(q.href,21000);rec.indexHttp=r.status();
   if(r.status()!==200){rec.reason="INDEX_HTTP_"+r.status();continue}
   let j;try{j=JSON.parse(await r.text())}catch{rec.reason="INVALID_INDEX_JSON";continue}
   if(!Array.isArray(j)||j[0]?.[0]!=="timestamp"){rec.reason="NO_INDEX";continue}
   for(const [ts,old,status,mime] of j.slice(1,9)){
    if(!/^\d{14}$/.test(ts)||ts.slice(0,8)>"20261121"||status!=="200")continue;
    let v;try{v=new URL(old)}catch{continue}
    if(v.hostname!=="images1.tuoitre.vn"||v.pathname!=="/tianyon/ImageView.aspx"||
     v.searchParams.get("ThumbnailID")!=="521979")continue;
    rec.indexMatches++;
    const saved=await get(archive+"/web/"+ts+"id_/"+old,23000);
    if(saved.status()!==200)continue;
    const declared=Number(saved.headers()["content-length"]||0);
    if(declared>9000000)continue;
    const b=await saved.body();
    const valid=b.length>=160&&b.length<=9000000&&
     (b.subarray(0,3).toString("hex")==="ffd8ff"||
      b.subarray(0,8).toString("hex")==="89504e470d0a1a0a");
    if(valid)rec.originalImageSha256s.push({timestamp:ts,sha256:sha(b),bytes:b.length});
   }
  }catch(e){rec.reason="ARCHIVE_UNAVAILABLE";rec.error=String(e?.name||e?.code||"network").slice(0,85)}
 }
 console.log("PSE_225_SOURCE_IMAGE_WAYBACK="+JSON.stringify(report.article225.archives));
 const images=report.article225.responses.filter(x=>x.validImage);
 report.article225.decision=images.length===2&&images[0].sha256===images[1].sha256?
  "EXACT_HTTP_TO_HTTPS_IMAGE_BYTES_EQUAL_CANDIDATE":
  images.length===1?"SINGLE_IMAGE_VERSION_NO_PROTOCOL_PARITY":
  "NO_CURRENT_HTTP_HTTPS_ORIGINAL_BINARY_EQUIVALENCE";
 report.summary={financialCaptureCandidates:report.financial.captures.length,
  financialPdfUrlProven:report.financial.decision==="ORIGINAL_DOCUMENT_URL_CANDIDATE_NEXT_VALIDATE_BINARY",
  originalImageHttpHttpsSameSha:report.article225.decision==="EXACT_HTTP_TO_HTTPS_IMAGE_BYTES_EQUAL_CANDIDATE",
  oldImageArchiveCaptures:report.article225.archives.reduce((a,x)=>a+x.originalImageSha256s.length,0),
  cmsWrites:0,noBuild:true,decisions:{financial:report.financial.decision,image:report.article225.decision}};
 console.log("PSE_1137_225_SOURCE_ORIGINAL_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-1137-225-original-source",{recursive:true});
 await writeFile("artifacts/pse-1137-225-original-source/report.json",JSON.stringify(report,null,2)+"\n");
 await page.close();await ctx.close();await net.close();await browser.close();
}
