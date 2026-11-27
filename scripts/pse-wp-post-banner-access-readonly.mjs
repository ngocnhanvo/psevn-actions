/** PSE authenticated admin capability audit. GET/read only: no post-new, save, upload, publish or banner writes. */
import { chromium } from 'playwright';
const envLines = String(process.env.ENV_FILE || '').split(/\r?\n).map(s => s.trim().replace(/^export\s+/, ''));
function env(name) {
  const rows = envLines.filter(s => s.startsWith(name + '='));
  if (rows.length !== 1) throw new Error('Missing unique ' + name);
  return rows[0].slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
}
const site = new URL(env('WC_URL'));
if (site.protocol !== 'https:' || site.hostname !== 'admin-pse.webnvn.com' ||
    site.port || site.username || site.password || site.search || site.hash ||
    !['', '/'].includes(site.pathname)) throw Error('Unexpected WP origin');
if (!process.env.WP_ADMIN_USERNAME || !process.env.WP_ADMIN_PASSWORD) {
  throw Error('WordPress admin credentials not configured');
}
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({ viewport: {width: 1440, height: 900}, locale:'vi-VN' });
const denied = /sorry, you are not allowed|you do not have sufficient permissions|không có quyền|không đủ quyền|không được phép truy cập|you are not permitted|permission denied|cheatin.*uh/i;
const guard = () => {if (new URL(page.url()).origin !== site.origin) throw Error('Unexpected redirect outside PSE admin');};
async function visit(path) {
  const response = await page.goto(site.origin + path, {waitUntil:'domcontentloaded', timeout:65000});
  guard();
  await page.waitForTimeout(1200);
  return {status:response?.status() || 0, url:page.url(), text:await page.locator('body').innerText()};
}
try {
  await visit('/wp-admin/');
  if (await page.locator('#user_login').count()) {
    await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
    await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
    const content = await page.locator('body').innerText();
    const m=content.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)
      || content.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m) {
      const a=Number(m[1]), b=Number(m[3]);
      const answer=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
      const challenge=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await challenge.count()) throw Error('Login challenge field not found');
      await challenge.fill(String(answer));
    }
    await page.locator('#wp-submit').click({noWaitAfter:true,timeout:30000});
    await page.waitForFunction(()=>location.pathname.startsWith('/wp-admin/') &&
      !document.querySelector('#loginform'),null,{timeout:55000});
  }
  guard();
  if (await page.locator('#loginform').count() || !page.url().includes('/wp-admin/'))
    throw Error('WordPress authentication did not reach admin');
  console.log('PSE_WP_AUTH=PASS host=admin-pse.webnvn.com read_only=true');

  const posts = await visit('/wp-admin/edit.php?post_type=post');
  const postUI = await page.evaluate(() => {
    const links=[...document.querySelectorAll('a[href]')];
    const create=links.some(a => {
      try {const u=new URL(a.href); return u.pathname.endsWith('/wp-admin/post-new.php') &&
        (!u.searchParams.has('post_type') || u.searchParams.get('post_type')==='post');}catch{return false;}
    });
    const main=document.querySelector('#wpbody-content');
    const title=main?.querySelector('h1')?.textContent?.trim() || '';
    return {create,title};
  });
  const postsAccessible = posts.status===200 && !denied.test(posts.text) && !posts.url.includes('wp-login') &&
    /\/wp-admin\/edit\.php/.test(posts.url);
  const canCreate = postsAccessible && postUI.create;
  console.log('PSE_POST_ADMIN_LIST='+ (postsAccessible?'PASS':'DENIED_OR_UNVERIFIED') +
    ' create_post_link='+canCreate+' http='+posts.status);

  // WordPress post-new.php is deliberately NOT visited; it can create an auto-draft.
  // WordPress REST capability detail is optional and never used for writes.
  let publishCapability='UNVERIFIED';
  try {
    const api = await page.evaluate(async () => {
      const nonce=globalThis.wpApiSettings?.nonce;
      if (!nonce) return null;
      const response=await fetch('/wp-json/wp/v2/users/me?context=edit',
        {headers:{'X-WP-Nonce':nonce},credentials:'same-origin'});
      if (!response.ok) return null;
      const data=await response.json();
      return typeof data.capabilities?.publish_posts==='boolean' ?
        data.capabilities.publish_posts : null;
    });
    if(typeof api==='boolean') publishCapability=String(api).toUpperCase();
  } catch {}
  console.log('PSE_POST_PUBLISH_CAPABILITY='+publishCapability);

  const table = await visit('/wp-admin/admin.php?page=tablepress_edit&table_id=pse_00_vi');
  const bannerUI=await page.evaluate(() => {
    const body=document.querySelector('#wpbody-content');
    const s=body?.innerText || '';
    const visibleButtons=[...(body?.querySelectorAll('button,input[type="submit"]')||[])].filter(el=>{
      const rect=el.getBoundingClientRect();return rect.width>0 || rect.height>0;
    }).map(el=>(el.textContent || el.value || el.getAttribute('aria-label') || '').trim());
    return {
      editorTitle:body?.querySelector('h1')?.textContent?.trim().slice(0,100)||'',
      hasTableId:s.includes('pse_00_vi') || !!document.querySelector('[data-table-id="pse_00_vi"]'),
      hasSave:visibleButtons.some(s=>/save|lưu|cập nhật|update/i.test(s)),
      hasTableEditor:!!body?.querySelector('form,textarea,table,[contenteditable],#tablepress_edit,#tablepress-edit'),
      visibleActionCount:visibleButtons.length
    };
  });
  const bannerAccessible=table.status===200 && !denied.test(table.text) && !table.url.includes('wp-login') &&
    table.url.includes('tablepress_edit');
  const bannerEditor=bannerAccessible && bannerUI.hasTableEditor && bannerUI.hasSave;
  console.log('PSE_BANNER_PSE_00_VI_EDITOR='+(bannerEditor?'PASS':'DENIED_OR_UNVERIFIED')+
    ' http='+table.status+' has_table_id='+bannerUI.hasTableId+' editor='+bannerUI.hasTableEditor+
    ' save_control='+bannerUI.hasSave+' action_count='+bannerUI.visibleActionCount);
  console.log('PSE_WP_POST_BANNER_CAPABILITY_SUMMARY='+JSON.stringify({
    auth:true,can_open_posts:postsAccessible,can_create_post:canCreate,
    can_publish_post:publishCapability,
    can_open_banner_editor:bannerAccessible,has_banner_save_controls:bannerEditor,
    checked_table:'pse_00_vi',no_cms_write:true
  }));
  if (!canCreate || !bannerEditor) process.exitCode=2;
} finally {await browser.close();}
