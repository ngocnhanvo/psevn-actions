/** Exact original Joomla #202 single publisher image archive provenance. GET ONLY.
 * Alternate host/scheme captures are leads, not proof of original bytes.
 * No native CMS writes, no guessed replacement publication.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Unexpected source repo");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const item=state.articles?.["202"];
const source="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/202-hoi-thao-gioi-thieu-npk-phu-my-tai-binh-phuoc.html";
const image="http://baobinhphuoc.com.vn/resources/newsimg/Nam%202011/8-2011/14/congty.jpg";
if(state.schema!=="pse-legacy-article-migration-v1"||item?.source_url!==source||
  !item?.status?.includes("quarantined"))throw Error("Original Joomla 202 source identity changed");
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:40000});
const summary={schema:"pse-202-historical-publisher-variant-evidence-v1",sourceId:202,readOnly:true,
 noCmsWrites:true,noBuild:true,source,originalImage:image,headline:null,textChars:null,
 created:null,variants:[],verifiedExactOriginalArchives:0,sourceOriginalStatus:null,verdict:"UNVERIFIED"};
try{
 const sourceCtx=await browser.newContext({javaScriptEnabled:false});
 await sourceCtx.route("**/*",r=>r.abort());
 const original=await net.get(source,{timeout:65000,maxRedirects:2});
 if(original.status()!==200)throw Error("Joomla source HTTP "+original.status());
 const html=await original.text();
 const page=await sourceCtx.newPage();
 await page.setContent('<base href="'+source+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
 const dom=await page.evaluate(()=>{
  const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page")||document.querySelector("article");
  const norm=s=>String(s||"").replace(/\s+/g," ").trim();
  return {title:norm(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent),
   body:norm(root?.textContent||""),images:[...root.querySelectorAll("img[src]")].map(x=>x.src)};
 });
 if(dom.title.length<12||dom.body.length<250||dom.images.length!==1||dom.images[0]!==image)
  throw Error("Original article #202 body/one external image changed");
 summary.headline=dom.title;summary.textChars=dom.body.length;
 await sourceCtx.close();
 const dateCtx=await browser.newContext({viewport:{width:1366,height:850}});
 await dateCtx.route(/\.(?:png|jpe?g|webp|svg|gif|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
 const datePage=await dateCtx.newPage();
 try{summary.created=await searchDate(datePage,{id:202,sourceUrl:source,title:dom.title,opening:dom.body.slice(0,320)})}
 finally{await dateCtx.close()}
 const originalURL=new URL(image);
 const hosts=["baobinhphuoc.com.vn","www.baobinhphuoc.com.vn"];
 for(const scheme of ["http:","https:"])for(const host of hosts){
  const u=new URL(image);u.protocol=scheme;u.hostname=host;
  if(u.pathname!==originalURL.pathname)throw Error("Unexpected publisher variant path");
  const variant={url:u.href,exactOriginal:u.href===image,indexHttp:null,reason:null,candidates:[]};
  try{
   const cdx=new URL("https://web.archive.org/cdx/search/cdx");
   cdx.searchParams.set("url",u.href);cdx.searchParams.set("output","json");
   cdx.searchParams.set("fl","timestamp,original,statuscode,mimetype,digest");
   cdx.searchParams.set("filter","statuscode:200");cdx.searchParams.set("collapse","digest");
   cdx.searchParams.set("limit","6");
   const response=await net.get(cdx.href,{timeout:35000,maxRedirects:0,failOnStatusCode:false});
   variant.indexHttp=response.status();
   if(response.status()!==200){variant.reason="CDX_HTTP_"+response.status();summary.variants.push(variant);continue}
   let rows;try{rows=JSON.parse((await response.text()).slice(0,120000))}catch{variant.reason="CDX_NOT_JSON";summary.variants.push(variant);continue}
   if(!Array.isArray(rows)||!Array.isArray(rows[0])||rows[0][0]!=="timestamp"){
    variant.reason="CDX_NO_CAPTURES";summary.variants.push(variant);continue
   }
   for(const rec of rows.slice(1,4)){
    const [timestamp,archivedOriginal,status,mime,indexDigest]=rec;
    const historic=new URL(String(archivedOriginal||""));
    if(!/^\d{14}$/.test(String(timestamp))||Number(String(timestamp).slice(0,4))>2026||
       !["http:","https:"].includes(historic.protocol)||historic.hostname!==host||
       historic.pathname!==u.pathname||historic.search||historic.hash||String(status)!=="200")continue;
    const capture="https://web.archive.org/web/"+timestamp+"id_/"+archivedOriginal;
    const record={time:timestamp,sourceUrl:archivedOriginal,indexDigest,mime,bytes:null,sha256:null,
      http:null,bytesVerified:false,error:null};
    try{
     const get=await net.get(capture,{timeout:35000,maxRedirects:0,failOnStatusCode:false});
     const body=await get.body(),ct=String(get.headers()["content-type"]||"").toLowerCase().split(";")[0];
     record.http=get.status();record.responseMime=ct;record.bytes=body.length;
     if(record.http===200&&ct==="image/jpeg"&&body.length>=256&&body.length<10*1024*1024&&
        body.subarray(0,2).toString("hex")==="ffd8"&&body.subarray(-2).toString("hex")==="ffd9"){
      record.sha256=createHash("sha256").update(body).digest("hex");record.bytesVerified=true;
      if(variant.exactOriginal)summary.verifiedExactOriginalArchives++;
     }
    }catch(e){record.error=String(e?.code||e?.name||"network").slice(0,100)}
    variant.candidates.push(record);
   }
   variant.reason=variant.candidates.some(x=>x.bytesVerified)?(variant.exactOriginal?"EXACT_ORIGINAL_URL_ARCHIVE_BYTES":"PUBLISHER_HOST_ALIAS_CANDIDATE_ONLY"):"NO_VERIFIED_JPEG_CAPTURE";
  }catch(e){variant.reason="ARCHIVE_NETWORK_UNAVAILABLE";variant.error=String(e?.code||e?.name||"network").slice(0,120)}
  summary.variants.push(variant);
  console.log("PSE_202_PUBLISHER_VARIANT="+JSON.stringify({url:variant.url,indexHttp:variant.indexHttp,reason:variant.reason,
   captures:variant.candidates.map(x=>({time:x.time,sourceUrl:x.sourceUrl,bytes:x.bytes,sha256:x.sha256,bytesVerified:x.bytesVerified}))}));
 }
 summary.verdict=summary.verifiedExactOriginalArchives?"EXACT_PUBLISHER_ORIGINAL_ARCHIVED_BYTES_PROVEN":"NO_EXACT_PUBLISHER_ORIGINAL_ARCHIVED_BYTES";
 console.log("PSE_202_PUBLISHER_SOURCE_SUMMARY="+JSON.stringify({sourceId:202,title:dom.title,textChars:dom.body.length,
  sourceCreatedDay:summary.created?.day||null,sourceDateProof:summary.created?.source||null,
  exactOriginalArchiveCaptures:summary.verifiedExactOriginalArchives,variantLeads:summary.variants.filter(x=>x.reason==="PUBLISHER_HOST_ALIAS_CANDIDATE_ONLY").length,
  verdict:summary.verdict,readOnly:true,noCmsWrites:true}));
}finally{
 await mkdir("artifacts/pse-original-202-publisher",{recursive:true});
 await writeFile("artifacts/pse-original-202-publisher/evidence.json",JSON.stringify(summary,null,2)+"\n");
 await net.dispose();await browser.close();
}
