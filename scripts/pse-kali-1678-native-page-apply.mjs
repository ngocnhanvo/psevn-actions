/** Native historical Page for Joomla #1678. Only this Page and its exact original Media may be written. */
import {chromium,request} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions'||process.env.GITHUB_REF!=='refs/heads/main'||event.head_commit?.message!=='cms(pse): restore original Kali 1678 native page'||process.env.PSE_KALI_FRESH_BACKUP!=='yes')throw Error('Unauthorized write scope');
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com',slug='kali-phu-my-mo-ta-va-hdsd',key='pse-historical-kali-1678',title='Kali Phú Mỹ - Mô tả và HDSD';
const source='https://pse.vn/hoat-dong-kinh-doanh/san-pham/dam-phu-my/8-trang-chu/1678-kali-phu-my-mo-ta-va-hdsd.html';
const bodySha='21ff53b4019c5349a0d010ca5fc8b0b9ce7600097ac9ce4c2620dfdfc83e3a53',imageSha='58c823c48ee04c595116945f7bf11bb7b6aae3dbe5d22446195659f726294cee';
const hash=b=>createHash('sha256').update(b).digest('hex');
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
const proof=JSON.parse(await readFile('inputs/kali/report.json','utf8')),bytes=await readFile('inputs/kali/original.png');
if(!proof.ready||proof.sourceId!==1678||proof.source!==source||proof.slug!==slug||proof.original.title!==title||hash(proof.original.text)!==bodySha||proof.original.tables.length!==2||proof.original.images.length!==1||proof.sourceImage.sha256!==imageSha||hash(bytes)!==imageSha||bytes.length!==66704||proof.route.publicHTTP!==404)throw Error('Pinned original evidence mismatch');
for(const [k,v] of [['WC_URL',wp],['WC_URL_CLIENT',front]]){
 const a=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith(k+'='));
 if(a.length!==1||new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,'')).origin!==v)throw Error('Origin mismatch '+k);
}
const out='artifacts/pse-kali-1678-native-page';await mkdir(out,{recursive:true});
const report={sourceId:1678,source,slug,sourceBodySha:bodySha,sourceImageSha:imageSha,writes:[],pass:false,noProductWrites:true,noCategoryWrites:true};
const save=()=>writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const b=await chromium.launch({headless:true}),net=await request.newContext({timeout:45000}),site=await b.newContext({javaScriptEnabled:false});await site.route('**/*',r=>r.abort());
const parser=await site.newPage(),ctx=await b.newContext(),admin=await ctx.newPage();
const mapping=[[1668,'/san-pham/dam-phu-my-chuyen-dung-cho-drone-1668'],[1669,'/san-pham/dam-phu-my-chuyen-dung-cho-nong-lam-truong-1669'],[1676,'/san-pham/sa-phu-my-1682'],[1677,'/san-pham/dap-phu-my-1677']];
try{
 const sourceR=await net.get(source,{maxRedirects:0,failOnStatusCode:false});
 if(sourceR.status()!==200)throw Error('Source detail HTTP '+sourceR.status());
 const sourceHtml=await sourceR.text();if(sourceHtml.length>8000000)throw Error('Source oversized');
 await parser.setContent('<base href="'+source+'">'+sourceHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'domcontentloaded'});
 const original=await parser.evaluate(()=>{
  const n=s=>String(s||'').replace(/\s+/g,' ').trim(),root=document.querySelector('.item-page [itemprop=articleBody]');
  if(!root)throw Error('Source body missing');
  return {html:root.innerHTML,text:n(root.textContent),images:[...root.querySelectorAll('img[src]')].map(e=>e.src),tables:[...root.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(c=>n(c.textContent))))};
 });
 if(hash(original.text)!==bodySha||JSON.stringify(original.tables)!==JSON.stringify(proof.original.tables.map(t=>t.rows))||JSON.stringify(original.images)!==JSON.stringify(proof.original.images))throw Error('Original changed');
 const links=proof.original.links.map(l=>{
  const p=mapping.find(([i])=>l.href.includes('/'+i+'-'));
  if(p)return [l.href,front+p[1]];
  if(l.url==='https://pse.vn/hoat-dong-kinh-doanh/san-pham/dam-phu-my.html')return [l.href,front+'/san-pham/dam-phu-my'];
  if(l.url==='https://dpm.vn/phan-bon-phu-my/dam-phu-my#guide')return [l.href,l.url];
  throw Error('Unknown source link');
 });
 if(links.length!==6||new Set(links.map(l=>l[0])).size!==6)throw Error('Original link inventory changed');
 for(const [,dest] of links.filter(l=>l[1].startsWith(front))){
  const r=await net.get(dest,{maxRedirects:0,failOnStatusCode:false});if(r.status()!==200)throw Error('Related destination not ready '+dest);
 }
 // A native editor session, not a new PHP endpoint.
 await admin.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await admin.locator('#user_login').count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('Missing authorized WP credentials');
  await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const m=(await admin.locator('#loginform').innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();if(!await f.count())throw Error('Unknown login challenge');await f.fill(String(v))}
  await admin.locator('#wp-submit').click();
 }
 await admin.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(admin.url().includes('wp-login')||!await admin.locator('#adminmenu').count())throw Error('No WP admin session');
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});if(!r.ok)throw Error('REST nonce unavailable');return(await r.text()).trim()});
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error('Bad WP nonce');
 const api=async(path,method='GET',body)=>{
  const r=await ctx.request.fetch(wp+'/wp-json/wp/v2/'+path,{method,headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{data:body}:{})});return {http:r.status(),data:await r.json().catch(()=>null)};
 };
 const query='?context=edit&status=publish,draft,pending,private,future&slug='+slug+'&_fields=id,slug,status,acf,title,content,featured_media';
 const [pa,po,pr]=await Promise.all(['pages','posts','product'].map(k=>api(k+query)));
 if([pa,po,pr].some(x=>x.http!==200||!Array.isArray(x.data))||po.data.length||pr.data.length||pa.data.length>1)throw Error('Page slug collision or incomplete inventory');
 let existing=pa.data[0];if(existing&&(existing.slug!==slug||existing.acf?.key!==key||existing.acf?.action!=='PublicPage'||!['draft','publish'].includes(existing.status)))throw Error('Existing page not owned by this source');
 const filename='pse-kali-1678-'+imageSha.slice(0,12)+'.png',marker=filename.slice(0,-4);
 const search=await api('media?context=edit&per_page=100&search='+marker);
 if(search.http!==200||!Array.isArray(search.data))throw Error('Media inventory unavailable');
 const matches=search.data.filter(m=>m.slug===marker);
 if(matches.length>1||matches.some(m=>m.mime_type!=='image/png'))throw Error('Media conflict');
 if(!matches.length&&existing)throw Error('Existing native page without owned media');
 let media=matches[0];
 if(!media){
  const r=await ctx.request.post(wp+'/wp-json/wp/v2/media',{data:bytes,headers:{'X-WP-Nonce':nonce,'Content-Disposition':'attachment; filename="'+filename+'"','Content-Type':'image/png',Accept:'application/json'},timeout:90000});
  media=await r.json().catch(()=>null);
  if(r.status()!==201||!Number.isSafeInteger(media?.id)||media.mime_type!=='image/png')throw Error('Original Media upload failed HTTP '+r.status());
  report.writes.push({kind:'media',id:media.id});await save();
 }
 const f=await api('media/'+media.id+'?context=edit');
 if(f.http!==200||f.data.id!==media.id||f.data.mime_type!=='image/png')throw Error('Media readback failed');
 const mf=String(f.data.media_details?.file||'').replace(/^\/+/,'');
 const candidates=[f.data.source_url,f.data.guid?.rendered];
 if(mf&&mf.split('/').every(s=>/^[\w.-]+$/.test(s)&&s!=='..')&&mf.split('/').at(-1)===filename)candidates.push('/wp-content/uploads/'+mf);
 let mediaUrl='';
 for(const c of candidates.filter(Boolean)){
  const u=new URL(c,wp+'/');
  if(u.origin!==wp||!u.pathname.startsWith('/wp-content/uploads/')||!u.pathname.endsWith('/'+filename)||u.username||u.password)continue;
  const r=await net.get(u.href,{maxRedirects:0,failOnStatusCode:false});
  if(r.status()===200&&hash(await r.body())===imageSha){mediaUrl=u.href;break}
 }
 if(!mediaUrl)throw Error('Original media byte readback failed');
 report.media={id:media.id,url:mediaUrl,sha256:imageSha};
 // Preserve the source body and both nested tables verbatim at the normalized text level.
 // Remove legacy visual CSS, event handlers, tracking and foreign image references.
 const clean=await parser.evaluate(({html,mediaUrl,links})=>{
  const root=document.createElement('div');root.innerHTML=html;
  root.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta,base,svg,video,audio').forEach(e=>e.remove());
  const allowed=new Set(['colspan','rowspan','scope','headers','alt','title','dir','lang']);
  const map=new Map(links);
  for(const el of root.querySelectorAll('*')){
   const tag=el.tagName.toLowerCase(),href=el.getAttribute('href');
   for(const a of [...el.attributes])if(!allowed.has(a.name))el.removeAttribute(a.name);
   if(tag==='a'&&href){if(!map.has(href))throw Error('Unverified link '+href);el.setAttribute('href',map.get(href))}
   if(tag==='img'){el.setAttribute('src',mediaUrl);el.setAttribute('alt','Kali Phú Mỹ');el.setAttribute('loading','lazy');}
  }
  const n=s=>String(s||'').replace(/\s+/g,' ').trim();
  return {html:root.innerHTML,text:n(root.textContent),tables:[...root.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(c=>n(c.textContent)))),images:root.querySelectorAll('img').length};
 },{html:original.html,mediaUrl,links});
 if(hash(clean.text)!==bodySha||JSON.stringify(clean.tables)!==JSON.stringify(original.tables)||clean.images!==1)throw Error('Sanitized source content changed');
 const content='<div class="pse-historical-kali-1678">'+clean.html+'</div>';
 await writeFile(out+'/source-content.html',content);
 const get=id=>api('pages/'+id+'?context=edit&_fields=id,slug,status,acf,title,content,featured_media');
 const check=async(id,status)=>{
  const r=await get(id);
  if(r.http!==200||r.data.id!==id||r.data.slug!==slug||r.data.status!==status||norm(r.data.title?.raw)!==title||r.data.content?.raw!==content||r.data.acf?.action!=='PublicPage'||r.data.acf?.key!==key||r.data.acf?.product_lang?.value!=='vi'&&r.data.acf?.product_lang!=='vi')throw Error('Native Page exact readback mismatch');
  return r.data;
 };
 if(!existing){
  const r=await api('pages','POST',{title,slug,status:'draft',content,acf:{action:'PublicPage',key,product_lang:'vi',label:title},featured_media:media.id});
  if(r.http!==201||!Number.isSafeInteger(r.data?.id))throw Error('Native Page draft failed HTTP '+r.http);
  existing=r.data;report.writes.push({kind:'page-draft',id:existing.id});await save();
 }
 await check(existing.id,existing.status);
 if(existing.status==='draft'){
  const r=await api('pages/'+existing.id,'POST',{status:'publish'});
  if(r.http!==200||r.data?.status!=='publish')throw Error('Native Page publish failed');
  report.writes.push({kind:'page-publish',id:existing.id});await save();
 }
 await check(existing.id,'publish');
 const pub=await net.get(wp+'/wp-json/wp/v2/pages/'+existing.id+'?_fields=id,slug,status,acf,content,featured_media');
 const p=await pub.json();if(pub.status()!==200||p.id!==existing.id||p.slug!==slug||p.status!=='publish'||p.acf?.action!=='PublicPage'||p.featured_media!==media.id)throw Error('Public Page readback failed');
 report.page={id:existing.id,slug,status:'publish',mediaId:media.id};report.pass=true;
 console.log('PSE_KALI_NATIVE_PAGE_PASS='+JSON.stringify({page:report.page,media:report.media,bodySha,tables:2,noCategoryWrites:true,noProductWrites:true}));
}finally{await save();await net.dispose();await b.close()}
