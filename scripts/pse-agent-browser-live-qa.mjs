import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { URL } from "node:url";

const configs = {};
for (const line of String(process.env.ENV_FILE || "").split(/\r?\n/)) {
  const found = line.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*)\s*$/);
  if (found) configs[found[1]] = found[2].trim().replace(/^["']|["']$/g, "");
}
const origin = new URL(configs.WC_URL_CLIENT || "");
assert.equal(origin.protocol, "https:");
assert.equal(origin.pathname, "/");
assert(!origin.username && !origin.password && !origin.search && !origin.hash);
const base = origin.origin;

function check(condition, label) {
  if (!condition) throw new Error("PSE_AGENT_BROWSER_FAIL=" + label);
  console.log("PSE_AGENT_BROWSER_" + label + "=PASS");
}
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: "vi-VN",
  });
  const page = await context.newPage();
  const errors = [];
  let agentRequests = 0;
  page.on("pageerror", (error) => errors.push(error.name));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/agent/")) agentRequests++;
  });
  const home = await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  check(home?.status() === 200, "HOME_HTTP");
  const launcher = page.locator("#pse-agent-open");
  await launcher.waitFor({ state: "visible", timeout: 10000 });
  check(agentRequests === 0, "NO_PRECLICK_AGENT_API");
  await launcher.click();
  const panel = page.locator("#pse-agent-dialog");
  await panel.locator("[data-pse-agent-input]").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForResponse(resp => new URL(resp.url()).pathname === "/api/agent/history", {timeout: 15000}).catch(() => {});
  check(agentRequests > 0, "ONCLICK_ONLY_API");

  const cookies = await context.cookies(base);
  const tokenCookie = cookies.find((cookie) => cookie.name === "pse_agent_session");
  console.log("PSE_AGENT_SESSION_COOKIE_META=" + JSON.stringify({
    present: Boolean(tokenCookie),
    httpOnly: Boolean(tokenCookie?.httpOnly),
    secure: Boolean(tokenCookie?.secure),
    sameSiteLax: tokenCookie?.sameSite === "Lax",
  }));
  check(Boolean(tokenCookie && tokenCookie.httpOnly && tokenCookie.secure), "HTTPONLY_COOKIE");
  const question = "PSE có những loại phân bón nào? Chỉ dùng thông tin đã công bố.";
  await panel.locator("[data-pse-agent-input]").fill(question);
  const responsePending = page.waitForResponse(
    response => new URL(response.url()).pathname === "/api/agent/chat" && response.request().method() === "POST",
    { timeout: 60000 }
  );
  await panel.locator(".pse-agent-form button[type=submit]").click();
  const chat = await responsePending;
  check(chat.status() === 200, "CHAT_HTTP200");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("#pse-agent-dialog .pse-agent-bot")].some(node =>
      node.textContent && node.textContent.trim().length >= 45
      && !node.textContent.includes("Xin chào") && !node.textContent.includes("Không thể")
      && !node.textContent.includes("tạm thời")
    ), null, { timeout: 15000 }
  );
  check(true, "CHAT_RENDERED");
  const countBefore = await panel.locator(".pse-agent-user").count();
  check(countBefore === 1, "USER_TURN_RENDERED");
  await page.goto(base + "/tin-tuc-su-kien", { waitUntil: "domcontentloaded", timeout: 60000 });
  check((await page.locator("#pse-agent-open").count()) === 1, "GLOBAL_LAUNCHER_NEWS");
  await page.locator("#pse-agent-open").click();
  const restored = page.locator("#pse-agent-dialog .pse-agent-user");
  await restored.first().waitFor({state:"visible",timeout:15000});
  check((await restored.count()) === 1, "CROSS_ROUTE_HISTORY");

  page.once("dialog", dialog => dialog.accept());
  const clearResponse = page.waitForResponse(resp =>
    new URL(resp.url()).pathname === "/api/agent/history-clear", {timeout:25000}
  );
  await page.locator("#pse-agent-dialog .pse-agent-actions button").first().click();
  const cleared = await clearResponse;
  check(cleared.status() === 200, "AUTHORIZED_CLEAR_HTTP200");
  await page.reload({waitUntil:"domcontentloaded",timeout:60000});
  await page.locator("#pse-agent-open").click();
  await page.locator("#pse-agent-dialog [data-pse-agent-input]").waitFor({state:"visible",timeout:15000});
  await page.waitForTimeout(1200);
  check((await page.locator("#pse-agent-dialog .pse-agent-user").count()) === 0, "CLEAR_PERSISTS");

  await page.setViewportSize({width:390,height:844});
  await page.reload({waitUntil:"domcontentloaded",timeout:60000});
  await page.locator("#pse-agent-open").click();
  const mobile = page.locator("#pse-agent-dialog");
  await mobile.locator("[data-pse-agent-input]").waitFor({state:"visible",timeout:15000});
  const rect = await mobile.boundingBox();
  check(Boolean(rect && rect.x >= -1 && rect.x + rect.width <= 392 &&
    rect.y >= -1 && rect.y + rect.height <= 846), "MOBILE_VIEWPORT");
  await mobile.press("Escape");
  check(await mobile.isHidden(), "KEYBOARD_ESCAPE");
  check(errors.length === 0, "NO_PAGE_ERRORS");
  console.log("PSE_AGENT_BROWSER_QA=PASS desktop_mobile_global_history_clear");
  await context.close();
} finally {
  await browser.close();
}
