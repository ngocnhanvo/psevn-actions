/** Read-only PSE production visual verification after WordPress-controlled deploy.
 * All content and URLs come from the configured frontend. Never signs in,
 * mutates WordPress, invokes Build Website, or opens FTPS.
 */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const entries=String(process.env.ENV_FILE||'').split(/\r?\n/)
 .map(x=>x.trim().replace(/^export\s+/,''))
 .filter(x=>x.startsWith('WC_URL_CLIENT='));
if(entries.length!==1)throw Error('Expected one configured PSE frontend URL');
const url=new URL(entries[0].slice('WC_URL_CLIENT='.length).trim().replace(/^['"]|['"]$/g,''));
if(url.protocol!=='https:'||!url.hostname||url.username||url.password||
 url.port&&url.port!=='443'||!['','/'].includes(url.pathname)||url.search||url.hash)
 throw Error('Invalid configured PSE frontend origin');
const origin=url.origin;
const widths=[375,390,768,1440,1920];
const expected=['hero','news','promise','utilities'];
const dir=path.resolve('artifacts/pse-live-visual-qa');
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const width of widths){
  const page=await browser.newPage({viewport:{width,height:Math.min(920,Math.round(width*.70)+480)},deviceScaleFactor:1});
  try{
   const r=await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:45000});
   if(!r||r.status()!==200)throw Error('Public homepage HTTP '+r?.status());
   await page.locator('[data-pse-section="hero"]').waitFor({state:'visible',timeout:20000});
   const areas=page.locator('[data-pse-section]');
   const n=await areas.count();
   for(let i=0;i<n;i++)await areas.nth(i).scrollIntoViewIfNeeded({timeout:10000});
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.waitForTimeout(700);
   const v=await page.evaluate(()=>{
    const names=[...document.querySelectorAll('[data-pse-section]')]
     .map(e=>e.getAttribute('data-pse-section'));
    const rects=[...document.querySelectorAll('[data-pse-section]')]
     .map(e=>({name:e.getAttribute('data-pse-section'),width:Math.round(e.getBoundingClientRect().width)}));
    const imageErrors=[...document.querySelectorAll('[data-pse-section] img')]
      .filter(x=>x.complete&&x.naturalWidth===0).length;
    return {sections:names,rects,h1:document.querySelectorAll('h1').length,
      newsTabs:document.querySelectorAll('[data-pse-news-tab]').length,
      newsPanels:document.querySelectorAll('[data-pse-news-panel]').length,
      viewport:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,
      imageErrors,obstructedHero:!!document.querySelector('.pse-hero__copy,.pse-hero__shade'),
      searchForm:!!document.querySelector('.pse-tools__search, .pse-tools__message')};
   });
   if(JSON.stringify(v.sections)!==JSON.stringify(expected))
    throw Error('PSE LIVE sections mismatch: '+JSON.stringify(v.sections));
   if(v.h1!==1||v.obstructedHero||v.newsTabs!==3||v.newsPanels!==3||!v.searchForm)
    throw Error('PSE live homepage structure missing: '+JSON.stringify(v));
   if(v.scrollWidth>v.viewport+3||v.rects.some(r=>r.width<100)||v.imageErrors>0)
    throw Error('PSE live viewport/media problem: '+JSON.stringify(v));
   const tabs=page.locator("[data-pse-news-tab]");
   const panels=page.locator("[data-pse-news-panel]");
   if(await tabs.count()!==3||await panels.count()!==3)
     throw Error("Three WordPress latest-news tabs not rendered");
   for(let i=0;i<3;i++){
     await tabs.nth(i).click();
     if(await tabs.nth(i).getAttribute("aria-selected")!=="true" ||
        await panels.nth(i).isHidden() ||
        await panels.filter({visible:true}).count()!==1)
       throw Error("WordPress news tab selection failed at "+i);
     const featured=await panels.nth(i).locator(".pse-news__featured").count();
     const extra=await panels.nth(i).locator(".pse-news__more li").count();
     if(featured!==1||featured+extra>5)
       throw Error("Latest news tab must show 1–5 published articles, got "+(featured+extra));
     console.log("PSE_NEWS_LATEST_FIVE_TAB=PASS; width="+width+"; category_tab="+i+"; displayed="+(featured+extra));
   }
   await tabs.first().focus();
   await page.keyboard.press("ArrowRight");
   if(await tabs.nth(1).getAttribute("aria-selected")!=="true")
     throw Error("Latest news tabs keyboard interaction failed");
   await tabs.first().click();
   const output=path.join(dir,'pse-live-'+width+'.png');
   await page.screenshot({path:output,fullPage:true,animations:'disabled',timeout:20000});
   console.log('PSE_LIVE_VISUAL_VIEWPORT=PASS; width='+width+
    '; sections='+v.sections.join(',')+'; h1='+v.h1+
    '; news_tabs='+v.newsTabs+'; overflow='+(v.scrollWidth-v.viewport)+
    '; broken_section_images='+v.imageErrors);
  }finally{await page.close()}
 }
 console.log('PSE_LIVE_VISUAL_QA=PASS; widths='+widths.join(',')+'; source=deployed_WordPress_Astro; no_mutation=true');
}finally{await browser.close()}
