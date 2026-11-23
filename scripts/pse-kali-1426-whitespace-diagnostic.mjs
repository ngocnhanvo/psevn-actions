/** Read-only forensic layout inspection of Kali Page 83572 whitespace. */
import {chromium} from "playwright";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
try{
 const response=await page.goto("https://pse.webnvn.com/kali-phu-my-mo-ta-cac-bien-the",
   {waitUntil:"domcontentloaded",timeout:60000});
 if(response?.status()!==200)throw Error("Unexpected public status");
 for(const width of [1440,1240,768,390]){
  await page.setViewportSize({width,height:900});
  await page.locator(".pse-historical-kali-1426 img").evaluateAll(imgs=>imgs.forEach(img=>img.loading="eager"));
  await page.waitForTimeout(500);
  const data=await page.evaluate(()=>{
   const b=el=>{if(!el)return null;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {
    tag:el.tagName.toLowerCase(),cls:String(el.className).slice(0,80),html:el.outerHTML.slice(0,180),
    text:el.textContent?.trim()?.replace(/\s+/g," ").slice(0,65),
    y:Math.round(r.y),h:Math.round(r.height),bottom:Math.round(r.bottom),
    mt:s.marginTop,mb:s.marginBottom,pt:s.paddingTop,pb:s.paddingBottom,display:s.display,
    lineHeight:s.lineHeight,overflow:s.overflow}};
   const hero=document.querySelector(".pse-public-page header h1");
   const header=document.querySelector(".pse-public-page header");
   const section=document.querySelector(".pse-public-body");
   const article=document.querySelector(".pse-public-body .article-content");
   const wrap=document.querySelector(".pse-historical-kali-1426");
   const table=wrap?.querySelector("table");
   const above=table?[...article.querySelectorAll("*")].filter(el=>{
    const r=el.getBoundingClientRect(),t=table.getBoundingClientRect();
    return r.height>0&&r.bottom<=t.y&&r.y>=article.getBoundingClientRect().y;
   }).slice(0,28).map(b):[];
   return {width:innerWidth,docW:document.documentElement.scrollWidth,
    hero:b(hero),header:b(header),section:b(section),article:b(article),
    children:[...article.children].map(b).slice(0,12),
    wrapper:b(wrap),wrapperChildren:wrap?[...wrap.children].slice(0,12).map(b):[],
    table:b(table),tableRows:table?[...table.rows].map(b):[],
    cells:table?[...table.rows].map(row=>[...row.cells].map(b)):[],
    images:wrap?[...wrap.querySelectorAll("img")].map(b):[],above}};
  });
  console.log("PSE_KALI_WHITESPACE_METRICS="+JSON.stringify(data).slice(0,36000));
 }
 console.log("PSE_KALI_WHITESPACE_DIAG=PASS read_only=true");
}finally{await browser.close();}
