import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const record=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim()).find(s=>s.startsWith("WC_URL_CLIENT="));
if(!record)throw Error("Missing frontend configuration");
const resolved=new URL(record.slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(resolved.protocol!=="https:"||resolved.username||resolved.password||resolved.hash||resolved.search||
  !["","/"].includes(resolved.pathname))throw Error("Unsafe frontend origin");
const origin=resolved.origin;
const years=["2026","2015","2013","2012","2011","2010","2009","2008"];
mkdirSync("artifacts/pse-corporate-live",{recursive:true});
const browser=await chromium.launch({headless:true});
let checks=0,failed=0;
try {
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
  const page=await context.newPage();
  try{
   const response=await page.goto(origin+"/thanh-tuu",{waitUntil:"networkidle",timeout:60000});
   const imgs=page.locator("[data-pse-achievement-cards] .pse-award-card__media img");
   for(let i=0;i<await imgs.count();i++){
     await imgs.nth(i).scrollIntoViewIfNeeded();
     await imgs.nth(i).evaluate(async img=>{
       if(!img.complete)await new Promise(resolve=>{img.addEventListener("load",resolve,{once:true});
         img.addEventListener("error",resolve,{once:true});});
     });
   }
   const result=await page.evaluate(()=>{
     const body=document.querySelector("#main-content.pse-public-page");
     const cards=[...body?.querySelectorAll("[data-pse-achievement-cards] .pse-award-card")||[]];
     return {
       h1:body?.querySelectorAll("h1").length||0,
       related:!!body?.querySelector("[data-pse-menu-related]"),
       yearLabels:cards.map(c=>c.querySelector("h2")?.textContent.trim()),
       imageCount:cards.filter(c=>c.querySelector("img")).length,
       images:cards.map(c=>({ok:!!c.querySelector("img")?.naturalWidth,alt:c.querySelector("img")?.alt||"",
         natural:c.querySelector("img")?.naturalWidth||0})),
       text:cards.map(c=>(c.querySelector(".pse-award-card__points")?.textContent||"").replace(/\s+/g," ").trim()),
       listCounts:cards.map(c=>c.querySelectorAll(".pse-award-card__points li").length),
       legible:cards.every(c=>{
         const list=c.querySelector(".pse-award-card__points");
         const year=c.querySelector(".pse-award-card__year");
         if(!list||!year)return false;
         const box=list.getBoundingClientRect();
         const card=c.getBoundingClientRect();
         const cs=getComputedStyle(list);
         const heading=getComputedStyle(year);
         return box.height>0&&box.bottom<=card.bottom+3 &&
           cs.visibility!=="hidden"&&cs.display!=="none"&&cs.opacity!=="0"&&
           !cs.color.includes("255, 255, 255")&&
           !heading.color.includes("255, 255, 255")&&
           list.scrollHeight<=list.clientHeight+3&&
           year.scrollHeight<=year.clientHeight+3;
       }),
       legacyTable:!!body?.querySelector("table#Table_01"),
       noOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth+3,
       relatedCount:body?.querySelectorAll("[data-pse-menu-related] li").length||0
     };
   });
   const expected=years.map(y=>"Năm "+y);
   const ok=response?.status()===200&&result.h1===1&&result.related&&result.relatedCount===9&&
     JSON.stringify(result.yearLabels)===JSON.stringify(expected)&&result.imageCount===8&&
     result.images.every(x=>x.ok&&!!x.alt)&&result.text.every(x=>x.length>20)&&
     result.listCounts.every(x=>x>=1)&&result.legible&&!result.legacyTable&&result.noOverflow;
   checks++;if(!ok)failed++;
   console.log("PSE_AWARDS_CARD_LIVE="+JSON.stringify({width,http:response?.status(),...result,ok}));
   await page.screenshot({path:`artifacts/pse-corporate-live/g8-awards-${width}.png`,fullPage:true});
  }finally{await context.close()}
 }
 console.log("PSE_AWARDS_CARD_SUMMARY="+JSON.stringify({checks,failed,expected:2,readOnly:true}));
 if(failed||checks!==2)process.exitCode=1;
}finally{await browser.close()}
