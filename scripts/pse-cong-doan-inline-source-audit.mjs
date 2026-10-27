/** Read-only inspect two Joomla full-text blog items whose permalink is HTTP 500. */
import {chromium} from "playwright";
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.route(/\.(?:woff2?|ttf)(?:\?.*)?$/i,r=>r.abort());
 const category="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/hoat-dong-cong-doan-doan-tn-nu-cong.html";
 const res=await page.goto(category,{waitUntil:"domcontentloaded",timeout:60000});
 if(res?.status()!==200)throw Error("Joomla original category not accessible");
 const rows=await page.evaluate(()=>{
  return [...document.querySelectorAll('.blog [itemprop="blogPost"]')].slice(0,2).map(el=>{
   const title=el.querySelector('[itemprop="name"],h2,h3')?.textContent?.replace(/\s+/g," ").trim()||"";
   const block=el.querySelector('[itemprop="articleBody"]')||el;
   const links=[...block.querySelectorAll("a[href]")].map(x=>({text:x.textContent?.trim().slice(0,60),href:x.href})).slice(0,12);
   const imgs=[...block.querySelectorAll("img[src]")].map(x=>({src:x.src,alt:x.alt})).slice(0,25);
   const text=block.textContent?.replace(/\s+/g," ").trim()||"";
   return{title,blogpostHtmlStart:el.outerHTML.slice(0,1900),bodyTag:block.tagName,
     bodyClass:block.className,textLength:text.length,textFirst:text.slice(0,450),
     textLast:text.slice(-400),links,imgs,readMore:el.querySelectorAll(".readmore,a.readmore").length};
  });
 });
 console.log("PSE_CONG_DOAN_INLINE_AUDIT="+JSON.stringify({http:res.status(),rows}));
 for(const id of [1637,1638]){
  const slug=id===1637?"pvfcco-pse-cung-nhau-huong-ung-huong-ve-ngay-le-trong-dai-ky-niem-50-nam-ngay-giai-phong-mien-nam-thong-nhat-dat-nuoc-30-4-1975-30-4-2025":"ky-niem-21-nam-cong-doan-pvfcco-a-huong-ve-50-nam-ngay-giai-phong-mien-nam-thong-nhat-dat-nuoc";
  const detail=await page.request.get(category.replace(".html","/"+id+"-"+slug+".html"),{timeout:40000});
  console.log("PSE_CONG_DOAN_INLINE_SOURCE="+JSON.stringify({id,http:detail.status()}));
 }
}finally{await browser.close()}
