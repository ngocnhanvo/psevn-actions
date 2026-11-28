/** Read-only PSE WordPress Admin search audit. Never POST or modify WordPress. */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const wp='https://admin-pse.webnvn.com';
const manifest=JSON.parse(await readFile('docs/source/pse-tin-tong-hop-four-20261127.json','utf8'));
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions'||manifest.records?.length!==4||
   !process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD) throw Error('Invalid PSE audit identity/credentials');
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1400,height:900},locale:'vi-VN'});
const page=await ctx.newPage();
const report={schema:'pse-four-admin-search-v1',noCmsWrites:true,wp,auth:false,posts:[],searches:[],status:'STARTED'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function visit(path,label){
 let last;
 for(let attempt=1;attempt<=2;attempt++){
  try{
   const res=await page.goto(wp+path,{waitUntil:'domcontentloaded',timeout:65000});
   if(new URL(page.url()).origin!==wp) throw Error('Unexpected admin origin');
   return {http:res?.status()||0,url:page.url()};
  }catch(error){
   last=error;
   const msg=String(error?.message||error);
   console.log('PSE_ADMIN_SEARCH_GET_RETRY='+JSON.stringify({label,attempt,error:msg.slice(0,90)}));
   if(attempt===2||!/Timeout|ECONNRESET|ERR_TIMED_OUT|socket hang up/i.test(msg))throw error;
   await pause(1600);
  }
 }
 throw last;
}
async function restPost(id){
 let last;
 for(let attempt=1;attempt<=2;attempt++){
  try{
   const r=await ctx.request.get(wp+'/wp-json/wp/v2/posts/'+id+'?_fields=id,type,status,slug,title,date,categories,link',
      {timeout:55000,failOnStatusCode:false});
   const payload=await r.json().catch(()=>null);
   if([500,502,503,504,429].includes(r.status())&&attempt===1){await pause(1500);continue}
   return {http:r.status(),data:payload};
  }catch(error){
   last=error;
   if(attempt===2)throw error;
   await pause(1500);
  }
 }
 throw last||Error('REST verification exhausted '+id);
}
function adminRows(){
 return page.evaluate(()=>{
  const rows=[...document.querySelectorAll('#the-list tr[id^="post-"]')];
  return {rows:rows.map(x=>({id:x.id,title:(x.querySelector('.row-title')?.textContent||'').trim()})).slice(0,30),
   noItems:!!document.querySelector('#the-list tr.no-items,.wp-list-table .no-items'),
   heading:(document.querySelector('.wrap h1')?.textContent||'').trim(),
   searchValue:document.querySelector('#post-search-input')?.value||null,
   total:(document.querySelector('.subsubsub')?.textContent||'').replace(/\s+/g,' ').slice(0,150)};
 });
}
try{
 await visit('/wp-admin/','admin-login');
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const challengeText=(await page.locator('#loginform').innerText()).slice(0,1000);
  const match=challengeText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
   challengeText.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(match){
   const [a,b]=[Number(match[1]),Number(match[3])];
   const answer=match[2]==='+'?a+b:match[2]==='-'?a-b:a*b;
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error('Arithmetic challenge has no input');
   await field.fill(String(answer));
  }
  await page.locator('#wp-submit').click({noWaitAfter:true,timeout:90000});
  await page.waitForFunction(() => location.pathname.startsWith('/wp-admin/') && !document.querySelector('#loginform'),null,{timeout:65000});
 }
 await visit('/wp-admin/edit.php?post_type=post','posts-list');
 if(page.url().includes('wp-login')||!await page.locator('#adminmenu').count())
  throw Error('WordPress Admin authentication not verified');
 report.auth=true;
 console.log('PSE_ADMIN_SEARCH_AUTH=PASS');

 const wpIds={1746:83843,1745:83845,1744:83847,1743:83849};
 for(const d of manifest.records){
  const r=await restPost(wpIds[d.joomlaId]);
  const p=r.data;
  const info={joomlaId:d.joomlaId,wpId:wpIds[d.joomlaId],http:r.http,
    type:p?.type,status:p?.status,slug:p?.slug,title:p?.title?.rendered,date:p?.date,
    expectedTitle:d.title,expectedDate:d.publishUp,categories:p?.categories,
    match:p?.id===wpIds[d.joomlaId]&&p?.slug===d.slug&&p?.date===d.publishUp&&p?.status==='publish'};
  report.posts.push(info);
  console.log('PSE_ADMIN_SEARCH_REST_POST='+JSON.stringify(info));
 }
 const focus=manifest.records[0];
 const probes=[
  {label:'full-title',query:focus.title},
  {label:'short-title',query:'Lê Minh Hưng'},
  {label:'distinctive',query:'PETROVIETNAM'},
  {label:'other-post',query:'BÌNH ĐẲNG GIỚI'}
 ];
 for(const test of probes){
  const u=new URL('/wp-admin/edit.php',wp);
  u.searchParams.set('post_type','post');
  u.searchParams.set('post_status','all');
  u.searchParams.set('s',test.query);
  const nav=await visit(u.pathname+u.search,'admin-'+test.label);
  const grid=await adminRows();
  const data={label:test.label,http:nav.http,urlPath:new URL(nav.url).pathname,query:test.query,
   searched: grid.searchValue, noItems:grid.noItems, rows:grid.rows,total: grid.total,
   targetFound:grid.rows.some(x=>x.id==='post-83843'),otherFound:grid.rows.some(x=>x.id==='post-83845')};
  report.searches.push(data);
  console.log('PSE_ADMIN_SEARCH_QUERY='+JSON.stringify(data));
 }
 const exact=report.searches.find(x=>x.label==='full-title');
 const short=report.searches.find(x=>x.label==='short-title');
 const allRestOk=report.posts.every(x=>x.match&&x.type==='post');
 report.diagnosis=!allRestOk?'REST_POST_MISSING_OR_DIFFERENT':
  short?.targetFound&&!exact?.targetFound?'LONG_FULL_TITLE_SEARCH_DOES_NOT_MATCH_WHILE_SHORT_DOES':
  !short?.targetFound?'NATIVE_ADMIN_SEARCH_CANNOT_FIND_POST_WITH_SHORT_KEYWORD':
  'ADMIN_TITLE_SEARCH_MATCHED';
 report.status='PASS';
 console.log('PSE_ADMIN_SEARCH_AUDIT='+JSON.stringify({status:report.status,diagnosis:report.diagnosis,
  allRestOk,fullFound:exact?.targetFound,shortFound:short?.targetFound}));
}catch(e){
 report.status='FAILED';report.error=String(e?.message||e).slice(0,500);
 console.error('PSE_ADMIN_SEARCH_AUDIT_FAILED='+report.error);
 process.exitCode=1;
}finally{
 await mkdir('artifacts',{recursive:true});
 await writeFile('artifacts/pse-four-admin-search.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
