/** Read-only live QA of the PSE native WordPress Vision Mission section. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const entries=String(process.env.ENV_FILE||"").split(/\r?\n/).filter(x=>x.trim().startsWith("WC_URL_CLIENT="));
if(entries.length!==1)throw Error("PSE public frontend missing");
const u=new URL(entries[0].trim().slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid PSE frontend");
await mkdir("artifacts/pse-vision",{recursive:true});
const browser=await chromium.launch({headless:true});
const fails=[];
try{
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  try{
   const res=await page.goto(u.origin+"/tam-nhin-su-menh",{waitUntil:"domcontentloaded",timeout:65000});
   await page.waitForFunction(()=>{
    const nodes=[...document.querySelectorAll('[data-pse-vision-source="esc-table"] img')];
    return nodes.length===2&&nodes.every(x=>x.complete&&x.naturalWidth>0);
   },null,{timeout:21000}).catch(()=>null);
   const scan=await page.evaluate(()=>{
    const main=document.querySelector("#main-content.pse-public-page");
    const section=main?.querySelector('[data-pse-vision-source="esc-table"]');
    const cards=[...(section?.querySelectorAll(".pse-vision__card")||[])];
    const images=cards.map(c=>{const x=c.querySelector("img");return {src:x?.getAttribute("src")||"",alt:x?.alt||"",loaded:!!x&&x.complete&&x.naturalWidth>0,visible:!!x&&x.getBoundingClientRect().width>50}});
    const headings=cards.map(c=>c.querySelector("h3")?.textContent?.trim()||"");
    const details=cards.map(c=>c.querySelector(".pse-vision__prose")?.textContent?.replace(/\s+/g," ").trim()||"");
    const hidden=[...cards.flatMap(c=>[...c.querySelectorAll("h3,p")])].filter(el=>{
      const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display==="none"||s.visibility==="hidden"||r.width===0||r.height===0;
    }).length;
    const nestedScroll=[...(main?.querySelectorAll("*")||[])].filter(e=>{
      const s=getComputedStyle(e);
      return /auto|scroll/.test(s.overflowX+" "+s.overflowY)&&
        (e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2);
    }).slice(0,6).map(x=>x.tagName+"."+x.className);
    return {h1:main?.querySelectorAll("h1").length||0,section:!!section,items:cards.length,
      headings,detailsLength:details.map(x=>x.length),
      contains2025:details.some(x=>x.includes("Tầm nhìn đến 2025")),
      missionReal:details.some(x=>x.includes("Sản xuất, kinh doanh, phân phối phân bón")),
      images,hidden,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
      nestedScroll,legacyTable:!!main?.querySelector("table"),shortcodeVisible:(main?.textContent||"").includes("[table id=pse_vision_vi"),links:section?.querySelectorAll('nav a[href^="#pse-"]').length||0};
   });
   const valid=res?.status()===200&&scan.h1===1&&scan.section&&scan.items===2&&
     JSON.stringify(scan.headings)===JSON.stringify(["Sứ mệnh","Tầm nhìn"])&&
     scan.contains2025&&scan.missionReal&&scan.images.every(x=>x.loaded&&x.alt&&x.visible)&&
     scan.hidden===0&&!scan.overflow&&scan.nestedScroll.length===0&&!scan.legacyTable&&!scan.shortcodeVisible&&scan.links===2;
   console.log("PSE_VISION_LIVE_QA="+JSON.stringify({width,http:res?.status(),...scan,ok:valid}));
   if(!valid)fails.push(width);
   if(res?.status()===200)await page.screenshot({path:"artifacts/pse-vision/vision-"+width+".png",fullPage:true});
  }finally{await page.close()}
 }
}finally{await browser.close()}
console.log("PSE_VISION_LIVE_QA_SUMMARY="+JSON.stringify({viewports:3,failures:fails,readOnly:true,noAstroBuild:true}));
if(fails.length)process.exitCode=1;
