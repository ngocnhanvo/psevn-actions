/** Read-only image asset census from the original PSE homepage.
 * Do not fetch unrelated hosts or update media, WordPress, or Astro builds.
 */
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();
await page.route(/\.(png|jpe?g|gif|webp|svg|woff2?|ttf)(\?.*)?$/i,route=>route.abort());
try{
  const url='https://www.pse.vn/';
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  if(response?.status()!==200)throw Error('PSE legacy homepage source HTTP '+response?.status());
  const data=await page.evaluate(()=>{
    const byText=el=>(el?.textContent||'').replace(/\s+/g,' ').trim().slice(0,80);
    const images=Array.from(document.querySelectorAll('img')).map(img=>{
      const ancestor=img.closest('header,.header,#header,.logo,.slideshow,.slider,.banner,.hero,.sprocket-features,main,section');
      const attr=img.getAttribute('src')||img.getAttribute('data-src')||'';
      return {url:new URL(attr,location.href).href,alt:(img.alt||'').slice(0,90),
        class:img.className?.baseVal||String(img.className||'').slice(0,90),
        parent:ancestor?.tagName.toLowerCase()+'.'+String(ancestor?.className||'').slice(0,90),
        nearby:byText(img.parentElement).slice(0,55),
        width:img.getAttribute('width')||'',height:img.getAttribute('height')||''};
    }).filter(im=>/^https:\/\/(?:www\.)?pse\.vn\//.test(im.url));
    const backgrounds=[];
    for(const el of Array.from(document.querySelectorAll('header,section,main,[class*=hero],[class*=slider],[class*=banner],[class*=sprocket],[id*=slider],[style*=background]')).slice(0,220)){
      const style=getComputedStyle(el);
      const bg=style.backgroundImage||'';
      if(bg.includes('url(')){
        backgrounds.push({selector:el.tagName.toLowerCase()+'.'+String(el.className||'').slice(0,80),
          css:bg.slice(0,500),height:Math.round(el.getBoundingClientRect().height)});
      }
    }
    const icons=Array.from(document.querySelectorAll('link[rel*=icon]')).map(x=>x.href).slice(0,8);
    return {title:document.title,images:images.slice(0,90),backgrounds:backgrounds.slice(0,30),icons,totalImages:images.length};
  });
  console.log('PSE_SOURCE_HOMEPAGE_MEDIA='+JSON.stringify(data));
}finally{await browser.close()}
