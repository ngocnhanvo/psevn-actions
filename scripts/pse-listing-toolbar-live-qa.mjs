/** Read-only PSE listing toolbar scroll behavior after official WordPress-controlled deploy. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const lines = String(process.env.ENV_FILE || "").split(/\r?\n/).map(s => s.trim().replace(/^export\s+/, ""));
const vars = lines.filter(line => line.startsWith("WC_URL_CLIENT="));
if (vars.length !== 1) throw Error("Expected one configured PSE frontend origin");
const front = new URL(vars[0].slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g, ""));
if (front.protocol !== "https:" || front.username || front.password || front.search || front.hash || !["", "/"].includes(front.pathname)) {
  throw Error("Unsafe configured PSE frontend origin");
}
const origin = front.origin;
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  await mkdir("artifacts/pse-listing-toolbar", { recursive: true });
  for (const { name, path } of [
    { name: "news", path: "/tin-tuc-su-kien/" },
    { name: "products", path: "/san-pham/" },
  ]) {
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      try {
        const response = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 60000 });
        if (response?.status() !== 200) throw Error(name + " returned HTTP " + response?.status());
        const toolbar = page.locator("[data-listing-toolbar]");
        if (await toolbar.count() !== 1) throw Error(name + " unexpected toolbar count");
        const search = toolbar.locator("input[type=search]");
        const trigger = toolbar.locator("#dropdown-trigger");
        if (await search.count() !== 1 || await trigger.count() !== 1) throw Error(name + " search/filter missing");
        if (!(await search.isVisible()) || !(await trigger.isVisible())) throw Error(name + " search/filter not visible");
        const before = await toolbar.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return { position: getComputedStyle(el).position, top: rect.top, bottom: rect.bottom };
        });
        if (before.position !== "static") throw Error(name + " toolbar computed position " + before.position);
        await trigger.click();
        if (await trigger.getAttribute("aria-expanded") !== "true") throw Error(name + " filter failed to open");
        await page.keyboard.press("Escape");
        if (await trigger.getAttribute("aria-expanded") !== "false") throw Error(name + " filter failed to close");
        await page.evaluate(() => window.scrollTo({ top: 1100, behavior: "instant" }));
        await page.waitForTimeout(250);
        const after = await page.evaluate(() => {
          const el = document.querySelector("[data-listing-toolbar]");
          const rect = el.getBoundingClientRect();
          return { position: getComputedStyle(el).position, top: rect.top, bottom: rect.bottom, scrollY: window.scrollY };
        });
        if (after.scrollY < 250 || after.position !== "static" || before.top - after.top < 250 || after.bottom >= 0) {
          throw Error(name + " toolbar still floats on scroll: " + JSON.stringify({ before, after }));
        }
        await page.screenshot({ path: `artifacts/pse-listing-toolbar/${name}-${width}.png` });
        const record = { name, path, width, position: after.position, scrollY: after.scrollY, offscreen: after.bottom < 0, filter: "click+Escape PASS", pass: true };
        results.push(record);
        console.log("PSE_LISTING_TOOLBAR_LIVE=" + JSON.stringify(record));
      } finally {
        await page.close();
      }
    }
  }
  console.log("PSE_LISTING_TOOLBAR_SUMMARY=" + JSON.stringify({ checked: results.length, passed: results.filter(x => x.pass).length, readOnly: true, noCmsWrite: true }));
} finally {
  await browser.close();
}
