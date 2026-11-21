/** Read-only: source Joomla Article #1640, exact historical publisher photos, source created date, native WP identity. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const item=state.articles?.["1640"];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||state.schema!=="pse-legacy-article-migration-v1"||
 !state.backup_verified||!item?.source_url?.startsWith("https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/1640-"))
 throw Error("Wrong original Joomla source identity");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function origin(key){const matches=env.filter(x=>x.startsWith(key+"="));if(matches.length!==1)throw Error("Missing "+key);
 const u=new URL(matches[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))
 throw Error("Unexpected origin "+key);return u.origin;}
const cms=origin("WC_URL"),publicWeb=origin("WC_URL_CLIENT");
if(cms===publicWeb)throw Error("Overlapping origins");
const source=item.source_url;
const imgs=[
 {url:"https://www.baobariavungtau.com.vn/dataimages/202505/original/images2017799_Ca_kh_c.jpg",capture:"20250625183814",sha:"ee965c7187188869a123688a3d9d4d2ada804724ed952fd252a68896add813f4",bytes:272169},
 {url:"https://www.baobariavungtau.com.vn/dataimages/202505/original/images2017800_16_2025_acondao.jpg",capture:"20250624212508",sha:"bb8a5f29dc3abbc3de791b10d5b85c74aa7bb6905386a3c6a9e178a626b83ae6",bytes:333693}
];
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:55000});
const report={schema:"pse-1640-original-article-archived-photos-date-preflight-v1",readOnly:true,
 source,quarantine:{status:item.status,reason:item.reason},nativePost:[],sourceArticle:null,
 date:null,originalPublisherArchives:[],conclusion:"SOURCE_REVIEW",noCmsWrites:true};
try{
 const r=await net.get(source,{timeout:65000,maxRedirects:2});
 if(r.status()!==200)throw Error("Original Joomla #1640 HTTP "+r.status());
 const html=await r.text();
 if(html.length<300||html.length>8000000)throw Error("Unexpected original HTML size");
 const ctx=await browser.newContext({javaScriptEnabled:false});
 await ctx.route("**/*",z=>z.abort());
 const page=await ctx.newPage();
 await page.setContent('<base href="'+source+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
 const article=await page.evaluate(()=>{
  const e=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page")||document.querySelector("article");
  if(!e)return null;
  const clean=s=>String(s||"").replace(/\s+/g," ").trim();
  return{title:clean(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||""),
    bodyText:clean(e.textContent),articleHTMLBytes:e.innerHTML.length,
    imageSources:[...e.querySelectorAll("img")].map(x=>({src:new URL(x.getAttribute("src")||"",document.baseURI).href,
      alt:clean(x.getAttribute("alt")||"")})),
    datedNodes:[...document.querySelectorAll('meta[property="article:published_time"],meta[itemprop="datePublished"],time[datetime],.item-page dd.published')].map(x=>x.getAttribute("content")||x.getAttribute("datetime")||clean(x.textContent)).filter(Boolean)};
 });
 await ctx.close();
 if(!article||article.bodyText.length<250||article.title.length<12)throw Error("Original article content not source-safe");
 const referenced=article.imageSources.filter(x=>imgs.some(y=>y.url===x.src));
 report.sourceArticle={title:article.title,bodyChars:article.bodyText.length,bodyBeginning:article.bodyText.slice(0,300),
   htmlBytes:article.articleHTMLBytes,images:article.imageSources,matchedPublisherSources:referenced.length,datedNodes:article.datedNodes};
 // Only the two original full source image URLs are eligible for archive recovery.
 if(referenced.length!==2||article.imageSources.some(x=>!imgs.some(y=>y.url===x.src)))
  throw Error("Unexpected original Article #1640 image identity/count");
 const wpSlug=new URL(source).pathname.split("/").at(-1).replace(/^1640-/,"").replace(/\.html$/,"");
 const [p,c]=await Promise.all([
   net.get(cms+"/wp-json/wp/v2/posts?slug="+encodeURIComponent(wpSlug)+"&per_page=10&_fields=id,slug,status,acf,date",{timeout:35000}),
   net.get(cms+"/wp-json/wp/v2/categories?slug=tin-cong-ty&_fields=id,slug,name,parent",{timeout:35000})
 ]);
 if(p.status()!==200||c.status()!==200)throw Error("Native WordPress category/post discovery not available");
 const posts=await p.json(),cats=await c.json();
 if(!Array.isArray(posts)||!Array.isArray(cats)||cats.length!==1)throw Error("WP source-backed news registry invalid");
 report.nativePost=posts;report.nativeCategory=cats[0];
 if(posts.length>1)throw Error("Native WordPress duplicate source slug");
 const dateCtx=await browser.newContext();
 await dateCtx.route(/\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf)(?:[?#]|$)/i,z=>z.abort());
 const datePage=await dateCtx.newPage();
 try{report.date=await searchDate(datePage,{id:1640,sourceUrl:source,title:article.title,opening:article.bodyText.slice(0,350)})}
 finally{await dateCtx.close()}
 const sha=b=>createHash("sha256").update(b).digest("hex");
 for(const img of imgs){
  const u=new URL(img.url);
  if(u.hostname!=="www.baobariavungtau.com.vn")throw Error("Nonoriginal publisher");
  const capture="https://web.archive.org/web/"+img.capture+"id_/"+img.url;
  const r=await net.get(capture,{timeout:50000,maxRedirects:0,failOnStatusCode:false});
  if(r.status()!==200)throw Error("Archive source capture now unavailable HTTP "+r.status());
  const bytes=await r.body();
  const mime=String(r.headers()["content-type"]||"").toLowerCase().split(";")[0],digest=sha(bytes);
  const ok=mime==="image/jpeg"&&bytes.length===img.bytes&&digest===img.sha&&
    bytes.subarray(0,2).toString("hex")==="ffd8"&&bytes.subarray(-2).toString("hex")==="ffd9";
  report.originalPublisherArchives.push({originalUrl:img.url,capturedAt:img.capture,sourceExact:true,http:r.status(),
    mime,bytes:bytes.length,sha256:digest,archiveByteIdentityReconfirmed:ok});
  if(!ok)throw Error("Archived publisher exact original-byte proof changed");
 }
 const hasDate=report.date?.source==="joomla_com_search_created"&&/^\d{4}-\d\d-\d\d$/.test(report.date.day||"");
 report.conclusion=hasDate&&report.nativePost.length===0?"SOURCE_MEDIA_AND_CREATED_DAY_READY_FOR_GUARDED_IMPORT":
   hasDate?"SOURCE_MEDIA_AND_CREATED_DAY_WITH_EXISTING_POST_REVIEW":"SOURCE_MEDIA_VERIFIED_DATE_NOT_PROVEN";
 console.log("PSE_1640_ARCHIVED_SOURCE_PREFLIGHT="+JSON.stringify({
   conclusion:report.conclusion,title:article.title,articleTextChars:article.bodyText.length,
   sourceImg:article.imageSources.length,archiveImageProof:report.originalPublisherArchives.length,
   sourceCreatedDay:hasDate?report.date.day:null,sourceDatePrecision:report.date?.precision||null,
   sourceDateMethod:report.date?.source||null,existingPublishedWordPressPosts:posts.length,
   nativeCategoryId:cats[0].id,readOnly:true,noCmsWrites:true
 }));
 console.log("PSE_1640_SOURCE_MEDIA="+JSON.stringify(report.originalPublisherArchives));
}finally{
 await mkdir("artifacts/pse-original-1640-archive",{recursive:true});
 await writeFile("artifacts/pse-original-1640-archive/preflight.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
