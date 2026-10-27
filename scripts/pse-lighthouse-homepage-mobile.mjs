/** Read-only Lighthouse Mobile smoke for the deployed PSE homepage. */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const config = Object.fromEntries(String(process.env.ENV_FILE || '')
  .split(/\r?\n/).map(s=>s.trim()).filter(s=>s.startsWith('WC_URL_CLIENT='))
  .map(s=>['WC_URL_CLIENT',s.slice('WC_URL_CLIENT='.length).replace(/^['"]|['"]$/g,'')]));
const base=new URL(config.WC_URL_CLIENT||'');
if(base.protocol!=='https:'||!base.hostname||base.username||base.password||
  !['','/'].includes(base.pathname)||base.search||base.hash||base.port){
  throw new Error('Invalid configured PSE production origin');
}
const url=new URL('/trang-chu',base.origin).href;
mkdirSync('artifacts/pse-lighthouse-mobile',{recursive:true});
const path='artifacts/pse-lighthouse-mobile/homepage-mobile.json';
const r=spawnSync('node_modules/.bin/lighthouse',[
  url,'--quiet',
  '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
  '--only-categories=performance,accessibility,best-practices,seo',
  '--output=json','--output-path='+path,
],{stdio:'inherit',timeout:180000,env:{...process.env,CHROME_PATH:chromium.executablePath()}});
if(r.status!==0)throw Error('Mobile Lighthouse failed status '+r.status);
const a=JSON.parse(readFileSync(path,'utf8'));
if(new URL(a.finalUrl).origin!==base.origin)throw Error('Outside PSE origin');
const scores=Object.fromEntries(Object.entries(a.categories).map(([k,v])=>[k,Math.round(v.score*100)]));
const metrics=Object.fromEntries([
 ['fcp','first-contentful-paint'],
 ['lcp','largest-contentful-paint'],
 ['si','speed-index'],['tbt','total-blocking-time'],['cls','cumulative-layout-shift']
].map(([k,v])=>[k,a.audits[v]?.numericValue]));
const verdict={path:new URL(a.finalUrl).pathname,scores,metrics};
writeFileSync('artifacts/pse-lighthouse-mobile/summary.json',JSON.stringify(verdict,null,2)+'\n');
console.log('PSE_HOMEPAGE_MOBILE_LIGHTHOUSE='+JSON.stringify(verdict));
if(scores.accessibility!==100||scores['best-practices']!==100||scores.seo!==100)
  throw Error('Mobile regression in SEO/BP/A11y scores');
