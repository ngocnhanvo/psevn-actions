/** Read-only browser regression: related product quote CTA -> contact form prefill. */
import { chromium } from "playwright";

const rows = String(process.env.ENV_FILE || "")
  .split(/\r?\n/).map(line => line.trim().replace(/^export\s+/, ""))
  .filter(line => line.startsWith("WC_URL_CLIENT="));
if (rows.length !== 1) throw Error("Frontend origin is not uniquely configured");
const parsed = new URL(rows[0].slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g, ""));
if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
    parsed.search || parsed.hash || !["", "/"].includes(parsed.pathname)) {
  throw Error("Invalid frontend origin");
}
const origin = parsed.origin;

const urls = new Set([new URL("/san-pham/npk-phu-my-15-15-15-nhap-khau-1714", origin).href]);
try {
  const res = await fetch(new URL("/sitemap.xml", origin), {
    headers: { "User-Agent": "PSE-Related-Quote-ReadOnlyQA/1" },
    signal: AbortSignal.timeout(25000),
  });
  if (res.ok) {
    const xml = await res.text();
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const url = new URL(match[1].replace(/&amp;/g, "&"), origin);
      if (url.origin === origin && url.pathname.startsWith("/san-pham/") &&
          url.pathname.split("/").filter(Boolean).length >= 2) urls.add(url.href);
      if (urls.size >= 35) break;
    }
  }
} catch (error) {
  console.log("PSE_QUOTE_SITEMAP_FALLBACK=" + String(error).slice(0, 160));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  let verified = false;
  let checked = 0;
  for (const productUrl of urls) {
    checked++;
    let response;
    try {
      response = await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (response?.status() !== 200) continue;
      const cta = page.getByRole("link", { name: "Yêu cầu báo giá", exact: true }).first();
      if ((await cta.count()) === 0) continue;
      const href = await cta.getAttribute("href");
      if (!href) throw Error("Related product quote link has no href");
      const destination = new URL(href, origin);
      if (destination.origin !== origin || destination.searchParams.get("quote") !== "1")
        throw Error("Related product quote destination is incorrect");
      const name = destination.searchParams.get("product");
      const relatedPath = destination.searchParams.get("productPath");
      if (!name || !relatedPath || !destination.searchParams.has("category") ||
          new URL(relatedPath, origin).origin !== origin)
        throw Error("Related product context was not encoded");

      await Promise.all([
        page.waitForURL(url => url.pathname === destination.pathname &&
          url.searchParams.get("product") === name, { timeout: 25000 }),
        cta.click(),
      ]);
      const subject = page.locator('[name="subject"]').first();
      const message = page.locator('[name="message"]').first();
      await subject.waitFor({ state: "attached", timeout: 20000 });
      await page.waitForFunction(
        expected => document.querySelector('[name="subject"]')?.value?.includes(expected),
        name,
        { timeout: 20000 },
      );
      const subjectText = await subject.inputValue();
      const messageText = await message.inputValue();
      if (!subjectText.includes(name) || !messageText.includes(name) ||
          !messageText.includes(new URL(relatedPath, origin).href)) {
        throw Error("Contact form was not prefilled with the chosen product");
      }
      console.log("PSE_RELATED_PRODUCT_QUOTE=PASS; source=" + new URL(productUrl).pathname +
        "; target=" + destination.pathname + "; url_query=VALID; subject_prefill=PASS; message_prefill=PASS; form_submitted=false");
      verified = true;
      break;
    } catch (e) {
      // A missing unrelated product route may be stale; a broken quote link is a regression.
      if (String(e).includes("Related product") || String(e).includes("Contact form"))
        throw e;
      console.log("PSE_QUOTE_CANDIDATE_SKIP=" + new URL(productUrl).pathname +
        "; reason=" + String(e).slice(0, 130));
    }
  }
  if (!verified) throw Error("No live related-product quote CTA could be verified across " + checked + " public product routes");
} finally {
  await browser.close();
}
