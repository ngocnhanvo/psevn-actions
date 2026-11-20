/** Read-only PSE Joomla archive chronology check (especially legacy article 1742). */
import {chromium} from "playwright";
const browser=await chromium.launch({headless:true});
const source="https://www.pse.vn/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin.html";
const target="https://pse.webnvn.com/tin-tuc-su-kien/ban-cong-bo-thong-tin";
try{
 const page=await browser.newPage({viewport:{width:1400,height:900}});
 await page.route(/\.(?:png|jpe?g|webp|svg|gif|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
 for(const [label,url] of [["source",source],["frontend",target]]){
  const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
  const data=await page.evaluate(()=>{
   const root=document.querySelector(".blog")||document.querySelector("main")||document.body;
   const articles=[...root.querySelectorAll('[itemprop="blogPost"],article,.blog-item,.item')];
   const itemlist=articles.length?articles:[root];
   const entries=itemlist.map((el,i)=>{
    const links=[...el.querySelectorAll("a[href]")].filter(x=>/\b(?:1740|1742)\b/.test(x.href)||/\/\d{2,6}-[^/]+\.html/.test(x.href));
    if(!links.length)return null;
    const link=links.find(x=>/\b(1740|1742)\b/.test(x.href))||links[0];
    return {index:i,title:String(el.querySelector("h2,h3")?.textContent||link.textContent||"").replace(/\s+/g," ").trim().slice(0,180),
     link:link.href,excerpt:String(el.textContent||"").replace(/\s+/g," ").trim().slice(0,290),
     time:[...el.querySelectorAll("time,.published,dd.published,dd.created,[itemprop=datePublished]")].map(x=>({text:x.textContent?.trim()||"",datetime:x.getAttribute("datetime")||x.getAttribute("content")||""})).slice(0,5)};
   }).filter(Boolean);
   const two=entries.filter(x=>/1740|1742|báo cáo tài chính bán niên 2026|bổ nhiệm cán bộ/i.test(x.title+" "+x.link)).slice(0,15);
   const raw=String(root.textContent||"").replace(/\s+/g," ").trim().slice(0,2800);
   const el1740=[...root.querySelectorAll('a[href]')].filter(x=>x.href.includes("/1740-")).slice(0,3).map(x=>({href:x.href,parent:x.closest("article,.item,[itemprop=blogPost]")?.textContent?.replace(/\s+/g," ").trim().slice(0,260)}));
   const el1742=[...root.querySelectorAll('a[href]')].filter(x=>x.href.includes("/1742-")).slice(0,3).map(x=>({href:x.href,parent:x.closest("article,.item,[itemprop=blogPost]")?.textContent?.replace(/\s+/g," ").trim().slice(0,260)}));
   return {articles:entries.slice(0,15),two,el1740,el1742,raw};
  });
  console.log("PSE_DATE_ORDER_"+label.toUpperCase()+"="+JSON.stringify({http:response?.status(),url,...data}).slice(0,18000));
 }
 for(const id of ["1740","1742"]){
  const file=id==="1740"?"1740-20261112-cbtt-tiep-nhan-va-bo-nhiem-can-bo.html":"1742-20260813-cbtt-bao-cao-tai-chinh-ban-nien-2026.html";
  const url=source.replace(/[.]html$/,"/")+file;
  const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
  const data=await page.evaluate(()=>{
   return {title:document.title,
    dates:[...document.querySelectorAll('meta[property="article:published_time"],meta[itemprop="datePublished"],meta[name="date"],time[datetime],dd.published,dd.created,[itemprop="datePublished"]')].map(e=>({text:String(e.textContent||"").trim(),content:e.getAttribute("content")||e.getAttribute("datetime")||null})).slice(0,30),
    visibleDate:String(document.querySelector(".article-info")?.textContent||"").replace(/\s+/g," ").trim().slice(0,300)};
  });
  console.log("PSE_DATE_DETAIL_"+id+"="+JSON.stringify({http:response?.status(),url,...data}));
 }
}finally{await browser.close()}
