/** Read-only verified legacy PSE featured articles, content/date/media candidates.
 * No WordPress mutation, no Astro build; intended for a bounded migration batch.
 */
import { chromium } from 'playwright';
const sourceUrls=[
  'https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/1736-pvfcco-pse-to-chuc-thanh-cong-giai-pickleball-pse-open-2026.html',
  'https://www.pse.vn/hoat-dong-kinh-doanh/thong-tin-thi-truong/369-diem-tin-nganh-nong-nghiep-tren-cac-bao-ra-ngay-1462013.html',
  'https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh/1737-20261019-cbtt-bao-cao-tai-chinh-q3-2026.html'
];
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
await context.route(/\.(png|jpe?g|gif|webp|svg|woff2?|ttf)(\?.*)?$/i,route=>route.abort());
try{
 for(const url of sourceUrls){
   const p=await context.newPage();
   p.setDefaultTimeout(24000);
   let status=0,issue='';
   try{
     const response=await p.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
     status=response?.status()||0;
   }catch(error){issue=String(error).slice(0,220)}
   if(status!==200){
     console.log('PSE_SOURCE_ARTICLE_FETCH='+JSON.stringify({url,status,error:issue}));
     await p.close();
     continue;
   }
   const record=await p.evaluate(()=>{
     const text=el=>(el?.textContent||'').replace(/\s+/g,' ').trim();
     const meta=key=>document.querySelector('meta[property="'+key+'"],meta[name="'+key+'"],meta[itemprop="'+key+'"]')?.content||'';
     const selectors=['.com-content-article__body','.item-page .com-content-article__body','.item-page','.article-content','.item-page .item-content',
       '[itemprop="articleBody"]','.com-content-article','main article','article','.blog-item','main'];
     const candidates=selectors.map(css=>{
       const el=document.querySelector(css);
       if(!el)return null;
       return {selector:css,textChars:text(el).length,textStart:text(el).slice(0,180),
         images:el.querySelectorAll('img').length,anchors:el.querySelectorAll('a[href]').length,
         paragraphs:el.querySelectorAll('p').length};
     }).filter(Boolean);
     const root=document.querySelector('[itemprop="articleBody"],.com-content-article__body,.item-page,main article,article')||document.querySelector('main');
     const imageCandidates=Array.from(root?.querySelectorAll('img')||[]).slice(0,8).map(img=>({
       src:new URL(img.getAttribute('src')||'',location.href).href,
       alt:img.alt||'',w:img.getAttribute('width')||'',h:img.getAttribute('height')||''
     })).filter(x=>x.src.startsWith('https://www.pse.vn/')||x.src.startsWith('https://pse.vn/'));
     const documents=Array.from(root?.querySelectorAll('a[href]')||[])
       .filter(a=>/\.(pdf|docx?|xlsx?)(?:[?#]|$)/i.test(a.href))
       .slice(0,12).map(a=>({text:text(a).slice(0,100),href:a.href}));
     return {
       url:location.href,title:document.title.slice(0,180),h1:text(document.querySelector('h1'))||'',
       ogTitle:meta('og:title'),description:meta('description').slice(0,220),
       published:meta('article:published_time')||meta('datePublished')||meta('date')||'',
       timeNodes:Array.from(document.querySelectorAll('time[datetime],dd.published,.published,.create,.article-info-term'))
         .slice(0,8).map(x=>({tag:x.tagName,time:x.getAttribute('datetime'),text:text(x).slice(0,90)})),
       canonical:document.querySelector('link[rel=canonical]')?.href||'',
       candidates,imageCandidates,documents
     };
   });
   console.log('PSE_SOURCE_ARTICLE_AUDIT='+JSON.stringify({status,...record}));
   await p.close();
 }
}finally{await browser.close()}
