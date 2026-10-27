/** PSE article-only bounded read-only latency check, no site mutations. */
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(String(process.env.ENV_FILE||'').split(/\r?\n/).filter(s=>/^(WC_URL|WC_URL_CLIENT)=/.test(s.trim()))
 .map(s=>{const i=s.indexOf('=');return [s.slice(0,i).trim(),s.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const origin=v=>{const u=new URL(v||'');if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.port||u.pathname.replaceAll('/','')||u.search||u.hash)throw Error('Invalid configured origin');return u.origin};
const wp=origin(env.WC_URL),web=origin(env.WC_URL_CLIENT);
if(wp===web)throw Error('WordPress same as frontend');
mkdirSync('artifacts/pse-ssr-post-detail',{recursive:true});
async function time(label,url,trial) {
 const start=performance.now();
 try {
  const res=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{Accept:'application/json,text/html;q=0.8'}});
  const ttfb=Math.round(performance.now()-start);
  const body=await res.arrayBuffer();
  const data={label,trial,status:res.status,ttfbMs:ttfb,totalMs:Math.round(performance.now()-start),bytes:body.byteLength};
  console.log('PSE_NEWS_DETAIL_METRIC='+JSON.stringify(data));
  return {data,body:new TextDecoder().decode(body)};
 }catch(e){const data={label,trial,error:e?.message?.slice(0,130)||String(e)};console.log('PSE_NEWS_DETAIL_METRIC='+JSON.stringify(data));return {data,body:''}}
}
const seed=await time('WordPress 1-post slug lookup',new URL('/wp-json/wp/v2/posts?per_page=1&page=1&status=publish&_fields=id,slug,date',wp),1);
let candidates=[];
try{
 const posts=JSON.parse(seed.body);
 if(Array.isArray(posts))candidates=posts.map(x=>x.slug).filter(s=>/^[a-z0-9-]+$/.test(s));
}catch{}
const results=[seed.data];
for(const slug of candidates.slice(0,1)){
 const u=new URL('/wp-json/custom/v1/related-posts-by-slug',wp);
 u.searchParams.set('slug',slug);
 const trials=[
  ['WP detail cur only',false],
  ['WP detail with related=true',true],
 ];
 for(const [label,relate] of trials){
  u.searchParams.set('relate',String(relate));
  for(let i=1;i<=2;i++){const r=await time(label,u,i);results.push(r.data);}
 }
 const publicUrl=new URL('/bai-viet/'+slug,web);
 for(let i=1;i<=2;i++){const r=await time('Frontend article SSR',publicUrl,i);results.push(r.data)}
}
const output={checkedAt:new Date().toISOString(),articleFound:candidates.length>0,results,
 note:'Read-only serial calls. These timings include network+PHP+DB; use DB query profiler to isolate SQL cost.'};
writeFileSync('artifacts/pse-ssr-post-detail/report.json',JSON.stringify(output,null,2)+'\n');
console.log('PSE_NEWS_DETAIL_AUDIT='+JSON.stringify({articleFound:output.articleFound,results}));
