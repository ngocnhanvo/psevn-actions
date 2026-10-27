/** Read-only targeted Lighthouse retry. Only five NO_NAVSTART measurements from #40549910858. */
import {chromium} from 'playwright';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
const rows=String(process.env.ENV_FILE||'').split(/\r?\n/)
 .map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL_CLIENT='));
if(rows.length!==1)throw Error('Missing PSE frontend config');
const url=new URL(rows[0].slice('WC_URL_CLIENT='.length).replace(/^['"]|['"]$/g,''));
if(url.protocol!=='https:'||url.username||url.password||url.port||
 url.search||url.hash||!['','/'].includes(url.pathname))throw Error('Invalid HTTPS origin');
const targets=[
 {path:'/ban-giam-doc',device:'desktop'},
 {path:'/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my',device:'mobile'},
 {path:'/nganh-nghe-kinh-doanh',device:'desktop'},
 {path:'/san-pham/nhom-san-pham-ure-nguyen-lieu-cho-san-xuat-cong-nghiep',device:'mobile'},
 {path:'/thong-tin-tai-chinh',device:'mobile'}
];
mkdirSync('artifacts/pse-lighthouse-menu-retry',{recursive:true});
const results=[];
for(const [index,t] of targets.entries()){
 let entry;
 for(let attempt=1;attempt<=3;attempt++){
  const out='artifacts/pse-lighthouse-menu-retry/temp-'+index+'.json';
  const args=[new URL(t.path,url.origin).href,'--quiet',
   ...(t.device==='desktop'?['--preset=desktop']:[]),
   '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
   '--only-categories=performance,accessibility,best-practices,seo',
   '--output=json','--output-path='+out];
  const run=spawnSync('node_modules/.bin/lighthouse',args,{
   encoding:'utf8',timeout:180000,env:{...process.env,CHROME_PATH:chromium.executablePath()}
  });
  if(run.status===0){
   try{
    const a=JSON.parse(readFileSync(out,'utf8'));
    if(new URL(a.finalUrl).origin!==url.origin)throw Error('Offsite redirect');
    const score=x=>a.categories[x]?.score==null?null:Math.round(a.categories[x].score*100);
    const metric=x=>a.audits[x]?.numericValue??null;
    entry={...t,attempt,status:'MEASURED',scores:{
     performance:score('performance'),accessibility:score('accessibility'),
     bestPractices:score('best-practices'),seo:score('seo')},
     metrics:{fcpMs:metric('first-contentful-paint'),lcpMs:metric('largest-contentful-paint'),
      tbtMs:metric('total-blocking-time'),cls:metric('cumulative-layout-shift'),
      speedIndexMs:metric('speed-index')},
     failedAudits:Object.values(a.audits||{})
      .filter(x=>x.scoreDisplayMode==='binary'&&x.score===0)
      .map(x=>({id:x.id,title:x.title})),fetchTime:a.fetchTime};
   }catch(e){entry={...t,attempt,status:'PARSE_FAILED',error:String(e)}}
  }else{
   entry={...t,attempt,status:'LIGHTHOUSE_FAILED',
    error:String(run.error?.message||run.stderr||('exit '+run.status)).slice(-800)};
  }
  rmSync(out,{force:true});
  console.log('PSE_MENU_LIGHTHOUSE_RETRY='+JSON.stringify(entry));
  if(entry.status==='MEASURED')break;
 }
 results.push(entry);
 writeFileSync('artifacts/pse-lighthouse-menu-retry/summary.json',
  JSON.stringify({run:'40549910858',targets:targets.length,results},null,2)+'\n');
}
const failed=results.filter(x=>x.status!=='MEASURED');
console.log('PSE_MENU_LIGHTHOUSE_RETRY_SUMMARY='+JSON.stringify({
 measured:results.length-failed.length,failed:failed.length}));
if(failed.length)process.exitCode=1;
