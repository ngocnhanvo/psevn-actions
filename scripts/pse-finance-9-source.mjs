/** PSE finance recovery source-only preflight: 9 independently discovered source IDs; NO CMS writes. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const stems=Object.freeze({
 "1738":"20261105-cbtt-dinh-chinh-thong-tin-da-cong-bo-trong-bctc-quy-3-2026",
 "1666":"20260320-cbtt-bao-cao-tai-chinh-da-kiem-toan-nam-2025-va-giai-trinh-chenh-lech-lnst",
 "1650":"20250814-cbtt-bao-cao-tai-chinh-ban-nien-nam-2025-va-giai-trinh-chenh-lech-lnst-so-voi-cung-ky",
 "1480":"20210812-cv53-dnb-hdqt-cbtt-bctc-giua-nien-do-da-duoc-soat-xet",
 "1148":"bao-cao-tai-chinh-quy-3-2015",
 "1137":"bao-cao-tai-chinh-ban-nien-2015",
 "337":"bao-cao-tai-chinh-da-duoc-kiem-toan-nam-2012-cua-pvfcco-se",
 "298":"pvfcco-se-cong-bo-thong-tin-bao-cao-tai-chinh-ban-nien-2012-da-duoc-soat-xet",
 "199":"bao-cao-tai-chinh-6-thang-dau-nam-2011"
});
const base="https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh/";
const report={schema:"pse-finance-9-original-source-preflight-v1",mode:"READ_ONLY",items:[],errors:[],status:"UNVERIFIED"};
const browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1366,height:850}});
let queue=Object.entries(stems);
async function worker(){
 const page=await ctx.newPage();
 await page.route(/\.(?:jpg|jpeg|png|gif|webp|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
 try{
  while(queue.length){
   const [id,slug]=queue.shift(),url=base+id+"-"+slug+".html";
   const item={id,slug,url,htmlHttp:null,sourceTitle:null,originalTextLength:0,originalTextPreview:null,sourceDates:[],seoTitle:null,seoDescription:null,sourceAssets:[],foreignAssets:[],assetHeadErrors:[],errors:[]};
   try{
    const r=await page.goto(url,{waitUntil:"domcontentloaded",timeout:48000});
    item.htmlHttp=r?.status()||0;
    if(item.htmlHttp!==200)throw Error("Source article HTTP "+item.htmlHttp);
    const original=await page.evaluate(()=>{
     const root=document.querySelector('[itemprop="articleBody"]')||document.querySelector(".item-page");
     if(!root)throw Error("Original articleBody missing");
     const text=String(root.textContent||"").replace(/\s+/g," ").trim();
     const files=[];
     for(const el of root.querySelectorAll("a[href],img[src],iframe[src],object[data],embed[src]")){
      let path=el.getAttribute(el.tagName==="OBJECT"?"data":el.tagName==="A"?"href":"src");
      if(!path)continue;
      try{
       const u=new URL(path,location.href);
       if(/\.(pdf|docx?|xlsx?|pptx?|zip|rar|jpe?g|png|gif|svg|webp)$/i.test(u.pathname))
        files.push({url:u.href,type:el.tagName,anchorText:el.tagName==="A"?String(el.textContent||"").replace(/\s+/g," ").trim().slice(0,120):""});
      }catch{}
     }
     return{
      title:(document.title||"").replace(/\s+-\s+PSE\.VN\s*$/i,"").trim(),
      seoTitle:document.querySelector('head title')?.textContent?.trim()||null,
      seoDescription:document.querySelector('meta[name="description" i]')?.getAttribute("content")||null,
      textLength:text.length,textPreview:text.slice(0,340),
      dates:[...document.querySelectorAll('time[datetime],meta[property="article:published_time"],[itemprop="datePublished"],.article-info dd.created,.article-info dd.published')]
        .map(x=>x.getAttribute("datetime")||x.getAttribute("content")||x.textContent).map(x=>String(x||"").replace(/\s+/g," ").trim()).filter(Boolean).slice(0,8),
      files:[...new Map(files.map(x=>[x.url,x])).values()]
     };
    });
    Object.assign(item,{sourceTitle:original.title,seoTitle:original.seoTitle,seoDescription:original.seoDescription,
     originalTextLength:original.textLength,originalTextPreview:original.textPreview,sourceDates:original.dates});
    item.sourceAssets=original.files;
    item.foreignAssets=original.files.filter(x=>!["pse.vn","www.pse.vn"].includes(new URL(x.url).hostname));
    for(const a of item.sourceAssets){
     if(!["pse.vn","www.pse.vn"].includes(new URL(a.url).hostname))continue;
     try{
      const head=await ctx.request.head(a.url,{timeout:25000});
      a.http=head.status();a.contentType=head.headers()["content-type"]||null;a.bytes=Number(head.headers()["content-length"]||0);
      if(!head.ok())item.assetHeadErrors.push({url:a.url,http:a.http});
     }catch(e){item.assetHeadErrors.push({url:a.url,error:String(e).slice(0,110)})}
    }
   }catch(e){item.errors.push(String(e).slice(0,230));report.errors.push({id,error:String(e).slice(0,230)})}
   report.items.push(item);
   console.log("PSE_FINANCE_9_SOURCE="+JSON.stringify({id,http:item.htmlHttp,title:item.sourceTitle,textLen:item.originalTextLength,text:item.originalTextPreview,
    dates:item.sourceDates,seoTitle:item.seoTitle,seoDescription:item.seoDescription,
    assets:item.sourceAssets.map(a=>({url:a.url,type:a.type,http:a.http,bytes:a.bytes,contentType:a.contentType})),
    foreign:item.foreignAssets,errors:item.errors,assetHeadErrors:item.assetHeadErrors}));
  }
 }finally{await page.close()}
}
try{await Promise.all([worker(),worker(),worker()]);report.status=report.errors.length?"PARTIAL":"SOURCE_PROBED"}
finally{await mkdir("artifacts/pse-finance-9-source",{recursive:true});await writeFile("artifacts/pse-finance-9-source/report.json",JSON.stringify(report,null,2)+"\n");await browser.close()}
console.log("PSE_FINANCE_9_SOURCE_SUMMARY="+JSON.stringify({status:report.status,articles:report.items.length,fullSource:report.items.filter(x=>x.htmlHttp===200).length,assets:report.items.reduce((n,x)=>n+x.sourceAssets.length,0),foreign:report.items.flatMap(x=>x.foreignAssets),errors:report.errors}));
if(report.status!=="SOURCE_PROBED")process.exitCode=1;
