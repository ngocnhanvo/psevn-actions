import { chromium } from 'playwright';

/**
 * PSE-only reusable template content check via the installed WordPress UI.
 * Read-only: never print page content, usernames, secrets, cookies or database IDs.
 * Complements the existing source and role inventory; does not export or mutate DB.
 */
const config = process.env.ENV_FILE || '';
function configuredOrigin(name) {
  const lines = config.split(/\r?\n/).map(line => line.trim().replace(/^export\s+/, ''))
    .filter(line => line.startsWith(name + '='));
  if (lines.length !== 1) throw Error('Expected exactly one ' + name);
  const parsed = new URL(lines[0].slice(name.length + 1).trim().replace(/^['"]|['"]$/g, ''));
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.port || parsed.username ||
      parsed.password || !['', '/'].includes(parsed.pathname) || parsed.search || parsed.hash)
    throw Error('Invalid configured origin ' + name);
  return parsed.origin;
}
const wp = configuredOrigin('WC_URL');
if (wp === configuredOrigin('WC_URL_CLIENT')) throw Error('Site isolation failed');
const user = process.env.WP_ADMIN_USERNAME || '';
const password = process.env.WP_ADMIN_PASSWORD || '';
if (!user || !password) throw Error('WordPress credentials unavailable');
const say = (key, val) => console.log('PSE_TEMPLATE_CONTENT ' + key + '=' + val);
const assetPrefixes = ['home-first', 'logo-first', 'tool'];
const whoisNames = ['whois_memberall.php', 'whois_qte_price.php'];
const sourceEvidence = { pages: 0, common: 0, tables: 0, categories: Object.fromEntries(assetPrefixes.map(x => [x, 0])), whois: Object.fromEntries(whoisNames.map(x => [x, 0])) };
function countSourceReferences(value, area) {
  if (typeof value !== 'string' || !value) return;
  sourceEvidence[area] += 1;
  for (const prefix of assetPrefixes) {
    if (new RegExp('/' + prefix + '/', 'i').test(value)) sourceEvidence.categories[prefix] += 1;
  }
  for (const name of whoisNames) {
    if (value.toLowerCase().includes(name)) sourceEvidence.whois[name] += 1;
  }
}
const oldBrand = /nghiencuukhoahoc|xuongmunonbaohiem|eduresearch\s*hub|blue\s*sea/i;
const privateContact = /(?:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})|(?:\+?84|0)[35789]\d{8}\b/i;

const browser = await chromium.launch({headless: true});
const page = await browser.newPage({acceptDownloads: false});
page.setDefaultTimeout(20000);
const go = pathname => page.goto(wp + pathname, {waitUntil: 'domcontentloaded', timeout: 45000});

async function records(path, prefix) {
  await go(path);
  if (!page.url().startsWith(wp + '/wp-admin/')) throw Error('WP authentication expired');
  const rows = await page.locator('#the-list tr[id^="post-"]').evaluateAll(nodes =>
    nodes.map(el => ({
      name: el.querySelector('.row-title')?.textContent || '',
      href: el.querySelector('.row-title')?.getAttribute('href') || '',
      state: el.className
    }))
  );
  say(prefix + '_LIST_ROWS', rows.length);
  say(prefix + '_OLD_BRAND_TITLE_ROWS', rows.filter(row => oldBrand.test(row.name)).length);
  say(prefix + '_PRIVATE_CONTACT_TITLE_ROWS', rows.filter(row => privateContact.test(row.name)).length);
  return rows;
}

async function inspectEditor(url) {
  await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 45000});
  if (!page.url().startsWith(wp + '/wp-admin/post.php?')) throw Error('Post editor unexpectedly redirected');
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const el = document.querySelector('#content');
    const text = el && 'value' in el ? el.value : '';
    const acfNodes = [...document.querySelectorAll('.acf-fields input:not([type=password]), .acf-fields textarea')];
    const acf = acfNodes.map(node => node.value || '').join('\n');
    const acfLegacyFields = [...new Set(acfNodes.filter(node =>
      /nghiencuukhoahoc|xuongmunonbaohiem|eduresearch\s*hub|blue\s*sea/i.test(node.value || '')
    ).map(node => node.closest('.acf-field[data-name]')?.getAttribute('data-name') || '')
      .filter(name => /^[a-zA-Z0-9_-]{1,60}$/.test(name)))];
    const acfContactFields = [...new Set(acfNodes.filter(node =>
      /(?:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})|(?:\+?84|0)[35789]\d{8}\b/i.test(node.value || '')
    ).map(node => node.closest('.acf-field[data-name]')?.getAttribute('data-name') || '')
      .filter(name => /^[a-zA-Z0-9_-]{1,60}$/.test(name)))];
    let blocks = '';
    try {
      blocks = window.wp?.data?.select('core/editor')?.getEditedPostContent?.() || '';
    } catch { /* Gutenberg editor not initialized */ }
    return {
      value: [text, acf, blocks].join('\n'),
      readable: Boolean(el || blocks || acf), acfLegacyFields, acfContactFields,
      bodyText: text || blocks, acfText: acf,
      titleText: (document.querySelector('#title')?.value || '')
    };
  });
}

