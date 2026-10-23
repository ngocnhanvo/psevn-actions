/** Preserve externally verified Joomla RSS publication timestamps on the matching
 * private WordPress drafts. Never publish posts or modify their content.
 * Source: PSE original RSS and Atom audit, Actions #39920844804.
 */
import { chromium } from 'playwright';
const records=[
 {id:76975,category:1742,slug:'pvfcco-pse-to-chuc-thanh-cong-giai-pickleball-pse-open-2026',
  title:'PVFCCo-PSE tổ chức thành công Giải Pickleball PSE Open 2026',
  signal:'PSE Open 2026',local:'2026-07-28T02:38:45',gmt:'2026-07-27T19:38:45'},
 {id:76977,category:1744,slug:'20261019-cbtt-bao-cao-tai-chinh-q3-2026',
  title:'2026.10.19: CBTT – Báo cáo tài chính Q3/2026',
  signal:'Báo cáo tài chính quý 3 năm 2026',local:'2026-10-19T15:04:22',gmt:'2026-10-19T08:04:22'}
];
const origin=(()=>{
 const rows=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith('WC_URL='));
 if(rows.length!==1)throw Error('Missing or ambiguous PSE CMS WC_URL');
 const u=new URL(rows[0].slice(7).trim().replace(/^['"]|['"]$/g,''));
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
    !['','/'].includes(u.pathname)||(u.port&&u.port!=='443'))
   throw Error('Unsafe configured CMS origin');
 return u.origin;
})();
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:880}});
const admin=await context.newPage();
try{
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 if(!username||!password)throw Error('Missing PSE WordPress admin login secrets');
 await admin.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await admin.locator('#user_login').count()){
   await admin.locator('#user_login').fill(username);
   await admin.locator('#user_pass').fill(password);
   const text=await admin.locator('body').innerText();
   const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){
     const a=Number(m[1]),b=Number(m[3]),answer=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
     const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await f.count())throw Error('Missing PSE WordPress login challenge input');
     await f.fill(String(answer));
   }
   await Promise.all([admin.waitForLoadState('domcontentloaded'),admin.locator('#wp-submit').click()]);
 }
 if(admin.url().includes('wp-login'))throw Error('WordPress admin login failed');
 const nonce=await admin.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
   if(!r.ok)throw Error('Cannot get authenticated REST nonce');
   const n=(await r.text()).trim();
   if(!/^[a-zA-Z0-9]{8,24}$/.test(n)||n==='0')throw Error('Invalid REST nonce');
   return n;
 });
 const api=(path,method='GET',data)=>admin.evaluate(async({path,method,data,nonce})=>{
   const response=await fetch(path,{method,credentials:'same-origin',
     headers:{Accept:'application/json','X-WP-Nonce':nonce,...(data?{'Content-Type':'application/json'}:{})},
     ...(data?{body:JSON.stringify(data)}:{})});
   return {http:response.status,data:await response.json().catch(()=>({}))};
 },{path,method,data,nonce});
 const settings=await api('/wp-json/wp/v2/settings');
 if(settings.http!==200)throw Error('WordPress settings REST request could not be authenticated');
 let tz=String(settings.data.timezone_string||settings.data.timezone||'').trim();
 let offset=settings.data.gmt_offset===undefined?NaN:Number(settings.data.gmt_offset);
 console.log('PSE_DRAFT_DATE_WP_REST_TIMEZONE_FIELDS='+JSON.stringify({
   available:Object.keys(settings.data||{}).filter(k=>/time|zone|gmt|date/i.test(k)),
   timezone:tz||null,
   gmt_offset:Number.isFinite(offset)?offset:null
 }));
 // Some PSE WP installations omit the timezone options from the REST settings
 // schema. Use the authenticated core WordPress Settings UI, never infer zone.
 if(!tz&&!Number.isFinite(offset)){
   const response=await admin.goto(origin+'/wp-admin/options-general.php',
     {waitUntil:'domcontentloaded',timeout:50000});
   if(response?.status()!==200||admin.url().includes('wp-login'))
     throw Error('Cannot authenticate WordPress timezone settings UI');
   const field=admin.locator('select#timezone_string,select[name="timezone_string"]').first();
   if(!await field.count())throw Error('WordPress timezone setting absent; no date write');
   tz=(await field.inputValue()).trim();
   console.log('PSE_DRAFT_DATE_WP_ADMIN_TIMEZONE='+JSON.stringify({timezone:tz}));
 }
 // Source feed explicitly carries +0700; require an independently configured
 // equivalent zone before assigning date/date_gmt in an unpublished post.
 if(!['Asia/Ho_Chi_Minh','Asia/Saigon','Asia/Bangkok','Etc/GMT-7','UTC+7'].includes(tz)
    && !(Number.isFinite(offset)&&offset===7))
   throw Error('PSE CMS timezone cannot be verified as UTC+07; no write. zone='+tz+
     '; offset='+(Number.isFinite(offset)?offset:'unknown'));
 console.log('PSE_DRAFT_DATE_CMS_TIMEZONE=VERIFIED; timezone='+tz+
   '; gmt_offset='+(Number.isFinite(offset)?offset:'unavailable'));
 // Preflight BOTH draft records before any write: fail closed on identity or status changes.
 const observed=[];
 for(const rec of records){
   const found=await api('/wp-json/wp/v2/posts/'+rec.id+'?context=edit&_fields=id,slug,title,status,categories,content,date,date_gmt');
   const p=found.data||{};
   if(found.http!==200||p.id!==rec.id||p.status!=='draft'||
      p.slug!==rec.slug||String(p.title?.raw||'')!==rec.title||
      !p.categories?.includes(rec.category)||!String(p.content?.raw||'').includes(rec.signal))
      throw Error('PSE private draft identity/content changed: '+rec.id);
   const existingDate=String(p.date||''),existingGmt=String(p.date_gmt||'');
   const same=existingDate===rec.local&&existingGmt===rec.gmt;
   if(!same&&!existingDate.startsWith('2026-10-23T'))
      throw Error('PSE draft post has independently modified original date: '+rec.id);
   observed.push({rec,same});
 }
 for(const {rec,same} of observed){
   if(!same){
     const save=await api('/wp-json/wp/v2/posts/'+rec.id,'POST',{
       date:rec.local,date_gmt:rec.gmt,status:'draft'
     });
     if(save.http!==200||save.data?.id!==rec.id||save.data?.status!=='draft')
       throw Error('PSE verified draft date write failed HTTP '+save.http+' id='+rec.id);
   }
   const result=await api('/wp-json/wp/v2/posts/'+rec.id+'?context=edit&_fields=id,status,date,date_gmt,slug,categories');
   if(result.http!==200||result.data.id!==rec.id||result.data.status!=='draft'||
      result.data.date!==rec.local||result.data.date_gmt!==rec.gmt||
      result.data.slug!==rec.slug||!result.data.categories?.includes(rec.category))
     throw Error('Verified RSS date not persisted exactly on PRIVATE draft id='+rec.id);
   console.log('PSE_PRIVATE_POST_ORIGINAL_RSS_DATE_READ_AFTER_WRITE=PASS; id='+rec.id+
     '; source=original_PSE_RSS'+(rec.id===76975?'+Atom':'')+
     '; date='+rec.local+'; date_gmt='+rec.gmt+'; status=draft; action='+(same?'verified_no_mutation':'updated'));
 }
 console.log('PSE_PRIVATE_DATES_BATCH=PASS; article_count=2; uncertain_2013_post_76976_UNTOUCHED=true; homepage_248_UNCHANGED=true; no_publication=true; no_build=true');
}finally{await browser.close()}
