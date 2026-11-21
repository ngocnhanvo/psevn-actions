/** Joomla #382's exact three original image URLs, archive evidence only.
 * No CMS changes, no image substitutions, no guessed media provenance.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const manifest=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const article=manifest.articles?.["382"];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 manifest.schema!=="pse-legacy-article-migration-v1"||!manifest.backup_verified||
 article?.status!=="quarantined"||article.reason!=="Original media HTTP 404"||
 !article.source_url?.startsWith("https://www.pse.vn/")||
 !new URL(article.source_url).pathname.endsWith(
 "/382-pvfcco-se-to-chuc-thanh-cong-chuyen-du-lich-chau-au-cho-khach-hang-tieu-bieu-cua-cong-ty.html"))
 throw Error("Original article #382 identity changed");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",r=>r.abort());
const report={schema:"pse-382-three-exact-original-media-archive-v1",
 sourceId:382,source:article.source_url,readOnly:true,noCmsWrites:true,noBuild:true,
 imageCount:null,images:[],status:"NO_EXACT_SOURCE_IMAGES_VERIFIED"};
const cap=8*1024*1024,arcOrigin="https://web.archive.org";
async function archiveGet(u,timeout=17000){
 const url=new URL(u);
 if(url.origin!==arcOrigin||url.username||url.password)throw Error("Invalid archive host");
 return fetch(url.href,{signal:AbortSignal.timeout(timeout),redirect:"manual"});
}
const expected=[
 "/images/web/%C3%81o_2.JPG",
 "/images/web/Ba_Lan.JPG",
 "/images/web/M%E1%BB%8F_mu%E1%BB%91i_Wieliczka_d%C6%B0%E1%BB%9Bi_m%E1%BA%B7t_%C4%91%E1%BA%A5t_135m_-_Ba_lan.JPG"
].sort();
try{
 const res=await fetch(article.source_url,{signal:AbortSignal.timeout(26000)});
 if(res.status!==200)throw Error("Original Joomla source HTTP "+res.status);
 const html=await res.text();
 if(html.length<500||html.length>7000000)throw Error("Source article HTML changed");
 const page=await ctx.newPage();
 let images;
 try{
  await page.setContent('<base href="'+article.source_url+'">'+
   html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),
   {waitUntil:"domcontentloaded",timeout:18000});
  images=await page.evaluate(()=>{
   const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article");
   if(!root)throw Error("Original articleBody missing");
   return [...new Set([...root.querySelectorAll("img[src]")].map(el=>{
    try{const url=new URL(el.getAttribute("src"),document.baseURI);
     return url.hostname==="www.pse.vn"&&url.pathname.startsWith("/images/web/")?
      url.pathname:null;
    }catch{return null}
   }).filter(Boolean))].sort();
  });
 }finally{await page.close()}
 report.imageCount=images.length;
 if(JSON.stringify(images)!==JSON.stringify(expected))throw Error("Source original three filename identities changed");
 for(let i=0;i<images.length;i++){
  const pathname=images[i];
  const photo={index:i,originalPath:pathname,originalUrl:"https://www.pse.vn"+pathname,
   originalRequired:true,archiveIndex:[],captures:[],sha256:null,verifiedImage:false,
   decision:"ORIGINAL_ARCHIVE_IMAGE_NOT_PROVEN"};
  report.images.push(photo);
  const variants=["http://www.pse.vn","https://www.pse.vn","http://pse.vn","https://pse.vn"]
   .map(host=>host+pathname);
  const candidates=new Map();
  for(const variant of variants){
   const query=new URL(arcOrigin+"/cdx/search/cdx");
   for(const [key,val] of Object.entries({url:variant,output:"json",
    fl:"timestamp,original,statuscode,mimetype",
    filter:"statuscode:200",collapse:"digest",limit:"10"}))
    query.searchParams.set(key,val);
   const index={url:variant,http:null,found:0,error:null};
   photo.archiveIndex.push(index);
   try{
    const r=await archiveGet(query.href);
    index.http=r.status;
    if(r.status!==200)continue;
    const response=await r.text();
    if(response.length>80000)continue;
    const rows=JSON.parse(response);
    if(!Array.isArray(rows)||rows[0]?.[0]!=="timestamp")continue;
    for(const [stamp,original,status,mime] of rows.slice(1)){
     if(!/^\d{14}$/.test(String(stamp))||stamp.slice(0,8)>"20261121"||
      String(status)!=="200")continue;
     let url;try{url=new URL(original)}catch{continue}
     const canonical=new URL(photo.originalUrl);
     if(!["www.pse.vn","pse.vn"].includes(url.hostname)||
      url.pathname!==canonical.pathname||url.search||url.hash)continue;
     const key=stamp+"|"+original;
     if(!candidates.has(key)){candidates.set(key,{stamp,original,mime});index.found++}
    }
   }catch(e){index.error=String(e?.name||"network").slice(0,70)}
   console.log("PSE_382_IMAGE_ARCHIVE_INDEX="+JSON.stringify({index:i,http:index.http,found:index.found,error:index.error}));
  }
  for(const lead of [...candidates.values()].sort((a,b)=>a.stamp.localeCompare(b.stamp)).slice(0,9)){
   const row={stamp:lead.stamp,sourceUrl:lead.original,http:null,mime:null,
    bytes:null,validJpeg:false,sha256:null};
   photo.captures.push(row);
   try{
    const response=await archiveGet(arcOrigin+"/web/"+lead.stamp+"id_/"+lead.original,20000);
    row.http=response.status;
    row.mime=String(response.headers.get("content-type")||"").toLowerCase().split(";")[0];
    if(row.http!==200||row.mime!=="image/jpeg"||
     Number(response.headers.get("content-length")||0)>cap)continue;
    const bytes=Buffer.from(await response.arrayBuffer());
    row.bytes=bytes.length;
    row.validJpeg=bytes.length>256&&bytes.length<=cap&&
     bytes.subarray(0,3).toString("hex")==="ffd8ff"&&
     bytes.subarray(-2).toString("hex")==="ffd9";
    if(row.validJpeg){
     row.sha256=createHash("sha256").update(bytes).digest("hex");
     photo.sha256=row.sha256;photo.verifiedImage=true;
     photo.decision="EXACT_ORIGINAL_ARCHIVED_JPEG_VERIFIED";
     const directory="artifacts/pse-382-archive/exact-images";
     await mkdir(directory,{recursive:true});
     await writeFile(directory+"/source-image-"+(i+1)+".jpg",bytes);
     break;
    }
   }catch(e){row.error=String(e?.name||"network").slice(0,70)}
  }
  console.log("PSE_382_IMAGE_ARCHIVE_RESULT="+JSON.stringify({index:i,
   originalPath:photo.originalPath,indexedCaptures:candidates.size,
   verifiedImage:photo.verifiedImage,sha256:photo.sha256,decision:photo.decision}));
 }
 const matched=report.images.filter(x=>x.verifiedImage).length;
 report.status=matched===3?"ALL_THREE_EXACT_SOURCE_IMAGES_VERIFIED":
  matched>0?"PARTIAL_EXACT_SOURCE_IMAGES_VERIFIED":"NO_EXACT_SOURCE_IMAGES_VERIFIED";
 console.log("PSE_382_ORIGINAL_MEDIA_SUMMARY="+JSON.stringify({
  sourceId:382,expected:3,verifiedExactImages:matched,status:report.status,readOnly:true,noCmsWrites:true,noBuild:true}));
}finally{
 await mkdir("artifacts/pse-382-archive",{recursive:true});
 await writeFile("artifacts/pse-382-archive/report.json",JSON.stringify(report,null,2)+"\n");
 await ctx.close();await browser.close();
}
