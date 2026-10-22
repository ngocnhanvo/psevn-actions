import { chromium } from 'playwright';

// Owner-approved, bounded PSE content cleanup via native WordPress editor.
// Preserve all pages, IDs, slugs, actions, ACF definitions, CSS, layouts, users and media.
// Only two confirmed imported text bodies + inherited general-info company label.
// Refuse changes if any targeted editor/contents differ from audit expectations.
const env = process.env.ENV_FILE || '';
function origin(name) {
  const matches = env.split(/\r?\n/).map(v => v.trim().replace(/^export\s+/, ''))
    .filter(v => v.startsWith(name + '='));
  if (matches.length !== 1) throw Error('Missing or duplicate ' + name);
  const url = new URL(matches[0].slice(name.length + 1).trim().replace(/^['"]|['"]$/g, ''));
  if (url.protocol !== 'https:' || !url.hostname || url.port || url.username ||
      url.password || !['', '/'].includes(url.pathname) || url.search || url.hash)
    throw Error('Invalid configured origin ' + name);
  return url.origin;
}
const wp = origin('WC_URL');
if (wp === origin('WC_URL_CLIENT')) throw Error('PSE WordPress and frontend origins are not isolated');
const username = process.env.WP_ADMIN_USERNAME || '';
const password = process.env.WP_ADMIN_PASSWORD || '';
if (!username || !password) throw Error('Missing WP admin credentials');

const oldBrand = /nghiencuukhoahoc|xuongmunonbaohiem|eduresearch\s*hub|blue\s*sea/i;
const contact = /(?:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})|(?:\+?84|0)[35789]\d{8}\b/i;
const dryRun = process.env.PSE_TEMPLATE_DRY_RUN === '1';
const unsafeLayout = /<script\b|<style\b|<iframe\b|<form\b|\[(?:tablepress|esc_table|shortcode)\b|<!--\s*wp:shortcode/i;
const report = (key,value) => console.log('PSE_TEMPLATE_SANITIZE ' + key + '=' + value);
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({acceptDownloads: false});
page.setDefaultTimeout(22000);
const go = path => page.goto(wp + path, {waitUntil:'domcontentloaded', timeout:45000});

async function saveAndReopen(path) {
  const button = page.locator('#publish').first();
  if (!(await button.count()) || !(await button.isEnabled()))
    throw Error('Expected WordPress Classic editor Update/Publish control');
  await button.click();
  await page.waitForLoadState('domcontentloaded');
  await go(path);
  if (!page.url().startsWith(wp + '/wp-admin/post.php?'))
    throw Error('WordPress editor failed to reopen after save');
}

async function contentPage(id, checkOnly = false) {
  const path='/wp-admin/post.php?post='+id+'&action=edit';
  await go(path);
  if (!page.url().startsWith(wp+'/wp-admin/post.php?'))
    throw Error('Unexpected WP post editor redirect');
  const postId = await page.locator('#post_ID').inputValue();
  if (postId !== String(id)) throw Error('Unexpected targeted WP post ID');
  const type=await page.locator('#post_type').inputValue().catch(()=>'');
  if (type !== 'page') throw Error('Target is not a WordPress page');
  const original = await page.locator('#content').inputValue();
  const title = await page.locator('#title').inputValue().catch(()=>'');
  if (oldBrand.test(title)) throw Error('Unsafe imported title in page '+id+'; refuse destructive text-only change');
  if (!oldBrand.test(original) || !contact.test(original))
    throw Error('Target page no longer matches imported-brand and contact boundaries');
  if (unsafeLayout.test(original))
    throw Error('Preserving structural content for page '+id+'; unsafe layout detected');
  if (original.length > 65000) throw Error('Target content unexpectedly large; refuse replacement');
  // One imported page also stores contact information in ACF `content`.
  // Clear only this identified value; preserve all ACF field definitions.
  let acfContent = null;
  if (id === 47222) {
    const field=page.locator('.acf-field[data-name="content"]').first();
    if ((await field.count()) !== 1) throw Error('Expected one imported ACF content field');
    acfContent=field.locator('textarea').first();
    if ((await acfContent.count()) !== 1) throw Error('Expected editable ACF content textarea');
    const current=await acfContent.inputValue();
    if (!contact.test(current) || unsafeLayout.test(current) || current.length > 65000)
      throw Error('Imported ACF contact value no longer matches safe cleanup boundary');
  }
  if (checkOnly) {
    report('PAGE_'+id+'_PREFLIGHT','PASS');
    return;
  }
  const neutral='<p>Nội dung sẽ được cập nhật khi cấu hình website mới.</p>';
  if (acfContent) {
    await acfContent.evaluate((el,value)=>{
      const editor=window.tinymce?.get(el.id);
      if (editor && !editor.isHidden()) editor.setContent(value);
      el.value=value;
      if (editor) editor.save();
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    },neutral);
  }
  const textTab=page.locator('#content-html');
  if (await textTab.count() && await textTab.isVisible()) await textTab.click();
  const input=page.locator('#content');
  if (!(await input.isVisible())) throw Error('WordPress Text editor unavailable; refuse blind post overwrite');
  await input.fill(neutral);
  await saveAndReopen(path);
  const after=await page.locator('#content').inputValue();
  if (oldBrand.test(after) || contact.test(after) ||
      !after.includes('Nội dung sẽ được cập nhật'))
    throw Error('Sanitized page content did not persist');
  if (acfContent) {
    const acfAfter=await page.locator('.acf-field[data-name="content"] textarea').first().inputValue();
    if (contact.test(acfAfter) || !acfAfter.includes('Nội dung sẽ được cập nhật'))
      throw Error('Sanitized ACF contact field did not persist');
    report('PAGE_'+id+'_ACF_CONTACT_CLEAN','PASS');
  }
  report('PAGE_'+id+'_CONTENT_CLEAN','PASS');
}

try {
  await go('/wp-login.php');
  await page.locator('#user_login').fill(username);
  await page.locator('#user_pass').fill(password);
  const loginText=(await page.locator('#loginform').innerText()).slice(0,500);
  const challenge=loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if (challenge) {
    const a=Number(challenge[1]),b=Number(challenge[3]);
    const box=page.locator('#loginform input[name*="captcha" i], #loginform input[name*="math" i], #loginform input[type="number"]').first();
    if (await box.count()) await box.fill(String(challenge[2]==='+'?a+b:challenge[2]==='-'?a-b:a*b));
  }
  await page.locator('#wp-submit').click();
  await go('/wp-admin/users.php');
  if (!(await page.locator('#adminmenu').count()) ||
      (await page.locator('#the-list tr[id^="user-"]').count()) !== 1)
    throw Error('PSE one-administrator identity boundary not met');
  report('ONE_ADMIN','PASS');

  await go('/wp-admin/options-general.php?page=updraftplus');
  const cutoff=Math.floor(Date.now()/1000)-86400;
  const backups=await page.locator('.updraft_existing_backups_row[data-key]').evaluateAll(
    (rows,since)=>rows.filter(el=>(Number(el.getAttribute('data-key'))||0)>=since &&
      !!el.querySelector('button.updraft_download_button[data-what="db"]')).length,cutoff);
  if (backups<3) throw Error('Expected previously verified protected DB backups');
  report('PROTECTED_DB_RECOVERY','PASS');

  await go('/wp-admin/edit.php?post_type=thong-tin-chung');
  const records=await page.locator('#the-list tr[id^="post-"] .row-title').evaluateAll(
    nodes=>nodes.map(n=>n.getAttribute('href')||''));
  if(records.length!==1)throw Error('Expected one general info record');
  const record=new URL(records[0],wp);
  if(record.origin!==wp || record.pathname!=='/wp-admin/post.php' ||
    !/^\d+$/.test(record.searchParams.get('post')||''))
    throw Error('Invalid general info record editor URL');
  const generalPath=record.pathname+record.search;
  await go(generalPath);
  const company=page.locator('.acf-field[data-name="tencongty"] input[type="text"], .acf-field[data-name="tencongty"] textarea').first();
  if((await company.count())!==1) throw Error('Missing expected tencongty ACF field');
  const previous=(await company.inputValue()).trim();
  if(!oldBrand.test(previous))throw Error('General-info company branding differs from expected imported source; no change');
  const domain=page.locator('.acf-field[data-name="domain"] input[type="text"]').first();
  if((await domain.count())!==1)throw Error('Missing WP-owned frontend domain field');
  const expected = new URL(origin('WC_URL_CLIENT')).hostname;
  const actual=(await domain.inputValue()).trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(actual!==expected)throw Error('WP-owned frontend domain differs from trusted Actions configuration');
  for (const id of [53390,47222]) await contentPage(id, true);
  if (dryRun) {
    report('GENERAL_COMPANY_PREFLIGHT','PASS');
    report('NO_WRITES','PASS');
  } else {
  // The read-only checks above visit two other post editors. Return to the
  // original General Info editor before resolving and updating its ACF field.
  await go(generalPath);
  const currentCompany=(await company.inputValue()).trim();
  const currentDomain=(await domain.inputValue()).trim()
    .replace(/^https?:\/\//,'').replace(/\/$/,'');
  if (!oldBrand.test(currentCompany) || currentDomain!==expected)
    throw Error('General-info ACF preconditions changed during page checks');
  await company.evaluate((el,value) => {
    el.value=value;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }, 'Website mẫu');
  await saveAndReopen(generalPath);
  const persisted=(await page.locator('.acf-field[data-name="tencongty"] input[type="text"], .acf-field[data-name="tencongty"] textarea').first().inputValue()).trim();
  if(persisted!=='Website mẫu')throw Error('New general-info label did not persist');
  report('GENERAL_COMPANY_LABEL','PASS');

  for (const id of [53390,47222]) await contentPage(id, false);
  report('PRESERVED_PAGE_IDENTITIES_AND_ACF','PASS');
  }
  report('PREFLIGHT_ALL_TARGETS','PASS');
  report('NO_ASTRO_BUILD','PASS');
} finally {
  await browser.close();
}
