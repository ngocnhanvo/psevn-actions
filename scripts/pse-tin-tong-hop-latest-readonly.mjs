/** Source-current audit only: live first Joomla Tin tong hop page and target WP category, NO writes. */
import { chromium } from "playwright";
import { mkdir,writeFile } from "node:fs/promises";
const old="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop.html";
const wp="https://admin-pse.webnvn.com";
const browser=await chromium.launch({headless:true});
const out={mode:"READ_ONLY",source:old,sourcePosts:[],wpTop:[],wpSearch:[],status:"STARTED"};
try{
 const ctx=await browser.newContext({javaScriptEnabled:false,viewport:{width:1300,height:900}});
 const page=await ctx.newPage();
 const res=await page.goto(old,{waitUntil:"domcontentloaded",timeout:60000});
 if(res?.status()!==200)throw Error("Joomla first page HTTP "+res?.status());
 const raw=await page.evaluate(()=>{
  const root=document.querySelector(".blog")||document.querySelector("main")||document.body;
  const headings=[...root.querySelectorAll("h2,h3")].map(h=>{
    const t=(h.textContent||"").replace(/\s+/g," ").trim();
    if(t.length<12)return null;
    const parent=h.closest(".items-leading,.items-row,.item,article,[itemprop='articleBody']")||h.parentElement;
    return {title:t,tag:h.outerHTML.slice(0,500),containerTag:parent?.tagName||null,
      containerId:parent?.id||null,containerClass:parent?.className||null,
      containerAttrs:[...(parent?.attributes||[])].map(a=>[a.name,a.value]).slice(0,12),
      links:[...(parent?.querySelectorAll("a[href]")||[])].map(a=>({text:(a.textContent||"").trim().slice(0,60),href:a.href}))
       .filter(a=>a.href.includes("pse.vn")).slice(0,15),
      images:[...(parent?.querySelectorAll("img[src]")||[])].map(a=>a.getAttribute("src")).slice(0,20),
      times:[...(parent?.querySelectorAll("time,dd.created,dd.published,.article-info")||[])].map(a=>(a.textContent||"").replace(/\s+/g," ").trim().slice(0,160)).slice(0,8),
      text:(parent?.textContent||"").replace(/\s+/g," ").trim().slice(0,260)};
  }).filter(Boolean);
  return {title:document.title,canonical:document.querySelector('link[rel=canonical]')?.href,
    page:(root.textContent||"").match(/Page\s+\d+\s+of\s+\d+/i)?.[0],
    headings:headings.slice(0,14)};
 });
 out.sourcePosts=raw.headings;
 console.log("PSE_TONG_HOP_CURRENT_FIRST_PAGE="+JSON.stringify(raw));

 const interesting=raw.headings.filter(h=>(/2026|thủ tướng lê minh hưng/i).test(h.title)&&h.containerClass==="item column-1").slice(0,4);
 out.legacyNew=interesting.map(x=>({title:x.title,imageCount:x.images.length}));
 const probes=[
  old.replace(/\.html$/, ".feed?type=rss"),
  old.replace(/\.html$/, ".feed?type=atom"),
  "https://www.pse.vn/index.php?option=com_content&view=category&id=101&format=feed&type=rss",
  "https://www.pse.vn/index.php?option=com_content&view=category&id=101&format=feed&type=atom"
 ];
 out.sourceFeeds=[];
 for(const url of probes){
  const f={url,status:0,items:[],preview:""};
  try{
   const r=await ctx.request.get(url,{timeout:32000,failOnStatusCode:false});
   f.status=r.status();f.contentType=r.headers()["content-type"];
   const body=(await r.text()).slice(0,220000);
   if(/<rss|<feed/i.test(body)){
    const blocks=[...body.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0,12);
    const tag=(t,key)=>t.match(new RegExp("<"+key+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+key+">","i"))?.[1]?.replace(/<[^>]*>/g," ").trim()||"";
    f.items=blocks.map(m=>({title:tag(m[2],"title").slice(0,140),pubDate:tag(m[2],"pubDate")||tag(m[2],"published"),guid:tag(m[2],"guid")||tag(m[2],"id"),link:tag(m[2],"link")}));
   }else f.preview=body.replace(/\s+/g," ").slice(0,140);
  }catch(e){f.error=String(e).slice(0,150)}
  out.sourceFeeds.push(f);
 }
 console.log("PSE_TONG_HOP_JOOMLA_FEEDS="+JSON.stringify(out.sourceFeeds));
 out.searchResults=[];
 const searchCtx=await browser.newContext({viewport:{width:1200,height:900}});
 await searchCtx.route(/\.(?:png|jpe?g|webp|svg|gif|woff2?|ttf)(?:[?#]|$)/i,route=>route.abort());
 for(const headline of interesting){
  const words=headline.title.split(/\s+/).slice(0,9).join(" ");
  const url="https://www.pse.vn/component/search/?searchword="+encodeURIComponent(words)+"&ordering=newest&searchphrase=all";
  const item={title:headline.title,query:words,matches:[],http:null};
  const p=await searchCtx.newPage();
  try{
   const r=await p.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
   item.http=r?.status();
   item.matches=await p.evaluate(()=>[...document.querySelectorAll("dl.search-results dt.result-title a[href],.search-results a[href],.result-title a[href]")].map(a=>{
     const dt=a.closest("dt");let dates=[];
     let s=dt?.nextElementSibling;while(s&&s.tagName!=="DT"){if(/created|date/i.test(s.className))dates.push(s.textContent.trim());s=s.nextElementSibling}
     return {title:(a.textContent||"").replace(/\s+/g," ").trim(),href:a.href,dates};
   }).slice(0,16));
  }catch(e){item.error=String(e).slice(0,150)}finally{await p.close()}
  out.searchResults.push(item);
 }
 await searchCtx.close();
 console.log("PSE_TONG_HOP_JOOMLA_LATEST_SEARCH="+JSON.stringify(out.searchResults));
 // Public REST is secondary verification. A transient 5xx/network outage must
 // not erase the independent Joomla source discovery results.
 out.wpSearch=[];
 for(const headline of interesting){
  let result={title:headline.title,http:null,results:[]};
  for(let attempt=1;attempt<=2;attempt++){
   try{
    const r=await ctx.request.get(wp+"/wp-json/wp/v2/posts?search="+encodeURIComponent(headline.title.slice(0,55))+
     "&status=publish&per_page=20&_fields=id,slug,title,date,categories,status",{timeout:45000,failOnStatusCode:false});
    result.http=r.status();const rows=await r.json().catch(()=>null);
    result.results=Array.isArray(rows)?rows.map(p=>({id:p.id,date:p.date,title:p.title?.rendered?.replace(/<[^>]*>/g,""),categories:p.categories})):[];
    break;
   }catch(e){result.error=String(e).slice(0,145);if(attempt<2)await new Promise(done=>setTimeout(done,1200))}
  }
  out.wpSearch.push(result);
 }
 console.log("PSE_TONG_HOP_LATEST_TITLE_REST_MATCH="+JSON.stringify(out.wpSearch));
 out.status="PASS";
}catch(e){out.status="FAILED";out.error=String(e).slice(0,500);console.error("PSE_TONG_HOP_LATEST_SOURCE_ERROR="+out.error);process.exitCode=1}
finally{await mkdir("artifacts/pse-tin-tong-hop-latest",{recursive:true});
 await writeFile("artifacts/pse-tin-tong-hop-latest/report.json",JSON.stringify(out,null,2));
 await browser.close();}
