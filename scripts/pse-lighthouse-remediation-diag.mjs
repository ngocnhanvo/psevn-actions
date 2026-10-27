import {chromium} from 'playwright';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
const lines=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim()).filter(x=>x.startsWith('WC_URL_CLIENT='));
if(lines.length!==1)throw Error('Missing frontend config');
const u=new URL(lines[0].slice(14).replace(/^['"]|['"]$/g,''));
if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||!['','/'].includes(u.pathname))throw Error('Invalid origin');
const targets=[
 '/ban-giam-doc','/ban-kiem-soat','/hoi-dong-quan-tri','/lien-he',
 '/dinh-huong-phat-trien','/xu-ly-khieu-nai-y-kien-khach-hang',
 '/tam-nhin-su-menh','/so-do-to-chuc','/san-pham/dam-phu-my'
];
const shard=Number(process.env.PSE_AUDIT_SHARD);
if(!Number.isInteger(shard)||shard<0||shard>2)throw Error('shard');
mkdirSync('artifacts/pse-lighthouse-dom',{recursive:true});
const results=[];
for(const [idx,path] of targets.entries()){
 if(idx%3!==shard)continue;
 const output='artifacts/pse-lighthouse-dom/tmp-'+shard+'.json';
 const run=spawnSync('node_modules/.bin/lighthouse',
  [new URL(path,u.origin).href,'--quiet','--preset=desktop',
   '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
   '--only-categories=accessibility,seo',
   '--output=json','--output-path='+output],{
  timeout:170000,encoding:'utf8',env:{...process.env,CHROME_PATH:chromium.executablePath()}
 });
 if(run.status!==0){
  results.push({path,error:(run.stderr||'').slice(-400)});continue
 }
 const data=JSON.parse(readFileSync(output,'utf8'));
 const bad={};
 for(const key of ['color-contrast','aria-prohibited-attr','heading-order','td-has-header','meta-description']){
  const x=data.audits[key];
  if(x&&x.score!==1){
   bad[key]={score:x.score,items:(x.details?.items||[]).slice(0,18).map(y=>({
    node:{selector:y.node?.selector,html:y.node?.snippet?.slice(0,400),
      failureSummary:y.node?.explanation},
    relatedNodes:(y.relatedNodes||[]).slice(0,3).map(z=>({selector:z.selector,snippet:z.snippet})),
    contrastRatio:y.contrastRatio,
    expectedContrastRatio:y.expectedContrastRatio,
    sample:y.displayValue
   }))};
  }
 }
 results.push({path,bad});
 console.log('PSE_LIGHTHOUSE_DOM='+JSON.stringify({path,bad}));
 rmSync(output,{force:true});
}
writeFileSync('artifacts/pse-lighthouse-dom/diagnostic-'+shard+'.json',
 JSON.stringify(results,null,2)+'\n');
