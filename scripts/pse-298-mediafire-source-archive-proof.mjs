/** Exact archived original Joomla #298 linked PDF provenance, READ ONLY. */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong PSE repo");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const source=state.articles?.[298]?.source_url||"",u=new URL(source);
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 state.articles[298]?.wp_id!==82548||
 u.origin!=="https://www.pse.vn"||!u.pathname.includes("/298-pvfcco-se-cong-bo-thong-tin-bao-cao-tai-chinh-ban-nien-2012-da-duoc-soat-xet.html"))
 throw Error("Original #298 identity drift");
const oldPdf="http://www.mediafire.com/file/mn5v49y1db5me3h/scan0001.pdf";
const wp="https://admin-pse.webnvn.com",archive="https://web.archive.org";
const net=await request.newContext({timeout:22000}),browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false}),page=await ctx.newPage();await ctx.route("**/*",r=>r.abort());
const report={schema:"pse-298-original-mediafire-legacy-source-provenance-v1",
 readOnly:true,noCmsWrites:true,noBuild:true,sourceUrl:source,originalMediafire:oldPdf,indexes:[],captures:[],summary:null};
const get=async url=>{
 if(new URL(url).origin!==archive)throw Error("Source outside archive");
 return net.get(url,{timeout:19000,maxRedirects:0,failOnStatusCode:false});
};
try{
 const resp=await net.get(wp+"/wp-json/wp/v2/posts/82548?_fields=id,slug,status,title,content",{timeout:30000});
 if(resp.status()!==200)throw Error("Native WP #82548 unavailable");
 const p=await resp.json();
 if(p.id!==82548||p.status!=="publish"||!String(p.content?.rendered||"").includes("mn5v49y1db5me3h"))
  throw Error("Native original legacy MediaFire link changed");
 const variants=["http://www.pse.vn","https://www.pse.vn","http://pse.vn","https://pse.vn"].map(x=>x+u.pathname);
 const captures=new Map();
 await Promise.all(variants.map(async variant=>{
  const q=new URL(archive+"/cdx/search/cdx");
  for(const [k,v] of Object.entries({url:variant,output:"json",filter:"statuscode:200",
   fl:"timestamp,original,statuscode,mimetype",collapse:"timestamp:4",limit:"12"}))q.searchParams.set(k,v);
  const row={variant,http:null,found:0,reason:null};report.indexes.push(row);
  try{
   const res=await get(q.href);row.http=res.status();
   if(res.status()!==200){row.reason="INDEX_HTTP_"+res.status();return}
   const str=await res.text();if(str.length>100000){row.reason="INDEX_OVERSIZE";return}
   let data;try{data=JSON.parse(str)}catch{row.reason="INDEX_JSON_INVALID";return}
   if(!Array.isArray(data)||data[0]?.[0]!=="timestamp"){row.reason="NO_INDEX";return}
   for(const [ts,orig,status,mime] of data.slice(1)){
    if(!/^\d{14}$/.test(String(ts))||ts.slice(0,8)>"20261121"||
     String(status)!=="200"||!/html/i.test(mime||""))continue;
    const ou=new URL(orig);
    if(!["www.pse.vn","pse.vn"].includes(ou.hostname)||ou.pathname!==u.pathname||
     !["http:","https:"].includes(ou.protocol))continue;
    const key=ts+"|"+orig;if(!captures.has(key)){captures.set(key,{ts,orig});row.found++}
   }
  }catch(e){row.reason="ARCHIVE_UNAVAILABLE";row.error=String(e?.name||"network").slice(0,80)}
 }));
 console.log("PSE_298_SOURCE_ARCHIVE_INDEX="+JSON.stringify({variants:report.indexes,found:captures.size}).slice(0,4300));
 for(const c of [...captures.values()].sort((a,b)=>a.ts.localeCompare(b.ts)).slice(0,12)){
  const entry={timestamp:c.ts,originalUrl:c.orig,http:null,title:null,sourceBodyChars:0,
   originalPdfHrefs:[],otherFiles:[],decision:"NOT_VERIFIED"};
  report.captures.push(entry);
  try{
   const res=await get(archive+"/web/"+c.ts+"id_/"+c.orig);
   entry.http=res.status();
   if(res.status()!==200||!String(res.headers()["content-type"]||"").includes("text/html")){
    entry.decision="NON_HTML_ARCHIVE";continue}
   const html=await res.text();if(html.length<300||html.length>5000000){entry.decision="HTML_INVALID_SIZE";continue}
   await page.setContent('<base href="'+c.orig+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),
    {waitUntil:"domcontentloaded",timeout:18000});
   const v=await page.evaluate(()=>{
    const n=s=>String(s||"").replace(/\s+/g," ").trim();
    const root=(document.querySelector('[itemprop="articleBody"]')||
     document.querySelector(".item-page")||document.querySelector("article"));
    const content=root?.cloneNode(true);
    content?.querySelectorAll(".extranews_box,.extranews_separator,.pagenav,.pagination").forEach(x=>x.remove());
    const links=[...content?.querySelectorAll("a[href]")||[]].map(x=>{
     const href=x.getAttribute("href");
     try{return{url:new URL(href,document.baseURI).href,title:n(x.textContent)}}catch{return null}
    }).filter(Boolean);
    return{title:n(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||document.title),
     body:n(content?.textContent||""),links};
   });
   entry.title=v.title;entry.sourceBodyChars=v.body.length;
   entry.originalPdfHrefs=v.links.filter(x=>x.url.includes("mediafire.com"));
   entry.otherFiles=v.links.filter(x=>/\.(?:pdf|docx?|xlsx?)(?:$|[?#])/i.test(x.url)&&!x.url.includes("mediafire.com")).slice(0,6);
   const exact=entry.originalPdfHrefs.filter(x=>{
    try{const xurl=new URL(x.url);return xurl.hostname==="www.mediafire.com"&&xurl.pathname==="/file/mn5v49y1db5me3h/scan0001.pdf"}catch{return false}
   });
   entry.decision=/tài chính bán niên 2012|soát xét/i.test(v.title)&&exact.length===1?
    "EXACT_JOOMLA_ORIGINAL_ALREADY_LINKED_MEDIAFIRE_FILE":
    "ORIGINAL_DOCUMENT_LINK_NOT_PROVEN";
  }catch(e){entry.decision="ARCHIVE_CAPTURE_UNAVAILABLE";entry.error=String(e?.name||"network").slice(0,90)}
  console.log("PSE_298_ARCHIVED_SOURCE_ROW="+JSON.stringify(entry).slice(0,4300));
 }
 report.summary={archivesChecked:report.captures.length,sourceMediafireExactCaptures:
  report.captures.filter(x=>x.decision==="EXACT_JOOMLA_ORIGINAL_ALREADY_LINKED_MEDIAFIRE_FILE").length,
  result:report.captures.some(x=>x.decision==="EXACT_JOOMLA_ORIGINAL_ALREADY_LINKED_MEDIAFIRE_FILE")?
   "LEGACY_EXTERNAL_PDF_ALREADY_OWNED_BY_SOURCE":"EXACT_JOOMLA_LINK_PROVENANCE_UNAVAILABLE",
  noCmsWrites:true,noBuild:true};
 console.log("PSE_298_ORIGINAL_PDF_PROVENANCE_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-298-original-mediafire",{recursive:true});
 await writeFile("artifacts/pse-298-original-mediafire/report.json",JSON.stringify(report,null,2)+"\n");
 await page.close();await ctx.close();await browser.close();await net.dispose();
}
