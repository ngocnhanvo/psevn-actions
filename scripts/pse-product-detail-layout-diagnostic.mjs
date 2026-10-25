/** READ ONLY diagnosis of user-reported PSE Product detail layout and category header. */
import {chromium} from "playwright";
const config=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const xs=config.filter(s=>s.startsWith("WC_URL_CLIENT="));
if(xs.length!==1)throw Error("Missing frontend site origin");
const src=new URL(xs[0].slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(src.protocol!=="https:" || src.username || src.password || src.search || src.hash || !["","/"].includes(src.pathname)) throw Error("Invalid frontend origin");
const path="/san-pham/npk-phu-my-15-15-15-nhap-khau-1714";
const browser=await chromium.launch({headless:true});
try{
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  try{
   const res=await page.goto(src.origin+path,{waitUntil:"domcontentloaded",timeout:60000});
   const scan=await page.evaluate(()=>{
    const rect=(el)=>{if(!el)return null;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),display:s.display,position:s.position,top:s.top,marginTop:s.marginTop,marginBottom:s.marginBottom,paddingTop:s.paddingTop,paddingBottom:s.paddingBottom,overflow:s.overflow,whiteSpace:s.whiteSpace}};
    const root=document.querySelector("#data-content-wrapper");
    const desc=document.querySelector(".product-description");
    const rows=[...(desc?.querySelectorAll("table tr")||[])].slice(0,9).map(tr=>({text:tr.textContent?.trim().slice(0,125),rect:rect(tr),cells:[...tr.children].slice(0,4).map(td=>({rect:rect(td),name:td.tagName,text:td.textContent?.trim().slice(0,100),elements:[...td.children].slice(0,5).map(x=>({tag:x.tagName,rect:rect(x),style:x.getAttribute("style")}))}))}));
    const paragraphs=[...(desc?.querySelectorAll("p")||[])].slice(0,12).map(el=>({text:el.textContent?.trim().slice(0,100),rect:rect(el)}));
    const menus=[...document.querySelectorAll("#main-header a[href*='san-pham']")].slice(0,15).map(el=>({name:el.textContent?.trim().slice(0,70),url:el.getAttribute("href"),active:el.getAttribute("aria-current"),html:el.className.slice(0,80)}));
    return{url:location.pathname,canonical:document.querySelector('link[rel="canonical"]')?.getAttribute("href"),header:rect(document.querySelector("#main-header")),main:rect(root),gallery:rect(document.querySelector(".product-gallery-sticky")),image:rect(document.querySelector("#product-main-image")),detail:rect(root?.children[1]),description:rect(desc),h1:[...document.querySelectorAll("h1")].map(x=>x.textContent?.trim()),firstTables:[...desc?.querySelectorAll("table")||[]].slice(0,3).map(x=>({outer:x.outerHTML.slice(0,1300),rect:rect(x)})),rows,paragraphs,menus,overflow:document.documentElement.scrollWidth>innerWidth+4};
   });
   console.log("PSE_PRODUCT_DETAIL_DIAG="+JSON.stringify({width,http:res?.status(),scan}).slice(0,20500));
  }finally{await page.close()}
 }
}finally{await browser.close()}
