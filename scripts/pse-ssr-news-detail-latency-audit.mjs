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
// Choose only published article links actually rendered by the archive.
// The former guessed /bai-viet/<WP slug> URL returned 404 and was not a valid SSR benchmark.
const archiveUrl=new URL('/tin-tuc-su-kien/tin-tong-hop',web);
const archive=await time('Published news archive',archiveUrl,1);
const results=[archive.data];
const hrefs=[...archive.body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*flex-grow\s+flex\s+flex-col\s+cursor-pointer[^"']*["']/gi)]
 .map(match=>match[1]).slice(0,5);
const seen=new Set();
let publicArticleFound=false;
let selectedPath='';
for(const href of hrefs){
  let url;
  try{url=new URL(href,archiveUrl)}catch{continue}
  if(url.origin!==web || url.pathname===archiveUrl.pathname || seen.has(url.href)
     || /\/wp-admin\/|\/wp-json\//.test(url.pathname))continue;
  seen.add(url.href);
  const candidate=await time('Published article link validation',url,1);
  results.push(candidate.data);
  if(candidate.data.status!==200)continue;
  const slug=decodeURIComponent(url.pathname.split('/').filter(Boolean).pop()||'');
  if(!/^[a-z0-9-]+$/.test(slug))continue;
  publicArticleFound=true;
  selectedPath=url.pathname;
  console.log('PSE_NEWS_VERIFIED_ARTICLE_PATH='+selectedPath);
  for(let trial=1;trial<=2;trial++){
    const measured=await time('Frontend verified article SSR',url,trial);
    results.push(measured.data);
  }
  const relatedUrl=new URL('/wp-json/custom/v1/related-posts-by-slug',wp);
  relatedUrl.searchParams.set('slug',slug);
  for(const [label,relate] of [['WP detail cur only',false],['WP detail with related=true',true]]){
    relatedUrl.searchParams.set('relate',String(relate));
    for(let trial=1;trial<=2;trial++){
      const measured=await time(label,relatedUrl,trial);
      results.push(measured.data);
    }
  }
  break;
}
const output={checkedAt:new Date().toISOString(),articleFound:publicArticleFound,
  articlePath:selectedPath,inspectedRenderedLinks:hrefs.length,results,
  note:'All candidate article paths derived from rendered public archive links and status checked. Read-only serial requests; network/PHP/DB mixed timing, not a SQL-only profile.'};
writeFileSync('artifacts/pse-ssr-post-detail/report.json',JSON.stringify(output,null,2)+'\n');
console.log('PSE_NEWS_DETAIL_AUDIT='+JSON.stringify({
 articleFound:output.articleFound,articlePath:output.articlePath,
 inspectedRenderedLinks:output.inspectedRenderedLinks,results
}));
