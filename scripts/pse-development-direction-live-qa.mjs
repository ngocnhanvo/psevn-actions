/** Read-only responsive QA for the PSE development-direction WordPress Page. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(v=>v.trim().replace(/^export\s+/,""));
const origins=rows.filter(v=>v.startsWith("WC_URL_CLIENT="));
if(origins.length!==1)throw Error("PSE frontend origin is not configured uniquely");
const url=new URL(origins[0].split("=").slice(1).join("=").replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||!url.hostname||url.username||url.password||
   !["","/"].includes(url.pathname)||url.search||url.hash)
 throw Error("Invalid frontend origin");
const browser=await chromium.launch({headless:true});
const output="artifacts/pse-development-direction";
await mkdir(output,{recursive:true});
const checks=[];
try {
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  try {
   const response=await page.goto(url.origin+"/dinh-huong-phat-trien",
     {waitUntil:"domcontentloaded",timeout:65000});
   const scan=await page.evaluate(()=>{
    const main=document.querySelector("main[data-pse-development-strategy='true']");
    const nav=main?.querySelector(".pse-strategy-navigation");
    const links=[...(nav?.querySelectorAll("ol a[href^='#']")||[])];
    const sections=[...(main?.querySelectorAll(".pse-strategy-section-heading")||[])];
    const table=main?.querySelector(".pse-strategy-metrics");
    const rows=table?.querySelectorAll("tr")||[];
    const documentWidth=document.documentElement.clientWidth;
    const pageOverflow=document.documentElement.scrollWidth>documentWidth+2;
    const nestedScroll=[...(main?.querySelectorAll("*")||[])].filter(el=>{
      const css=getComputedStyle(el);
      const scroll=/auto|scroll/.test(css.overflowX+" "+css.overflowY);
      return scroll && (el.scrollWidth>el.clientWidth+2 || el.scrollHeight>el.clientHeight+2);
    }).slice(0,8).map(el=>el.tagName.toLowerCase()+"."+(el.className||""));
    const anchorsValid=links.length>0 && links.every(a=>{
      const target=document.getElementById(a.hash.slice(1));
      return target && target.classList.contains("pse-strategy-section-heading");
    });
    return {h1:main?.querySelectorAll("h1").length||0,
      nav:!!nav,anchors:links.length,anchorsValid,sections:sections.length,
      table:!!table,tableRows:rows.length,
      targetLabels:[...table?.querySelectorAll("tr:nth-child(2) td[data-label]")||[]].length,
      year2025:(main?.textContent||"").includes("2025"),
      oldTargetsPreserved:(main?.textContent||"").includes("2015"),
      pageOverflow,nestedScroll};
   });
   const pass=response?.status()===200 && scan.h1===1 && scan.nav &&
      scan.anchors===5 && scan.anchorsValid && scan.sections===5 &&
      scan.table && scan.tableRows>=10 && scan.targetLabels>=3 &&
      scan.year2025 && scan.oldTargetsPreserved &&
      !scan.pageOverflow && scan.nestedScroll.length===0;
   console.log("PSE_DEVELOPMENT_DIRECTION_QA="+JSON.stringify({
     width,http:response?.status()||0,...scan,ok:pass
   }));
   if(response?.status()===200)
      await page.screenshot({path:output+"/development-direction-"+width+".png",fullPage:true});
   checks.push({width,ok:pass});
  }finally{await page.close()}
 }
}finally{await browser.close()}
console.log("PSE_DEVELOPMENT_DIRECTION_QA_SUMMARY="+JSON.stringify({
 checks:checks.length,failed:checks.filter(c=>!c.ok).length,readOnly:true,noBuild:true
}));
if(checks.some(x=>!x.ok))process.exitCode=1;
