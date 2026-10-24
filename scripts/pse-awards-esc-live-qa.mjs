/** PSE G8 ESC Table source + visual QA at live target. READ ONLY. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const line=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim()).filter(s=>s.startsWith("WC_URL_CLIENT="));
if(line.length!==1)throw Error("Ambiguous PSE frontend origin");
const u=new URL(line[0].slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid frontend origin");
const browser=await chromium.launch({headless:true});
const expected=["Năm 2026","Năm 2015","Năm 2013","Năm 2012","Năm 2011","Năm 2010","Năm 2009","Năm 2008"];
const result=[];
try{
 await mkdir("artifacts/pse-g8-esc-live",{recursive:true});
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  try{
   const response=await page.goto(u.origin+"/thanh-tuu",{waitUntil:"networkidle",timeout:65000});
   await page.locator('[data-pse-awards-source="esc-table"]').waitFor({state:"visible",timeout:25000});
   await page.waitForFunction(()=>[...document.querySelectorAll("[data-pse-awards-source='esc-table'] img")].every(x=>x.complete),null,{timeout:20000});
   const data=await page.evaluate(()=>{
     const cards=[...document.querySelectorAll('[data-pse-awards-source="esc-table"] .pse-award-card')];
     return {
       headings:[...document.querySelectorAll(".pse-award-card__year")].map(n=>n.textContent.trim()),
       cards:cards.length,li:cards.reduce((n,c)=>n+c.querySelectorAll(".pse-award-card__points li").length,0),
       images:cards.map(c=>{const img=c.querySelector("img");const r=img?.getBoundingClientRect();return {alt:img?.alt||"",ok:!!img?.complete&&img.naturalWidth>0&&img.naturalHeight>0,area:!!r&&r.width>0&&r.height>0}}),
       h1:document.querySelectorAll("h1").length,
       hasOldTable:!!document.querySelector("#Table_01"),
       related:document.querySelectorAll("[data-pse-menu-related] li a").length,
       horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
       nestedScroll:[...document.querySelectorAll(".pse-award-card,.pse-awards-list")].some(e=>e.scrollHeight>e.clientHeight+4&&/auto|scroll/.test(getComputedStyle(e).overflowY)),
       clipped:[...document.querySelectorAll(".pse-award-card__points li")].some(e=>e.getBoundingClientRect().height<8||
         getComputedStyle(e).visibility==="hidden"||getComputedStyle(e).opacity==="0")
     };
   });
   const passed=response?.status()===200&&JSON.stringify(data.headings)===JSON.stringify(expected)&&
     data.cards===8&&data.li===17&&data.images.length===8&&data.images.every(x=>x.alt.trim()&&x.ok&&x.area)&&
     data.h1===1&&!data.hasOldTable&&!data.horizontalOverflow&&!data.nestedScroll&&!data.clipped&&data.related===9;
   await page.screenshot({path:"artifacts/pse-g8-esc-live/awards-"+width+".png",fullPage:true});
   console.log("PSE_G8_ESC_LIVE="+JSON.stringify({width,http:response?.status(),passed,...data}));
   result.push(passed);
  }finally{await page.close()}
 }
 console.log("PSE_G8_ESC_LIVE_SUMMARY="+JSON.stringify({checks:result.length,failed:result.filter(v=>!v).length,readOnly:true,source:"WordPress ESC Table"}));
 if(result.some(v=>!v))process.exitCode=1;
}finally{await browser.close()}
