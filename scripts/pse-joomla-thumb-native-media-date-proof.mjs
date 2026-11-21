/** Read-only independent Joomla article + original gallery → WordPress Media and created-day proof.
 * A matching thumbnail basename is NOT sufficient; exact full-size Joomla URL,
 * source-derived WP Media slug/filename and source ID/title created date are required.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repo");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const refs=[
 {id:205,count:10,album:991}, {id:226,count:1,album:992},
 {id:227,count:11,album:993},{id:229,count:11,album:995},
 {id:230,count:2,album:997},{id:240,count:6,album:996},
 {id:321,count:5,album:997}
];
const albums=new Map([
 [991,"991-ngay-hoi-truyen-thong-2011"],[992,"992-mau-bao-bi"],
 [993,"993-ngay-truyen-thong"],[995,"995-phu-nu-viet-nam"],
 [996,"996-hoc-van-hoa-doanh-nghiep"],[997,"997-truong-sa"]
]);
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 refs.some(r=>state.articles[r.id]?.status!=="quarantined"||
  state.articles[r.id]?.reason!=="Original media HTTP 404"||
  state.articles[r.id]?.group_hint!=="company"))
 throw Error("Original source identity and CMS backup guard changed");
const config=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const vars=config.filter(x=>x.startsWith("WC_URL="));
if(vars.length!==1)throw Error("Missing unique WP origin");
const u=new URL(vars[0].slice("WC_URL=".length).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid WP origin");
const wp=u.origin;
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1320,height:820},javaScriptEnabled:false});
const datesContext=await browser.newContext({viewport:{width:1320,height:820}});
await ctx.route("**/*",r=>r.abort());
await datesContext.route(/\.(?:png|jpe?g|webp|svg|gif|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const net=await request.newContext({timeout:40000});
const report={schema:"pse-seven-original-joomla-articles-native-media-dates-v1",readOnly:true,rows:[],summary:{}};
async function get(url){
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const r=await net.get(url,{timeout:40000,maxRedirects:2});
   if(r.status()===200)return await r.text();
   if(r.status()<500)throw Error("Source HTTP "+r.status()+" "+new URL(url).pathname);
  }catch(e){
   if(attempt===3)throw e;
   if(/Source HTTP 4/.test(String(e?.message||"")))throw e;
   console.warn("PSE_SOURCE_DATE_MEDIA_GET_RETRY attempt="+attempt+" code="+String(e?.code||e?.name||"network").slice(0,40));
  }
  await new Promise(resolve=>setTimeout(resolve,attempt*750));
 }
 throw Error("Original HTML fetch exhausted");
}
async function extract(url){
 const html=await get(url);
 if(html.length<200||html.length>8000000)throw Error("Untrusted original source body size");
 const page=await ctx.newPage();
 try{
  await page.setContent('<base href="'+url+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded",timeout:25000});
  return await page.evaluate(()=>{
   const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article")||document.body;
   const imgs=[...new Set([...root.querySelectorAll("img[src]")].map(i=>i.src))].filter(x=>{
    try{return new URL(x).hostname==="www.pse.vn"&&
     new URL(x).pathname.startsWith("/images/web/gallery/")}catch{return false}
   });
   const hrefs=[...new Set([...root.querySelectorAll("a[href]")].map(i=>i.href))].filter(x=>{
    try{return new URL(x).hostname==="www.pse.vn"&&
     new URL(x).pathname.startsWith("/images/gallery/")}catch{return false}
   });
   return{title:(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||"").replace(/\s+/g," ").trim(),
     body:(root?.textContent||"").replace(/\s+/g," ").trim().slice(0,340),
     imgs,hrefs};
  });
 }finally{await page.close()}
}
async function wpGet(path){
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const r=await net.get(wp+path,{timeout:35000,maxRedirects:0});
   if(r.status()===200)return await r.json();
   if(r.status()<500)throw Error("WP REST read HTTP "+r.status());
  }catch(e){
   if(attempt===3)throw e;
   if(/WP REST read HTTP 4/.test(String(e?.message||"")))throw e;
   console.warn("PSE_WP_MEDIA_READ_RETRY attempt="+attempt+" reason="+String(e?.code||e?.name||"network").slice(0,35));
  }
  await new Promise(resolve=>setTimeout(resolve,attempt*600));
 }
 throw Error("WordPress REST read exhausted");
}
try{
 const originalGalleryLinks=new Map();
 for(const [id,slug] of albums){
  const path="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/"+slug+".html";
  const d=await extract(path);
  if(!d.hrefs.length)throw Error("No source image links for "+id);
  originalGalleryLinks.set(id,new Set(d.hrefs));
  console.log("PSE_THUMB_NATIVE_SOURCE_ALBUM="+JSON.stringify({id,images:d.hrefs.length}));
 }
 for(const {id,count,album} of refs){
  const source=state.articles[id].source_url;
  if(!source.startsWith("https://www.pse.vn/"))throw Error("Legacy article source changed "+id);
  const d=await extract(source);
  if(d.imgs.length!==count||d.body.length<40||!d.title)throw Error("Joomla article changed or blank "+id);
  const originalSlugs=[...new Set(d.imgs.map(x=>{
   const u=new URL(x);return u.pathname.replace(/^\/images\/web\/gallery\//,"/images/gallery/");
  }))];
  if(originalSlugs.length!==count)throw Error("Duplicated original source thumbnails "+id);
  const media=[];
  for(const thumb of d.imgs){
   const parsed=new URL(thumb),full=new URL(parsed.pathname.replace(/^\/images\/web\/gallery\//,"/images/gallery/"),parsed.origin).href;
   if(!originalGalleryLinks.get(album)?.has(full))throw Error("Joomla article original file not found in exact source gallery id="+id+" name="+full);
   const marker="pse-gallery-"+album+"-"+createHash("sha256").update(full).digest("hex").slice(0,16);
   const ext=new URL(full).pathname.split(".").at(-1).toLowerCase().replace("jpeg","jpg");
   const filename=marker+"."+ext;
   const rows=await wpGet("/wp-json/wp/v2/media?search="+encodeURIComponent(marker)+
    "&per_page=50&_fields=id,slug,source_url,mime_type,media_details");
   if(!Array.isArray(rows))throw Error("WP Media registry unavailable");
   const matched=rows.filter(x=>x.slug===marker&&String(x.media_details?.file||"").split("/").at(-1)===filename);
   if(matched.length>1)throw Error("Duplicate WordPress media identity "+marker);
   const m=matched[0]||null;
   media.push({thumb,sourceOriginal:full,albumId:album,marker,
     wpMediaId:m?.id||null,wpMediaUrl:m?.source_url||null,
     wpFile:m?.media_details?.file||null,wpMime:m?.mime_type||null});
  }
  const slug=new URL(source).pathname.split("/").at(-1).replace(/^\d+-/,"").replace(/\.html$/,"");
  const posts=await wpGet("/wp-json/wp/v2/posts?slug="+encodeURIComponent(slug)+"&per_page=5&_fields=id,slug,title,acf,date");
  if(!Array.isArray(posts))throw Error("Native WP Post search unavailable");
  const datePage=await datesContext.newPage();
  let dateProof={source:"not-tested"};
  try{dateProof=await searchDate(datePage,{id,sourceUrl:source,title:d.title,opening:d.body});}
  catch(e){dateProof={source:"lookup-error",error:String(e?.message||e).slice(0,150)}}
  finally{await datePage.close()}
  const row={id,source,slug,title:d.title,sourceThumbs:count,
    exactOriginalMatched:media.length,existingNativeMedia:media.filter(x=>x.wpMediaId).length,
    missingNativeMedia:media.filter(x=>!x.wpMediaId).map(x=>x.marker),
    currentWpPostMatches:posts.map(x=>({id:x.id,slug:x.slug,acfOrigin:x.acf?.origin_page_id||null})),
    createdDay:dateProof?.day||null,dateEvidence:dateProof,media};
  report.rows.push(row);
  console.log("PSE_THUMB_NATIVE_MEDIA_DATE_ROW="+JSON.stringify({
   id,sourceThumbs:count,exactOriginalMatched:media.length,wpMediaExists:row.existingNativeMedia,
   postedSameSlug:posts.length,createdDay:row.createdDay,dateSource:dateProof?.source,
   missing:row.missingNativeMedia.slice(0,8)}));
 }
 report.summary={articles:report.rows.length,sourceOriginalImages:report.rows.reduce((n,x)=>n+x.sourceThumbs,0),
  wpMediaVerified:report.rows.reduce((n,x)=>n+x.existingNativeMedia,0),
  dateProven:report.rows.filter(x=>x.createdDay&&x.dateEvidence?.source==="joomla_com_search_created").map(x=>x.id),
  sourceBackedReady:report.rows.filter(x=>x.existingNativeMedia===x.sourceThumbs&&
    x.createdDay&&x.dateEvidence?.source==="joomla_com_search_created"&&!x.currentWpPostMatches.length).map(x=>x.id),
  noWordPressWrites:true};
 console.log("PSE_THUMB_NATIVE_MEDIA_DATE_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-thumb-native-media-date",{recursive:true});
 await writeFile("artifacts/pse-thumb-native-media-date/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await ctx.close();await datesContext.close();await browser.close();
}