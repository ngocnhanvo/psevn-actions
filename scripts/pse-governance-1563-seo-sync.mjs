/** Source-proven title for exact governance Joomla #1563, inspected directly on original page. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const proof=JSON.parse(await readFile('artifacts/pse-governance-source-proof/report.json','utf8'));
const base=proof.cms.find(x=>x.id==='1563');
const title='2023.07.27: CBTT-BC Tình hình quản trị Công ty 6 tháng đầu năm 2023 và danh sách cổ đông nhà nước, cổ đông lớn - PSE.VN';
if(proof.schema!=='pse-governance-24-independent-parity-v1'||proof.sourceIds.length!==24||
 base?.wpId!==77553||base.wp.status!=='publish'||base.wp.seoTitle!==''||
 base.wp.slug!=='20230727-cbtt-bc-tinh-hinh-quan-tri-cong-ty-6-thang-dau-nam-2023-va-danh-sach-co-dong-nha-nuoc-co-dong-lon'||
 base.source!=='https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/1563-'+base.wp.slug+'.html'||
 !base.wp.categories.includes(1759))throw Error('Independent source proof mismatch');
const report={schema:'pse-governance-1563-source-seo-v1',id:'1563',wpId:77553,title,source:base.source,status:'STARTED',errors:[]};
const b=await chromium.launch({headless:true}),page=await b.newPage({viewport:{width:1280,height:800}});
try{
 await page.goto('https://admin-pse.webnvn.com/wp-admin/',{waitUntil:'domcontentloaded',timeout:55000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await page.locator('#loginform').innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],res=m[2]==='+'?a+ +m[3]:m[2]==='-'?a- +m[3]:a* +m[3];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Missing login math challenge');await f.fill(String(res))}
  await page.locator('#wp-submit').click();
 }
 await page.goto('https://admin-pse.webnvn.com/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:55000});
 if(!await page.locator('#adminmenu').count())throw Error('No WordPress administrator authentication');
 const nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('WordPress nonce absent');
 const api=(path,method='GET',body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:'same-origin',headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const path='/wp-json/wp/v2/posts/77553',fields='?context=edit&_fields=id,slug,status,date,title,content,categories,acf,pse_seo_title,pse_seo_description';
 const old=await api(path+fields),p=old.data;
 if(old.http!==200||p?.id!==77553||p.slug!==base.wp.slug||p.status!=='publish'||
 p.date!==base.wp.date||!p.categories.includes(1759)||p.acf?.action!=='PostDetails'||p.acf?.key!=='ssr-post'||
 typeof p.pse_seo_title!=='string'||typeof p.pse_seo_description!=='string')throw Error('Original 1563 post drift');
 report.before=p.pse_seo_title;
 if(p.pse_seo_title!==title){
  if(p.pse_seo_title.trim())throw Error('Refusing nonempty manually authored SEO title');
  const updated=await api(path,'POST',{pse_seo_title:title});
  if(updated.http!==200||updated.data?.id!==77553)throw Error('Yoast SEO update HTTP '+updated.http);
  report.updated=true;
 }else report.updated=false;
 const after=await api(path+fields),q=after.data;
 if(after.http!==200||q.pse_seo_title!==title||q.pse_seo_description!==p.pse_seo_description||
 q.id!==p.id||q.slug!==p.slug||q.date!==p.date||q.status!==p.status||
 JSON.stringify(q.categories)!==JSON.stringify(p.categories)||q.title?.raw!==p.title?.raw||
 q.content?.raw!==p.content?.raw)throw Error('Source title readback or unexpected CMS fields');
 report.status='PASS_SOURCE_TITLE';
 console.log('PSE_GOV_1563_SEO='+JSON.stringify({status:report.status,updated:report.updated,id:1563,wpId:77553,title,sourceVerified:true,descriptionPreserved:true}));
}catch(e){report.status='FAIL';report.errors.push(String(e).slice(0,220));console.error('PSE_GOV_1563_SEO_ERROR='+String(e))}
finally{await mkdir('artifacts/pse-governance-1563-seo',{recursive:true});await writeFile('artifacts/pse-governance-1563-seo/report.json',JSON.stringify(report,null,2)+'\n');await b.close()}
if(report.status!=='PASS_SOURCE_TITLE')process.exitCode=1;
