/** Read-only identity resolution of three broken legacy image links. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium,request} from 'playwright';
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions')throw Error('Wrong repository');
const src='https://pse.vn',front='https://pse.webnvn.com',wp='https://admin-pse.webnvn.com',out='artifacts/pse-kali-broken-query-proof',sha=x=>createHash('sha256').update(x).digest('hex');
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8')),d=JSON.parse(await readFile('inputs/source/source-1426.json','utf8')),o=JSON.parse(await readFile('inputs/source/report.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||!o.readOnly||sha(d.full)!==o.rows.find(x=>x.id===1426)?.fullBodySha)throw Error('Pinned inputs changed');
await mkdir(out,{recursive:true});const report={readOnly:true,sourceId:1426,rows:[],otherLinks:[]};const save=()=>writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const net=await request.newContext({timeout:35000}),b=await chromium.launch({headless:true}),ctx=await b.newContext({javaScriptEnabled:false});await ctx.route('**/*',r=>r.abort());const page=await ctx.newPage();
try{
 const anchors=await page.evaluate(({html,source})=>{const root=document.createElement('div');root.innerHTML=html;return [...root.querySelectorAll('a[href]')].map(a=>({href:a.getAttribute('href'),images:[...a.querySelectorAll('img[src]')].map(i=>new URL(i.getAttribute('src'),source).pathname)}))},{html:d.html,source:o.rows.find(x=>x.id===1426).source});
 const get=async(url)=>{const r=await net.get(url,{maxRedirects:0,failOnStatusCode:false});if([403,429,503].includes(r.status()))throw Error('Access/rate guard '+r.status());return r};
 for(const id of [1425,1427,1430]){
  const q='/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html?id='+id,a=anchors.filter(x=>x.href===q),s=state.articles?.[id];
  const row={id,query:q,anchors:a,state:s?{source_url:s.source_url,status:s.status,wp_id:s.wp_id,wp_post_id:s.wp_post_id,wp_product_id:s.wp_product_id,title:s.title,keys:Object.keys(s)}:null,ready:false};report.rows.push(row);
  if(a.length!==1||a[0].images.length!==1||!s?.source_url)throw Error('Missing source identity '+id);
  const u=new URL(s.source_url);if(!['pse.vn','www.pse.vn'].includes(u.hostname)||u.search||u.hash||!u.pathname.includes('/'+id+'-'))throw Error('Manifest mismatch '+id);
  const r=await get(src+u.pathname);row.sourceHTTP=r.status();
  if(r.status()===200){
   await page.setContent('<base href="'+src+u.pathname+'">'+(await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'domcontentloaded'});
   const c=await page.evaluate(()=>{const n=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim(),root=document.querySelector('.item-page [itemprop=articleBody]');if(!root)throw Error('Article body missing');const core=root.cloneNode(true);core.querySelectorAll('.extranews_box,.extranews_separator').forEach(x=>x.remove());return {title:n(document.querySelector('.item-page h1,.item-page h2,h1')?.textContent),body:n(core.textContent),images:[...core.querySelectorAll('img[src]')].map(i=>new URL(i.getAttribute('src'),document.baseURI).pathname)}});
   row.title=c.title;row.bodySha=sha(c.body);row.sourceImages=c.images;row.anchorImageMatches=c.images.includes(a[0].images[0]); 
   const img=await get(src+a[0].images[0]);row.anchorImageHTTP=img.status();if(img.status()===200)row.anchorImageSHA=sha(await img.body());
  }
  const legacy=await get(front+u.pathname);row.nativeLegacyHTTP=legacy.status();row.location=legacy.headers().location||null;
  if(legacy.status()===301&&row.location){const t=new URL(row.location,front);if(t.origin!==front||t.search||t.hash)throw Error('Wrong redirect origin');const live=await get(t.href);row.targetHTTP=live.status();row.target=t.href;
   if(live.status()===200){await page.setContent((await live.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'domcontentloaded'});row.canonical=await page.locator('link[rel=canonical]').getAttribute('href');}
  }
  row.ready=Boolean(row.sourceHTTP===200&&row.anchorImageMatches&&row.anchorImageHTTP===200&&(id===1425||row.targetHTTP===200&&row.canonical===row.target));
  console.log('PSE_KALI_BROKEN_QUERY_PROOF='+JSON.stringify(row));await save();
 }
 for(const l of d.links.filter(x=>!new URL(x.url).search)){
  const u=new URL(l.url);if(u.origin!==src)continue;const r=await get(front+u.pathname);const s=await get(src+u.pathname);const row={href:l.href,text:l.text,sourceHTTP:s.status(),nativeHTTP:r.status(),location:r.headers().location||null};report.otherLinks.push(row);console.log('PSE_KALI_OTHER_LINK='+JSON.stringify(row));await save();
 }
}finally{await save();await b.close();await net.dispose()}
