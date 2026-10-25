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
  // Route-probe only while diagnosing native WordPress Product SSR 404.
  const browserProbe = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    const paths = [
      "/san-pham", "/san-pham/", "/san-pham/huu-co-phu-my",
      "/san-pham/huu-co-phu-my/", "/ssr/products/san-pham/null",
      "/ssr/products/san-pham/null?catSlug=huu-co-phu-my",
      "/ssr/products/huu-co-phu-my-organic-80-1720/detail"
    ];
    for (const path of paths) {
      try {
        const res = await browserProbe.request.get(origin + path, { timeout: 35000 });
        console.log("PSE_PRODUCT_ROUTE_PROBE=" + JSON.stringify({ path, status: res.status(), finalUrl: res.url(),
          contentType: res.headers()["content-type"] || "" }));
      } catch (e) {
        console.log("PSE_PRODUCT_ROUTE_PROBE=" + JSON.stringify({ path, error: String(e).slice(0, 250) }));
      }
    }
  } finally { await browserProbe.close(); }
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
        if (!["static", "relative"].includes(before.position)) throw Error(name + " toolbar computed position " + before.position);
        // Legacy product filter uses visual open/close, while news sets aria-expanded.
        // Check the common observable behavior without rewriting either component.
        const dropdown = toolbar.locator("#dropdown-menu");
        await trigger.click();
        if (!(await dropdown.isVisible())) throw Error(name + " filter failed to open");
        if (name === "news") {
          const stack = await page.evaluate(() => {
            const toolbar = document.querySelector("[data-listing-toolbar]");
            const menu = document.querySelector("#dropdown-menu");
            const card = document.querySelector("#posts-grid .grid > div");
            if (!toolbar || !menu || !card) return { z: -1, menuAboveCard: false, noOverlap: true };
            const z = Number(getComputedStyle(toolbar).zIndex);
            const a = menu.getBoundingClientRect(), b = card.getBoundingClientRect();
            const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right);
            const top = Math.max(a.top, b.top), bottom = Math.min(a.bottom, b.bottom);
            const visibleTop = Math.max(top, 0), visibleBottom = Math.min(bottom, innerHeight);
            const visibleLeft = Math.max(left, 0), visibleRight = Math.min(right, innerWidth);
            const noOverlap = visibleRight <= visibleLeft || visibleBottom <= visibleTop;
            if (noOverlap) return { z, menuAboveCard: true, noOverlap };
            const hit = document.elementFromPoint((visibleLeft + visibleRight) / 2, (visibleTop + visibleBottom) / 2);
            return { z, menuAboveCard: Boolean(hit && menu.contains(hit)), noOverlap };
          });
          if (stack.z < 1 || !stack.menuAboveCard) throw Error("News category menu hidden behind cards: " + JSON.stringify(stack));
          console.log("PSE_NEWS_FILTER_STACK=" + JSON.stringify({ width, ...stack }));
          // Verify a real CMS category after navigation. The selected label and
          // chevrons must contrast against their fill at all responsive widths.
          if (await dropdown.locator('a[data-cat="uncategorized"]').count() ||
              await dropdown.locator("a.dropdown-option").filter({ hasText: /^Uncategorized$/i }).count())
            throw Error("WordPress Uncategorized is visible in the PSE news filter");
          const agriculture = dropdown.locator("a[data-cat]").filter({ hasText: "Kiến thức nông nghiệp" }).first();
          if (await agriculture.count() !== 1)
            throw Error("Known PSE agricultural category absent from CMS dropdown");
          const selectedHref = await agriculture.getAttribute("href");
          if (!selectedHref) throw Error("Selected category href missing");
          const selectedPage = await browser.newPage({ viewport: { width, height: 850 } });
          try {
            const response = await selectedPage.goto(new URL(selectedHref, origin).toString(), {
              waitUntil: "domcontentloaded", timeout: 60000
            });
            if (response?.status() !== 200) throw Error("Selected category HTTP " + response?.status());
            const selectedTrigger = selectedPage.locator("#dropdown-trigger");
            const colors = await selectedTrigger.evaluate((button) => {
              const readRgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
              const luminance = (value) => {
                const channels = readRgb(value).map(c => {
                  const x = c / 255;
                  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
                });
                return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
              };
              const bg = getComputedStyle(button).backgroundColor;
              const text = getComputedStyle(button.querySelector("span")).color;
              const icon = getComputedStyle(button.querySelector("svg")).color;
              const ratio = (a, b) => {
                const [light, dark] = [luminance(a), luminance(b)].sort((a, b) => b - a);
                return (light + 0.05) / (dark + 0.05);
              };
              return { active: button.dataset.categorySelected, bg, text, icon,
                textContrast: ratio(text, bg), iconContrast: ratio(icon, bg) };
            });
            if (colors.active !== "true" || colors.textContrast < 4.5 ||
                colors.iconContrast < 3)
              throw Error("Selected news filter unreadable: " + JSON.stringify(colors));
            const selectedMenu = selectedPage.locator("#dropdown-menu");
            await selectedTrigger.click();
            if (!await selectedMenu.isVisible()) throw Error("Selected category dropdown won't open");
            if (await selectedMenu.locator('a[data-cat="uncategorized"]').count() ||
                await selectedMenu.locator("a.dropdown-option").filter({ hasText: /^Uncategorized$/i }).count())
              throw Error("Uncategorized still appears on selected category route");
            console.log("PSE_NEWS_SELECTED_FILTER=" + JSON.stringify({ width,
              textContrast: Number(colors.textContrast.toFixed(2)),
              iconContrast: Number(colors.iconContrast.toFixed(2)),
              hiddenUncategorized: true, categoryNavigation: "PASS" }));
            await selectedPage.screenshot({
              path: `artifacts/pse-listing-toolbar/selected-category-${width}.png`
            });
          } finally {
            await selectedPage.close();
          }

        }
        if (name === "products") {
          const stack = await page.evaluate(() => {
            const toolbar = document.querySelector("[data-listing-toolbar]");
            const menu = document.querySelector("#dropdown-menu");
            const card = document.querySelector("#product-grid article") || document.querySelector("main article");
            if (!toolbar || !menu || !card) return { z: -1, above: false, noOverlap: false };
            const z = Number(getComputedStyle(toolbar).zIndex);
            const a = menu.getBoundingClientRect(), b = card.getBoundingClientRect();
            const left = Math.max(a.left, b.left, 0), right = Math.min(a.right, b.right, innerWidth);
            const top = Math.max(a.top, b.top, 0), bottom = Math.min(a.bottom, b.bottom, innerHeight);
            const noOverlap = right <= left || bottom <= top;
            if (noOverlap) return { z, above: true, noOverlap };
            const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
            return { z, above: Boolean(hit && menu.contains(hit)), noOverlap };
          });
          if (stack.z < 1 || !stack.above) throw Error("Product category filter behind cards: " + JSON.stringify(stack));
          console.log("PSE_PRODUCT_FILTER_STACK=" + JSON.stringify({ width, ...stack }));
        }
        await trigger.click();
        if (await dropdown.isVisible()) throw Error(name + " filter failed to close");
        await page.evaluate(() => window.scrollTo({ top: 1100, behavior: "instant" }));
        await page.waitForTimeout(250);
        const after = await page.evaluate(() => {
          const el = document.querySelector("[data-listing-toolbar]");
          const rect = el.getBoundingClientRect();
          return { position: getComputedStyle(el).position, top: rect.top, bottom: rect.bottom, scrollY: window.scrollY };
        });
        if (after.scrollY < 250 || !["static", "relative"].includes(after.position) || before.top - after.top < 250 || after.bottom >= 0) {
          throw Error(name + " toolbar still floats on scroll: " + JSON.stringify({ before, after }));
        }
        if (name === "news") {
          const fallback = await page.request.get(origin + "/images/posts/no-image.svg");
          if (!fallback.ok() || !String(fallback.headers()["content-type"] || "").includes("image/svg+xml"))
            throw Error("Missing news default image HTTP " + fallback.status());
          const image = page.locator(".post-card-img").first();
          if (await image.count()) {
            await image.evaluate((img) => {
              // Synthetic image error, browser-only. Verify the real card handler
              // switches once and no second event can start a retry loop.
              img.dispatchEvent(new Event("error"));
              img.dispatchEvent(new Event("error"));
            });
            const details = await image.evaluate(img => ({
              src: img.getAttribute("src"),
              srcset: img.getAttribute("srcset"),
              fallbackApplied: img.dataset.fallbackApplied
            }));
            if (!details.src?.endsWith("/images/posts/no-image.svg") ||
              details.srcset !== null || details.fallbackApplied !== "true")
              throw Error("News default image fallback contract broken: " + JSON.stringify(details));
            await image.evaluate(img => img.decode());
          }
          console.log("PSE_NEWS_FALLBACK=" + JSON.stringify({ width, asset: 200, syntheticErrorOnce: true }));
        }
        await page.screenshot({ path: `artifacts/pse-listing-toolbar/${name}-${width}.png` });
        const record = { name, path, width, position: after.position, scrollY: after.scrollY, offscreen: after.bottom < 0, filter: "click-toggle PASS", pass: true };
        results.push(record);
        console.log("PSE_LISTING_TOOLBAR_LIVE=" + JSON.stringify(record));
      } finally {
        await page.close();
      }
    }
  }
  // Native Product categories come from WordPress product_cat and are public SSR URLs,
  // not client-only ?cat filters. Verify responsive card geometry and SEO canonical.
  for (const width of [390, 768, 1440]) {
    const categoryPage = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      const res = await categoryPage.goto(origin + "/san-pham/huu-co-phu-my", { waitUntil: "domcontentloaded", timeout: 60000 });
      if (res?.status() !== 200) throw Error("Product category SSR returned HTTP " + res?.status());
      const heading = (await categoryPage.locator("main h1").first().innerText()).trim();
      if (!heading.toLocaleLowerCase("vi").includes("hữu cơ phú mỹ"))
        throw Error("WordPress product_cat SSR heading missing: " + heading);
      const canonical = await categoryPage.locator('link[rel="canonical"]').first().getAttribute("href");
      if (!canonical || !new URL(canonical).pathname.replace(/\/+$/,"").endsWith("/san-pham/huu-co-phu-my"))
        throw Error("Canonical category URL incorrect: " + canonical);
      const cards = categoryPage.locator("main article");
      if (await cards.count() < 2) throw Error("Organic category missing CMS product cards");
      const a = await cards.nth(0).boundingBox(), b = await cards.nth(1).boundingBox();
      if (!a || !b) throw Error("Product card geometry missing");
      const twoColumns = width >= 768;
      if (twoColumns && (Math.abs(a.y - b.y) > 12 || b.x <= a.x + 50))
        throw Error("SSR catalog not two columns at " + width);
      if (!twoColumns && b.y <= a.y + a.height * 0.6)
        throw Error("SSR catalog not stacked on small mobile");
      const picture = await cards.first().locator("img").first().boundingBox();
      const headingBox = await cards.first().locator("h2").first().boundingBox();
      if (!picture || !headingBox) throw Error("Product image or title missing");
      if (width >= 768 && picture.x >= headingBox.x)
        throw Error("Product image should be left of text at " + width);
      const categoryMenu = categoryPage.locator("#dropdown-menu");
      await categoryPage.locator("#dropdown-trigger").click();
      if (!await categoryMenu.isVisible()) throw Error("WordPress Product Category dropdown failed");
      if (!await categoryMenu.locator('a[href*="/san-pham/"]').count())
        throw Error("Dropdown missing public Product category links");
      console.log("PSE_PRODUCT_CATEGORY_SSR=" + JSON.stringify({ width, heading, canonical, twoColumns, count: await cards.count(), cmsTaxonomy: true }));
      await categoryPage.screenshot({ path: "artifacts/pse-listing-toolbar/category-organic-" + width + ".png" });
    } finally { await categoryPage.close(); }
  }
  // The native CPT content must match source-verified details for Joomla #1457.
  // This checks real UI rendering, not a fabricated fixture or WordPress edit.
  const productPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    const catalog = await productPage.goto(origin + "/san-pham?q=Kebo", { waitUntil: "domcontentloaded", timeout: 60000 });
    if (catalog?.status() !== 200) throw Error("PSE SSR catalog search unavailable");
    const keboLink = productPage.locator('main article a[href*="-1457"]').first();
    await keboLink.waitFor({ state: "visible", timeout: 25000 });
    const card = keboLink.locator("xpath=ancestor::article");
    const cardText = (await card.innerText()).replace(/\s+/g, " ");
    for (const text of ["23932", "Kẽm", "Bo", "Loại cây"]) {
      if (!cardText.includes(text)) throw Error("Kebo catalog summary missing " + text);
    }
    const target = await keboLink.getAttribute("href");
    if (!target) throw Error("Kebo linked product missing URL");
    const detail = await productPage.goto(new URL(target, origin).toString(), { waitUntil: "domcontentloaded", timeout: 60000 });
    if (detail?.status() !== 200) throw Error("Kebo native product detail HTTP " + detail?.status());
    const body = (await productPage.locator(".product-description").innerText()).replace(/\s+/g, " ");
    for (const text of ["23932", "Hướng dẫn sử dụng", "36 tháng", "500 ppm"]) {
      if (!body.includes(text)) throw Error("Kebo verified original detailed usage missing " + text + "; body sample=" + body.slice(0, 1900));
    }
    if (!/50\s*[-–—]\s*200\s*kg\s*\/\s*ha/i.test(body)) {
      throw Error("Kebo verified original 50–200 kg/ha dosage missing; rendered detail excerpt=" + body.slice(0, 2600));
    }
    const tables = await productPage.locator(".product-description table").count();
    if (tables < 2) throw Error("Original Kebo nutrient and crop dosage tables not shown");
    const header = productPage.locator('#desktop-menu [data-menu-trigger]').filter({ hasText: /HOẠT ĐỘNG KINH DOANH/i }).first();
    if (await header.count() !== 1) throw Error("Product detail lost Vietnamese header menu label");
    if (!(await header.innerText()).includes("HOẠT ĐỘNG")) throw Error("Product header lost diacritics");
    console.log("PSE_PRODUCT_DETAIL_MENU=" + JSON.stringify({label:(await header.innerText()).trim(),utf8:true}));
    console.log("PSE_PRODUCT_KEBO_PARITY=" + JSON.stringify({ sourceJoomlaId: 1457, wpProductId: 80940, code: 23932, tables, summary: true, details: true, verified: true }));
    await productPage.screenshot({ path: "artifacts/pse-listing-toolbar/kebo-product-detail-1440.png", fullPage: true });
  } finally {
    await productPage.close();
  }
  console.log("PSE_LISTING_TOOLBAR_SUMMARY=" + JSON.stringify({ checked: results.length, passed: results.filter(x => x.pass).length, readOnly: true, noCmsWrite: true }));
} finally {
  await browser.close();
}
