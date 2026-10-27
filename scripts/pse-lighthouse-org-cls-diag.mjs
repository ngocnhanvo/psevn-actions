/** PSE desktop organization chart CLS attribution, read only. */
import {chromium} from 'playwright';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const env=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim()).filter(x=>x.startsWith('WC_URL_CLIENT='));
if(env.length!==1)throw Error('PSE URL config unavailable');
const base=new URL(env[0].slice(14).replace(/^['"]|['"]$/g,''));
if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.port||!['','/'].includes(base.pathname))
 throw Error('Invalid public site origin');
const url=base.origin+'/so-do-to-chuc';
mkdirSync('artifacts/pse-org-cls',{recursive:true});
const path='artifacts/pse-org-cls/lighthouse.json';
const run=spawnSync('node_modules/.bin/lighthouse',[url,'--quiet','--preset=desktop',
 '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--only-categories=performance',
 '--output=json','--output-path='+path],{
  timeout:180000,encoding:'utf8',env:{...process.env,CHROME_PATH:chromium.executablePath()}
});
if(run.status!==0)throw Error('Lighthouse CLI failed '+String(run.stderr||'').slice(-1200));
const data=JSON.parse(readFileSync(path,'utf8'));
if(new URL(data.finalUrl).origin!==base.origin)throw Error('Offsite redirect');
const keys=Object.keys(data.audits||{}).filter(x=>/layout|shift|cls/i.test(x));
const details=Object.fromEntries(keys.map(k=>[k,{
 score:data.audits[k]?.score,display:data.audits[k]?.displayValue,
 numeric:data.audits[k]?.numericValue,
 items:data.audits[k]?.details?.items?.slice(0,16),
 detailsType:data.audits[k]?.details?.type,
 otherDetails:data.audits[k]?.details?.type!=='table'?data.audits[k]?.details:null
}]));
const result={path:'/so-do-to-chuc',performance:Math.round(data.categories.performance.score*100),
 cls:data.audits['cumulative-layout-shift']?.numericValue,audits:details};
writeFileSync('artifacts/pse-org-cls/summary.json',JSON.stringify(result,null,2)+'\n');
console.log('PSE_ORG_CLS_DETAIL='+JSON.stringify(result).slice(0,27000));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.addInitScript(()=>{
  window.pseShiftSources=[];
  new PerformanceObserver(list=>{
   for(const e of list.getEntries()){
    if(e.hadRecentInput)continue;
    window.pseShiftSources.push({value:e.value,
     sources:(e.sources||[]).map(s=>({tag:s.node?.tagName,id:s.node?.id,
      classes:String(s.node?.className||'').slice(0,90),html:s.node?.outerHTML?.slice(0,190),
      old:s.previousRect,new:s.currentRect})).slice(0,9)});
   }
  }).observe({type:'layout-shift',buffered:true});
 });
 const p=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
 if(p?.status()!==200)throw Error('Organization chart not HTTP 200');
 await page.waitForTimeout(2000);
 const out=await page.evaluate(()=>({shifts:window.pseShiftSources,
  images:[...document.querySelectorAll('main img')].slice(0,20).map(img=>({
   path:(()=>{try{return new URL(img.currentSrc||img.getAttribute('src')||'',location.href).pathname}catch{return '[unavailable]'}})(),width:img.width,height:img.height,
   naturalWidth:img.naturalWidth,attrWidth:img.getAttribute('width'),
   attrHeight:img.getAttribute('height')}))}));
 writeFileSync('artifacts/pse-org-cls/dom.json',JSON.stringify(out,null,2)+'\n');
 console.log('PSE_ORG_CLS_DOM='+JSON.stringify(out).slice(0,20000));
}finally{await browser.close()}
