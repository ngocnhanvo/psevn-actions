/** PSE Agent conversation admin permanent-delete UI audit. READ ONLY: never submits delete forms. */
import { chromium } from "playwright";
import { strict as assert } from "node:assert";

const lines = String(process.env.ENV_FILE || "").split(/\r?\n/)
  .map(line => line.trim().replace(/^export\s+/, ""));
function env(name) {
  const rows = lines.filter(line => line.startsWith(name + "="));
  if (rows.length !== 1) throw new Error("Missing unique " + name);
  return rows[0].slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}
const origin = new URL(env("WC_URL"));
assert.equal(origin.protocol, "https:");
assert.equal(origin.hostname, "admin-pse.webnvn.com");
assert(!origin.username && !origin.password && !origin.search && !origin.hash);
assert(["", "/"].includes(origin.pathname));
if (!process.env.WP_ADMIN_USERNAME || !process.env.WP_ADMIN_PASSWORD) {
  throw new Error("Missing WordPress Admin credentials");
}

async function login(page) {
  await page.goto(origin.origin + "/wp-admin/", { waitUntil: "domcontentloaded", timeout: 65000 });
  if (!(await page.locator("#user_login").count())) return;
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const body = await page.locator("body").innerText();
  const match = body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)
    || body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if (match) {
    const a = Number(match[1]);
    const b = Number(match[3]);
    const answer = ({ "+": a + b, "-": a - b, x: a * b, "×": a * b, "*": a * b })[match[2]];
    const field = page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
    if (!(await field.count())) throw new Error("Missing login challenge input");
    await field.fill(String(answer));
  }
  await page.locator("#wp-submit").click({ noWaitAfter: true, timeout: 25000 });
  await page.waitForFunction(
    () => location.pathname.startsWith("/wp-admin") && !document.querySelector("#loginform"),
    null,
    { timeout: 45000 },
  );
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 }, locale: "vi-VN" });
  await login(page);
  console.log("PSE_AGENT_ADMIN_LOGIN=PASS");

  const response = await page.goto(
    origin.origin + "/wp-admin/tools.php?page=pse-agent-conversations",
    { waitUntil: "domcontentloaded", timeout: 65000 },
  );
  assert.equal(response?.status(), 200);
  if (page.url().includes("wp-login")) throw new Error("WP Admin session lost");

  const title = (await page.locator("h1").first().innerText()).trim();
  assert.equal(title, "Hội thoại AI PSE");
  const intro = await page.locator(".wrap > p").first().innerText();
  assert.match(intro, /xóa vĩnh viễn/i);

  const headers = await page.locator("table.widefat thead th").allInnerTexts();
  assert(headers.some(text => text.trim() === "Xóa"), "Missing permanent-delete column");

  const forms = page.locator('form[action$="/wp-admin/admin-post.php"] input[name="action"][value="pse_agent_delete_conversation"]');
  const count = await forms.count();
  assert(count > 0, "No permanent-delete form found on conversation rows");
  for (let index = 0; index < count; index++) {
    const actionInput = forms.nth(index);
    const form = actionInput.locator("xpath=ancestor::form[1]");
    assert.equal((await form.getAttribute("method"))?.toLowerCase(), "post");
    const session = await form.locator('input[name="session"]').getAttribute("value");
    assert.match(String(session), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
    assert((await form.locator('input[name="_wpnonce"]').count()) === 1, "Missing delete nonce");
    assert.equal((await form.locator('button[type="submit"]').innerText()).trim(), "Xóa vĩnh viễn");
  }

  // Deliberately do not click or submit anything: production customer history remains untouched.
  console.log("PSE_AGENT_ADMIN_DELETE_UI=PASS forms=" + count + " read_only=true");
} finally {
  await browser.close();
}
