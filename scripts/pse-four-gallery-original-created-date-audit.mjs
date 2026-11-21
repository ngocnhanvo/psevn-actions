/** Read-only original Joomla com_search CREATED day evidence for four photo albums.
 * A year in an album title is not its publication date. No WordPress writes.
 */
import {chromium,request} from "playwright";
import {searchDate,sourceId} from "./pse-legacy-search-date.mjs";
import {mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong PSE repo");
const albums=[
 {id:1053,slug:"1053-ngay-hoi-truyen-thong-2014"},
 {id:990,slug:"990-dai-hoi-chi-doan-2010"},
 {id:980,slug:"980-cong-trinh-dtn-kho-chua-dong-nai"},
 {id:975,slug:"975-dai-hoi-cong-doan-nhiem-ky-ii-10-2013"}
];
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:850}});
await context.route(/\.(?:png|jpe?g|webp|svg|gif|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const net=await request.newContext({timeout:60000});
const report={schema:"pse-four-original-gallery-created-date-provenance-v1",
 readOnly:true,noCmsWrites:true,noBuild:true,rows:[],verifiedDates:0};
try{
 const page=await context.newPage();
 for(const a of albums){
  const url="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/"+a.slug+".html";
  if(sourceId(url)!==a.id)throw Error("Untrusted Joomla source ID "+a.id);
  const response=await net.get(url,{timeout:65000,maxRedirects:2});
  if(response.status()!==200)throw Error("Original source unavailable "+a.id);
  const source=await response.text();
  if(source.length<250||source.length>8000000)throw Error("Unexpected original HTML size "+a.id);
  const clean=source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
  await page.setContent('<base href="'+url+'">'+clean,{waitUntil:"domcontentloaded",timeout:25000});
  const info=await page.evaluate(()=>{
   const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article")||document.body;
   return{title:(document.querySelector(".item-page h1,.item-page h2,h1,h2")?.textContent||"").replace(/\s+/g," ").trim(),
    opening:(root.textContent||"").replace(/\s+/g," ").trim().slice(0,360),
    explicitCreated:[...document.querySelectorAll('[itemprop="dateCreated"],.createdate,dd.created')]
     .map(x=>x.getAttribute("content")||x.textContent||"").map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean).slice(0,4)
   };
  });
  if(info.title.length<8)throw Error("Source title absent "+a.id);
  const date=await searchDate(page,{id:a.id,sourceUrl:url,title:info.title,opening:info.opening});
  const verified=date.source==="joomla_com_search_created"&&/^\d{4}-\d\d-\d\d$/.test(date.day||"");
  if(verified)report.verifiedDates++;
  const row={id:a.id,sourceUrl:url,sourceTitle:info.title,
   createdDay:verified?date.day:null,precision:verified?date.precision:null,
   proofSource:date.source,searchMatch:verified?date.matchedUrl:null,
   rawCreatedHints:info.explicitCreated,searchAttempts:verified?[]:date.attempts||[],
   decision:verified?"DATE_SOURCE_VERIFIED":"SOURCE_DAY_UNVERIFIED"};
  report.rows.push(row);
  console.log("PSE_FOUR_GALLERY_CREATED_DAY="+JSON.stringify(row));
 }
 console.log("PSE_FOUR_GALLERY_CREATED_DAY_SUMMARY="+JSON.stringify({
  albums:4,sourceCreatedDaysVerified:report.verifiedDates,
  needsOriginalEvidence:report.rows.filter(x=>!x.createdDay).map(x=>x.id),
  readOnly:true,noCmsWrites:true
 }));
}finally{
 await mkdir("artifacts/pse-four-gallery-created-dates",{recursive:true});
 await writeFile("artifacts/pse-four-gallery-created-dates/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}