#!/usr/bin/env node
// Read-only PSE brand spelling audit: sitemap + reachable internal pages.
// This script never submits forms, mutates WordPress, or triggers deployment.
import fs from "node:fs/promises";
import path from "node:path";

const origin = "https://pse.webnvn.com";
const canonical = "PVFCCo-PSE";
const pattern = /(?<![a-z0-9])pvfcco[\s\u00a0]*(?:[-\u2010-\u2015][\s\u00a0]*)?pse(?![a-z0-9])/gi;
const maxPages = 1200;
const concurrency = 3;
const reportDir = "audit-results";

function matches(text) {
  return [...String(text || "").matchAll(pattern)].map((m) => m[0]);
}

function htmlEscape(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function decodeXml(text) {
  return String(text).replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const names = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
    const lower = entity.toLowerCase();
    if (names[lower]) return names[lower];
    if (lower.startsWith("&#x")) return String.fromCodePoint(parseInt(lower.slice(3, -1), 16));
    if (lower.startsWith("&#")) return String.fromCodePoint(parseInt(lower.slice(2, -1), 10));
    return entity;
  });
}

function normalize(raw) {
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || url.username || url.password) return null;
    if (!/^\/(?!api\/|wp-admin\/|wp-json\/|wp-login)/i.test(url.pathname)) return null;
    if (/\.(?:webp|png|jpe?g|gif|svg|pdf|zip|css|js|xml|txt|ico|woff2?|mp4|avif)$/i.test(url.pathname)) return null;
    if (url.pathname.includes("/wp-content/") || url.pathname.includes("/_astro/")) return null;
    const allowedQuery = new URLSearchParams();
    for (const key of ["page", "paged"]) {
      const p = url.searchParams.get(key);
      if (p && /^\d{1,4}$/.test(p)) allowedQuery.set(key, p);
    }
    url.hash = "";
    url.search = allowedQuery.toString();
    return url.href;
  } catch {
    return null;
  }
}

async function readSitemaps(enqueue) {
  const seen = new Set();
  let discovered = 0;
  let valid = 0;
  const candidates = ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"];
  async function parseSitemap(url, depth) {
    if (depth > 4 || seen.size >= 50 || seen.has(url)) return;
    seen.add(url);
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: "error", headers: { "User-Agent": "PSE-ReadOnly-Brand-Audit/1.0" } });
    } catch (error) {
      console.log("SITEMAP_UNAVAILABLE " + url + " " + error.constructor.name);
      return;
    }
    if (!response.ok) {
      console.log("SITEMAP_HTTP " + url + " " + response.status);
      return;
    }
    const xml = await response.text();
    if (!/<(?:\w+:)?(?:sitemapindex|urlset)\b/i.test(xml)) return;
    valid++;
    const locations = [...xml.matchAll(/<(?:\w+:)?loc(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?loc>/gi)]
      .map((match) => decodeXml(match[1].trim()));
    const isIndex = /<(?:\w+:)?sitemapindex\b/i.test(xml);
    for (const location of locations) {
      let parsed;
      try { parsed = new URL(location); } catch { continue; }
      if (parsed.origin !== origin) continue;
      if (isIndex) await parseSitemap(parsed.href, depth + 1);
      else if (enqueue(parsed.href)) discovered++;
    }
  }
  for (const item of candidates) await parseSitemap(origin + item, 0);
  return { valid, discovered, checked: seen.size };
}

