/** Publish exactly Joomla governance ID 92 with independently verified RSS+Atom timestamp,
 * then write the exact 24-rank Joomla archive order. No Astro build.
 */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const proof=JSON.parse(await readFile('artifacts/pse-governance-source-proof/report.json','utf8'));
const feed=JSON.parse(await readFile('artifacts/pse-governance-feed-proof/report.json','utf8'));
if(proof.schema!=='pse-governance-24-independent-parity-v1'||proof.sourceIds?.length!==24||
 proof.cms?.length!==24||proof.category?.id!==1759||feed.schema!=='pse-governance-92-feed-metadata-v1'||
 feed.readOnly!==true||proof.errors?.length)throw Error('Exact independent source proof missing');
const original=new Map(proof.cms.map(x=>[x.id,x])),draft=original.get('92');
const exactSource='https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/92-dieu-le-cong-ty-co-phan-phan-bon-va-hoa-chat-dau-khi-dong-nam-bo.html';
const title='Điều lệ công ty Cổ phần Phân bón và Hóa chất dầu khí Đông Nam Bộ';
if(draft?.source!==exactSource||draft.wpId!==82431||draft.wp.status!=='draft'||
 draft.wp.date!=='2026-10-27T21:56:14'||draft.wp.slug!=='dieu-le-cong-ty-co-phan-phan-bon-va-hoa-chat-dau-khi-dong-nam-bo'||
 draft.original?.title!==title+' - PSE.VN'||!draft.wp.categories.includes(1759))throw Error('Source 92/WP draft baseline mismatch');
const feeds=feed.feeds.filter(x=>x.http===200&&x.isXML===true&&x.itemCount===1&&
 x.url.startsWith('https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty.html?start=25&format=feed&type=')&&
 x.matched?.length===1&&x.matched[0].id==='92'&&x.matched[0].link===exactSource&&x.matched[0].title===title);
const rss=feeds.find(x=>x.type.startsWith('application/rss+xml'))?.matched[0];
const atom=feeds.find(x=>x.type.startsWith('application/atom+xml'))?.matched[0];
if(!rss?.pubDate||!atom?.published||atom.updated!==atom.published||new Date(rss.pubDate).getTime()!==new Date(atom.published).getTime()||
 new Date(atom.published).toISOString()!=='2011-06-19T18:52:44.000Z')
 throw Error('RSS and Atom timestamp / exact Joomla identity not independently corroborated');
