/** Read-only attempt to recover originally linked images, without TLS bypass or image substitution. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {searchDate} from './pse-legacy-search-date.mjs';
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||!state.backup_verified)throw Error('Wrong migration state');
const ids=['186','202'];const root='artifacts/pse-tin-tong-hop-image-probe';await mkdir(root,{recursive:true});
const report={schema:'pse-186-202-historic-media-probe-v1',readonly:true,records:[],status:'STARTED'};
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1366,height:860}});
try{
 for(const id of ids){
  const r=state.articles[id];
  if(r?.status!=='quarantined'||r.reason!=='Article contains non-local mandatory media'||
    !r.source_url.includes('/tin-cong-ty/tin-tong-hop/'+id+'-'))throw Error('Checkpoint drift '+id);
  const page=await context.newPage();
  const response=await page.goto(r.source_url,{waitUntil:'domcontentloaded',timeout:60000});
  if(response?.status()!==200)throw Error('Joomla detail unavailable '+id);
  const source=await page.evaluate(()=>{
   const el=document.querySelector('[itemprop="articleBody"]');
   return {title:(document.title||'').replace(/\s+-\s+PSE\.VN.*$/i,'').trim(),opening:(el?.textContent||'').replace(/\s+/g,' ').trim().slice(0,400),
     images:[...new Set([...el?.querySelectorAll('img[src]')||[]].map(x=>new URL(x.getAttribute('src'),location.href).href))]};
  });
  await page.close();
  if(!source.title||!source.images.length)throw Error('No original assets '+id);
  const assets=[];
  for(const url of source.images){
   const tests=[];
   for(const referer of ['',id==='186'?'https://danviet.vn/':'https://baobinhphuoc.com.vn/']){
    try{
     const res=await context.request.get(url,{timeout:30000,failOnStatusCode:false,headers:referer?{Referer:referer}:{}});
     let image=null;
     if(res.status()===200){
      const bytes=await res.body(),urlFinal=new URL(res.url());
      const valid=bytes.subarray(0,3).toString('hex')==='ffd8ff'&&
        (res.headers()['content-type']||'').startsWith('image/')&&bytes.length>=200&&
        urlFinal.protocol==='https:'&&urlFinal.hostname===new URL(url).hostname;
      if(valid)image={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
     }
     tests.push({referer:referer||'none',status:res.status(),contentType:res.headers()['content-type']||'',image});
    }catch(e){tests.push({referer:referer||'none',error:String(e?.message||e).slice(0,190)})}
   }
   assets.push({url,tests});
  }
  let date=null;
  if(assets.length&&assets.every(a=>a.tests.some(x=>x.image))){
   const query=await context.newPage();
   try{date=await searchDate(query,{id:Number(id),sourceUrl:r.source_url,title:source.title,opening:source.opening});}
   finally{await query.close()}
  }
  report.records.push({id,sourceUrl:r.source_url,title:source.title,assets,date});
  console.log('PSE_186_202_IMAGE_PROBE='+JSON.stringify({id,images:assets.map(a=>({url:a.url,results:a.tests})),date}));
 }
 report.status='PASS_READ_ONLY';
}catch(e){report.status='FAIL';report.error=String(e?.message||e);console.error('PSE_186_202_IMAGE_PROBE_ERROR='+report.error);throw e}
finally{await writeFile(root+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
