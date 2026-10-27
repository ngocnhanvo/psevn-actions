/** Source-verified Joomla governance-document category parity, safe in-place WordPress tags.
 * Audit by default. Apply only on explicit approved commit; no Astro build.
 */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const STATE=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(STATE.schema!=='pse-legacy-article-migration-v1'||!STATE.backup_verified)throw Error('Verified original backup/checkpoint absent');
const categorySegment='/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/';
const rows=Object.entries(STATE.articles).filter(([id,r])=>
 /^\d{3,6}$/.test(id)&&r.group_hint==='shareholder'&&
 r.source_url?.startsWith('https://www.pse.vn'+categorySegment+id+'-')&&r.source_url?.endsWith('.html')
).sort((a,b)=>Number(b[0])-Number(a[0]));
if(rows.length!==21||new Set(rows.map(x=>x[0])).size!==21)throw Error('Governance document manifest drift '+rows.length);
const event=process.env.GITHUB_EVENT_PATH?JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8')):{};
const apply=event.head_commit?.message==='cms(pse): classify verified governance documents without changing article text';
const cfg=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''));
const origin=key=>{const matches=cfg.filter(x=>x.startsWith(key+'='));if(matches.length!==1)throw Error('Origin not configured '+key);
 const u=new URL(matches[0].slice(key.length+1).trim().replace(/^['"]|['"]$/g,''));if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Invalid WordPress origin '+key);return u.origin};
const wp=origin('WC_URL'),frontend=origin('WC_URL_CLIENT');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:800}});
const page=await context.newPage();
const manifest=[];
try{
 const login=await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(login?.status()>=500)throw Error('WordPress admin HTTP '+login.status());
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const body=await page.locator('body').innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const fld=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await fld.count())throw Error('No login challenge input');await fld.fill(String(v))}
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WordPress auth failed');
 await page.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  if(!r.ok)throw Error('WordPress REST nonce HTTP '+r.status);return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Nonce invalid');
 const api=(path,method='GET',body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:'same-origin',headers:{Accept:'application/json','X-WP-Nonce':nonce,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json().catch(()=>null),total:r.headers.get('X-WP-Total')}
 },{path,method,body,nonce});
 const cats=await api('/wp-json/wp/v2/categories?slug=tai-lieu-quan-tri-cong-ty&hide_empty=false&_fields=id,slug,name,parent,count');
 if(cats.status!==200||cats.data?.length!==1||cats.data[0].slug!=='tai-lieu-quan-tri-cong-ty'||cats.data[0].parent!==1744)
  throw Error('Native governance taxonomy missing/ambiguous');
 const child=cats.data[0].id;
 const legacy=await context.newPage();
 const source=await legacy.goto('https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty.html',{waitUntil:'domcontentloaded',timeout:50000});
 if(source?.status()!==200)throw Error('Original governance archive unavailable');
 const originCheck=await legacy.evaluate(()=>{
  const root=document.querySelector('.blog');if(!root)throw Error('Original Joomla category .blog missing');
  return {title:document.title,firstItems:[...root.querySelectorAll('h2 a[href]')].slice(0,8).map(a=>({text:a.textContent.trim().slice(0,100),url:a.href}))};
 });
 const current=await context.newPage();
 const live=await current.goto(frontend+'/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty',{waitUntil:'domcontentloaded',timeout:55000});
 const publicInfo=await current.evaluate(()=>({url:location.pathname,title:document.title,h1:[...document.querySelectorAll('h1')].map(x=>x.innerText.trim()).slice(0,2),body:(document.body?.innerText||'').slice(0,800)}));
 console.log('PSE_GOV_CATEGORY='+JSON.stringify({id:child,old_http:source?.status(),new_http:live?.status(),original:originCheck.title,public:publicInfo,wpCategoryCount:cats.data[0].count}));
 let changed=0;
 for(const [id,r] of rows){
  if(!r.wp_id){manifest.push({id,status:r.status,reason:r.reason,source:r.source_url,wp_id:null,result:'SOURCE_PENDING'});continue}
  const slug=new URL(r.source_url).pathname.match(/\/\d+-([^/]+)\.html$/i)?.[1]?.toLowerCase();
  if(!slug||!Number.isSafeInteger(r.wp_id))throw Error('Invalid checkpoint slug/WP ID '+id);
  const response=await api('/wp-json/wp/v2/posts/'+r.wp_id+'?context=edit&_fields=id,slug,status,categories,title,content,date,acf');
  const p=response.data;
  if(response.status!==200||p.id!==r.wp_id||p.slug!==slug||
   !['publish','draft'].includes(p.status)||!p.categories.includes(1744))
    throw Error('Source/WP ID, slug, category drift '+id+' http='+response.status+' wp_id='+p?.id+' slug='+p?.slug+' status='+p?.status);
  // An independent, verified date-backfill worker may already have published a
  // checkpoint draft. Preserve LIVE WordPress status/date; do not infer either.
  const statusDivergence=(r.status==='draft_needs_date'&&p.status==='publish')||
   (r.status==='imported'&&p.status==='draft');
  const content=p.content?.raw||'';
  const hasSpam=/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:ru|com)(?:\/|\b)/i.test(content);
  const hasUntrustedHost=[...content.matchAll(/https?:\/\/([^\/\s"'<>]+)/g)].some(m=>!['www.pse.vn','pse.vn',new URL(wp).hostname, new URL(frontend).hostname].includes(m[1]));
  const imgs=(content.match(/<img\b/gi)||[]).length;
  const docs=(content.match(/\.pdf(?:["'?#]|<|$)/gi)||[]).length;
  const already=p.categories.includes(child);
  const rec={id,wp_id:r.wp_id,source:r.source_url,slug,status:p.status,originalStatus:r.status,originalDate:r.verified_date,
   hasCategory:already,statusDivergence,htmlChars:content.length,images:imgs,pdfMentions:docs,possibleSpam:hasSpam||hasUntrustedHost};
  if(apply&&!already){
   const update=await api('/wp-json/wp/v2/posts/'+r.wp_id,'POST',{categories:[...new Set([...p.categories,child])]});
   if(update.status!==200||update.data?.id!==r.wp_id)throw Error('Governance category update failed '+id);
   const read=await api('/wp-json/wp/v2/posts/'+r.wp_id+'?context=edit&_fields=id,slug,status,categories,content,date');
   if(read.status!==200||read.data?.slug!==p.slug||read.data?.status!==p.status||
    read.data?.date!==p.date||!read.data.categories.includes(child)||
    String(read.data.content?.raw||'')!==String(content))throw Error('WordPress tag read-after-write mismatch '+id);
   rec.result='TAGGED';changed++;
  }else rec.result=already?'ALREADY_TAGGED':'TAG_READY';
  manifest.push(rec);
  console.log('PSE_GOV_RECORD='+JSON.stringify({...rec,source:undefined}));
 }
 if(apply&&manifest.filter(x=>x.wp_id).some(x=>!['TAGGED','ALREADY_TAGGED'].includes(x.result)))throw Error('Governance complete tagging check failed');
 await mkdir('artifacts/pse-governance-documents',{recursive:true});
 await writeFile('artifacts/pse-governance-documents/manifest.json',JSON.stringify({mode:apply?'apply':'audit',category:cats.data[0],old:originCheck,new:publicInfo,rows:manifest},null,2)+'\n');
 console.log('PSE_GOV_AUDIT='+JSON.stringify({mode:apply?'apply':'audit',sourceTotal:rows.length,withWp:manifest.filter(x=>x.wp_id).length,alreadyTagged:manifest.filter(x=>x.result==='ALREADY_TAGGED').length,tagged:changed,awaitingOriginal:manifest.filter(x=>!x.wp_id).length,possibleSpam:manifest.filter(x=>x.possibleSpam).map(x=>x.id),noBuild:true}));
}finally{await browser.close()}
