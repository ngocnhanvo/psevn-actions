import { chromium } from 'playwright';

const ADMIN_URL = process.env.WC_URL;
const USERNAME = process.env.WP_ADMIN_USERNAME;
const PASSWORD = process.env.WP_ADMIN_PASSWORD;

if (!ADMIN_URL || !USERNAME || !PASSWORD) {
  throw new Error('Missing WC_URL / WP_ADMIN_USERNAME / WP_ADMIN_PASSWORD secrets.');
}

const origin = new URL(ADMIN_URL).origin;
const BUILD_URL = `${origin}/wp-admin/admin.php?page=vcs-build-trigger`;
const chromeChannel = process.env.PSE_CHROME_CHANNEL || '';
if (chromeChannel && chromeChannel !== 'chrome') throw new Error('Unsupported Playwright browser channel');
const browser = await chromium.launch(chromeChannel === 'chrome'
  ? { headless: true, channel: 'chrome' }
  : { headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

async function visible(locator) {
  try {
    return await locator.first().isVisible({ timeout: 1000 });
  } catch {
    return false;
  }
}

function solveArithmetic(text) {
  const match = text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)
    || text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[3]);
  switch (match[2]) {
    case '+': return a + b;
    case '-': return a - b;
    case 'x':
    case '×':
    case '*': return a * b;
    default: return null;
  }
}

async function findCaptchaInput() {
  const selectors = [
    'input[name*="captcha" i]',
    'input[id*="captcha" i]',
    'input[name*="math" i]',
    'input[id*="math" i]',
    'input[name*="arith" i]',
    'input[id*="arith" i]',
    'input[type="number"]',
  ];

  for (const selector of selectors) {
    const candidate = page.locator(`#loginform ${selector}`).first();
    if (await visible(candidate)) return candidate;
  }

  const candidates = page.locator('#loginform input:visible:not(#user_login):not(#user_pass):not(#wp-submit):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])');
  const count = await candidates.count();
  if (count === 1) return candidates.first();

  if (count > 1) {
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      const type = (await candidate.getAttribute('type') || '').toLowerCase();
      const autocomplete = (await candidate.getAttribute('autocomplete') || '').toLowerCase();
      if (type === 'number' || autocomplete === 'off') return candidate;
    }
  }

  return null;
}

async function gotoAdminWithRetry(url, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (error) {
      lastError = error;
      const text = String(error?.message || error);
      const transient = /Timeout|ERR_TIMED_OUT|ECONNRESET|ECONNREFUSED|ENETUNREACH/i.test(text);
      if (!transient || attempt === 3) throw error;
      console.log(`PSE_WP_ADMIN_NAV_RETRY label=${label} attempt=${attempt} reason=transient`);
      await page.waitForTimeout(attempt * 1800);
    }
  }
  throw lastError;
}

async function loginAndOpenBuildPage() {
  const started = Date.now();
  // Retain the proven WordPress dashboard login and arithmetic CAPTCHA flow.
  // After authentication, verify directly on the protected Build Website page;
  // only use the legacy Post admin page if that verification fails.
  await gotoAdminWithRetry(`${origin}/wp-admin/`, 'dashboard');
  const userInput = page.locator('#user_login');
  if (await visible(userInput)) {
    await userInput.fill(USERNAME);
    await page.locator('#user_pass').fill(PASSWORD);
    const answer = solveArithmetic(await page.locator('#loginform').innerText());
    if (answer !== null) {
      const captchaInput = await findCaptchaInput();
      if (!captchaInput) throw new Error('Arithmetic CAPTCHA detected but input was not found.');
      await captchaInput.fill(String(answer));
    }
    await page.locator('#wp-submit').click();
  }

  // Always visit the exact secured page after login: URL/redirect_to alone
  // does not establish a valid WP session, as verified by read-only QA.
  await gotoAdminWithRetry(BUILD_URL, 'build-page');
  if (!(await visible(page.locator('#adminmenu')))) {
    console.log('PSE_WP_AUTH_FALLBACK=PROTECTED_POST_GET');
    await gotoAdminWithRetry(`${origin}/wp-admin/post.php?post=248&action=edit`, 'protected-post');
    if (!(await visible(page.locator('#adminmenu')))) {
      throw new Error('WordPress admin session is not authenticated');
    }
    await gotoAdminWithRetry(BUILD_URL, 'build-page-fallback');
  }
  if (!(await visible(page.locator('#adminmenu')))) {
    throw new Error('WordPress Build Website menu/permissions are not available');
  }
  // A server-issued nonce tied to this protected page remains mandatory.
  await page.waitForFunction(() => Boolean(globalThis.vcsBuild?.ajax_url && globalThis.vcsBuild?.nonce), null, {
    timeout: 30000,
  });
  console.log('PSE_WP_TRIGGER_TIMING phase=login_admin elapsed_ms=' + (Date.now() - started));
}

