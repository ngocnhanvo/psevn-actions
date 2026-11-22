import {chromium} from "playwright";
import {searchDate} from "./pse-legacy-search-date.mjs";
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong PSE project");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const item=state.articles?.["1434"];
if(state.schema!=="pse-legacy-article-migration-v1"||!item?.source_url?.includes("/1434-npk-phu-my.html"))
 throw Error("Original Joomla #1434 ledger identity mismatch");
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({viewport:{width:1366,height:850}});
await ctx.route(/\.(?:jpe?g|png|webp|gif|svg|woff2?|ttf)(?:[?#]|$)/i,route=>route.abort());
const page=await ctx.newPage();
const report={schema:"pse-1434-original-public-com-search-created-day-v1",sourceId:1434,
 sourceUrl:item.source_url,readOnly:true,noWordPressWrites:true,date:null};
try{
 const r=await page.goto(item.source_url,{waitUntil:"domcontentloaded",timeout:55000});
 if(r?.status()!==200)throw Error("Original public Joomla page not available");
 const text=await page.locator('.item-page [itemprop="articleBody"]').first().innerText();
 const title=(await page.locator("h1,h2").first().innerText()).replace(/\s+/g," ").trim();
 if(title!=="NPK Phú Mỹ"||text.length<4500)throw Error("Original NPK content/title changed");
 const date=await searchDate(page,{id:1434,sourceUrl:item.source_url,title,opening:text.slice(0,390)});
 report.date=date;
 console.log("PSE_1434_JOOMLA_CREATED_DATE="+JSON.stringify(date));
}finally{
 await mkdir("artifacts/pse-1434-original-date",{recursive:true});
 await writeFile("artifacts/pse-1434-original-date/report.json",JSON.stringify(report,null,2)+"\n");
 await ctx.close();await b.close();
}
