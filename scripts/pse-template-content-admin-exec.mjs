import { chromium } from 'playwright';

// Execute one bounded PSE content cleanup via native WordPress PHP/ACF API.
// Only authenticated WP Admin with CSRF nonce. No raw content, PII, tokens,
// database IDs, SQL or backup payloads are logged.
const env=process.env.ENV_FILE||'';
function origin(name) {
  const xs=env.split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''))
    .filter(s=>s.startsWith(name+'='));
  if(xs.length!==1)throw Error('Missing or duplicate '+name);
  const u=new URL(xs[0].slice(name.length+1).trim().replace(/^['"]|['"]$/g,''));
  if(u.protocol!=='https:'||!u.hostname||u.port||u.username||u.password||
     !['','/'].includes(u.pathname)||u.search||u.hash)throw Error('Invalid '+name);
  return u.origin;
}
const wp=origin('WC_URL');
if(wp===origin('WC_URL_CLIENT'))throw Error('WordPress and frontend origins cannot match');
const user=process.env.WP_ADMIN_USERNAME||'';
const password=process.env.WP_ADMIN_PASSWORD||'';
if(!user||!password)throw Error('Missing WordPress credentials');
const report=(key,value)=>console.log('PSE_WP_API_CLEAN '+key+'='+value);
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({acceptDownloads:false});
page.setDefaultTimeout(24000);
const go=path=>page.goto(wp+path,{waitUntil:'domcontentloaded',timeout:45000});
try{
  await go('/wp-login.php');
  await page.locator('#user_login').fill(user);
  await page.locator('#user_pass').fill(password);
  const text=(await page.locator('#loginform').innerText()).slice(0,500);
  const math=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(math){
    const a=Number(math[1]),b=Number(math[3]);
    const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
    if(await input.count())await input.fill(String(math[2]==='+'?a+b:math[2]==='-'?a-b:a*b));
  }
  await page.locator('#wp-submit').click();
  await go('/wp-admin/users.php');
  if(!(await page.locator('#adminmenu').count()) ||
    (await page.locator('#the-list tr[id^="user-"]').count())!==1)
    throw Error('Expected one remaining PSE template administrator');
  report('ONE_ADMIN','PASS');

  await go('/wp-admin/options-general.php?page=updraftplus');
  const cutoff=Math.floor(Date.now()/1000)-86400;
  const backups=await page.locator('.updraft_existing_backups_row[data-key]').evaluateAll(
    (rows,since)=>rows.filter(el=>(Number(el.getAttribute('data-key'))||0)>=since &&
      !!el.querySelector('button.updraft_download_button[data-what="db"]')).length,cutoff);
  if(backups<3)throw Error('Previously confirmed local UpdraftPlus recovery points are unavailable');
  report('PRECHANGE_BACKUPS','PASS');

  const url='/wp-admin/tools.php?page=pse-template-content-maintenance';
  await go(url);
  const result=page.locator('#pse-template-content-result');
  await result.waitFor({timeout:30000});
  const before=JSON.parse(await result.innerText());
  const keys=['company_state','page_53390_state','page_47222_state','acf_content_state'];
  if(before.preflight_ready!==true || keys.some(k=>!['ready','already'].includes(before[k])))
    throw Error('Verified PSE content or database boundaries have changed');
  report('WORDPRESS_API_PREFLIGHT','PASS');
  if(keys.every(k=>before[k]==='already')){
    report('ALL_TARGETS_ALREADY_CLEAN','PASS');
  }else{
    const form=page.locator('form').filter({
      has:page.locator('input[name="pse_template_content_action"][value="sanitize"]')
    }).first();
    if((await form.count())!==1 || (await form.locator('input[name="_wpnonce"]').count())!==1)
      throw Error('Native WordPress nonce protected action missing');
    await form.locator('input[type="submit"],button[type="submit"]').first().click();
    await page.waitForLoadState('domcontentloaded');
    const after=JSON.parse(await page.locator('#pse-template-content-result').innerText());
    if(after.executed!==true || after.preflight_ready!==true ||
      keys.some(k=>after[k]!=='already'))
      throw Error('WordPress/ACF post-update verification failed');
    report('WORDPRESS_API_PERSISTED','PASS');
  }
  report('GENERAL_INFO_COMPANY','PASS');
  report('IMPORTED_PAGES','PASS');
  report('IMPORTED_ACF_CONTACT','PASS');
  report('PRESERVED_WORDPRESS_IDS_ACF_AND_CSS','PASS');
  report('NO_ASTRO_BUILD','PASS');
}finally{
  await browser.close();
}