try {
  await loginAndOpenBuildPage();
  const statusStarted = Date.now();

  // Reconcile completed GitHub run through WordPress' existing AJAX status API
  // before making a new dispatch; only the server may release its matching lock.
  // The status endpoint is strictly read-only and safe to retry on transient
  // network/5xx/429 errors. Never retry vcs_trigger_build (non-idempotent).
  // Failed status reads must still abort BEFORE dispatch rather than guessing.
  let state;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      state = await page.evaluate(async () => {
        const form = new URLSearchParams({
          action: 'vcs_check_build_status',
          nonce: globalThis.vcsBuild.nonce,
        });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        try {
          const response = await fetch(globalThis.vcsBuild.ajax_url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: form.toString(),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('WordPress build status API HTTP ' + response.status);
          const json = await response.json();
          if (json?.success !== true) throw new Error('WordPress build status API refused status check');
          return {
            state: String(json?.data?.status || 'unknown'),
            active: json?.data?.build_active === true,
            pending: Number(json?.data?.pending_count ?? 0),
          };
        } finally {
          clearTimeout(timeout);
        }
      });
      break;
    } catch (error) {
      const message = String(error?.message || error);
      const transient = /Failed to fetch|NetworkError|AbortError|HTTP (?:429|5\d{2})/i.test(message);
      if (!transient || attempt === 3) throw error;
      console.warn('PSE_WP_STATUS_RETRY attempt=' + attempt + ' reason=transient_read_error');
      await page.waitForTimeout(750 * attempt);
    }
  }
  if (!state) throw new Error('WordPress status read returned no verified result');
  console.log('PSE_WP_TRIGGER_TIMING phase=status_check elapsed_ms=' + (Date.now() - statusStarted));
  console.log('PSE_WP_BUILD_STATUS_CHECK=' + state.state);
  if (state.active || ['loading', 'queued', 'in_progress'].includes(state.state)) {
    throw new Error('WordPress still reports an active build; do not dispatch another one');
  }
  console.log('PSE_WP_PENDING_CHANGE_COUNT=' + state.pending);
  if (process.env.PSE_WP_STATUS_ONLY === 'true') {
    console.log('PSE_WP_BUILD_AUTH_READONLY=PASS; no build requested');
  } else {
  // Explicit one-shot owner approval flows only through this WordPress/PHP
  // authenticated endpoint. The plugin still enforces nonce, privilege and lock.
  const approvedException = process.env.PSE_FORCE_BUILD_ONCE === 'true';
  if (!Number.isInteger(state.pending) || (state.pending <= 0 && !approvedException)) {
    console.log('PSE_WP_BUILD=NO_PENDING_CHANGES; no owner-approved exception on this event');
    process.exitCode = 2;
  } else {

  const isExceptional = state.pending <= 0 && approvedException;
  console.log('PSE_WP_BUILD_REQUEST_MODE=' + (isExceptional ? 'owner-approved-exception' : 'normal'));
  const dispatchStarted = Date.now();
  const result = await page.evaluate(async (forceBuild) => {
    const body = new URLSearchParams({
      action: 'vcs_trigger_build',
      nonce: globalThis.vcsBuild.nonce,
      force_build: forceBuild ? '1' : '0',
    });

    const response = await fetch(globalThis.vcsBuild.ajax_url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString(),
    });

    const raw = await response.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw };
    }

    return { status: response.status, payload };
  }, isExceptional);

  if (result.status !== 200 || result.payload?.success !== true) {
    const message = result.payload?.data?.message || result.payload?.raw || JSON.stringify(result.payload);
    throw new Error(`Build Website trigger failed (HTTP ${result.status}): ${message}`);
  }

  console.log('PSE_WP_TRIGGER_TIMING phase=dispatch elapsed_ms=' + (Date.now() - dispatchStarted));
  console.log(`WordPress Build Website accepted the GitHub dispatch: ${result.payload?.data?.message || 'success'}`);
  }
  }
} finally {
  await browser.close();
}
