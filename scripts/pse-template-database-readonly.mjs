import { chromium } from 'playwright';

// PSE WP-admin only: counts of content, users and plugins. NEVER read or print records,
// password values, site-health DB names, table prefixes, cookies or WP nonces.
const config = process.env.ENV_FILE || '';
const names = ['WC_URL', 'WC_URL_CLIENT'];
const values = Object.fromEntries(names.map((name) => {
  const matches = config.split(/\r?\n/)
    .map((line) => line.trim().replace(/^export\s+/, ''))
    .filter((line) => line.startsWith(name + '='));
  if (matches.length !== 1) throw new Error('Missing or duplicate environment origin: ' + name);
  const value = matches[0].slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.port ||
      url.username || url.password || !['/', ''].includes(url.pathname) ||
      url.search || url.hash) throw new Error('Invalid HTTPS origin for ' + name);
  return [name, url.origin];
}));
if (values.WC_URL === values.WC_URL_CLIENT) throw new Error('WP and Astro origins must be isolated');
const username = process.env.WP_ADMIN_USERNAME || '';
const password = process.env.WP_ADMIN_PASSWORD || '';
if (!username || !password) throw new Error('WP admin secrets not configured');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ acceptDownloads: false });
page.setDefaultTimeout(14000);
const root = values.WC_URL;
const go = (pathname) => page.goto(root + pathname, { waitUntil: 'domcontentloaded', timeout: 30000 });
const count = (text) => {
  if (!text) return null;
  const digits = text.match(/[\d,.]+/);
  if (!digits) return null;
  const value = Number(digits[0].replace(/[,\.]/g, ''));
  return Number.isFinite(value) ? value : null;
};
const report = (name, value) => console.log('PSE_DB_INVENTORY ' + name + '=' + value);
try {
  await go('/wp-login.php');
  await page.locator('#user_login').fill(username);
  await page.locator('#user_pass').fill(password);
  const loginText = (await page.locator('#loginform').innerText()).slice(0, 500);
  const math = loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if (math) {
    const a = Number(math[1]), b = Number(math[3]);
    const answer = math[2] === '+' ? a + b : math[2] === '-' ? a - b : a * b;
    const cap = page.locator('#loginform input[name*="captcha" i], #loginform input[name*="math" i], #loginform input[type="number"]').first();
    if (await cap.count()) await cap.fill(String(answer));
  }
  await page.locator('#wp-submit').click();
  await go('/wp-admin/');
  if (!page.url().startsWith(root + '/wp-admin/')) throw new Error('WP admin login failed');
  if (!(await page.locator('#adminmenu').count())) throw new Error('Authenticated WP admin menu unavailable');
  report('AUTH', 'PASS');

  const types = await page.locator('#adminmenu a[href*="edit.php?post_type="]').evaluateAll((nodes) => {
    const names = nodes.map((node) => {
      const u = new URL(node.href);
      return u.searchParams.get('post_type') || '';
    }).filter((value) => /^[a-zA-Z0-9_-]{1,80}$/.test(value));
    return [...new Set(names)];
  });
  report('CUSTOM_TYPES_DISCOVERED', types.length);
  const screens = [
    ['posts', '/wp-admin/edit.php'],
    ['pages', '/wp-admin/edit.php?post_type=page'],
    ['media', '/wp-admin/upload.php?mode=list'],
    ['comments', '/wp-admin/edit-comments.php'],
    ['users', '/wp-admin/users.php'],
    ['plugins', '/wp-admin/plugins.php'],
    ...types.filter((type) => !['post', 'page', 'attachment'].includes(type))
      .slice(0, 35).map((type) => ['custom_' + type, '/wp-admin/edit.php?post_type=' + encodeURIComponent(type)]),
  ];
  for (const [label, screen] of screens) {
    try {
      await go(screen);
      if (page.url().includes('wp-login.php')) throw new Error('Session expired');
      const present = await page.locator('.subsubsub li a .count, .subsubsub li .count').allTextContents();
      const counts = present.map((v) => count(v)).filter((v) => v !== null);
      const listed = await page.locator('.tablenav .displaying-num').first().textContent().catch(() => '');
      const fallback = count(listed);
      const total = counts.length ? counts[0] : fallback;
      report(label + '_TOTAL', total === null ? 'UNVERIFIED' : total);
      if (label === 'plugins') {
        const activeLink = page.locator('.subsubsub li.active a .count, .subsubsub a[href*="plugin_status=active"] .count').first();
        const activeCount = await activeLink.count() ? count(await activeLink.textContent()) : null;
        report('PLUGINS_ACTIVE', activeCount === null ? 'UNVERIFIED' : activeCount);
      }
    } catch (err) {
      report(label + '_TOTAL', 'UNVERIFIED_' + (err instanceof Error ? err.name : 'UNKNOWN'));
    }
  }
  // Read installation status of common existing backup tools; never log
  // arbitrary plugin details, paths or tenant labels.
  await go('/wp-admin/plugins.php');
  const pluginSlugs = await page.locator('#the-list tr[data-slug]').evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute('data-slug') || '')
  );
  const backupTools = [
    'updraftplus', 'wpvivid-backuprestore', 'backwpup', 'duplicator',
    'all-in-one-wp-migration', 'backup-migration', 'wp-db-backup',
    'wp-migrate-db', 'wp-reset', 'wp-time-capsule',
  ];
  const available = backupTools.filter((name) => pluginSlugs.includes(name));
  report('BACKUP_TOOLS_DETECTED', available.length);
  report('BACKUP_TOOL_IDS', available.length ? available.join(',') : 'NONE_OF_KNOWN_PLUGINS');

  await go('/wp-admin/users.php');
  const roleTotals = await page.locator('.subsubsub li a[href*="role="]').evaluateAll(
    (links) => links.map((link) => {
      const role = new URL(link.href).searchParams.get('role') || '';
      const match = (link.textContent || '').match(/\((\d[\d,]*)\)/);
      return { role, count: match ? Number(match[1].replace(/,/g, '')) : null };
    }).filter((item) => /^[a-z0-9_-]{1,36}$/.test(item.role) && Number.isSafeInteger(item.count))
  );
  for (const item of roleTotals) report('ROLE_' + item.role.toUpperCase(), item.count);
  report('CUSTOM_TYPES_SCANNED', Math.min(types.length, 35));
  report('DB_TABLES_INSPECTED', 'NO');
  report('DB_FULL_BACKUP_VERIFIED', 'NO');
  report('SAFE_TO_PURGE_SQL', 'NO_BACKUP');
  report('READ_ONLY', 'PASS');
} finally {
  await browser.close();
}
