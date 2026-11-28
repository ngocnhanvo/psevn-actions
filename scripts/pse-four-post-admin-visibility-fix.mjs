/** Guarded WordPress metadata repair. Only four known Joomla originals, no media/HTML/date edits. */
import { chromium } from 'playwright';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
const repo='ngocnhanvo/psevn-actions';
const path='.pse-four-post-admin-visibility-apply-request';
const expectedMarker='FIX=OWNER_APPROVED;POSTS=83843,83845,83847,83849;FIELD=origin_page_id;SOURCE=JOOMLA_101';
const expectedMessage='cms(pse): restore four imported Posts to native Admin list';
const marker=(await readFile(path,'utf8')).trim();
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const manifest=JSON.parse(await readFile('docs/source/pse-tin-tong-hop-four-20261127.json','utf8'));
if(marker!==expectedMarker||event.head_commit?.message!==expectedMessage||
 process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=='refs/heads/main'||
 process.env.PSE_TTH_VERIFIED_DB_BACKUP!=='yes'||manifest.records?.length!==4)
 throw Error('WordPress metadata repair scope not authorized or database not backed up');
const wp='https://admin-pse.webnvn.com';
const ids={1746:83843,1745:83845,1744:83847,1743:83849};
if(Object.keys(ids).join(',')!=='1743,1744,1745,1746'||manifest.records.some(x=>!ids[x.joomlaId]))
 throw Error('Joomla manifest source identity changed');
const rawEnv=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim());
const wcLine=rawEnv.find(x=>x.startsWith('WC_URL='));
const realWC=wcLine?.slice('WC_URL='.length).trim().replace(/^["']|["']$/g,'');
if(realWC!==wp||!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
 throw Error('Unexpected WordPress environment or missing credentials');
const norm=x=>String(x||'').normalize('NFKC').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim().toLocaleLowerCase('vi');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900},locale:'vi-VN'});
const page=await context.newPage();
const report={schema:'pse-four-joomla-root-post-repair-v1',changed:[],skipped:[],verified:[],searches:[],status:'STARTED',
 scope:Object.entries(ids).map(([source,wordpress])=>({source:Number(source),wordpress})),backupVerified:true};
