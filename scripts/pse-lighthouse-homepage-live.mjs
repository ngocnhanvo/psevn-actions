/** Read-only desktop Lighthouse check of published PSE home route. */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const values = Object.fromEntries(String(process.env.ENV_FILE||'')
  .split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''))
  .filter(x=>x.startsWith('WC_URL_CLIENT='))
  .map(x=>['WC_URL_CLIENT',x.slice('WC_URL_CLIENT='.length).replace(/^['"]|['"]$/g,'')]));
const base = new URL(values.WC_URL_CLIENT||'');
if(base.protocol!=='https:'||!base.hostname||base.username||base.password||
   !['','/'].includes(base.pathname)||base.search||base.hash||base.port) {
  throw new Error('Invalid PSE public origin');
}
const url = new URL('/trang-chu',base.origin).href;
mkdirSync('artifacts/pse-lighthouse',{recursive:true});
const output='artifacts/pse-lighthouse/homepage-desktop.json';
const exe='node_modules/.bin/lighthouse';
const args=[
  url,'--quiet','--preset=desktop',
  '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
  '--only-categories=performance,accessibility,best-practices,seo',
  '--output=json', '--output-path='+output,
];
const result=spawnSync(exe,args,{
  stdio:'inherit',timeout:180000,
  env:{...process.env,CHROME_PATH:chromium.executablePath()},
});
if(result.status!==0)throw new Error('Lighthouse CLI failed: '+result.status);
const audit=JSON.parse(readFileSync(output,'utf8'));
if(new URL(audit.finalUrl).origin!==base.origin)throw Error('Lighthouse navigated outside PSE');
const scores=Object.fromEntries(Object.entries(audit.categories).map(([k,v])=>[k,Math.round(v.score*100)]));
const actionable=Object.values(audit.audits||{})
 .filter(a=>a.scoreDisplayMode==='binary'&&a.score===0)
 .map(a=>({id:a.id,title:a.title}));
const verdict={url:new URL(audit.finalUrl).pathname,
  scores,failedActionable:actionable,
  robotsBlocked:audit.audits['is-crawlable']?.score===0};
writeFileSync('artifacts/pse-lighthouse/summary.json',JSON.stringify(verdict,null,2)+'\n');
console.log('PSE_LIGHTHOUSE_LIVE='+JSON.stringify(verdict));
const perfDiagnostics = (audit.categories.performance?.auditRefs || [])
  .filter(x => x.weight > 0)
  .map(x => {
    const a = audit.audits[x.id] || {};
    return {id:x.id,weight:x.weight,score:a.score,numeric:a.numericValue,
      display:a.displayValue || '',mode:a.scoreDisplayMode};
  });
console.log('PSE_LIGHTHOUSE_PERF_METRICS='+JSON.stringify(perfDiagnostics));

if(scores.accessibility!==100||scores.seo!==100||scores['best-practices']!==100) {
  console.error('PSE_LIGHTHOUSE_ACCESSIBILITY_SEO_100=NOT_YET');
  process.exitCode=1;
}else console.log('PSE_LIGHTHOUSE_ACCESSIBILITY_SEO_100=PASS');
