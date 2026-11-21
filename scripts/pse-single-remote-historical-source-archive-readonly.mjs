/** READ ONLY exact original-source archive evidence for four single-image Joomla Articles. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repo");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Invalid Joomla checkpoint");
const cases=[
 {id:202,host:"baobinhphuoc.com.vn"},
 {id:344,host:"nongnghiep.vn"},
 {id:348,host:"www.thesaigontimes.vn"},
 {id:370,host:"nongnghiep.vn"}
];
const browser=await chromium.launch({headless:true});
const parse=await browser.newContext({javaScriptEnabled:false});
await parse.route("**/*",r=>r.abort());
const dateContext=await browser.newContext();
await dateContext.route(/\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const net=await request.newContext({timeout:48000});
const sha=b=>createHash("sha256").update(b).digest("hex");
const report={schema:"pse-four-single-original-image-archive-evidence-v1",readOnly:true,noCmsWrites:true,rows:[]};
try{
 for(const t of cases){
  const item=state.articles[t.id],row={sourceId:t.id,source:item?.source_url,http:null,title:null,
   originalImages:[],archiveCaptures:[],createdDay:null,decision:"SOURCE_REVIEW",errors:[]};
  report.rows.push(row);
  if(item?.status!=="quarantined"||item?.reason!=="Article contains non-local mandatory media"||
   !item.source_url?.startsWith("https://www.pse.vn/"))
   throw Error("Unexpected Joomla source ID/state "+t.id);
  const source=await net.get(item.source_url,{maxRedirects:2,failOnStatusCode:false});
  row.http=source.status();if(row.http!==200){row.errors.push("ORIGINAL_SOURCE_HTTP_"+row.http);continue}
  const html=await source.text();
  const p=await parse.newPage();
  let d;
  try{
   await p.setContent('<base href="'+item.source_url+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
   d=await p.evaluate(()=>{
    const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page")||document.querySelector("article");
    if(!root)return null;
    const n=x=>String(x||"").replace(/\s+/g," ").trim();
    const imgs=[...root.querySelectorAll("img[src]")].map(x=>x.src);
    const photos=[...root.querySelectorAll("a[href]")].map(x=>x.href).filter(s=>/\.(?:jpe?g|png|gif|webp)(?:\?|$)/i.test(s));
    return{title:n(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent),body:n(root.textContent),imgs,photos};
   });
  }finally{await p.close()}
  if(!d||d.body.length<100||!d.title){row.errors.push("SOURCE_BODY_NOT_PROVEN");continue}
  row.title=d.title;row.bodyChars=d.body.length;
  const originals=[...new Set([...d.imgs,...d.photos])];
  if(originals.length!==1||new URL(originals[0]).hostname!==t.host||
   !/\.jpe?g$/i.test(new URL(originals[0]).pathname)){
   row.errors.push("NOT_SINGLE_ORIGINAL_JPEG");row.originalImages=originals;continue;
  }
  row.originalImages=originals;
  const query=new URL("https://web.archive.org/cdx/search/cdx");
  query.searchParams.set("url",originals[0]);
  query.searchParams.set("output","json");
  query.searchParams.set("fl","timestamp,original,statuscode,mimetype,digest");
  query.searchParams.set("filter","statuscode:200");
  query.searchParams.set("limit","4");
  query.searchParams.set("collapse","digest");
  try{
   const response=await net.get(query.href,{timeout:22000,failOnStatusCode:false,maxRedirects:0});
   row.indexHTTP=response.status();
   if(response.status()!==200){row.errors.push("ARCHIVE_INDEX_HTTP_"+response.status());continue}
   const raw=await response.text();
   if(raw.length>100000){row.errors.push("ARCHIVE_INDEX_OVERSIZE");continue}
   let arr;
   try{arr=JSON.parse(raw)}catch{row.errors.push("ARCHIVE_INDEX_NOT_JSON");continue}
   if(!Array.isArray(arr)||arr[0]?.[0]!=="timestamp"){row.errors.push("NO_VERIFIED_SOURCE_CAPTURE");continue}
   for(const entry of arr.slice(1,5)){
    const [ts,src,status,mime]=entry;
    if(!/^\d{14}$/.test(String(ts))||String(ts).slice(0,8)>"20261121"||
     status!=="200"||new URL(src).hostname!==t.host||
     new URL(src).pathname!==new URL(originals[0]).pathname)continue;
    const archive="https://web.archive.org/web/"+ts+"id_/"+src;
    let response;
    try{response=await net.get(archive,{timeout:30000,maxRedirects:0,failOnStatusCode:false})}
    catch(e){row.archiveCaptures.push({timestamp:ts,error:String(e?.name||"network"),sourceUrl:src});continue}
    const type=String(response.headers()["content-type"]||"").toLowerCase().split(";")[0];
    const b=response.status()===200&&type==="image/jpeg"?await response.body():null;
    const valid=!!b&&b.length>=256&&b.length<=12_000_000&&
     b.subarray(0,2).toString("hex")==="ffd8"&&b.subarray(-2).toString("hex")==="ffd9";
    row.archiveCaptures.push({timestamp:ts,sourceUrl:src,indexMime:mime,http:response.status(),mime:type,
      bytes:b?.length||null,sha256:b?sha(b):null,valid});
    if(valid)break;
   }
  }catch(e){row.errors.push("ARCHIVE_LOOKUP_TRANSPORT_"+String(e?.name||"network"))}
  if(row.archiveCaptures.some(c=>c.valid)){
   const p=await dateContext.newPage();
   try{
    const proof=await searchDate(p,{id:t.id,sourceUrl:item.source_url,title:d.title,opening:d.body.slice(0,350)});
    row.createdDay=proof.source==="joomla_com_search_created"?proof.day:null;
    row.dateSource=proof.source;
   }finally{await p.close()}
  }
  row.decision=row.archiveCaptures.some(c=>c.valid)&&row.createdDay?
   "ONE_EXACT_SOURCE_ARCHIVE_IMAGE_AND_DAY_CANDIDATE":
   row.archiveCaptures.some(c=>c.valid)?"ORIGINAL_ARCHIVE_IMAGE_DAY_UNVERIFIED":"ORIGINAL_ARCHIVE_IMAGE_NOT_FOUND";
  console.log("PSE_SINGLE_REMOTE_ARCHIVE_ROW="+JSON.stringify({id:row.sourceId,title:row.title,
   src:row.originalImages,day:row.createdDay,archive:row.archiveCaptures,
   decision:row.decision,errors:row.errors}).slice(0,4500));
 }
 const summary={sources:4,ready:report.rows.filter(r=>r.decision==="ONE_EXACT_SOURCE_ARCHIVE_IMAGE_AND_DAY_CANDIDATE").map(r=>r.sourceId),
  mediaOnly:report.rows.filter(r=>r.decision==="ORIGINAL_ARCHIVE_IMAGE_DAY_UNVERIFIED").map(r=>r.sourceId),
  blocked:report.rows.filter(r=>!r.decision.includes("CANDIDATE")&&r.decision!=="ORIGINAL_ARCHIVE_IMAGE_DAY_UNVERIFIED").map(r=>r.sourceId),
  readOnly:true,noCmsWrites:true};
 console.log("PSE_SINGLE_REMOTE_ARCHIVE_SUMMARY="+JSON.stringify(summary));
}finally{
 await mkdir("artifacts/pse-single-remote-archive",{recursive:true});
 await writeFile("artifacts/pse-single-remote-archive/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await parse.close();await dateContext.close();await browser.close();
}
