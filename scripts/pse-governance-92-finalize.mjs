/** Publish Joomla governance entry 92 using independently verified RSS+Atom date, then restore all 24 source ranks. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';

const proof=JSON.parse(await readFile('artifacts/pse-governance-source-proof/report.json','utf8'));
const feed=JSON.parse(await readFile('artifacts/pse-governance-feed-proof/report.json','utf8'));
if(proof.schema!=='pse-governance-24-independent-parity-v1'||proof.sourceIds?.length!==24||
 proof.category?.id!==1759||proof.category?.parent!==1744||proof.cms?.length!==24||proof.errors?.length)
 throw Error('Independent 24-article source proof changed');
if(feed.schema!=='pse-governance-92-feed-metadata-v1'||feed.readOnly!==true)throw Error('Trusted Joomla feed proof absent');
const byId=new Map(proof.cms.map(x=>[x.id,x]));
const target=byId.get('92'),all=proof.sourceIds.map(id=>byId.get(id));
if(!target||target.wpId!==82431||target.wp?.status!=='draft'||target.wp?.date!=='2026-10-27T21:56:14'||
 !target.wp?.files?.length||target.wp.files.length!==1||target.wp?.categories?.includes(1759)!==true||
 !target.original?.title?.endsWith(' - PSE.VN')||new Set(all.map(x=>x?.wpId)).size!==24||
 all.some(x=>!x?.wp?.slug||!Number.isSafeInteger(x.wpId)))
 throw Error('Governance migration identities or original draft checkpoint changed');
const feedRow=type=>feed.feeds.find(x=>x.isXML&&x.url?.includes('start=25&format=feed&type='+type))?.matched?.find(x=>x.id==='92');
const rss=feedRow('rss'),atom=feedRow('atom');
const expectedUrl=target.source,expectedTitle=target.original.title.replace(/ - PSE\.VN$/,'');
if(!rss||!atom||rss.title!==expectedTitle||atom.title!==expectedTitle||
 rss.link!==expectedUrl||atom.link!==expectedUrl||!rss.pubDate||!atom.published||
 Number.isNaN(Date.parse(rss.pubDate))||Date.parse(rss.pubDate)!==Date.parse(atom.published)||
 atom.updated!==atom.published||Date.parse(atom.published)>=Date.now())
 throw Error('Original Joomla RSS and Atom publication dates disagree');
const expectedDate=new Date(Date.parse(atom.published)+7*3600000).toISOString().slice(0,19);
if(expectedDate!=='2011-06-20T01:52:44')throw Error('Unexpected original feed date: '+expectedDate);
const rows=all.map(x=>({id:x.wpId,slug:x.wp.slug}));
const checksum=createHash('sha256').update(JSON.stringify({source:proof.sourceIds,rows})).digest('hex');
const report={schema:'pse-governance-92-publish-24-order-v1',status:'STARTED',originalSourceCount:24,
 originalDate:expectedDate,sourceURL:expectedUrl,postId:82431,sourceChecksum:checksum,
 published:false,ranked:false,desktop:null,mobile:null,errors:[]};
const cms='https://admin-pse.webnvn.com',front='https://pse.webnvn.com';
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:840}});
const p=await ctx.newPage();
try{
 await p.goto(cms+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await p.locator('#user_login').count()){
  await p.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await p.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await p.locator('#loginform').innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],n=+m[3],ans=m[2]==='+'?a+n:m[2]==='-'?a-n:a*n;
   const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Login math field missing');await f.fill(String(ans))}
  await p.locator('#wp-submit').click();
 }
 await p.goto(cms+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:50000});
 if(!await p.locator('#adminmenu').count())throw Error('WP administrator login failed');
 const nonce=await p.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Missing WP nonce');
 const api=(path,method='GET',body)=>p.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:'same-origin',headers:{
   Accept:'application/json','X-WP-Nonce':nonce,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,data:await r.json().catch(()=>null),total:r.headers.get('x-wp-total')};
 },{path,method,body,nonce});
 const cat=await api('/wp-json/wp/v2/categories/1759?_fields=id,slug,parent,count');
 if(cat.http!==200||cat.data?.slug!=='tai-lieu-quan-tri-cong-ty'||cat.data?.parent!==1744||
 ![23,24].includes(cat.data.count))throw Error('Governance term identity drift');
 const f='?context=edit&_fields=id,slug,status,date,categories,title,content,pse_seo_title,pse_seo_description,acf';
 const path='/wp-json/wp/v2/posts/82431';
 const before=await api(path+f),v=before.data;
 if(before.http!==200||v?.id!==82431||v.slug!==target.wp.slug||
 !['draft','publish'].includes(v.status)||
 v.title?.raw!==target.wp.title||v.content?.raw?.length!==target.wp.htmlLength||
 JSON.stringify(v.categories)!==JSON.stringify(target.wp.categories)||
 v.acf?.action!=='PostDetails'||v.acf?.key!=='ssr-post'||
 v.pse_seo_title!==target.original.title||v.pse_seo_description!==target.wp.seoDescription)
  throw Error('Draft identity/body/categories/SEO differs from audited source');
 if(v.status==='draft'){
  if(v.date!==target.wp.date||cat.data.count!==23)throw Error('Draft date or published count drift');
  const saved=await api(path,'POST',{date:expectedDate,status:'publish'});
  if(saved.http!==200||saved.data?.id!==82431||saved.data.status!=='publish')
   throw Error('Could not publish exact source-dated article HTTP '+saved.http);
  report.published=true;
 }else if(v.date!==expectedDate||cat.data.count!==24)throw Error('Existing published article has incorrect date');
 const check=await api(path+f),n=check.data;
 if(check.http!==200||n?.status!=='publish'||n.date!==expectedDate||
 n.slug!==v.slug||n.title?.raw!==v.title?.raw||n.content?.raw!==v.content?.raw||
 JSON.stringify(n.categories)!==JSON.stringify(v.categories)||
 n.pse_seo_title!==v.pse_seo_title||n.pse_seo_description!==v.pse_seo_description||
 n.acf?.action!==v.acf.action||n.acf?.key!==v.acf.key)
  throw Error('Published article source-date or content readback failed');
 const newTerm=await api('/wp-json/wp/v2/categories/1759?_fields=id,slug,parent,count');
 if(newTerm.http!==200||newTerm.data?.count!==24)throw Error('Category not updated to 24 published articles');
 const rankPath='/wp-json/pse-governance/v1/original-archive-order';
 const oldRank=await api(rankPath);
 if(oldRank.http!==200||oldRank.data?.rows?.length!==24)
  throw Error('Governance source-order plugin unavailable for 24 articles');
 if(!(oldRank.data.active&&oldRank.data.source_checksum===checksum&&oldRank.data.rows.every((x,i)=>x.id===rows[i].id&&x.rank===i+1))){
  const saved=await api(rankPath,'POST',{rows,source_checksum:checksum});
  if(saved.http!==200||saved.data?.status!=='source_order_committed'||saved.data?.count!==24||
   saved.data?.source_checksum!==checksum||saved.data?.active!==true)
   throw Error('24 source-rank metadata save failed HTTP '+saved.http+' '+JSON.stringify(saved.data).slice(0,180));
  report.ranked=true;
 }
 const order=await api(rankPath);
 if(order.http!==200||order.data?.active!==true||order.data?.source_checksum!==checksum||
 order.data.rows?.length!==24||order.data.rows.some((x,i)=>x.id!==rows[i].id||x.rank!==i+1))
  throw Error('24 source-rank metadata readback failed');
 const ordered=await api('/wp-json/wp/v2/posts?categories=1759&per_page=100&status=publish&context=edit&_fields=id,slug,date');
 if(ordered.http!==200||ordered.data?.length!==24||ordered.data.some((x,i)=>x.id!==rows[i].id))
  throw Error('Native WordPress 24-post order not equal original Joomla');
 const live=await ctx.newPage(),slugs=all.map(x=>x.wp.slug);
 for(const [device,viewport] of [['desktop',{width:1366,height:840}],['mobile',{width:390,height:844}]]){
  await live.setViewportSize(viewport);
  const gathered=[],pages=[];
  for(const i of [1,2]){
   const url=front+'/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty'+(i===2?'/2':'');
   const res=await live.goto(url,{waitUntil:'domcontentloaded',timeout:55000});
   if(res?.status()!==200)throw Error(device+' page '+i+' HTTP '+res?.status());
   const data=await live.evaluate(valid=>{
    const seen=[...new Set([...document.querySelectorAll('main a[href]')].map(a=>{
     try{const slug=decodeURIComponent(new URL(a.href).pathname).split('/').filter(Boolean).at(-1);return valid.includes(slug)?slug:null}catch{return null}
    }).filter(Boolean))];
    return {seen,overflow:document.documentElement.scrollWidth>window.innerWidth+3};
   },slugs);
   pages.push({page:i,count:data.seen.length,overflow:data.overflow});
   if(data.overflow||data.seen.length!==12)throw Error(device+' page '+i+' item count/overflow mismatch');
   gathered.push(...data.seen);
  }
  if(JSON.stringify(gathered)!==JSON.stringify(slugs))throw Error(device+' 24-post original archive order mismatch');
  report[device]=pages;
 }
 await live.close();
 report.status='PASS_24_PUBLISHED_24_SOURCE_ORDER';
 console.log('PSE_GOV_92_FINAL='+JSON.stringify({status:report.status,article:92,date:expectedDate,source:rss.link,
  changedPublish:report.published,changedRank:report.ranked,desktop:report.desktop,mobile:report.mobile}));
}catch(e){report.status='FAIL';report.errors.push(String(e).slice(0,350));console.error('PSE_GOV_92_FINAL_FAIL='+String(e))}
finally{await mkdir('artifacts/pse-governance-92-final',{recursive:true});
 await writeFile('artifacts/pse-governance-92-final/report.json',JSON.stringify(report,null,2)+'\n');
 await browser.close()}
if(report.status!=='PASS_24_PUBLISHED_24_SOURCE_ORDER')process.exitCode=1;
