/** Final 18-article Joomla annual archive source-order commit and SSR readback. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const source=JSON.parse(await readFile('artifacts/pse-annual-parity-proof/report.json','utf8'));
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(source.schema!=='pse-annual-parity-v1'||source.sourceCount!==18||source.cmsCategory?.id!==1758||
 state.schema!=='pse-legacy-article-migration-v1'||!state.backup_verified)throw Error('Untrusted PSE annual original or rollback state');
const ids=source.original.flatMap(x=>x.ids||[]);
if(ids.length!==18||new Set(ids).size!==18)throw Error('Original Joomla article count changed');
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com';
const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1366,height:800}});
const admin=await ctx.newPage();
const report={schema:'pse-annual-18-original-order-v2',originalCount:18,wpCount:0,missing:[],ranks:[],checksum:null,changedDates:0,front:null,status:'UNVERIFIED'};
try{
 await admin.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await admin.locator('#user_login').count()){
  await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const txt=await admin.locator('#loginform').innerText(),m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],b=+m[3],v=m[2]==='+'?a+b:m[2]==='-'?a-b:a*b;
   const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Math input missing');await f.fill(String(v))}
  await admin.locator('#wp-submit').click();
 }
 await admin.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(!await admin.locator('#adminmenu').count())throw Error('WordPress admin not authenticated');
 const nonce=await admin.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('REST nonce invalid');
 const api=(path,method='GET',data)=>admin.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:'same-origin',headers:{Accept:'application/json','X-WP-Nonce':nonce,...(data?{'Content-Type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return{http:r.status,total:Number(r.headers.get('x-wp-total')||0),data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 const cat=await api('/wp-json/wp/v2/categories/1758?_fields=id,slug,parent,count');
 const before=await api('/wp-json/wp/v2/posts?categories=1758&per_page=100&page=1&_fields=id,slug,date,status');
 if(cat.http!==200||cat.data?.slug!=='bao-cao-thuong-nien'||cat.data.parent!==1744||
  before.http!==200||!Array.isArray(before.data)||before.data.length!==before.total||
  cat.data.count!==before.total||before.total<15||before.total>18)throw Error('Annual category identity/count drift');
 report.wpCount=before.total;
 const byId=new Map(before.data.map(x=>[x.id,x]));
 const ranks=[];
 for(const id of ids){
  const stateRow=state.articles[id],src=source.cms.find(x=>x.id===id);
  if(!stateRow?.source_url?.startsWith('https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-thuong-nien/'+id+'-')||
    src?.source?.title!==src?.source?.title?.trim()||
    src?.source?.title?.endsWith(' - PSE.VN')!==true)throw Error('Source legacy identity drift '+id);
  if(!Number.isSafeInteger(stateRow.wp_id)){report.missing.push(id);continue}
  const live=byId.get(stateRow.wp_id);
  if(!live||live.status!=='publish'||live.slug!==stateRow.source_url.match(/\/\d+-([^/]+)\.html$/)?.[1])
   throw Error('Migrated WordPress source article and slug mismatched '+id);
  ranks.push({id:live.id,slug:live.slug,source_id:id});
 }
 if(ranks.length!==before.total||new Set(ranks.map(x=>x.id)).size!==ranks.length)
  throw Error('Unexpected WordPress-only post in verified original annual scope');
 const checksum=createHash('sha256').update(ids.join('|')+'#'+ranks.map(x=>x.source_id+':'+x.slug).join('|')).digest('hex');
 report.checksum=checksum;
 const url='/wp-json/pse-annual/v1/original-archive-order';
 const prior=await api(url);
 if(prior.http!==200||prior.data?.rows?.length!==ranks.length)
  throw Error('Updated native annual ranking plugin unavailable '+prior.http);
 const already=prior.data.active&&prior.data.source_checksum===checksum&&
  prior.data.rows.every((x,i)=>x.id===ranks[i].id&&x.rank===i+1);
 if(!already){
  const posted=await api(url,'POST',{rows:ranks.map(({id,slug})=>({id,slug})),source_checksum:checksum});
  if(posted.http!==200||posted.data?.status!=='source_order_committed'||!posted.data.active)
   throw Error('Save full source order failed HTTP '+posted.http+' '+JSON.stringify(posted.data).slice(0,200));
 }
 const saved=await api(url);
 const after=await api('/wp-json/wp/v2/posts?categories=1758&per_page=100&page=1&_fields=id,slug,date,status');
 const oldDates=new Map(before.data.map(x=>[x.id,x.date]));
 if(saved.http!==200||!saved.data.active||saved.data.source_checksum!==checksum||
  saved.data.rows?.length!==ranks.length||saved.data.rows.some((x,i)=>x.id!==ranks[i].id||x.rank!==i+1)||
  after.http!==200||after.total!==ranks.length||after.data?.length!==ranks.length||
  after.data.some((x,i)=>x.id!==ranks[i].id||x.date!==oldDates.get(x.id)))
  throw Error('Stored WordPress order or original publication dates changed');
 report.ranks=ranks;report.changedDates=0;
 const pg=await ctx.newPage();
 try{
  const first=await pg.goto(front+'/tin-tuc-su-kien/bao-cao-thuong-nien',{waitUntil:'domcontentloaded',timeout:60000});
  const firstCount=await pg.locator('#posts-grid h2').count();
  const last=await pg.goto(front+'/tin-tuc-su-kien/bao-cao-thuong-nien/2',{waitUntil:'domcontentloaded',timeout:60000});
  const lastCount=await pg.locator('#posts-grid h2').count();
  if(first?.status()!==200||last?.status()!==200||
   firstCount!==12||lastCount!==ranks.length-12)throw Error('Annual archive SSR pagination or count invalid');
  report.front={firstHttp:200,lastHttp:200,firstCount,lastCount,total:ranks.length};
 }finally{await pg.close()}
 report.status=report.missing.length===0&&ranks.length===18?'PASS_SOURCE_18':'PASS_PUBLISHED_SUBSET';
}catch(e){report.status='PARTIAL';report.error=String(e).slice(0,380);
 console.error('PSE_ANNUAL_ORDER_V2_ERROR='+String(e))}
finally{
 await mkdir('artifacts/pse-annual-order-v2',{recursive:true});
 await writeFile('artifacts/pse-annual-order-v2/report.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
console.log('PSE_ANNUAL_ORDER_V2='+JSON.stringify({status:report.status,source:report.originalCount,wp:report.wpCount,
 missing:report.missing,ranked:report.ranks.length,front:report.front,error:report.error||null}));
