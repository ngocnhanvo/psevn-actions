/** Read-only: verify whether the native numeric footer draft and global ESC footer are distinct CMS tables. */
import { chromium } from 'playwright';
const rows = String(process.env.ENV_FILE || '').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
const entry = rows.filter(s=>s.startsWith('WC_URL='));
if(entry.length !== 1) throw Error('Missing unique WordPress origin');
const u = new URL(entry[0].slice(7).replace(/^['"]|['"]$/g,''));
if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname)) throw Error('Invalid origin');
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('Missing WP credentials');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
try {
 await page.goto(u.origin+'/wp-admin/', {waitUntil:'domcontentloaded', timeout:65000});
 if(await page.locator('#user_login').count()) {
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const body=await page.locator('body').innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
    const a=+m[1], b=+m[3], v=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];
    const field=page.locator('#loginform input[name*="captcha" i], #loginform input[name*="math" i], #loginform input[name*="arith" i], #loginform input[type="number"]').first();
    if(!await field.count())throw Error('Math login challenge without control');
    await field.fill(String(v));
  }
  await page.locator('#wp-submit').click({noWaitAfter:true,timeout:25000});
  await page.waitForFunction(()=>location.pathname.startsWith('/wp-admin')&&!document.querySelector('#loginform'),null,{timeout:45000});
 }
 if(page.url().includes('wp-login'))throw Error('Admin session not authenticated');
 const output=await page.evaluate(async()=>{
  const nonce=window.wpApiSettings?.nonce || await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()).then(s=>s.trim());
  async function read(route){const r=await fetch(route,{credentials:'same-origin',cache:'no-store',headers:{'X-WP-Nonce':nonce}});return {status:r.status,data:await r.json().catch(()=>null)};}
  const [numeric, global, inventory] = await Promise.all([
    read('/wp-json/tablepress/v1/table/136'),
    read('/wp-json/tablepress/v1/table/pub_footer_assets_vi'),
    read('/wp-json/tablepress/v1/tables/prefix/all?per_page=200&page=1')
  ]);
  const describe=(x)=>({
   http:x.status,
   id:x.data?.id??null,
   name:x.data?.name??null,
   fieldKeys:Array.isArray(x.data?.fields)?x.data.fields.map(f=>f.key):[],
   rowCount:Array.isArray(x.data?.items)?x.data.items.length:null,
   rowGroups:Array.isArray(x.data?.items)?x.data.items.map(item=>item?.group||'').slice(0,15):[],
   firstRowFieldCount:Array.isArray(x.data?.items)?Object.keys(x.data.items[0]||{}).length:0
  });
  const all=Array.isArray(inventory.data)?inventory.data:[];
  const candidates=all.filter(t=>String(t.id)==='136'||String(t.id)==='pub_footer_assets_vi'||/Footer PSE/i.test(String(t.name||'')));
  return {numeric:describe(numeric),global:describe(global),inventoryStatus:inventory.status,inventoryCount:all.length,footerCandidates:candidates.map(t=>({id:t.id,name:t.name,fieldsCount:t.fields?.length??null,itemsCount:t.items?.length??null})),sameRecord:numeric.status===200&&global.status===200&&String(numeric.data.id)===String(global.data.id)};
 });
 console.log('PSE_FOOTER_ID_AUDIT='+JSON.stringify(output));
 const inspection=await page.evaluate(async()=>{
   const nonce=window.wpApiSettings?.nonce || await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text());
   const get=async path=>{const response=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{'X-WP-Nonce':nonce}});return {status:response.status,data:await response.json().catch(()=>null),pages:Number(response.headers.get('X-WP-TotalPages')||1)}};
   const terms=['gcert','g-cert','ias','iaf','chung nhan','iso','certification','esc'];
   const media=[];
   for(const term of terms){
    const m=await get('/wp-json/wp/v2/media?context=edit&search='+encodeURIComponent(term)+'&per_page=30');
    media.push({term,status:m.status,items:Array.isArray(m.data)?m.data.map(d=>({id:d.id,title:d.title?.raw||d.title?.rendered||'',alt:d.alt_text||'',file:d.media_details?.file||'',url:d.source_url||''})).slice(0,30):[]});
   }
   const references=[];
   for(const type of ['pages','posts']){
    for(let i=1;i<=8;i++){
      const response=await get('/wp-json/wp/v2/'+type+'?context=edit&status=any&per_page=100&page='+i);
      if(response.status!==200||!Array.isArray(response.data)) {references.push({type,page:i,status:response.status});break;}
      const matches=response.data.filter(d=>/\[table\s+id\s*=\s*["']?136\b/i.test(String(d.content?.raw||d.content?.rendered||''))||/table_id[=:"']+136\b/i.test(String(d.content?.raw||d.content?.rendered||'')));
      for(const d of matches)references.push({type,id:d.id,slug:d.slug,status:d.status});
      if(i>=response.pages)break;
    }
   }
   return {media,references};
 });
 console.log('PSE_FOOTER_SOURCE_MEDIA='+JSON.stringify(inspection));
 await page.goto(u.origin+'/wp-admin/admin.php?page=tablepress',{waitUntil:'domcontentloaded',timeout:65000});
 const adminInfo=await page.evaluate(()=>({
  table136Rows:[...document.querySelectorAll('tr')].filter(tr=>tr.textContent?.includes('136')).slice(0,4).map(tr=>({text:(tr.innerText||'').slice(0,350),actions:[...tr.querySelectorAll('a,button')].map(a=>({text:(a.textContent||'').trim().slice(0,55),action:a.getAttribute('data-action')||null,classes:a.className||'',hrefType:(a.getAttribute('href')||'').includes('action=delete')?'delete':(a.getAttribute('href')||'').includes('action=edit')?'edit':'other'}))})),
  visibleButtons:[...document.querySelectorAll('button')].map(b=>((b.textContent||'').trim())).filter(Boolean).slice(0,20)
 }));
 console.log('PSE_FOOTER_ADMIN_CONTROLS='+JSON.stringify(adminInfo));

 if(output.inventoryStatus!==200)throw Error('TablePress inventory unavailable');
} finally {await browser.close();}