let nonce='';
async function visit(relative,label){
 let error;
 for(let i=1;i<=3;i++){
  try{
   const r=await page.goto(wp+relative,{waitUntil:'domcontentloaded',timeout:65000});
   if(new URL(page.url()).origin!==wp)throw Error('Unexpected host for '+label);
   return {status:r?.status()||0,url:page.url()};
  }catch(e){
   error=e;
   if(i===3||!/Timeout|ECONNRESET|ERR_TIMED_OUT|socket hang up/i.test(String(e)))throw e;
   await page.waitForTimeout(i*1500);
  }
 }
 throw error;
}
async function api(relative,method='GET',data){
 return page.evaluate(async ({relative,method,data,nonce})=>{
  const response=await fetch(relative,{method,credentials:'same-origin',cache:'no-store',
   headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  const payload=await response.json().catch(()=>null);
  return {status:response.status,data:payload};
 },{relative,method,data,nonce});
}
async function read(id){
 return api('/wp-json/wp/v2/posts/'+id+
  '?context=edit&_fields=id,type,status,slug,title,date,categories,acf,content,excerpt,featured_media');
}
function essential(post){
 return JSON.stringify({id:post.id,slug:post.slug,status:post.status,
  date:post.date,title:post.title?.raw||post.title?.rendered,
  content:post.content?.raw,excerpt:post.excerpt?.raw,
  categories:[...(post.categories||[])].sort((a,b)=>a-b),featured_media:post.featured_media,
  action:post.acf?.action,key:post.acf?.key});
}
try{
 await visit('/wp-login.php','login');
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const text=await page.locator('#loginform').innerText();
  const match=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/)||
   text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/);
  if(match){
   const a=Number(match[1]),b=Number(match[3]);
   const v=match[2]==='+'?a+b:match[2]==='-'?a-b:a*b;
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error('Arithmetic challenge but no input');
   await field.fill(String(v));
  }
  await page.locator('#wp-submit').click({noWaitAfter:true,timeout:90000});
  await page.waitForFunction(()=>location.pathname.startsWith('/wp-admin/')&&!document.querySelector('#loginform'),null,{timeout:65000});
 }
 await visit('/wp-admin/options-general.php','settings-auth');
 if(!await page.locator('#adminmenu').count()||page.url().includes('wp-login'))
  throw Error('Authenticated editor session not confirmed');
 nonce=await page.evaluate(async()=>globalThis.wpApiSettings?.nonce||
  await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Protected WordPress REST nonce missing');
 const verified=[];
 // Verify all four BEFORE the first write. No other IDs/types/categories can pass.
 for(const row of manifest.records){
  const expectedId=ids[row.joomlaId], result=await read(expectedId),p=result.data;
  const original=String(p?.acf?.origin_page_id??'');
  if(result.status!==200||p?.id!==expectedId||p?.type!=='post'||p?.status!=='publish'||
   p?.slug!==row.slug||p?.date!==row.publishUp||
   !p?.categories?.includes(1742)||!p?.categories?.includes(1746)||
   norm(p?.title?.raw||p?.title?.rendered)!==norm(row.title)||
   p?.acf?.action!=='PostDetails'||p?.acf?.key!=='ssr-post'||
   (original!==''&&original!==String(row.joomlaId)))
   throw Error('POST_IDENTITY_OR_SOURCE_METADATA_MISMATCH '+row.joomlaId+' WP '+expectedId);
  verified.push({row,id:expectedId,before:p,original,signature:essential(p)});
  console.log('PSE_ADMIN_ROOT_PRECHECK='+JSON.stringify({joomlaId:row.joomlaId,wpId:expectedId,
   status:p.status,origin:original,date:p.date,backup:true}));
 }
 if(verified.length!==4)throw Error('Four-post preflight incomplete');
 report.status='APPLYING';
 for(const item of verified){
  if(item.original===''){
   report.skipped.push(item.id);
  }else{
   const updated=await api('/wp-json/wp/v2/posts/'+item.id,'POST',{acf:{origin_page_id:''}});
   if(updated.status!==200||Number(updated.data?.id)!==item.id)
    throw Error('ACF_ROOT_CLEAR_HTTP_FAILED '+item.id+' '+updated.status);
   report.changed.push(item.id);
  }
  const after=await read(item.id);
  if(after.status!==200||after.data?.id!==item.id||
   String(after.data?.acf?.origin_page_id??'')!==''||
   essential(after.data)!==item.signature)
   throw Error('POST_METADATA_READBACK_OR_DATA_PARITY_FAILED '+item.id);
  report.verified.push({joomlaId:item.row.joomlaId,wpId:item.id,originPageId:'',
   preservedContentDateStatusTaxonomy:true});
  console.log('PSE_ADMIN_ROOT_POST_PASS='+JSON.stringify(report.verified.at(-1)));
 }
 // Independent native WordPress Admin list acceptance, not just REST readback.
 for(const [id,query] of [[83843,'Thủ tướng Lê Minh Hưng'],[83845,'HƯỞNG ỨNG THÁNG HÀNH ĐỘNG'],[83847,'THAY AVATAR'],[83849,'TỰ HÀO 65 NĂM']]){
  const url=new URL('/wp-admin/edit.php',wp);url.searchParams.set('post_type','post');
  url.searchParams.set('post_status','all');url.searchParams.set('s',query);
  const response=await visit(url.pathname+url.search,'admin-search-'+id);
  const rows=await page.evaluate(()=>[...document.querySelectorAll('#the-list tr[id^="post-"]')].map(x=>x.id));
  const found=rows.includes('post-'+id);
  report.searches.push({wpId:id,query,http:response.status,found});
  console.log('PSE_ADMIN_ROOT_SEARCH='+JSON.stringify(report.searches.at(-1)));
  if(response.status!==200||!found)throw Error('NATIVE_ADMIN_LIST_SEARCH_STILL_HIDES_POST '+id);
 }
 report.status='PASS';
 console.log('PSE_ADMIN_ROOT_VISIBILITY=PASS changed='+report.changed.length+
  ' unchanged='+report.skipped.length+' verified=4');
}catch(error){
 report.status='FAILED';report.error=String(error?.message||error).slice(0,450);
 console.error('PSE_ADMIN_ROOT_VISIBILITY_FAILED='+report.error);process.exitCode=1;
}finally{
 await mkdir('artifacts',{recursive:true});
 await writeFile('artifacts/pse-four-admin-visibility-fix.json',JSON.stringify(report,null,2)+'\n');
 await context.close();await browser.close();
}
