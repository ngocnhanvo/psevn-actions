/**
 * Owner-authorized single-post publication date correction:
 * 2026.08.13 remains the disclosure TITLE, but publication DATE is 17/11/2026.
 * No WordPress records, content, URLs, SEO, categories or media besides this
 * post's date may be written. Run only after a fresh verified Updraft DB backup.
 */
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const POST_ID = 82508;
const CATEGORY = 1753;
const SLUG = "20260813-cbtt-bao-cao-tai-chinh-ban-nien-2026";
const TARGET_DAY = "2026-11-17";
const MARKER = "PSE_1742_PUBLICATION_DATE=2026-11-17\nPOST_ID=82508\n";
const request = await readFile(".pse-cbtt-1742-date-20261117-request", "utf8");
if (request !== MARKER ||
    process.env.GITHUB_REPOSITORY !== "ngocnhanvo/psevn-actions" ||
    process.env.PSE_1742_FRESH_DB_BACKUP_VERIFIED !== "yes") {
  throw new Error("Wrong PSE request, repository or no fresh verified rollback");
}

const env = Object.fromEntries(
  String(process.env.ENV_FILE || "").split(/\r?\n/).map(v=>v.trim().replace(/^export\s+/,""))
    .filter(v => /^(WC_URL|WC_URL_CLIENT)=/.test(v))
    .map(v => {const i=v.indexOf("=");return [v.slice(0,i),v.slice(i+1).trim().replace(/^['"]|['"]$/g,"")];})
);
function origin(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || !u.hostname || u.username || u.password ||
      u.port || u.search || u.hash || !["","/"].includes(u.pathname)) {
    throw new Error("Expected secure configured origin");
  }
  return u.origin;
}
const wp = origin(env.WC_URL), front = origin(env.WC_URL_CLIENT);
if (wp === front || !process.env.WP_ADMIN_USERNAME || !process.env.WP_ADMIN_PASSWORD) {
  throw new Error("Unexpected tenant or missing WordPress credentials");
}
const report = { postId: POST_ID, slug: SLUG, targetDay: TARGET_DAY, beforeDate:null,
  afterDate:null, contentPreserved:false, frontend:null, status:"UNVERIFIED" };
const browser = await chromium.launch({headless:true});
try {
  const ctx = await browser.newContext({viewport:{width:1280,height:800}});
  const page = await ctx.newPage();
  const resp = await page.goto(wp + "/wp-admin/", {waitUntil:"domcontentloaded",timeout:60000});
  if (!resp || resp.status() >= 500) throw new Error("WordPress admin unreachable");
  if (await page.locator("#user_login").count()) {
    await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
    await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
    const txt=(await page.locator("#loginform").innerText()).slice(0,600);
    const math=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
    if(math) {
      const a=+math[1], b=+math[3];
      const value=math[2]==="+"?a+b:math[2]==="-"?a-b:a*b;
      const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
      if(!await field.count())throw new Error("Login challenge input missing");
      await field.fill(String(value));
    }
    await page.locator("#wp-submit").click();
  }
  await page.goto(wp+"/wp-admin/post.php?post="+POST_ID+"&action=edit",
    {waitUntil:"domcontentloaded",timeout:60000});
  if(page.url().includes("wp-login") || !await page.locator("#adminmenu").count())
    throw new Error("No authenticated editor for exact WordPress post");
  const nonce=await page.evaluate(async()=>{
    if (window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
    const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
    if(!r.ok) throw new Error("Missing WordPress REST nonce");
    return (await r.text()).trim();
  });
  if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw new Error("Invalid WP REST nonce");
  const api=(path,method="GET",data)=>page.evaluate(async({path,method,data,nonce})=>{
    const r=await fetch(path,{method,credentials:"same-origin",
      headers:{"X-WP-Nonce":nonce,"Accept":"application/json",...(data?{"Content-Type":"application/json"}:{})},
      ...(data?{body:JSON.stringify(data)}:{})});
    return {status:r.status,data:await r.json().catch(()=>null)};
  },{path,method,data,nonce});
  const endpoint="/wp-json/wp/v2/posts/"+POST_ID;
  const fields="?context=edit&_fields=id,slug,status,date,date_gmt,title,content,excerpt,categories,tags,featured_media,acf";
  const before=await api(endpoint+fields);
  const p=before.data;
  const label=String(p?.title?.raw||p?.title?.rendered||"");
  if(before.status!==200 || p?.id!==POST_ID || p.slug!==SLUG ||
    p.status!=="publish" || !p.categories?.includes(CATEGORY) ||
    !label.includes("Báo cáo tài chính bán niên 2026") ||
    !label.includes("2026.08.13")) {
    throw new Error("Post identity, title, taxonomy or published status differs; refusing mutation");
  }
  report.beforeDate = p.date;
  const unmodified=x=>JSON.stringify({
    id:x.id,slug:x.slug,status:x.status,title:x.title?.raw||x.title?.rendered,
    content:x.content?.raw,excerpt:x.excerpt?.raw,categories:x.categories,
    tags:x.tags,featured_media:x.featured_media,acf:x.acf
  });
  const original=unmodified(p);
  if(!/^\d{4}-\d{2}-\d{2}T\d\d:\d\d:\d\d$/.test(p.date))
    throw new Error("Malformed original WordPress publication date");
  const same=p.date.startsWith(TARGET_DAY+"T");
  if(!same) {
    if (!p.date.startsWith("2026-08-13T"))
      throw new Error("Existing date changed unexpectedly: "+p.date+"; do not overwrite");
    const newDate=TARGET_DAY+p.date.slice(10); // Preserve the existing local time-of-day.
    const saved=await api(endpoint,"POST",{date:newDate});
    if(saved.status!==200 || saved.data?.id!==POST_ID)
      throw new Error("Scoped WordPress date mutation denied HTTP "+saved.status);
  }
  const after=await api(endpoint+fields);
  if(after.status!==200 || after.data?.id!==POST_ID ||
    after.data.date !== TARGET_DAY + p.date.slice(10) ||
    unmodified(after.data)!==original) {
    throw new Error("Date readback or immutable post fields differ");
  }
  report.afterDate=after.data.date;
  report.contentPreserved=true;
  report.status="CMS_READBACK_PASS";
  console.log("PSE_1742_DATE_READBACK="+JSON.stringify({postId:POST_ID,old:report.beforeDate,
    date:report.afterDate,titleAndBodyPreserved:true,idempotent:same}));
  const url=front+"/"+SLUG;
  try {
    const frontPage=await ctx.newPage();
    const response=await frontPage.goto(url,{waitUntil:"domcontentloaded",timeout:55000});
    const body=(await frontPage.locator("body").innerText()).replace(/\s+/g," ");
    report.frontend={url,http:response?.status(),hasExpectedDate:body.includes("17/11/2026"),
      hasOriginalTitle:body.includes("Báo cáo tài chính bán niên 2026")};
    console.log("PSE_1742_FRONTEND="+JSON.stringify(report.frontend));
    if(report.frontend.http!==200||!report.frontend.hasOriginalTitle)
      throw new Error("Public detail is not serving the original article");
  }catch(e) {
    // CMS readback is authoritative; CDN/SSR can lag until normal deployment.
    report.frontend={...report.frontend,warning:String(e).slice(0,200)};
    console.log("PSE_1742_FRONTEND_PENDING="+String(e).slice(0,200));
  }
} catch(e) {
  report.status="FAIL";
  report.error=String(e).slice(0,500);
  console.error("PSE_1742_DATE_FAIL="+report.error);
  process.exitCode=1;
} finally {
  await mkdir("artifacts/pse-1742-publish-date",{recursive:true});
  await writeFile("artifacts/pse-1742-publish-date/report.json",JSON.stringify(report,null,2)+"\n");
  await browser.close();
}
if(report.status!=="CMS_READBACK_PASS")process.exitCode=1;