async function main() {
  if (process.argv.includes("--self-test")) {
    const good = matches("PVFCCo-PSE");
    const bad = matches("PVFCCO-PSE, PVFCCO - PSE, pvfcco–pse");
    if (good.length !== 1 || good[0] !== canonical || bad.length !== 3 || !normalize(origin + "/gioi-thieu/") ||
      normalize("https://example.com/") !== null || matches("PVFCCo-PSE123").length !== 0) {
      throw new Error("Brand regex/URL self-test failed");
    }
    console.log("PSE_BRAND_AUDIT_SELF_TEST=PASS");
    return;
  }
  if (process.env.SITE_URL && new URL(process.env.SITE_URL).origin !== origin) {
    throw new Error("Unexpected SITE_URL; this audit is restricted to PSE");
  }
  const { chromium } = await import("playwright");
  await fs.mkdir(reportDir, { recursive: true });

  const queue = [];
  const known = new Set();
  const visited = new Set();
  const pages = [];
  const errors = [];
  let truncated = false;
  let inFlight = 0;
  let finished = false;

  function enqueue(raw) {
    const url = normalize(raw);
    if (!url || known.has(url)) return false;
    if (known.size >= maxPages) { truncated = true; return false; }
    known.add(url);
    queue.push(url);
    return true;
  }

  enqueue(origin + "/");
  const sitemap = await readSitemaps(enqueue);
  console.log("PSE_SITEMAP valid=" + sitemap.valid + " urls=" + sitemap.discovered + " checked=" + sitemap.checked);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    ignoreHTTPSErrors: false,
  });

  async function worker() {
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));
    try {
      for (;;) {
        if (!queue.length) {
          if (inFlight === 0) break;
          await new Promise((resolve) => setTimeout(resolve, 150));
          continue;
        }
        const url = queue.shift();
        if (visited.has(url)) continue;
        visited.add(url);
        inFlight++;
        try {
          const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
          if (!response || response.status() >= 400) {
            errors.push({ url, error: "HTTP " + (response ? response.status() : "no response") });
            continue;
          }
          if (new URL(page.url()).origin !== origin) {
            errors.push({ url, error: "Unexpected redirect origin" });
            continue;
          }
          const contentType = response.headers()["content-type"] || "";
          if (!contentType.includes("html")) continue;
          const result = await page.evaluate(() => {
            const canonical = "PVFCCo-PSE";
            const re = /(?<![a-z0-9])pvfcco[\s\u00a0]*(?:[-\u2010-\u2015][\s\u00a0]*)?pse(?![a-z0-9])/gi;
            const issues = [];
            const seen = new Set();
            function add(value, kind, location, uppercase = false) {
              for (const m of String(value || "").matchAll(re)) {
                const actual = m[0];
                if (actual === canonical && !uppercase) continue;
                const displayed = actual === canonical && uppercase ? "PVFCCO-PSE (CSS text-transform: uppercase)" : actual;
                const key = kind + "|" + location + "|" + displayed;
                if (!seen.has(key)) {
                  seen.add(key);
                  issues.push({
                    kind, location, actual: displayed, expected: canonical,
                    sample: String(value).replace(/\s+/g, " ").trim().slice(0, 230),
                  });
                }
              }
            }
            add(document.title, "seo-title", "head > title");
            for (const meta of document.querySelectorAll("meta[content]")) {
              const name = meta.getAttribute("name") || meta.getAttribute("property") || meta.getAttribute("itemprop") || "meta";
              add(meta.getAttribute("content"), "meta", "meta[" + name + "]");
            }
            const attrs = ["alt", "title", "aria-label", "placeholder", "content"];
            for (const el of document.querySelectorAll("body *")) {
              const tag = el.tagName.toLowerCase();
              if (["script", "style", "noscript", "template"].includes(tag)) continue;
              const location = tag + (el.id ? "#" + el.id : el.classList.length ? "." + String(el.classList[0]).slice(0, 35) : "");
              for (const attr of attrs) {
                if (el.hasAttribute(attr)) add(el.getAttribute(attr), "attribute-" + attr, location);
              }
            }
            if (document.body) {
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              let node;
              while ((node = walker.nextNode())) {
                const parent = node.parentElement;
                if (!parent || parent.closest("script,style,noscript,template")) continue;
                const value = node.nodeValue || "";
                if (!/pvfcco/i.test(value)) continue;
                const styles = getComputedStyle(parent);
                if (styles.display === "none" || styles.visibility === "hidden" || !parent.getClientRects().length) continue;
                const location = parent.tagName.toLowerCase() +
                  (parent.id ? "#" + parent.id : parent.classList.length ? "." + String(parent.classList[0]).slice(0, 35) : "");
                add(value, "visible-text", location, styles.textTransform === "uppercase");
              }
            }
            return {
              issues: issues.slice(0, 150),
              issuesTruncated: issues.length > 150,
              links: [...document.querySelectorAll("a[href]")].map((a) => a.href).slice(0, 2500),
              title: document.title,
            };
          });
          pages.push({ url, title: result.title, issues: result.issues });
          if (result.issuesTruncated) truncated = true;
          for (const href of result.links) enqueue(href);
          if (visited.size % 25 === 0) console.log("PSE_SCAN_PROGRESS visited=" + visited.size + " queue=" + queue.length);
        } catch (error) {
          errors.push({ url, error: error.name || "UnknownError", message: String(error.message || "").slice(0, 150) });
        } finally {
          inFlight--;
        }
      }
    } finally {
      await page.close();
    }
  }

  try { await Promise.all(Array.from({ length: concurrency }, () => worker())); }
  finally { await browser.close(); }
  const findings = pages.flatMap((page) => page.issues.map((issue) => ({ url: page.url, ...issue })));
  const report = {
    origin, canonical, checkedAt: new Date().toISOString(), sitemap,
    pagesChecked: pages.length, urlCandidates: known.size, truncated,
    errorCount: errors.length, errors, findingCount: findings.length, findings,
  };
  await fs.writeFile(path.join(reportDir, "pse-brand-spelling-audit.json"), JSON.stringify(report, null, 2));
  const rows = [
    "# PSE Brand Spelling Audit",
    "",
    "Expected: " + canonical,
    "",
    "- Site: " + origin,
    "- Checked: " + report.pagesChecked + " HTML pages",
    "- Sitemap discovered: " + sitemap.discovered + " URLs; indexes: " + sitemap.checked,
    "- Findings: " + findings.length,
    "- Errors: " + errors.length,
    "- Truncated: " + truncated,
    "",
    "## Findings",
    "",
    "| URL | Kind | Element | Actual |",
    "|---|---|---|---|",
    ...findings.slice(0, 400).map((x) =>
      "| " + htmlEscape(x.url).replace(/\|/g, "%7C") + " | " + x.kind + " | " +
      htmlEscape(x.location).replace(/\|/g, " ") + " | " +
      htmlEscape(x.actual).replace(/\|/g, " ") + " |"),
    "",
    "## Failed pages",
    "",
    ...errors.slice(0, 100).map((x) => "- " + x.url + ": " + x.error),
  ];
  await fs.writeFile(path.join(reportDir, "pse-brand-spelling-audit.md"), rows.join("\n"));
  console.log("PSE_BRAND_AUDIT checked=" + pages.length + " findings=" + findings.length +
    " errors=" + errors.length + " sitemap=" + sitemap.discovered + " truncated=" + truncated);
  for (const issue of findings.slice(0, 120)) {
    console.log("BRAND_FINDING " + JSON.stringify(issue));
  }
  for (const error of errors.slice(0, 30)) {
    console.log("SCAN_ERROR " + JSON.stringify(error));
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
      "### PSE brand spelling audit\n" +
      "- Checked: " + pages.length + " pages\n" +
      "- Findings: " + findings.length + "\n" +
      "- Errors: " + errors.length + "\n" +
      "- Truncated: " + truncated + "\n" +
      "- Report attached as workflow artifact\n");
  }
  if (!sitemap.valid || truncated || errors.length || findings.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("PSE_BRAND_AUDIT_FATAL " + String(error.stack || error));
  process.exitCode = 2;
});
