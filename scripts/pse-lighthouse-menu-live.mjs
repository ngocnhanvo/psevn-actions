/** Lighthouse menu census: GET-only; no WordPress login/write, no Astro build. */
import {chromium} from 'playwright';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
const value=String(process.env.ENV_FILE||'').split(/\r?\n/)
 .map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL_CLIENT='));
if(value.length!==1)throw Error('Expected single public frontend origin');
const originValue=new URL(value[0].slice(14).replace(/^['"]|['"]$/g,''));
if(originValue.protocol!=='https:'||originValue.username||originValue.password||
 originValue.port||originValue.search||originValue.hash||!['','/'].includes(originValue.pathname))
 throw Error('Unsafe frontend origin');
const origin=originValue.origin;
const shard=Number(process.env.PSE_MENU_SHARD),shards=Number(process.env.PSE_MENU_SHARDS);
if(!Number.isInteger(shard)||!Number.isInteger(shards)||shards<1||shards>20||shard<0||shard>=shards)
 throw Error('Invalid shard selection');
const folder='artifacts/pse-lighthouse-menu/shard-'+shard;
mkdirSync(folder,{recursive:true});
const save=(name,obj)=>writeFileSync(folder+'/'+name,JSON.stringify(obj,null,2)+'\n');
const browser=await chromium.launch({headless:true});
let entries,omitted=[],anchorCount=0;
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const response=await page.goto(origin+'/trang-chu',{waitUntil:'domcontentloaded',timeout:60000});
 if(response?.status()!==200)throw Error('Homepage HTTP '+response?.status());
 await page.waitForFunction(()=>document.querySelectorAll('#desktop-menu a[href]').length>=12,
  null,{timeout:20000});
 const links=await page.evaluate(()=>[...document.querySelectorAll(
 '#desktop-menu a[href],#mobile-menu-container a[href]')].map(a=>({
  label:(a.textContent||'').replace(/\s+/g,' ').trim().slice(0,110),href:a.href
 })));
 anchorCount=links.length;
 const byPath=new Map();
 for(const link of links){
  let u;
  try{u=new URL(link.href)}catch{omitted.push({label:link.label,reason:'invalid'});continue}
  if(u.origin!==origin){omitted.push({label:link.label,reason:'external',path:u.pathname});continue}
  if(u.username||u.password){omitted.push({label:link.label,reason:'credentials'});continue}
  let p=u.pathname.replace(/\/+$/,'')||'/';
  if(p==='/')p='/trang-chu';
  if(/^\/(?:bai-viet|ssr\/posts|wp-admin|wp-json|wp-content)(?:\/|$)/i.test(p)||
   /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|csv|png|jpe?g|webp|gif|svg|mp4|webm|xml|txt)$/i.test(p)){
    omitted.push({label:link.label,reason:'article-or-download',path:p});continue
  }
  const key=p+u.search;
  if(!byPath.has(key))byPath.set(key,{path:key,labels:[link.label]});
  else if(link.label&&!byPath.get(key).labels.includes(link.label))byPath.get(key).labels.push(link.label);
 }
 if(!byPath.has('/trang-chu'))byPath.set('/trang-chu',{path:'/trang-chu',labels:['Trang chủ']});
 entries=[...byPath.values()].sort((a,b)=>a.path.localeCompare(b.path,'vi'));
 if(entries.length<12)throw Error('Menu unexpectedly small: '+entries.length);
 save('inventory.json',{origin,anchorCount,distinctPages:entries.length,omitted,entries,shard,shards});
 console.log('PSE_MENU_LIGHTHOUSE_INVENTORY='+JSON.stringify({
  origin,anchorCount,distinctPages:entries.length,shard,shards,paths:entries.map(x=>x.path)
 }));
}finally{await browser.close()}
const mine=entries.filter((x,i)=>i%shards===shard),results=[];
for(const [i,item] of mine.entries()){
 for(const device of ['mobile','desktop']){
  const report=folder+'/tmp-'+i+'-'+device+'.json';
  const args=[new URL(item.path,origin).href,'--quiet',
   ...(device==='desktop'?['--preset=desktop']:[]),
   '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
   '--only-categories=performance,accessibility,best-practices,seo',
   '--output=json','--output-path='+report];
  console.log('PSE_MENU_LIGHTHOUSE_START='+JSON.stringify({shard,position:i+1,total:mine.length,
   path:item.path,device}));
  const r=spawnSync('node_modules/.bin/lighthouse',args,{
   timeout:180000,encoding:'utf8',maxBuffer:4*1024*1024,
   env:{...process.env,CHROME_PATH:chromium.executablePath()}
  });
  let row;
  if(r.status!==0||r.error){
   row={path:item.path,labels:item.labels,device,status:'LIGHTHOUSE_FAILED',
    error:String(r.error?.message||r.stderr||r.stdout||('exit '+r.status)).slice(-1600)};
  }else{
   try{
    const data=JSON.parse(readFileSync(report,'utf8'));
    const final=new URL(data.finalUrl);
    if(final.origin!==origin)throw Error('Redirect outside PSE origin');
    const score=k=>data.categories[k]?.score==null?null:Math.round(data.categories[k].score*100);
    const metric=k=>data.audits[k]?.numericValue??null;
    row={path:item.path,labels:item.labels,device,status:'MEASURED',
     finalPath:final.pathname,httpStatusAudit:data.audits['http-status-code']?.score??null,
     scores:{performance:score('performance'),accessibility:score('accessibility'),
      bestPractices:score('best-practices'),seo:score('seo')},
     metrics:{fcpMs:metric('first-contentful-paint'),lcpMs:metric('largest-contentful-paint'),
      tbtMs:metric('total-blocking-time'),cls:metric('cumulative-layout-shift'),
      speedIndexMs:metric('speed-index')},
     failedAudits:Object.values(data.audits||{}).filter(a=>a.scoreDisplayMode==='binary'&&a.score===0)
      .slice(0,35).map(a=>({id:a.id,title:a.title})),
     lighthouseVersion:data.lighthouseVersion,fetchTime:data.fetchTime};
   }catch(e){row={path:item.path,labels:item.labels,device,status:'PARSE_FAILED',error:String(e)}}
  }
  rmSync(report,{force:true});
  results.push(row);
  save('summary.json',{origin,shard,shards,totalMenuPages:entries.length,
   pagesOnShard:mine.length,expectedMeasurements:mine.length*2,completed:results.length,results});
  console.log('PSE_MENU_LIGHTHOUSE_PAGE='+JSON.stringify(row));
 }
}
const header=['Path','Menu labels','Device','Status','Performance','Accessibility',
 'Best Practices','SEO','LCP ms','CLS'];
const csv=[header,...results.map(x=>[x.path,(x.labels||[]).join(' / '),x.device,x.status,
 x.scores?.performance,x.scores?.accessibility,x.scores?.bestPractices,x.scores?.seo,
 x.metrics?.lcpMs,x.metrics?.cls])].map(line=>line.map(v=>'"'+String(v??'')
 .replace(/"/g,'""')+'"').join(',')).join('\n')+'\n';
writeFileSync(folder+'/scores.csv',csv);
const errors=results.filter(x=>x.status!=='MEASURED');
console.log('PSE_MENU_LIGHTHOUSE_SHARD='+JSON.stringify({
 shard,shards,totalMenuPages:entries.length,measured:results.length-errors.length,
 errors:errors.length,output:folder}));
if(errors.length)process.exitCode=1;
