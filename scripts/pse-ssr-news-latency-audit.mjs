/**
 * PSE SSR news origin/API timing evidence, read-only; no HTTP writes.
 * Two sequential trials only to avoid stressing a live WordPress host.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const config = Object.fromEntries(String(process.env.ENV_FILE||'')
  .split(/\r?\n/).map(v=>v.trim()).filter(v=>/^(WC_URL|WC_URL_CLIENT)=/.test(v))
  .map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const validate = (raw)=>{
  const u=new URL(raw||'');
  if(u.protocol!=='https:'||!u.hostname||u.username||u.password||
     u.port||!['','/'].includes(u.pathname)||u.search||u.hash)
    throw new Error('Invalid site origin configured');
  return u.origin;
};
const publicOrigin=validate(config.WC_URL_CLIENT), wpOrigin=validate(config.WC_URL);
if(wpOrigin===publicOrigin)throw Error('Expected separate WP and frontend origins');
mkdirSync('artifacts/pse-ssr-news',{recursive:true});
const headers={'Accept':'text/html,application/json;q=0.9','User-Agent':'PSE-latency-audit/1.0 (read only)'};
async function measure(label,url,trial=1) {
  const ctrl=AbortSignal.timeout(30000);
  let response;
  const a=performance.now();
  try {
    response=await fetch(url,{signal:ctrl,headers,redirect:'follow'});
    const atHeader=performance.now();
    const body=await response.arrayBuffer();
    const atBody=performance.now();
    const t={label,trial,status:response.status,
      ttfbMs:Math.round(atHeader-a),totalMs:Math.round(atBody-a),
      bytes:body.byteLength,
      contentType:(response.headers.get('content-type')||'').split(';')[0],
      cacheControl:response.headers.get('cache-control')||'',
      age:response.headers.get('age')||'',
      serverTiming:response.headers.get('server-timing')||'',
    };
    console.log('PSE_SSR_LATENCY_SAMPLE='+JSON.stringify(t));
    return {summary:t,body:new TextDecoder().decode(body)};
  }catch(e) {
    const t={label,trial,error:e instanceof Error?e.name+':'+e.message.slice(0,120):String(e),elapsedMs:Math.round(performance.now()-a)};
    console.log('PSE_SSR_LATENCY_SAMPLE='+JSON.stringify(t));
    return {summary:t,body:''};
  }
}
const categoryPaths=[
  '/tin-tuc-su-kien/tin-tong-hop',
  '/tin-tuc-su-kien/thong-tin-thi-truong',
  '/tin-tuc-su-kien/bao-cao-thuong-nien',
  '/tin-tuc-su-kien/thong-tin-co-dong',
];
const results=[];
const first=await measure('SSR archive:tin-tong-hop',new URL(categoryPaths[0],publicOrigin),1);
results.push(first.summary);
const anchors=[...first.body.matchAll(/href=["']([^"' ]*\/bai-viet\/[a-z0-9-]+)\/?["']/gi)]
  .map(m=>m[1]).filter(x=>!/[?#]/.test(x));
let postSlug='';
for(const target of anchors.slice(0,4)){
  try{const u=new URL(target,publicOrigin);if(u.origin===publicOrigin){postSlug=u.pathname.split('/').filter(Boolean).pop()||'';break}}catch{}
}
const queries=[
  ['SSR archive:all',new URL('/tin-tuc-su-kien',publicOrigin)],
  ['SSR archive:thi-truong',new URL(categoryPaths[1],publicOrigin)],
  ['SSR archive:bao-cao',new URL(categoryPaths[2],publicOrigin)],
  ['SSR archive:co-dong',new URL(categoryPaths[3],publicOrigin)],
  ['WP categories registry',new URL('/wp-json/wp/v2/categories?per_page=100&page=1&hide_empty=false&_fields=id,name,slug,parent,description,yoast_head_json',wpOrigin)],
  ['WP posts embed',new URL('/wp-json/wp/v2/posts?_embed=true&status=publish&orderby=date&order=desc&per_page=12&page=1',wpOrigin)],
  ['WP posts minimal',new URL('/wp-json/wp/v2/posts?status=publish&orderby=date&order=desc&per_page=12&page=1&_fields=id,slug,title,date',wpOrigin)],
];
if(postSlug){
 queries.push(['SSR article',new URL('/bai-viet/'+postSlug,publicOrigin)]);
 const u=new URL('/wp-json/custom/v1/related-posts-by-slug',wpOrigin);
 u.searchParams.set('slug',postSlug);u.searchParams.set('relate','true');
 queries.push(['WP custom related-posts',u]);
}
for(const [label,url] of queries){
 for(const trial of [1,2]){
  const result=await measure(label,url,trial);
  results.push(result.summary);
 }
}
const report={checkedAt:new Date().toISOString(),candidateDetailDetected:Boolean(postSlug),
  results,notes:[
    'TTFB is observed from GitHub Actions runner to configured frontend or WordPress host. Cross-host network time included.',
    'Two sequential GETs per endpoint; no cache-busting and no write requests.',
    'A fast WordPress REST response cannot rule out costly individual SQL statements without server profiler; slow API alone does not prove DB bottleneck.'
  ]};
writeFileSync('artifacts/pse-ssr-news/measurements.json',JSON.stringify(report,null,2)+'\n');
console.log('PSE_SSR_LATENCY_REPORT='+JSON.stringify({
  sampleCount:results.length,postDetailMeasured:report.candidateDetailDetected,
  medianByRoute:Object.fromEntries([...new Set(results.map(r=>r.label))].map(label=>{
    const arr=results.filter(r=>r.label===label&&Number.isFinite(r.ttfbMs)).map(r=>r.ttfbMs).sort((a,b)=>a-b);
    return [label,arr.length?arr[Math.floor(arr.length/2)]:null];
  }))
}));
