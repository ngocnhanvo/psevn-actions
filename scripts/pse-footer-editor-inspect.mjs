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
 await page.goto(u.origin+'/wp-admin/admin.php?page=tablepress&action=edit&table_id=pub_footer_assets_vi',{waitUntil:'domcontentloaded',timeout:65000});
 await page.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&typeof window.tp?.editor?.setValueFromCoords==='function',null,{timeout:30000});
 const editor=await page.evaluate(()=>({
  tableId:window.tp?.table?.id,
  grid:window.tp?.table?.data,
  imageButtons:[...document.querySelectorAll('button,a,[role="menuitem"]')].filter(el=>/image|ảnh|hình|media|insert/i.test(el.getAttribute('title')||'')||/image|ảnh|hình|media|insert/i.test(el.textContent||'')).slice(0,45).map(el=>({tag:el.tagName,text:(el.textContent||'').trim().slice(0,60),title:el.getAttribute('title'),id:el.id,cls:(el.className||'').toString().slice(0,130)})),
  editorFunctions:Object.keys(window.tp?.editor||{}).filter(k=>/add|row|image|insert|cell|select|focus/i.test(k)).slice(0,70),
  panelText:document.body.innerText.slice(-1400),
 }));
 console.log('PSE_FOOTER_NATIVE_EDITOR_INSPECT='+JSON.stringify(editor));
 const rowFns=await page.evaluate(()=>({
  insertRow: String(window.tp?.editor?.insertRow||'').slice(0,1500),
  selectedCell:String(window.tp?.editor?.updateSelectionFromCoords||'').slice(0,600),
  layoutButtons:[...document.querySelectorAll('#tablepress_edit-table button, #tablepress-edit-table button, .tablepress_edit-table button')].map(el=>({text:(el.textContent||'').trim().slice(0,55),title:el.getAttribute('title')})).slice(0,40)
 }));
 console.log('PSE_FOOTER_ROW_NATIVE_FNS='+JSON.stringify(rowFns));
 await page.evaluate(()=>{window.tp.editor.updateSelectionFromCoords(2,2);});
 await page.getByRole('button',{name:'Insert Image',exact:true}).evaluate(el=>el.click());
 await page.waitForTimeout(900);
 const modal=await page.evaluate(()=>({
  modalText:[...document.querySelectorAll('.media-modal, [role="dialog"], .components-modal__frame')].filter(el=>getComputedStyle(el).display!=='none').map(el=>(el.innerText||'').slice(0,1100)),
  modalButtons:[...document.querySelectorAll('.media-modal button, [role="dialog"] button')].filter(el=>getComputedStyle(el).display!=='none').map(el=>({text:(el.textContent||'').trim().slice(0,70),cls:(el.className||'').toString().slice(0,110)})).slice(0,28)
 }));
 console.log('PSE_FOOTER_NATIVE_IMAGE_MODAL='+JSON.stringify(modal));


 if(output.inventoryStatus!==200)throw Error('TablePress inventory unavailable');
} finally {await browser.close();}
