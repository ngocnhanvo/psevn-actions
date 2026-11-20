/** Diagnose only two PSE governance SEO edge records after bounded backup/write. READ ONLY. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const proof=JSON.parse(await readFile('artifacts/pse-governance-source-proof/report.json','utf8'));
if(proof.schema!=='pse-governance-24-independent-parity-v1'||proof.sourceIds?.length!==24)throw Error('Provenance audit absent');
const wp='https://admin-pse.webnvn.com';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:860}});
const report={mode:'READ_ONLY',schema:'pse-governance-92-1563-state-v1',rows:[],errors:[]};
try{
 await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await page.locator('#loginform').innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],ans=m[2]==='+'?a+ +m[3]:m[2]==='-'?a- +m[3]:a* +m[3];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Challenge missing');await f.fill(String(ans))}
  await page.locator('#wp-submit').click();
 }
 await page.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:55000});
 if(!await page.locator('#adminmenu').count())throw Error('Admin login absent');
 const nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Nonce unavailable');
 for(const id of ['92','1563']){
  const before=proof.cms.find(x=>x.id===id);
  if(!before?.wp||![82431,77553].includes(before.wpId))throw Error('Unexpected post id '+id);
  const path='/wp-json/wp/v2/posts/'+before.wpId+'?context=edit&_fields=id,status,slug,date,date_gmt,modified,modified_gmt,title,content,excerpt,categories,acf,pse_seo_title,pse_seo_description';
  const r=await page.evaluate(async({path,nonce})=>{
   const x=await fetch(path,{credentials:'same-origin',headers:{'X-WP-Nonce':nonce,Accept:'application/json'}});
   return{http:x.status,data:await x.json().catch(()=>null)};
  },{path,nonce});
  if(r.http!==200)throw Error('WP post '+id+' HTTP '+r.http);
  const p=r.data,html=String(p.content?.raw||'');
  const record={id,wpId:p.id,sourceUrl:before.source,titleSource:before.original?.title||null,
   sourceTitleVerified:!!before.original?.title,
   before:{slug:before.wp.slug,status:before.wp.status,date:before.wp.date,htmlLength:before.wp.htmlLength,seoTitle:before.wp.seoTitle,
    seoDescription:before.wp.seoDescription,categories:before.wp.categories,title:before.wp.title,
    images:before.wp.images,files:before.wp.files},
   after:{slug:p.slug,status:p.status,date:p.date,dateGmt:p.date_gmt,modified:p.modified,title:p.title?.raw,
    htmlLength:html.length,seoTitle:p.pse_seo_title,seoDescription:p.pse_seo_description,
    categories:p.categories,images:(html.match(/<img\b/gi)||[]).length,
    files:[...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(m=>m[1]).filter(x=>/\.(?:pdf|docx?|xlsx?|pptx?|zip)(?:\?|#|$)/i.test(x)),
    acf:p.acf},
   drift:{}};
  for(const field of ['slug','status','date','htmlLength','seoDescription','categories','title','images','files']){
   if(JSON.stringify(record.before[field])!==JSON.stringify(record.after[field]))record.drift[field]={old:record.before[field],new:record.after[field]};
  }
  report.rows.push(record);console.log('PSE_GOV_EDGE='+JSON.stringify(record));
 }
}catch(e){report.errors.push(String(e));console.error('PSE_GOV_EDGE_ERROR='+String(e))}
finally{await mkdir('artifacts/pse-governance-edge',{recursive:true});
 await writeFile('artifacts/pse-governance-edge/report.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
if(report.errors.length)process.exitCode=1;
