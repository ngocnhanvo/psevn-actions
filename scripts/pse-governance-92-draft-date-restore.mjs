/** Undo unintended WordPress draft-date refresh triggered by a Yoast-only REST update. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const source=JSON.parse(await readFile('artifacts/pse-governance-source-proof/report.json','utf8'));
const audit=JSON.parse(await readFile('artifacts/pse-governance-edge-proof/report.json','utf8'));
const old=source.cms.find(x=>x.id==='92'),edge=audit.rows?.find(x=>x.id==='92');
if(source.schema!=='pse-governance-24-independent-parity-v1'||audit.schema!=='pse-governance-92-1563-state-v1'||
 old?.wpId!==82431||old.wp.status!=='draft'||old.wp.date!=='2026-10-27T21:56:14'||
 edge?.before?.date!==old.wp.date||edge?.after?.status!=='draft'||
 !edge.drift?.date||Object.keys(edge.drift).length!==1||
 edge?.after?.seoTitle!==old.original?.title)throw Error('Exact pre/post draft mutation not independently established');
const expected=old.wp.date,title=old.original.title,updated=edge.after.date;
const result={schema:'pse-governance-draft-92-date-rollback-v1',id:92,wpId:82431,expected,unexpected:updated,status:'STARTED'};
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:800}});
try{
 await page.goto('https://admin-pse.webnvn.com/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await page.locator('#loginform').innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],ans=m[2]==='+'?a+ +m[3]:m[2]==='-'?a- +m[3]:a* +m[3];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('WP challenge missing');await f.fill(String(ans))}
  await page.locator('#wp-submit').click();
 }
 await page.goto('https://admin-pse.webnvn.com/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(!await page.locator('#adminmenu').count())throw Error('Admin auth failed');
 const nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('REST nonce missing');
 const api=(method='GET',body)=>page.evaluate(async({method,body,nonce})=>{
  const r=await fetch('/wp-json/wp/v2/posts/82431?context=edit&_fields=id,slug,status,date,title,content,categories,pse_seo_title,pse_seo_description,acf',
   {method,credentials:'same-origin',headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,data:await r.json().catch(()=>null)};
 },{method,body,nonce});
 const before=await api(),p=before.data;
 if(before.http!==200||p?.id!==82431||p.slug!==old.wp.slug||p.status!=='draft'||
 p.date!==updated||p.pse_seo_title!==title||p.pse_seo_description!==old.wp.seoDescription||
 p.title?.raw!==old.wp.title||p.content?.raw?.length!==old.wp.htmlLength||
 JSON.stringify(p.categories)!==JSON.stringify(old.wp.categories))throw Error('Live draft differs from independently captured 1-field drift');
 const put=await api('POST',{date:expected});
 if(put.http!==200||put.data?.id!==82431)throw Error('WP date rollback HTTP '+put.http);
 const read=await api(),v=read.data;
 if(read.http!==200||v?.date!==expected||v.status!==p.status||v.slug!==p.slug||
 v.pse_seo_title!==title||v.pse_seo_description!==p.pse_seo_description||
 v.title?.raw!==p.title?.raw||v.content?.raw!==p.content?.raw||
 JSON.stringify(v.categories)!==JSON.stringify(p.categories))throw Error('Draft date rollback readback mismatch');
 result.status='PASS_RESTORED_ORIGINAL_WORDPRESS_DRAFT_DATE';
 console.log('PSE_GOV_92_DRAFT_DATE='+JSON.stringify({status:result.status,id:92,dateRestored:true,remainingDraft:true,seoTitleCorrect:true,otherFieldsPreserved:true}));
}catch(e){result.status='FAIL';result.error=String(e).slice(0,250);console.error('PSE_GOV_92_DRAFT_DATE_ERROR='+String(e))}
finally{await mkdir('artifacts/pse-governance-92-rollback',{recursive:true});await writeFile('artifacts/pse-governance-92-rollback/report.json',JSON.stringify(result,null,2)+'\n');await browser.close()}
if(result.status!=='PASS_RESTORED_ORIGINAL_WORDPRESS_DRAFT_DATE')process.exitCode=1;
