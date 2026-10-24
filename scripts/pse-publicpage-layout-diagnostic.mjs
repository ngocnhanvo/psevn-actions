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
   for(const slug of ["qua-trinh-hinh-thanh-phat-trien","ban-giam-doc","hoi-dong-quan-tri","thong-diep"]){
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
      const tables=nodes.filter(e=>e.tagName==="TABLE").slice(0,3).map(e=>({...stat(e),html:e.outerHTML.slice(0,500)}));
      return {body:body&&stat(body),article:article&&stat(article),scroll,constrained,blocks,last,tables,
        related:document.querySelector("[data-pse-menu-related]")&&stat(document.querySelector("[data-pse-menu-related]")),
        scrollGap:article&&Math.round(document.querySelector("[data-pse-menu-related]")?.getBoundingClientRect().top-article.getBoundingClientRect().bottom),
        contentLength:article?.innerText?.length};
    });
    console.log("PSE_PUBLIC_LAYOUT_DIAGNOSTIC="+JSON.stringify({width,slug,http:response?.status()||0,...info}));
   }
  } finally {await page.close()}
 }
}finally{await browser.close()}
