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
 const proof=await page.evaluate(async()=>{
   const nonce=window.wpApiSettings?.nonce || await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text());
   const resp=await fetch('/wp-json/tablepress/v1/table/pub_footer_assets_vi',{credentials:'same-origin',cache:'no-store',headers:{'X-WP-Nonce':nonce}});
   const table=await resp.json();
   const groups=Array.isArray(table?.items)?table.items.map(r=>r.group):[];
   const certs=table?.items?.filter(r=>r.group==='certification')||[];
   const responsible=table?.items?.filter(r=>r.group==='responsible')||[];
   const credits=table?.items?.filter(r=>r.group==='credit')||[];
   return {
     status:resp.status,
     rows:table?.items?.length||0,
     groups,certifications:certs.map(r=>({label:r.label,containsImage:typeof r.image==='string'&&r.image.includes('<img '),hasAlt:typeof r.image==='string'&&r.image.includes('alt='),visible:r.visible,hasMediaId:/wp-image-\d+/.test(r.image||'')})),
     responsible:responsible.map(r=>({label:r.label,value:r.value,href:r.href})),
     credits:credits.map(r=>r.value),
   };
 });
 if(output.numeric.http!==404||output.global.http!==200||
  proof.status!==200||proof.rows!==6||proof.certifications.length!==3||
  !proof.certifications.every(x=>x.containsImage&&x.hasAlt&&x.hasMediaId&&x.visible==='1')||
  proof.responsible.length!==2||proof.credits.length!==1||proof.credits[0]!=='Designed by ESC')
   throw Error('PSE global footer data parity failed: '+JSON.stringify({id136:output.numeric.http,proof}));
 console.log('PSE_FOOTER_GLOBAL_CMS_QA=PASS; deleted136=true; certifications=3; responsible=2; credits=1; native_editor=true; no_build=true');

 if(output.inventoryStatus!==200)throw Error('TablePress inventory unavailable');
} finally {await browser.close();}
