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
 const hierarchy=await page.evaluate(()=>{
   const root=document.querySelector('nav.navigation > ul.nav.unite-nav')
     ||document.querySelector('ul.nav.unite-nav')
     ||document.querySelector('nav.navigation ul.nav');
   if(!root)return {found:false};
   const clean=x=>String(x||'').replace(/\\s+/g,' ').trim().slice(0,140);
   const parse=(li,depth)=>{
     const anchor=li.querySelector(':scope > a[href]');
     const children=Array.from(li.querySelectorAll(':scope > ul > li, :scope > .dropdown-menu > li'))
       .slice(0,35).map(x=>depth<4?parse(x,depth+1):null).filter(Boolean);
     return {label:clean(anchor?.textContent||li.querySelector(':scope > span')?.textContent),
       url:anchor?.href||'',children};
   };
   return {found:true,selector:root.tagName+'.'+root.className,
     roots:Array.from(root.children).filter(x=>x.tagName==='LI').slice(0,35).map(li=>parse(li,0))};
 });
 console.log('PSE_LEGACY_MENU_TREE='+JSON.stringify(hierarchy));
 console.log('PSE_LEGACY_NAVIGATION_SOURCE_PASS; no_wp_mutation=true; no_build=true');
}finally{await browser.close()}
