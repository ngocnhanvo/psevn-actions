/** Exact Joomla archived publish-day proof for #1282 and missing anchor proof #1590. READ ONLY. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900}});
const report={schema:"pse-finance-source-evidence-1282-1590-v1",dateProof:[],missingAnchor:null,errors:[]};
try{
 for(const p of [48,54,60]){
  const url="https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh.html?start="+p;
  try{
   const r=await page.goto(url,{waitUntil:"domcontentloaded",timeout:50000});
   if(r?.status()!==200)throw Error("Original archive HTTP "+r?.status());
   const rows=await page.evaluate(()=>{
    return [...document.querySelectorAll('a[href*="/bao-cao-tai-chinh/"]')].map(a=>{
     const m=a.href.match(/\/(1282|1284|1292)-[^/]+\.html/i);
     if(!m)return null;
     const ancestor=a.closest('[itemprop="blogPost"],article,.item,.leading-0,.row,li')||a.parentElement;
     const parent=ancestor?.parentElement;
     const text=String(ancestor?.textContent||"").replace(/\s+/g," ").trim().slice(0,500);
     const date=ancestor?.querySelector('time[datetime],.published,.created,[itemprop="datePublished"],.article-info')||
       parent?.querySelector('time[datetime],.published,.created,[itemprop="datePublished"],.article-info');
     return {id:m[1],href:a.href,title:(a.textContent||"").replace(/\s+/g," ").trim(),
       ancestorTag:ancestor?.tagName,ancestorClass:ancestor?.className,
       text,dateText:String(date?.textContent||"").replace(/\s+/g," ").trim(),
       dateTime:date?.getAttribute?.("datetime")||date?.getAttribute?.("content")||null,
       ancestorHTML:ancestor?.outerHTML.slice(0,2600)};
    }).filter(Boolean);
   });
   report.dateProof.push({url,rows});
   console.log("PSE_FINANCE_ARCHIVE_DAY_PROOF="+JSON.stringify({page:p,rows:rows.map(x=>({
    id:x.id,href:x.href,title:x.title,tag:x.ancestorTag,cls:x.ancestorClass,
    text:x.text,dateText:x.dateText,dateTime:x.dateTime,html:x.ancestorHTML.slice(0,1000)
   }))}));
  }catch(e){report.errors.push({page:p,error:String(e).slice(0,170)})}
 }
 const src="https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh/1590-20240814-cbtt-bao-cao-tai-chinh-ban-nien-2024-da-duoc-kiem-toan.html";
 const r=await page.goto(src,{waitUntil:"domcontentloaded",timeout:50000});
 if(r?.status()!==200)throw Error("Original detail HTTP "+r?.status());
 report.missingAnchor=await page.evaluate(()=>{
  const all=[...document.querySelectorAll('a[href]')];
  const a=all.find(a=>a.href.includes("20230814-CV-52-DNB-HDQT"));
  if(!a)return null;
  return{outerHTML:a.outerHTML,parentHTML:a.parentElement?.outerHTML.slice(0,4500),
   before:a.previousElementSibling?.outerHTML.slice(0,1200),
   after:a.nextElementSibling?.outerHTML.slice(0,1200)};
 });
 console.log("PSE_FINANCE_1590_SOURCE_ANCHOR="+JSON.stringify(report.missingAnchor));
}finally{
 await mkdir("artifacts/pse-finance-source-proof",{recursive:true});
 await writeFile("artifacts/pse-finance-source-proof/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
if(!report.missingAnchor||report.errors.length)process.exitCode=1;
