/** One-time PSE Lighthouse SEO correction through WordPress's native signed Save.
 * Do not bypass the CMS, change sitemap/llms, or start an independent Astro build.
 */
import { chromium } from 'playwright';

const env = Object.fromEntries(String(process.env.ENV_FILE || '')
  .split(/\r?\n/).map(x => x.trim().replace(/^export\s+/, ''))
  .filter(x => /^(?:WC_URL|WC_URL_CLIENT)=/.test(x))
  .map(x => {
    const [key, ...values] = x.split('=');
    return [key, values.join('=').trim().replace(/^['"]|['"]$/g, '')];
  }));
const strictOrigin = (value, key) => {
  const x = new URL(value || '');
  if (x.protocol !== 'https:' || !x.hostname || x.username || x.password ||
      x.search || x.hash || !['','/'].includes(x.pathname) || (x.port && x.port !== '443')) {
    throw new Error('Invalid configured origin: ' + key);
  }
  return x.origin;
};
const wordpress = strictOrigin(env.WC_URL, 'WC_URL');
const frontend = strictOrigin(env.WC_URL_CLIENT, 'WC_URL_CLIENT');
if (wordpress === frontend) throw new Error('WordPress/frontend origin collision');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const user = process.env.WP_ADMIN_USERNAME;
  const pass = process.env.WP_ADMIN_PASSWORD;
  if (!user || !pass) throw new Error('Missing WordPress credentials');

  await page.goto(wordpress + '/wp-admin/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await page.locator('#user_login').count()) {
    await page.locator('#user_login').fill(user);
    await page.locator('#user_pass').fill(pass);
    const body = await page.locator('body').innerText();
    const challenge = body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)
      || body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if (challenge) {
      const a = Number(challenge[1]), b = Number(challenge[3]);
      const answer = ({ '+': a+b, '-': a-b, 'x': a*b, '×': a*b, '*': a*b })[challenge[2]];
      const field = page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if (!await field.count()) throw new Error('Missing expected WordPress CAPTCHA input');
      await field.fill(String(answer));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'), page.locator('#wp-submit').click()]);
  }
  if (page.url().includes('wp-login')) throw new Error('WordPress Admin login failed');

  const getMetadata = async () => {
    const r = await page.evaluate(async () => {
      const result = await fetch('/wp-json/esc-seo-files/v1/public?sitemap_meta=1', {
        credentials: 'same-origin', headers: { Accept:'application/json', 'Cache-Control':'no-cache' }
      });
      return { status:result.status, body:await result.json().catch(() => null) };
    });
    if (r.status !== 200 || r.body?.version !== 1 ||
        new URL(r.body?.site || '').origin !== frontend ||
        typeof r.body?.robots !== 'string' || typeof r.body?.llms !== 'string') {
      throw new Error('Unexpected WordPress SEO REST identity/contract');
    }
    return r.body;
  };
  const before = await getMetadata();
  const existing = before.robots.replace(/\r\n/g, '\n');
  const blocked = existing.match(/^Disallow:\s*\/\s*$/gim) || [];
  if (blocked.length === 0) {
    if (/^Allow:\s*\/\s*$/im.test(existing)) {
      console.log('PSE_LIGHTHOUSE_ROBOTS=ALREADY_ALLOWED; no_write=true');
      process.exit(0);
    }
    throw new Error('Robots policy differs from expected single Disallow root; refuse rewrite');
  }
  if (blocked.length !== 1) throw new Error('Multiple crawl-blocking rules; require manual policy review');
  if (!/^User-agent:\s*\*\s*$/im.test(existing)) {
    throw new Error('No wildcard crawler group; refuse automatic rewrite');
  }
  // Change only the complete-site block; keep comments, groups and sitemap unchanged.
  const next = existing.replace(/^Disallow:\s*\/\s*$/im, 'Allow: /');
  if (next === existing) throw new Error('Could not prepare minimal robots change');
  await page.goto(wordpress + '/wp-admin/options-general.php?page=esc-seo-files&tab=robots', {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  const form = page.locator('form[action*="admin-post.php"]').filter({
    has: page.locator('input[name="action"][value="esc_seo_files_save"]')
  });
  if (await form.count() !== 1 || !await form.locator('input[name="_wpnonce"]').count() ||
      !await form.locator('input[name="tab"][value="robots"]').count()) {
    throw new Error('Cannot locate signed WordPress robots settings form');
  }
  const field = form.locator('textarea[name="robots"]');
  if (await field.count() !== 1) throw new Error('Robots editor missing');
  if ((await field.inputValue()).replace(/\r\n/g, '\n') !== existing) {
    throw new Error('WordPress robots content changed concurrently; no Save');
  }
  await field.fill(next);
  await Promise.all([page.waitForLoadState('domcontentloaded',{ timeout:60000 }),
    form.locator('input[type="submit"],button[type="submit"]').first().click()]);
  if (!page.url().includes('updated=1') || page.url().includes('wp-login')) {
    throw new Error('Native WordPress robots Save was not confirmed');
  }
  const after = await getMetadata();
  if (after.robots.replace(/\r\n/g, '\n') !== next ||
      after.sitemap?.revision !== before.sitemap?.revision ||
      after.sitemap?.mode !== before.sitemap?.mode ||
      after.llms !== before.llms) {
    throw new Error('Robots Save read-after-write failed or affected unrelated SEO settings');
  }
  console.log('PSE_LIGHTHOUSE_ROBOTS=PASS cms_save=CONFIRMED wildcard_allow=true sitemap_unchanged=true llms_unchanged=true build_triggered=false');
} finally {
  await browser.close();
}
