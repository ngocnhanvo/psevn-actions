/** Three unresolved Kali original Joomla article variants vs native WP Products; source-only, no writes. */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repository");
const srcState=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const ids=[1425,1426,1678], productIds=[80954,80952,80938];
if(srcState.schema!=="pse-legacy-article-migration-v1"||!srcState.backup_verified||
 ids.some(id=>srcState.articles?.[id]?.status!=="quarantined"||
  srcState.articles[id]?.reason!=="Original Joomla section cannot be mapped to verified WP taxonomy"))
 throw Error("Manifest source changed");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const envOrigin=key=>{
 const r=env.filter(s=>s.startsWith(key+"="));if(r.length!==1)throw Error("Missing "+key);
 const u=new URL(r[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Untrusted "+key);
 return u.origin;
};
const wp=envOrigin("WC_URL"),front=envOrigin("WC_URL_CLIENT");
const compact=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();
const normalize=s=>compact(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/gi,"d").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const hash=s=>createHash("sha256").update(compact(s)).digest("hex").slice(0,16);
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:50000});
const ctx=await browser.newContext({javaScriptEnabled:false}),page=await ctx.newPage();
await ctx.route("**/*",r=>r.abort());
const parse=async(html,base,source)=>{
 await page.setContent('<base href="'+base+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
 return page.evaluate(isSource=>{
  let el=isSource?(document.querySelector('[itemprop="articleBody"]')||document.querySelector(".item-page")):document.body;
  if(!el)throw Error("Missing body");
  el=el.cloneNode(true);if(isSource)el.querySelectorAll(".extranews_box,.extranews_separator").forEach(x=>x.remove());
  const n=x=>String(x||"").replace(/\s+/g," ").trim();
  return{title:isSource?n(document.querySelector("h1,.item-page h2")?.textContent):null,
   text:n(el.textContent),
   paragraphs:[...el.querySelectorAll("p,td,li")].map(x=>n(x.textContent)).filter(x=>x.length>=35),
   images:[...el.querySelectorAll("img[src]")].map(x=>{
    try{const u=new URL(x.getAttribute("src"),document.baseURI);return{
     host:u.hostname,path:u.pathname,file:u.pathname.split("/").at(-1),alt:n(x.alt).slice(0,100)}}
    catch{return null}
   }).filter(Boolean),
   docs:[...el.querySelectorAll("a[href]")].map(x=>x.getAttribute("href")).filter(x=>/\.(?:pdf|docx?|xlsx?)(?:$|[?#])/i.test(x||""))};
 },source);
};
const report={schema:"pse-kali-three-original-variant-vs-wp-products-readonly-v1",readOnly:true,noCmsWrites:true,noBuild:true,original:[],products:[],comparisons:[],decision:null};
try{
 for(const id of ids){
  const url=srcState.articles[id].source_url,u=new URL(url);
  if(u.protocol!=="https:"||u.hostname!=="www.pse.vn"||!u.pathname.includes("/8-trang-chu/")||!u.pathname.includes("/"+id+"-"))throw Error("Invalid original "+id);
  const r=await net.get(url);if(r.status()!==200)throw Error("Original HTTP "+r.status());
  const d=await parse(await r.text(),url,true);
  if(d.text.length<180)throw Error("Source original body missing "+id);
  const a={id,url,title:d.title,bodyChars:d.text.length,bodyHash:hash(d.text),
   paragraphs:d.paragraphs.map(x=>({hash:hash(x),len:x.length,start:x.slice(0,90)})),
   originalImages:d.images,docs:d.docs,opening:d.text.slice(0,190)};
  report.original.push(a);
  console.log("PSE_KALI_SOURCE_VARIANT="+JSON.stringify({id,title:a.title,bodyChars:a.bodyChars,images:a.originalImages,docs:a.docs,opening:a.opening}).slice(0,2500));
 }
 for(const id of productIds){
  const r=await net.get(wp+"/wp-json/wp/v2/product/"+id+"?_fields=id,slug,status,title,content,excerpt,featured_media",{failOnStatusCode:false});
  if(r.status()!==200)throw Error("Native product not reachable "+id+" HTTP "+r.status());
  const p=await r.json();if(p.id!==id||p.status!=="publish"||!p.content?.rendered)throw Error("Product invalid "+id);
  const d=await parse(p.content.rendered+" "+(p.excerpt?.rendered||""),wp+"/",false);
  let cover=null;
  if(p.featured_media){
   const media=await net.get(wp+"/wp-json/wp/v2/media/"+p.featured_media+"?_fields=id,source_url,alt_text",{failOnStatusCode:false});
   if(media.status()===200){const m=await media.json();cover={path:new URL(m.source_url).pathname,alt:m.alt_text};}
  }
  const v={id,slug:p.slug,title:compact(p.title.rendered),bodyChars:d.text.length,bodyHash:hash(d.text),
   paragraphs:d.paragraphs,images:d.images,cover,opening:d.text.slice(0,160)};
  report.products.push(v);
  console.log("PSE_KALI_WP_VARIANT="+JSON.stringify({id,slug:v.slug,title:v.title,bodyChars:v.bodyChars,cover:v.cover,images:v.images.map(x=>x.file),opening:v.opening}).slice(0,2400));
 }
 for(const source of report.original)for(const prod of report.products){
  const srcParagraphs=source.paragraphs.filter(x=>x.len>=55);
  const targetText=normalize(prod.paragraphs.join(" "));
  const exactParagraphMatches=srcParagraphs.filter(x=>targetText.includes(normalize(x.start))).length;
  const originalFiles=[...new Set(source.originalImages.map(x=>normalize(x.file.replace(/\.[^.]+$/,""))))].filter(Boolean);
  const targetFiles=[...new Set([...prod.images.map(x=>normalize(x.file.replace(/\.[^.]+$/,""))),
    normalize((prod.cover?.path||"").split("/").at(-1).replace(/\.[^.]+$/,""))])].filter(Boolean);
  const imageMatches=originalFiles.filter(x=>targetFiles.includes(x));
  report.comparisons.push({sourceId:source.id,wpId:prod.id,sourceParagraphs:srcParagraphs.length,
   exactlyMatchingParagraphs:exactParagraphMatches,sourceImages:originalFiles.length,
   matchingImageBasenames:imageMatches.length,matchedImageNames:imageMatches,
   sameBodyHash:source.bodyHash===prod.bodyHash,
   strictUniqueCandidate:srcParagraphs.length>=2&&exactParagraphMatches===srcParagraphs.length&&
    (originalFiles.length===0||imageMatches.length===originalFiles.length)});
 }
 const scored=ids.map(id=>{
  const rows=report.comparisons.filter(x=>x.sourceId===id);
  const matches=rows.filter(x=>x.strictUniqueCandidate);
  return{sourceId:id,strictCandidates:matches.map(x=>x.wpId),
   rows:rows.map(x=>({wpId:x.wpId,paragraphMatches:x.exactlyMatchingParagraphs+"/"+x.sourceParagraphs,
    imageMatches:x.matchingImageBasenames+"/"+x.sourceImages,identical:x.sameBodyHash})),
   decision:matches.length===1?"REVIEW_SINGLE_EXACT_VARIANT":"NO_PROVEN_UNIQUE_DESTINATION"};
 });
 report.decision=scored.every(x=>x.decision==="REVIEW_SINGLE_EXACT_VARIANT")?"REVIEW_ALL_THREE":"SOME_VARIANTS_UNPROVEN";
 console.log("PSE_KALI_EXACT_VARIANT_SUMMARY="+JSON.stringify({rows:scored,decision:report.decision,noCmsWrites:true}));
}finally{
 await mkdir("artifacts/pse-kali-original-variant",{recursive:true});
 await writeFile("artifacts/pse-kali-original-variant/report.json",JSON.stringify(report,null,2)+"\n");
 await ctx.close();await browser.close();await net.dispose();
}
