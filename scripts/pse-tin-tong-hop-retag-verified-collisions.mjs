/** EXACT 5 Joomla Tin tong hop posts already exist in WP under shareholder taxonomy.
 * PRECHECK verifies source + exact PDF bytes before any mutation.
 * APPLY only appends parent 1742 + child 1746, preserves every existing taxonomy.
 */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const stateFile='docs/pse-legacy-migration-state.json',state=JSON.parse(await readFile(stateFile,'utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||state.tracker_issue!==3||
   state.backup_verified!==true||process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions')
 throw Error('Unexpected project or checkpoint');
const expected={
 '1247':{wpId:79031,date:'2017-01-10',pdf:'/images/pdf/2017/01/20170110-CV-04_DNB_HDQT-cong-bo-thong-tin-thay-doi-nhan-su.pdf',upload:'/wp-content/uploads/2026/10/pse-legacy-2146378b75f2fba2.pdf'},
 '1172':{wpId:79316,date:'2016-01-18',pdf:'/images/pdf/2016/CBTT-thay-doi-GPKD-lan-thu-11.pdf',upload:'/wp-content/uploads/2026/10/pse-legacy-f26e80775567890a.pdf'},
 '1169':{wpId:79253,date:'2016-01-13',pdf:'/images/pdf/2016/ban-cung-cap-thong-tin-giam-doc-cong-ty-13-01-2016.pdf',upload:'/wp-content/uploads/2026/10/pse-legacy-76450ea583344378.pdf'},
 '1165':{wpId:78260,date:'2016-01-12',pdf:'/images/pdf/2016/thay-doi-uy-vien-hdqt-kiem-giam-doc-cong-ty-11-01-2016.pdf',upload:'/wp-content/uploads/2026/10/pse-legacy-32897d57ab74ae50.pdf'},
 '1157':{wpId:77573,date:'2015-11-23',pdf:null,upload:null}
};
const ids=Object.keys(expected);
const env=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith('WC_URL='));
if(env.length!==1)throw Error('Missing WordPress URL');
const cfg=new URL(env[0].slice(7).replace(/^['"]|['"]$/g,''));
if(cfg.protocol!=='https:'||cfg.username||cfg.password||cfg.port||cfg.search||cfg.hash||!['','/'].includes(cfg.pathname))throw Error('Invalid WordPress URL');
const wp=cfg.origin,src='https://www.pse.vn',mode=process.argv.includes('--apply')?'apply':'preflight';
const out='artifacts/pse-tin-tong-hop-retag';
await mkdir(out,{recursive:true});
const report={schema:'pse-tin-tong-hop-retag-verified-collisions-v1',mode,sourceIds:ids,checked:[],changed:[],already:[],status:'STARTED',errors:[]};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:860}});
const admin=await context.newPage();
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').replace(/\s+/g,' ').trim().toLowerCase();
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const api=(path,method='GET',data,nonce)=>admin.evaluate(async({path,method,data,nonce})=>{
 const r=await fetch(path,{method,credentials:'same-origin',headers:{Accept:'application/json','X-WP-Nonce':nonce,...(data?{'Content-Type':'application/json'}:{})},
  ...(data?{body:JSON.stringify(data)}:{})});
 return {status:r.status,data:await r.json().catch(()=>null)};
},{path,method,data,nonce});
async function pdf(url){
 const response=await context.request.get(url,{timeout:35000,failOnStatusCode:false});
 if(response.status()!==200||!(response.headers()['content-type']||'').toLowerCase().includes('pdf'))
  throw Error('PDF HTTP/type mismatch '+response.status()+' '+new URL(url).pathname);
 const bytes=await response.body();
 if(bytes.length<100||bytes.length>24_000_000||bytes.subarray(0,4).toString('ascii')!=='%PDF')
  throw Error('PDF signature/size unsafe '+new URL(url).pathname);
 return {bytes:bytes.length,hash:sha(bytes)};
}
const doSave=()=>writeFile(stateFile,JSON.stringify(state,null,2)+'\n');
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('Missing WordPress auth');
 const pending=Object.entries(state.articles).filter(([id,v])=>['pending','media'].includes(v.status));
 if(pending.length)throw Error('Migration writer has pending/media records');
 for(const id of ids){
  const r=state.articles[id];
  if(r?.status!=='quarantined'||r.reason!=='WP slug occupied by unrelated or empty content'||
     r.wp_id || !new RegExp('^https://www\\.pse\\.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/'+id+'-[a-z0-9-]+\\.html$').test(r.source_url))
   throw Error('Quarantine record identity changed for '+id);
 }
 await admin.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await admin.locator('#user_login').count()){
  await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const m=(await admin.locator('#loginform').innerText()).slice(0,600).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],b=+m[3],ans=m[2]==='+'?a+b:m[2]==='-'?a-b:a*b;
   const field=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(await field.count())await field.fill(String(ans));}
  await admin.locator('#wp-submit').click();
 }
 await admin.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(admin.url().includes('wp-login')||!await admin.locator('#adminmenu').count())throw Error('WordPress login rejected');
 const nonce=await admin.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Invalid WordPress REST nonce');
 const child=await api('/wp-json/wp/v2/categories?slug=tin-tong-hop&_fields=id,parent,slug', 'GET',undefined,nonce);
 if(child.status!==200||child.data?.length!==1||child.data[0].id!==1746||child.data[0].parent!==1742)throw Error('Unexpected taxonomy IDs');
 for(const id of ids){
  const exp=expected[id],r=state.articles[id];
  const slug=r.source_url.match(/\/\d+-([a-z0-9-]+)\.html$/i)?.[1];
  const page=await context.newPage();
  let sourceData;
  try{
   const res=await page.goto(r.source_url,{waitUntil:'domcontentloaded',timeout:60000});
   if(res?.status()!==200)throw Error('Original source '+id+' unavailable');
   sourceData=await page.evaluate(()=>{
    const root=document.querySelector('[itemprop="articleBody"]');
    return {title:(document.title||'').replace(/\s+-\s+PSE\.VN.*$/i,'').trim(),
      body:(root?.textContent||'').split(/Các bài viết khác/i)[0].replace(/\s+/g,' ').trim(),
      links:[...root?.querySelectorAll('a[href]')||[]].map(a=>new URL(a.getAttribute('href'),location.href).pathname)};
   });
  }finally{await page.close()}
  const got=await api('/wp-json/wp/v2/posts/'+exp.wpId+'?context=edit&_fields=id,slug,status,date,title,content,excerpt,categories', 'GET',undefined,nonce);
  const p=got.data;
  if(got.status!==200||p?.id!==exp.wpId||p.slug!==slug||p.status!=='publish'||
   !p.date?.startsWith(exp.date)||!p.categories?.includes(1744)||p.categories?.includes(1746)||
   p.categories?.includes(1742)||fold(p.title?.raw||p.title?.rendered)!==fold(sourceData.title))
   throw Error('Existing WP article does not match original '+id);
  const content=String(p.content?.raw||''),plain=await admin.evaluate(html=>new DOMParser().parseFromString(html,'text/html').body.textContent||'',content);
  const origBody=fold(sourceData.body),wpBody=fold(plain).replace(/&nbsp;/g,' ');
  if(id==='1157'){
    if(!origBody.includes('thong bao ve viec xet trao hoc bong')||!wpBody.includes('thong bao ve viec xet trao hoc bong')||
       origBody.length<1500||wpBody.length<1500)
     throw Error('Historic scholarship article text parity failed');
  }else if(id==='1165'){
    if(!origBody.includes('thong tu so 155/2015')||!wpBody.includes('thong tu so 155/2015')||
       origBody.length<500||wpBody.length<500)
     throw Error('Historic governance article text parity failed');
  }else if(!origBody.includes('chi tiet xin xem file dinh kem')||!wpBody.includes('chi tiet xin xem file dinh kem'))
   throw Error('Historic PDF-only notice text parity failed '+id);
  let matchedPdf=null;
  if(exp.pdf){
   if(!sourceData.links.includes(exp.pdf)||!content.includes(exp.upload))
    throw Error('PDF path not present in both source and WordPress '+id);
   const original=await pdf(src+exp.pdf),local=await pdf(wp+exp.upload);
   if(original.hash!==local.hash||original.bytes!==local.bytes)
    throw Error('Original and WordPress PDF bytes differ '+id);
   matchedPdf={sha256:original.hash.slice(0,18),bytes:original.bytes};
  }
  report.checked.push({sourceId:id,wpId:p.id,slug,title:sourceData.title,originalCategories:p.categories,pdf:matchedPdf});
  console.log('PSE_COLLISION_SOURCE_BYTES=PASS; source='+id+'; wp='+p.id+'; pdf='+Boolean(matchedPdf)+'; bytes='+String(matchedPdf?.bytes||0));
  if(mode==='preflight')continue;
  const before={date:p.date,status:p.status,slug:p.slug,title:p.title?.raw||p.title?.rendered,content:p.content?.raw,excerpt:p.excerpt?.raw,categories:[...p.categories]};
  const changes=[...new Set([...p.categories,1742,1746])];
  const posted=await api('/wp-json/wp/v2/posts/'+exp.wpId,'POST',{categories:changes},nonce);
  if(posted.status!==200||posted.data?.id!==exp.wpId)throw Error('WP taxonomy POST failed for source '+id+' HTTP '+posted.status);
  const after=await api('/wp-json/wp/v2/posts/'+exp.wpId+'?context=edit&_fields=id,slug,status,date,title,content,excerpt,categories', 'GET',undefined,nonce);
  const a=after.data;
  if(after.status!==200||a?.id!==exp.wpId||a.slug!==before.slug||a.status!==before.status||a.date!==before.date||
   (a.title?.raw||a.title?.rendered)!==before.title||
   a.content?.raw!==before.content||a.excerpt?.raw!==before.excerpt||
   !before.categories.every(x=>a.categories.includes(x))||!a.categories.includes(1742)||!a.categories.includes(1746))
   throw Error('Post-write WordPress content or taxonomy readback differs '+id);
  report.changed.push({sourceId:id,wpId:p.id,beforeCategories:before.categories,afterCategories:a.categories,unchangedContent:true});
  const row=state.articles[id];row.status='existing';row.wp_id=exp.wpId;row.seo_cleaned=true;row.attribution_cleaned=true;row.retag_proof_pdf_sha=matchedPdf?.sha256||null;
  delete row.reason;
  await doSave();
 }
 if(mode==='apply'){
  if(report.changed.length!==ids.length)throw Error('Expected five new taxonomy assignments');
  state.runs=(state.runs||0)+1;await doSave();
 }
 report.status='PASS';
 console.log('PSE_COLLISION_RETAG='+JSON.stringify({status:report.status,mode,verified:report.checked.length,changed:report.changed.length,ids}));
}catch(e){report.status='FAIL';report.errors.push(String(e?.message||e));console.error('PSE_COLLISION_RETAG_ERROR='+report.errors.at(-1));throw e}
finally{await writeFile(out+'/report-'+mode+'.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
