/** Isolate a single observed organization Page CLS spike without modifying layout. */
import {chromium} from 'playwright';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
const matches=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim())
 .filter(x=>x.startsWith('WC_URL_CLIENT='));
if(matches.length!==1)throw Error('Expected one frontend origin');
const u=new URL(matches[0].slice('WC_URL_CLIENT='.length).replace(/^['"]|['"]$/g,''));
if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||
 !['','/'].includes(u.pathname))throw Error('Unexpected origin');
const target=new URL('/so-do-to-chuc',u.origin);
mkdirSync('artifacts/pse-organization-cls',{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const live=[];
try{
  await page.addInitScript(()=>{
   window.__pseLayoutShifts=[];
   try{
    const po=new PerformanceObserver(list=>{
     for(const entry of list.getEntries()){
      if(entry.hadRecentInput)continue;
      window.__pseLayoutShifts.push({
       value:entry.value,
       sources:(entry.sources||[]).slice(0,8).map(s=>({
        tag:s.node?.tagName,
        id:String(s.node?.id||'').slice(0,80),
        cls:String(typeof s.node?.className==='string'?s.node.className:'').slice(0,140),
        outer:String(s.node?.outerHTML||'').slice(0,220),
        previous:s.previousRect,
        current:s.currentRect
       }))
      });
     }
    });po.observe({type:'layout-shift',buffered:true});
   }catch{}
  });
 for(let i=0;i<3;i++){
  const response=await page.goto(target.href,{waitUntil:'load',timeout:60000});
  await page.waitForTimeout(2200);
  const sample=await page.evaluate(()=>({
   title:document.title,hasH1:!!document.querySelector('h1'),
   viewport:{width:innerWidth,height:innerHeight,docWidth:document.documentElement.scrollWidth},
   shifts:window.__pseLayoutShifts||[],
   images:[...document.querySelectorAll('main img')].slice(0,30).map(img=>({
    srcPath:(()=>{try{return new URL(img.currentSrc||img.src).pathname}catch{return ''}})(),
    alt:String(img.alt||'').slice(0,80),
    attrWidth:img.getAttribute('width'),attrHeight:img.getAttribute('height'),
    naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,
    displayedRect:{width:Math.round(img.getBoundingClientRect().width),
      height:Math.round(img.getBoundingClientRect().height)},
    loading:img.loading
   })),
   mainRect:(()=>{const r=document.querySelector('main')?.getBoundingClientRect();return r&&{y:r.y,height:r.height}})(),
  }));
  const cls=sample.shifts.reduce((sum,x)=>sum+x.value,0);
  live.push({run:i+1,http:response?.status(),cls,...sample});
  console.log('PSE_ORGANIZATION_BROWSER_CLS='+JSON.stringify({run:i+1,http:response?.status(),
   cls,shifts:sample.shifts,images:sample.images}).slice(0,14000));
 }
}finally{await browser.close()}

writeFileSync('artifacts/pse-organization-cls/summary.json',JSON.stringify({
 purpose:'Read-only browser layout-shift source investigation after independent Lighthouse repeats',
 site:target.origin,route:target.pathname,live,noChanges:true
},null,2)+'\\n');
if(live.filter(x=>x.http===200).length<2)throw Error('Not enough page observations');
