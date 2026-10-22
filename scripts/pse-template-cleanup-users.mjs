import { chromium } from 'playwright';

// One-time PSE-only: remove precisely the five NCKH test logins via native
// WordPress UI, after confirming an UpdraftPlus DB backup. Never delete admins
// or touch unrelated accounts/content. No credentials/usernames/IDs in logs.
const env=process.env.ENV_FILE||'';
function origin(name) {
  const xs=env.split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''))
    .filter(x=>x.startsWith(name+'='));
  if(xs.length!==1)throw Error('Expected one '+name);
  const url=new URL(xs[0].slice(name.length+1).trim().replace(/^['"]|['"]$/g,''));
  if(url.protocol!=='https:'||!url.hostname||url.port||url.username||url.password||
     !['/',''].includes(url.pathname)||url.search||url.hash)throw Error('Invalid '+name);
  return url.origin;
}
const wp=origin('WC_URL'),astro=origin('WC_URL_CLIENT');
if(wp===astro)throw Error('WordPress/Astro origins must be isolated');
const username=process.env.WP_ADMIN_USERNAME||'';
const password=process.env.WP_ADMIN_PASSWORD||'';
if(!username||!password)throw Error('Missing authenticated admin secrets');
const report=(key,value)=>console.log('PSE_USER_CLEANUP '+key+'='+value);
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({acceptDownloads:false});
page.setDefaultTimeout(25000);
const go=path=>page.goto(wp+path,{waitUntil:'domcontentloaded',timeout:45000});
async function idsForRole(role,expected) {
  await go('/wp-admin/users.php?role='+encodeURIComponent(role));
  if(page.url().includes('wp-login.php'))throw Error('Admin session expired');
  const ids=await page.locator('#the-list input[name="users[]"]').evaluateAll(
    nodes=>nodes.map(n=>n.value).filter(v=>/^\d{1,15}$/.test(v))
  );
  if(ids.length!==expected || new Set(ids).size!==ids.length)
    throw Error('Role mismatch: '+role+' expected '+expected+' got '+ids.length);
  report('ROLE_'+role.toUpperCase()+'_MATCH','PASS');
  return ids;
}
try {
  await go('/wp-login.php');
  await page.locator('#user_login').fill(username);
  await page.locator('#user_pass').fill(password);
  const text=(await page.locator('#loginform').innerText()).slice(0,500);
  const math=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(math) {
    const a=Number(math[1]),b=Number(math[3]);
    const result=math[2]==='+'?a+b:math[2]==='-'?a-b:a*b;
    const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
    if(await input.count())await input.fill(String(result));
  }
  await page.locator('#wp-submit').click();
  await go('/wp-admin/users.php');
  if(!(await page.locator('#adminmenu').count()))throw Error('WP admin unavailable');
  report('ADMIN_AUTH','PASS');

  // Verify an existing protected UpdraftPlus DB backup set (created earlier).
  await go('/wp-admin/options-general.php?page=updraftplus');
  await page.locator('#updraft-backupnow-button').waitFor({timeout:45000});
  const now=Math.floor(Date.now()/1000);
  const recent=await page.locator('.updraft_existing_backups_row[data-key]').evaluateAll(
    (rows,cutoff)=>rows.filter(row=>
      (Number(row.getAttribute('data-key'))||0)>=cutoff &&
      !!row.querySelector('button.updraft_download_button[data-what="db"]')
    ).length,now-86400
  );
  if(recent<1)throw Error('No recent verified Updraft database backup; refusing deletion');
  report('RECENT_DB_BACKUP','PASS');

  const administrators=await idsForRole('administrator',1);
  const students=await idsForRole('nckh_student',4);
  const teachers=await idsForRole('nckh_teacher',1);
  const ids=[...students,...teachers];
  if(new Set(ids).size!==5 || ids.some(v=>administrators.includes(v)))
    throw Error('User role sets overlap; refusing deletion');
  report('TARGET_USERS','5');

  await go('/wp-admin/users.php');
  const all=await page.locator('#the-list tr[id^="user-"]').count();
  if(all!==6)throw Error('WP users count changed; refusing deletion');
  for(const id of ids) {
    const cb=page.locator('#the-list input[name="users[]"][value="'+id+'"]');
    if((await cb.count())!==1)throw Error('Target missing from WP users form');
    await cb.check();
  }
  await page.locator('#bulk-action-selector-top').selectOption('delete');
  await page.locator('#doaction').click();
  const form=page.locator('#updateusers');
  await form.waitFor({timeout:25000});
  const selected=await form.locator('input[name="users[]"]').evaluateAll(nodes=>nodes.map(n=>n.value));
  if(selected.length!==5 || selected.some(x=>!ids.includes(x)) || new Set(selected).size!==5)
    throw Error('WP deletion confirmation contains unexpected users');

  for(const id of ids) {
    const reassign=form.locator('input[type="radio"][name="delete_option['+id+']"][value="reassign"]');
    if(await reassign.count()) {
      await reassign.check();
      const select=form.locator('select[name="reassign_user['+id+']"]');
      if((await select.count())!==1)throw Error('Content reassignment control missing');
      await select.selectOption(administrators[0]);
    } else {
      const safe=form.locator('input[type="hidden"][name="delete_option['+id+']"][value="delete"]');
      if((await safe.count())!==1)throw Error('Unrecognized delete option');
    }
  }
  report('DELETE_CONFIRMATION_BOUNDARY','PASS');
  await form.locator('#submit').click();
  await go('/wp-admin/users.php');
  const remaining=await page.locator('#the-list tr[id^="user-"]').count();
  if(remaining!==1)throw Error('Expected exactly one remaining administrator');
  const admins=await idsForRole('administrator',1);
  if(admins[0]!==administrators[0])throw Error('Administrator identity changed');
  await idsForRole('nckh_student',0);
  await idsForRole('nckh_teacher',0);
  report('REMOVED_TEST_LOGINS','5');
  report('PRESERVED_ADMIN','PASS');
  report('DB_BASELINE_USER_ROLES','PASS');
} finally {
  await browser.close();
}
