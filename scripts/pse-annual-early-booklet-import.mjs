/**
 * Verified PSE 2008/2010 annual booklet recovery. Media is copied only from
 * exact Joomla original URL, verified byte-for-byte in WordPress, and the
 * WordPress post is published only when ALL 94/130 images are present.
 * Long runs checkpoint each successful file; reruns reuse and verify Media.
 */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const statePath='docs/pse-legacy-migration-state.json';
const state=JSON.parse(await readFile(statePath,'utf8'));
const source=JSON.parse(await readFile('artifacts/pse-annual-media-proof/report.json','utf8'));
const dates=JSON.parse(await readFile('artifacts/pse-annual-dates-proof/report.json','utf8'));
const baseline=JSON.parse(await readFile('artifacts/pse-annual-parity-proof/report.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||state.tracker_issue!==3||
 !state.backup_verified||source.schema!=='pse-annual-early-booklets-original-v1'||
 baseline.schema!=='pse-annual-parity-v1'||baseline.sourceCount!==18||
 baseline.cmsList.length!==15||!Array.isArray(dates.records))
 throw Error('No independent original source/rollback evidence');
const specs=[{id:'998',year:2008,count:94,folder:'bctn-2008'},
 {id:'1000',year:2010,count:130,folder:'bctn-2010'}];
const proofs=new Map(dates.records.map(x=>[x.id,x]));
for(const sp of specs){
 const report=source.reports.find(x=>x.id===sp.id);
 const d=proofs.get(sp.id),row=state.articles[sp.id];
 const expected='https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-thuong-nien/'+sp.id+'-bao-cao-thuong-nien-'+sp.year+'.html';
 if(!report||report.source!==expected||report.expected!==sp.count||
  report.images.length!==sp.count||new Set(report.images).size!==sp.count||
  !d||d.source!==expected||d.dateEvidence?.source!=='joomla_com_search_created'||
  d.dateEvidence.day!=='2013-12-11'||d.status!=='SEARCH_CREATED_DATE_VERIFIED'||
  !row||row.source_url!==expected||row.group_hint!=='shareholder'||
  (row.wp_id&&!Number.isSafeInteger(row.wp_id))||
  report.images.some(u=>!u.startsWith('https://www.pse.vn/images/flippingbook/'+sp.folder+'/')||
   !/\.jpg$/i.test(u)))
  throw Error('Verified source audit mismatch '+sp.id);
 sp.images=report.images;
}
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com';
const report={schema:'pse-annual-2008-2010-recovery-v1',sourceCount:2,sourceImages:224,
 mode:'SOURCE_BINARY_AND_WP_READBACK',start:new Date().toISOString(),createdMedia:[],reusedMedia:[],
 posts:[],errors:[],incomplete:[],status:'UNVERIFIED'};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:850}});
