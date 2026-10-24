/** Read-only real Chromium UI QA of WordPress ESC Table corporate timeline. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""))
  .filter(x=>x.startsWith("WC_URL_CLIENT="));
if(vars.length!==1)throw Error("PSE frontend origin missing");
const u=new URL(vars[0].split("=").slice(1).join("=").replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
 throw Error("PSE frontend origin invalid");
const browser=await chromium.launch({headless:true});
const output="artifacts/pse-history";
await mkdir(output,{recursive:true});
const failures=[];
try{
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  try{
   const response=await page.goto(u.origin+"/qua-trinh-hinh-thanh-phat-trien",
    {waitUntil:"domcontentloaded",timeout:65000});
   const scan=await page.evaluate(()=>{
    const main=document.querySelector("main.pse-public-page");
    const timeline=main?.querySelector('[data-pse-history-source="esc-table"]');
    const items=[...(timeline?.querySelectorAll(".pse-history__milestone")||[])];
    const expected=["07/08/2008","01/09/2008","22/12/2010","12/01/2011","30/01/2011","01/02/2011"];
    const dates=items.map(x=>{
     const t=x.querySelector("time");return t?.getAttribute("datetime")||""
    });
    const expectedIso=expected.map(x=>x.slice(-4)+"-"+x.slice(3,5)+"-"+x.slice(0,2));
    const textOk=items.every(x=>x.querySelector("h3")?.textContent?.trim()&&
      x.querySelector(".pse-history__details")?.textContent?.trim());
    const hidden=items.flatMap(x=>[...x.querySelectorAll("h3,p")]).filter(el=>{
      const st=getComputedStyle(el),r=el.getBoundingClientRect();
      return st.visibility==="hidden"||st.display==="none"||r.height===0||r.width===0
    }).length;
    const widthOverflow=document.documentElement.scrollWidth>document.documentElement.clientWidth+2;
    const nestedScroll=[...(main?.querySelectorAll("*")||[])].filter(el=>{
      const st=getComputedStyle(el);
      return /auto|scroll/.test(st.overflowX+" "+st.overflowY)&&
      (el.scrollHeight>el.clientHeight+2||el.scrollWidth>el.clientWidth+2)
    }).slice(0,8).map(x=>x.tagName+"."+x.className);
    return {h1:main?.querySelectorAll("h1").length||0,
      timeline:!!timeline,items:items.length,dates,dateSequenceValid:JSON.stringify(dates)===JSON.stringify(expectedIso),
      textOk,hidden,widthOverflow,nestedScroll,
      siblings:main?.querySelectorAll("[data-pse-menu-related] a").length||0,
      escapedShortcode:(main?.textContent||"").includes("[table id=pse_history_vi")};
   });
   const ok=response?.status()===200&&scan.h1===1&&scan.timeline&&scan.items===6&&
      scan.dateSequenceValid&&scan.textOk&&scan.hidden===0&&!scan.widthOverflow&&
      scan.nestedScroll.length===0&&!scan.escapedShortcode;
   console.log("PSE_HISTORY_LIVE_QA="+JSON.stringify({width,http:response?.status(),...scan,ok}));
   if(response?.status()===200)await page.screenshot({path:output+"/history-"+width+".png",fullPage:true});
   if(!ok)failures.push(width);
  }finally{await page.close()}
 }
}finally{await browser.close()}
console.log("PSE_HISTORY_LIVE_QA_SUMMARY="+JSON.stringify({checked:3,failed:failures,readOnly:true,noBuild:true}));
if(failures.length)process.exitCode=1;
