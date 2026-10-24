import { chromium } from "playwright";
const line=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim()).find(s=>s.startsWith("WC_URL_CLIENT="));
if(!line)throw Error("Missing frontend origin");
const root=new URL(line.slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(root.protocol!=="https:"||root.username||root.password)throw Error("Untrusted frontend origin");
const browser=await chromium.launch({headless:true});
try {
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  try {
   for(const slug of ["qua-trinh-hinh-thanh-phat-trien","ban-giam-doc","hoi-dong-quan-tri","thong-diep","ban-kiem-soat","so-do-to-chuc","tam-nhin-su-menh","dinh-huong-phat-trien","nganh-nghe-kinh-doanh","thanh-tuu"]){
    const response=await page.goto(new URL("/"+slug,root.origin).href,{waitUntil:"domcontentloaded",timeout:60000});
    const info=await page.evaluate(()=>{
      const body=document.querySelector(".pse-public-body");
      const article=body?.querySelector(".article-content");
      const rect=e=>{const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
      const tag=e=>e.tagName.toLowerCase()+(e.id?"#"+e.id:"")+
        (typeof e.className==="string"&&e.className.trim()?"."+e.className.trim().split(/\s+/).slice(0,3).join("."):"");
      const stat=e=>{const css=getComputedStyle(e);return {tag:tag(e),rect:rect(e),scrollH:e.scrollHeight,clientH:e.clientHeight,
          scrollW:e.scrollWidth,clientW:e.clientWidth,overflow:css.overflow,overflowY:css.overflowY,
          position:css.position,width:css.width,maxWidth:css.maxWidth,minHeight:css.minHeight,
          height:css.height,marginBottom:css.marginBottom,paddingBottom:css.paddingBottom,
          display:css.display,whiteSpace:css.whiteSpace}};
      const nodes=[...article?.querySelectorAll("*")||[]];
      const scroll=nodes.filter(e=>e.scrollHeight>e.clientHeight+20&&["auto","scroll","hidden"].includes(getComputedStyle(e).overflowY))
        .map(stat).slice(0,12);
      const constrained=nodes.filter(e=>{const s=getComputedStyle(e);return (e.scrollWidth>e.clientWidth+100)||
        (/px|%/.test(s.width)&&e.clientWidth<article.clientWidth*0.67&&e.clientWidth>300&&
         ["DIV","TABLE","P"].includes(e.tagName));}).slice(0,12).map(stat);
      const blocks=[...article?.children||[]].slice(0,10).map(e=>({...stat(e),
        childCount:e.children.length,snippet:(e.innerText||"").slice(0,70)}));
      const last=[...article?.querySelectorAll("p,div,table,section")||[]].slice(-8).map(e=>({
        ...stat(e),snippet:(e.innerText||"").slice(-75)}));
      const tables=nodes.filter(e=>e.tagName==="TABLE").slice(0,3).map(e=>({...stat(e),html:e.outerHTML.slice(0,500),rows:[...e.rows].slice(0,12).map(r=>({
        rect:rect(r),height:r.style.height,html:r.outerHTML.slice(0,180),
        cells:[...r.cells].slice(0,5).map(c=>({rect:rect(c),width:c.style.width,
          height:c.style.height,html:c.outerHTML.slice(0,120),lastText:(c.innerText||"").slice(-45),
          br:c.querySelectorAll("br").length}))}))}));
      return {body:body&&stat(body),article:article&&stat(article),scroll,constrained,blocks,last,tables,
        related:document.querySelector("[data-pse-menu-related]")&&stat(document.querySelector("[data-pse-menu-related]")),
        scrollGap:article&&Math.round(document.querySelector("[data-pse-menu-related]")?.getBoundingClientRect().top-article.getBoundingClientRect().bottom),
        contentLength:article?.innerText?.length};
    });
    console.log("PSE_PUBLIC_LAYOUT_DIAGNOSTIC="+JSON.stringify({width,slug,http:response?.status()||0,...info}));
    if(width===390 && slug==="thanh-tuu"){
      const cases={
        nestedFixed:'.pse-public-body table table{table-layout:fixed!important}',
        rootFixed:'.pse-public-body table{table-layout:fixed!important}',
        nestedCellsAuto:'.pse-public-body table table td{width:auto!important;min-width:0!important}',
        nestedFixedAuto:'.pse-public-body table table{table-layout:fixed!important}.pse-public-body table table td{width:auto!important;min-width:0!important}',
        rootBlockNestedFixed:'.pse-public-body table:has(table){display:block!important;width:100%!important;height:auto!important;overflow:visible!important}.pse-public-body table table{display:table!important;table-layout:fixed!important}',
      };
      for(const [name,css] of Object.entries(cases)){
        const style=await page.addStyleTag({content:css});
        const result=await page.evaluate(()=>{
          const article=document.querySelector(".pse-public-body .article-content");
          const tables=[...article.querySelectorAll("table")].map(t=>({
            w:Math.round(t.getBoundingClientRect().width),
            client:t.clientWidth,scroll:t.scrollWidth,layout:getComputedStyle(t).tableLayout,
            display:getComputedStyle(t).display
          }));
          return {documentWidth:document.documentElement.scrollWidth,
            clientWidth:document.documentElement.clientWidth,
            articleWidth:article.clientWidth,tables};
        });
        console.log("PSE_MOBILE_TABLE_CSS_PROBE="+JSON.stringify({name,...result}));
        await style.evaluate(el=>el.remove());
      }
    }

   }
  } finally {await page.close()}
 }
}finally{await browser.close()}
