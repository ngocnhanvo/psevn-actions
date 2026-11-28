/** PSE Header/vi: make the verified shareholder branch navigable and remove
 * only its redundant "Tất cả" child. All writes use native WordPress APIs and
 * Menu Manager with read-before-write/read-after-write; no other item changes.
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const mode=(await readFile('.pse-shareholder-all-menu-request','utf8')).trim().split('\n')[0];
if(!['MODE=AUDIT_PARENT','MODE=APPLY_PARENT'].includes(mode)) throw Error('Unexpected shareholder menu mode');
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const expected=mode==='MODE=AUDIT_PARENT'
 ? 'audit(pse): inspect shareholder parent navigation'
 : 'cms(pse): link shareholder parent and remove redundant all item';
if(String(evt.head_commit?.message||'').split('\n')[0]!==expected) throw Error('Invalid shareholder change authorization');

const config=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
const getOrigin=key=>{
 const found=config.filter(s=>s.startsWith(key+'='));
 if(found.length!==1) throw Error('Missing '+key);
 const u=new URL(found[0].slice(key.length+1).replace(/^['"]|['"]$/g,''));
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))
  throw Error('Invalid '+key);
 return u.origin;
};
const wp=getOrigin('WC_URL'),front=getOrigin('WC_URL_CLIENT');
if(wp===front)throw Error('WordPress and frontend origins must be distinct');
const href=front+'/tin-tuc-su-kien/thong-tin-co-dong';
const lower=s=>String(s||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
const flatten=(list,parent=0)=>list.flatMap(n=>[{...n,parentID:parent},...flatten(n.children||[],Number(n.id))]);
const canonicalPath='/tin-tuc-su-kien/thong-tin-co-dong';
const normalizeHref=s=>{
 const raw=String(s||'').trim();
 if(!raw)return '';
 try{
  const u=new URL(raw,front+'/');
  return u.origin===front?u.pathname.replace(/\/+$/,''):raw.replace(/\/+$/,'');
 }catch{return raw.replace(/\/+$/,'')}
};
const ids=list=>list.map(n=>Number(n.id)).sort((a,b)=>a-b).join(',');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
try{
 await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const body=await page.locator('body').innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=Number(m[1]),b=Number(m[3]),v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error('Unresolved WordPress login verification');
   await input.fill(String(v));
  }
  await Promise.all([page.waitForLoadState('domcontentloaded',{timeout:50000}),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WordPress login unsuccessful');
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  if(!r.ok) throw Error('WordPress nonce HTTP '+r.status);
  return (await r.text()).trim();
 });
 const api=async(path,method='GET',body)=>page.evaluate(async({path,nonce,method,body})=>{
  const r=await fetch(path,{method,credentials:'same-origin',cache:'no-store',
   headers:{'X-WP-Nonce':nonce,'Accept':'application/json',...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,data:await r.json().catch(()=>null)};
 },{path,nonce,method,body});
 const readMenu=async()=>{
  const r=await api('/wp-json/esc-api/v1/menus?_esc_preview='+Date.now());
  const menu=r.data?.menus?.Header?.vi;
  if(r.http!==200||r.data?.success!==true||!Number.isSafeInteger(Number(menu?.id))||!Array.isArray(menu?.items))
   throw Error('WordPress Header/vi unavailable or invalid HTTP '+r.http);
  return menu;
 };
 const [menu,category,archive]=await Promise.all([
  readMenu(),
  api('/wp-json/wp/v2/categories?slug=thong-tin-co-dong&hide_empty=false&_fields=id,slug,count'),
  api('/wp-json/wp/v2/pages/77030?context=edit&_fields=id,slug,status,acf')
 ]);
 if(Number(menu.id)!==1687||category.http!==200||category.data?.length!==1||
    Number(category.data[0].id)!==1744||category.data[0].slug!=='thong-tin-co-dong'||
    archive.http!==200||archive.data?.status!=='publish'||
    archive.data?.slug!=='tin-tuc-su-kien'||archive.data?.acf?.key!=='ssr-posts')
  throw Error('Verified WordPress archive/menu baseline drift; refuse write');
 const dest=await page.request.get(href,{timeout:60000,failOnStatusCode:false});
 if(dest.status()!==200)throw Error('Destination page is HTTP '+dest.status());
 const current=flatten(menu.items);
 const branch=current.filter(x=>lower(x.label)==='tin tức cổ đông');
 if(branch.length!==1||Number(branch[0].id)!==77022||branch[0].parentID===0)
  throw Error('Shareholder branch identity changed');
 const parent=branch[0];
 const all=current.filter(x=>lower(x.label)==='tất cả'&&x.parentID===Number(parent.id));
 if(all.length>1||(all.length===1&&(Number(all[0].id)!==82063||
   (all[0].children||[]).length>0||normalizeHref(all[0].href)!==canonicalPath)))
  throw Error('Redundant shareholder child identity or destination changed');
 const allItem=all[0]||null;
 const parentCorrect=parent.linkMode==='custom'&&normalizeHref(parent.href)===canonicalPath;
 if(!parentCorrect && !['none','page','custom'].includes(String(parent.linkMode||'')))
  throw Error('Unexpected parent link mode');
 // A different live target is never silently replaced.
 if(!parentCorrect&&String(parent.href||'').trim()&&
    !['#','/'].includes(String(parent.href).trim())&&normalizeHref(parent.href)!==canonicalPath)
  throw Error('Parent already points somewhere else: refuse overwrite');
 const baseline=ids(current);
 console.log('PSE_SHAREHOLDER_PARENT_PREFLIGHT='+JSON.stringify({
  mode,menuId:menu.id,parentId:parent.id,parentLinkMode:parent.linkMode,
  parentHref:parent.href||'',childId:allItem?.id||null,
  childHref:allItem?.href||'',otherChildren:parent.children?.length||0,
  targetPath:'/tin-tuc-su-kien/thong-tin-co-dong',totalBefore:current.length,
  parentCorrect,readOnly:mode==='MODE=AUDIT_PARENT'
 }));
 if(mode==='MODE=AUDIT_PARENT'){
  console.log('PSE_SHAREHOLDER_PARENT_AUDIT=PASS NO_CMS_WRITE=PASS');
  process.exitCode=0;
 } else {
  if(!parentCorrect){
   const res=await page.goto(wp+'/wp-admin/nav-menus.php?action=edit&menu='+Number(menu.id),
    {waitUntil:'domcontentloaded',timeout:60000});
   if(res?.status()!==200||await page.locator('form#update-nav-menu').count()!==1)
    throw Error('Native Menu Manager editor unavailable');
   const fields=await page.evaluate(id=>{
    const form=document.querySelector('form#update-nav-menu');
    const find=name=>form?.querySelector('[name="'+name+'['+id+']"]');
    const select=find('esc-menu-item-link-type'),custom=find('esc-menu-item-custom-url'),native=find('menu-item-url');
    return {select:select?.value||'',custom:custom?.value||'',native:native?.value||'',
     options:Array.from(select?.options||[]).map(o=>o.value)};
   },Number(parent.id));
   if(!fields.options.includes('custom')||!['none','page','custom'].includes(fields.select)||
     (fields.custom&&!['#','/'].includes(fields.custom)&&normalizeHref(fields.custom)!==canonicalPath)||
     (fields.native&&!['#','/'].includes(fields.native)&&normalizeHref(fields.native)!==canonicalPath))
    throw Error('Parent Menu Manager fields do not match safe source baseline');
   await Promise.all([
    page.waitForLoadState('domcontentloaded',{timeout:60000}),
    page.evaluate(({id,href})=>{
     const form=document.querySelector('form#update-nav-menu');
     if(!(form instanceof HTMLFormElement))throw Error('Native form missing');
     const field=n=>form.querySelector('[name="'+n+'['+id+']"]');
     const select=field('esc-menu-item-link-type');
     const custom=field('esc-menu-item-custom-url');
     const native=field('menu-item-url');
     if(!(select instanceof HTMLSelectElement)||!(custom instanceof HTMLInputElement)||
        !(native instanceof HTMLInputElement))throw Error('Missing native link fields');
     select.value='custom'; select.dispatchEvent(new Event('change',{bubbles:true}));
     custom.value=href; custom.dispatchEvent(new Event('change',{bubbles:true}));
     native.value=href; native.dispatchEvent(new Event('change',{bubbles:true}));
     const save=form.querySelector('#save_menu_header')||form.querySelector('input[name="save_menu"]');
     if(!(save instanceof HTMLElement))throw Error('Native Save Menu missing');
     form.requestSubmit(save);
    },{id:Number(parent.id),href})
   ]);
   const afterSave=flatten((await readMenu()).items);
   const latest=afterSave.find(x=>Number(x.id)===Number(parent.id));
   if(ids(afterSave)!==baseline||latest?.linkMode!=='custom'||normalizeHref(latest?.href)!==canonicalPath)
    throw Error('Native parent Save Menu readback did not preserve menu identities; stop before delete');
   console.log('PSE_SHAREHOLDER_PARENT_URL_SAVE=PASS id='+parent.id);
  }
  // WP menu-item deletion has no trash facility. User expressly requested
  // removing exactly this redundant item; validate before permanent delete.
  const preDelete=flatten((await readMenu()).items);
  const duplicate=preDelete.filter(x=>lower(x.label)==='tất cả'&&x.parentID===Number(parent.id));
  if(duplicate.length>1||(duplicate.length===1&&
     (Number(duplicate[0].id)!==82063||normalizeHref(duplicate[0].href)!==canonicalPath)))
   throw Error('Child changed just before deletion');
  if(duplicate.length===1){
   const deleted=await api('/wp-json/wp/v2/menu-items/82063?force=true','DELETE');
   if(deleted.http!==200||deleted.data?.deleted!==true||Number(deleted.data?.previous?.id)!==82063)
    throw Error('WordPress native menu-item deletion not confirmed HTTP '+deleted.http);
  }
  const final=flatten((await readMenu()).items);
  const kept=preDelete.filter(x=>Number(x.id)!==82063);
  const updated=final.find(x=>Number(x.id)===Number(parent.id));
  if(ids(final)!==ids(kept)||updated?.linkMode!=='custom'||
     normalizeHref(updated?.href)!==canonicalPath||
     final.some(x=>x.parentID===Number(parent.id)&&lower(x.label)==='tất cả'))
   throw Error('Shareholder final WordPress menu readback invalid');
  const preserved=kept.every(old=>{
   const now=final.find(x=>Number(x.id)===Number(old.id));
   return now && Number(now.parentID)===Number(old.parentID)&&now.label===old.label&&
    (Number(now.id)===Number(parent.id)||now.href===old.href);
  });
  if(!preserved)throw Error('Unrelated WordPress menu item changed');
  console.log('PSE_SHAREHOLDER_PARENT_APPLY=PASS '+JSON.stringify({
   parentId:parent.id,removedItemId:allItem?.id||null,totalAfter:final.length,
   canonicalPath:'/tin-tuc-su-kien/thong-tin-co-dong',
   preservedOthers:true,needsAstroRebuild:true
  }));
 }
} finally {await browser.close()}
