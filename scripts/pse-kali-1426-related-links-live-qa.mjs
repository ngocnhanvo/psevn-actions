/** Read-only postdeploy QA of Kali 1426's two remaining relevant links. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const env=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
const matches=env.filter(x=>x.startsWith('WC_URL_CLIENT='));
if(matches.length!==1)throw Error('Missing unique client origin');
const url=new URL(matches[0].slice('WC_URL_CLIENT='.length).replace(/^['"]|['"]$/g,''));
if(url.origin!=='https://pse.webnvn.com'||url.search||url.hash||!['','/'].includes(url.pathname))
  throw Error('Incorrect frontend URL');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1240,height:900},deviceScaleFactor:1});
mkdirSync('artifacts/pse-kali-related-links-live',{recursive:true});
try{
  for(const width of [1240,390]){
    await page.setViewportSize({width,height:900});
    const response=await page.goto(url.origin+'/kali-phu-my-mo-ta-cac-bien-the',
      {waitUntil:'domcontentloaded',timeout:60000});
    const state=await page.evaluate(()=>{
      const scope=document.querySelector('main .pse-historical-kali-1426');
      const imageCount=scope?.querySelectorAll('table img')?.length||0;
      const list=scope?.querySelector('ul');
      const links=list?[...list.querySelectorAll('li a')].map(a=>({
        title:a.textContent.replace(/\s+/g,' ').trim(),url:a.href})):null;
      const css=[...document.querySelectorAll('main style')].some(x=>x.textContent.includes('.pse-historical-kali-1426'));
      return {h1:document.querySelector('main h1')?.textContent?.trim(),links,imageCount,
        cssApplied:css,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth};
    });
    console.log('PSE_KALI_RELATED_LINKS_LIVE='+JSON.stringify({http:response?.status(),width,...state}));
    if(response?.status()!==200||state.h1!=='Kali Phú Mỹ'||!state.cssApplied||state.imageCount!==3||
       state.scrollWidth>width+3||state.links?.length!==2||
       state.links[0].url!==url.origin+'/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my'||
       state.links[1].url!==url.origin+'/npk-phu-my'||
       state.links.some(l=>/pse\.vn|Nội dung đang cập nhật/i.test(l.url+' '+l.title)))
      throw Error('Unexpected related links on published Kali 1426 width='+width);
    await page.screenshot({path:'artifacts/pse-kali-related-links-live/kali-'+width+'.png',fullPage:true});
  }
  const dest=await page.goto(url.origin+'/npk-phu-my',{waitUntil:'domcontentloaded',timeout:60000});
  const h1=await page.locator('main h1').first().textContent();
  if(dest?.status()!==200||!h1?.includes('NPK Phú Mỹ'))throw Error('NPK link navigation target failed');
  console.log('PSE_KALI_RELATED_LINKS_LIVE_QA=PASS page=83572 links=2 npk=200 placeholder=removed cmsWrites=0');
}finally{await browser.close();}
