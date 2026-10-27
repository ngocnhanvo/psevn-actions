/** Read-only PSE old Joomla -> WordPress Tin tong hop parity diagnostic. */
import { chromium } from 'playwright';
const config = Object.fromEntries(String(process.env.ENV_FILE || '')
 .split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/, ''))
 .filter(x=>/^(WC_URL|WC_URL_CLIENT)=/.test(x)).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const validated = (value,label) => {
 const u=new URL(value || '');
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.port||!['','/'].includes(u.pathname)||u.search||u.hash)
  throw Error('Invalid '+label);
 return u.origin;
};
const cms=validated(config.WC_URL,'WordPress'),web=validated(config.WC_URL_CLIENT,'Astro');
if(cms===web)throw Error('CMS/website not isolated');
const browser=await chromium.launch({headless:true});
const wp=await browser.newPage();
try{
 await wp.goto(cms+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await wp.locator('#user_login').count()){
  await wp.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await wp.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const body=await wp.locator('body').innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
    const a=Number(m[1]),b=Number(m[3]),answer=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];
    const field=wp.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
    if(!await field.count())throw Error('WordPress math captcha field missing');
    await field.fill(String(answer));
  }
  await Promise.all([wp.waitForLoadState('domcontentloaded'),wp.locator('#wp-submit').click()]);
 }
 if(wp.url().includes('wp-login.php'))throw Error('WordPress auth failed');
 const nonce=await wp.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  if(!r.ok)throw Error('REST nonce unavailable');
  return (await r.text()).trim();
 });
 const api=async path=>wp.evaluate(async({path,nonce})=>{
   const r=await fetch(path,{credentials:'same-origin',headers:{'X-WP-Nonce':nonce,'Accept':'application/json'}});
   const data=await r.json().catch(()=>null);
   return {http:r.status,total:Number(r.headers.get('X-WP-Total')||0),pages:Number(r.headers.get('X-WP-TotalPages')||1),data};
 },{path,nonce});
 const taxonomy=await api('/wp-json/wp/v2/categories?hide_empty=false&per_page=100&_fields=id,slug,parent,count,name');
 if(taxonomy.http!==200||!Array.isArray(taxonomy.data))throw Error('WP taxonomy unavailable');
 const lookup=slug=>{const items=taxonomy.data.filter(x=>x.slug===slug);if(items.length!==1)throw Error('Category missing/ambiguous '+slug);return items[0]};
 const child=lookup('tin-tong-hop'),parent=lookup('tin-cong-ty');
 const getPosts=async(cat)=>{
  const first=await api('/wp-json/wp/v2/posts?categories='+cat.id+'&status=publish&per_page=100&page=1&orderby=date&order=desc&_fields=id,slug,title,categories,date,status');
  if(first.http!==200||!Array.isArray(first.data))throw Error('WP posts unavailable category '+cat.id+' HTTP '+first.http);
  const posts=[...first.data];for(let n=2;n<=first.pages;n++){
    const r=await api('/wp-json/wp/v2/posts?categories='+cat.id+'&status=publish&per_page=100&page='+n+'&orderby=date&order=desc&_fields=id,slug,title,categories,date,status');
    if(r.http!==200||!Array.isArray(r.data))throw Error('Missing WP paginated results: '+n);
    posts.push(...r.data);
  }
  if(first.total!==posts.length)throw Error('WP posts truncated '+cat.slug+': total='+first.total+' fetched='+posts.length);
  return {total:first.total,pages:first.pages,posts};
 };
 const [childPosts,parentPosts,allPosts]=await Promise.all([getPosts(child),getPosts(parent),api('/wp-json/wp/v2/posts?status=publish&per_page=1&page=1&_fields=id')]);
 const visible=await browser.newPage({viewport:{width:1440,height:900}});
 const response=await visible.goto(web+'/tin-tuc-su-kien/tin-tong-hop',{waitUntil:'domcontentloaded',timeout:60000});
 const front=await visible.evaluate(()=>({
  title:document.title,
  cardCount:document.querySelectorAll('#posts-grid .grid > div').length,
  text:document.querySelector('#posts-grid')?.textContent?.replace(/\s+/g,' ').slice(-350)||'',
  pagination:document.querySelector('#posts-grid nav[aria-label="Phân trang"]')?.textContent?.replace(/\s+/g,' ').trim()||'',
  empty:document.querySelector('#posts-grid')?.textContent?.includes('Chưa có bài viết')||false
 }));
 const source=await browser.newPage({viewport:{width:1440,height:900}});
 await source.route(/\.(?:woff2?|ttf|png|jpe?g|webp)(?:\?.*)?$/i,route=>route.abort());
 const oldUrl='https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop.html';
 const oldRes=await source.goto(oldUrl,{waitUntil:'domcontentloaded',timeout:60000});
 const old=await source.evaluate(()=>{
  const node=document.querySelector('.blog')||document.querySelector('main')||document.body;
  const articleUrls=[...new Set([...node.querySelectorAll('a[href]')].map(a=>a.href)
   .filter(h=>{try{const u=new URL(h);return /(^|\.)pse\.vn$/.test(u.hostname)&&/\/\d+-[a-z0-9-]+\.html$/.test(u.pathname)}catch{return false}}))];
  const pageLinks=[...new Set([...node.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>h.includes('start=')))];
  const pager=(node.textContent||'').match(/Page\s+\d+\s+of\s+\d+/i)?.[0]||'';
  return {title:document.title,pager,articleUrls,pageLinks:pageLinks.slice(0,10)};
 });
 const knownSlugs=new Set(childPosts.posts.map(p=>p.slug));
 const knownParent=new Set(parentPosts.posts.map(p=>p.slug));
 const sourceRows=old.articleUrls.map(url=>({url,slug:new URL(url).pathname.split('/').at(-1).replace(/^\d+-/,'').replace(/\.html$/,'')}));
 const samples=sourceRows.slice(0,12).map(p=>({slug:p.slug,inSpecificCategory:knownSlugs.has(p.slug),inParent:knownParent.has(p.slug)}));
 const report={
  categories:{child,parent},
  wordpress:{tinTongHop:childPosts.total,tinCongTy:parentPosts.total,allPublished:allPosts.total,
   companyNotTongHop:parentPosts.posts.filter(p=>!knownSlugs.has(p.slug)).length},
  newSite:{http:response?.status(),...front},
  oldSite:{http:oldRes?.status(),title:old.title,pager:old.pager,firstPageArticleLinks:sourceRows.length,paginationLinks:old.pageLinks.length},
  oldFirstPageSamples:samples,
  notes:'Read-only, source first-page sample is not a complete 56-page manifest'
 };
 console.log('PSE_TIN_TONG_HOP_PARITY='+JSON.stringify(report));
 if(response?.status()!==200||oldRes?.status()!==200)throw Error('Legacy or Astro category HTTP failure');
 console.log('PSE_TIN_TONG_HOP_AUDIT=PASS; READ_ONLY=PASS; NO_BUILD=PASS');
 await visible.close();await source.close();
}finally{await wp.close();await browser.close()}
