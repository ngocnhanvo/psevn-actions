/**
 * Retire ONLY confirmed inherited Page 53390 ('Về chúng tôi') to draft.
 * PSE public WP source audit proved it is not a current-site Page:
 * 58 rendered chars, no PSE evidence; current PSE profile lives in 79301/79279.
 * Reversible WP status-only action, never delete, never touch meta or other posts.
 * Only use real WP admin session and same-origin REST nonce.
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const parseEnv = (name) => {
  const values = String(process.env.ENV_FILE ?? "").split(/\r?\n/)
    .map(s => s.trim().replace(/^export\s+/, ""))
    .filter(s => s.startsWith(name + "=")).map(s => s.slice(name.length + 1).trim().replace(/^["']|["']$/g, ""));
  if (values.length !== 1 || !values[0]) throw Error("Missing unique env " + name);
  return new URL(values[0]);
};
const wp = parseEnv("WC_URL");
const front = parseEnv("WC_URL_CLIENT");
function verifyOrigin(url, expectedHost) {
  if (url.protocol !== "https:" || url.hostname !== expectedHost
    || url.port && url.port !== "443" || !["","/"].includes(url.pathname)
    || url.search || url.hash || url.username || url.password) throw Error("Unexpected origin: " + expectedHost);
}
verifyOrigin(wp, "admin-pse.webnvn.com");
verifyOrigin(front, "pse.webnvn.com");
if (!process.env.WP_ADMIN_USERNAME || !process.env.WP_ADMIN_PASSWORD) throw Error("WordPress admin secrets missing");
if (process.env.PSE_RETIRE_LEGACY_ABOUT !== "1") throw Error("This command requires explicit one-off retirement marker");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "vi-VN" });
const page = await context.newPage();
let changed = false;
let lastStatus = "";
const sha = s => createHash("sha256").update(s).digest("hex");
try {
  await page.goto(wp.origin + "/wp-admin/", {waitUntil:"domcontentloaded",timeout:60000});
  if (await page.locator("#user_login").count()) {
    await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
    await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
    const text = await page.locator("body").innerText();
    const m = text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i) || text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if (m) {
      const a=Number(m[1]), b=Number(m[3]), value=({"+":a+b,"-":a-b,"x":a*b,"×":a*b,"*":a*b})[m[2]];
      const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if (!await input.count()) throw Error("Unknown login challenge");
      await input.fill(String(value));
    }
    await page.locator("#wp-submit").click();
    await page.waitForLoadState("domcontentloaded");
  }
  if (page.url().includes("wp-login")) throw Error("WP login failed");

  const nonce = await page.evaluate(async () => {
    if (window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
    const r = await fetch("/wp-admin/admin-ajax.php?action=rest-nonce", {credentials:"same-origin"});
    if (!r.ok) throw Error("REST nonce unavailable");
    return (await r.text()).trim();
  });
  if (!/^[a-zA-Z0-9]{8,24}$/.test(nonce) || nonce === "0") throw Error("No valid WP REST nonce");

  const api = async (method, path, data) => page.evaluate(async({method,path,data,nonce}) => {
    const response=await fetch(path, {
      method, credentials:"same-origin",
      headers: {"Accept":"application/json", "X-WP-Nonce":nonce, ...(data?{"Content-Type":"application/json"}:{})},
      ...(data?{body:JSON.stringify(data)}:{})
    });
    return {http:response.status, payload:await response.json().catch(()=>null)};
  }, {method,path,data,nonce});

  // Explicit ID/status/slug/title and very short non-PSE content require all match.
  const before = await api("GET", "/wp-json/wp/v2/pages/53390?context=edit");
  if (before.http !== 200) throw Error("CMS preflight HTTP " + before.http);
  const row=before.payload;
  const title=String(row?.title?.raw ?? row?.title?.rendered ?? "").replace(/<[^>]*>/g,"").trim();
  const raw=String(row?.content?.raw ?? "");
  const rendered=String(row?.content?.rendered ?? "");
  if (row?.id !== 53390 || row?.type !== "page" || row?.slug !== "ve-chung-toi" || title !== "Về chúng tôi") {
    throw Error("Unexpected Page ID/slug/type/title, refuse change");
  }
  if (row.status === "draft") {
    console.log("PSE_LEGACY_ABOUT_ALREADY_DRAFT=PASS writes=0");
    await context.close(); await browser.close(); process.exit(0);
  }
  if (row.status !== "publish" || rendered.length < 10 || rendered.length > 100
      || /\bpse\b|pvfcco|ph[uú]\s*m[yỹ]/iu.test(rendered + " " + raw)) {
    throw Error("Unexpected page state or PSE content, refuse retire");
  }
  console.log("PSE_LEGACY_ABOUT_IDENTITY=PASS slug=ve-chung-toi status=publish rendered_chars="+rendered.length);
  // Verify the current PSE company Pages are published before retiring the legacy page.
  for (const [id, slug] of [[79301,"qua-trinh-hinh-thanh-phat-trien"],[79279,"nganh-nghe-kinh-doanh"]]) {
    const valid=await api("GET", "/wp-json/wp/v2/pages/"+id+"?context=edit");
    if (valid.http !== 200 || valid.payload?.status !== "publish" || valid.payload?.slug !== slug
        || !String(valid.payload?.content?.rendered ?? "").trim()) {
      throw Error("Authoritative PSE source page not verified id="+id);
    }
  }
  console.log("PSE_LEGACY_ABOUT_PSE_REPLACEMENTS=PASS pages=2");

  // Public pages MUST NOT link to the orphan URL.
  const publicPages=await api("GET", "/wp-json/wp/v2/pages?per_page=100&status=publish&_fields=id,slug,content");
  if (publicPages.http !== 200 || !Array.isArray(publicPages.payload) || publicPages.payload.length < 20
      || publicPages.payload.length > 100) throw Error("Published-page inventory incomplete");
  const linked=publicPages.payload.filter(p => p.id !== 53390
    && /(?:\/|%2f)ve-chung-toi(?:\/|[?"'#]|%2f|$)/i.test(String(p.content?.rendered ?? "")));
  if (linked.length) throw Error("Other current published pages reference legacy URL; refuse retire count="+linked.length);
  const publicPage=await page.goto(front.origin+"/", {waitUntil:"domcontentloaded",timeout:60000});
  if (publicPage?.status() !== 200) throw Error("Public PSE homepage not 200");
  const navRefs=await page.locator('header a[href*="ve-chung-toi"],nav a[href*="ve-chung-toi"],footer a[href*="ve-chung-toi"]').count();
  if (navRefs) throw Error("Current Astro navigation uses legacy page; refuse retirement");
  console.log("PSE_LEGACY_ABOUT_REFERENCE_CHECK=PASS published_pages="+publicPages.payload.length+" site_nav=0");

  // Backup exact current record in private artifact; status-only mutation is immediately reversible.
  const backupDir="artifacts/pse-agent-orphan-about-retirement";
  await mkdir(backupDir,{recursive:true});
  const backup={id:row.id,status:row.status,slug:row.slug,title:row.title,
    content:row.content, date:row.date, date_gmt:row.date_gmt, modified:row.modified,
    beforeSha256:sha(JSON.stringify(row)), writtenAt:new Date().toISOString()};
  await writeFile(backupDir+"/page-53390-before.json",JSON.stringify(backup,null,2),{mode:0o600});
  console.log("PSE_LEGACY_ABOUT_BACKUP=PASS sha256="+backup.beforeSha256);

  // Go back to WP authenticated page before mutation.
  await page.goto(wp.origin + "/wp-admin/", {waitUntil:"domcontentloaded",timeout:60000});
  const updated=await api("POST","/wp-json/wp/v2/pages/53390",{status:"draft"});
  changed = updated.http === 200 && updated.payload?.id === 53390 && updated.payload?.status === "draft";
  if (!changed) throw Error("Draft transition failed HTTP "+updated.http);
  const after=await api("GET","/wp-json/wp/v2/pages/53390?context=edit");
  if (after.http !== 200 || after.payload?.status !== "draft"
      || after.payload?.slug !== "ve-chung-toi" || String(after.payload?.content?.raw ?? "") !== raw) {
    throw Error("Read-after-write did not confirm unchanged content and draft state");
  }
  // Browser context has WP cookies; public test requires an independent unauthenticated request.
  const publicContext = await browser.newContext();
  const publicResponse=await publicContext.request.get(wp.origin + "/wp-json/wp/v2/pages/53390");
  await publicContext.close();
  if (publicResponse.status()===200) throw Error("Legacy page still exposed through public WP REST");
  console.log("PSE_LEGACY_ABOUT_RETIRED=PASS status=draft source_content_unchanged=true public_http="+publicResponse.status());
  lastStatus="PASS";
} catch(err) {
  console.log("PSE_LEGACY_ABOUT_RETIRED=FAIL class="+err.constructor.name+" detail="+String(err.message).slice(0,240));
  if (changed) {
    try {
      await page.goto(wp.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
      const nonce=await page.evaluate(async()=>{const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});return (await r.text()).trim()});
      const rollback=await page.evaluate(async nonce=>{
        const r=await fetch("/wp-json/wp/v2/pages/53390",{
          method:"POST",credentials:"same-origin",
          headers:{"Content-Type":"application/json","X-WP-Nonce":nonce},
          body:JSON.stringify({status:"publish"})
        });return {http:r.status,status:(await r.json()).status};
      },nonce);
      console.log("PSE_LEGACY_ABOUT_ROLLBACK="+(rollback.http===200&&rollback.status==="publish"?"PASS":"FAIL"));
    }catch(e){console.log("PSE_LEGACY_ABOUT_ROLLBACK=FAIL class="+e.constructor.name)}
  }
  process.exitCode=1;
}finally {
  await context.close();
  await browser.close();
}
