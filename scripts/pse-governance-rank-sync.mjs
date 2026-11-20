/** Restore source order of 23 published PSE governance posts without editing their dates, content or titles. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const proof=JSON.parse(await readFile('artifacts/pse-governance-source-proof/report.json','utf8'));
if(proof.schema!=='pse-governance-24-independent-parity-v1'||proof.sourceIds?.length!==24||
 proof.category?.id!==1759||proof.category?.count!==23||
 proof.cms?.length!==24||proof.errors?.length)throw Error('No independent source inventory to rank');
const byId=new Map(proof.cms.map(x=>[x.id,x]));
const rows=proof.sourceIds.filter(id=>byId.get(id)?.wp?.status==='publish').map(id=>{
 const v=byId.get(id);return {source:id,id:v.wpId,slug:v.wp.slug,date:v.wp.date};
});
if(rows.length!==23||new Set(rows.map(x=>x.id)).size!==23||byId.get('92')?.wp?.status!=='draft'||
 rows.some(x=>!Number.isSafeInteger(x.id)||!x.slug||!x.date||!proof.sourceIds.includes(x.source)))
 throw Error('Published source rank identity changed');
const input=rows.map(({id,slug})=>({id,slug}));
const checksum=createHash('sha256').update(JSON.stringify({source:proof.sourceIds,rows:input})).digest('hex');
const expected=rows.map(x=>x.id);
const report={schema:'pse-governance-23-source-rank-v1',status:'STARTED',source:24,published:rows.length,
 draft:['92'],checksum,expectedOrder:rows.map(x=>x.source),http:{},observed:{},errors:[]};
const cms='https://admin-pse.webnvn.com',front='https://pse.webnvn.com';
const b=await chromium.launch({headless:true}),ctx=await b.newContext({viewport:{width:1366,height:840}});
const p=await ctx.newPage();let nonce;
try{
 await p.goto(cms+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await p.locator('#user_login').count()){
  await p.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await p.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await p.locator('#loginform').innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],ans=m[2]==='+'?a+ +m[3]:m[2]==='-'?a- +m[3]:a* +m[3];
   const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Missing WP challenge');await f.fill(String(ans))}
  await p.locator('#wp-submit').click();
 }
 await p.goto(cms+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:50000});
 if(!await p.locator('#adminmenu').count())throw Error('WordPress login missing');
 nonce=await p.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Missing WP REST nonce');
 const api=(path,method='GET',body)=>p.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:'same-origin',headers:{
   Accept:'application/json','X-WP-Nonce':nonce,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,data:await r.json().catch(()=>null),total:r.headers.get('x-wp-total')};
 },{path,method,body,nonce});
 const cat=await api('/wp-json/wp/v2/categories/1759?_fields=id,slug,parent,count');
 if(cat.http!==200||cat.data?.parent!==1744||cat.data?.slug!=='tai-lieu-quan-tri-cong-ty'||cat.data?.count!==23)
  throw Error('Governance taxonomy changed');
 const before=await api('/wp-json/wp/v2/posts?categories=1759&per_page=100&status=publish&context=edit&_fields=id,slug,date,status');
 if(before.http!==200||before.data?.length!==23||
  new Set(before.data.map(x=>x.id)).size!==23||
  before.data.some(x=>!expected.includes(x.id)))throw Error('Unexpected WordPress published post set');
 const dates=new Map(before.data.map(x=>[x.id,x.date]));
 if(rows.some(x=>dates.get(x.id)!==x.date))throw Error('Publication dates changed since independent audit');
 report.observed.before=before.data.map(x=>rows.find(z=>z.id===x.id)?.source);
 const getRoute='/wp-json/pse-governance/v1/original-archive-order';
 const active=await api(getRoute);
 if(active.http!==200||!Array.isArray(active.data?.rows)||active.data.rows.length!==23)
  throw Error('Governance PHP source-order route not deployed/activated');
 if(active.data?.active&&active.data.source_checksum===checksum&&
  active.data.rows.every((x,i)=>x.id===input[i].id&&x.rank===i+1)){
  report.observed.already=true;
 }else{
  const saved=await api(getRoute,'POST',{rows:input,source_checksum:checksum});
  if(saved.http!==200||saved.data?.status!=='source_order_committed'||saved.data.count!==23||
   saved.data.source_checksum!==checksum||saved.data.active!==true)
   throw Error('Rank metadata save/readback failed HTTP '+saved.http+' '+JSON.stringify(saved.data).slice(0,220));
  report.observed.changed=true;
 }
 const read=await api(getRoute);
 if(read.http!==200||!read.data?.active||read.data.source_checksum!==checksum||
  read.data.rows.length!==23||read.data.rows.some((x,i)=>x.id!==input[i].id||x.rank!==i+1))
  throw Error('Governance rank post-meta readback changed');
 const after=await api('/wp-json/wp/v2/posts?categories=1759&per_page=100&status=publish&context=edit&_fields=id,slug,date,status');
 if(after.http!==200||after.data?.length!==23||after.data.some((x,i)=>x.id!==expected[i]||x.date!==dates.get(x.id)))
  throw Error('Published WP REST order or dates differ from verified Joomla original');
 report.observed.wpOrder=after.data.map(x=>rows.find(z=>z.id===x.id)?.source);
 const live=await ctx.newPage();
 const getPath=async(url,viewport)=>{
  await live.setViewportSize(viewport);
  const r=await live.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
  if(r?.status()!==200)throw Error('Astro SSR '+url+' HTTP '+r?.status());
  return await live.evaluate(slugs=>{
   const valid=new Set(slugs);
   const found=[...new Set([...document.querySelectorAll('main a[href]')].map(a=>{
    const path=new URL(a.href).pathname;const last=decodeURIComponent(path.split('/').filter(Boolean).at(-1)||'');
    return valid.has(last)?last:null;
   }).filter(Boolean))];
   return {slugs:found,overflow:document.documentElement.scrollWidth>window.innerWidth+3};
  },rows.map(x=>x.slug));
 };
 const target=rows.map(x=>x.slug);
 for(const [kind,viewport] of [['desktop',{width:1366,height:840}],['mobile',{width:390,height:844}]]){
  const a=await getPath(front+'/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty',viewport);
  const c=await getPath(front+'/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty/2',viewport);
  const all=[...a.slugs,...c.slugs];
  report.observed[kind]={first:a.slugs.length,second:c.slugs.length,overflow:a.overflow||c.overflow,parity:JSON.stringify(all)===JSON.stringify(target)};
  if(all.length!==23||report.observed[kind].overflow||!report.observed[kind].parity)
   throw Error(kind+' Astro SSR order mismatch '+JSON.stringify(report.observed[kind]));
 }
 await live.close();
 report.status='PASS_23_SOURCE_ORDER';
 console.log('PSE_GOV_RANK='+JSON.stringify({status:report.status,source:24,ranked:23,pages:'12+11',
  changed:!!report.observed.changed,wpOrder:report.observed.wpOrder,
  desktop:report.observed.desktop,mobile:report.observed.mobile,daysPreserved:true}));
}catch(e){report.status='FAIL';report.errors.push(String(e).slice(0,280));console.error('PSE_GOV_RANK_ERROR='+String(e))}
finally{await mkdir('artifacts/pse-governance-rank',{recursive:true});
 await writeFile('artifacts/pse-governance-rank/report.json',JSON.stringify(report,null,2)+'\n');await b.close()}
if(report.status!=='PASS_23_SOURCE_ORDER')process.exitCode=1;
