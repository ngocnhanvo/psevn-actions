/** Exact original Joomla missing-photo filename to existing WordPress Media lookup.
 * READ ONLY. A matching name is a lead, not image provenance or permission to publish.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const ids=[205,226,227,229,230,240,321,382];
if(state.schema!=="pse-legacy-article-migration-v1"||
   process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
   ids.some(i=>state.articles[i]?.status!=="quarantined"||
     state.articles[i]?.reason!=="Original media HTTP 404"))
 throw Error("Unexpected exact missing-original source identity; no mutation");
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const u=rows.filter(s=>s.startsWith("WC_URL="));
if(u.length!==1)throw Error("Missing unique WordPress origin");
const wp=new URL(u[0].slice(7).replace(/^['"]|['"]$/g,""));
if(wp.protocol!=="https:"||wp.username||wp.password||wp.search||wp.hash||!["","/"].includes(wp.pathname))
 throw Error("Untrusted WP origin");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false});
const req=await request.newContext({timeout:40000});
await ctx.route("**/*",r=>r.abort());
const cleanName=raw=>{
 try{
  const name=decodeURIComponent(new URL(raw).pathname.split("/").at(-1)||"");
  if(!/\.(jpe?g|png|gif|webp)$/i.test(name))return null;
  return name.replace(/\?.*$/,"").toLowerCase();
 }catch{return null}
};
const report={schema:"pse-original-photo-wp-filename-exact-leads-v1",readOnly:true,createdAt:new Date().toISOString(),sources:[],summary:{}};
try{
 for(const id of ids){
  const source=state.articles[id].source_url;
  if(!source.startsWith("https://www.pse.vn/"))throw Error("Unexpected source URL "+id);
  const res=await req.get(source,{timeout:45000,maxRedirects:2});
  if(res.status()!==200)throw Error("Joomla article "+id+" HTTP "+res.status());
  const html=await res.text();
  if(html.length<200||html.length>8000000)throw Error("Untrusted HTML original "+id);
  const page=await ctx.newPage();
  let srcs=[];
  try{
   await page.setContent('<base href="'+source+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded",timeout:20000});
   srcs=await page.evaluate(()=>{
    const e=document.querySelector(".item-page [itemprop=articleBody]")||
     document.querySelector(".item-page")||document.querySelector("article");
    const all=[...(e?.querySelectorAll("img[src],a[href]")||[])];
    const imgs=all.map(n=>{
     const raw=n.getAttribute(n.tagName==="A"?"href":"src")||"";
     let url;try{url=new URL(raw,document.baseURI).href}catch{return null}
     return {url,alt:(n.getAttribute("alt")||n.textContent||"").replace(/\s+/g," ").trim().slice(0,100)}
    }).filter(x=>x&&/^https?:/.test(x.url)&&/\.(?:jpe?g|png|gif|webp)(?:\?|$)/i.test(x.url));
    return [...new Map(imgs.map(x=>[x.url,x])).values()].slice(0,18);
   });
  }finally{await page.close()}
  const row={id,source,originalPhotos:srcs.length,results:[]};
  for(const original of srcs){
   const filename=cleanName(original.url);
   if(!filename)continue;
   const stem=filename.replace(/\.[^.]+$/,"");
   const query=stem.replace(/[_-]+/g," ").trim();
   const r=await req.get(wp.origin+"/wp-json/wp/v2/media?search="+encodeURIComponent(query)+
    "&per_page=100&_fields=id,slug,source_url,media_details,alt_text,title",{timeout:30000});
   const items=r.status()===200?await r.json():[];
   const exact=Array.isArray(items)?items.filter(x=>{
     const file=String(x.media_details?.file||"").split("/").at(-1)||"";
     return file.toLowerCase()===filename;
   }).map(x=>({id:x.id,sourceUrl:x.source_url,alt:(x.alt_text||"").slice(0,100)})):[];
   row.results.push({original:original.url,filename,sourceAlt:original.alt,
      restHttp:r.status(),mediaCandidates:exact,decision:exact.length?"VERIFY_PROVENANCE_MANUALLY":"NO_EXACT_FILENAME"});
  }
  report.sources.push(row);
  console.log("PSE_MISSING_MEDIA_WP_LOOKUP="+JSON.stringify({id,originalPhotos:row.originalPhotos,exactFilenameLeads:row.results.filter(x=>x.mediaCandidates.length).length}));
 }
 report.summary={originalArticles:report.sources.length,scannedPhotos:report.sources.reduce((n,r)=>n+r.results.length,0),
  exactFilenameLeads:report.sources.reduce((n,r)=>n+r.results.filter(x=>x.mediaCandidates.length>0).length,0),
  noWordPressWrites:true};
 await mkdir("artifacts/pse-missing-original-media-wp",{recursive:true});
 await writeFile("artifacts/pse-missing-original-media-wp/report.json",JSON.stringify(report,null,2)+"\n");
 console.log("PSE_MISSING_MEDIA_WP_REUSE="+JSON.stringify(report.summary));
}finally{await req.dispose();await ctx.close();await browser.close()}
