/** Authenticated READ-ONLY PSE draft media/document link audit.
 * Never publish, edit CMS, FTP or build Astro. */
import {chromium} from 'playwright';
const rows=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL='));
if(rows.length!==1)throw Error('Ambiguous PSE CMS URL');
const u=new URL(rows[0].slice(7).trim().replace(/^['"]|['"]$/g,''));
if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))
 throw Error('CMS URL invalid');
const origin=u.origin;
const posts=[
 {id:76975,category:1742,label:'PSE Open 2026'},
 {id:76976,category:1743,label:'Agricultural roundup'},
 {id:76977,category:1744,label:'Q3/2026 Financial Disclosure'}
];
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const page=await context.newPage();
try {
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 if(!username||!password)throw Error('Missing WordPress admin credentials');
 await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
   await page.locator('#user_login').fill(username);
   await page.locator('#user_pass').fill(password);
   const body=await page.locator('body').innerText();
   const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){
     const a=Number(m[1]),b=Number(m[3]);
     const n=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
     const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await field.count())throw Error('WordPress login challenge input missing');
     await field.fill(String(n));
   }
   await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('PSE admin login failed');
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
   if(!r.ok)throw Error('Cannot retrieve REST nonce');
   const token=(await r.text()).trim();
   if(!/^[a-zA-Z0-9]{8,24}$/.test(token)||token==='0')throw Error('Invalid REST nonce');
   return token;
 });
 const read=async route=>{
   const r=await page.evaluate(async({route,nonce})=>{
     const res=await fetch(route,{credentials:'same-origin',headers:{Accept:'application/json','X-WP-Nonce':nonce}});
     return {http:res.status,payload:await res.json().catch(()=>({}))};
   },{route,nonce});
   if(r.http!==200)throw Error('Cannot read private WordPress post HTTP '+r.http);
   return r.payload;
 };
 let total=0,broken=0;
 for(const record of posts){
   const p=await read('/wp-json/wp/v2/posts/'+record.id+'?context=edit&_fields=id,status,categories,content,featured_media,slug');
   if(p.id!==record.id||p.status!=='draft'||!p.categories?.includes(record.category))
     throw Error('Unexpected PSE draft identity id='+record.id);
   const urls=await page.evaluate(html=>{
     const doc=new DOMParser().parseFromString(html,'text/html');
     const img=[...doc.querySelectorAll('img[src]')].map(e=>({type:'image',url:e.src}));
     const links=[...doc.querySelectorAll('a[href]')]
       .filter(e=>/\.(?:pdf|docx?|xlsx?)(?:[?#]|$)/i.test(e.href))
       .map(e=>({type:'document',url:e.href}));
     return [...img,...links];
   },String(p.content?.raw||''));
   const seen=new Set();const verified=[];
   for(const asset of urls){
     if(seen.has(asset.url))continue;
     seen.add(asset.url);
     if(seen.size>40)throw Error('Unexpected oversized PSE article media list id='+record.id);
     const u=new URL(asset.url);
     const trusted=u.protocol==='https:'&&['www.pse.vn','pse.vn',new URL(origin).hostname].includes(u.hostname);
     let status=0,mime='',error='';
     if(trusted){
       try{const r=await context.request.head(u.href,{timeout:17000});
         status=r.status();mime=(r.headers()['content-type']||'').split(';')[0];
       }catch(e){error=String(e?.message||e).slice(0,100)}
     }else error='not_from_verified_PSE_or_CMS';
     const ok=trusted&&status>=200&&status<400&&
       (asset.type==='image'?mime.startsWith('image/'):mime.includes('pdf')||mime.includes('octet-stream')||mime.includes('msword'));
     if(!ok)broken++;
     total++;
     verified.push({kind:asset.type,path:u.pathname.slice(0,160),host:u.hostname,
       status,mime,ok,error});
   }
   console.log('PSE_PRIVATE_DRAFT_ASSET_AUDIT='+JSON.stringify({
     draftId:record.id,label:record.label,status:p.status,featuredMedia:p.featured_media,
     referenceCount:verified.length,assets:verified
   }));
 }
 console.log('PSE_PRIVATE_DRAFT_ASSET_AUDIT_SUMMARY='+JSON.stringify({
   posts:posts.length,references:total,failedChecks:broken,readOnly:true,
   postPublication:false,changedCMS:false,noAstroBuild:true
 }));
}finally{await browser.close()}
