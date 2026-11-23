/** Read-only desktop/mobile visual audit of the historical Kali Canada WordPress Page. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const base="https://pse.webnvn.com";
const out="artifacts/pse-kali-1426-whitespace-diagnostic";
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PSE_CHROME_CHANNEL||undefined});
const report={source:"production",url:base+"/kali-phu-my-bot-canada-mo-ta-va-hdsd",viewports:[],pass:false};
try{
 for(const width of [1920,1440,1240,768,390]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  try{
   const res=await page.goto(report.url,{waitUntil:"domcontentloaded",timeout:60000});
   if(res?.status()!==200)throw Error("HTTP "+res?.status()+" at "+width);
   const img=page.locator(".pse-historical-kali-1425 img").first();
   if(await img.count()!==1)throw Error("Kali Canada original image missing");
   await img.evaluate(async el=>{el.loading="eager";await el.decode()});
   const metrics=await page.evaluate(()=>{
    const get=sel=>document.querySelector(sel);
    const rect=el=>el?el.getBoundingClientRect():null;
    const main=get("main.pse-fertilizer-article");
    const header=main?.querySelector("header");
    const body=main?.querySelector(".pse-public-body");
    const article=body?.querySelector(".article-content");
    const table=article?.querySelector(".pse-historical-kali-1425 table");
    const outer=rect(body),h=rect(header),t=rect(table);
    const cells=[...(table?.querySelectorAll("td")||[])].slice(0,10).map(el=>({
      text:el.textContent?.trim().replace(/\\s+/g," ").slice(0,55),
      height:Math.round(el.getBoundingClientRect().height),
      padding:getComputedStyle(el).padding,
      lineHeight:getComputedStyle(el).lineHeight,
      html:el.outerHTML.slice(0,1700),
      descendants:[...el.querySelectorAll("*")].slice(0,12).map(n=>({tag:n.tagName,style:n.getAttribute("style"),class:n.className,text:n.textContent?.trim().slice(0,65),height:Math.round(n.getBoundingClientRect().height),lineHeight:getComputedStyle(n).lineHeight,margin:getComputedStyle(n).margin}))
    }));
    const allCrumbs=[...document.querySelectorAll("main .pse-fertilizer-breadcrumb")].length;
    return {
      width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,
      mainPresent:!!main,headerHeight:Math.round(h?.height||0),
      sectionLeft:Math.round(outer?.left||0),sectionRight:Math.round(outer?.right||0),
      contentWidth:Math.round(outer?.width||0),
      headerBottom:Math.round(h?.bottom||0),tableTop:Math.round(t?.top||0),
      articleClass:article?.className,
      inPageBreadcrumbCount:allCrumbs,
      tableWidth:Math.round(t?.width||0),
      imageWidth:Math.round(rect(document.querySelector(".pse-historical-kali-1425 img"))?.width||0),
      imageHeight:Math.round(rect(document.querySelector(".pse-historical-kali-1425 img"))?.height||0),
      cells
    };
   });
   report.viewports.push(metrics);
   console.log("PSE_KALI_DETAIL_VISUAL_METRICS="+JSON.stringify(metrics));
   await page.screenshot({path:out+"/kali-canada-"+width+".png",fullPage:true});
   if(!metrics.mainPresent || metrics.inPageBreadcrumbCount!==0 || metrics.overflow>5)throw Error("Layout contract fails "+width+": "+JSON.stringify(metrics));
   if(width>=1240 && (metrics.sectionLeft<90||width-metrics.sectionRight<90))report.marginMismatch=true;
   if(!metrics.tableWidth || metrics.tableWidth>metrics.contentWidth+3)report.tableMismatch=true;
  }finally{await page.close()}
 }
 report.pass=!report.marginMismatch&&!report.tableMismatch;
 if(!report.pass)throw Error("Kali visual geometry requires repair; see report.json");
 console.log("PSE_KALI_DETAIL_VISUAL_QA=PASS");
}finally{
 await writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