try {
  await go('/wp-login.php');
  await page.locator('#user_login').fill(user);
  await page.locator('#user_pass').fill(password);
  const form = (await page.locator('#loginform').innerText()).slice(0, 500);
  const math = form.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if (math) {
    const a = Number(math[1]), b = Number(math[3]);
    const input = page.locator('#loginform input[name*="captcha" i], #loginform input[name*="math" i], #loginform input[type="number"]').first();
    if (await input.count()) await input.fill(String(math[2] === '+' ? a+b : math[2] === '-' ? a-b : a*b));
  }
  await page.locator('#wp-submit').click();
  await go('/wp-admin/');
  if (!(await page.locator('#adminmenu').count())) throw Error('Not authenticated as a WP administrator');
  say('AUTH', 'PASS');

  const pages = await records('/wp-admin/edit.php?post_type=page', 'PAGES');
  let inspected = 0, unreadable = 0, oldInBody = 0, privateInBody = 0;
  for (const row of pages.slice(0, 30)) {
    const url = new URL(row.href, wp);
    if (url.origin !== wp || url.pathname !== '/wp-admin/post.php' ||
        !/^\d+$/.test(url.searchParams.get('post') || '')) {
      unreadable += 1;
      continue;
    }
    try {
      const state = await inspectEditor(url.href);
      if (!state.readable) unreadable += 1;
      else {
        inspected += 1;
        countSourceReferences(state.value, 'pages');
        if (oldBrand.test(state.value)) oldInBody += 1;
        if (privateContact.test(state.value)) privateInBody += 1;
        const id=url.searchParams.get('post');
        say('PAGE_'+id+'_OLD_BRAND',oldBrand.test(row.name+' '+state.value)?'YES':'NO');
        say('PAGE_'+id+'_OLD_BRAND_TITLE_ONLY',oldBrand.test(row.name+' '+state.titleText)?'YES':'NO');
        say('PAGE_'+id+'_OLD_BRAND_POST_BODY',oldBrand.test(state.bodyText)?'YES':'NO');
        say('PAGE_'+id+'_OLD_BRAND_ACF',oldBrand.test(state.acfText)?'YES':'NO');
        say('PAGE_'+id+'_PRIVATE_CONTACT_POST_BODY',privateContact.test(state.bodyText)?'YES':'NO');
        say('PAGE_'+id+'_PRIVATE_CONTACT_ACF',privateContact.test(state.acfText)?'YES':'NO');
        say('PAGE_'+id+'_HAS_EDITOR_CODE_OR_SHORTCODE',/<script|<style|<iframe|\[(?:tablepress|esc_table|shortcode)|<!-- wp:shortcode/i.test(state.bodyText)?'YES':'NO');
        say('PAGE_'+id+'_HAS_EMBEDDED_LAYOUT',/<script|\[(?:tablepress|esc_table|shortcode)|<!-- wp:shortcode/i.test(state.value)?'YES':'NO');
        say('PAGE_'+id+'_PRIVATE_CONTACT',privateContact.test(state.value)?'YES':'NO');
        say('PAGE_'+id+'_LEGACY_ACF_FIELD_COUNT',state.acfLegacyFields.length);
        say('PAGE_'+id+'_PRIVATE_CONTACT_ACF_FIELD_COUNT',state.acfContactFields.length);
        for (const name of state.acfContactFields) say('PAGE_'+id+'_PRIVATE_CONTACT_ACF_FIELD_'+name,'YES');
        say('PAGE_'+id+'_BODY_LENGTH_CLASS',state.bodyText.length<1000?'SMALL':state.bodyText.length<10000?'MEDIUM':'LARGE');
        for (const name of state.acfLegacyFields) say('PAGE_'+id+'_LEGACY_ACF_FIELD_'+name,'YES');
      }
    } catch { unreadable += 1; }
  }
  say('PAGES_EDITORS_READABLE', inspected);
  say('PAGES_EDITORS_UNVERIFIED', unreadable);
  say('PAGES_OLD_BRAND_CONTENT', oldInBody);
  say('PAGES_PRIVATE_CONTACT_CONTENT', privateInBody);

  const common = await records('/wp-admin/edit.php?post_type=thong-tin-chung', 'GENERAL_INFO');
  let generalReadable = 0, generalLegacy = 0, generalPrivate = 0;
  for (const row of common.slice(0, 5)) {
    const url = new URL(row.href, wp);
    if (url.origin !== wp || url.pathname !== '/wp-admin/post.php' ||
        !/^\d+$/.test(url.searchParams.get('post') || '')) continue;
    try {
      const state = await inspectEditor(url.href);
      if (state.readable) {
        generalReadable += 1;
        countSourceReferences(state.value, 'common');
        if (oldBrand.test(state.value)) generalLegacy += 1;
        if (privateContact.test(state.value)) generalPrivate += 1;
        say('GENERAL_INFO_LEGACY_ACF_FIELD_COUNT',state.acfLegacyFields.length);
        say('GENERAL_INFO_BRAND_BODY',oldBrand.test(state.bodyText)?'YES':'NO');
        say('GENERAL_INFO_BRAND_ACF',oldBrand.test(state.acfText)?'YES':'NO');
        for (const name of state.acfLegacyFields) say('GENERAL_INFO_LEGACY_ACF_FIELD_'+name,'YES');
      }
    } catch { /* mark unverified */ }
  }
  say('GENERAL_INFO_EDITORS_READABLE', generalReadable);
  say('GENERAL_INFO_OLD_BRAND_CONTENT', generalLegacy);
  say('GENERAL_INFO_PRIVATE_CONTACT_CONTENT', generalPrivate);

  // Read-only inspection of the installed TablePress editor, when accessible.
  // No table data or credentials are printed or changed.
  let tablePressStatus = 'UNVERIFIED';
  try {
    await go('/wp-admin/admin.php?page=tablepress');
    if (!page.url().startsWith(wp + '/wp-admin/')) throw Error('WP TablePress admin unavailable');
    const hrefs = await page.locator('a[href*="page=tablepress"][href*="action=edit"]').evaluateAll(
      nodes => nodes.map(n => n.getAttribute('href') || '')
    );
    const urls = [...new Set(hrefs.map(href => {
      try {
        const url = new URL(href, wp);
        return url.origin === wp && url.pathname.startsWith('/wp-admin/') &&
          url.searchParams.get('page') === 'tablepress' &&
          url.searchParams.get('action') === 'edit' &&
          /^[a-zA-Z0-9_-]{1,64}$/.test(url.searchParams.get('table_id') || '')
          ? url.href : null;
      } catch { return null; }
    }).filter(Boolean))];
    // Distinguish a missing/inaccessible ESC Table admin from an actually empty
    // list or a selector mismatch. All probes are read-only; never log table data.
    const tablepressView = await page.evaluate(() => ({
      menu: Boolean(document.querySelector('#adminmenu a[href*="page=tablepress"]')),
      list: Boolean(document.querySelector('.wp-list-table, #tablepress-all-tables')),
      rows: document.querySelectorAll('.wp-list-table tbody tr:not(.no-items), #the-list tr:not(.no-items)').length,
      editorAnchors: document.querySelectorAll('a.row-title[href*="action=edit"], a[href*="table_id="]').length,
      denied: /you are not allowed to access this page|sorry, you are not allowed|không được phép truy cập/i.test(document.querySelector('#wpbody-content')?.textContent || '')
    }));
    say('TABLEPRESS_MENU_VISIBLE', tablepressView.menu ? 'YES' : 'NO');
    say('TABLEPRESS_LIST_VISIBLE', tablepressView.list ? 'YES' : 'NO');
    say('TABLEPRESS_LIST_ROW_MATCHES', tablepressView.rows);
    say('TABLEPRESS_EDIT_ANCHOR_MATCHES', tablepressView.editorAnchors);
    tablePressStatus = urls.length ? 'PARTIAL' :
      tablepressView.denied ? 'UNVERIFIED_ACCESS_DENIED' :
      !tablepressView.menu && !tablepressView.list ? 'UNVERIFIED_PLUGIN_MENU_ABSENT' :
      tablepressView.rows === 0 ? 'NO_VISIBLE_TABLE_ROWS' :
      'UNVERIFIED_NO_EDITOR_LINKS';
    for (const url of urls.slice(0, 60)) {
      await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 45000});
      if (!page.url().startsWith(wp + '/wp-admin/')) continue;
      const value = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')]
          .map(el => 'value' in el ? el.value : (el.textContent || ''));
        return document.documentElement.outerHTML + '\n' + inputs.join('\n');
      });
      countSourceReferences(value, 'tables');
    }
    if (urls.length && sourceEvidence.tables === urls.length) tablePressStatus = urls.length <= 60 ? 'ALL_VISIBLE_EDITOR_LINKS' : 'FIRST_60_EDITOR_LINKS';
  } catch { tablePressStatus = 'UNVERIFIED_ADMIN_ACCESS'; }
  say('SOURCE_REF_TABLEPRESS_SCOPE', tablePressStatus);
  say('SOURCE_REF_PAGES_INSPECTED', sourceEvidence.pages);
  say('SOURCE_REF_GENERAL_INFO_INSPECTED', sourceEvidence.common);
  say('SOURCE_REF_TABLE_EDITORS_INSPECTED', sourceEvidence.tables);
  for (const prefix of assetPrefixes) say('SOURCE_REF_'+prefix.replaceAll('-', '_').toUpperCase()+'_DOCUMENTS', sourceEvidence.categories[prefix]);
  for (const name of whoisNames) say('SOURCE_REF_'+name.replaceAll('.', '_').toUpperCase()+'_DOCUMENTS', sourceEvidence.whois[name]);
  say('SOURCE_REF_SAFE_TO_DELETE', 'NOT_DETERMINED');

  await go('/wp-admin/upload.php?mode=list');
  const media = await page.locator('#the-list tr[id^="post-"]').evaluateAll(nodes =>
    nodes.map(node => ({
      title: node.querySelector('.row-title')?.textContent || '',
      thumb: node.querySelector('img')?.getAttribute('src') || '',
    }))
  );
  say('MEDIA_LIST_ROWS', media.length);
  say('MEDIA_OLD_BRAND_ROWS', media.filter(x => oldBrand.test(x.title) || oldBrand.test(x.thumb)).length);
  say('MEDIA_PRIVATE_CONTACT_ROWS', media.filter(x => privateContact.test(x.title)).length);

  await go('/wp-admin/users.php');
  const userRows = await page.locator('#the-list tr[id^="user-"]').count();
  say('USERS_AFTER_CLEANUP', userRows);
  const unsafeRoleCount = await page.locator('.subsubsub a[href*="role=nckh_student"] .count, .subsubsub a[href*="role=nckh_teacher"] .count')
    .allTextContents();
  say('OLD_ROLE_COUNT_SUM', unsafeRoleCount.reduce((n,v)=>n+Number((v.match(/\d+/)||['0'])[0]),0));

  await go('/wp-admin/options-general.php?page=updraftplus');
  const now = Math.floor(Date.now()/1000);
  const backups = await page.locator('.updraft_existing_backups_row[data-key]').evaluateAll(
    (rows, cutoff) => rows.filter(el => (Number(el.getAttribute('data-key'))||0) > cutoff &&
      !!el.querySelector('button.updraft_download_button[data-what="db"]')).length, now-86400
  );
  say('PROTECTED_RECENT_DB_BACKUPS', backups);
  say('BACKUP_PRESENT', backups >= 2 ? 'PASS' : 'UNVERIFIED');

  // Preserving five pages, ACF field groups and standard WordPress structure
  // is intentional. Their semantics must be reviewed before any deletion.
  say('ACTIVE_TEMPLATE_PURGE', 'NOT_PERFORMED');
  say('READ_ONLY', 'PASS');
} finally {
  await browser.close();
}
