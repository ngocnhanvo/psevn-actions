/** Sync 15 WordPress Yoast title fields from independently verified Joomla <title>.
 * Does NOT create, publish, delete, or alter article text/media/date/category.
 * Fresh authenticated DB backup must be available, and pre-change state is saved as an artifact.
 */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const proof=JSON.parse(await readFile('artifacts/pse-annual-proof/report.json','utf8'));
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||state.backup_verified!==true||
 proof.schema!=='pse-annual-parity-v1'||proof.sourceCount!==18||
 proof.original.flatMap(x=>x.ids||[]).length!==18||
 proof.cmsCategory?.id!==1758||proof.cmsCategory?.slug!=='bao-cao-thuong-nien'||
 proof.cmsList.length!==15||proof.cms.length!==18||
 proof.cms.filter(x=>x.wp.status==='publish').length!==15)
 throw Error('Original and destination evidence not in expected baseline');
const rows=proof.cms.filter(x=>x.wp.status==='publish');
if(rows.length!==15||new Set(rows.map(x=>x.wp.id)).size!==15||
 rows.some(x=>!Number.isSafeInteger(x.wp.id)||x.checkpoint.wp_id!==x.wp.id||
 !x.source?.title?.endsWith(' - PSE.VN')||x.source?.metaDescription!==null||
 x.wp.seoTitle!==''||!x.wp.categories?.includes(1758)||x.gaps.join(',')!=='SEO_TITLE_MISSING'))
 throw Error('Some annual articles no longer meet exact audited SEO source-only write scope');
const event=process.env.GITHUB_EVENT_PATH?JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8')):{};
const apply=event.head_commit?.message==='Đồng bộ 15 SEO title thường niên đã kiểm chứng';
const browser=await chromium.launch({headless:true});
const p=await browser.newPage({viewport:{width:1280,height:840}});
const result={schema:'pse-annual-15-seo-source-sync-v1',mode:apply?'APPLY':'DRY_RUN',sourceCount:18,eligible:15,changed:[],unchanged:[],rows:[],errors:[],cmsBackupVerified:true};
const wp='https://admin-pse.webnvn.com';
try{
 await p.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:65000});
 if(await p.locator('#user_login').count()){
  await p.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await p.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const txt=await p.locator('#loginform').innerText(),m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],b=+m[3],ans=m[2]==='+'?a+b:m[2]==='-'?a-b:a*b;
   const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Login challenge missing');await f.fill(String(ans))}
  await p.locator('#wp-submit').click();
 }
 await p.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(!await p.locator('#adminmenu').count())throw Error('Not authenticated on WordPress admin');
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  if(!r.ok)throw Error('No REST nonce');return(await r.text()).trim()});
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Invalid nonce');
 const api=(path,method='GET',body)=>p.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:'same-origin',headers:{Accept:'application/json','X-WP-Nonce':nonce,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const cat=await api('/wp-json/wp/v2/categories/1758?_fields=id,slug,count,parent');
 if(cat.http!==200||cat.data?.count!==15||cat.data?.slug!=='bao-cao-thuong-nien')throw Error('Category drift');
 for(const x of rows){
  const id=x.wp.id,slug=x.wp.slug,title=x.source.title;
  const path='/wp-json/wp/v2/posts/'+id;
  const fields='?context=edit&_fields=id,slug,status,categories,date,title,pse_seo_title,pse_seo_description,acf';
  const before=await api(path+fields),v=before.data;
  if(before.http!==200||v?.id!==id||v.slug!==slug||v.status!=='publish'||
   !v.categories?.includes(1758)||v.acf?.action!=='PostDetails'||v.acf?.key!=='ssr-post'||
   typeof v.pse_seo_title!=='string'||typeof v.pse_seo_description!=='string')
   throw Error('WordPress identity/SEO field mismatch '+id);
  const row={id,sourceId:x.id,slug,oldTitle:v.pse_seo_title,targetTitle:title,oldDescription:v.pse_seo_description,
    originalDate:v.date,status:v.status,categories:v.categories};
  result.rows.push(row);
  if(v.pse_seo_title===title){result.unchanged.push(id);continue}
  if(v.pse_seo_title.trim())throw Error('Refusing to overwrite nonempty Yoast title '+id);
  if(!apply)continue;
  const up=await api(path,'POST',{pse_seo_title:title});
  if(up.http!==200||up.data?.id!==id)throw Error('SEO title update failed '+id+' HTTP '+up.http);
  const after=await api(path+fields),t=after.data;
  if(after.http!==200||t?.pse_seo_title!==title||t.pse_seo_description!==v.pse_seo_description||
   t.id!==v.id||t.slug!==v.slug||t.status!==v.status||t.date!==v.date||
   JSON.stringify(t.categories)!==JSON.stringify(v.categories)||
   t.acf?.action!==v.acf.action||t.acf?.key!==v.acf.key)
   throw Error('SEO title read-after-write invariant failed '+id);
  result.changed.push(id);
  console.log('PSE_ANNUAL_SEO_WRITTEN='+JSON.stringify({sourceId:x.id,wpId:id,readback:'PASS'}));
 }
 result.status=apply?(result.changed.length+result.unchanged.length===15?'PASS':'PARTIAL'):
  result.rows.length===15?'READY':'PARTIAL';
 console.log('PSE_ANNUAL_SEO='+JSON.stringify({status:result.status,mode:result.mode,eligible:15,changed:result.changed.length,already:result.unchanged.length,errors:result.errors}));
}finally{
 await mkdir('artifacts/pse-annual-seo',{recursive:true});
 await writeFile('artifacts/pse-annual-seo/report.json',JSON.stringify(result,null,2)+'\n');
 await browser.close();
}
