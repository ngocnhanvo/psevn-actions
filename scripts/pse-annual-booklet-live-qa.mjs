/** Read-only browser acceptance for the four repaired annual reports. No CMS writes. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const specs=[{year:2012,count:26,pdf:0},{year:2013,count:26,pdf:0},
 {year:2015,count:33,pdf:0},{year:2016,count:32,pdf:1}];
const base='https://pse.webnvn.com';
const browser=await chromium.launch({headless:true});
const records=[];
try{
 for(const viewport of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1});
  const page=await context.newPage();
  for(const sp of specs){
   const url=base+'/bao-cao-thuong-nien-'+sp.year;
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
   if(!response||response.status()!==200)throw Error('Annual page HTTP '+response?.status()+' '+url);
   await page.locator('#article-content img').first().waitFor({state:'attached',timeout:30000});
   const info=await page.evaluate(()=>{
    const root=document.querySelector('#article-content'),h1=document.querySelector('main h1');
    if(!root)throw Error('Missing article content');
    const imgs=[...root.querySelectorAll('img')],links=[...root.querySelectorAll('a[href]')];
    return{h1:h1?.textContent?.trim(),title:document.title,
     text:(root.textContent||'').slice(0,2500),imageCount:imgs.length,
     imageSrcs:imgs.map(i=>i.getAttribute('src')),imagesWithAlt:imgs.filter(i=>i.alt?.includes('báo cáo thường niên')).length,
     documents:links.filter(a=>/\.pdf(?:[?#]|$)/i.test(a.href)),
     docCount:links.filter(a=>/\.pdf(?:[?#]|$)/i.test(a.href)).length,
     externalHosts:links.map(a=>{try{return new URL(a.href).hostname}catch{return ''}}).filter(h=>h&&!['pse.webnvn.com'].includes(h)),
     articleWidth:root.getBoundingClientRect().width,viewportWidth:innerWidth,
     maxImageRight:Math.max(0,...imgs.map(i=>i.getBoundingClientRect().right)),
     articleLeft:root.getBoundingClientRect().left};
   });
   if(!info.h1?.includes('Báo cáo thường niên '+sp.year))throw Error('H1 mismatch '+sp.year);
   if(info.imageCount!==sp.count||info.imagesWithAlt!==sp.count||info.docCount!==sp.pdf)
     throw Error('Article media or alt mismatch '+sp.year+': '+JSON.stringify({img:info.imageCount,alt:info.imagesWithAlt,pdf:info.docCount}));
   if(info.imageSrcs.some(s=>!s?.startsWith('/api/files/wp-content/uploads/')))
     throw Error('Article images escaped same-origin file proxy '+sp.year);
   if(/getkredit|nunax|\.ru|sigProId|embedded image gallery|vtembooklet|free-minigames/i.test(info.text)||
     info.externalHosts.some(h=>h!=='pse.webnvn.com'))
     throw Error('Injected content or external link remains '+sp.year);
   const first=page.locator('#article-content img').first();
   await first.scrollIntoViewIfNeeded();
   await first.evaluate(img=>new Promise((resolve,reject)=>{
    if(img.complete)return img.naturalWidth>0?resolve(true):reject(Error('First JPG failed'));
    img.addEventListener('load',()=>resolve(true),{once:true});
    img.addEventListener('error',()=>reject(Error('JPG loading error')),{once:true});
    setTimeout(()=>reject(Error('First JPG timeout')),30000);
   }));
   const record={year:sp.year,viewport:viewport.name,http:200,h1:info.h1,
    imageCount:info.imageCount,docCount:info.docCount,externalLinkCount:info.externalHosts.length,
    imageLoaded:true,articleWidth:Math.round(info.articleWidth),viewportWidth:info.viewportWidth,
    mediaOriginSafe:true,spamAbsent:true};
   if(sp.year===2012){
    await mkdir('artifacts/pse-annual-booklet-live-qa',{recursive:true});
    await page.screenshot({path:'artifacts/pse-annual-booklet-live-qa/'+viewport.name+'-2012.png',fullPage:false});
   }
   records.push(record);console.log('PSE_ANNUAL_BOOKLET_LIVE='+JSON.stringify(record));
  }
  await context.close();
 }
 await mkdir('artifacts/pse-annual-booklet-live-qa',{recursive:true});
 await writeFile('artifacts/pse-annual-booklet-live-qa/results.json',JSON.stringify(records,null,2)+'\n');
 console.log('PSE_ANNUAL_BOOKLET_LIVE=PASS; tested='+records.length+'; images=117; no_wp_write=true; no_build=true');
}finally{await browser.close()}
