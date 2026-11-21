/** One source identity collision (#1601): public, read-only Joomla vs WP & frontend proof. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const source=state.articles?.["1601"];
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 Number(source?.wp_id)!==82828||
 !String(source.source_url||"").startsWith("https://www.pse.vn/"))
 throw Error("PSE Joomla 1601 source identity changed");
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=k=>{const a=vars.filter(v=>v.startsWith(k+"="));if(a.length!==1)throw Error(k+" unavailable");const x=new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));if(x.protocol!=="https:"||x.username||x.password||x.search||x.hash||!["","/"].includes(x.pathname))throw Error("Wrong URL "+k);return x.origin};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT"),expectedSlug=new URL(source.source_url).pathname.split("/").at(-1).replace(/^1601-/,"").replace(/\.html$/,"");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext();
const clean=s=>String(s||"").replace(/<[^>]*>/g," ").replace(/&(?:amp|nbsp|quot|lt|gt);/gi," ").replace(/\s+/g," ").trim();
const tokens=s=>new Set(clean(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>=4));
const overlap=(a,b)=>{const A=tokens(a),B=tokens(b);return A.size?Number(([...A].filter(t=>B.has(t)).length/A.size).toFixed(3)):0};
const report={schema:"pse-joomla-1601-wp-collision-v1",readOnly:true,sourceId:1601,source:source.source_url,expectedSlug,wordpress:[],frontend:[],sourceDetail:null};
try{
 const src=await ctx.newPage();
 const s=await src.goto(source.source_url,{waitUntil:"domcontentloaded",timeout:45000});
 const sourceInfo=await src.evaluate(()=>{
  const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page")||document.querySelector("article");
  return {title:(document.querySelector("h1")?.textContent||document.title||"").trim(),
    body:(root?.textContent||"").replace(/\s+/g," ").trim()};
 });
 report.sourceDetail={http:s?.status()||0,title:sourceInfo.title,bodyChars:sourceInfo.body.length};
 for(const id of [82828,77405]){
  const r=await ctx.request.get(wp+"/wp-json/wp/v2/posts/"+id+"?_fields=id,slug,status,title,date,categories,content,link",{timeout:25000});
  if(r.status()!==200)throw Error("Native public post unavailable "+id);
  const p=await r.json(),body=clean(p.content?.rendered);
  const entry={id:p.id,status:p.status,slug:p.slug,title:clean(p.title?.rendered),
    date:p.date,categories:p.categories,bodyChars:body.length,
    sourceTitleExact:clean(p.title?.rendered).toLowerCase()===sourceInfo.title.toLowerCase(),
    bodyTokenOverlap:overlap(sourceInfo.body,body)};
  report.wordpress.push(entry);
  const url=front+"/"+p.slug;
  let target=null,error=null;
  for(let attempt=1;attempt<=3;attempt++){
   try{target=await ctx.request.get(url,{maxRedirects:0,timeout:20000,failOnStatusCode:false});break}
   catch(e){error=String(e?.code||e?.name||"network").slice(0,45);
    if(attempt<3)await new Promise(resolve=>setTimeout(resolve,attempt*1500));}
  }
  const html=target?.status()===200?await target.text():"";
  const canonical=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||
   html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
  const c=canonical?new URL(canonical,front):null;
  report.frontend.push({wpId:p.id,pathname:"/"+p.slug,status:target?.status()||null,error:target?null:error,
    canonicalCorrect:!!c&&c.origin===front&&c.pathname==="/"+p.slug&&!c.search&&!c.hash});
 }
 await mkdir("artifacts/pse-1601-collision",{recursive:true});
 await writeFile("artifacts/pse-1601-collision/result.json",JSON.stringify(report,null,2)+"\n");
 console.log("PSE_JOOMLA_1601_COLLISION="+JSON.stringify(report));
 console.log("PSE_1601_READ_ONLY=true; wordpress_writes=0; astro_build=0");
 if(report.frontend.some(x=>x.error))process.exitCode=1;
}finally{await ctx.close();await browser.close()}
