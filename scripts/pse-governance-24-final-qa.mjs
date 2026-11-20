/** Final independent read-only source/WordPress/Astro governance acceptance. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const source=JSON.parse(await readFile('artifacts/pse-governance-source-proof/report.json','utf8'));
const ex1563='2023.07.27: CBTT-BC Tình hình quản trị Công ty 6 tháng đầu năm 2023 và danh sách cổ đông nhà nước, cổ đông lớn - PSE.VN';
if(source.schema!=='pse-governance-24-independent-parity-v1'||source.sourceIds?.length!==24||
 source.cms?.length!==24||source.category?.id!==1759||source.errors?.length)
 throw Error('Verified independent source audit not available');
const baseline=new Map(source.cms.map(x=>[x.id,x]));
const expected=source.sourceIds.filter(id=>id!=='92'),slugs=expected.map(id=>baseline.get(id)?.wp?.slug);
if(expected.length!==23||slugs.some(s=>!s)||baseline.get('92')?.wp?.status!=='draft')
 throw Error('Original source identity changed');
const report={schema:'pse-governance-24-final-read-only-parity-v1',
 source:24,expectedPublished:23,originalSEO:24,seoMatched:0,sourceRanks:expected,
 wordpress:[],desktop:[],mobile:[],metadata:null,errors:[],status:'STARTED'};
const cms='https://admin-pse.webnvn.com',front='https://pse.webnvn.com';
const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1366,height:840}});
const page=await ctx.newPage();let nonce;
try{
 await page.goto(cms+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await page.locator('#loginform').innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],ans=m[2]==='+'?a+ +m[3]:m[2]==='-'?a- +m[3]:a* +m[3];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Admin captcha absent');await f.fill(String(ans))}
  await page.locator('#wp-submit').click();
 }
 await page.goto(cms+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:55000});
 if(!await page.locator('#adminmenu').count())throw Error('Admin auth failed');
 nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Missing WordPress REST nonce');
 const api=path=>page.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json','X-WP-Nonce':nonce}});
  return{http:r.status,total:r.headers.get('x-wp-total'),data:await r.json().catch(()=>null)};
 },{path,nonce});
 const c=await api('/wp-json/wp/v2/categories/1759?_fields=id,slug,parent,count');
 if(c.http!==200||c.data?.id!==1759||c.data.slug!=='tai-lieu-quan-tri-cong-ty'||c.data.parent!==1744||c.data.count!==23)
 throw Error('WordPress governance taxonomy drift');
 const all=await api('/wp-json/wp/v2/posts?categories=1759&per_page=100&status=any&context=edit&_fields=id,slug,status,date,categories');
 if(all.http!==200||Number(all.total)!==24||all.data?.length!==24)throw Error('24 exact WordPress governance records not returned');
 const idsSet=new Set(source.cms.map(r=>r.wpId));
 if(all.data.some(p=>!idsSet.has(p.id))||new Set(all.data.map(p=>p.id)).size!==24)throw Error('WordPress extra/duplicate post detected');
 const rank=await api('/wp-json/pse-governance/v1/original-archive-order');
 if(rank.http!==200||!rank.data?.active||rank.data?.rows?.length!==23)throw Error('Native source order plugin not active');
 if(rank.data.rows.some((r,i)=>r.id!==baseline.get(expected[i]).wpId||r.rank!==i+1))
  throw Error('Rank metadata differs from original Joomla source');
 report.metadata={ranked:rank.data.rows.length,active:true,checksum:rank.data.source_checksum};
 const list=await api('/wp-json/wp/v2/posts?categories=1759&per_page=100&status=publish&context=edit&_fields=id,slug,date');
 if(list.http!==200||list.data?.length!==23||
  list.data.some((p,i)=>p.id!==baseline.get(expected[i]).wpId))
 throw Error('Native WP REST 23-post source order not preserved');
 for(const id of source.sourceIds){
  const sourceRow=baseline.get(id),b=sourceRow.wp,expectedSEO=id==='1563'?ex1563:sourceRow.original?.title;
  if(!expectedSEO||!expectedSEO.endsWith(' - PSE.VN'))throw Error('Missing independently sourced SEO title '+id);
  const r=await api('/wp-json/wp/v2/posts/'+sourceRow.wpId+'?context=edit&_fields=id,status,slug,date,title,content,categories,pse_seo_title,pse_seo_description,acf');
  const p=r.data,html=String(p?.content?.raw||''),assets=[...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(x=>x[1]);
  if(r.http!==200||p?.id!==sourceRow.wpId||p.status!==b.status||p.slug!==b.slug||p.date!==b.date||
    p.title?.raw!==b.title||html.length!==b.htmlLength||!p.categories?.includes(1759)||
    p.acf?.action!=='PostDetails'||p.acf?.key!=='ssr-post')
    throw Error('Post status/date/body/category/ACF changed '+id);
  if(p.pse_seo_title!==expectedSEO||p.pse_seo_description!==b.seoDescription)throw Error('Source SEO title or preserved description differs '+id);
  if(assets.some(x=>/^https?:\/\/(?:www\.)?pse\.vn\/(?:images|media|files)\//i.test(x)))
    throw Error('Old Joomla mandatory media hotlink '+id);
  const files=assets.filter(x=>/\.(?:pdf|docx?|xlsx?|pptx?|zip)(?:\?|#|$)/i.test(x));
  if(files.length!==b.files.length)throw Error('Attachment count changed '+id);
  report.seoMatched++;
  report.wordpress.push({source:id,wpId:p.id,status:p.status,seo:true,files:files.length,date:p.date});
 }
 const f=await ctx.newPage();
 for(const [label,viewport] of [['desktop',{width:1366,height:840}],['mobile',{width:390,height:844}]]){
  await f.setViewportSize(viewport);let seen=[];
  for(const pg of [1,2]){
   const url=front+'/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty'+(pg===2?'/2':'');
   const response=await f.goto(url,{waitUntil:'domcontentloaded',timeout:55000});
   if(response?.status()!==200)throw Error(label+' archive HTTP '+response?.status());
   const o=await f.evaluate(slugs=>({
    title:document.title,
    items:[...new Set([...document.querySelectorAll('main a[href]')].map(a=>{
     let path;try{path=decodeURIComponent(new URL(a.href).pathname)}catch{return null}
     const s=path.split('/').filter(Boolean).at(-1);return slugs.includes(s)?s:null;
    }).filter(Boolean))],
    overflow:document.documentElement.scrollWidth>window.innerWidth+3,
   }),slugs);
   if(o.overflow)throw Error(label+' horizontal overflow page '+pg);
   seen.push(...o.items);
   report[label].push({page:pg,http:200,count:o.items.length,overflow:o.overflow});
  }
  if(seen.length!==23||JSON.stringify(seen)!==JSON.stringify(slugs))
   throw Error(label+' archive source order mismatch');
 }
 await f.close();
 report.status='PASS_24_SOURCE_RECORDS_24_SEO_23_PUBLISHED';
 console.log('PSE_GOV_FINAL='+JSON.stringify({status:report.status,source:24,wp:report.wordpress.length,
  seo:report.seoMatched,published:23,draft:[92],ranked:23,desktop:report.desktop,
  mobile:report.mobile,legacyMediaHotlinks:0,errors:[]}));
}catch(e){report.status='FAIL';report.errors.push(String(e).slice(0,320));console.error('PSE_GOV_FINAL_ERROR='+String(e))}
finally{await mkdir('artifacts/pse-governance-final',{recursive:true});
 await writeFile('artifacts/pse-governance-final/report.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
if(report.status!=='PASS_24_SOURCE_RECORDS_24_SEO_23_PUBLISHED')process.exitCode=1;
