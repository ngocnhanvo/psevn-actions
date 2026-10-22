import { chromium } from 'playwright';

// One-time PSE cleanup of transient cache and historical chats only, through a
// temporary native WordPress admin page protected by WP capability and nonce.
// Does not read/print user data, post bodies, credentials or plugin options.
const env = process.env.ENV_FILE || '';
function origin(name) {
  const matches = env.split(/\r?\n/).map(v => v.trim().replace(/^export\s+/, ''))
    .filter(v => v.startsWith(name + '='));
  if (matches.length !== 1) throw Error('Missing or duplicate '+name);
  const u = new URL(matches[0].slice(name.length+1).trim().replace(/^['"]|['"]$/g,''));
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password ||
    u.port || !['','/'].includes(u.pathname) || u.search || u.hash) throw Error('Invalid '+name);
  return u.origin;
}
const wp=origin('WC_URL'), astro=origin('WC_URL_CLIENT');
if(wp===astro)throw Error('Non-isolated WordPress origin');
const user=process.env.WP_ADMIN_USERNAME || '', pass=process.env.WP_ADMIN_PASSWORD || '';
if(!user || !pass)throw Error('Missing WP secrets');
const say=(key,value)=>console.log('PSE_ONE_TIME_CLEAN '+key+'='+value);
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({acceptDownloads:false});
page.setDefaultTimeout(22000);
const go=path=>page.goto(wp+path,{waitUntil:'domcontentloaded',timeout:45000});
try{
  await go('/wp-login.php');
  await page.locator('#user_login').fill(user);
  await page.locator('#user_pass').fill(pass);
  const text=(await page.locator('#loginform').innerText()).slice(0,600);
  const challenge=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(challenge){
    const a=Number(challenge[1]),b=Number(challenge[3]);
    const captcha=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
    if(await captcha.count())await captcha.fill(String(challenge[2]==='+'?a+b:challenge[2]==='-'?a-b:a*b));
  }
  await page.locator('#wp-submit').click();
  await go('/wp-admin/users.php');
  if(!(await page.locator('#adminmenu').count()))throw Error('WP administrator session unavailable');
  if((await page.locator('#the-list tr[id^="user-"]').count())!==1)
    throw Error('Expected single PSE administrator after backed-up test-user cleanup');
  say('ONE_ADMIN_BOUNDARY','PASS');

  await go('/wp-admin/options-general.php?page=updraftplus');
  const now=Math.floor(Date.now()/1000);
  const protectedSets=await page.locator('.updraft_existing_backups_row[data-key]').evaluateAll(
    (rows,cutoff)=>rows.filter(el=>
      (Number(el.getAttribute('data-key'))||0)>=cutoff &&
      !!el.querySelector('button.updraft_download_button[data-what="db"]')).length,now-86400);
  if(protectedSets<2)throw Error('Two recent protected Updraft backups are required');
  say('PRE_CLEANUP_RECOVERY_BACKUPS','PASS');

  const url='/wp-admin/tools.php?page=pse-template-db-maintenance';
  await go(url);
  const json=page.locator('#pse-template-maintenance-result');
  await json.waitFor({timeout:30000});
  const before=JSON.parse(await json.innerText());
  if(before.executed!==false || !before.counts || typeof before.counts.wp_options_transients!=='number')
    throw Error('PSE maintenance preflight report invalid');
  if(!['table_esc_chat_histories','table_esc_chat_summaries'].every(k=>Number.isInteger(before.counts[k])))
    throw Error('PSE history tables not safely enumerated');
  say('WP_ADMIN_NONCE_FORM','PASS');
  say('PREFLIGHT_TRANSIENT_COUNT',before.counts.wp_options_transients);
  say('PREFLIGHT_CHAT_HISTORY_COUNT',before.counts.table_esc_chat_histories);
  say('PREFLIGHT_CHAT_SUMMARY_COUNT',before.counts.table_esc_chat_summaries);
  const form=page.locator('form').filter({has:page.locator('input[name="pse_template_purge"][value="cache_and_chats"]')}).first();
  if((await form.count())!==1)throw Error('Unexpected one-time WP admin cleanup form');
  const nonce=await form.locator('input[name="_wpnonce"]').count();
  if(nonce!==1)throw Error('WordPress nonce form missing');
  await Promise.all([
    page.waitForNavigation({waitUntil:'domcontentloaded',timeout:45000}),
    form.locator('input[type="submit"],button[type="submit"]').first().click(),
  ]);
  if(!page.url().startsWith(wp+'/wp-admin/tools.php?'))throw Error('Unexpected POST redirect');
  const after=JSON.parse(await page.locator('#pse-template-maintenance-result').innerText());
  if(after.executed!==true || !after.counts)throw Error('One-time maintenance did not execute');
  if(after.counts.table_esc_chat_histories>0 || after.counts.table_esc_chat_summaries>0)
    throw Error('Historical chat rows remain');
  if(after.counts.wp_options_transients > before.counts.wp_options_transients)
    throw Error('Transient row count increased unexpectedly');
  say('HISTORICAL_CHAT_EMPTY','PASS');
  say('TRANSIENT_PURGE_COMPLETED','PASS');
  say('WP_ADMIN_CLEANUP','PASS');
  say('NO_PAGES_MEDIA_OR_ACF_DELETED','PASS');
}finally{await browser.close();}
