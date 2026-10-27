/** Bind one existing "Tất cả" under shareholder news to the verified taxonomy archive.
 * MODE=AUDIT reads; MODE=APPLY saves via native WP Menu Manager only.
 * Never creates a Page/Category, reorders menu, or updates Astro source.
 */
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
const marker=(await readFile('.pse-shareholder-all-menu-request','utf8')).trim().split('\n')[0];
if(!['MODE=AUDIT','MODE=APPLY'].includes(marker))throw Error('Invalid mode');
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const message=String(evt.head_commit?.message||'').split('\n')[0];
const expected=marker==='MODE=AUDIT'?'audit(pse): inspect shareholder all menu route':'cms(pse): link existing shareholder all menu to taxonomy archive';
if(message!==expected)throw Error('Missing exact native CMS change authorization');
const cfg=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
const origin=key=>{
 const x=cfg.filter(s=>s.startsWith(key+'='));
 if(x.length!==1)throw Error(key+' missing/ambiguous');
 const u=new URL(x[0].slice(key.length+1).replace(/^['"]|['"]$/g,''));
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||
     !['','/'].includes(u.pathname))throw Error(key+' invalid');
 return u.origin;
};
const wp=origin('WC_URL'),site=origin('WC_URL_CLIENT'),lang='vi';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:950}});
const flat=(a,parent=0)=>a.flatMap(n=>[{...n,parentID:parent},...flat(n.children||[],Number(n.id))]);
const normalize=s=>String(s||'').normalize('NFC').trim().toLocaleLowerCase('vi').replace(/\s+/g,' ');
const red=(x)=>({http:x.http,code:typeof x.body?.code==='string'?x.body.code:'',length:Array.isArray(x.body)?x.body.length:0});
try{
 await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await page.locator('body').innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Unresolved WP login verification');
   await f.fill(String(v));
  }
  await Promise.all([page.waitForLoadState('domcontentloaded',{timeout:50000}),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WP admin login did not succeed');
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error('WP Rest nonce not available');
  return(await r.text()).trim();
 });
 const api=async path=>page.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{credentials:'same-origin',cache:'no-store',
    headers:{'X-WP-Nonce':nonce,Accept:'application/json'}});
  return {http:r.status,body:await r.json().catch(()=>null)};
 },{path,nonce});
 const [menu,cat,archive]=await Promise.all([
  api('/wp-json/esc-api/v1/menus?_esc_preview='+Date.now()),
  api('/wp-json/wp/v2/categories?slug=thong-tin-co-dong&hide_empty=false&_fields=id,slug,parent,count,name'),
  api('/wp-json/wp/v2/pages/77030?context=edit&_fields=id,slug,status,acf')
 ]);
 if(menu.http!==200||menu.body?.success!==true||cat.http!==200||
  !Array.isArray(cat.body)||cat.body.length!==1||
  cat.body[0]?.slug!=='thong-tin-co-dong'||archive.http!==200||
  archive.body?.status!=='publish'||archive.body.acf?.key!=='ssr-posts')
  throw Error('Native WP taxonomy/archive source failed preflight '+JSON.stringify({menu:red(menu),category:red(cat),archive:red(archive)}));
 const archiveRoot=String(archive.body.slug||'');
 const href=site+'/'+archiveRoot+'/thong-tin-co-dong';
 const categoryId=Number(cat.body[0].id);
 if(!Number.isSafeInteger(categoryId)||categoryId<1||!archiveRoot)throw Error('Invalid category identity');
 const menuVi=menu.body.menus?.Header?.[lang];
 if(!menuVi?.id||!Array.isArray(menuVi.items))throw Error('Header/vi not available');
 const nodes=flat(menuVi.items);
 const shareholder=nodes.filter(n=>normalize(n.label)==='tin tức cổ đông'&&n.parentID!==0);
 if(shareholder.length!==1)throw Error('Non-unique shareholder menu');
 const branch=shareholder[0];
 const children=nodes.filter(n=>n.parentID===Number(branch.id)&&normalize(n.label)==='tất cả');
 const existing=children.length===1?children[0]:null;
 if(children.length>1)throw Error('Duplicate "Tất cả" menu items: no write');
 const formUrl=wp+'/wp-admin/nav-menus.php?action=edit&menu='+Number(menuVi.id);
 const res=await page.goto(formUrl,{waitUntil:'domcontentloaded',timeout:60000});
 if(res?.status()!==200||await page.locator('form#update-nav-menu').count()!==1)throw Error('Native Menu Manager unavailable');
 let fields=null;
 if(existing){
  const id=Number(existing.id);
  fields=await page.evaluate(id=>{
   const form=document.querySelector('form#update-nav-menu');
   const get=n=>form?.querySelector('[name="'+n+'['+id+']"]')?.value??null;
   const link=form?.querySelector('[name="esc-menu-item-link-type['+id+']"]');
   return {linkMode:get('esc-menu-item-link-type'),modeOptions:Array.from(link?.options||[]).map(o=>o.value),
    customUrl:get('esc-menu-item-custom-url'),nativeUrl:get('menu-item-url'),
    wpType:get('menu-item-type'),parent:get('menu-item-parent-id'),
    label:get('esc-menu-item-label'),nativeTitle:get('menu-item-title')};
  },id);
 }
 const report={mode:marker,id:existing?.id||null,menuId:menuVi.id,
  branchId:branch.id,childCount:(branch.children||[]).length,
  categoryId,categoryPosts:Number(cat.body[0].count)||0,
  categorySlug:cat.body[0].slug,archiveRoot,
  canonicalPath:'/'+archiveRoot+'/thong-tin-co-dong',
  selected:existing?{label:existing.label,href:existing.href,linkMode:existing.linkMode,parentID:existing.parentID}:null,
  fields};
 console.log('PSE_SHAREHOLDER_ALL_PREFLIGHT='+JSON.stringify(report));
 if(marker==='MODE=AUDIT'){
  console.log('PSE_SHAREHOLDER_ALL_AUDIT=PASS NO_CMS_WRITE=PASS');
  process.exitCode=0;
 }else{
  if(!existing)throw Error('Not yet a saved WordPress native "Tất cả"; cannot safely choose target automatically');
  const id=Number(existing.id);
  const isCanonical=(String(existing.href||'').replace(/\/$/,'')===href&&existing.linkMode==='custom');
  if(isCanonical){console.log('PSE_SHAREHOLDER_ALL_APPLY=ALREADY_PASS');}
  else{
   if(!fields||!fields.modeOptions.includes('custom')||!Number.isSafeInteger(id)||id<1||
      fields.linkMode!=='page'||existing.linkMode!=='page'||
      Number(existing.parentID)!==Number(branch.id)||
      !['','/','#',null].includes(fields.customUrl)||
      ![null,''].includes(fields.nativeUrl)||
      normalize(existing.label)!=='tất cả')throw Error('Unexpected native menu fields; fail closed');
   const expectedIds=nodes.map(n=>Number(n.id)).sort((a,b)=>a-b).join(',');
   await Promise.all([
    page.waitForNavigation({waitUntil:'domcontentloaded',timeout:60000}),
    page.evaluate(({id,href})=>{
      const form=document.querySelector('form#update-nav-menu');
      if(!(form instanceof HTMLFormElement))throw Error('Native form missing');
      const field=n=>form.querySelector('[name="'+n+'['+id+']"]');
      const link=field('esc-menu-item-link-type');
      const custom=field('esc-menu-item-custom-url');
      const nativeUrl=field('menu-item-url');
      if(!(link instanceof HTMLSelectElement)||!(custom instanceof HTMLInputElement)||
         !(nativeUrl instanceof HTMLInputElement))throw Error('Missing native link fields');
      link.value='custom';link.dispatchEvent(new Event('change',{bubbles:true}));
      custom.value=href;custom.dispatchEvent(new Event('change',{bubbles:true}));
      nativeUrl.value=href;nativeUrl.dispatchEvent(new Event('change',{bubbles:true}));
      const button=form.querySelector('#save_menu_header')||form.querySelector('input[name="save_menu"]');
      if(!button)throw Error('WordPress native Save Menu missing');
      form.requestSubmit(button);
    },{id,href})
   ]);
   const after=await api('/wp-json/esc-api/v1/menus?_esc_preview='+Date.now());
   if(after.http!==200||after.body?.success!==true)throw Error('WordPress Menu readback failed');
   const latest=flat(after.body.menus?.Header?.vi?.items||[]);
   const n=latest.find(n=>Number(n.id)===id);
   if(n?.linkMode!=='custom'||String(n.href||'').replace(/\/$/,'')!==href||
       Number(n.parentID)!==Number(branch.id))throw Error('Saved menu route did not persist');
   if(latest.map(n=>Number(n.id)).sort((a,b)=>a-b).join(',')!==expectedIds)
     throw Error('Menu IDs unexpectedly changed after save');
   console.log('PSE_SHAREHOLDER_ALL_APPLY=PASS item_id='+id+' canonicalPath=/'+archiveRoot+
     '/thong-tin-co-dong menuPreserved=true backendSaved=true');
  }
 }
}finally{await browser.close()}
