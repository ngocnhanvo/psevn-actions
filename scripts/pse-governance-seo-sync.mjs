/** Apply only original Joomla <title> to blank WordPress Yoast title fields in governance category. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const source=JSON.parse(await readFile('artifacts/pse-governance-source-proof/report.json','utf8'));
if(source.schema!=='pse-governance-24-independent-parity-v1'||source.sourceIds?.length!==24||
 source.cms?.length!==24||source.category?.id!==1759||source.category?.parent!==1744||
 source.errors?.length||source.cms.filter(x=>x.wp?.status==='publish').length!==23)
 throw Error('Source/cms independent audit has changed');
const rows=source.cms.filter(x=>x.original?.title).map(x=>({
 id:x.id,wpId:x.wpId,slug:x.wp.slug,status:x.wp.status,date:x.wp.date,
 title:x.original.title,oldTitle:x.wp.seoTitle,oldDescription:x.wp.seoDescription,sourceUrl:x.source,
 category:x.wp.categories
}));
if(rows.length!==23||new Set(rows.map(x=>x.wpId)).size!==23||rows.some(x=>
 !Number.isSafeInteger(x.wpId)||x.oldTitle!==''||x.title?.length<12||
 !x.title.endsWith(' - PSE.VN')||!x.category?.includes(1759)||
 !['publish','draft'].includes(x.status)||!x.sourceUrl?.startsWith('https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/')))
 throw Error('Source SEO titles are incomplete or target fields already edited');
const wp='https://admin-pse.webnvn.com';
const result={schema:'pse-governance-original-seo-title-sync-v1',mode:'SOURCE_VERIFIED',sourceTotal:24,
 eligible:rows.length,changed:[],unchanged:[],skipped:[],errors:[],targetDescriptionsPreserved:0};
const b=await chromium.launch({headless:true}),p=await b.newPage({viewport:{width:1280,height:800}});
try{
 await p.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:55000});
 if(await p.locator('#user_login').count()){
  await p.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await p.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await p.locator('#loginform').innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],v=m[2]==='+'?a+ +m[3]:m[2]==='-'?a- +m[3]:a* +m[3];
   const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Login challenge missing');await f.fill(String(v))}
  await p.locator('#wp-submit').click();
 }
 await p.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:50000});
 if(!await p.locator('#adminmenu').count())throw Error('Administrator authentication failed');
 const nonce=await p.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Missing REST nonce');
 const api=(path,method='GET',body)=>p.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:'same-origin',headers:{
   Accept:'application/json','X-WP-Nonce':nonce,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const c=await api('/wp-json/wp/v2/categories/1759?_fields=id,slug,parent,count');
 if(c.http!==200||c.data?.slug!=='tai-lieu-quan-tri-cong-ty'||c.data?.count!==23)
  throw Error('Governance category changed since source audit');
 for(const row of rows){
  const path='/wp-json/wp/v2/posts/'+row.wpId,
   fields='?context=edit&_fields=id,slug,status,date,categories,title,content,pse_seo_title,pse_seo_description,acf';
  try{
   const a=await api(path+fields),v=a.data;
   if(a.http!==200||v?.id!==row.wpId||v.slug!==row.slug||v.status!==row.status||
    v.date!==row.date||!v.categories?.includes(1759)||
    v.acf?.action!=='PostDetails'||v.acf?.key!=='ssr-post'||
    typeof v.pse_seo_title!=='string'||typeof v.pse_seo_description!=='string')
    throw Error('Post identity, date, source category or Yoast REST drift');
   if(v.pse_seo_description)result.targetDescriptionsPreserved++;
   if(v.pse_seo_title===row.title){result.unchanged.push(row.id);continue}
   if(v.pse_seo_title.trim())throw Error('Nonempty independently authored SEO title; refuse overwrite');
   if(v.pse_seo_title!==row.oldTitle)throw Error('SEO field changed since audit');
   const saved=await api(path,'POST',{pse_seo_title:row.title});
   if(saved.http!==200||saved.data?.id!==row.wpId)throw Error('Update HTTP '+saved.http);
   const r=await api(path+fields),n=r.data;
   if(r.http!==200||n?.pse_seo_title!==row.title||n.pse_seo_description!==v.pse_seo_description||
    n.id!==v.id||n.slug!==v.slug||n.status!==v.status||n.date!==v.date||
    JSON.stringify(n.categories)!==JSON.stringify(v.categories)||
    n.title?.raw!==v.title?.raw||n.content?.raw!==v.content?.raw||
    n.acf?.action!==v.acf?.action||n.acf?.key!==v.acf?.key)
    throw Error('Unexpected fields modified or readback mismatched');
   result.changed.push(row.id);
   console.log('PSE_GOV_SEO_TITLE=PASS; source='+row.id+'; wordpress='+row.wpId);
  }catch(e){result.errors.push({sourceId:row.id,wpId:row.wpId,error:String(e).slice(0,210)});
   console.error('PSE_GOV_SEO_TITLE_FAIL='+JSON.stringify(result.errors.at(-1)))}
 }
 result.status=result.errors.length===0&&result.changed.length+result.unchanged.length===rows.length?'PASS_23_VERIFIED_TITLES':'PARTIAL';
 console.log('PSE_GOV_SEO_SYNC='+JSON.stringify({status:result.status,changed:result.changed.length,unchanged:result.unchanged.length,errors:result.errors,unverifiedSource:['1563'],draft:['92'],descriptionsPreserved:result.targetDescriptionsPreserved}));
}catch(e){result.status='FAIL';result.errors.push({error:String(e).slice(0,250)});console.error('PSE_GOV_SEO_FATAL='+String(e))}
finally{await mkdir('artifacts/pse-governance-seo',{recursive:true});
 await writeFile('artifacts/pse-governance-seo/report.json',JSON.stringify(result,null,2)+'\n');await b.close()}
if(result.status!=='PASS_23_VERIFIED_TITLES')process.exitCode=1;
