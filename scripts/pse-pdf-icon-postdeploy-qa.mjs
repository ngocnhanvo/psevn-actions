/** Verify PDF document icon dimensions after existing PSE production deployment. READ ONLY. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const root='https://pse.webnvn.com';
const target=root+'/quy-che-noi-bo-ve-quan-tri-cong-ty-16-04-2018';
const expectedImage='/api/images/96/png/wp-content/uploads/2026/10/pse-legacy-9d0398eade66fb17.webp';
const expectedPdf='/wp-content/uploads/2026/10/pse-legacy-84b86d569d20e69b.pdf';
const report={schema:'pse-pdf-icon-postdeploy-v1',target,checks:[],errors:[],result:'STARTED'};
const browser=await chromium.launch({headless:true});
try{
 const c=await browser.newContext();
 for(const [device,viewport] of [['desktop',{width:1366,height:840}],['mobile',{width:390,height:844}]]){
  const p=await c.newPage();await p.setViewportSize(viewport);
  try{
   const resp=await p.goto(target,{waitUntil:'domcontentloaded',timeout:55000});
   if(resp?.status()!==200)throw Error(device+' article HTTP '+resp?.status());
   const selector='#article-content img[alt="pdf" i]';
   await p.locator(selector).first().waitFor({state:'visible',timeout:25000});
   const info=await p.evaluate(selector=>{
    const image=document.querySelector(selector);
    if(!image)return null;
    const rect=image.getBoundingClientRect(),css=getComputedStyle(image),pdf=image.closest('a[href]');
    return{
      naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,loaded:image.complete,
      displayWidth:Math.round(rect.width*100)/100,displayHeight:Math.round(rect.height*100)/100,
      maxWidth:css.maxWidth,src:image.getAttribute('src'),href:pdf?.getAttribute('href'),
      overflow:document.documentElement.scrollWidth-window.innerWidth,
      h1:document.querySelector('h1')?.textContent?.trim()
    };
   },selector);
   if(!info||info.src!==expectedImage||info.href!==expectedPdf)
    throw Error(device+' PDF icon src or file link differs from expected: '+JSON.stringify(info));
   if(!(info.displayWidth>0&&info.displayWidth<=25&&info.displayHeight>0&&info.displayHeight<=25&&info.overflow<=3))
    throw Error(device+' PDF icon oversized or page overflow: '+JSON.stringify(info));
   if(!info.h1?.includes('Quy chế nội bộ về quản trị công ty'))
    throw Error(device+' title/heading drift');
   report.checks.push({device,passed:true,...info});
   console.log('PSE_PDF_ICON_POSTDEPLOY='+JSON.stringify({device,status:'PASS',displayWidth:info.displayWidth,displayHeight:info.displayHeight,src:info.src,overflow:info.overflow}));
   const listing='/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty/2';
   const listResponse=await p.goto(root+listing,{waitUntil:'domcontentloaded',timeout:55000});
   if(listResponse?.status()!==200)throw Error(device+' listing HTTP '+listResponse?.status());
   const cards=await p.locator('#posts-grid .group').evaluateAll(elements=>elements.map(card=>{
     const link=card.querySelector('a[href]'),tile=card.querySelector('[data-pse-document-thumb="pdf"]'),
       svg=tile?.querySelector('svg'),rect=svg?.getBoundingClientRect();
     return {href:link?.getAttribute('href')||'',hasPdfTile:!!tile,
       tileText:tile?.textContent?.trim()||'',vectorWidth:rect?.width||0,
       hasPhoto:!!card.querySelector('img.post-card-img'),
       image:card.querySelector('img.post-card-img')?.getAttribute('src')||null};
   }));
   const examples=[
     '/quy-che-noi-bo-ve-quan-tri-cong-ty-16-04-2018',
     '/dieu-le-cong-ty-co-phan-phan-bon-va-hoa-chat-dau-khi-dong-nam-bo-2018'
   ];
   for(const link of examples){
     const card=cards.find(x=>x.href===link);
     if(!card||!card.hasPdfTile||card.hasPhoto||!card.tileText.includes('Tài liệu PDF')||
        card.vectorWidth<24||card.vectorWidth>48){
       throw Error(device+' PDF document card not vector-safe '+link+': '+JSON.stringify(card));
     }
   }
   if(cards.filter(x=>x.hasPdfTile).length<5) throw Error(device+' expected multiple PDF vector cards across archived records');
   const missingImageCard=cards.find(x=>x.href?.includes('20200728-bc42'));
   if(!missingImageCard||missingImageCard.image!=='/images/posts/no-image.svg')
     throw Error(device+' no-image card fallback changed: '+JSON.stringify(missingImageCard));
   report.checks.push({device,type:'listing',passed:true,checked:examples.length,vectorPdfTiles:cards.filter(x=>x.hasPdfTile).length});
   console.log('PSE_PDF_ARCHIVE_POSTDEPLOY='+JSON.stringify({device,status:'PASS',route:listing,
     exampleCards:examples.length,vectorPdfTiles:cards.filter(x=>x.hasPdfTile).length}));
  }catch(e){report.errors.push({device,error:String(e).slice(0,400)});console.error('PSE_PDF_ICON_POSTDEPLOY_FAIL='+String(e))}
  finally{await p.close()}
 }
 report.result=report.errors.length===0&&report.checks.length===4?'PASS_DESKTOP_MOBILE_ICON_24PX':'FAIL';
}catch(e){report.errors.push({error:String(e).slice(0,400)});report.result='FAIL';console.error('PSE_PDF_ICON_FATAL='+String(e))}
finally{await mkdir('artifacts/pse-pdf-icon-postdeploy',{recursive:true});await writeFile('artifacts/pse-pdf-icon-postdeploy/report.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
if(report.result!=='PASS_DESKTOP_MOBILE_ICON_24PX')process.exitCode=1;
