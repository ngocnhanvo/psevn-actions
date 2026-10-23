/** Bind source PSE event's first verified photo as PRIVATE WordPress featured image.
 * Uses only already imported uploaded Media; no external source hotlinking,
 * no post publishing, Astro builds, FTP, or new Media uploads.
 */
import { chromium } from 'playwright';
const cfg=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL='));
if(cfg.length!==1)throw Error('PSE CMS origin missing or duplicated');
const u=new URL(cfg[0].slice(7).trim().replace(/^['"]|['"]$/g,''));
if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Unsafe PSE CMS URL');
const origin=u.origin,postId=76975;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const page=await context.newPage();
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('Missing WP secret');
 await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const txt=await page.locator('body').innerText();
  const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Missing WP arithmetic field');await f.fill(String(v));
  }
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WP login failed');
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  const s=(await r.text()).trim();
  if(!r.ok||!/^[a-zA-Z0-9]{8,24}$/.test(s)||s==='0')throw Error('Missing WP REST nonce');
  return s;
 });
 const api=(p,method='GET',data)=>page.evaluate(async({p,method,data,nonce})=>{
  const r=await fetch(p,{method,credentials:'same-origin',headers:{
   'X-WP-Nonce':nonce,Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})
  },...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,data:await r.json().catch(()=>({}))};
 },{p,method,data,nonce});
 const post=await api('/wp-json/wp/v2/posts/'+postId+'?context=edit&_fields=id,slug,status,categories,featured_media,content,date,date_gmt,title');
 const v=post.data||{};
 if(post.status!==200||v.id!==postId||v.status!=='draft'||!v.categories?.includes(1742)||
   v.slug!=='pvfcco-pse-to-chuc-thanh-cong-giai-pickleball-pse-open-2026'||
   v.date!=='2026-07-28T02:38:45')
   throw Error('PSE company news draft changed; no featured-media mutation');
 // First image in the proven article body, source image is /images/PSE001.jpg.
 const first=await page.evaluate(html=>{
  const dom=new DOMParser().parseFromString(html,'text/html');
  return dom.querySelector('img[src]')?.getAttribute('src')||'';
 },String(v.content?.raw||''));
 if(!first)throw Error('PSE Open 2026 first source image missing from draft');
 const media=await api('/wp-json/wp/v2/media?search=pse-legacy-76975-01-&per_page=100&context=edit');
 if(media.status!==200||!Array.isArray(media.data))throw Error('Cannot lookup verified PSE Media');
 const matches=media.data.filter(x=>/^pse-legacy-76975-01-[a-f0-9]{12}\.jpg$/.test(String(x.media_details?.file||'').split('/').at(-1)));
 if(matches.length!==1)throw Error('Expected exactly one verified PSE001 Media item, got '+matches.length);
 const item=matches[0],file=String(item.media_details.file).split('/').at(-1);
 if(item.mime_type!=='image/jpeg'||item.media_details.width<=0||item.media_details.height<=0)
  throw Error('Verified PSE cover has wrong mime or dimensions');
 const candidate=[item.source_url,item.guid?.rendered].filter(Boolean)
  .find(x=>{try{const u=new URL(x);return u.protocol==='https:'&&u.hostname===new URL(origin).hostname&&u.pathname.includes('/wp-content/uploads/')&&decodeURIComponent(u.pathname).endsWith('/'+file)}catch{return false}});
 if(!candidate||first!==candidate)throw Error('First PSE article image does not match WordPress uploaded asset');
 if(v.featured_media>0&&v.featured_media!==item.id)throw Error('Existing unrelated featured_media is protected');
 if(v.featured_media!==item.id){
  const set=await api('/wp-json/wp/v2/posts/'+postId,'POST',{
   featured_media:item.id,status:'draft',date:v.date,date_gmt:v.date_gmt
  });
  if(set.status!==200||set.data?.id!==postId||set.data.status!=='draft')
   throw Error('Cannot link verified article featured image (HTTP '+set.status+')');
 }
 const check=await api('/wp-json/wp/v2/posts/'+postId+'?context=edit&_fields=id,slug,status,categories,featured_media,content,date,date_gmt');
 if(check.status!==200||check.data.id!==postId||check.data.status!=='draft'||
   check.data.featured_media!==item.id||check.data.date!==v.date||
   check.data.date_gmt!==v.date_gmt||check.data.slug!==v.slug||
   !check.data.categories?.includes(1742)||String(check.data.content?.raw||'')!==String(v.content?.raw||''))
  throw Error('PSE featured_media save changed protected private post fields');
 console.log('PSE_PRIVATE_EVENT_FEATURED_MEDIA=PASS; post=76975; media='+item.id+
  '; original_photo=PSE001.jpg; WP_Media_read_after_write=true; status=draft; no_build=true');
}finally{await browser.close()}
