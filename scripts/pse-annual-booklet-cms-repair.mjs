/** Rebuild four source-provenanced PSE annual booklets from WordPress-owned JPG pages.
 * Audit on ordinary push; exact authorized trigger commit permits idempotent CMS repair.
 * Never import Joomla script/foreign links, create posts, change status/date/category, or build Astro.
 */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||state.backup_verified!==true)throw Error('Migration checkpoint/rollback backup missing');
const specs=[
 {id:'1042',year:2012,post:82405,count:26,folder:'bctn-2012',filename:/^Baocaothuongnien2012_(\d{2})\.jpg$/},
 {id:'1043',year:2013,post:82396,count:26,folder:'bctn-2013',filename:/^Baocaothuongnien2013_(\d{2})\.jpg$/},
 {id:'1188',year:2015,post:82414,count:33,folder:'bctn-2015',filename:/^pse_bctn_2015_(\d{2})\.jpg$/},
 {id:'1259',year:2016,post:82410,count:32,folder:'bctn-2016',filename:/^PSE-BCTN-2016_(\d{3})\.jpg$/}
];
const event=process.env.GITHUB_EVENT_PATH?JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8')):{};
const apply=event.head_commit?.message==='cms(pse): repair source-verified annual booklet pages and remove injected spam';
const cfg=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
function origin(key){const vals=cfg.filter(x=>x.startsWith(key+'='));if(vals.length!==1)throw Error('Missing '+key);
 const url=new URL(vals[0].slice(key.length+1).replace(/^['"]|['"]$/g,''));if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('Bad '+key);return url.origin}
const wp=origin('WC_URL'),front=origin('WC_URL_CLIENT');
const trustedMedia=p=>/^\/wp-content\/uploads\/\d{4}\/\d{2}\/pse-legacy-[0-9a-f]{16}\.(?:jpg|png|pdf)$/i.test(p);
const hash=s=>createHash('sha256').update(s).digest('hex');
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:900}});
const page=await ctx.newPage();
const records=[];
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('WordPress admin credentials missing');
 const login=await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(!login||login.status()>=500)throw Error('WP admin unavailable');
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const body=await page.locator('body').innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],ans=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Login math field missing');await f.fill(String(ans))}
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WP authentication rejected');
 await page.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});if(!r.ok)throw Error('REST nonce unavailable');return(await r.text()).trim()});
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Invalid WP REST nonce');
 const api=(path,method='GET',body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:'same-origin',headers:{Accept:'application/json','X-WP-Nonce':nonce,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json().catch(()=>null)}
 },{path,method,body,nonce});
 const root=await api('/wp-json/wp/v2/categories/1758?_fields=id,slug,parent');
 if(root.status!==200||root.data?.slug!=='bao-cao-thuong-nien')throw Error('Annual taxonomy identity mismatch');
 for(const sp of specs){
  const src=state.articles[sp.id];
  if(src?.wp_id!==sp.post||src?.status!=='imported'||src.annual_category_verified!==true||
   src.group_hint!=='shareholder'||!src.source_url?.includes('/quan-he-nha-dau-tu/bao-cao-thuong-nien/'+sp.id+'-'))
   throw Error('Annual checkpoint identity changed '+sp.id);
  const entries=Object.entries(state.media||{}).filter(([original])=>original.startsWith('https://www.pse.vn/images/gallery/'+sp.folder+'/'));
  const pages=[];
  for(const [original,asset] of entries){
   const name=original.slice(original.lastIndexOf('/')+1),m=name.match(sp.filename);if(!m)continue;
   const sequence=Number(m[1]);if(sequence<1||sequence>sp.count||!Number.isSafeInteger(asset.id)||!trustedMedia(asset.url)||!asset.url.endsWith('.jpg')||
     !/^[a-f0-9]{64}$/.test(asset.sha256||''))throw Error('Unverified WordPress image manifest '+sp.id);
   pages.push({sequence,url:'/api/files'+asset.url,id:asset.id,source:original});
  }
  pages.sort((a,b)=>a.sequence-b.sequence);
  if(pages.length!==sp.count||pages.some((a,i)=>a.sequence!==i+1))
   throw Error('Missing/duplicate annual source JPG pages '+sp.id+' count='+pages.length);
  const got=await api('/wp-json/wp/v2/posts/'+sp.post+'?context=edit&_fields=id,slug,title,status,categories,content,date,excerpt,pse_seo_description');
  const post=got.data;
  if(got.status!==200||post?.id!==sp.post||post.status!=='publish'||post.slug!=='bao-cao-thuong-nien-'+sp.year||
    !post.categories?.includes(1758)||!String(post.content?.raw||'').trim())throw Error('WP report identity/content mismatch '+sp.id);
  const oldHtml=String(post.content.raw),oldSha=hash(oldHtml),stamp='pse-verified-booklet-'+sp.id;
  const already=oldHtml.includes('data-pse-booklet="'+stamp+'"');
  const suspicious=/getkredit\.ru|nunax\.ru|\.ru\/?|free-minigames|View the embedded image gallery|sigProId|vtembooklet|carautore mont/i.test(oldHtml);
  const source=await ctx.newPage();
  let sourceLinks=[];
  try{
   const nav=await source.goto(src.source_url,{waitUntil:'domcontentloaded',timeout:60000});
   if(nav?.status()!==200)throw Error('Joomla source HTTP '+nav?.status()+' id '+sp.id);
   sourceLinks=await source.evaluate(()=>{
    const root=document.querySelector('[itemprop="articleBody"]');if(!root)throw Error('Missing original report body');
    return [...new Set([...root.querySelectorAll('a[href]')]
      .map(a=>{try{return new URL(a.getAttribute('href'),location.href).href}catch{return ''}})
      .filter(x=>/\.pdf(?:[?#]|$)/i.test(x)))];
   });
  }finally{await source.close()}
  const docs=[];
  for(const url of sourceLinks){
   const u=new URL(url);
   if(u.origin!=='https://www.pse.vn')throw Error('External PDF in original annual report '+sp.id);
   const media=state.media[url];
   if(!media||!trustedMedia(media.url)||!media.url.endsWith('.pdf'))throw Error('Annual PDF not locally verified '+sp.id);
   docs.push('/api/files'+media.url);
  }
  // No external text/anchors from Joomla are copied. Official scanned JPGs are the report content.
  const desc='Báo cáo thường niên '+sp.year+' — xem đầy đủ '+sp.count+' trang tài liệu dưới dạng hình ảnh.';
  const gallery=pages.map((p,i)=>'<figure style="display:inline-block;width:calc(25% - 16px);max-width:225px;vertical-align:top;margin:8px">'+
    '<a href="'+p.url+'" target="_blank" rel="noopener noreferrer" aria-label="Xem trang '+(i+1)+' báo cáo thường niên '+sp.year+'">'+
    '<img src="'+p.url+'" width="225" loading="lazy" decoding="async" alt="Trang '+(i+1)+' báo cáo thường niên '+sp.year+'" style="width:100%;height:auto;border:1px solid #d7dfd9"></a>'+
    '<figcaption>Trang '+(i+1)+'</figcaption></figure>').join('\n');
  const documents=docs.length?'<p>Tài liệu đính kèm: '+docs.map((p,i)=>'<a href="'+p+'" target="_blank" rel="noopener noreferrer">PDF '+(i+1)+'</a>').join(' · ')+'</p>':'';
  const html='<div class="pse-annual-booklet" data-pse-booklet="'+stamp+'"><p>'+desc+'</p>\n'+
   '<div class="pse-annual-booklet-gallery">'+gallery+'</div>\n'+documents+'</div>';
  const item={source_id:sp.id,wp_id:sp.post,year:sp.year,old_sha256:oldSha,old_chars:oldHtml.length,old_img_count:(oldHtml.match(/<img\b/gi)||[]).length,
   found_spam:suspicious,jpg_pages:pages.length,pdf_files:docs.length,already_clean:already,mode:apply?'apply':'audit'};
  // Probe first and last original pages over the existing SAME-ORIGIN public proxy. Never publish broken galleries.
  for(const img of [pages[0],pages.at(-1)]){
   const response=await ctx.request.get(front+img.url,{timeout:40000,failOnStatusCode:false});
   const bytes=await response.body().catch(()=>Buffer.alloc(0));
   if(response.status()!==200||bytes.subarray(0,3).toString('hex')!=='ffd8ff')
    throw Error('Public report JPG proxy invalid '+sp.id+' page '+img.sequence+' http '+response.status());
  }
  if(already){
   if(suspicious||(oldHtml.match(/<img\b/gi)||[]).length!==sp.count)
    throw Error('Previously repaired booklet does not pass invariants '+sp.id);
   item.result='ALREADY_REPAIRED';records.push(item);console.log('PSE_ANNUAL_BOOKLET='+JSON.stringify(item));continue
  }
  if(!suspicious)throw Error('Unexpected old content; refuse overwrite '+sp.id);
  if(apply){
   // All media verified, previous WordPress post ID/date/taxonomy preserved; WP creates a revision.
   const result=await api('/wp-json/wp/v2/posts/'+sp.post,'POST',{content:html,excerpt:desc,pse_seo_description:desc});
   if(result.status!==200||result.data?.id!==sp.post)throw Error('Annual repair WordPress save HTTP '+result.status+' '+sp.id);
   const check=await api('/wp-json/wp/v2/posts/'+sp.post+'?context=edit&_fields=id,slug,status,date,categories,content,excerpt,pse_seo_description');
   const p=check.data,r=String(p?.content?.raw||'');
   if(check.status!==200||p?.id!==sp.post||p.slug!==post.slug||p.status!==post.status||p.date!==post.date||
     JSON.stringify(p.categories)!==JSON.stringify(post.categories)||
     !r.includes('data-pse-booklet="'+stamp+'"')||(r.match(/<img\b/gi)||[]).length!==sp.count||
     !pages.every(img=>r.includes(img.url))||docs.some(doc=>!r.includes(doc))||
     /getkredit\.ru|sigProId|embedded image gallery|vtembooklet|\.ru\//i.test(r)||
     String(p.excerpt?.raw||'').trim()!==desc)
     throw Error('Annual WordPress readback mismatch after repair '+sp.id);
   item.result='REPAIRED';item.after_sha256=hash(r);
  }else item.result='READY_TO_REPAIR';
  records.push(item);console.log('PSE_ANNUAL_BOOKLET='+JSON.stringify(item));
 }
 await mkdir('artifacts/pse-annual-booklet-repair',{recursive:true});
 await writeFile('artifacts/pse-annual-booklet-repair/audit.json',JSON.stringify({mode:apply?'apply':'audit',reports:records},null,2)+'\n');
 console.log('PSE_ANNUAL_BOOKLET_BATCH='+JSON.stringify({mode:apply?'apply':'audit',reports:records.length,modified:records.filter(x=>x.result==='REPAIRED').length,already:records.filter(x=>x.result==='ALREADY_REPAIRED').length,images:records.reduce((a,b)=>a+b.jpg_pages,0),no_astro_build:true}));
}finally{await browser.close()}
