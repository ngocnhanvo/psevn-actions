/** Joomla #1434 NPK general description vs original Joomla family and native WP category.
 * Strict read-only evidence; no CMS content write or guessed product redirect.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const item=state.articles?.["1434"];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 item?.status!=="quarantined"||item?.reason!=="Original Joomla section cannot be mapped to verified WP taxonomy")
 throw Error("Exact Joomla #1434 source quarantine no longer matches");
const source=new URL(item.source_url);
if(source.protocol!=="https:"||source.hostname!=="www.pse.vn"||
 !/\/1434-[^/]+\.html$/i.test(source.pathname)||
 !source.pathname.includes("/8-trang-chu/")||source.search||source.hash)
 throw Error("Joomla #1434 original manifest URL not supported: "+source.pathname);
const overview="https://pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-hon-hop-npk-phu-my/8-trang-chu.html";
const values=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function originOf(name){
 const matches=values.filter(x=>x.startsWith(name+"="));
 if(matches.length!==1)throw Error("Missing verified "+name);
 const url=new URL(matches[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||
 !["","/"].includes(url.pathname))throw Error("Wrong origin "+name);
 return url.origin;
}
const wp=originOf("WC_URL"),front=originOf("WC_URL_CLIENT");
const norm=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();
const sha=s=>createHash("sha256").update(String(s)).digest("hex");
const report={schema:"pse-1434-npk-original-family-vs-native-category-v1",sourceId:1434,
 sourceUrl:source.href,overviewUrl:overview,nativeCategoryId:1764,readOnly:true,
 noCmsWrites:true,noBuild:true,source:null,overview:null,nativeCategory:null,
 frontend:null,decision:"REVIEW_REQUIRED"};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",r=>r.abort());
const page=await ctx.newPage();
async function extract(url,allowOverview=false){
 const response=await page.request.get(url,{timeout:50000,maxRedirects:2,failOnStatusCode:false});
 if(response.status()!==200)throw Error("Original source HTTP "+response.status());
 const html=await response.text();
 if(html.length<300||html.length>8000000)throw Error("Unsafe Joomla source size");
 await page.setContent('<base href="'+url+'">'+
  html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded",timeout:25000});
 return page.evaluate((allowOverview)=>{
  const root=document.querySelector('.item-page [itemprop="articleBody"]')||
   document.querySelector(".item-page")||document.querySelector("article")||
   (allowOverview?(document.querySelector(".blog")||document.querySelector("main")):null);
  const norm=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();
  if(!root)throw Error("Original articleBody/overview root missing");
  const images=[...root.querySelectorAll("img[src]")].map(e=>{
   let url;try{url=new URL(e.getAttribute("src"),document.baseURI)}catch{return null}
   if(!["http:","https:"].includes(url.protocol))return null;
   return {host:url.hostname,path:url.pathname};
  }).filter(Boolean);
  const media=[...root.querySelectorAll("a[href]")].map(e=>{
   let u;try{u=new URL(e.href)}catch{return null}
   return /\.(?:pdf|jpe?g|png|gif|webp)$/i.test(u.pathname)?
    {host:u.hostname,path:u.pathname}:null;
  }).filter(Boolean);
  return{title:norm(document.querySelector("h1,h2")?.textContent||document.title),
   text:norm(root.textContent),images,media,
   tables:root.querySelectorAll("table").length,
   paragraphs:root.querySelectorAll("p").length,htmlChars:root.innerHTML.length};
 },allowOverview);
}
try{
 const src=await extract(source.href),ov=await extract(overview,true);
 if(src.text.length<1000)throw Error("Joomla #1434 original overview body unexpectedly short");
 const toSummary=x=>({title:x.title,bodyChars:x.text.length,
  bodySha256:sha(x.text),imageCount:x.images.length,
  imagePaths:x.images.length<=25?x.images.map(i=>i.path):[],
  mediaCount:x.media.length,tableCount:x.tables,paragraphCount:x.paragraphs,
  htmlChars:x.htmlChars});
 report.source=toSummary(src);report.overview=toSummary(ov);
 const identicalText=src.text===ov.text;
 const sourceInOverview=ov.text.includes(src.text);
 const overviewInSource=src.text.includes(ov.text)&&ov.text.length>=300;
 const imagePathsMatch=JSON.stringify(src.images.map(x=>x.path).sort())===
  JSON.stringify(ov.images.map(x=>x.path).sort());
 report.crossSource={identicalText,sourceInOverview,overviewInSource,
  imagePathsMatch,sourceImgCount:src.images.length,overviewImgCount:ov.images.length};
 console.log("PSE_1434_JOOMLA_SOURCE="+JSON.stringify({...report.source,
  bodySha256:report.source.bodySha256.slice(0,24)}));
 console.log("PSE_1434_JOOMLA_OVERVIEW="+JSON.stringify({...report.overview,
  bodySha256:report.overview.bodySha256.slice(0,24)}));
 const rest=await page.request.get(wp+"/wp-json/astro/v1/get-product-categories",{timeout:35000});
 if(rest.status()!==200)throw Error("WP native taxonomy API HTTP "+rest.status());
 const cats=await rest.json();
 if(!Array.isArray(cats)||cats.length<6||cats.length>100)throw Error("Native taxonomy registry changed");
 const category=cats.find(c=>c.id===1764);
 if(!category||category.slug!=="nhom-phan-hon-hop-npk-phu-my")
  throw Error("Native NPK category ID/slug mismatch");
 const description=norm(String(category.description||"").replace(/<[^>]+>/g," "));
 report.nativeCategory={id:category.id,slug:category.slug,title:category.name,
  descriptionChars:description.length,descriptionSha256:sha(description)};
 const target="/san-pham/nhom-phan-hon-hop-npk-phu-my";
 const live=await page.request.get(front+target,{timeout:35000,maxRedirects:0,failOnStatusCode:false});
 const head=live.status()===200?await live.text():"";
 const canonical=head.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||
  head.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
 let canonicalCorrect=false;
 try{const u=new URL(canonical);canonicalCorrect=u.origin===front&&u.pathname===target&&!u.search&&!u.hash}catch{}
 report.frontend={path:target,status:live.status(),canonicalCorrect};
 report.decision=(identicalText||sourceInOverview)&&imagePathsMatch&&
  report.frontend.status===200&&canonicalCorrect?
   "JOOMLA_1434_VERIFIED_FAMILY_EQUIVALENCE_REVIEW_WP_CATEGORY_CONTENT":
   "SOURCE_TO_CATEGORY_SEMANTIC_REVIEW_NOT_AUTHORIZED";
 console.log("PSE_1434_NPK_CATEGORY_SUMMARY="+JSON.stringify({
  sourceId:1434,originalBodyChars:src.text.length,overviewBodyChars:ov.text.length,
  crossSource:report.crossSource,nativeCategory:report.nativeCategory,
  frontend:report.frontend,decision:report.decision,readOnly:true,noCmsWrites:true}));
}finally{
 await mkdir("artifacts/pse-1434-npk-category",{recursive:true});
 await writeFile("artifacts/pse-1434-npk-category/report.json",JSON.stringify(report,null,2)+"\n");
 await ctx.close();await browser.close();
}
