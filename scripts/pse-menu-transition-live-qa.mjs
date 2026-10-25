/** Read-only browser probe: verify that navigation really reveals the overlay
 * for internal WordPress Header links, including custom URLs lacking astro-link.
 * The test dispatches a cancellable click on an on-site anchor and reads the
 * overlay synchronously, before any actual page navigation can occur.
 */
import {chromium} from "playwright";

const settings = String(process.env.ENV_FILE || "").split(/\r?\n/).map(x => x.trim().replace(/^export\s+/, ""));
const value = settings.filter(x => x.startsWith("WC_URL_CLIENT="));
if (value.length !== 1) throw Error("Expected exactly one configured frontend origin");
const parsed = new URL(value[0].slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g, ""));
if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
    !["", "/"].includes(parsed.pathname)) throw Error("Invalid frontend origin");
const site = parsed.origin;
const browser = await chromium.launch({headless:true});
const output = [];
try {
  for (const width of [1440,390]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    try {
      const response = await page.goto(site + "/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my", {waitUntil:"domcontentloaded",timeout:60000});
      if (response?.status() !== 200) throw Error("Product group page HTTP " + response?.status());
      await page.waitForSelector("#page-nav-indicator", {state:"attached",timeout:20000});
      // Open the real root and nested news menus rather than testing a detached element.
      let root;
      if (width === 1440) {
        root = page.locator("#desktop-menu button[data-menu-trigger]").filter({hasText:/TIN TỨC/i}).first();
      } else {
        await page.locator("#hamburger-btn").click();
        root = page.locator("#mobile-menu-container button[data-menu-toggle]").filter({hasText:/TIN TỨC/i}).first();
      }
      if (!(await root.count())) throw Error("News menu root unavailable for " + width);
      await root.click();
      const panel = page.locator("#" + await root.getAttribute("aria-controls"));
      const targetAnchor = panel.locator('a[href]').filter({hasText:/Xem tất cả TIN TỨC/i}).first();
      if (!(await targetAnchor.count())) throw Error("View all News link unavailable for " + width);
      const libraryButton = panel
        .locator(width === 1440 ? "button[data-submenu-trigger]" : "button[data-menu-toggle]")
        .filter({hasText:/^Thư viện$/i}).first();
      if (await libraryButton.count() !== 1) throw Error("Native Library parent missing in News menu on " + width);
      await libraryButton.click();
      const libraryPanel = page.locator("#" + await libraryButton.getAttribute("aria-controls"));
      const libraryTexts = (await libraryPanel.locator("a[href]").allTextContents()).map(x=>x.trim());
      if (libraryTexts.some(x=>/xem tất cả/i.test(x)) ||
          !libraryTexts.some(x=>x==="Ảnh") || !libraryTexts.some(x=>x==="Video"))
        throw Error("Per-parent View all setting ignored on " + width + ": " + JSON.stringify(libraryTexts));
      console.log("PSE_LIBRARY_VIEW_ALL_BROWSER=" + JSON.stringify({width,viewAll:false,images:true,videos:true}));

      const scope = width === 1440 ? "#desktop-menu" : "#mobile-menu-container";
      const result = await page.evaluate(({scope}) => {
        const links = [...document.querySelectorAll(scope + " a[href]")];
        const internal = links.filter(a => {
          const url = new URL(a.href,location.href);
          return url.origin === location.origin && !a.hasAttribute("download") && (!a.target || a.target==="_self");
        });
        const missing = internal.filter(a => !a.classList.contains("astro-link")).map(a => ({label:(a.textContent||"").trim().slice(0,80),path:new URL(a.href).pathname}));
        const sample = internal.find(a => !a.classList.contains("astro-link")) || internal.find(a => /xem tất cả/i.test(a.textContent||"")) || internal[0];
        if (!sample) return {failed:"No internal links",width:window.innerWidth};
        const indicator = document.getElementById("page-nav-indicator");
        if (!indicator) return {failed:"No transition overlay"};
        const e = new MouseEvent("click",{bubbles:true,cancelable:true,button:0});
        sample.dispatchEvent(e);
        const css = getComputedStyle(indicator);
        const isVisible = !indicator.classList.contains("hidden") && css.display !== "none" && css.visibility !== "hidden";
        return {href:sample.getAttribute("href"),label:(sample.textContent||"").trim().slice(0,80),
          hadAstroLink:sample.classList.contains("astro-link"),missingCount:missing.length,missing:missing.slice(0,7),
          defaultPrevented:e.defaultPrevented,overlayVisible:isVisible,display:css.display,opacity:css.opacity,zIndex:css.zIndex};
      },{scope});
      output.push({width,...result});
      console.log("PSE_HEADER_OVERLAY_BROWSER=" + JSON.stringify(output.at(-1)));
      if (!result.defaultPrevented || !result.overlayVisible) throw Error("PSE menu overlay was not activated at "+width+"px: "+JSON.stringify(result));
    } finally {await page.close();}
  }
  console.log("PSE_HEADER_OVERLAY_BROWSER_PASS="+JSON.stringify({checked:output.length,readOnly:true}));
} finally {await browser.close();}
