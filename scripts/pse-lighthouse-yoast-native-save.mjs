/** Exact-scoped WordPress native Yoast SEO fields, only seven menu URLs.
 * No frontend code, layout, WordPress content or taxonomy description changes.
 */
import {chromium} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
const env=String(process.env.ENV_FILE||'').split(/\r?\n/)
 .map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL='));
if(env.length!==1)throw Error('Expected unique WP URL');
const u=new URL(env[0].slice(7).replace(/^['"]|['"]$/g,''));
if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||
 !['','/'].includes(u.pathname))throw Error('Invalid WordPress origin');
const termIds=[1763,1761,1762,1764,1766,1765];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}});
const report=[];
mkdirSync('artifacts/pse-yoast-native-save',{recursive:true});
const dump=()=>writeFileSync('artifacts/pse-yoast-native-save/report.json',JSON.stringify(report,null,2)+'\n');
try{
 await page.goto(u.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const text=await page.locator('body').innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
   text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=Number(m[1]),b=Number(m[3]);
   const answer=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error('No arithmetic login field');await field.fill(String(answer));
  }
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WordPress login rejected');
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  if(!r.ok)throw Error('No WP nonce');return (await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error('Invalid REST nonce');
 const get=(path)=>page.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{headers:{'X-WP-Nonce':nonce,'Cache-Control':'no-cache'},
   credentials:'same-origin',cache:'no-store'});
  return {status:r.status,value:await r.json().catch(()=>null)};
 },{path,nonce});
 const terms=await get('/wp-json/wp/v2/product_cat?context=edit&per_page=100&_fields=id,slug,name,description,yoast_head_json');
 if(terms.status!==200||!Array.isArray(terms.value))throw Error('Native product categories unavailable');
 const candidates=termIds.map(id=>terms.value.find(t=>t.id===id));
 if(candidates.some(t=>!t||!t.name||!t.slug||String(t.description||'').trim()||
  String(t.yoast_head_json?.description||'').trim()))
  throw Error('Term identity or original metadata is unexpected; stop all writes');
 const liveTerms=await get('/wp-json/astro/v1/get-product-categories?_esc_preview='+Date.now());
 if(liveTerms.status!==200||!Array.isArray(liveTerms.value))throw Error('Cannot verify current native taxonomy SEO metadata');
 const currentMeta=new Map(liveTerms.value.map(x=>[Number(x.id),String(x.seoDescription||'').trim()]));
 const pageRes=await get('/wp-json/wp/v2/pages/79300?context=edit&_fields=id,slug,title,content,acf,yoast_head_json,status');
 const sourcePage=pageRes.value;
 if(pageRes.status!==200||sourcePage?.slug!=='so-do-to-chuc'||
  sourcePage.acf?.key!=='pse-company-so-do-to-chuc'||sourcePage.acf?.action!=='PublicPage'||
  sourcePage.status!=='publish'||String(sourcePage.yoast_head_json?.description||'').trim())
   throw Error('Organization Page identity/meta diverged');
 const seoRecords=candidates.map(t=>({
  type:'product_cat',id:t.id,name:t.name,slug:t.slug,
  oldTermDescription:t.description,oldYoastDescription:t.yoast_head_json?.description||'',
  next:'Danh mục '+t.name+' tại PVFCCo-PSE. Xem danh sách sản phẩm và thông tin chi tiết được công bố trên website.'
 }));
 seoRecords.push({type:'page',id:79300,slug:'so-do-to-chuc',
  oldYoastDescription:sourcePage.yoast_head_json?.description||'',
  next:'Sơ đồ tổ chức của PVFCCo-PSE: thông tin về cơ cấu tổ chức và bộ máy quản lý của công ty.'});
 if(seoRecords.some(r=>r.next.length<60||r.next.length>160))throw Error('SEO description length invalid');
 writeFileSync('artifacts/pse-yoast-native-save/backup.json',
  JSON.stringify({source:u.origin,created:new Date().toISOString(),
   original:seoRecords.map(r=>({...r,next:undefined}))},null,2)+'\n');
 console.log('PSE_YOAST_NATIVE_PREFLIGHT='+JSON.stringify(seoRecords.map(x=>({
  id:x.id,type:x.type,slug:x.slug,oldMetaLength:String(x.oldYoastDescription||'').length,
  draftDescription:x.next
 }))));
 for(const record of seoRecords){
  // Previous native WP form submission may have succeeded before a runner lost
  // its navigation context. Read exact current metadata before any retry.
  const existing=record.type==='product_cat'?currentMeta.get(record.id)||'':
    String(sourcePage.yoast_head_json?.description||'').trim();
  if(existing===record.next){
   const result={id:record.id,slug:record.slug,type:record.type,status:200,
    expected:record.next,actual:existing,pass:true,alreadySaved:true};
   report.push(result);dump();
   console.log('PSE_YOAST_NATIVE_ALREADY_SAVED='+JSON.stringify({
    id:record.id,slug:record.slug,verified:true}));
   continue;
  }
  if(existing)throw Error('SEO metadata changed unexpectedly for '+record.slug);
  const path=record.type==='product_cat'
   ?'/wp-admin/term.php?taxonomy=product_cat&tag_ID='+record.id+'&post_type=product'
   :'/wp-admin/post.php?post='+record.id+'&action=edit';
  const html=await page.goto(u.origin+path,{waitUntil:'domcontentloaded',timeout:60000});
  if(html?.status()!==200||page.url().includes('wp-login'))throw Error('Editor unavailable '+record.slug);
  const form=record.type==='product_cat'?'#edittag':'#post';
  if(!await page.locator(form).count())throw Error('Native WordPress form absent '+record.slug);
  const editor=page.locator('#yoast-google-preview-description-metabox');
  await editor.waitFor({state:'visible',timeout:20000});
  const original=(await editor.innerText()).trim();
  if(original!=='')throw Error('Yoast editor already has metadata '+record.slug);
  await editor.fill(record.next);
  await editor.press('Tab');
  await page.waitForTimeout(450);
  const current=(await editor.innerText()).trim();
  if(current!==record.next)throw Error('Yoast editor did not preserve exact text '+record.slug);
  // Native WordPress form submission with Yoast React synced hidden values.
  const hidden=page.locator('input[name="wpseo_desc"]');
  if(await hidden.count()){
   const val=await hidden.inputValue();
   if(val!==record.next)throw Error('Yoast hidden field not synced; do not save '+record.slug);
  }
  // Arm the real navigation waiter first to avoid racing the browser redirect.
  const redirect=page.waitForNavigation({waitUntil:'domcontentloaded',timeout:60000});
  if(record.type==='product_cat'){
   // Native WordPress form submit preserves taxonomy nonce and Yoast field hooks.
   try{
    await page.locator('#edittag').evaluate(f=>{
     if(!(f instanceof HTMLFormElement))throw Error('Not a WordPress form');
     f.requestSubmit();
    });
   }catch(error){
    if(!/Execution context was destroyed|navigation/i.test(String(error)))throw error;
   }
  }else{
   const saveButton=page.locator('#publish').first();
   if(!await saveButton.count())throw Error('Native Update button absent '+record.slug);
   await saveButton.click();
  }
  await redirect;
  const verify=record.type==='product_cat'
    ? await get('/wp-json/astro/v1/get-product-categories?_esc_preview='+Date.now())
    : await get('/wp-json/wp/v2/pages/79300?context=edit&_fields=id,slug,yoast_head_json');
  const found=record.type==='product_cat'
   ? (Array.isArray(verify.value)?verify.value.find(t=>Number(t.id)===record.id):null)
   :verify.value;
  const actual=String(record.type==='product_cat'?(found?.seoDescription||''):
   (found?.yoast_head_json?.description||'')).trim();
  report.push({id:record.id,slug:record.slug,type:record.type,status:verify.status,
   expected:record.next,actual,pass:actual===record.next});
  dump();
  console.log('PSE_YOAST_NATIVE_SAVED='+JSON.stringify({id:record.id,slug:record.slug,
   type:record.type,verified:actual===record.next,descriptionLength:actual.length}));
  if(actual!==record.next)throw Error('Read-after-write Yoast SEO field mismatch '+record.slug);
 }
 console.log('PSE_YOAST_NATIVE_COMPLETE='+JSON.stringify({updated:report.length,allVerified:true,
  noLayoutChange:true,noAstroBuild:true}));
}finally{await browser.close()}
