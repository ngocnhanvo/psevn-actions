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
 if(output.numeric.http!==200||output.numeric.id!=='136'||output.numeric.fieldKeys.length!==6||
   !output.numeric.fieldKeys.every(k=>k==='')||output.numeric.rowCount!==1||output.numeric.rowGroups.some(Boolean)||
   output.global.http!==200||output.global.id!=='pub_footer_assets_vi'||
   JSON.stringify(output.global.fieldKeys)!==JSON.stringify(['group','label','image','value','href','visible']))throw Error('Pre-delete CMS state unexpectedly changed');
 const liveReferences=await page.evaluate(async()=>{
  const nonce=window.wpApiSettings?.nonce || await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text());
  const refs=[];
  for(const type of ['pages','posts']){
   for(let i=1;i<=16;i++){
    const resp=await fetch('/wp-json/wp/v2/'+type+'?context=edit&status=any&per_page=100&page='+i,{credentials:'same-origin',cache:'no-store',headers:{'X-WP-Nonce':nonce}});
    if(!resp.ok)throw Error('WordPress '+type+' inventory denied: '+resp.status);
    const arr=await resp.json();
    if(!Array.isArray(arr))throw Error('WordPress '+type+' inventory not an array');
    for(const post of arr){
      const source=String(post?.content?.raw || post?.content?.rendered || '');
      if(/\[table\s+id\s*=\s*["']?136\b/i.test(source)||/table_id[=:"']+136\b/i.test(source))refs.push({type,id:post.id});
    }
    const total=Number(resp.headers.get('X-WP-TotalPages')||1);
    if(i>=total)break;
    if(i===16)throw Error('Page inventory exceeded pagination limit; refuse deletion');
   }
  }
  return refs;
 });
 if(liveReferences.length)throw Error('Table 136 still referenced in WordPress posts/pages: '+JSON.stringify(liveReferences));
 const rawBackup=await page.evaluate(async()=>{
  const nonce=window.wpApiSettings?.nonce || await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text());
  const r=await fetch('/wp-json/tablepress/v1/table/136',{credentials:'same-origin',cache:'no-store',headers:{'X-WP-Nonce':nonce}});
  if(!r.ok)throw Error('Cannot obtain pre-delete table backup');
  return await r.json();
 });
 const empty = Array.isArray(rawBackup.items) && rawBackup.items.length===1 &&
  Object.values(rawBackup.items[0]||{}).every(v=>v==null || String(v).trim()==='');
 if(!empty)throw Error('Table 136 has non-blank cells; refuse deletion');
 const fs=await import('node:fs/promises');
 await fs.mkdir('artifacts/pse-footer-delete-136',{recursive:true});
 await fs.writeFile('artifacts/pse-footer-delete-136/table136-before.json',JSON.stringify(rawBackup,null,2)+'\n');
 await page.goto(u.origin+'/wp-admin/admin.php?page=tablepress',{waitUntil:'domcontentloaded',timeout:65000});
 const tableRows=page.locator('tr').filter({hasText:/\b136\b/}).filter({hasText:'Footer PSE - Thông tin bổ sung'});
 if(await tableRows.count()!==1)throw Error('TablePress admin native 136 row not unique');
 const row=tableRows.first();
 const del=row.getByRole('link',{name:'Delete',exact:true});
 if(await del.count()!==1)throw Error('TablePress native delete action missing');
 page.on('dialog', async dialog=>{if(dialog.type()==='confirm')await dialog.accept();else await dialog.dismiss()});
 await del.click({noWaitAfter:true,timeout:25000});
 await page.waitForTimeout(1300);
 const dialogs=page.locator('.ui-dialog:visible, [role="alertdialog"]:visible');
 if(await dialogs.count()){
   const buttons=dialogs.getByRole('button',{name:/^(Delete|Xóa|Yes, Delete|Delete Table)$/i});
   if(await buttons.count()!==1)throw Error('Native delete confirmation not identified: '+(await dialogs.innerText()).slice(0,320));
   await buttons.click({noWaitAfter:true,timeout:25000});
 }
 const final=await page.evaluate(async()=>{
  const nonce=window.wpApiSettings?.nonce || await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text());
  const get=async id=>{const r=await fetch('/wp-json/tablepress/v1/table/'+id,{credentials:'same-origin',cache:'no-store',headers:{'X-WP-Nonce':nonce}});return r.status};
  for(let i=0;i<12;i++){const gone=await get('136'),keep=await get('pub_footer_assets_vi');if(gone===404&&keep===200)return {gone,keep};await new Promise(ok=>setTimeout(ok,1000))}
  return {gone:await get('136'),keep:await get('pub_footer_assets_vi')};
 });
 console.log('PSE_FOOTER_NATIVE_DELETE_136='+JSON.stringify(final));
 if(final.gone!==404||final.keep!==200)throw Error('Native deletion not verified or live global table changed');

 if(output.inventoryStatus!==200)throw Error('TablePress inventory unavailable');
} finally {await browser.close();}
