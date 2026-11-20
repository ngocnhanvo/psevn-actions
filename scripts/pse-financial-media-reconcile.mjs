/** Finance archive final read-only media/SSR parity: independently crawled source 76 vs WordPress. */
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {chromium} from "playwright";
const source=JSON.parse(await readFile("artifacts/pse-financial-original/report.json","utf8"));
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(source.schema!=="pse-financial-report-source-parity-v1"||state.schema!=="pse-legacy-article-migration-v1"||
  source.sourceArticles?.length!==76)throw Error("Original source snapshot identity changed");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const envUrl=k=>{
 const a=env.filter(x=>x.startsWith(k+"="));if(a.length!==1)throw Error("Missing PSE origin "+k);
 const u=new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||!["","/"].includes(u.pathname)||u.search||u.hash)throw Error("Invalid origin "+k);
 return u.origin;
};
const wp=envUrl("WC_URL"),front=envUrl("WC_URL_CLIENT");
const report={schema:"pse-finance-media-final-parity-v1",sourceCount:76,sourceRecords:[],wpCount:null,extraWpPosts:[],orderMismatches:[],unmatched:[],unverifiedDocumentLinks:[],missingDocumentLinks:[],brokenWpAssets:[],assetLinksChecked:0,oldHotlinks:[],postsWithExtraDocuments:[],sourceErrors:[],frontend:{},errors:[],status:"UNVERIFIED"};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1350,height:850}});
const request=async(url)=>{
 const r=await ctx.request.get(url,{timeout:50000});
 if(!r.ok())throw Error("HTTP "+r.status()+" "+url.slice(0,100));
 return {body:await r.json(),total:Number(r.headers()["x-wp-total"]||0),pages:Number(r.headers()["x-wp-totalpages"]||0)};
};
const canon=x=>{try{const u=new URL(x,"https://www.pse.vn");return decodeURIComponent(u.pathname).toLocaleLowerCase("en").replace(/\/+/g,"/")}catch{return ""}};
const name=x=>canon(x).split("/").at(-1);
const exts=/\.(?:pdf|docx?|xlsx?|pptx?|zip|rar)$/i;
const unique=a=>[...new Map(a.map(x=>[canon(x.url),x])).values()];
const htmlDocs=html=>{
 const found=[];
 for(const [,raw] of String(html||"").matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)){
  try{
   const u=new URL(raw,wp);
   if(exts.test(u.pathname))found.push({url:u.href,name:name(u.href)});
  }catch{}
 }
 return unique(found);
};
const stateMediaByPath=new Map();
for(const [original,media] of Object.entries(state.media||{})){
 if(!media?.url)continue;
 const key=canon(original);
 if(!stateMediaByPath.has(key))stateMediaByPath.set(key,[]);
 stateMediaByPath.get(key).push(media);
}
try{
 const c=await request(wp+"/wp-json/wp/v2/categories?slug=bao-cao-tai-chinh&_fields=id,slug,parent,count");
 if(c.body?.length!==1||c.body[0].id!==1754||c.body[0].parent!==1744)throw Error("PSE finance taxonomy drift");
 let pg=1,pages=1,wpPosts=[];
 do{
  const r=await request(wp+"/wp-json/wp/v2/posts?categories=1754&per_page=100&page="+pg+"&_fields=id,slug,title,date,content,categories,link");
  if(pg===1){pages=r.pages||1;report.wpCount=r.total}
  if(!Array.isArray(r.body)||pages>5)throw Error("WordPress archive paging invalid");
  wpPosts.push(...r.body);
  pg++;
 }while(pg<=pages);
 const wpBySlug=new Map(wpPosts.map(x=>[x.slug,x])),wpById=new Map(wpPosts.map(x=>[x.id,x]));
 const newRows=source.sourceArticles.filter(row=>!row.sourceDocs);
 for(const row of newRows){
  const p=await ctx.newPage();
  try{
   const r=await p.goto(row.href,{waitUntil:"domcontentloaded",timeout:50000});
   if(r?.status()!==200)throw Error("Original source HTTP "+r?.status());
   row.sourceDocs=await p.evaluate(()=>{
    const root=document.querySelector('[itemprop="articleBody"]')||document.querySelector(".item-page")||document;
    return [...root.querySelectorAll("a[href],iframe[src],object[data],embed[src]")].map(el=>{
     const raw=el.getAttribute("href")||el.getAttribute("src")||el.getAttribute("data");
     try{const u=new URL(raw,location.href);return /\.(pdf|docx?|xlsx?|pptx?|zip|rar)$/i.test(u.pathname)?{url:u.href}:null}catch{return null}
    }).filter(Boolean);
   });
  }catch(e){report.sourceErrors.push({id:row.id,error:String(e).slice(0,180)})}
  finally{await p.close()}
 }
 const localURLs=new Set();
 for(const row of source.sourceArticles){
  const rec=state.articles[row.id];
  const post=(rec?.wp_id&&wpById.get(rec.wp_id))||wpBySlug.get(row.slug);
  const item={id:row.id,sourceUrl:row.href,wpId:post?.id||null,
   originalDocs:[],wordpressDocs:[],matchedDocs:0,unverified:[],missing:[],extraDocs:[]};
  if(!post){report.unmatched.push({id:row.id,url:row.href});report.sourceRecords.push(item);continue}
  const sourceDocs=unique((row.sourceDocs||[]).filter(x=>exts.test(new URL(x.url).pathname)));
  const targetDocs=htmlDocs(post.content?.rendered||"");
  item.originalDocs=sourceDocs;item.wordpressDocs=targetDocs;
  const used=new Set();
  for(const doc of sourceDocs){
   const k=canon(doc.url),oldName=name(doc.url);
   const mapped=stateMediaByPath.get(k)||[];
   const slugs=[createHash("sha256").update(doc.url).digest("hex").slice(0,16)];
   const same=targetDocs.filter(d=>{
    if(used.has(d.url))return false;
    const lower=decodeURIComponent(new URL(d.url).pathname).toLowerCase();
    return mapped.some(m=>canon(m.url)===canon(d.url))||
      slugs.some(h=>lower.includes("pse-legacy-"+h))||
      name(d.url)===oldName;
   });
   if(same.length===1){
    item.matchedDocs++;used.add(same[0].url);continue
   }
   if(same.length>1){item.unverified.push({source:doc.url,reason:"ambiguous media destination"});continue}
   if(targetDocs.length<sourceDocs.length){
    item.missing.push({source:doc.url,sourceFilename:oldName});
   }else item.unverified.push({source:doc.url,reason:"target filename differs; count not lower"});
  }
  item.extraDocs=targetDocs.filter(x=>!used.has(x.url));
  for(const t of targetDocs){
   try{
    const u=new URL(t.url);
    if(["pse.vn","www.pse.vn"].includes(u.hostname)){report.oldHotlinks.push({id:row.id,url:t.url});continue}
    if(u.origin===wp&&u.pathname.startsWith("/wp-content/uploads/"))localURLs.add(t.url);
   }catch{}
  }
  if(item.missing.length)report.missingDocumentLinks.push({id:row.id,files:item.missing,originalCount:sourceDocs.length,targetCount:targetDocs.length});
  if(item.unverified.length)report.unverifiedDocumentLinks.push({id:row.id,files:item.unverified});
  if(item.extraDocs.length)
   report.postsWithExtraDocuments.push({id:row.id,extra:item.extraDocs.length});
  report.sourceRecords.push(item);
 }
 const mappedIds=new Set(report.sourceRecords.filter(x=>x.wpId).map(x=>x.wpId));
 report.extraWpPosts=wpPosts.filter(p=>!mappedIds.has(p.id)).map(p=>({id:p.id,slug:p.slug}));
 const actualOrder=wpPosts.map(p=>p.id);
 const expectedOrder=report.sourceRecords.map(p=>p.wpId).filter(Boolean);
 for(let i=0;i<Math.max(expectedOrder.length,actualOrder.length);i++){
  if(expectedOrder[i]!==actualOrder[i])report.orderMismatches.push({
   index:i,sourceId:report.sourceRecords[i]?.id||null,expectedWpId:expectedOrder[i]||null,
   actualWpId:actualOrder[i]||null
  });
 }
 const urls=[...localURLs],bad=[];let cursor=0;
 const head=async()=>{while(cursor<urls.length){
  const url=urls[cursor++];try{
   const r=await ctx.request.head(url,{timeout:30000});
   if(r.status()===404||r.status()===410||r.status()===403)bad.push({url,http:r.status()});
  }catch(e){bad.push({url,error:String(e).slice(0,130)})}
  report.assetLinksChecked++;
 }};
 await Promise.all([head(),head(),head(),head(),head()]);
 report.brokenWpAssets=bad;
 const page=await ctx.newPage();
 for(const [id,path] of [["first","/tin-tuc-su-kien/bao-cao-tai-chinh"],["last","/tin-tuc-su-kien/bao-cao-tai-chinh/"+Math.ceil((report.wpCount||0)/12)]]){
  try{
   const r=await page.goto(front+path,{waitUntil:"domcontentloaded",timeout:50000});
   const body=await page.locator("body").innerText();
   report.frontend[id]={http:r?.status()||0,url:front+path,pagination:body.match(/Trang\s+\d+\s*\/\s*\d+/i)?.[0]||null,
     newest2026:body.includes("2026.11.05: CBTT"),bodyExcerpt:body.slice(0,250)};
  }catch(e){report.frontend[id]={error:String(e).slice(0,150)}}
 }
 await page.close();
 if(report.wpCount!==76)report.errors.push("WordPress finance archive count mismatch expected=76 actual="+report.wpCount);
 if(report.extraWpPosts.length)report.errors.push("WordPress finance archive has unrelated extra posts "+report.extraWpPosts.length);
 if(report.orderMismatches.length)report.errors.push("Source/target listing order mismatches "+report.orderMismatches.length);
 if(report.unmatched.length)report.errors.push("Unpublished original finance posts "+report.unmatched.length);
 if(report.missingDocumentLinks.length)report.errors.push("Missing source PDF links "+report.missingDocumentLinks.length);
 if(report.unverifiedDocumentLinks.length)report.errors.push("Financial PDF provenance unverified "+report.unverifiedDocumentLinks.length);
 if(report.postsWithExtraDocuments.length)report.errors.push("Unexpected extra financial PDF links "+report.postsWithExtraDocuments.length);
 if(report.brokenWpAssets.length)report.errors.push("Broken local finance files "+report.brokenWpAssets.length);
 if(report.oldHotlinks.length)report.errors.push("Legacy hosted media still referenced "+report.oldHotlinks.length);
 if(report.sourceErrors.length)report.errors.push("Original source details failed to load "+report.sourceErrors.length);
 if(report.frontend.first?.http!==200||report.frontend.last?.http!==200)report.errors.push("SSR financial report pagination HTTP failure");
 report.status=report.errors.length?"PARTIAL":"PASS_CANDIDATE";
 console.log("PSE_FINANCE_FINAL_MEDIA="+JSON.stringify({status:report.status,
   source:report.sourceCount,wp:report.wpCount,unmatched:report.unmatched,extra:report.extraWpPosts,orderMismatches:report.orderMismatches.slice(0,15),
   missingPdf:report.missingDocumentLinks.slice(0,20),
   filenameUnverified:report.unverifiedDocumentLinks.length,
   localFilesChecked:report.assetLinksChecked,broken:report.brokenWpAssets.slice(0,10),
   hotlinks:report.oldHotlinks.slice(0,10),front:report.frontend,errors:report.errors}));
}catch(e){report.errors.push(String(e));report.status="FAIL";console.error("PSE_FINANCE_FINAL_AUDIT_ERROR="+String(e))}
finally{await mkdir("artifacts/pse-finance-final-media",{recursive:true});await writeFile("artifacts/pse-finance-final-media/report.json",JSON.stringify(report,null,2)+"\n");await browser.close()}
if(report.status!=="PASS_CANDIDATE")process.exitCode=1;
