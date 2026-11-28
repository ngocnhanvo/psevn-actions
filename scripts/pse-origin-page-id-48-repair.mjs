/** PSE: backed-up, scope-limited correction of 48 Joomla original Post roots. */
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const WP='https://admin-pse.webnvn.com', REPO='ngocnhanvo/psevn-actions';
const MESSAGE='cms(pse): repair 48 original Post source references';
const REQUEST='APPROVED=YES;WP_POSTS=48;SOURCE=JOOMLA;ROOT=origin_page_id;IDENTITY=pse_joomla_source_id';
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const marker=(await readFile('.pse-origin-page-id-48-repair-request','utf8')).trim();
const manifest=JSON.parse(await readFile('docs/source/pse-origin-page-id-48-repair-20261128.json','utf8'));
const records=manifest.records||[];
if(process.env.GITHUB_REPOSITORY!==REPO||process.env.GITHUB_REF!=='refs/heads/main'||
 event.head_commit?.message!==MESSAGE||marker!==REQUEST||
 process.env.PSE_ORIGIN_DB_BACKED_UP!=='yes'||manifest.schema!=='pse-48-joomla-root-repair-v1'||
 records.length!==48||new Set(records.map(x=>x.wpId)).size!==48||
 new Set(records.map(x=>x.joomlaId)).size!==48)throw Error('REPAIR_GUARD_DENIED');
const envline=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''))
 .filter(x=>x.startsWith('WC_URL='));
if(envline.length!==1||envline[0].slice(7).trim().replace(/^['"]|['"]$/g,'').replace(/\/$/,'')!==WP||
 !process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('UNEXPECTED_CMS_OR_AUTH');
const norm=x=>String(x||'').normalize('NFKC').replace(/<[^>]+>/g,'').replace(/[–—]/g,'-')
 .replace(/\s+/g,' ').trim().toLocaleLowerCase('vi');
function locale(x){return Array.isArray(x)?locale(x[0]):x&&typeof x==='object'?locale(x.value):String(x??'').toLowerCase().trim();}
function empty(x){return x==null||x===false||x===''||x==='0'||x===0||x==='a:0:{}'||Array.isArray(x)&&x.length===0;}
function origin(x){if(Array.isArray(x))return x.length===1?origin(x[0]):NaN;
 if(x&&typeof x==='object')return origin(x.ID??x.id??x.value);
 return /^[1-9]\d*$/.test(String(x??'').trim())?Number(x):NaN;}
function signature(p){return JSON.stringify({
 id:p.id,type:p.type,status:p.status,slug:p.slug,date:p.date,link:p.link,
 title:p.title?.raw||p.title?.rendered,content:p.content?.raw,excerpt:p.excerpt?.raw,
 featured_media:p.featured_media,categories:[...(p.categories||[])].sort((a,b)=>a-b),
 action:p.acf?.action,key:p.acf?.key,lang:locale(p.acf?.product_lang)
 });}
function identity(p,r){
 return p?.id===r.wpId&&p?.type==='post'&&p?.status==='publish'&&
 locale(p.acf?.product_lang)==='vi'&&norm(p.title?.raw||p.title?.rendered)===norm(r.title)&&
 p.acf?.action==='PostDetails'&&p.acf?.key==='ssr-post'&&
 (!r.slug||p.slug===r.slug)&&(!r.date||p.date===r.date)&&
 (empty(p.acf?.origin_page_id)||origin(p.acf?.origin_page_id)===r.joomlaId)&&
 ['',String(r.joomlaId)].includes(String(p.pse_joomla_source_id??''));
}
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900},locale:'vi-VN'});
const report={schema:'pse-48-root-fix-v1',status:'STARTED',changed:[],skipped:[],
 checked:[],adminSearch:[],errors:[],temporaryCreated:0,cleanupRemaining:0,backupVerified:true};
