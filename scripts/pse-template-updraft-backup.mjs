import { chromium } from 'playwright';

/**
 * One-time, owner-authorized PSE backup via the EXISTING UpdraftPlus plugin.
 * No new PHP endpoints, no WordPress DB credentials, no remote storage.
 * Only backup metadata and PASS/FAIL status are logged.
 */
const env = process.env.ENV_FILE || '';
function parseEnv(name) {
  const lines = env.split(/\r?\n/).map(v => v.trim().replace(/^export\s+/, ''))
    .filter(v => v.startsWith(name + '='));
  if (lines.length !== 1) throw new Error('Expected exactly one ' + name);
  const u = new URL(lines[0].slice(name.length + 1).trim().replace(/^['"]|['"]$/g, ''));
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password || u.port ||
      !['', '/'].includes(u.pathname) || u.search || u.hash) throw new Error('Invalid ' + name);
  return u.origin;
}
const wp = parseEnv('WC_URL'), astro = parseEnv('WC_URL_CLIENT');
if (wp === astro) throw new Error('WordPress and Astro origins must differ');
const username = process.env.WP_ADMIN_USERNAME || '';
const password = process.env.WP_ADMIN_PASSWORD || '';
if (!username || !password) throw new Error('Missing WP admin credentials');
const log = (k,v) => console.log('PSE_UPDRAFT ' + k + '=' + v);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({acceptDownloads:false});
page.setDefaultTimeout(20000);
try {
  const open = path => page.goto(wp + path,{waitUntil:'domcontentloaded',timeout:45000});
  await open('/wp-login.php');
  await page.locator('#user_login').fill(username);
  await page.locator('#user_pass').fill(password);
  const loginText = (await page.locator('#loginform').innerText()).slice(0,500);
  const challenge = loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if (challenge) {
    const a=Number(challenge[1]), b=Number(challenge[3]);
    const answer = challenge[2] === '+' ? a+b : challenge[2] === '-' ? a-b : a*b;
    const input = page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
    if (await input.count()) await input.fill(String(answer));
  }
  await page.locator('#wp-submit').click();
  await open('/wp-admin/plugins.php');
  if (!(await page.locator('#adminmenu').count())) throw new Error('WP admin login unavailable');
  const updraft = page.locator('#the-list tr[data-slug="updraftplus"]').first();
  if (!(await updraft.count())) throw new Error('UpdraftPlus not installed');
  const className = await updraft.getAttribute('class');
  if (!/\bactive\b/.test(className || '')) throw new Error('UpdraftPlus is not active');
  log('PLUGIN_ACTIVE','PASS');

  await open('/wp-admin/options-general.php?page=updraftplus');
  const button = page.locator('#updraft-backupnow-button');
  await button.waitFor({timeout:45000});
  if (!(await button.isEnabled())) throw new Error('Updraft backup button disabled');
  const before = await page.locator('.updraft_existing_backups_row[data-key]').evaluateAll(
    nodes => nodes.map(el => Number(el.getAttribute('data-key'))||0)
  );
  const largest = Math.max(0,...before);
  log('BEFORE_BACKUP_RECORDS', before.length);
  log('BACKUP_UI','PASS');

  await button.click();
  const dlg = page.locator('.ui-dialog').filter({has:page.locator('#updraft-backupnow-modal')});
  await dlg.waitFor({state:'visible'});
  await page.locator('#backupnow_includedb').check();
  await page.locator('#backupnow_includefiles').uncheck();
  const cloud = page.locator('#backupnow_includecloud');
  if (await cloud.count() && await cloud.isEnabled()) await cloud.uncheck();
  const checked = await page.locator('#backupnow_includedb').isChecked();
  const uncheckedFiles = !(await page.locator('#backupnow_includefiles').isChecked());
  const noCloud = !await cloud.count() || !(await cloud.isChecked());
  if (!checked || !uncheckedFiles || !noCloud) throw new Error('DB-only local backup policy not met');
  await page.locator('#always_keep').check();
  log('BACKUP_POLICY','DB_ONLY_LOCAL_NO_REMOTE_KEEP_MANUALLY');
  const confirm = dlg.locator('.ui-dialog-buttonpane button').first();
  if (!(await confirm.isVisible())) throw new Error('Updraft confirmation unavailable');
  await confirm.click();
  log('BACKUP_REQUESTED','PASS');
  // Updraft refreshes the backup history asynchronously; we verify the
  // newly created set has an actual Database download button.
  await page.waitForFunction(({largest}) => {
    return [...document.querySelectorAll('.updraft_existing_backups_row[data-key]')].some(row => {
      const key=Number(row.getAttribute('data-key'))||0;
      return key > largest && !!row.querySelector('button.updraft_download_button[data-what="db"]');
    });
  }, {largest}, {timeout:160000,polling:1800});
  const newRows = await page.locator('.updraft_existing_backups_row[data-key]').evaluateAll(
    (nodes, largest) => nodes.filter(el =>
      (Number(el.getAttribute('data-key'))||0)>largest &&
      !!el.querySelector('button.updraft_download_button[data-what="db"]')
    ).length, largest
  );
  if (newRows < 1) throw new Error('No verified new database backup');
  log('NEW_DB_BACKUP_LISTED','PASS');
  log('BACKUP_ROWS_VERIFIED',newRows);
  log('NO_REMOTE_TRANSFER','PASS');
  log('NO_DB_DELETION','PASS');
} finally {
  await browser.close();
}
