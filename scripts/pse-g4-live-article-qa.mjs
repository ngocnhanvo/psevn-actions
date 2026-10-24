// Read-only PSE post detail smoke: discover URLs from the current CMS archive.
import { chromium } from 'playwright';
const entry=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim())
  .filter(s=>s.startsWith('WC_URL_CLIENT='));
if(entry.length!==1)throw Error('Missing frontend origin');
const origin=new URL(entry[0].slice(14).replace(/^['"]|['"]$/g,''));
if(origin.protocol!=='https:'||origin.username||origin.password||
   !['','/'].includes(origin.pathname)||origin.search||origin.hash)throw Error('Invalid origin');
const browser=await chromium.launch({headless:true});
let failures=0,checks=0;
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const archive=await page.goto(origin.origin+'/tin-tuc-su-kien/',{waitUntil:'domcontentloaded'});
 const links=archive?.status()===200?await page.locator('#posts-grid .grid > div > a').evaluateAll(
  elements=>[...new Set(elements.map(a=>a.href).filter(h=>h.startsWith(location.origin+'/')))].slice(0,3)): [];
 await page.close();
 if(!links.length)throw Error('No verified published article links in news archive');
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}});
  const tab=await context.newPage();
  try{
   for(const link of links){
    const response=await tab.goto(link,{waitUntil:'domcontentloaded',timeout:60000});
    const detail=await tab.evaluate(()=>{
     const main=document.querySelector('#main-content.pse-post-detail');
     const article=main?.querySelector('#article-content');
     const canonical=document.querySelector('link[rel="canonical"]')?.href;
     const desc=document.querySelector('meta[name="description"]')?.content;
     return {
      h1:main?.querySelectorAll('h1').length||0,
      contentCharacters:(article?.textContent||'').trim().length,
      hasTime:!!main?.querySelector('time[datetime]'),
      hasLegacyRelated:(main?.textContent||'').includes('Các bài viết khác'),
      hasSidebar:!!main?.querySelector('.sidebar,.moduletable,#sidebar'),
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
      canonical:!!canonical&&new URL(canonical).origin===location.origin,
      description:!!desc?.trim(),
      images:article?.querySelectorAll('img').length||0,
      pdfs:article?.querySelectorAll('a[href*=".pdf"]').length||0
     };
    });
    const pass=response?.status()===200&&detail.h1===1&&detail.contentCharacters>30&&
      detail.hasTime&&!detail.hasLegacyRelated&&!detail.hasSidebar&&!detail.overflow&&
      detail.canonical&&detail.description;
    checks++;if(!pass)failures++;
    console.log('PSE_G4_ARTICLE='+JSON.stringify({width,path:new URL(link).pathname,http:response?.status(),...detail,ok:pass}));
   }
  }finally{await context.close()}
 }
 console.log('PSE_G4_ARTICLE_QA_SUMMARY='+JSON.stringify({checks,failures,noCMSWrite:true,noBuild:true}));
 if(failures)process.exitCode=1;
}finally{await browser.close()}
