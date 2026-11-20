/**
 * Original Joomla 2014 annual report's linked attachment is 404. Restore a
 * source-labeled HNX-disclosed PSE 2014 PDF preserved at CafeF (NOT asserted
 * byte-identical to the unavailable Joomla file), with Joomla-created date.
 * Requires independently verified original source, mirror, and WordPress.
 */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const statePath='docs/pse-legacy-migration-state.json';
const state=JSON.parse(await readFile(statePath,'utf8'));
const dates=JSON.parse(await readFile('artifacts/pse-annual-dates-proof/report.json','utf8'));
const baseline=JSON.parse(await readFile('artifacts/pse-annual-parity-proof/report.json','utf8'));
const id='1092',source=state.articles[id],date=dates.records.find(x=>x.id===id);
const title='Báo cáo thường niên 2014',slug='bao-cao-thuong-nien-2014';
const original='https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-thuong-nien/1092-bao-cao-thuong-nien-2014.html';
const mirror='https://cafefnew.mediacdn.vn/download/180315/PSE_2015.3.18_9a1940e_18-_BCTN_2014.pdf';
const filename='PSE_2015.3.18_9a1940e_18-_BCTN_2014.pdf';
if(state.schema!=='pse-legacy-article-migration-v1'||state.tracker_issue!==3||!state.backup_verified||
 source?.source_url!==original||source.group_hint!=='shareholder'||
 baseline.schema!=='pse-annual-parity-v1'||baseline.cmsCategory?.id!==1758||
 baseline.cms.find(x=>x.id===id)?.source?.title!==title+' - PSE.VN'||
 date?.dateEvidence?.source!=='joomla_com_search_created'||date.dateEvidence.day!=='2015-03-16'||
 date.source!==original||date.status!=='SEARCH_CREATED_DATE_VERIFIED')
 throw Error('2014 Joomla date, official mirror or WordPress identity unverified');
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com';
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:900}});
const p=await ctx.newPage();
const report={schema:'pse-annual-2014-hnx-recovery-v1',sourceId:id,original,
 sourceCreatedDay:'2015-03-16',legacyAssetStatus:null,mirror,mirrorProvenance:'HNX via CafeF 2015-03-18',
 mirrorBytes:null,mirrorSha256:null,wordpressMedia:null,wordpressPost:null,status:'UNVERIFIED',errors:[]};
