/** Read-only: independently verify Joomla created dates for market articles 342 & 351. */
import {chromium} from "playwright";
import {readFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
const s=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(!s.backup_verified||s.schema!=="pse-legacy-article-migration-v1")throw Error("Invalid checkpoint");
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.route(/\.(?:png|jpe?g|gif|svg|webp|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
 for(const id of ["342","351"]){
  const o=s.articles[id];
  if(!o?.source_url?.includes("/hoat-dong-kinh-doanh/thong-tin-thi-truong/")||
    o.status!=="quarantined")throw Error("Unexpected market source "+id);
  const r=await page.goto(o.source_url,{waitUntil:"domcontentloaded",timeout:60000});
  if(r?.status()!==200)throw Error("Original market source HTTP "+r?.status());
  const data=await page.evaluate(()=>{
   const root=document.querySelector('[itemprop="articleBody"]');
   return{title:document.title.replace(/\s+-\s+PSE\.VN\s*$/i,"").trim(),
    opening:root?.textContent?.replace(/\s+/g," ").trim().slice(0,300)||""};
  });
  if(!data.opening||!data.title)throw Error("Missing source article "+id);
  const lookup=await searchDate(page,{id:Number(id),sourceUrl:o.source_url,title:data.title,opening:data.opening});
  console.log("PSE_MARKET_SOURCE_DATE="+JSON.stringify({id:Number(id),sourceTitle:data.title,date:lookup.day||null,source:lookup.source,
    precision:lookup.precision||null,attempts:lookup.attempts||null}));
 }
 console.log("PSE_MARKET_SOURCE_DATE_AUDIT=PASS; readonly=true");
}finally{await browser.close()}
