/** Four-post, backup-guarded Joomla source ID repair. Never writes translation-parent metadata. */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const repo='ngocnhanvo/psevn-actions',wp='https://admin-pse.webnvn.com';
const expected='SOURCE_IDS=1746,1745,1744,1743;WP_IDS=83843,83845,83847,83849;FIELD=pse_joomla_source_id;APPROVED=YES';
const marker=(await readFile('.pse-four-joomla-source-id-request','utf8')).trim();
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const manifest=JSON.parse(await readFile('docs/source/pse-tin-tong-hop-four-20261127.json','utf8'));
const ids={1746:83843,1745:83845,1744:83847,1743:83849};
if(marker!==expected||event.head_commit?.message!=='cms(pse): preserve Joomla IDs without hiding native Posts'||
 process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=='refs/heads/main'||
 process.env.PSE_TTH_VERIFIED_DB_BACKUP!=='yes'||manifest.records?.length!==4||
 manifest.records.map(x=>x.joomlaId).join(',')!=='1746,1745,1744,1743')
 throw Error('Unauthorized Joomla source metadata repair');
const line=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'')).find(x=>x.startsWith('WC_URL='));
if(line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'')!==wp||
 !process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
 throw Error('Unexpected WordPress tenant or missing authorized credentials');
const norm=s=>String(s||'').normalize('NFKC').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim().toLocaleLowerCase('vi');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const page=await context.newPage();
let nonce='';
const report={schema:'pse-joomla-source-id-repair-4-v1',backupVerified:true,status:'STARTED',changed:[],skipped:[],verified:[],adminSearch:[],noExtraPostWrites:true};
async function visit(route){
 let last;
 for(let i=1;i<=3;i++){
  try{
   const response=await page.goto(wp+route,{waitUntil:'domcontentloaded',timeout:65000});
   if(new URL(page.url()).origin!==wp)throw Error('Unexpected host redirect');
   return response?.status();
  }catch(e){
   last=e;
   if(i===3||!/Timeout|ERR_TIMED_OUT|ECONNRESET|socket hang up/i.test(String(e)))throw e;
   await page.waitForTimeout(i*1500);
  }
 }
 throw last;
}
async function api(route,method='GET',data){
 return page.evaluate(async ({route,method,data,nonce})=>{
  const response=await fetch(route,{method,credentials:'same-origin',cache:'no-store',
   headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {status:response.status,data:await response.json().catch(()=>null)};
 },{route,method,data,nonce});
}
const read=id=>api('/wp-json/wp/v2/posts/'+id+'?context=edit&_fields=id,type,status,slug,date,title,excerpt,content,featured_media,categories,acf,pse_joomla_source_id,pse_joomla_source_title');
const immutable=p=>JSON.stringify({
 id:p.id,type:p.type,slug:p.slug,date:p.date,status:p.status,
 title:p.title?.raw||p.title?.rendered,excerpt:p.excerpt?.raw,content:p.content?.raw,
 categories:[...(p.categories||[])].sort((a,b)=>a-b),featuredMedia:p.featured_media,
 action:p.acf?.action,key:p.acf?.key,translationOrigin:p.acf?.origin_page_id
});
try{
 await visit('/wp-login.php');
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const form=await page.locator('#loginform').innerText();
  const match=form.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/)||
   form.match(/(\d+)\s*([+\-x×*])\s*(\d+)/);
  if(match){
   const a=Number(match[1]),b=Number(match[3]);
   const value=match[2]==='+'?a+b:match[2]==='-'?a-b:a*b;
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error('Arithmetic captcha field missing');
   await field.fill(String(value));
  }
  await page.locator('#wp-submit').click({noWaitAfter:true,timeout:90000});
  await page.waitForFunction(()=>location.pathname.startsWith('/wp-admin/')&&!document.querySelector('#loginform'),null,{timeout:65000});
 }
 await visit('/wp-admin/options-general.php');
 if(!await page.locator('#adminmenu').count()||page.url().includes('wp-login'))
  throw Error('WordPress editor not authenticated');
 nonce=await page.evaluate(async()=>globalThis.wpApiSettings?.nonce||
  await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('WordPress nonce missing');
 const eligible=[];
 for(const row of manifest.records){
  const id=ids[row.joomlaId],res=await read(id),p=res.data;
  if(res.status!==200||p?.id!==id||p?.type!=='post'||p?.status!=='publish'||
     p?.slug!==row.slug||p?.date!==row.publishUp||
     !p?.categories?.includes(1742)||!p?.categories?.includes(1746)||
     p?.acf?.action!=='PostDetails'||p?.acf?.key!=='ssr-post'||
     norm(p?.title?.raw||p?.title?.rendered)!==norm(row.title)||
     !['','0'].includes(String(p?.acf?.origin_page_id??''))||
     !['',String(row.joomlaId)].includes(String(p?.pse_joomla_source_id??'')))
   throw Error('FOUR_POST_PRECHECK_FAILED '+row.joomlaId+' '+id);
  eligible.push({id,row,signature:immutable(p),oldSource:String(p.pse_joomla_source_id||'')});
  console.log('PSE_JOOMLA_SOURCE_PRECHECK='+JSON.stringify({joomlaId:row.joomlaId,wpId:id,sourceBefore:p.pse_joomla_source_id,date:p.date}));
 }
 for(const item of eligible){
  if(item.oldSource===String(item.row.joomlaId)){
   report.skipped.push(item.id);
  }else{
   let result;
   try{
    result=await api('/wp-json/wp/v2/posts/'+item.id,'POST',{pse_joomla_source_id:String(item.row.joomlaId)});
   }catch(error){
    // A lost POST response can still mean a committed change; read back before any retry.
    const recovered=await read(item.id);
    if(recovered.status!==200||String(recovered.data?.pse_joomla_source_id)!==String(item.row.joomlaId))throw error;
    result={status:200,data:recovered.data};
   }
   if(result.status!==200||result.data?.id!==item.id)
    throw Error('SOURCE_ID_REST_WRITE_FAILED '+item.id+' HTTP '+result.status);
   report.changed.push(item.id);
  }
  const readback=await read(item.id),p=readback.data;
  if(readback.status!==200||p?.id!==item.id||immutable(p)!==item.signature||
   String(p?.pse_joomla_source_id)!==String(item.row.joomlaId)||
   norm(p?.pse_joomla_source_title)!==norm(item.row.title))
   throw Error('SOURCE_ID_AND_CONTENT_READBACK_FAILED '+item.id+' '+JSON.stringify({
     source:p?.pse_joomla_source_id,title:p?.pse_joomla_source_title?.slice(0,80)}));
  report.verified.push({joomlaId:item.row.joomlaId,wordpressId:item.id,sourceId:p.pse_joomla_source_id,
   sourceTitleCorrect:true,contentAndDatesUnchanged:true});
  console.log('PSE_JOOMLA_SOURCE_POST_PASS='+JSON.stringify(report.verified.at(-1)));
 }
 for(const [id,search] of [[83843,'Thủ tướng Lê Minh Hưng'],[83845,'THÁNG HÀNH ĐỘNG VÌ BÌNH ĐẲNG GIỚI NĂM 2026'],[83847,'THAY AVATAR'],[83849,'TỰ HÀO 65 NĂM']]){
  const url=new URL('/wp-admin/edit.php',wp);
  url.searchParams.set('post_type','post');url.searchParams.set('s',search);
  const status=await visit(url.pathname+url.search);
  const visible=(await page.locator('#the-list tr[id^="post-"]').evaluateAll(rows=>rows.map(x=>x.id))).includes('post-'+id);
  report.adminSearch.push({id,visible,status});
  if(status!==200||!visible)throw Error('NATIVE_ADMIN_VISIBILITY_REGRESSION '+id);
 }
 report.status='PASS';
 console.log('PSE_FOUR_JOOMLA_SOURCE_AND_ADMIN=PASS changed='+report.changed.length+
  ' skipped='+report.skipped.length+' exactSourceTitles=4 adminSearch=4');
}catch(error){
 report.status='FAILED';report.error=String(error?.message||error).slice(0,500);
 console.error('PSE_FOUR_JOOMLA_SOURCE_AND_ADMIN_FAILED='+report.error);
 process.exitCode=1;
}finally{
 await mkdir('artifacts',{recursive:true});
 await writeFile('artifacts/pse-four-joomla-source-id.json',JSON.stringify(report,null,2)+'\n');
 await context.close();await browser.close();
}
