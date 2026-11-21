/** Read-only exact original media status, not a license to replace files or publish. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const ids=[114,121,127,178,186,196,198,202,204,237,344,348,370,1090];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 ids.some(id=>state.articles?.[id]?.status!=="quarantined"||
  state.articles[id].reason!=="Article contains non-local mandatory media"))
 throw Error("Unexpected PSE source inventory or original source flags");
const browser=await chromium.launch({headless:true});
const parseCtx=await browser.newContext({javaScriptEnabled:false});
await parseCtx.route("**/*",r=>r.abort());
const dateCtx=await browser.newContext({javaScriptEnabled:false});
await dateCtx.route(/\.(?:jpe?g|png|webp|gif|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const net=await request.newContext({timeout:35000});
const report={schema:"pse-fourteen-remote-article-original-media-source-readonly-v1",readOnly:true,noCmsWrites:true,noBuild:true,rows:[]};
const maxBytes=14*1024*1024;
const sha=b=>createHash("sha256").update(b).digest("hex");
const eligible=(u)=>{const x=new URL(u);return ["https:","http:"].includes(x.protocol)&&
 !x.username&&!x.password&&!x.hash&&!x.searchParams.has("token")};
const validBinary=(bytes,mime,url)=>{
 const ext=new URL(url).pathname.split(".").at(-1).toLowerCase();
 const magic=bytes.subarray(0,8).toString("hex");
 if(bytes.length<100)return false;
 if(["jpg","jpeg"].includes(ext))return mime.startsWith("image/")&&magic.startsWith("ffd8ff");
 if(ext==="png")return mime.startsWith("image/")&&magic==="89504e470d0a1a0a";
 if(ext==="gif")return mime.startsWith("image/")&&["GIF89a","GIF87a"].includes(bytes.subarray(0,6).toString("latin1"));
 if(ext==="webp")return mime.startsWith("image/")&&magic.startsWith("52494646")&&bytes.toString("latin1",8,12)==="WEBP";
 if(ext==="pdf")return mime==="application/pdf"&&bytes.subarray(0,5).toString("latin1")==="%PDF-";
 return false;
};
try{
 // Strict bounded per-source requests; no CMS, no guessed filenames.
 for(const id of ids){
  const item=state.articles[id],url=item.source_url;
  const row={id,source:url,http:null,title:null,bodyChars:0,mandatory:[],externalCount:0,localMediaCount:0,
   exactMediaReady:false,sourceCreatedDay:null,sourceDateEvidence:null,sourceDateAttempts:[],
   decision:"BLOCKED",error:null};
  report.rows.push(row);
  try{
   const u=new URL(url);
   if(u.protocol!=="https:"||u.hostname!=="www.pse.vn"||!new RegExp("/"+id+"-[^/]+\\.html$","i").test(u.pathname))
    throw Error("Unexpected Joomla original source identity");
   const response=await net.get(url,{timeout:48000,maxRedirects:2});
   row.http=response.status();
   if(row.http!==200)throw Error("Joomla original HTTP "+row.http);
   const html=await response.text();
   if(html.length<300||html.length>8_000_000)throw Error("Unsafe source HTML bytes");
   const page=await parseCtx.newPage();
   let parsed;
   try{
    await page.setContent('<base href="'+url+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
    parsed=await page.evaluate(()=>{
     const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page")||
      document.querySelector("article");
     if(!root)return null;
     const title=(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||document.title||"").replace(/\s+/g," ").trim();
     const body=(root.textContent||"").replace(/\s+/g," ").trim();
     const sources=[];
     for(const e of root.querySelectorAll("img[src],video[src],audio[src],iframe[src],object[data],embed[src],source[src],a[href]")){
      const attr=e.getAttribute("src")||e.getAttribute("data")||e.getAttribute("href");
      if(!attr)continue;
      let abs;try{abs=new URL(attr,document.baseURI)}catch{continue}
      if(!["https:","http:"].includes(abs.protocol))continue;
      const media=/\.(?:jpe?g|png|gif|webp|pdf)(?:$|\?)/i.test(abs.pathname);
      if(e.tagName==="A"&&!media)continue;
      sources.push({tag:e.tagName.toLowerCase(),url:abs.href,external:!["www.pse.vn","pse.vn"].includes(abs.hostname),mediaExtension:media});
     }
     return{title,body,bodysample:body.slice(0,280),sources:[...new Map(sources.map(r=>[r.tag+":"+r.url,r])).values()]};
    });
   }finally{await page.close()}
   if(!parsed||parsed.body.length<60||parsed.title.length<8)throw Error("Joomla source article malformed");
   row.title=parsed.title;row.bodyChars=parsed.body.length;row.bodySample=parsed.bodysample;
   row.externalCount=parsed.sources.filter(x=>x.external).length;
   row.localMediaCount=parsed.sources.filter(x=>!x.external).length;
   if(parsed.sources.length>12){
    row.decision="SOURCE_HAS_TOO_MANY_MEDIA_REVIEW";continue;
   }
   for(const p of parsed.sources){
    const media={tag:p.tag,originalUrl:p.url,external:p.external,http:null,mime:null,bytes:null,sha256:null,
      originalBytesValid:false,reason:null,redirectHost:null};
    if(!eligible(p.url)){media.reason="SOURCE_URL_UNTRUSTED";row.mandatory.push(media);continue}
    if(!p.mediaExtension){media.reason="EMBEDDED_NONFILE_MEDIA_REVIEW";row.mandatory.push(media);continue}
    try{
     const response=await net.get(p.url,{timeout:22000,maxRedirects:2,failOnStatusCode:false});
     media.http=response.status();media.mime=String(response.headers()["content-type"]||"").toLowerCase().split(";")[0];
     media.redirectHost=new URL(response.url()).hostname;
     const len=Number(response.headers()["content-length"]||0);
     if(len>maxBytes){media.reason="ORIGINAL_FILE_OVERSIZED";row.mandatory.push(media);continue}
     if(media.http===200){
      const bytes=await response.body();
      media.bytes=bytes.length;
      if(bytes.length<=maxBytes){
       media.sha256=sha(bytes);
       media.originalBytesValid=validBinary(bytes,media.mime,p.url)&&
        media.redirectHost===new URL(p.url).hostname&&
        bytes.length>=150;
      }
     }
     media.reason=media.originalBytesValid?"ORIGINAL_SOURCE_BYTES_VERIFIED":
      "ORIGINAL_BINARY_UNVERIFIED";
    }catch(e){media.reason="ORIGINAL_GET_FAILED";media.error=String(e?.name||e?.code||"network").slice(0,120)}
    row.mandatory.push(media);
   }
   row.exactMediaReady=row.mandatory.length>0&&row.mandatory.every(x=>x.originalBytesValid);
   if(row.exactMediaReady){
    const datePage=await dateCtx.newPage();
    let date;
    try{date=await searchDate(datePage,{id,sourceUrl:url,title:row.title,opening:parsed.body.slice(0,330)})}
    finally{await datePage.close()}
    row.sourceCreatedDay=date?.source==="joomla_com_search_created"?date.day:null;
    row.sourceDateEvidence=date?.source||null;
    row.sourceDateAttempts=date?.day?[]:(date?.attempts||[]);
   }
   row.decision=row.exactMediaReady&&row.sourceCreatedDay?
    "ORIGINAL_CONTENT_MEDIA_AND_CREATED_DAY_CANDIDATE":
    row.exactMediaReady?"ORIGINAL_MEDIA_VERIFIED_DATE_UNKNOWN":
    row.mandatory.length?"ORIGINAL_MEDIA_NOT_ALL_VERIFIED":"SOURCE_MEDIA_NOT_PRESENT_REVIEW";
  }catch(e){row.error=String(e?.message||e).slice(0,180)}
  console.log("PSE_14_NONLOCAL_ORIGINAL_ROW="+JSON.stringify({id:row.id,http:row.http,title:row.title,
   originalMedia:row.mandatory.length,externalCount:row.externalCount,
   validatedMedia:row.mandatory.filter(m=>m.originalBytesValid).length,
   sources:row.mandatory.map(m=>({tag:m.tag,path:new URL(m.originalUrl).pathname,host:new URL(m.originalUrl).hostname,
    http:m.http,mime:m.mime,bytes:m.bytes,sha256:m.sha256,reason:m.reason})).slice(0,12),
   sourceCreatedDay:row.sourceCreatedDay,decision:row.decision,error:row.error}));
 }
 report.summary={targetCount:14,source200:report.rows.filter(r=>r.http===200).length,
  originalMediaReady:report.rows.filter(r=>r.exactMediaReady).map(r=>r.id),
  readyWithSourceDate:report.rows.filter(r=>r.decision==="ORIGINAL_CONTENT_MEDIA_AND_CREATED_DAY_CANDIDATE").map(r=>r.id),
  stillBlocked:report.rows.filter(r=>r.decision!=="ORIGINAL_CONTENT_MEDIA_AND_CREATED_DAY_CANDIDATE").map(r=>r.id),
  readOnly:true,noCmsWrites:true};
 console.log("PSE_14_NONLOCAL_ORIGINAL_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-nonlocal-fourteen",{recursive:true});
 await writeFile("artifacts/pse-nonlocal-fourteen/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await parseCtx.close();await dateCtx.close();await browser.close();
}
