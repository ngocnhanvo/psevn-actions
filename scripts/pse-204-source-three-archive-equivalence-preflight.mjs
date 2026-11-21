/** Strict GET-only original Joomla #204 versus 3 historic same-origin captures.
 * Percent-escaped parentheses and literal parentheses compare at the decoded
 * path-component level ONLY. This is provenance evidence, NOT CMS authorization.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const item=state.articles?.["204"];
const pathPrefix="/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/204-";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 item?.status!=="quarantined"||item.reason!=="Article contains non-local mandatory media"||
 !item.source_url?.startsWith("https://www.pse.vn"+pathPrefix))
 throw Error("Untrusted original Joomla #204 source/quarantine");
const photos=[
 {path:"a22.jpg",url:"http://www.binhphuoc.gov.vn/3cms/upload//Image/a%20da%20cam/a22.jpg",
  captured:"20110814055755",sha:"6dfeae3ae723315288c423a0035f12d0b9202f8199487a552c203228cbe1be86",bytes:39041},
 {path:"a33%281%29.jpg",url:"http://www.binhphuoc.gov.vn/3cms/upload//Image/a%20da%20cam/a33%281%29.jpg",
  captured:"20110814055821",sha:"6e16fb1e431c39a4ac907566a5c5f6313a742593ee069e7c2d6dbbdf2f47c8e5",bytes:38185,
  archivedOriginal:"http://www.binhphuoc.gov.vn/3cms/upload//Image/a%20da%20cam/a33(1).jpg"},
 {path:"a11.jpg",url:"http://www.binhphuoc.gov.vn/3cms/upload//Image/a%20da%20cam/a11.jpg",
  captured:"20110814055807",sha:"aa9a7bb4520387305f04255e23d2e32833dd1570c9442ffa4876799813a47097",bytes:52662}
];
const sha=b=>createHash("sha256").update(b).digest("hex");
const sameResource=(s,t)=>{
 const a=new URL(s),b=new URL(t);
 // Only percent escape encoding of parentheses, not path normalization,
 // host aliases, HTTP<->HTTPS, changed slash counts or query parameters.
 return a.protocol===b.protocol&&a.hostname===b.hostname&&a.port===b.port&&
 !a.search&&!b.search&&!a.hash&&!b.hash&&
 a.pathname.replace(/%28/gi,"(").replace(/%29/gi,")")===
 b.pathname.replace(/%28/gi,"(").replace(/%29/gi,")");
};
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:55000});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",r=>r.abort());
const dateCtx=await browser.newContext({viewport:{width:1366,height:850}});
await dateCtx.route(/\.(?:jpe?g|png|webp|gif|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const report={schema:"pse-204-original-3-images-percent-parens-provenance-v1",readOnly:true,
 sourceId:204,original:item.source_url,sourceArticle:null,originalImageProof:[],
 createdDay:null,sourceCreatedEvidence:null,category:null,alreadyPublished:[],decision:"BLOCKED",
 noCMSWrites:true,noBuild:true,archiveCapturedAtNotPublishedDay:true};
try{
 const s=await net.get(item.source_url,{timeout:65000,maxRedirects:2});
 if(s.status()!==200)throw Error("Original Joomla #204 HTTP "+s.status());
 const html=await s.text();
 if(html.length<250||html.length>8000000)throw Error("Original HTML invalid size");
 const page=await ctx.newPage();
 await page.setContent('<base href="'+item.source_url+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
 const original=await page.evaluate(()=>{
  const root=document.querySelector(".item-page [itemprop=articleBody]")||
   document.querySelector(".item-page")||document.querySelector("article");
  const norm=s=>String(s||"").replace(/\s+/g," ").trim();
  if(!root)return null;
  const others=[...root.querySelectorAll("video,audio,source,iframe,embed,object")].length;
  return{title:norm(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent),
   body:norm(root.textContent),images:[...root.querySelectorAll("img[src]")].map(i=>i.src),
   linkedImages:[...root.querySelectorAll("a[href]")].filter(a=>/\.(?:jpe?g|png|gif|webp|pdf)(?:$|\?)/i.test(a.href))
    .map(a=>a.href),otherMandatoryMedia:others};
 });
 await page.close();
 if(!original||original.title.length<15||original.body.length<150||
   original.images.length!==3||original.otherMandatoryMedia)
  throw Error("Original Joomla 204 text/photo inventory changed");
 report.sourceArticle={title:original.title,textChars:original.body.length,
  images:original.images,linkedImages:original.linkedImages,otherMedia:original.otherMandatoryMedia};
 for(let i=0;i<3;i++)if(!sameResource(original.images[i],photos[i].url))
  throw Error("Wrong source original URL or order "+i);
 if(original.linkedImages.some(url=>!photos.some(p=>sameResource(url,p.url))))
  throw Error("Original Joomla 204 contains other mandatory linked image/document");
 const datePage=await dateCtx.newPage();let day;
 try{day=await searchDate(datePage,{id:204,sourceUrl:item.source_url,title:original.title,opening:original.body.slice(0,350)})}
 finally{await datePage.close()}
 report.createdDay=day.source==="joomla_com_search_created"?day.day:null;
 report.sourceCreatedEvidence=day;
 for(let i=0;i<photos.length;i++){
  const p=photos[i],archOriginal=p.archivedOriginal||p.url;
  if(!sameResource(p.url,archOriginal))throw Error("Archive original differs beyond percent parentheses");
  const archive="https://web.archive.org/web/"+p.captured+"id_/"+archOriginal;
  const res=await net.get(archive,{timeout:45000,maxRedirects:0,failOnStatusCode:false});
  const mime=String(res.headers()["content-type"]||"").toLowerCase().split(";")[0];
  const bytes=await res.body();
  const valid=res.status()===200&&mime==="image/jpeg"&&bytes.length===p.bytes&&
   sha(bytes)===p.sha&&bytes.subarray(0,2).toString("hex")==="ffd8"&&
   bytes.subarray(-2).toString("hex")==="ffd9";
  const row={index:i,sourceUrl:p.url,archivedOriginal:archOriginal,percentEscapedParenthesesEquivalent:sameResource(p.url,archOriginal),
   sourceImageOrderMatch:sameResource(original.images[i],p.url),
   exactImageHash:p.sha,archiveTime:p.captured,bytes:bytes.length,actualSha256:sha(bytes),
   captureMime:mime,captureHTTP:res.status(),archivedOriginalVerified:valid};
  report.originalImageProof.push(row);
  console.log("PSE_204_THREE_SOURCE_IMAGE_ROW="+JSON.stringify(row));
  if(!valid)throw Error("Historic original #204 capture failed byte proof "+i);
 }
 // WP category/slug discovery is GET-only; do not create guessed taxonomy.
 const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
 const findOrigin=k=>{const matches=env.filter(x=>x.startsWith(k+"="));
  if(matches.length!==1)throw Error("Missing unique "+k);
  const u=new URL(matches[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
  if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
   throw Error("Invalid CMS origin");
  return u.origin;};
 const wp=findOrigin("WC_URL");
 const slug=new URL(item.source_url).pathname.split("/").at(-1).replace(/^204-/,"").replace(/\.html$/,"");
 const [cats,posts]=await Promise.all([
  net.get(wp+"/wp-json/wp/v2/categories?slug=tin-tong-hop&_fields=id,slug,parent,name"),
  net.get(wp+"/wp-json/wp/v2/posts?slug="+encodeURIComponent(slug)+"&per_page=5&_fields=id,slug,status,acf,categories,date")
 ]);
 if(cats.status()!==200||posts.status()!==200)throw Error("WP category/slug read-only discovery failed");
 report.category=await cats.json();
 report.alreadyPublished=await posts.json();
 report.decision=report.createdDay&&report.originalImageProof.length===3&&
  report.originalImageProof.every(x=>x.archivedOriginalVerified)&&report.alreadyPublished.length===0?
  "ORIGINAL_ARTICLE_THREE_IMAGES_AND_CREATED_DAY_PROVEN_NO_DUPLICATE":
  "REVIEW_DATE_OR_EXISTING_CMS_OWNER";
 console.log("PSE_204_SOURCE_ARCHIVE_AND_DATE_SUMMARY="+JSON.stringify({
  sourceId:204,title:original.title,textChars:original.body.length,
  sourceCreatedDay:report.createdDay,sourceDateSource:day.source,
  exactOriginalDecodedPathEquivalent:report.originalImageProof.every(x=>x.percentEscapedParenthesesEquivalent),
  originalJPEGsVerified:report.originalImageProof.length,
  cmsPostMatches:report.alreadyPublished.length,
  cmsCategories:report.category,decision:report.decision,readOnly:true,noCMSWrites:true
 }));
}finally{
 await mkdir("artifacts/pse-204-original-archive-date",{recursive:true});
 await writeFile("artifacts/pse-204-original-archive-date/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await ctx.close();await dateCtx.close();await browser.close();
}