const hash=b=>createHash('sha256').update(b).digest('hex');
let nonce='';
const rest=async(path,method='GET',body)=>{
 const r=await ctx.request.fetch(wp+path,{method,timeout:70000,failOnStatusCode:false,
  headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{data:JSON.stringify(body)}:{})});
 return{http:r.status(),data:await r.json().catch(()=>null)};
};
function mediaPath(url){
 const u=new URL(url);
 if(u.origin!==wp||!/^\/wp-content\/uploads\/\d{4}\/\d{2}\/[^/]+\.pdf$/i.test(u.pathname))
  throw Error('PDF not hosted at original tenant WordPress');
 return u.pathname;
}
async function save(){await writeFile(statePath,JSON.stringify(state,null,2)+'\n')}
try{
 const originalPage=await ctx.newPage();
 try{
  const html=await originalPage.goto(original,{waitUntil:'domcontentloaded',timeout:60000});
  if(html?.status()!==200)throw Error('Original Joomla 2014 report not reachable');
  const src=await originalPage.evaluate(()=>{
   const root=document.querySelector('[itemprop="articleBody"]');
   if(!root)throw Error('Missing Joomla original body');
   return {title:(document.title||'').replace(/\s+-\s+PSE\.VN\s*$/i,'').trim(),
    links:[...root.querySelectorAll('a[href]')].map(a=>a.href)};
  });
  if(src.title!==title||!src.links.some(u=>new URL(u).pathname==='/images/web/news/qhcd/ThongTinCongBo/BCTN2014'))
   throw Error('Original 2014 broken file link identity changed');
  const brokenUrl=src.links.find(u=>new URL(u).pathname==='/images/web/news/qhcd/ThongTinCongBo/BCTN2014');
  const old=await ctx.request.head(brokenUrl,{timeout:40000,failOnStatusCode:false});
  if(old.status()!==404)throw Error('Original 2014 asset no longer demonstrably 404, HTTP '+old.status());
  report.legacyAssetStatus='ORIGINAL_404';
 }finally{await originalPage.close()}
 let file;
 const download=await ctx.request.get(mirror,{timeout:100000,failOnStatusCode:false});
 const final=new URL(download.url());
 if(download.status()!==200||final.hostname!=='cafefnew.mediacdn.vn'||
  !String(download.headers()['content-type']||'').toLowerCase().includes('pdf'))
  throw Error('Official 2014 alternative PDF unavailable '+download.status());
 file=await download.body();
 if(file.length<100_000||file.length>32_000_000||file.subarray(0,5).toString('latin1')!=='%PDF-')
  throw Error('Alternative scanned 2014 PDF invalid/oversized');
 const sha=hash(file);report.mirrorBytes=file.length;report.mirrorSha256=sha;
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
 if(!await p.locator('#adminmenu').count())throw Error('WordPress admin not authenticated');
 nonce=await p.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('WordPress REST nonce invalid');
 const cat=await rest('/wp-json/wp/v2/categories/1758?_fields=id,slug,count,parent');
 if(cat.http!==200||cat.data?.slug!=='bao-cao-thuong-nien'||cat.data.parent!==1744||
  cat.data.count<15||cat.data.count>18)throw Error('2014 WordPress category identity changed');
 const list=await rest('/wp-json/wp/v2/media?context=edit&search='+encodeURIComponent(filename.replace(/\.pdf$/i,''))+
  '&per_page=100&_fields=id,source_url,slug,mime_type');
 if(list.http!==200||!Array.isArray(list.data))throw Error('Media lookup unavailable');
 const matches=list.data.filter(m=>{try{return decodeURIComponent(new URL(m.source_url).pathname.split('/').at(-1)||'').toLowerCase()===filename.toLowerCase()}catch{return false}});
 if(matches.length>1)throw Error('2014 mirror local filename ambiguous');
 let media=matches[0]||null;
 if(!media){
  const r=await ctx.request.post(wp+'/wp-json/wp/v2/media',{data:file,timeout:150000,failOnStatusCode:false,
    headers:{'X-WP-Nonce':nonce,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+filename+'"'}});
  if(r.status()!==201)throw Error('PSE WordPress mirror upload HTTP '+r.status()+' '+(await r.text()).slice(0,180));
  media=await r.json();
 }
 if(!Number.isSafeInteger(media.id)||media.mime_type!=='application/pdf'||
  decodeURIComponent(new URL(media.source_url).pathname.split('/').at(-1)||'').toLowerCase()!==filename.toLowerCase())
  throw Error('Mirror stored under unexpected WordPress filename/mime');
 const local=mediaPath(media.source_url);
 const check=await ctx.request.get(media.source_url,{timeout:90000,failOnStatusCode:false});
 if(check.status()!==200||hash(await check.body())!==sha)
  throw Error('HNX mirror / WordPress local PDF binary SHA mismatch');
 report.wordpressMedia={id:media.id,source_url:media.source_url,sha256:sha,exactByteCopy:true,
  originallyLinkedOnJoomla:false};
 const html='<section data-pse-annual-original-id="1092"><p>Báo cáo thường niên 2014</p>'+
  '<p><a href="/api/files'+local+'" target="_blank" rel="noopener noreferrer">'+
  'Xem Báo cáo thường niên 2014 (PDF, bản lưu công bố HNX)</a></p>'+
  '<p>Liên kết tài liệu trên website gốc không còn hoạt động. Bản PDF thay thế là tài liệu công bố '+
  'trên HNX ngày 18/03/2015, được CafeF lưu trữ. Không thể xác minh tệp này trùng byte với đường dẫn gốc đã mất.</p></section>';
 const dateStr='2015-03-16T00:00:00';
 const postQuery='/wp-json/wp/v2/posts?context=edit&slug='+slug+'&per_page=100&_fields=id,slug,status,content,date,categories,title';
 const pub=await rest(postQuery),draft=await rest(postQuery+'&status=draft');
 if(pub.http!==200||draft.http!==200||!Array.isArray(pub.data)||!Array.isArray(draft.data))
  throw Error('2014 WordPress slug lookup failed '+pub.http+'/'+draft.http);
 const found=[...new Map([...pub.data,...draft.data].map(x=>[x.id,x])).values()];
 if(found.length>1)throw Error('2014 WordPress slug ambiguous');
 let post=found[0]||null;
 if(post){
  if(post.id!==state.articles[id].wp_id||!String(post.content?.raw||'').includes('data-pse-annual-original-id="1092"'))
   throw Error('Existing 2014 WordPress slug unrelated to official mirror');
 }else{
  const draft=await rest('/wp-json/wp/v2/posts','POST',{
   title,slug,status:'draft',date:dateStr,categories:[1758,1744],content:html,
   excerpt:'Báo cáo thường niên 2014. Tệp PDF thay thế có nguồn công bố HNX, lưu tại CafeF.',
   pse_seo_title:title+' - PSE.VN'
  });
  if(draft.http!==201||!Number.isSafeInteger(draft.data?.id))
   throw Error('WordPress 2014 draft failed HTTP '+draft.http+' '+JSON.stringify(draft.data).slice(0,160));
  post=draft.data;state.articles[id].wp_id=post.id;state.articles[id].status='draft_verify';
  await save();
 }
 const fields='?context=edit&_fields=id,slug,status,date,categories,content,pse_seo_title,pse_seo_description,acf';
 const before=await rest('/wp-json/wp/v2/posts/'+post.id+fields);
 if(before.http!==200||before.data?.slug!==slug||before.data.date!==dateStr||
  !before.data.categories?.includes(1758)||before.data.content?.raw!==html||
  before.data.pse_seo_title!==title+' - PSE.VN')throw Error('WP 2014 original article identity or text mismatch');
 if(before.data.acf?.action!=='PostDetails'||before.data.acf?.key!=='ssr-post'){
  const acf=await rest('/wp-json/wp/v2/posts/'+post.id,'POST',{acf:{action:'PostDetails',key:'ssr-post',product_lang:'vi'}});
  if(acf.http!==200)throw Error('2014 standard SSR ACF update failed');
 }
 if(before.data.status!=='publish'){
  const pub=await rest('/wp-json/wp/v2/posts/'+post.id,'POST',{status:'publish',date:dateStr});
  if(pub.http!==200||pub.data?.status!=='publish')throw Error('2014 WordPress publish failed');
 }
 const after=await rest('/wp-json/wp/v2/posts/'+post.id+fields);
 if(after.http!==200||after.data?.status!=='publish'||after.data.date!==dateStr||
  after.data.content?.raw!==html||after.data.pse_seo_title!==title+' - PSE.VN'||
  after.data.acf?.action!=='PostDetails'||after.data.acf?.key!=='ssr-post')
  throw Error('2014 WordPress readback not verified');
 const a=state.articles[id];
 a.wp_id=post.id;a.status='imported';a.annual_category_verified=true;
 a.seo_cleaned=true;a.attribution_cleaned=true;a.verified_date='2015-03-16';
 a.source_created_date='2015-03-16';a.date_source='joomla_com_search_created';
 a.verified_alternative_attachment={url:mirror,media_id:media.id,sha256:sha,
  provenance:'HNX via CafeF',note:'Original Joomla link HTTP404; cannot prove binary equality'};
 delete a.reason;
 report.wordpressPost={id:post.id,slug,sourceDate:'2015-03-16',status:'publish',acf:'PostDetails/ssr-post'};
 const pub=await ctx.newPage();
 try{const page=await pub.goto(front+'/'+slug,{waitUntil:'domcontentloaded',timeout:65000});
  const links=await pub.locator('#article-content a[href$=".pdf"]').count();
  if(page?.status()!==200||links!==1)throw Error('2014 frontpage SSR PDF mismatch '+page?.status()+' '+links);
 }finally{await pub.close()}
 report.status='PASS';
}catch(e){report.status='PARTIAL';report.errors.push(String(e).slice(0,350));
 console.error('PSE_ANNUAL_2014_ERROR='+String(e))}
finally{
 state.runs=Number(state.runs||0)+1;
 await save();
 await mkdir('artifacts/pse-annual-2014',{recursive:true});
 await writeFile('artifacts/pse-annual-2014/report.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
console.log('PSE_ANNUAL_2014_RECOVERY='+JSON.stringify({
 status:report.status,legacy:report.legacyAssetStatus,bytes:report.mirrorBytes,
 media:report.wordpressMedia?.id,post:report.wordpressPost?.id,errors:report.errors}));
