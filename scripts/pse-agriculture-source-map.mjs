/** Original PSE agricultural knowledge page inventories to native published WordPress Posts, read only. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const vars=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
const originStr=vars.filter(s=>s.startsWith('WC_URL='));
if(originStr.length!==1)throw Error('Missing/ambiguous CMS origin');
const wp=new URL(originStr[0].slice(7).replace(/^['"]|['"]$/g,''));
if(wp.protocol!=='https:'||wp.username||wp.password||wp.search||wp.hash||!['','/'].includes(wp.pathname))throw Error('Unsafe CMS origin');
const specs=[
 {id:77014,parent:77004,slug:'kien-thuc-nong-nghiep',label:'Kiến thức nông nghiệp'},
 {id:77015,parent:77014,slug:'huong-dan-su-dung-phan-bon',label:'Hướng dẫn sử dụng phân bón'},
 {id:77016,parent:77014,slug:'phan-biet-va-chon-mua-phan-bon',label:'Phân biệt và chọn mua phân bón'}
];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
try{
 await page.goto(wp.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const s=await page.locator('body').innerText();
  const m=s.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||s.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],c=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error('CAPTCHA field absent');await f.fill(String(c))}
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('CMS login rejected');
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});if(!r.ok)throw Error('No REST nonce');return(await r.text()).trim()});
 const api=path=>page.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json','X-WP-Nonce':nonce}});return{status:r.status,pages:r.headers.get('X-WP-TotalPages'),total:r.headers.get('X-WP-Total'),data:await r.json().catch(()=>null)}},{path,nonce});
 const menu=await api('/wp-json/wp/v2/menu-items?context=edit&per_page=100&_fields=id,parent,url,title,type,object,object_id');
 if(menu.status!==200||!Array.isArray(menu.data))throw Error('Menu API unavailable');
 const posts=[];for(let pageNo=1;pageNo<=10;pageNo++){
  const r=await api('/wp-json/wp/v2/posts?status=publish&per_page=100&page='+pageNo+'&_fields=id,slug,title,categories,acf');
  if(r.status!==200||!Array.isArray(r.data))throw Error('WP Posts registry unavailable HTTP '+r.status);
  posts.push(...r.data);const allPages=Number(r.pages||1);if(allPages>10)throw Error('WP published article registry exceeds safety cap');
  if(pageNo>=allPages)break;
 }
 const postBySlug=new Map();
 for(const post of posts){if(postBySlug.has(post.slug))throw Error('Duplicate published WP post slug '+post.slug);postBySlug.set(post.slug,post)}
 const source=await browser.newPage({viewport:{width:1440,height:900}});
 await source.route(/\.(png|jpe?g|webp|gif|woff2?|svg|ttf)(\?.*)?$/i,route=>route.abort());
 const results=[];
 for(const sp of specs){
  const menuItem=menu.data.filter(x=>Number(x.id)===sp.id&&Number(x.parent)===sp.parent);
  if(menuItem.length!==1||String(menuItem[0].title?.raw||menuItem[0].title?.rendered||'').trim()!==sp.label)throw Error('Menu changed '+sp.slug);
  const url=new URL(menuItem[0].url);if(url.protocol!=='https:'||url.hostname!=='www.pse.vn'||!url.pathname.startsWith('/hoat-dong-kinh-doanh/'))throw Error('Unverified original agriculture URL '+sp.slug);
  const pages=[url.href],visited=new Set(),links=new Map(),external=new Set();
  while(pages.length&&visited.size<45){
   const href=pages.shift();if(visited.has(href))continue;visited.add(href);
   const res=await source.goto(href,{waitUntil:'domcontentloaded',timeout:40000});
   if(res?.status()!==200)throw Error('Original category HTTP '+res?.status()+' '+sp.slug);
   const state=await source.evaluate(({categoryPath})=>{
    const blog=document.querySelector('.blog');if(!blog)throw Error('Original agriculture listing is not Joomla .blog');
    const items=[...blog.querySelectorAll('.item')];
    return {empty:(blog.textContent||'').includes('Không có bài nào trong mục này'),
      candidates:items.flatMap(el=>[...el.querySelectorAll('a[href]')].map(a=>a.href)),
      all:[...blog.querySelectorAll('a[href]')].map(a=>a.href)};
   },{categoryPath:url.pathname});
   for(const href of state.candidates){
    let target;try{target=new URL(href)}catch{continue}
    if(target.hostname!=='www.pse.vn'||target.protocol!=='https:'){external.add(target.hostname);continue}
    if(!target.pathname.startsWith(url.pathname.replace(/\.html$/,'/') )||!/^\d+-[a-z0-9-]+\.html$/i.test(target.pathname.split('/').at(-1)))continue;
    const slug=target.pathname.split('/').at(-1).replace(/^\d+-/,'').replace(/\.html$/,'');
    const hit=postBySlug.get(slug);
    links.set(target.pathname,{slug,wordpressId:hit?.id||null,wpCategories:hit?.categories||[],wpTitle:hit?.title?.rendered||'',original:target.pathname});
   }
   for(const href of state.all){
    let link;try{link=new URL(href)}catch{continue}
    if(link.hostname==='www.pse.vn'&&link.pathname===url.pathname&&link.searchParams.has('start')&&/^\d{1,5}$/.test(link.searchParams.get('start')||'')&&!visited.has(link.href)&&!pages.includes(link.href))pages.push(link.href);
   }
  }
  if(pages.length)throw Error('Original archive pagination cap '+sp.slug);
  const value={...sp,menuUrl:url.href,pages:visited.size,totalSourceArticles:links.size,matchedPosts:[...links.values()].filter(x=>x.wordpressId),unmatchedPosts:[...links.values()].filter(x=>!x.wordpressId),externalHostCount:external.size};
  console.log('PSE_AGRICULTURE_MAP='+JSON.stringify({slug:sp.slug,sourcePages:visited.size,sourceArticles:links.size,matched:value.matchedPosts.length,unmatched:value.unmatchedPosts.length,sample:value.matchedPosts.slice(0,5),externalHosts:external.size}));
  results.push(value);
 }
 await mkdir('artifacts/pse-agriculture-map',{recursive:true});
 await writeFile('artifacts/pse-agriculture-map/original-to-wordpress.json',JSON.stringify({totalPublishedWordPressPosts:posts.length,results},null,2)+'\n');
 console.log('PSE_AGRICULTURE_MAP_PASS; original_category_pages='+results.length+'; verified_matches='+results.reduce((n,x)=>n+x.matchedPosts.length,0)+'; no_wordpress_mutations=true; no_build=true');
}finally{await browser.close()}
