/** PSE legacy exact-source WordPress slug collision inventory. GET only. */
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ids=['1247','1172','1169','1165','1157'];
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||state.tracker_issue!==3||!state.backup_verified)
 throw Error('Wrong migration checkpoint');
const lines=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith('WC_URL='));
if(lines.length!==1)throw Error('Missing unique WordPress env origin');
const wpUrl=new URL(lines[0].slice(7).replace(/^['"]|['"]$/g,''));
if(wpUrl.protocol!=='https:'||wpUrl.username||wpUrl.password||wpUrl.search||wpUrl.hash||!['','/'].includes(wpUrl.pathname))throw Error('Untrusted WordPress origin');
const wp=wpUrl.origin,report={schema:'pse-five-history-collisions-review-v1',readonly:true,items:[],status:'STARTED',errors:[]};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:860}});
await ctx.route(/\.(?:woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const admin=await ctx.newPage();
const clean=s=>String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const fold=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
const digest=s=>createHash('sha256').update(fold(s)).digest('hex').slice(0,22);
try{
 await admin.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await admin.locator('#user_login').count()){
  await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const m=(await admin.locator('#loginform').innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=Number(m[1]),b=Number(m[3]),val=m[2]=='+'?a+b:m[2]=='-'?a-b:a*b;
   const inp=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(await inp.count())await inp.fill(String(val));
  }
  await admin.locator('#wp-submit').click();
 }
 await admin.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(admin.url().includes('wp-login')||!(await admin.locator('#adminmenu').count()))throw Error('WP admin auth unavailable');
 const nonce=await admin.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Invalid WP nonce');
 for(const id of ids){
  const row=state.articles[id];
  if(row?.status!=='quarantined'||row.reason!=='WP slug occupied by unrelated or empty content'||
    !row.source_url?.startsWith('https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/'+id+'-'))
    throw Error('Historical checkpoint identity changed '+id);
  const url=row.source_url,slug=/\/\d+-([^/]+)\.html$/i.exec(url)?.[1];
  if(!slug)throw Error('Original slug invalid '+id);
  const source=await ctx.newPage();
  let original;
  try{
   const r=await source.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
   const p=await source.evaluate(()=>{
    const root=document.querySelector('[itemprop="articleBody"]')||document.querySelector('.item-page');
    const txt=root?.textContent||'';
    const heading=document.querySelector('h1[itemprop="headline"],.item-page h2,.item-page h1');
    return {body:txt,title:heading?.textContent||document.title,
      assets:[...new Set([...root?.querySelectorAll('img[src],a[href]')||[]].map(el=>el.getAttribute(el.tagName==='IMG'?'src':'href')||'').filter(Boolean))].slice(0,25),
      dates:[...document.querySelectorAll('time[datetime],dd.created,dd.published,meta[property="article:published_time"]')].map(el=>el.getAttribute('datetime')||el.getAttribute('content')||el.textContent||'').filter(Boolean).slice(0,5)};
   });
   original={http:r?.status(),title:clean(p.title),bodyChars:clean(p.body).length,bodyHash:digest(p.body),
    bodyPreview:clean(p.body).slice(0,400),dateFields:p.dates,assetCount:p.assets.length,assetSample:p.assets.slice(0,12)};
  }catch(e){original={error:String(e?.message||e).slice(0,180)}}
  finally{await source.close()}
  const response=await admin.evaluate(async({slug,nonce})=>{
   const r=await fetch('/wp-json/wp/v2/posts?status=any&context=edit&per_page=20&slug='+encodeURIComponent(slug)+'&_fields=id,slug,status,date,title,content,categories',{
    headers:{Accept:'application/json','X-WP-Nonce':nonce},credentials:'same-origin'
   });return {status:r.status,body:await r.json().catch(()=>null)}
  },{slug,nonce});
  if(response.status!==200||!Array.isArray(response.body))throw Error('WP collision REST lookup '+id+' HTTP '+response.status);
  const wpPosts=response.body.map(p=>{
   const text=String(p.content?.raw||'').replace(/<[^>]+>/g,' ');
   return {id:p.id,slug:p.slug,status:p.status,date:p.date,title:clean(p.title?.raw||p.title?.rendered),
    categories:p.categories,bodyChars:clean(text).length,bodyHash:digest(text),bodyPreview:clean(text).slice(0,400)};
  });
  report.items.push({sourceId:id,url,slug,original,wpPosts,titleExact:wpPosts.map(p=>fold(p.title)===fold(original.title)),
   excerptOverlap:wpPosts.map(p=>{
    const src=fold(original.bodyPreview).split(' ').filter(Boolean),dst=fold(p.bodyPreview).split(' ').filter(Boolean);
    const set=new Set(dst);return src.length?Number((src.filter(x=>set.has(x)).length/src.length).toFixed(3)):0;
   })});
  console.log('PSE_TIN_TONG_HOP_COLLISION='+JSON.stringify({id,original:{http:original.http,chars:original.bodyChars,preview:original.bodyPreview?.slice(0,90),date:original.dateFields},
   wp:wpPosts.map(x=>({id:x.id,status:x.status,categories:x.categories,bodyChars:x.bodyChars,date:x.date,bodyPreview:x.bodyPreview?.slice(0,90)})),
   overlap:report.items.at(-1).excerptOverlap}));
 }
 report.status='PASS_READ_ONLY';
 console.log('PSE_TIN_TONG_HOP_COLLISIONS_QA=PASS; source_count='+ids.length+'; no_wp_write=true');
}catch(e){report.status='FAIL';report.errors.push(String(e?.message||e));console.error('PSE_TIN_TONG_HOP_COLLISIONS_ERROR='+report.errors.at(-1));throw e}
finally{await mkdir('artifacts/pse-tin-tong-hop-five-collisions',{recursive:true});await writeFile('artifacts/pse-tin-tong-hop-five-collisions/report.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
