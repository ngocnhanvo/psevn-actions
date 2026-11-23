/** Post-release read-only visual QA: historical fertilizer product layout. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const base="https://pse.webnvn.com",out="artifacts/pse-kali-1426-whitespace-diagnostic";
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PSE_CHROME_CHANNEL||undefined});
const report={source:"production",expectedCommit:"77ca4fa8597b71f01ab4be6e5553fe1d200f96a9",viewports:[],pass:false};
try {
 for(const slug of ["kali-phu-my-bot-canada-mo-ta-va-hdsd"]) {
  for(const width of [1440,390]) {
   const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
   try {
    const res=await page.goto(base+"/"+slug,{waitUntil:"domcontentloaded",timeout:60000});
    if(res?.status()!==200)throw Error("HTTP "+res?.status()+" "+slug+" "+width);
    const data=await page.evaluate(()=>{
     const main=document.querySelector("main.pse-fertilizer-article");
     const section=main?.querySelector(".pse-public-body");
     const layout=section?.querySelector("[data-pse-fertilizer-product-detail]");
     const rect=e=>e?.getBoundingClientRect();
     const media=layout?.querySelector("img");
     const specs=[...(layout?.querySelectorAll(".pse-fertilizer-spec-row")||[])];
     const outer=rect(section),pane=rect(layout);
     return {
      width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,
      mainPresent:!!main,converted:!!layout,articleBreadcrumbs:main?.querySelectorAll(".pse-fertilizer-breadcrumb").length||0,
      sectionLeft:Math.round(outer?.left||0),sectionRight:Math.round(outer?.right||0),
      mediaNaturalWidth:media?.naturalWidth||0,mediaWidth:Math.round(rect(media)?.width||0),
      imageColumnWidth:Math.round(rect(layout?.querySelector(".pse-fertilizer-product-media"))?.width||0),
      infoColumnWidth:Math.round(rect(layout?.querySelector(".pse-fertilizer-product-specs"))?.width||0),
      layoutWidth:Math.round(pane?.width||0),
      specRows:specs.length,rows:specs.slice(0,8).map(row=>({
        height:Math.round(rect(row).height),
        label:row.querySelector(".pse-fertilizer-spec-label")?.textContent?.trim().replace(/\\s+/g," ").slice(0,60),
        value:row.querySelector(".pse-fertilizer-spec-value")?.textContent?.trim().replace(/\\s+/g," ").slice(0,75)
      })),
      legacyRowspan:section?.querySelectorAll("td[rowspan]").length||0,
      whitespaceForensics:(()=>{
       const wrapper=section?.querySelector(".article-content");
       const related=main?.querySelector("[data-pse-menu-related]");
       const detail=layout?.querySelector(".pse-fertilizer-product-specs");
       const nodes=[["section",section],["article",wrapper],["layout",layout],["media",layout?.querySelector(".pse-fertilizer-product-media")],["specs",detail],["last-spec-child",detail?.lastElementChild],["last-table",detail?.querySelector("table:last-of-type")],["related",related]];
       const b=e=>{if(!e)return null;const x=rect(e),c=getComputedStyle(e);return {y:Math.round(x.y),bottom:Math.round(x.bottom),height:Math.round(x.height),marginTop:c.marginTop,marginBottom:c.marginBottom,paddingTop:c.paddingTop,paddingBottom:c.paddingBottom,minHeight:c.minHeight,display:c.display}};
       const historical=wrapper?.querySelector(".pse-historical-kali-1425,.pse-historical-kali-1430");
       return {nodes:Object.fromEntries(nodes.map(([k,v])=>[k,b(v)])),
        historicalChildren:[...(historical?.children||[])].map(el=>({tag:el.tagName,cls:String(el.className).slice(0,80),style:el.getAttribute("style"),txt:el.textContent?.trim().slice(0,70),htmlStart:el.outerHTML.slice(0,160),box:b(el)})),
        historicalTail:historical?.innerHTML.slice(-1100),
        articleChildren:[...(wrapper?.children||[])].slice(-12).map(el=>({tag:el.tagName,cls:String(el.className).slice(0,90),style:el.getAttribute("style"),text:el.textContent?.trim().slice(0,60),box:b(el),children:[...el.children].slice(-8).map(ch=>({tag:ch.tagName,cls:String(ch.className).slice(0,80),style:ch.getAttribute("style"),text:ch.textContent?.trim().slice(0,70),box:b(ch)}))})),
        lastSpecChildren:[...(detail?.children||[])].slice(-8).map(el=>({cls:el.className,text:el.textContent?.trim().slice(0,60),box:b(el)}))
       };
      })(),
      tableSchema:[...(section?.querySelectorAll(".pse-historical-kali-1425 table, .pse-historical-kali-1430 table")||[])].map(table=>({rows:table.rows.length,firstRowCells:table.rows[0]?.cells.length,cells:[...table.rows].map(row=>({cells:[...row.cells].map(cell=>({colspan:cell.getAttribute("colspan"),rowspan:cell.getAttribute("rowspan"),text:cell.textContent?.trim().replace(/\\s+/g," ").slice(0,55),images:cell.querySelectorAll("img").length})),html:row.outerHTML.slice(0,150)}))}))
     };
    });
    const image=page.locator("[data-pse-fertilizer-product-detail] img").first();
    if(await image.count()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(async el=>{el.loading="eager";await el.decode()});
      data.mediaNaturalWidth=await image.evaluate(el=>el.naturalWidth);
    }
    report.viewports.push({slug,...data});
    console.log("PSE_FERTILIZER_LIVE_METRICS="+JSON.stringify({slug,...data}));
    // Fast DOM-only diagnostic; avoid long full-page screenshots.
    if(!data.mainPresent || !data.converted || data.articleBreadcrumbs || data.overflow>5 || data.specRows<5 || !data.mediaNaturalWidth)
      throw Error("Missing responsive product presentation "+slug+" "+width+": "+JSON.stringify(data));
    if(width>=1240 && (data.sectionLeft<85||width-data.sectionRight<85))
      throw Error("Desktop gutters not product-like "+slug+" "+width+": "+JSON.stringify(data));
    if(width>=1024 && (data.imageColumnWidth<200||data.infoColumnWidth<200))
      throw Error("Two-column product layout missing "+slug+" "+width);
    if(data.rows.slice(0,3).some(row=>row.height>100))
      throw Error("Excessive spacing in first product specification rows "+slug+" "+width+": "+JSON.stringify(data.rows.slice(0,3)));
   }finally{await page.close()}
  }
 }
 report.pass=true;
 console.log("PSE_FERTILIZER_LIVE_VISUAL_QA=PASS");
}finally{
 await writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