const date='2011-06-20T01:52:44',dateGmt='2011-06-19T18:52:44';
const rows=proof.sourceIds.map(id=>{
 const p=original.get(id);
 if(!p?.wp||!Number.isSafeInteger(p.wpId)||!p.wp.slug||!p.wp.categories.includes(1759))throw Error('Incomplete 24 source-to-WP mapping '+id);
 return{id:p.wpId,slug:p.wp.slug,source:id};
});
const names=rows.map(x=>x.slug),sourceOrder=rows.map(x=>x.source);
const checksum=createHash('sha256').update(JSON.stringify({source:proof.sourceIds,rows:rows.map(x=>({id:x.id,slug:x.slug}))})).digest('hex');
const result={schema:'pse-governance-publish-92-rank-24-v1',source:24,category:1759,
 publishedPost:{sourceId:'92',wpId:82431,joomlaFeedDate:atom.published,editorialApprovalDateNotUsed:true},
 checksum,ranked:[],browser:[],status:'STARTED',errors:[]};
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com';
const b=await chromium.launch({headless:true}),ctx=await b.newContext({viewport:{width:1366,height:840}});
const page=await ctx.newPage();
try{
 await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:65000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const text=await page.locator('#loginform').innerText(),m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],v=m[2]==='+'?a+ +m[3]:m[2]==='-'?a- +m[3]:a* +m[3];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('WordPress login math input unavailable');await f.fill(String(v))}
  await page.locator('#wp-submit').click();
 }
 await page.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:55000});
 if(!await page.locator('#adminmenu').count())throw Error('WordPress administrator login failed');
 const nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('WP nonce missing');
 const api=(path,method='GET',body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:'same-origin',headers:{
   Accept:'application/json','X-WP-Nonce':nonce,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,data:await r.json().catch(()=>null),total:r.headers.get('x-wp-total')};
 },{path,method,body,nonce});
 const cat=await api('/wp-json/wp/v2/categories/1759?_fields=id,slug,parent,count');
 if(cat.http!==200||cat.data?.slug!=='tai-lieu-quan-tri-cong-ty'||cat.data.parent!==1744||!([23,24].includes(cat.data.count)))
  throw Error('Original CMS category drift');
 const all=await api('/wp-json/wp/v2/posts?categories=1759&context=edit&per_page=100&status=any&_fields=id,slug,status,date,categories');
 if(all.http!==200||all.data?.length!==24||Number(all.total)!==24||new Set(all.data.map(x=>x.id)).size!==24||
 all.data.some(x=>!rows.some(y=>y.id===x.id&&y.slug===x.slug)))
 throw Error('24 source WP post mappings diverged');
 const postpath='/wp-json/wp/v2/posts/82431';
 const fields='?context=edit&_fields=id,slug,status,date,date_gmt,title,content,categories,acf,pse_seo_title,pse_seo_description';
 const before=await api(postpath+fields),p=before.data;
 if(before.http!==200||p?.id!==82431||p.slug!==draft.wp.slug||
 p.title?.raw!==draft.wp.title||p.pse_seo_title!==draft.original.title||
 p.pse_seo_description!==draft.wp.seoDescription||p.content?.raw?.length!==draft.wp.htmlLength||
 JSON.stringify(p.categories)!==JSON.stringify(draft.wp.categories)||
 p.acf?.action!=='PostDetails'||p.acf?.key!=='ssr-post')
 throw Error('Exact WP draft title/content/PDF/SEO changed');
 if(p.status==='draft'){
  if(p.date!==draft.wp.date)throw Error('Draft date not at prior safe checkpoint');
  const changed=await api(postpath,'POST',{status:'publish',date,date_gmt:dateGmt});
  if(changed.http!==200||changed.data?.id!==82431)throw Error('Publishing exact 2011 Joomla metadata date failed HTTP '+changed.http);
  result.publishedPost.changed=true;
 }else if(p.status==='publish'&&p.date===date){result.publishedPost.changed=false}
 else throw Error('Unexpected WP status/date, refusing duplicate publish');
 const after=await api(postpath+fields),v=after.data;
 if(after.http!==200||v?.status!=='publish'||v.date!==date||v.date_gmt!==dateGmt||
 v.slug!==p.slug||v.title?.raw!==p.title?.raw||
 v.content?.raw!==p.content?.raw||v.pse_seo_title!==p.pse_seo_title||
 v.pse_seo_description!==p.pse_seo_description||
 JSON.stringify(v.categories)!==JSON.stringify(p.categories))
 throw Error('Published original Joomla date/content/SEO readback mismatch');
 console.log('PSE_GOV_92_PUBLISH='+JSON.stringify({status:'PASS',source:92,wp:82431,
  originalJoomlaFeedDate:atom.published,wordpressDate:v.date,wpStatus:v.status,
  contentPDFPreserved:true,seoPreserved:true,source:'rss_atom_exact_identity'}));
 const updatedCat=await api('/wp-json/wp/v2/categories/1759?_fields=id,slug,parent,count');
 if(updatedCat.http!==200||updatedCat.data?.count!==24)throw Error('WP category count still not 24 after publishing');
 const route='/wp-json/pse-governance/v1/original-archive-order';
 const pre=await api(route);
 if(pre.http!==200||!Array.isArray(pre.data?.rows)||pre.data.rows.length!==24)throw Error('Governance source rank native plugin not ready for 24');
 const requestRows=rows.map(x=>({id:x.id,slug:x.slug}));
 const rankMatches=pre.data.active===true&&pre.data.source_checksum===checksum&&
 pre.data.rows.every((x,i)=>x.id===requestRows[i].id&&x.rank===i+1);
 if(!rankMatches){
  const up=await api(route,'POST',{rows:requestRows,source_checksum:checksum});
  if(up.http!==200||up.data?.status!=='source_order_committed'||up.data.count!==24||!up.data.active||
    up.data.source_checksum!==checksum)throw Error('24 Joomla ranks not committed HTTP '+up.http+' '+JSON.stringify(up.data).slice(0,180));
 }
 const ranked=await api(route);
 if(ranked.http!==200||ranked.data?.active!==true||ranked.data.source_checksum!==checksum||
 ranked.data.rows?.length!==24||ranked.data.rows.some((x,i)=>x.id!==requestRows[i].id||x.rank!==i+1))
 throw Error('24 source rank metadata readback differs');
 const current=await api('/wp-json/wp/v2/posts?categories=1759&context=edit&per_page=100&status=publish&_fields=id,slug,date');
 if(current.http!==200||current.data?.length!==24||
 current.data.some((x,i)=>x.id!==rows[i].id||
 (x.id===82431?x.date!==date:x.date!==original.get(rows[i].source).wp.date)))
 throw Error('Published REST results differ from original source order or altered dates');
 result.ranked=current.data.map(x=>rows.find(y=>y.id===x.id).source);
 const publicPage=await ctx.newPage();
 for(const [label,viewport] of [['desktop',{width:1366,height:840}],['mobile',{width:390,height:844}]]){
  await publicPage.setViewportSize(viewport);
  let got=[];
  for(const number of [1,2]){
   const url=front+'/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty'+(number===2?'/2':'');
   const res=await publicPage.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
   if(res?.status()!==200)throw Error('Astro public archive HTTP '+res?.status());
   const data=await publicPage.evaluate(slugs=>({
    slugs:[...new Set([...document.querySelectorAll('main a[href]')].map(a=>{
     try{const path=new URL(a.href).pathname;const last=decodeURIComponent(path.split('/').filter(Boolean).at(-1)||'');
      return slugs.includes(last)?last:null}catch{return null}
    }).filter(Boolean))],
    overflow:document.documentElement.scrollWidth>window.innerWidth+3
   }),names);
   got.push(...data.slugs);
   result.browser.push({label,page:number,http:200,count:data.slugs.length,overflow:data.overflow});
   if(data.overflow||data.slugs.length!==12)throw Error(label+' expected 12 items/zero overflow on public page '+number);
  }
  if(got.length!==24||JSON.stringify(got)!==JSON.stringify(names))
   throw Error(label+' Joomla 24-article source order differs from Astro SSR');
 }
 await publicPage.close();
 const detail=await ctx.newPage({viewport:{width:390,height:844}});
 const r=await detail.goto(front+'/dieu-le-cong-ty-co-phan-phan-bon-va-hoa-chat-dau-khi-dong-nam-bo',
  {waitUntil:'domcontentloaded',timeout:60000});
 if(r?.status()!==200)throw Error('Newly published Joomla 92 article SSR HTTP '+r?.status());
 const pageInfo=await detail.evaluate(()=>({title:document.title,body:document.body?.innerText||'',links:[...document.querySelectorAll('main a[href]')].map(x=>x.href)}));
 if(!pageInfo.body.includes('Điều lệ')||!pageInfo.links.some(x=>/\.(?:pdf)(?:\?|#|$)/i.test(x)))
 throw Error('Published 92 Astro SSR title/PDF not visible');
 result.detail={http:200,pdfLocal:pageInfo.links.some(x=>/\/(?:api\/files\/)?wp-content\/uploads\//.test(x)),title:pageInfo.title};
 await detail.close();
 result.status='PASS_SOURCE_24_PUBLISHED_AND_RANKED';
 console.log('PSE_GOV_24_PUBLISHED='+JSON.stringify({status:result.status,
  source:24,wordpressPublished:24,ranked:24,originalFeedDate:atom.published,
  desktop:result.browser.filter(x=>x.label==='desktop'),
  mobile:result.browser.filter(x=>x.label==='mobile'),newArticle:result.detail}));
}catch(e){result.status='FAIL';result.errors.push(String(e).slice(0,310));console.error('PSE_GOV_24_PUBLISH_ERROR='+String(e))}
finally{await mkdir('artifacts/pse-governance-24-publish',{recursive:true});await writeFile('artifacts/pse-governance-24-publish/report.json',JSON.stringify(result,null,2)+'\n');await b.close()}
if(result.status!=='PASS_SOURCE_24_PUBLISHED_AND_RANKED')process.exitCode=1;
