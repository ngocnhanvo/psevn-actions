/** Read-only legacy Joomla navigation inventory for the PSE redesign.
 * Public PSE source only. No WordPress mutation or Astro build.
 */
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});
try{
 const page=await context.newPage();
 await page.route(/\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf)(?:\?.*)?$/i,route=>route.abort());
 const response=await page.goto('https://www.pse.vn/',{waitUntil:'domcontentloaded',timeout:60000});
 if(response?.status()!==200)throw Error('Original PSE public site unavailable HTTP '+response?.status());
 const state=await page.evaluate(()=>{
   const clean=t=>String(t||'').replace(/\s+/g,' ').trim().slice(0,105);
   const main=document.querySelector('header nav,nav.main-menu,nav.navbar,.t3-mainnav,#menu,.ja-megamenu,.mainmenu,.sp-megamenu-parent,.nav.menu,.mod-menu');
   const rootCandidates=Array.from(document.querySelectorAll('nav,ul.menu,ul.nav,.mainmenu,.ja-megamenu,.sp-megamenu-parent')).slice(0,30)
     .map(el=>({
       selector:el.tagName.toLowerCase()+'.'+String(el.className||'').slice(0,70),
       itemCount:el.querySelectorAll('a[href]').length,
       items:Array.from(el.querySelectorAll('a[href]')).slice(0,28).map(a=>({
         text:clean(a.textContent),href:a.href,
         hasChildren:!!a.parentElement?.querySelector(':scope > ul')
       }))
     })).filter(x=>x.itemCount>=3 && x.itemCount<=100);
   const names=['Trang chủ','Giới thiệu','Hoạt động kinh doanh','Tin tức','Thông tin cổ đông','Liên hệ'];
   const byName=names.map(term=>{
     const matches=Array.from(document.querySelectorAll('a[href]'))
       .filter(a=>clean(a.textContent).toLowerCase().includes(term.toLowerCase()))
       .slice(0,8).map(a=>({
         label:clean(a.textContent),href:a.href,
         parentTag:a.parentElement?.tagName||null,
         childLinks:Array.from(a.parentElement?.querySelectorAll(':scope > ul a[href]')||[])
           .slice(0,14).map(link=>({label:clean(link.textContent),href:link.href}))
       }));
     return {term,matches};
   });
   return {title:document.title.slice(0,125),
     mainSelector:main?main.tagName.toLowerCase()+'.'+String(main.className||'').slice(0,65):null,
     rootCandidates:rootCandidates.slice(0,12),byName};
 });
 console.log('PSE_LEGACY_NAVIGATION_READONLY='+JSON.stringify(state));
 console.log('PSE_LEGACY_NAVIGATION_SOURCE_PASS; no_wp_mutation=true; no_build=true');
}finally{await browser.close()}
