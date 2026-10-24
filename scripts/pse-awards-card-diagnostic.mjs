import { chromium } from "playwright";
const record=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim()).find(s=>s.startsWith("WC_URL_CLIENT="));
if(!record)throw Error("Missing WC_URL_CLIENT in authorized env");
const origin=new URL(record.slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,"")).origin;
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  try{
   const response=await page.goto(origin+"/thanh-tuu",{waitUntil:"networkidle",timeout:60000});
   const data=await page.evaluate(()=>{
     const article=document.querySelector(".pse-public-body .article-content");
     const tables=[...article.querySelectorAll("table")];
     const nested=tables.find(t=>t.closest("td"))||tables.at(-1);
     const rows=[...nested?.querySelectorAll(":scope > tbody > tr")||[]].map((r,i)=>{
       const cells=[...r.children].filter(e=>["TD","TH"].includes(e.tagName));
       return {index:i,cells:cells.map((c,j)=>({
         index:j,html:c.innerHTML.slice(0,1650),
         text:c.textContent.replace(/\s+/g," ").trim().slice(0,850),
         images:[...c.querySelectorAll("img")].map(img=>({
           src:img.currentSrc||img.src,alt:img.alt,
           width:img.naturalWidth,height:img.naturalHeight,complete:img.complete
         })),
         computed:{width:Math.round(c.getBoundingClientRect().width),
           color:getComputedStyle(c).color,background:getComputedStyle(c).backgroundColor,
           opacity:getComputedStyle(c).opacity,overflow:getComputedStyle(c).overflow}
       }))};
     });
     const tableMarkup=tables.map(t=>({start:t.outerHTML.slice(0,650),width:Math.round(t.getBoundingClientRect().width)}));
     return {length:article.innerHTML.length,children:article.children.length,
       tables:tableMarkup,rows,
       articleClasses:article.className,
       imageCount:article.querySelectorAll("img").length,
       bodyOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3};
   });
   console.log("PSE_AWARDS_CARD_DIAGNOSTIC="+JSON.stringify({width,http:response?.status()||0,...data}));
  }finally{await page.close()}
 }
}finally{await browser.close()}
