/** Independent browser parity against original Joomla product technical tables, no writes. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const original='https://pse.vn/hoat-dong-kinh-doanh/san-pham/dam-phu-my.html';
const current='https://pse.webnvn.com/san-pham/dam-phu-my';
const wp='https://admin-pse.webnvn.com';
const report={schema:'pse-dam-phu-my-independent-live-parity-v1',source:original,target:current,errors:[],checks:[],status:'STARTED'};
const out='artifacts/pse-dam-phu-my-final';
await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true});
const n=s=>String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
try{
 const desktop=await b.newContext({viewport:{width:1366,height:860}});
 const s=await desktop.newPage();
 const sr=await s.goto(original,{waitUntil:'domcontentloaded',timeout:60000});
 if(sr?.status()!==200)throw Error('Joomla source HTTP '+sr?.status());
 const expected=await s.evaluate(()=>{
  const root=document.querySelector('.item-page [itemprop="articleBody"]');
  if(!root)throw Error('Source article body missing');
  return [...root.querySelectorAll('table')].slice(2).map(t=>
   [...t.querySelectorAll('tr')].map(row=>[...row.querySelectorAll('th,td')]
    .map(c=>(c.textContent||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim()).join(' | ')).join(' || ')
  );
 });
 if(expected.length!==10)throw Error('Expected source ten technical/usage tables, got '+expected.length);
 report.checks.push('source_technical_tables_10');

 const wr=await desktop.request.get(wp+'/wp-json/astro/v1/get-product-categories',{timeout:50000});
 if(wr.status()!==200)throw Error('Public WP category data HTTP '+wr.status());
 const items=await wr.json(),term=Array.isArray(items)?items.find(x=>x.id===1763&&x.slug==='dam-phu-my'):null;
 if(!term?.description||!/<table\b/i.test(term.description))throw Error('WordPress custom product category API omits editor description');
 report.checks.push('wp_category_api_description');

 for(const width of [1366,390]){
  const context=width===1366?desktop:await b.newContext({viewport:{width,height:844},isMobile:true,deviceScaleFactor:1});
  const p=await context.newPage();
  const r=await p.goto(current,{waitUntil:'domcontentloaded',timeout:60000});
  if(r?.status()!==200)throw Error('Frontend category HTTP '+r?.status()+' width '+width);
  await p.locator('.pse-category-editorial').waitFor({timeout:35000});
  const found=await p.evaluate(()=>{
   const content=document.querySelector('.pse-category-editorial');
   const tables=[...content.querySelectorAll('table')].map(t=>
    [...t.querySelectorAll('tr')].map(row=>[...row.querySelectorAll('th,td')]
     .map(c=>(c.textContent||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim()).join(' | ')).join(' || ')
   );
   const cards=[...document.querySelectorAll('main article.group')];
   return {tables,cards:cards.length,legacyImages:content.querySelectorAll('img[src*="pse.vn"]').length,
    horizontalOverflow:document.documentElement.scrollWidth-window.innerWidth,
    textLength:(content.textContent||'').replace(/\s+/g,' ').trim().length};
  });
  if(found.tables.length!==10||found.tables.some((x,i)=>n(x)!==n(expected[i])))
   throw Error('Technical table content does not match independently crawled Joomla source at width '+width+
    '; count='+found.tables.length+' mismatch='+found.tables.findIndex((x,i)=>n(x)!==n(expected[i])));
  if(found.cards!==4)throw Error('Existing four product cards not preserved width '+width+' got '+found.cards);
  if(found.legacyImages)throw Error('Legacy image hotlink present in category content');
  if(found.horizontalOverflow>5)throw Error('Page horizontal overflow at width '+width+': '+found.horizontalOverflow);
  if(found.textLength<2500)throw Error('Category technical text unexpectedly short');
  await p.screenshot({path:out+'/category-'+width+'.png',fullPage:true,timeout:45000});
  report.checks.push('live_'+width+'_10_tables_4_cards_no_overflow');
  if(context!==desktop)await context.close();
 }
 report.status='PASS';
 console.log('PSE_DAM_FINAL_QA='+JSON.stringify(report));
}catch(e){report.status='FAIL';report.errors.push(String(e).slice(0,650));process.exitCode=1;
 console.error('PSE_DAM_FINAL_QA='+JSON.stringify(report))}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await b.close()}
