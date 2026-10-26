import { chromium } from 'playwright';
const origin=process.env.PSE_REFERENCE_ORIGIN;
if(!origin || !/^https:\/\/[A-Za-z0-9.-]+\/?$/.test(origin)) throw Error('PSE reference origin not set');
const browser=await chromium.launch({headless:true});
try{
 const p=await browser.newPage({viewport:{width:1440,height:900}});
 const r=await p.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
 if(!r||r.status()>=400)throw Error('Source site unavailable: HTTP '+r?.status());
 const audit=await p.evaluate(()=>{
   const images=[...document.querySelectorAll('img')].map((i)=>({src:i.currentSrc||i.src,alt:i.alt,near:(i.parentElement?.textContent||'').trim().slice(0,100),height:i.naturalHeight,width:i.naturalWidth}));
   return {title:document.title,footerText:(document.querySelector('footer')?.innerText||document.body.innerText.slice(-1800)).slice(-2000),
      probableLogos:images.filter(i=>/g.?cert|\bias\b|\biaf\b|th[oô]ng.b[aá]o|bo.?cong.?thuong|esc|cert|iso/i.test(i.src+' '+i.alt+' '+i.near)),
      footerImgs:[...document.querySelectorAll('footer img, #footer img, .footer img, #bottom img')].map(i=>({src:i.currentSrc||i.src,alt:i.alt,width:i.naturalWidth,height:i.naturalHeight})).slice(0,40),
      imgCount:images.length};
 });
 console.log('PSE_REFERENCE_FOOTER_SOURCE='+JSON.stringify(audit));
}finally{await browser.close()}
