/** Read-only images actually rendered by Astro SSR after Joomla -> WP migration. */
import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
const env=Object.fromEntries(String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>/^(WC_URL|WC_URL_CLIENT)=/.test(s)).map(s=>{let p=s.indexOf('=');return[s.slice(0,p),s.slice(p+1).trim().replace(/^['"]|['"]$/g,'')]}));
function origin(v){const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||!['','/'].includes(u.pathname))throw Error('Unexpected configured origin');return u.origin}
const wp=origin(env.WC_URL),frontend=origin(env.WC_URL_CLIENT);
const ids=[82801,82805,82817,82820,82828,82834];
const report={schema:'pse-tin-tong-hop-imported-media-live-qa-v1',wp,frontend,posts:[],status:'STARTED',errors:[]};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:860}});
const page=await ctx.newPage();
const failed=[];
page.on('requestfailed',r=>{if(/\/(?:api\/images|wp-content\/uploads)/i.test(r.url()))failed.push({url:r.url().slice(0,250),error:r.failure()?.errorText})});
page.on('response',r=>{if(r.status()>=400&&/\/(?:api\/images|wp-content\/uploads)/i.test(r.url()))failed.push({url:r.url().slice(0,250),status:r.status()})});
try{
 for(const id of ids){
  const res=await fetch(wp+'/wp-json/wp/v2/posts/'+id+'?_fields=id,slug,content,status,title',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(30000)});
  if(res.status!==200)throw Error('Cannot read WP published '+id+' HTTP '+res.status);
  const p=await res.json();
  const wpImages=[...String(p.content?.rendered||'').matchAll(/<img\b[^>]*\bsrc=["']([^"']+)/gi)].map(m=>m[1]);
  const r=await page.goto(frontend+'/'+p.slug,{waitUntil:'domcontentloaded',timeout:60000});
  if(r?.status()!==200)throw Error('Astro SSR post '+id+' returned '+r?.status());
  const loaded=await page.locator('#article-content img').evaluateAll(async els=>await Promise.all(els.map(async el=>{
   const img=el;try{await Promise.race([img.decode(),new Promise((_,reject)=>setTimeout(()=>reject(Error('image timeout')),5000))])}catch{}
   const css=getComputedStyle(img),rect=img.getBoundingClientRect();
   return {src:img.getAttribute('src')||'',currentSrc:img.currentSrc||'',srcset:img.getAttribute('srcset')||'',
    alt:img.getAttribute('alt')||'',naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,
    complete:img.complete,visible:css.display!=='none'&&css.visibility!=='hidden'&&Number(css.opacity)>0&&rect.width>1&&rect.height>1,
    width:Math.round(rect.width),height:Math.round(rect.height),display:css.display};
  })));
  const wpUrls=wpImages.slice(0,12).map(url=>url.replaceAll('&amp;','&'));
  const wpStatus=[];
  for(const asset of wpUrls.slice(0,4)){
   try{const u=new URL(asset,wp);const a=await ctx.request.get(u.toString(),{timeout:18000,failOnStatusCode:false});wpStatus.push({url:u.pathname,status:a.status(),type:a.headers()['content-type']||'',length:(await a.body()).length});}
   catch(e){wpStatus.push({url:asset,error:String(e?.message||e).slice(0,100)})}
  }
  const broken=loaded.filter(x=>x.naturalWidth===0||!x.visible);
  report.posts.push({id,slug:p.slug,wordpressImages:wpImages.length,astroImages:loaded.length,broken:broken.length,
   wordpressSample:wpUrls.slice(0,5),wpMediaStatus:wpStatus,astroSamples:loaded.slice(0,10),errors:broken.slice(0,6)});
  console.log('PSE_IMPORTED_ARTICLE_MEDIA='+JSON.stringify({id,wpImages:wpImages.length,astroImages:loaded.length,broken:broken.length,
   wpMediaStatus:wpStatus.map(x=>({http:x.status,url:x.url,error:x.error})),html:loaded.slice(0,3).map(x=>({src:x.src,naturalWidth:x.naturalWidth,visible:x.visible}))}));
 }
 report.status=report.posts.every(p=>p.broken===0&&p.astroImages===p.wordpressImages)?'PASS':'FAIL_MISSING_MEDIA';
 if(report.status!=='PASS')throw Error('Astro posts have missing/unrendered images; '+report.posts.filter(p=>p.broken||p.astroImages!==p.wordpressImages).map(p=>p.id).join(','));
 console.log('PSE_IMPORTED_ARTICLE_MEDIA_QA=PASS');
}catch(e){report.errors.push(String(e?.message||e));report.status='FAIL';console.error('PSE_IMPORTED_ARTICLE_MEDIA_QA_ERROR='+report.errors.at(-1));throw e}
finally{
 await mkdir('artifacts/pse-tin-tong-hop-imported-media',{recursive:true});
 await writeFile('artifacts/pse-tin-tong-hop-imported-media/report.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();
}