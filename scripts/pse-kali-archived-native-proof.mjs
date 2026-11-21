/** Read-only: archived original Joomla Kali product text+image identity against native WooCommerce library. */
import {chromium,request} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repository");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const captures=[
 {id:1425,ts:"20260711151902",host:"https://pse.vn"},
 {id:1426,ts:"20260711135647",host:"http://pse.vn"},
 {id:1678,ts:"20260516112302",host:"https://pse.vn"}];
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 captures.some(c=>state.articles?.[c.id]?.status!=="quarantined"||
 state.articles[c.id]?.reason!=="Original Joomla section cannot be mapped to verified WP taxonomy"))
 throw Error("Joomla source state has changed");
const values=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function origin(k){const matches=values.filter(x=>x.startsWith(k+"="));if(matches.length!==1)throw Error("Missing "+k);
 const u=new URL(matches[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Bad WP origin");
 return u.origin;}
const wp=origin("WC_URL");
const flat=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();
const fold=s=>flat(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/gi,"d").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const digest=s=>createHash("sha256").update(flat(s)).digest("hex").slice(0,16);
const net=await request.newContext({timeout:43000}),browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false}),page=await ctx.newPage();
await ctx.route("**/*",r=>r.abort());
async function parse(html,base,original){
 await page.setContent('<base href="'+base+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
 return page.evaluate(original=>{
  const normalize=x=>String(x||"").normalize("NFKC").replace(/\s+/g," ").trim();
  let root=original?(document.querySelector('[itemprop="articleBody"]')||document.querySelector(".item-page")):document.body;
  if(!root)throw Error("Original body missing");
  root=root.cloneNode(true);
  if(original)root.querySelectorAll(".extranews_box,.extranews_separator").forEach(x=>x.remove());
  return{title:normalize(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||document.title),
   body:normalize(root.textContent),
   paragraphs:[...root.querySelectorAll("p,li,td")].map(x=>normalize(x.textContent)).filter(x=>x.length>=55).slice(0,50),
   images:[...root.querySelectorAll("img[src]")].map(x=>{
    try{const u=new URL(x.getAttribute("src"),document.baseURI);return{
      path:u.pathname,host:u.hostname,file:decodeURIComponent(u.pathname.split("/").at(-1)),alt:normalize(x.alt).slice(0,120)}}
    catch{return null}
   }).filter(Boolean)};
 },original);
}
const report={schema:"pse-kali-archived-article-native-wp-media-identity-v1",readOnly:true,noCmsWrites:true,noBuild:true,sources:[],candidates:[],comparisons:[],summary:null};
try{
 for(const capture of captures){
  const sourceUrl=state.articles[capture.id].source_url,u=new URL(sourceUrl);
  if(u.hostname!=="www.pse.vn"||!u.pathname.includes("/8-trang-chu/")||
   !u.pathname.includes("/"+capture.id+"-"))throw Error("Incorrect Joomla path "+capture.id);
  const archive="https://web.archive.org/web/"+capture.ts+"id_/"+capture.host+u.pathname;
  const r=await net.get(archive,{failOnStatusCode:false,maxRedirects:0,timeout:30000});
  if(r.status()!==200)throw Error("Exact Wayback capture unavailable "+capture.id+" HTTP "+r.status());
  const raw=await r.text();if(raw.length<400||raw.length>6000000)throw Error("Archive HTML invalid");
  const body=await parse(raw,capture.host+u.pathname,true);
  const expected=capture.id===1425?/kali phú mỹ bột canada/i:/kali phú mỹ/i;
  if(!expected.test(body.title)||body.body.length<180||
   /Подробнее на сайте|(?:ducauto|sedoauto|miratalk)\.ru/i.test(body.body))
   throw Error("Archived original source identity/content unproven "+capture.id);
  const record={id:capture.id,archiveTimestamp:capture.ts,original:sourceUrl,
   title:body.title,bodySha256:digest(body.body),bodyChars:body.body.length,
   bodyStart:body.body.slice(0,240),paragraphs:body.paragraphs,
   images:body.images};
  report.sources.push(record);
  console.log("PSE_KALI_ARCHIVED_ORIGINAL="+JSON.stringify({
   id:record.id,title:record.title,bodyChars:record.bodyChars,
   imageNames:record.images.map(x=>x.file),bodyStart:record.bodyStart}).slice(0,2900));
 }
 const productsResp=await net.get(wp+"/wp-json/wp/v2/product?status=publish&per_page=100&_fields=id,slug,status,title,content,excerpt,featured_media",{failOnStatusCode:false});
 if(productsResp.status()!==200)throw Error("WP product registry unavailable "+productsResp.status());
 const products=await productsResp.json();
 if(!Array.isArray(products)||products.length!==53)throw Error("WP Product registry count changed");
 const kali=products.filter(p=>/kali phu my/.test(fold(p.title?.rendered||"")));
 if(kali.length<3||kali.length>12)throw Error("Unexpected Kali product variants "+kali.length);
 for(const p of kali){
  const val=await parse(String(p.content?.rendered||"")+" "+String(p.excerpt?.rendered||""),wp+"/",false);
  const row={wpId:p.id,title:flat(p.title?.rendered),slug:p.slug,bodyChars:val.body.length,
    paragraphs:val.paragraphs,inlineImages:val.images,featuredOriginal:null};
  if(p.featured_media){
   const m=await net.get(wp+"/wp-json/wp/v2/media/"+p.featured_media+"?_fields=id,source_url,alt_text",{failOnStatusCode:false});
   if(m.status()===200){
    const j=await m.json();
    const mediaUrl=new URL(j.source_url,wp);
    if(mediaUrl.origin!==wp||!mediaUrl.pathname.startsWith("/wp-content/uploads/"))
     throw Error("WordPress Media origin/path untrusted "+p.id);
    row.featuredOriginal={url:mediaUrl.href,path:mediaUrl.pathname,
      file:decodeURIComponent(mediaUrl.pathname.split("/").at(-1)),alt:j.alt_text||""};
   }
  }
  report.candidates.push(row);
  console.log("PSE_KALI_NATIVE_VARIANT="+JSON.stringify({
   wpId:row.wpId,title:row.title,slug:row.slug,bodyChars:row.bodyChars,
   featured:row.featuredOriginal,inline:row.inlineImages.map(x=>x.file)}).slice(0,3800));
 }
 for(const a of report.sources)for(const b of report.candidates){
  const text=fold(b.paragraphs.join(" "));
  const overlap=a.paragraphs.filter(x=>text.includes(fold(x))).length;
  const aFiles=a.images.map(x=>fold(x.file.replace(/\.[^.]+$/,"")));
  const bFiles=[...(b.featuredOriginal?[b.featuredOriginal.file]:[]),...b.inlineImages.map(x=>x.file)]
   .map(x=>fold(x.replace(/\.[^.]+$/,"")));
  const exactFileMatches=aFiles.filter(x=>x&&bFiles.includes(x));
  report.comparisons.push({sourceId:a.id,wpId:b.wpId,wpTitle:b.title,
   sourceParagraphs:a.paragraphs.length,exactParagraphs:overlap,
   sourceImageNames:a.images.map(x=>x.file),
   exactImageNames:exactFileMatches,
   originalImages:aFiles.length,matchedImages:exactFileMatches.length,
   originalOpeningInWpBody:text.includes(fold(a.bodyStart.slice(0,175)))});
 }
 const summary=captures.map(x=>{
  const pairs=report.comparisons.filter(y=>y.sourceId===x.id);
  const reliable=pairs.filter(y=>y.sourceParagraphs>=2&&y.exactParagraphs===y.sourceParagraphs&&
   y.originalImages>0&&y.matchedImages===y.originalImages);
  return{sourceId:x.id,strictImageAndBodyCandidates:reliable.map(y=>y.wpId),
   candidates:pairs.map(y=>({wpId:y.wpId,title:y.wpTitle,
    paragraphs:y.exactParagraphs+"/"+y.sourceParagraphs,images:y.matchedImages+"/"+y.originalImages})),
   decision:reliable.length===1?"REVIEW_UNIQUE_SOURCE_IDENTITY":"NO_STRICT_EXACT_NATIVE_DESTINATION"};
 });
 report.summary={review:summary,strictSingleMatches:summary.filter(x=>x.decision==="REVIEW_UNIQUE_SOURCE_IDENTITY").map(x=>x.sourceId),
   wordpressWrites:0,redirectsCreated:0,readOnly:true,noBuild:true};
 console.log("PSE_KALI_ARCHIVED_TO_NATIVE_SUMMARY="+JSON.stringify(report.summary).slice(0,14000));
}finally{
 await mkdir("artifacts/pse-kali-archive-native",{recursive:true});
 await writeFile("artifacts/pse-kali-archive-native/report.json",JSON.stringify(report,null,2)+"\n");
 await page.close();await ctx.close();await browser.close();await net.dispose();
}
