/**
 * Complete the existing native WordPress Page menu cutover through the
 * WordPress Menu Manager editor. No direct postmeta/DB/API impersonation.
 * Explicit, bounded, idempotent: only ten approved corporate child items.
 */
import { chromium } from 'playwright';
const setting=(name)=>{
 const xs=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
 const line=xs.filter(s=>s.startsWith(name+'='));
 if(line.length!==1)throw Error('Missing or ambiguous '+name);
 const u=new URL(line[0].slice(name.length+1).trim().replace(/^['"]|['"]$/g,''));
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||
    !['','/'].includes(u.pathname))throw Error('Invalid HTTPS origin');
 return u.origin;
};
const wp=setting('WC_URL');
const expected=[
 'thong-diep','hoi-dong-quan-tri','ban-kiem-soat','ban-giam-doc',
 'so-do-to-chuc','qua-trinh-hinh-thanh-phat-trien','tam-nhin-su-menh',
 'dinh-huong-phat-trien','nganh-nghe-kinh-doanh','thanh-tuu'
];
const apply=['1','true'].includes(String(process.env.PSE_CORPORATE_MENU_BIND_APPLY||'').toLowerCase());
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('Missing WP Admin credentials');
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:950}});
const page=await ctx.newPage();
try{
 await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const text=await page.locator('body').innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
     text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],answer=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error('Unsupported login challenge');
   await input.fill(String(answer));
  }
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WordPress authentication failed');
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  if(!r.ok)throw Error('Missing WP REST nonce');
  const value=(await r.text()).trim();
  if(!/^[A-Za-z0-9]{8,24}$/.test(value)||value==='0')throw Error('Invalid WP REST nonce');
  return value;
 });
 const api=async(path)=>await page.evaluate(async({path,nonce})=>{
   const response=await fetch(path,{credentials:'same-origin',headers:{'X-WP-Nonce':nonce,Accept:'application/json'}});
   return {http:response.status,body:await response.json()};
 },{path,nonce});
 const [menuItems,cmsPages,menuResponse]=await Promise.all([
   api('/wp-json/wp/v2/menu-items?context=edit&per_page=100'),
   api('/wp-json/wp/v2/pages?context=edit&status=publish&per_page=100&_fields=id,slug,status'),
   api('/wp-json/esc-api/v1/menus')
 ]);
 if(menuItems.http!==200||!Array.isArray(menuItems.body)||
    cmsPages.http!==200||!Array.isArray(cmsPages.body)||
    menuResponse.http!==200||!menuResponse.body?.success)
   throw Error('WordPress menu preflight unavailable');
 const roots=menuItems.body.filter(x=>String(x.title?.raw||x.title?.rendered||'').trim()==='PVFCCo-PSE');
 if(roots.length!==1)throw Error('Unexpected company navigation root');
 const children=menuItems.body.filter(x=>Number(x.parent)===Number(roots[0].id));
 if(children.length!==10)throw Error('Expected ten original menu items, found '+children.length);
 const pagesById=new Map(cmsPages.body.map(x=>[Number(x.id),x]));
 const links=children.map(item=>{
  if(item.type!=='post_type'||item.object!=='page'||!Number.isSafeInteger(Number(item.object_id)))
   throw Error('Menu item is no longer a native WordPress Page link: '+item.id);
  const pageItem=pagesById.get(Number(item.object_id));
  if(!pageItem||pageItem.status!=='publish'||!expected.includes(pageItem.slug))
   throw Error('Wrong or unpublished WordPress Page for menu '+item.id);
  return {id:Number(item.id),pageId:Number(item.object_id),slug:pageItem.slug};
 });
 if(new Set(links.map(x=>x.slug)).size!==10)throw Error('Duplicate/missing WordPress Page in corporate menu');
 const header=menuResponse.body.menus?.Header?.vi;
 if(!header?.id)throw Error('WordPress Header/vi menu unavailable');
 const root=header.items.find(x=>String(x.label||'').trim()==='PVFCCo-PSE');
 const current=root?.children||[];
 if(current.length!==10)throw Error('Frontend Menu Manager corporate count differs from native menu');
 const wrong=current.filter(item=>item.linkMode!=='page'||item.linkType!=='internal'||
  !expected.includes(String(item.slug||'').replace(/^\/+|\/+$/g,'')));
 console.log('PSE_CORPORATE_MENU_PREFLIGHT='+JSON.stringify({
  menuId:header.id,items:links.length,wrong:wrong.length,mode:apply?'apply':'audit',
  nativeTypes:links.every(x=>x.pageId>0)
 }));
 if(!wrong.length){
   console.log('PSE_CORPORATE_MENU_BIND=ALREADY_CORRECT');
 }else if(!apply){
   console.log('PSE_CORPORATE_MENU_BIND=NEEDS_NATIVE_EDITOR_SAVE');
 }else{
   const editor=await page.goto(wp+'/wp-admin/nav-menus.php?action=edit&menu='+Number(header.id),{
      waitUntil:'domcontentloaded',timeout:60000
   });
   if(editor?.status()!==200||!await page.locator('#menu-to-edit').count())
     throw Error('Native WordPress menu editor unavailable');
   const prepared=await page.evaluate(rows=>{
    for(const row of rows){
      const box=document.querySelector('.esc-menu-item-fields[data-item-id="'+row.id+'"]');
      if(!box)return {ok:false,id:row.id,reason:'field missing'};
      const mode=box.querySelector('select[name="esc-menu-item-link-type['+row.id+']"]');
      const ref=box.querySelector('select[name="esc-menu-item-page-id['+row.id+']"]');
      if(!mode||!ref)return {ok:false,id:row.id,reason:'editor selects missing'};
      if(!Array.from(ref.options).some(option=>option.value===String(row.pageId))){
        const option=document.createElement('option');
        option.value=String(row.pageId); option.text='WordPress Page '+row.pageId;
        ref.add(option);
      }
      mode.value='page';
      ref.value=String(row.pageId);
      if(mode.value!=='page'||ref.value!==String(row.pageId))
        return {ok:false,id:row.id,reason:'editor value cannot be selected'};
    }
    return {ok:true,count:rows.length};
   },links);
   if(!prepared.ok||prepared.count!==10)throw Error('WordPress editor preflight failed: '+JSON.stringify(prepared));
   const save=page.locator('input[name="save_menu"]:visible').first();
   if(!await save.count())throw Error('WordPress native Save Menu button absent');
   await Promise.all([page.waitForLoadState('domcontentloaded'),save.click()]);
   const final=await api('/wp-json/esc-api/v1/menus');
   const nodes=final.body?.menus?.Header?.vi?.items?.find(x=>String(x.label||'').trim()==='PVFCCo-PSE')?.children||[];
   if(final.http!==200||nodes.length!==10||nodes.some(item=>
     item.linkMode!=='page'||item.linkType!=='internal'||!expected.includes(String(item.slug||'').replace(/^\/+|\/+$/g,''))))
     throw Error('Menu Manager did not save all native Page links');
   const logs=await api('/wp-json/astro/v1/get-menu-logs');
   if(logs.http!==200||logs.body?.changed!==true)
     throw Error('Menu cache dirty flag missing after native Save Menu');
   console.log('PSE_CORPORATE_MENU_BIND=PASS; saved=10; native WordPress Page links=10; menu_dirty=true');
 }
}finally{await browser.close()}
