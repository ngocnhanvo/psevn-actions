/** Resolve the six residual checks from full PSE 190-media audit 44705310926.
 * Read-only; four Joomla timeouts, one suspected legacy PDF alias, and
 * article 1213's post-repair publication readback.
 */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const SOURCE="https://www.pse.vn/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin/";
const TARGETS=Object.freeze([
 ["1362","1362-20190708-cv38-dnb-hdqt-cbtt-hop-dong-cung-cap-dv-kiem-toan-bctc-nam-2019.html",79362],
 ["1468","1468-20210621-thong-bao-cap-nhat-va-bo-sung-tai-lieu-dhdcd-thuong-nien-nam-2021.html",77401],
 ["1477","1477-20210714-cbtt-hop-dong-cung-cap-dich-vu-kiem-toan-bctc-nam-2021.html",79170],
 ["1504","1504-20220208-cbtt-ke-hoach-kinh-doanh-nam-2022.html",77172]
]);
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const lines=env.filter(x=>x.startsWith("WC_URL="));
if(lines.length!==1)throw Error("Expected one WP origin");
const base=new URL(lines[0].slice(7).replace(/^['"]|['"]$/g,""));
if(base.protocol!=="https:"||base.username||base.password||base.search||base.hash||!["","/"].includes(base.pathname))throw Error("Invalid WP origin");
const wp=base.origin,browser=await chromium.launch({headless:true});
const out={schema:"pse-disclosure-media-targeted-v1",origin:wp,articles:[],alias:{},post1213:{},errors:[]};
try{
 const ctx=await browser.newContext({ignoreHTTPSErrors:false});
 const parse=await ctx.newPage();
 const parseAssets=async({html,sourceUrl,wpHtml})=>parse.evaluate(({html,sourceUrl,wpHtml,wp})=>{
  const pat=/\.(?:pdf|zip|rar|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|svg)(?:[?#]|$)/i;
  const scan=(text,root,base)=>{
   const doc=new DOMParser().parseFromString(text,"text/html"),el=doc.querySelector(root);
   if(!el)throw Error("Missing article/content DOM "+root);
   const list=[...el.querySelectorAll("a[href],img[src],iframe[src],object[data],embed[src]")].map(x=>{
    try{
     const raw=x.getAttribute("href")||x.getAttribute("src")||x.getAttribute("data");
     if(!raw||!pat.test(raw))return null;
     const u=new URL(raw,base);
     if(base===sourceUrl&&!["pse.vn","www.pse.vn"].includes(u.hostname))return null;
     return {url:u.href,kind:/\.(?:jpe?g|png|gif|webp|svg)$/i.test(u.pathname)?"image":"document"};
    }catch{return null}
   }).filter(Boolean);
   return [...new Map(list.map(x=>[x.url,x])).values()];
  };
  return {source:scan(html,'[itemprop="articleBody"]',sourceUrl),
   wp:scan(wpHtml,"body",wp)};
 },{html,sourceUrl,wpHtml,wp});
 const wpget=async(path)=>{
  const r=await ctx.request.get(wp+path,{timeout:40000});
  return {http:r.status(),body:await r.json().catch(()=>null)};
 };
 await Promise.all(TARGETS.map(async([id,filename,wpId])=>{
  const url=SOURCE+filename,record={id,url,wpId,sourceHttp:null,attempts:0,mediaCounts:null};
  let body=null;
  for(let attempt=1;attempt<=3;attempt++){
   record.attempts=attempt;
   try{
    const r=await ctx.request.get(url,{timeout:30000,headers:{"User-Agent":"Mozilla/5.0 (compatible; PSE-Disclosure-Validation/1.0)"}});
    record.sourceHttp=r.status();
    if(r.status()!==200)throw Error("Source HTTP "+r.status());
    body=await r.text();
    if(!body.includes("articleBody"))throw Error("Article body not found in response");
    break;
   }catch(e){record.error=String(e).slice(0,160)}
  }
  try{
   if(body){
    const res=await wpget("/wp-json/wp/v2/posts/"+wpId+"?_fields=id,slug,status,categories,content");
    if(res.http!==200||res.body?.id!==wpId||!res.body?.categories?.includes(1753))throw Error("WP post missing/wrong category");
    const data=await parseAssets({html:body,sourceUrl:url,wpHtml:res.body.content?.rendered||""});
    const count=(a,k)=>a.filter(x=>x.kind===k).length;
    record.mediaCounts={sourceDocs:count(data.source,"document"),wpDocs:count(data.wp,"document"),sourceImgs:count(data.source,"image"),wpImgs:count(data.wp,"image")};
    record.mediaPass=record.mediaCounts.sourceDocs<=record.mediaCounts.wpDocs&&record.mediaCounts.sourceImgs<=record.mediaCounts.wpImgs;
    if(!record.mediaPass){record.sourceFiles=data.source;record.wpFiles=data.wp;}
   }
  }catch(e){record.error=String(e).slice(0,200)}
  out.articles.push(record);
  console.log("PSE_MEDIA_TARGET_ARTICLE="+JSON.stringify(record).slice(0,4000));
 }));
 const aliases=["https://www.pse.vn/images/Uy-Quyen.pdf","https://www.pse.vn/images/uy_quyen.pdf"];
 for(const url of aliases){
  const item={url};
  try{
   const head=await ctx.request.head(url,{timeout:30000});
   item.head={http:head.status(),type:head.headers()["content-type"]||null,bytes:head.headers()["content-length"]||null,final:head.url()};
  }catch(e){item.headError=String(e).slice(0,160)}
  if(!item.head||[200,206,405].includes(item.head.http)){
   try{
    const r=await ctx.request.get(url,{timeout:50000,headers:{Range:"bytes=0-4095"}});
    const body=await r.body();
    item.get={http:r.status(),type:r.headers()["content-type"]||null,bytes:body.length,signature:body.subarray(0,6).toString("hex"),final:r.url()};
   }catch(e){item.getError=String(e).slice(0,160)}
  }
  out.alias[url]=item;
  console.log("PSE_MEDIA_ALIAS="+JSON.stringify(item));
 }
 const post=await wpget("/wp-json/wp/v2/posts/79397?_fields=id,status,content,categories");
 const html=String(post.body?.content?.rendered||"");
 out.post1213={http:post.http,localZip:html.includes("/wp-content/uploads/2026/11/")&&html.includes(".zip"),oldZip:html.includes("www.pse.vn/images/pdf/2016/04/2016_04_26_CBTT_-_UY_QUYEN_CBTT.zip"),wpId:post.body?.id};
 console.log("PSE_MEDIA_POST1213="+JSON.stringify(out.post1213));
}finally{
 await mkdir("artifacts/pse-disclosure-media-targeted",{recursive:true});
 await writeFile("artifacts/pse-disclosure-media-targeted/report.json",JSON.stringify(out,null,2)+"\n");
 await browser.close();
}
const alias=out.alias["https://www.pse.vn/images/uy_quyen.pdf"];
const aliasBroken=(alias?.head?.http===404||alias?.head?.http===410||alias?.get?.http===404||alias?.get?.http===410);
const pass=out.articles.length===4&&out.articles.every(x=>x.sourceHttp===200&&x.mediaPass===true)&&aliasBroken&&out.post1213.http===200&&out.post1213.localZip&&!out.post1213.oldZip;
console.log("PSE_MEDIA_TARGETED_RECHECK="+JSON.stringify({pass,articles:out.articles.length,sourceFailed:out.articles.filter(x=>x.sourceHttp!==200).map(x=>x.id),mediaMismatch:out.articles.filter(x=>x.mediaPass!==true).map(x=>x.id),brokenAlias:aliasBroken,post1213:out.post1213}));
if(!pass)process.exitCode=1;
