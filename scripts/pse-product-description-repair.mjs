/** Source-verifiable Joomla -> existing native WP Product excerpts/details. No Astro build. */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const subject = String(event.head_commit?.message || "").split("\n")[0];
const batchMatch = subject.match(/^cms\(pse\): restore verified fertilizer descriptions batch ([1-9][0-9]*)$/);
const dry = subject === "audit(pse): product content parity dry-run";
if (!batchMatch && !dry) throw Error("Explicit content-repair audit/batch commit identity required");
const batch = batchMatch ? Number(batchMatch[1]) : 0;
const batchSize = 8;
const env = String(process.env.ENV_FILE || "").split(/\r?\n/).map(s => s.trim().replace(/^export\s+/, ""));
const originSetting = env.filter(s => s.startsWith("WC_URL="));
if (originSetting.length !== 1) throw Error("Expected verified WordPress origin");
const wpUrl = new URL(originSetting[0].slice(7).replace(/^['"]|['"]$/g, ""));
if (wpUrl.protocol !== "https:" || wpUrl.username || wpUrl.password || wpUrl.search || wpUrl.hash || !["", "/"].includes(wpUrl.pathname)) throw Error("Invalid WP origin");
const wpOrigin = wpUrl.origin;
const legacyOrigin = "https://www.pse.vn";
const familyPaths = [
  "nhom-phan-don-va-phan-phuc-hop-phu-my",
  "nhom-phan-hon-hop-npk-phu-my",
  "huu-co-phu-my",
  "phan-bon-sinh-hoc",
  "nhom-san-pham-ure-nguyen-lieu-cho-san-xuat-cong-nghiep",
  "dam-phu-my"
];
const idHash = s => createHash("sha256").update(String(s)).digest("hex");
const escaped = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const normalize = s => String(s || "").replace(/<[^>]*>/g, " ").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const admin = await context.newPage(), source = await context.newPage();
const report = { mode: dry ? "dry" : "apply", batch, groupSize: batchSize, products: [], errors: [], sourceFamilies: [], changed: 0, skippedUnverified: 0, unchanged: 0, eligible: 0 };
let preflightComplete = false;
try {
  await admin.goto(wpOrigin + "/wp-admin/", { waitUntil: "domcontentloaded", timeout: 60000 });
  if (await admin.locator("#user_login").count()) {
    await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME || "");
    await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD || "");
    const t = await admin.locator("body").innerText();
    const m = t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i) || t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if (m) {
      const a = +m[1], b = +m[3], v = ({ "+": a+b, "-": a-b, x: a*b, "×": a*b, "*": a*b })[m[2]];
      const input = admin.locator('#loginform input[name*="captcha" i], #loginform input[name*="math" i], #loginform input[name*="arith" i], #loginform input[type="number"]').first();
      if (!await input.count()) throw Error("WordPress login challenge is unsupported");
      await input.fill(String(v));
    }
    await Promise.all([admin.waitForLoadState("domcontentloaded"), admin.locator("#wp-submit").click()]);
  }
  if (admin.url().includes("wp-login")) throw Error("WordPress admin authentication failed");
  const nonce = await admin.evaluate(async () => {
    if (window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
    const r = await fetch("/wp-admin/admin-ajax.php?action=rest-nonce", { credentials: "same-origin" });
    if (!r.ok) throw Error("WordPress REST nonce missing");
    return (await r.text()).trim();
  });
  if (!/^[A-Za-z0-9]{8,24}$/.test(nonce)) throw Error("Malformed WordPress nonce");
  const api = (path, method = "GET", body = null) => admin.evaluate(async ({ path, method, body, nonce }) => {
    const r = await fetch(path, { method, credentials: "same-origin", headers: { "X-WP-Nonce": nonce, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { http: r.status, data: await r.json().catch(() => null) };
  }, { path, method, body, nonce });

  const cmsResponse = await api("/wp-json/wp/v2/product?context=edit&status=publish&per_page=100&_fields=id,slug,title,content,excerpt,acf,featured_media,product_cat");
  if (cmsResponse.http !== 200 || !Array.isArray(cmsResponse.data) || cmsResponse.data.length < 40) throw Error("Cannot verify complete published PSE Product set");
  const products = cmsResponse.data;
  const bySourceId = new Map();
  for (const product of products) {
    const id = String(product.acf?.origin_product_id || String(product.slug || "").match(/-([0-9]{3,5})$/)?.[1] || "");
    if (!/^\d{3,5}$/.test(id)) throw Error("Invalid migrated native Product origin id " + product.id);
    if (bySourceId.has(id)) throw Error("Duplicate native original Product ID " + id);
    bySourceId.set(id, product);
  }
  const candidates = new Map();
  for (const slug of familyPaths) {
    const family = legacyOrigin + "/hoat-dong-kinh-doanh/san-pham/" + slug + ".html";
    const response = await source.goto(family, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (response?.status() !== 200) throw Error("Original PSE product family missing " + slug);
    const rows = await source.evaluate(() => {
      const root = document.querySelector(".item-page [itemprop=articleBody]");
      if (!root) throw Error("Original articleBody missing");
      return [...root.querySelectorAll("table tr")].map(tr => {
        const cells = [...tr.children].filter(el => el.tagName === "TD");
        if (cells.length < 2 || !cells[0].querySelector("img[src]")) return null;
        const a = cells[0].querySelector("a[href*='id=']");
        if (!a) return null;
        const u = new URL(a.href, location.href);
        const legacyId = u.searchParams.get("id") || "";
        const full = (cells[1].textContent || "").replace(/\s+/g, " ").trim();
        const name = full.split(/Mã số\s*:/i)[0].trim();
        return { legacyId, name, full, detailUrl: u.href };
      }).filter(Boolean);
    });
    report.sourceFamilies.push({ slug, count: rows.length });
    for (const row of rows) {
      if (!/^\d{3,5}$/.test(row.legacyId)) continue;
      if (!candidates.has(row.legacyId)) candidates.set(row.legacyId, row);
    }
  }
  const ordered = [...bySourceId.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  const selected = batch ? ordered.slice((batch - 1) * batchSize, batch * batchSize) : ordered;
  if (!selected.length) throw Error("No native Product matches selected batch");
  console.log("PSE_PRODUCT_RESTORE_PREFLIGHT=" + JSON.stringify({ mode: report.mode, batch, native: products.length, originalIds: candidates.size, selected: selected.length, totalBatches: Math.ceil(ordered.length / batchSize) }));
  const plans = [];
  for (const [originId, product] of selected) {
    const row = candidates.get(originId);
    const nativeTitle = normalize(product.title?.raw || product.title?.rendered);
    if (!row || !row.detailUrl || !row.full.includes("Mã số") || !row.full.includes("Thành phần") || !row.full.includes("Loại cây") || normalize(row.name) !== nativeTitle) {
      report.errors.push({ originId, nativeId: product.id, reason: "Unverified original family row or title" });
      report.skippedUnverified++; continue;
    }
    const target = new URL(row.detailUrl);
    if (target.protocol !== "https:" || target.hostname !== "www.pse.vn" || !target.pathname.startsWith("/hoat-dong-kinh-doanh/san-pham/") || target.searchParams.get("id") !== originId) throw Error("Untrusted source Product detail URL " + originId);
    const response = await source.goto(target.href, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (response?.status() !== 200) { report.errors.push({ originId, nativeId: product.id, reason: "Legacy detail HTTP " + response?.status() }); report.skippedUnverified++; continue; }
    const detail = await source.evaluate(() => {
      const root = document.querySelector(".item-page [itemprop=articleBody]");
      if (!root) return null;
      const tables = [...root.querySelectorAll("table")].filter(t => t.parentElement?.closest("table") === null);
      if (tables.length < 2) return null;
      const originalText = (root.innerText || "").replace(/\s+/g, " ").trim();
      // Preserve the original data tables, but strip all scripts, external links,
      // legacy images and inline styles. Product gallery comes from native Media.
      const clean = table => {
        const clone = table.cloneNode(true);
        clone.querySelectorAll("td,th").forEach(cell => {
          if (cell.querySelector("img") && (cell.textContent || "").trim().length < 15) cell.remove();
        });
        clone.querySelectorAll("script,style,iframe,form,input,button,picture,img,svg,video,object,embed").forEach(el => el.remove());
        clone.querySelectorAll("a").forEach(a => a.replaceWith(...a.childNodes));
        clone.querySelectorAll("*").forEach(el => {
          for (const a of [...el.attributes]) if (!["colspan", "rowspan"].includes(a.name)) el.removeAttribute(a.name);
        });
        return clone.outerHTML;
      };
      const normalized = originalText.toLowerCase();
      if (!normalized.includes("mã số") || !normalized.includes("hàm lượng dinh dưỡng") || !normalized.includes("hướng dẫn sử dụng")) return null;
      return { tables: tables.slice(0, 2).map(clean), lengths: tables.slice(0, 2).map(t => (t.innerText || "").trim().length),
        text: originalText.slice(0, 750), title: document.title, guidance: normalized.includes("thời hạn sử dụng") };
    });
    if (!detail || !detail.guidance || detail.lengths.some(n => n < 70) || detail.tables.join("").length < 300) {
      report.errors.push({ originId, nativeId: product.id, reason: "Incomplete structured legacy usage/details table" });
      report.skippedUnverified++; continue;
    }
    const shortSpec = row.full.slice(row.name.length).trim().replace(/\s+(Mã số\s*:|Thành phần\s*:|Loại cây\s*:)/gi, "\n$1");
    const shortText = normalize(shortSpec.replace(/\n/g, "<br>")).split(" ").join(" "); // stable whitespace except trusted explicit separators
    const excerpt = "<p>" + escaped(shortText).replace(/Mã số\s*:/i, "Mã số:").replace(/\s+(Thành phần\s*:|Loại cây\s*:)/gi, "<br>$1") + "</p>";
    const description = "<h2>Thông tin chi tiết</h2>" + detail.tables[0] + "<h2>Hướng dẫn sử dụng</h2>" + detail.tables[1];
    const currentExcerpt = product.excerpt?.raw || product.excerpt?.rendered || "";
    const currentDescription = product.content?.raw || product.content?.rendered || "";
    const already = normalize(currentExcerpt).includes("Mã số") && normalize(currentExcerpt).includes("Thành phần") && normalize(currentExcerpt).includes("Loại cây") && /Hướng dẫn sử dụng/i.test(currentDescription) && /Thời hạn sử dụng/i.test(currentDescription) && currentDescription.length >= description.length * 0.55;
    plans.push({ originId, productId: product.id, title: nativeTitle, excerpt, description, before: { excerpt: currentExcerpt, content: currentDescription },
      detailUrl: target.href, original: detail, already });
    report.products.push({ originId, productId: product.id, title: nativeTitle, detailUrl: target.href,
      oldExcerptLength: currentExcerpt.length, oldContentLength: currentDescription.length,
      newExcerptLength: excerpt.length, newContentLength: description.length, originalTables: detail.tables.length,
      originalSample: detail.text.slice(0, 280), already });
  }
  report.eligible = plans.length;
  if (!dry) report.backups = plans.filter(item => !item.already).map(item => ({ originId: item.originId, productId: item.productId, before: item.before }));
  if (dry) {
    console.log("PSE_PRODUCT_DESCRIPTION_DRY=" + JSON.stringify({ native: products.length, matched: plans.length, unverified: report.errors, samples: report.products.filter(x => /Kebo|Drone/i.test(x.title)), previews: report.products.slice(0, 4) }).slice(0, 14000));
    preflightComplete = true;
  } else {
    if (!plans.length || report.skippedUnverified) throw Error("Unsafe product batch: some source records could not be verified; no WordPress writes");
    for (const item of plans) {
      if (item.already) { report.unchanged++; continue; }
      const updated = await api("/wp-json/wp/v2/product/" + item.productId, "POST", { excerpt: item.excerpt, content: item.description });
      if (updated.http !== 200) throw Error("Native Product update failed " + item.originId + " HTTP " + updated.http);
      const readback = await api("/wp-json/wp/v2/product/" + item.productId + "?context=edit&_fields=id,status,excerpt,content,featured_media,product_cat");
      if (readback.http !== 200 || readback.data?.status !== "publish" || !String(readback.data?.content?.raw || "").includes("Hướng dẫn sử dụng") ||
          !String(readback.data?.excerpt?.raw || "").includes("Loại cây") ||
          readback.data?.featured_media !== products.find(p => p.id === item.productId)?.featured_media ||
          JSON.stringify(readback.data?.product_cat) !== JSON.stringify(products.find(p => p.id === item.productId)?.product_cat)) throw Error("Content parity/readback failed " + item.originId);
      report.changed++;
      console.log("PSE_PRODUCT_RESTORED=" + JSON.stringify({ originId: item.originId, productId: item.productId, descriptionLength: (readback.data.content.raw || "").length, excerptLength: (readback.data.excerpt.raw || "").length, verified: true }));
    }
    preflightComplete = true;
  }
  console.log("PSE_PRODUCT_DESCRIPTION_REPAIR=" + JSON.stringify({ mode: report.mode, batch, eligible: report.eligible, changed: report.changed, unchanged: report.unchanged, skippedUnverified: report.skippedUnverified, dry: dry, preflightComplete }));
} finally {
  await mkdir("artifacts/pse-product-batch", { recursive: true });
  await writeFile("artifacts/pse-product-batch/product-description-repair.json", JSON.stringify({ ...report, preflightComplete }, null, 2) + "\n");
  // Backup originals separately for easy rollback of only fields changed.
  await browser.close();
}