const p=await ctx.newPage();
let nonce='',persistPromise=Promise.resolve();
const hash=b=>createHash('sha256').update(b).digest('hex');
const start=Date.now(),budget=21*60*1000;
const rest=async (path,method='GET',body)=>{
 const r=await ctx.request.fetch(wp+path,{method,timeout:70000,failOnStatusCode:false,
 headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
 ...(body?{data:JSON.stringify(body)}:{})});
 return {http:r.status(),data:await r.json().catch(()=>null),total:Number(r.headers()['x-wp-total']||0)};
};
async function persist(){
 persistPromise=persistPromise.then(()=>writeFile(statePath,JSON.stringify(state,null,2)+'\n'));
 await persistPromise;
}
function localPath(url){
 const u=new URL(url);
 if(u.origin!==wp||!/^\/wp-content\/uploads\/\d{4}\/\d{2}\/[^/]+\.jpg$/i.test(u.pathname))
  throw Error('Media outside verified PSE WordPress local uploads');
 return u.pathname;
}
async function getOriginal(url){
 let error='';
 for(let t=0;t<3;t++){
  try{
   const r=await ctx.request.get(url,{timeout:48000,failOnStatusCode:false});
   const u=new URL(r.url()),buf=await r.body();
   if(r.status()!==200||!['pse.vn','www.pse.vn'].includes(u.hostname)||
      !String(r.headers()['content-type']||'').toLowerCase().includes('image/jpeg')||
      buf.length<1000||buf.length>30_000_000||
      buf[0]!==0xff||buf[1]!==0xd8)
    throw Error('Joomla original JPEG validation '+r.status()+' '+buf.length);
   return buf;
  }catch(e){error=String(e).slice(0,200);await new Promise(resolve=>setTimeout(resolve,450*(t+1)));}
 }
 throw Error('Original file unavailable after 3 tries '+url+' '+error);
}
async function mediaFor(sourceUrl,sp){
 const origName=decodeURIComponent(new URL(sourceUrl).pathname.split('/').at(-1)||'');
 const name=sp.id==='998'?origName:'pse-annual-2010-'+origName;
 if(!/^[a-zA-Z0-9_.-]+\.jpg$/.test(name)||name.length>180)
  throw Error('Unsafe verified original filename '+name);
 const original=await getOriginal(sourceUrl),digest=hash(original);
 const saved=state.media?.[sourceUrl];
 if(saved?.id){
  if(saved.sha256!==digest||!Number.isSafeInteger(saved.id)||!saved.url)throw Error('Checkpoint media conflicts with bytes');
  const q=await ctx.request.get(saved.url,{timeout:48000,failOnStatusCode:false});
  if(q.status()!==200||hash(await q.body())!==digest)throw Error('Mapped WordPress media changed '+sourceUrl);
  report.reusedMedia.push(saved.id);
  return saved;
 }
 const lookup=await rest('/wp-json/wp/v2/media?context=edit&search='+encodeURIComponent(name.replace(/\.jpg$/i,''))+
  '&per_page=100&_fields=id,source_url,slug,mime_type');
 if(lookup.http!==200||!Array.isArray(lookup.data))throw Error('WP Media lookup '+lookup.http);
 const matches=lookup.data.filter(x=>{
  try{return decodeURIComponent(new URL(x.source_url).pathname.split('/').at(-1)||'').toLowerCase()===name.toLowerCase()}
  catch{return false}
 });
 if(matches.length>1)throw Error('Duplicate exact WordPress media filename '+name);
 let m=matches[0]||null;
 if(m&&!Number.isSafeInteger(m.id))throw Error('Invalid matching WordPress Media');
 if(!m){
  const uploaded=await ctx.request.post(wp+'/wp-json/wp/v2/media',{
   headers:{'X-WP-Nonce':nonce,'Content-Disposition':'attachment; filename="'+name+'"','Content-Type':'image/jpeg'},
   data:original,timeout:120000,failOnStatusCode:false});
  if(uploaded.status()!==201)throw Error('WordPress upload '+uploaded.status()+' '+name+' '+(await uploaded.text()).slice(0,200));
  m=await uploaded.json();
 }
 if(!Number.isSafeInteger(m.id)||!m.source_url||
    m.mime_type!=='image/jpeg'||!localPath(m.source_url))
  throw Error('Unexpected Media record '+name);
 const remoteName=decodeURIComponent(new URL(m.source_url).pathname.split('/').at(-1)||'');
 if(remoteName.toLowerCase()!==name.toLowerCase())throw Error('WP renamed media file '+name+' to '+remoteName);
 const check=await ctx.request.get(m.source_url,{timeout:50000,failOnStatusCode:false});
 if(check.status()!==200||hash(await check.body())!==digest)
  throw Error('WordPress Media SHA mismatch '+name);
 const mapped={id:m.id,url:m.source_url,sha256:digest,source_filename:origName,
  source_report_year:sp.year};
 state.media[sourceUrl]=mapped;
 if(matches.length)report.reusedMedia.push(m.id);
 else report.createdMedia.push(m.id);
 await persist();
 console.log('PSE_ANNUAL_MEDIA='+JSON.stringify({sourceId:sp.id,wpMediaId:m.id,filename:name,sha256:digest.slice(0,16)}));
 return mapped;
}
async function createOrVerifyPost(sp){
 const id=sp.id,slug='bao-cao-thuong-nien-'+sp.year,title='Báo cáo thường niên '+sp.year;
 const assets=sp.images.map((url,i)=>{
  const m=state.media[url];
  if(!m||!Number.isSafeInteger(m.id)||!/^[a-f0-9]{64}$/.test(m.sha256)||!m.url)
   throw Error('Missing original source page '+id+' index '+i);
  return {index:i+1,url:'/api/files'+localPath(m.url),id:m.id};
 });
 if(assets.length!==sp.count)throw Error('Incomplete source pages '+id);
 const imageHtml=assets.map(a=>'<figure class="pse-annual-report-page"><img src="'+a.url+
  '" alt="Báo cáo thường niên '+sp.year+' - Trang '+a.index+' trên '+sp.count+
  '" loading="'+(a.index===1?'eager':'lazy')+'" decoding="async"></figure>').join('\n');
 const body='<section data-pse-booklet="pse-verified-booklet-'+id+
  '" data-pse-source-id="'+id+'" aria-label="Báo cáo thường niên '+sp.year+
  ' gồm '+sp.count+' trang ảnh">\n'+imageHtml+'\n</section>';
 if(/https?:\/\/|vtembooklet|sigProId|\.ru\b/i.test(body))
  throw Error('External link/script leaked into sanitized article');
 const sourceTitle=baseline.cms.find(x=>x.id===id)?.source?.title;
 if(sourceTitle!==title+' - PSE.VN')throw Error('Original SEO <title> changed '+id);
 const date='2013-12-11T00:00:00';
 const fields='?context=edit&_fields=id,status,slug,title,content,date,categories,pse_seo_title,pse_seo_description,acf';
 const postQuery='/wp-json/wp/v2/posts?context=edit&slug='+slug+'&per_page=100&_fields=id,status,slug,title,content,date,categories,pse_seo_title,acf';
 const published=await rest(postQuery),draft=await rest(postQuery+'&status=draft');
 if(published.http!==200||draft.http!==200||!Array.isArray(published.data)||!Array.isArray(draft.data))
  throw Error('WordPress slug lookup unavailable '+id+' '+published.http+'/'+draft.http);
 const found=[...new Map([...published.data,...draft.data].map(p=>[p.id,p])).values()];
 if(found.length>1)throw Error('WordPress slug ambiguous '+id);
 let post=found[0]||null;
 if(post){
  if(post.id!==state.articles[id]?.wp_id||
    !String(post.content?.raw||'').includes('data-pse-source-id="'+id+'"'))
   throw Error('Unexpected existing WordPress slug '+id);
 }else{
  const draft=await rest('/wp-json/wp/v2/posts','POST',{
   title,slug,status:'draft',date,categories:[1758,1744],content:body,
   excerpt:'Báo cáo thường niên '+sp.year+' — '+sp.count+' trang tài liệu dạng ảnh.',
   pse_seo_title:sourceTitle
  });
  if(draft.http!==201||!Number.isSafeInteger(draft.data?.id))
   throw Error('WordPress draft create '+id+' HTTP '+draft.http+' '+JSON.stringify(draft.data).slice(0,180));
  post=draft.data;
  state.articles[id].wp_id=post.id;
  state.articles[id].status='draft_verify';
  await persist();
 }
 const check=await rest('/wp-json/wp/v2/posts/'+post.id+fields);
 if(check.http!==200||check.data?.slug!==slug||check.data.date!==date||
    !check.data.categories?.includes(1758)||!check.data.categories?.includes(1744)||
    String(check.data.content?.raw||'')!==body||
    check.data.pse_seo_title!==sourceTitle||
    (String(check.data.content.raw).match(/<img\b/g)||[]).length!==sp.count)
  throw Error('Published draft identity/content does not match source '+id);
 if(check.data.acf?.action!=='PostDetails'||check.data.acf?.key!=='ssr-post'){
  const set=await rest('/wp-json/wp/v2/posts/'+post.id,'POST',{acf:{action:'PostDetails',key:'ssr-post',product_lang:'vi'}});
  if(set.http!==200||set.data?.id!==post.id)throw Error('Cannot assign standard post ACF '+id);
 }
 const acf=await rest('/wp-json/wp/v2/posts/'+post.id+fields);
 if(acf.data?.acf?.action!=='PostDetails'||acf.data?.acf?.key!=='ssr-post')
  throw Error('Standard SSR ACF not saved '+id);
 if(acf.data.status!=='publish'){
  const pub=await rest('/wp-json/wp/v2/posts/'+post.id,'POST',{status:'publish',date});
  if(pub.http!==200||pub.data?.status!=='publish')throw Error('Publish annual post '+id);
 }
 const verified=await rest('/wp-json/wp/v2/posts/'+post.id+fields);
 if(verified.http!==200||verified.data?.status!=='publish'||verified.data?.slug!==slug||
  verified.data.date!==date||verified.data.content?.raw!==body||
  verified.data.pse_seo_title!==sourceTitle||
  verified.data.acf?.action!=='PostDetails'||verified.data.acf?.key!=='ssr-post')
  throw Error('Final published WordPress media readback mismatch '+id);
 const item=state.articles[id];
 item.wp_id=post.id;item.status='imported';
 item.annual_category_verified=true;item.seo_cleaned=true;item.attribution_cleaned=true;
 item.source_created_date='2013-12-11';item.date_source='joomla_com_search_created';
 item.verified_date='2013-12-11';item.source_assets_verified=sp.count;
 delete item.reason;
 await persist();
 const publicPage=await ctx.newPage();
 try{
  const res=await publicPage.goto(front+'/'+slug,{waitUntil:'domcontentloaded',timeout:60000});
  const count=await publicPage.locator('#article-content img').count();
  if(res?.status()!==200||count!==sp.count)
   throw Error('Astro SSR missing booklet '+id+' http '+res?.status()+' images '+count);
 }finally{await publicPage.close()}
 report.posts.push({id,wpId:post.id,year:sp.year,images:sp.count,published:true,seoTitle:sourceTitle,ssr:200});
 console.log('PSE_ANNUAL_POST='+JSON.stringify(report.posts.at(-1)));
}
try{
 await p.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await p.locator('#user_login').count()){
  await p.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await p.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const txt=await p.locator('#loginform').innerText(),m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],b=+m[3],v=m[2]==='+'?a+b:m[2]==='-'?a-b:a*b;
   const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Missing login math field');await f.fill(String(v))}
  await p.locator('#wp-submit').click();
 }
 await p.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(!await p.locator('#adminmenu').count())throw Error('WP login rejected');
 nonce=await p.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('REST nonce rejected');
 const cat=await rest('/wp-json/wp/v2/categories/1758?_fields=id,slug,parent,count');
 if(cat.http!==200||cat.data?.slug!=='bao-cao-thuong-nien'||cat.data.parent!==1744||
    cat.data.count<15||cat.data.count>18)throw Error('Unexpected annual category count/identity');
 for(const sp of specs){
  let next=0;
  const errors=[];
  const concurrent=2;
  async function worker(){
   while(next<sp.images.length){
    if(Date.now()-start>budget)break;
    const url=sp.images[next++];
    try{await mediaFor(url,sp)}
    catch(e){errors.push({url,error:String(e).slice(0,240)});console.error('PSE_ANNUAL_MEDIA_FAILED='+JSON.stringify({sourceId:sp.id,url,error:String(e).slice(0,160)}));}
   }
  }
  await Promise.all(Array.from({length:concurrent},worker));
  const remaining=sp.images.filter(u=>!state.media[u]);
  if(errors.length||remaining.length){
   report.incomplete.push({id:sp.id,remaining:remaining.length,errors:errors.slice(0,8)});
   console.log('PSE_ANNUAL_MEDIA_BATCH='+JSON.stringify({id:sp.id,remaining:remaining.length,errors:errors.length}));
   continue;
  }
  try{await createOrVerifyPost(sp)}
  catch(e){report.errors.push({id:sp.id,error:String(e).slice(0,280)});
   console.error('PSE_ANNUAL_POST_FAILED='+JSON.stringify({id:sp.id,error:String(e).slice(0,280)}))}
 }
 report.status=!report.errors.length&&!report.incomplete.length&&report.posts.length===2?'PASS':'PARTIAL';
}catch(e){report.errors.push({error:String(e).slice(0,300)});report.status='PARTIAL';
 console.error('PSE_ANNUAL_UPLOAD_FATAL='+String(e))}
finally{
 state.runs=Number(state.runs||0)+1;
 await persist().catch(e=>{report.errors.push({checkpointError:String(e)})});
 await mkdir('artifacts/pse-annual-media-import',{recursive:true});
 await writeFile('artifacts/pse-annual-media-import/report.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
console.log('PSE_ANNUAL_MEDIA_IMPORT='+JSON.stringify({
 status:report.status,mediaCreated:report.createdMedia.length,mediaReused:report.reusedMedia.length,
 posts:report.posts,remaining:report.incomplete,errors:report.errors}));
