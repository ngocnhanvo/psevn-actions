/** Persist independently verified Joomla order for the 15 already-published annual posts.
 * None of the 18 source dates are rewritten; no article/content/media mutation.
 */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const proof=JSON.parse(await readFile('artifacts/pse-annual-proof/report.json','utf8'));
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||!state.backup_verified||
 proof.schema!=='pse-annual-parity-v1'||proof.original.length!==2||
 proof.cmsCategory?.id!==1758||proof.cmsCategory?.slug!=='bao-cao-thuong-nien'||
 proof.cmsCategory?.parent!==1744||proof.cms.length!==18||proof.cmsList.length!==15)
 throw Error('Trusted original ordering evidence or backup missing');
const original=proof.original.flatMap(p=>p.ids);
if(new Set(original).size!==18||original.length!==18)throw Error('Expected exactly 18 original annual IDs');
const rows=original.flatMap(id=>{
 const x=proof.cms.find(r=>r.id===id);
 if(!x||!x.checkpoint||!x.source?.title)throw Error('Unknown original source '+id);
 if(!Number.isSafeInteger(x.wp.id))return[];
 if(x.wp.status!=='publish'||x.wp.id!==x.checkpoint.wp_id||
 !x.wp.categories?.includes(1758)||!x.source?.title?.endsWith(' - PSE.VN'))
 throw Error('WordPress source identity drift '+id);
 return [{id:x.wp.id,slug:x.wp.slug,source_id:id,date:x.wp.date}];
});
if(rows.length!==15||new Set(rows.map(r=>r.id)).size!==15||
 !['998','1000','1092'].every(id=>!rows.some(r=>r.source_id===id)))
 throw Error('Expected 15 original WordPress report members and three missing source IDs');
const checksum=createHash('sha256').update(original.join('|')+'#'+rows.map(r=>r.source_id+':'+r.slug).join('|')).digest('hex');
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com';
const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1366,height:900}});
const page=await ctx.newPage();
const result={schema:'pse-annual-15-source-order-v1',source:18,published:15,missing:['998','1000','1092'],
 checksum,changedDates:0,order:null,public:null,status:'UNVERIFIED'};
try{
 await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:65000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const txt=await page.locator('#loginform').innerText(),m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],b=+m[3],ans=m[2]==='+'?a+b:m[2]==='-'?a-b:a*b;
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Login challenge missing');await f.fill(String(ans))}
  await page.locator('#wp-submit').click();
 }
 await page.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:65000});
 if(!await page.locator('#adminmenu').count())throw Error('Not authenticated on WordPress');
 const nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Nonce invalid');
 const api=(path,method='GET',body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:'same-origin',headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});return {http:r.status,total:Number(r.headers.get('x-wp-total')||0),data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const [category,posts]=await Promise.all([
  api('/wp-json/wp/v2/categories/1758?_fields=id,slug,parent,count'),
  api('/wp-json/wp/v2/posts?categories=1758&per_page=100&_fields=id,slug,date,status')]);
 if(category.http!==200||category.data?.count!==15||category.data?.parent!==1744||
  posts.http!==200||posts.data?.length!==15||posts.total!==15)
  throw Error('Live taxonomy changed');
 const oldDates=new Map(posts.data.map(p=>[p.id,p.date]));
 if(rows.some(r=>!oldDates.has(r.id)||oldDates.get(r.id)!==r.date))throw Error('WordPress member or date mismatch');
 const url='/wp-json/pse-annual/v1/original-archive-order';
 const prior=await api(url);
 if(prior.http!==200||!Array.isArray(prior.data?.rows)||prior.data.rows.length!==15)
  throw Error('Annual ordering native plugin missing '+prior.http);
 const already=prior.data.active&&prior.data.source_checksum===checksum&&
  prior.data.rows.every((p,i)=>p.id===rows[i].id&&p.rank===i+1);
 if(!already){
  const write=await api(url,'POST',{rows:rows.map(r=>({id:r.id,slug:r.slug})),source_checksum:checksum});
  if(write.http!==200||write.data?.status!=='source_order_committed'||!write.data.active)
   throw Error('Source order save failed HTTP '+write.http+' '+JSON.stringify(write.data).slice(0,170));
 }
 const check=await api(url);
 const after=await api('/wp-json/wp/v2/posts?categories=1758&per_page=100&_fields=id,slug,date,status');
 if(check.http!==200||!check.data.active||check.data.source_checksum!==checksum||
  check.data.rows?.length!==15||check.data.rows.some((p,i)=>p.id!==rows[i].id||p.rank!==i+1)||
  after.http!==200||after.data?.length!==15||after.total!==15||
  after.data.some((p,i)=>p.id!==rows[i].id||p.date!==oldDates.get(p.id)))
  throw Error('WordPress original archive order or publication dates changed');
 result.order={status:'READBACK_PASS',mode:already?'ALREADY_CORRECT':'ACTIVATED',sorted:15,
  sourceRanked:rows.map(r=>r.source_id),changedDates:0};
 console.log('PSE_ANNUAL_SOURCE_ORDER='+JSON.stringify(result.order));
 const p=await ctx.newPage();
 try{const res=await p.goto(front+'/tin-tuc-su-kien/bao-cao-thuong-nien',{waitUntil:'domcontentloaded',timeout:65000});
 result.public={http:res?.status(),h1:(await p.locator('h1').allTextContents()).map(x=>x.trim())};
 if(res?.status()!==200||!result.public.h1.includes('Báo cáo thường niên'))throw Error('Frontend archive inaccessible');
 }finally{await p.close()}
 result.status='PASS';
}finally{await mkdir('artifacts/pse-annual-order',{recursive:true});
 await writeFile('artifacts/pse-annual-order/report.json',JSON.stringify(result,null,2)+'\n');await browser.close()}
console.log('PSE_ANNUAL_ORDER_RESULT='+JSON.stringify({status:result.status,order:result.order,public:result.public}));
