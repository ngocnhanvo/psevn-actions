/** Independent read-only original Joomla article broken-thumbnail to original-gallery matching.
 * The crosscheck never writes CMS or accepts similar filenames as an exact match.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";

if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong source repository");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const references=[
 {id:205,count:10},
 {id:226,count:1},
 {id:227,count:11},
 {id:229,count:11},
 {id:230,count:2},
 {id:240,count:6},
 {id:321,count:5}
];
const originals=[
 {id:991,slug:"991-ngay-hoi-truyen-thong-2011"},
 {id:992,slug:"992-mau-bao-bi"},
 {id:993,slug:"993-ngay-truyen-thong"},
 {id:995,slug:"995-phu-nu-viet-nam"},
 {id:996,slug:"996-hoc-van-hoa-doanh-nghiep"},
 {id:997,slug:"997-truong-sa"}
];
if(state.schema!=="pse-legacy-article-migration-v1"||
 references.some(x=>state.articles[x.id]?.status!=="quarantined"||
 state.articles[x.id]?.reason!=="Original media HTTP 404"))
 throw Error("Original Joomla missing-image article identity changed");

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",r=>r.abort());
const network=await request.newContext({timeout:45000});
const report={schema:"pse-joomla-broken-thumbnail-original-gallery-crosscheck-v1",readOnly:true,articles:[],albums:[],summary:{}};
async function sourceMarkup(url){
 let raw=null;
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const r=await network.get(url,{timeout:45000,maxRedirects:2});
   if(r.status()!==200)throw Error("Original Joomla HTTP "+r.status());
   raw=await r.text();
   if(raw.length<250||raw.length>8000000)throw Error("Unexpected Joomla source HTML size");
   break;
  }catch(e){
   if(/Original Joomla HTTP 4/.test(String(e?.message||"")))throw e;
   if(attempt===3)throw e;
   console.warn("PSE_ORIGINAL_THUMB_SOURCE_GET_RETRY attempt="+attempt+
     " code="+String(e?.code||e?.name||"network").slice(0,30));
   await new Promise(resolve=>setTimeout(resolve,attempt*700));
  }
 }
 const p=await ctx.newPage();
 try{
  const inert=raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
  await p.setContent('<base href="'+url+'">'+inert,{waitUntil:"domcontentloaded",timeout:25000});
  return await p.evaluate(()=>{
   const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article,.blog")||document.body;
   const hrefs=[...root.querySelectorAll("a[href]")].map(e=>e.href).filter(x=>{
    try{const u=new URL(x);return u.hostname==="www.pse.vn"&&
      u.pathname.startsWith("/images/gallery/")&&/\.(?:jpe?g|png|webp)$/i.test(u.pathname)}catch{return false}
   });
   const thumbs=[...root.querySelectorAll("img[src]")].map(e=>e.src).filter(x=>{
    try{const u=new URL(x);return u.hostname==="www.pse.vn"&&
      u.pathname.startsWith("/images/web/gallery/")&&/\.(?:jpe?g|png|webp)$/i.test(u.pathname)}catch{return false}
   });
   const dates=[...document.querySelectorAll('time[datetime],meta[itemprop="datePublished"],meta[property="article:published_time"],dd.created,dd.published')].map(x=>
     (x.getAttribute("datetime")||x.getAttribute("content")||x.textContent||"").replace(/\s+/g," ").trim()).filter(Boolean).slice(0,7);
   return{title:(document.querySelector("h1,h2")?.textContent||"").replace(/\s+/g," ").trim(),
     hrefs:[...new Set(hrefs)],thumbs:[...new Set(thumbs)],dates};
  });
 }finally{await p.close()}
}
try{
 const albumLookup=new Map();
 for(const a of originals){
  const url="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/"+a.slug+".html";
  const html=await sourceMarkup(url);
  const item={id:a.id,url,title:html.title,originalImages:html.hrefs.length,
    sample:html.hrefs.slice(0,2)};
  if(html.hrefs.length<1)throw Error("Missing original album links "+a.id);
  for(const link of html.hrefs){
   if(albumLookup.has(link)&&albumLookup.get(link)!==a.id)
     throw Error("Ambiguous cross-album original URL "+link);
   albumLookup.set(link,a.id);
  }
  report.albums.push(item);
  console.log("PSE_SOURCE_ALBUM_FULL_RES="+JSON.stringify(item));
 }
 for(const a of references){
  const url=state.articles[a.id].source_url;
  if(!url.startsWith("https://www.pse.vn/"))throw Error("Article source hostname changed "+a.id);
  const dom=await sourceMarkup(url);
  if(dom.thumbs.length!==a.count)throw Error("Original Joomla source thumbnail count changed "+a.id+
   " expected="+a.count+" actual="+dom.thumbs.length);
  const matches=dom.thumbs.map(src=>{
   const u=new URL(src);
   const path=u.pathname.replace(/^\/images\/web\/gallery\//,"/images/gallery/");
   const original=new URL(path,src).href;
   return{brokenThumbnail:src,originalPhoto:original,
     exactSourceAlbumId:albumLookup.get(original)||null,
     filename:decodeURIComponent(u.pathname.split("/").at(-1)||"")};
  });
  const row={id:a.id,url,title:dom.title,images:matches.length,
   exactOriginalPhotoMatches:matches.filter(x=>x.exactSourceAlbumId!==null).length,
   dates:dom.dates,files:matches};
  report.articles.push(row);
  console.log("PSE_JOOMLA_THUMB_GALLERY_PROOF="+JSON.stringify({
   id:row.id,title:row.title,total:row.images,originalMatches:row.exactOriginalPhotoMatches,
   sourceAlbums:[...new Set(matches.map(x=>x.exactSourceAlbumId).filter(Boolean))],
   unmatched:matches.filter(x=>!x.exactSourceAlbumId).map(x=>x.filename),dateCandidates:row.dates}));
 }
 report.summary={articles:report.articles.length,
  originalAlbums:report.albums.length,
  originalThumbnailRefs:report.articles.reduce((n,x)=>n+x.images,0),
  exactGalleryImageMatches:report.articles.reduce((n,x)=>n+x.exactOriginalPhotoMatches,0),
  allImagesMappedArticles:report.articles.filter(x=>x.images===x.exactOriginalPhotoMatches).map(x=>x.id),
  partialOrUnmappedArticles:report.articles.filter(x=>x.images!==x.exactOriginalPhotoMatches).map(x=>x.id),
  wordPressWrites:0,noBuild:true};
 console.log("PSE_JOOMLA_THUMB_GALLERY_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-joomla-thumb-gallery-crosscheck",{recursive:true});
 await writeFile("artifacts/pse-joomla-thumb-gallery-crosscheck/report.json",JSON.stringify(report,null,2)+"\n");
 await network.dispose();await ctx.close();await browser.close();
}