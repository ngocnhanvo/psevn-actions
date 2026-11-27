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
 const api=async(path)=>{
  const r=await ctx.request.get(wp+path,{timeout:40000,failOnStatusCode:false});
  return {status:r.status(),total:Number(r.headers()["x-wp-total"]||0),json:await r.json().catch(()=>null)};
 };
 const list=await api("/wp-json/wp/v2/posts?categories=1746&status=publish&per_page=30&orderby=date&order=desc&_fields=id,slug,title,date,status,categories");
 if(list.status!==200||!Array.isArray(list.json))throw Error("WP Tin tong hop REST failed HTTP "+list.status);
 out.wpTop=list.json.map(p=>({id:p.id,slug:p.slug,title:p.title?.rendered?.replace(/<[^>]*>/g,""),date:p.date,categories:p.categories}));
 out.wpTotal=list.total;
 console.log("PSE_TONG_HOP_WP_TOP="+JSON.stringify({total:out.wpTotal,posts:out.wpTop.slice(0,20)}));
 for(const t of raw.headings.slice(0,7)){
  const phrase=t.title.slice(0,50);
  const r=await api("/wp-json/wp/v2/posts?search="+encodeURIComponent(phrase)+"&status=publish&per_page=20&_fields=id,slug,title,date,categories,status");
  out.wpSearch.push({title:t.title,query:phrase,results:r.status===200&&Array.isArray(r.json)?r.json.map(x=>({id:x.id,date:x.date,title:x.title?.rendered?.replace(/<[^>]*>/g,""),categories:x.categories})):[],http:r.status});
 }
 console.log("PSE_TONG_HOP_LATEST_TITLE_REST_MATCH="+JSON.stringify(out.wpSearch));
 out.status="PASS";
}catch(e){out.status="FAILED";out.error=String(e).slice(0,500);console.error("PSE_TONG_HOP_LATEST_SOURCE_ERROR="+out.error);process.exitCode=1}
finally{await mkdir("artifacts/pse-tin-tong-hop-latest",{recursive:true});
 await writeFile("artifacts/pse-tin-tong-hop-latest/report.json",JSON.stringify(out,null,2));
 await browser.close();}
