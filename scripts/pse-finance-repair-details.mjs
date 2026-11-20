/** Investigate exact PSE financial archive ordering and source PDF #1590. READ ONLY. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Incorrect migration checkpoint");
const wp="https://admin-pse.webnvn.com";
const ids=["1590","1292","1284","1282"];
const result={schema:"pse-finance-detail-repair-analysis-v1",rows:[],errors:[]};
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
try{
 for(const id of ids){
  const rec=state.articles[id];
  if(!rec?.source_url?.includes("/quan-he-nha-dau-tu/bao-cao-tai-chinh/"+id+"-"))throw Error("Unverified original source "+id);
  const slug=new URL(rec.source_url).pathname.match(/\/\d+-([^/]+)\.html$/)?.[1];
  const row={sourceId:id,wpId:rec.wp_id,slug,sourceUrl:rec.source_url,
    checkpoint:{status:rec.status,created:rec.source_created_date,dateSource:rec.date_source,
      datePrecision:rec.date_precision,verifiedDate:rec.verified_date},
    original:null,wordpress:null,sourceAssets:[],targetAssets:[],mediaCheckpoint:[]};
  try{
   const resp=await page.goto(rec.source_url,{waitUntil:"domcontentloaded",timeout:50000});
   if(resp?.status()!==200)throw Error("Original Joomla HTTP "+resp?.status());
   row.original=await page.evaluate(()=>{
    const body=document.querySelector('[itemprop="articleBody"]')||document.querySelector(".item-page")||document;
    return{
     title:document.title,
     text:String(body.textContent||"").replace(/\s+/g," ").trim().slice(0,350),
     articleBodyHtml:body.innerHTML.slice(0,18000),
     dates:[...document.querySelectorAll("time[datetime],.article-info dd.published,.article-info dd.created")].map(x=>x.getAttribute("datetime")||x.textContent),
     pdfLinks:[...body.querySelectorAll("a[href]")].map(a=>({title:String(a.textContent||"").replace(/\s+/g," ").trim(),url:a.href}))
      .filter(x=>/\.pdf(?:[?#]|$)/i.test(x.url)),
    };
   });
   row.sourceAssets=row.original.pdfLinks.map(x=>x.url);
  }catch(e){result.errors.push({id,where:"joomla",error:String(e).slice(0,180)})}
  try{
   const r=await page.request.get(wp+"/wp-json/wp/v2/posts/"+rec.wp_id+"?_fields=id,slug,title,date,date_gmt,categories,status,link,content,excerpt",{timeout:45000});
   if(r.status()!==200)throw Error("WP post HTTP "+r.status());
   const p=await r.json();
   row.wordpress={id:p.id,slug:p.slug,title:p.title?.rendered,date:p.date,date_gmt:p.date_gmt,
     link:p.link,categories:p.categories,html:String(p.content?.rendered||"").slice(0,20000),
     excerpt:String(p.excerpt?.rendered||"").slice(0,200)};
   const anchors=[...String(p.content?.rendered||"").matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
   row.targetAssets=anchors.map(m=>({url:new URL(m[1],wp).href,anchorText:m[2].replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim()}))
    .filter(x=>/\.pdf(?:[?#]|$)/i.test(new URL(x.url).pathname));
   for(const src of row.sourceAssets){
    const match=state.media[src];
    row.mediaCheckpoint.push({source:src,expectedSlug:"pse-legacy-"+createHash("sha256").update(src).digest("hex").slice(0,16),
     mapped:match?{id:match.id,url:match.url,sha256:match.sha256}:null});
   }
  }catch(e){result.errors.push({id,where:"wordpress",error:String(e).slice(0,180)})}
  result.rows.push(row);
  console.log("PSE_FINANCE_REPAIR_DETAILS="+JSON.stringify({
   sourceId:id,wpId:row.wpId,sourceUrl:row.sourceUrl,checkpoint:row.checkpoint,
   sourceTitle:row.original?.title,
   originalDates:row.original?.dates,
   sourceAssets:row.original?.pdfLinks,
   wpDate:row.wordpress?.date,wpTitle:row.wordpress?.title,
   targetAssets:row.targetAssets,mediaCheckpoint:row.mediaCheckpoint
  }));
 }
}finally{
 await mkdir("artifacts/pse-finance-repair-details",{recursive:true});
 await writeFile("artifacts/pse-finance-repair-details/report.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
console.log("PSE_FINANCE_REPAIR_INSPECT_SUMMARY="+JSON.stringify({rows:result.rows.length,errors:result.errors}));
if(result.errors.length)process.exitCode=1;