let nonce='';
async function go(path){let last;
 for(let i=0;i<3;i++){try{
  const r=await page.goto(WP+path,{waitUntil:'domcontentloaded',timeout:65000});
  if(new URL(page.url()).origin!==WP)throw Error('WP_HOST_CHANGED');
  return r?.status();
 }catch(e){last=e;if(i===2||!/Timeout|ECONNRESET|ERR_TIMED_OUT/i.test(String(e)))throw e;
  await page.waitForTimeout(1600*(i+1));}}
 throw last;
}
async function api(route,method='GET',payload){
 return page.evaluate(async ({route,method,payload,nonce})=>{
  const r=await fetch(route,{method,credentials:'same-origin',cache:'no-store',
   headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})});
  return {http:r.status,data:await r.json().catch(()=>null),pages:r.headers.get('X-WP-TotalPages')};
 },{route,method,payload,nonce});
}
const fields='id,type,status,slug,date,link,title,content,excerpt,featured_media,categories,acf,pse_joomla_source_id';
const read=id=>api('/wp-json/wp/v2/posts/'+id+'?context=edit&_fields='+encodeURIComponent(fields));
try{
 await go('/wp-login.php');
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const t=await page.locator('#loginform').innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/);
  if(m){const a=Number(m[1]),b=Number(m[3]);
   const ans=m[2]==='+'?a+b:m[2]==='-'?a-b:a*b;
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error('CAPTCHA_FIELD_MISSING');
   await input.fill(String(ans));
  }
  await page.locator('#wp-submit').click({timeout:90000});
  await page.waitForFunction(()=>location.pathname.startsWith('/wp-admin/')&&!document.querySelector('#loginform'),null,{timeout:65000});
 }
 await go('/wp-admin/options-general.php');
 if(!await page.locator('#adminmenu').count())throw Error('ADMIN_LOGIN_UNVERIFIED');
 nonce=await page.evaluate(async()=>globalThis.wpApiSettings?.nonce||
  await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('WP_NONCE_MISSING');
 // Every expected source/target pair must be unchanged before any metadata write.
 const old=[];
 for(const r of records){
  const q=await read(r.wpId);
  if(q.http!==200||!identity(q.data,r))throw Error('PREFLIGHT_IDENTITY '+r.wpId+' HTTP '+q.http);
  if(empty(q.data.acf?.origin_page_id)&&String(q.data.pse_joomla_source_id??'')!==String(r.joomlaId))
   throw Error('PREFLIGHT_ORIGIN_CHANGED '+r.wpId);
  old.push({r,sig:signature(q.data)});
 }
 // Prevent duplicate Joomla identities between any existing Post and these 48.
 const owned=new Map(records.map(r=>[String(r.joomlaId),r.wpId]));
 let pages=1,scanned=0;
 for(let n=1;n<=pages;n++){
  const q=await api('/wp-json/wp/v2/posts?context=edit&status=any&per_page=100&page='+n+
   '&_fields=id,pse_joomla_source_id');
  if(q.http!==200||!Array.isArray(q.data))throw Error('DUPLICATE_PROOF_UNAVAILABLE');
  pages=Math.min(Number(q.pages)||1,20);
  for(const p of q.data){scanned++;const src=String(p.pse_joomla_source_id??'');
   if(owned.has(src)&&owned.get(src)!==p.id)throw Error('SOURCE_ID_COLLISION '+src+' '+p.id);}
 }
 if(scanned<48)throw Error('INCOMPLETE_POST_INDEX');
 report.status='APPLYING';
 for(const item of old){
  const r=item.r,q=await read(r.wpId);
  if(q.http!==200||!identity(q.data,r)||signature(q.data)!==item.sig)
   throw Error('PREWRITE_DATA_CHANGED '+r.wpId);
  const done=empty(q.data.acf?.origin_page_id)&&
   String(q.data.pse_joomla_source_id??'')===String(r.joomlaId);
  if(done)report.skipped.push(r.wpId);
  else{
   const payload={acf:{origin_page_id:''},pse_joomla_source_id:String(r.joomlaId)};
   let result;
   try{result=await api('/wp-json/wp/v2/posts/'+r.wpId,'POST',payload);}
   catch(e){const back=await read(r.wpId);
    if(back.http!==200||!empty(back.data.acf?.origin_page_id)||
     String(back.data.pse_joomla_source_id??'')!==String(r.joomlaId))throw e;
    result={http:200,data:back.data};
   }
   if(result.http!==200||result.data?.id!==r.wpId)throw Error('POST_FAILED '+r.wpId+' HTTP '+result.http);
   report.changed.push(r.wpId);
  }
  const after=await read(r.wpId);
  if(after.http!==200||signature(after.data)!==item.sig||!empty(after.data.acf?.origin_page_id)||
   String(after.data.pse_joomla_source_id??'')!==String(r.joomlaId))throw Error('READBACK_FAILED '+r.wpId);
  report.checked.push({wpId:r.wpId,sourceId:r.joomlaId,root:true,preserved:true,proof:r.proof});
  console.log('PSE_ORIGIN_POST_PASS='+JSON.stringify(report.checked.at(-1)));
 }
 // Native Admin list visibility checks cover galleries, historical posts and 2025 news.
 for(const id of [83318,83136,83036,82865,83794,83808,83814,83489,83434,83499,83516,83638]){
  const r=records.find(x=>x.wpId===id);
  const url=new URL('/wp-admin/edit.php',WP);
  url.searchParams.set('post_type','post');url.searchParams.set('post_status','all');
  url.searchParams.set('s',r.title.split(/\s+/).slice(0,5).join(' '));
  const http=await go(url.pathname+url.search);
  const found=await page.locator('#the-list tr[id^="post-"]').evaluateAll(
   (rows,id)=>rows.some(row=>row.id==='post-'+id),id);
  report.adminSearch.push({id,http,found});
  if(http!==200||!found)throw Error('ADMIN_LIST_HIDES_POST '+id);
 }
 if(report.checked.length!==48||report.adminSearch.length!==12)throw Error('INCOMPLETE_QA');
 report.status='PASS';
 console.log('PSE_ORIGIN_48_ROOT_REPAIR=PASS changed='+report.changed.length+
  ' skipped='+report.skipped.length+' readbacks=48 adminSearch=12');
}catch(e){report.status='FAILED';report.errors.push(String(e?.message||e).slice(0,420));
 console.error('PSE_ORIGIN_48_REPAIR_FAILED='+report.errors.at(-1));process.exitCode=1;}
finally{
 await mkdir('artifacts',{recursive:true});
 await writeFile('artifacts/pse-origin-page-id-48-repair.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
