/** Published original PSE gallery regression independent of the currently unavailable Joomla host.
 * Source restoration was previously independently accepted; this verifies ONLY the
 * current native WordPress Media/Post to deployed Astro UI, NOT new source-origin parity.
 * GET-only, Playwright pinned to workflow container, no CMS write, no build/deploy.
 */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const scope = "ngocnhanvo/psevn-actions";
if (process.env.GITHUB_REPOSITORY !== scope || process.env.GITHUB_REF !== "refs/heads/main") {
  throw Error("PSE actions branch only");
}
const env = String(process.env.ENV_FILE || "").split(/\r?\n/).map(x => x.trim().replace(/^export\s+/, ""));
function getOrigin(key) {
  const hits = env.filter(x => x.startsWith(key + "="));
  if (hits.length !== 1) throw Error("Missing unique " + key);
  const u = new URL(hits[0].slice(key.length + 1).replace(/^['"]|['"]$/g, ""));
  if (u.protocol !== "https:" || !u.hostname || u.username || u.password || u.search ||
      u.hash || !["", "/"].includes(u.pathname) || (u.port && u.port !== "443")) {
    throw Error("Unsafe " + key);
  }
  return u.origin;
}
const front = getOrigin("WC_URL_CLIENT"), wp = getOrigin("WC_URL");
if (front === wp) throw Error("WordPress origin equals frontend");
const targets = [
  {id:1053, slug:"1053-ngay-hoi-truyen-thong-2014", count:76},
  {id:990, slug:"990-dai-hoi-chi-doan-2010", count:98},
  {id:980, slug:"980-cong-trinh-dtn-kho-chua-dong-nai", count:180}
];
const report = {
  schema:"pse-published-three-joomla-gallery-native-postrelease-v1",
  readOnly:true, noCmsWrites:true, noBuild:true, noFTP:true,
  scope:"Previously proven original Joomla gallery -> current published native WordPress -> actual Astro frontend",
  sourceCaution:"This regression does not fetch the currently unresponsive Joomla website and does not prove current source byte equivalence.",
  expectedOriginalAlbums:3, expectedOriginalImages:354,
  records:[], views:[], imagesChecked:[], archive:null, errors:[], summary:null
};
const browser = await chromium.launch({headless:true});
function names(html,id) {
  const re = new RegExp("pse-gallery-" + id + "-[a-f0-9]{16}\\.(?:jpe?g|png|webp)", "gi");
  return [...new Set((String(html||"").match(re)||[]).map(x=>x.toLowerCase()))];
}
async function getNative(t) {
  const u = wp + "/wp-json/wp/v2/posts?status=publish&slug=" + encodeURIComponent(t.slug) +
    "&per_page=2&_fields=id,slug,status,title,content,link";
  const r = await fetch(u,{redirect:"manual",signal:AbortSignal.timeout(45000),headers:{"Accept":"application/json"}});
  if(r.status!==200)throw Error("Native published WP Post REST " + t.id + " HTTP " + r.status);
  const rows=await r.json();
  if(!Array.isArray(rows)||rows.length!==1||rows[0].slug!==t.slug||rows[0].status!=="publish") {
    throw Error("Missing/ambiguous native published album Post #" + t.id);
  }
  const post=rows[0], exact=names(post.content?.rendered,t.id);
  if(exact.length!==t.count)throw Error("Native WP album has " + exact.length +
    " distinct image names, expected " + t.count + " for #" + t.id);
  return {wpId:post.id, names:exact, nativeUrl:new URL(post.link).pathname};
}
async function checkPage(t,native,width) {
  const ctx=await browser.newContext({viewport:{width,height:900}});
  const page=await ctx.newPage();
  let adminRequests=0;
  page.on("request",req=>{try{if(new URL(req.url()).origin===wp)adminRequests++}catch{}});
  try {
    const path="/" + t.slug;
    const res=await page.goto(front+path,{waitUntil:"domcontentloaded",timeout:65000});
    if(!res||res.status()!==200)throw Error("Frontend gallery detail #" + t.id + " HTTP " + res?.status());
    const images=page.locator("#article-content img");
    const count=await images.count();
    if(count!==t.count)throw Error("Frontend " + t.id + " image count " + count + " expected " + t.count);
    const srcs=await images.evaluateAll(es=>es.map(e=>e.getAttribute("src")||""));
    const filenames=srcs.map(src=>{
      const u=new URL(src,front);
      if(u.origin!==front||!u.pathname.startsWith("/api/files/wp-content/uploads/")) {
        throw Error("Non-proxy or foreign media in published album " + t.id);
      }
      return decodeURIComponent(u.pathname.split("/").at(-1)||"").toLowerCase();
    });
    if(new Set(filenames).size!==t.count||filenames.some((x,i)=>x!==native.names[i])) {
      throw Error("Live gallery image identity/order differs from native WP #" + t.id);
    }
    const doc=await page.evaluate(()=>({
      h1:document.querySelectorAll("h1").length,
      canonical:document.querySelector('link[rel="canonical"]')?.href||"",
      overflow:document.body.scrollWidth>innerWidth+1
    }));
    const c=doc.canonical?new URL(doc.canonical,front):null;
    if(doc.h1!==1||!c||c.origin!==front||c.pathname!==path||c.search||c.hash||
      doc.overflow||adminRequests!==0)throw Error("Live gallery canonical/layout/admin leak #" + t.id + " width " + width);
    const sample=[0,Math.floor((count-1)/4),Math.floor((count-1)/2),
      Math.floor((count-1)*3/4),count-1];
    for (const idx of sample) {
      const item=images.nth(idx);
      await item.scrollIntoViewIfNeeded({timeout:25000});
      await item.evaluate(async el=>{
        if(!el.complete)await Promise.race([
          new Promise(resolve=>{el.addEventListener("load",resolve,{once:true});el.addEventListener("error",resolve,{once:true})}),
          new Promise(resolve=>setTimeout(resolve,30000))
        ]);
      });
      const decoded=await item.evaluate(el=>el.complete&&el.naturalWidth>0&&el.naturalHeight>0);
      if(!decoded)throw Error("Live gallery image browser decode failed " + t.id + " width " + width + " index " + idx);
      report.imagesChecked.push({id:t.id,width,index:idx,decoded:true});
    }
    await images.first().click();
    const dialog=page.locator("[data-pse-gallery-dialog]");
    await dialog.waitFor({state:"visible",timeout:8000});
    await dialog.locator("[data-pse-gallery-next]").click();
    if(!(await dialog.locator("[data-pse-gallery-counter]").innerText()).includes("2 / "+count)) {
      throw Error("Live gallery lightbox navigation wrong #" + t.id);
    }
    await page.keyboard.press("Escape");
    if(await dialog.isVisible())throw Error("Live gallery lightbox Escape wrong #" + t.id);
    report.views.push({id:t.id,width,images:count,decodedSamples:sample.length,
      canonical:true,overflow:false,lightbox:true,adminOriginRequests:adminRequests});
    console.log("PSE_PUBLISHED_GALLERY_NATIVE_LIVE=" + JSON.stringify(report.views.at(-1)));
  } finally {await ctx.close()}
}
try {
  for(const t of targets) {
    const n=await getNative(t);
    report.records.push({id:t.id,slug:t.slug,wpId:n.wpId,images:n.names.length,
      exactMediaFilenames:true,status:"publish"});
    await checkPage(t,n,390);
    await checkPage(t,n,1440);
  }
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  const page=await ctx.newPage();
  try {
    const visited=new Set(), found=new Set(), queue=["/tin-tuc-su-kien/anh"];
    while(queue.length) {
      const path=queue.shift(),url=new URL(path,front);
      if(url.origin!==front||!/^\/tin-tuc-su-kien\/anh(?:\/\d+)?\/?$/.test(url.pathname)||url.search) {
        throw Error("Unsafe gallery archive pagination route");
      }
      if(visited.has(url.href))continue;
      if(visited.size>=20)throw Error("Gallery pagination unexpectedly long");
      visited.add(url.href);
      const r=await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:60000});
      if(!r||r.status()!==200)throw Error("Native gallery archive HTTP " + r?.status());
      const links=await page.locator("#posts-grid .pse-media-card a[href]").evaluateAll(es=>es.map(e=>e.getAttribute("href")));
      for(const x of links)found.add(new URL(x,front).pathname);
      const pagination=await page.locator('nav[aria-label="Phân trang"] a[href]').evaluateAll(es=>es.map(e=>e.getAttribute("href")));
      for(const x of pagination) {
        const u=new URL(x,front);
        if(!visited.has(u.href))queue.push(u.pathname);
      }
    }
    for(const t of targets) {
      if(!found.has("/"+t.slug))throw Error("Published gallery not on archive: " + t.id);
    }
    if(found.has("/975-dai-hoi-cong-doan-nhiem-ky-ii-10-2013")) {
      throw Error("Date-unverified original album 975 was silently published");
    }
    report.archive={pages:visited.size,uniqueCards:found.size,publishedOriginals:3,
      deferredOriginal975StillAbsent:true};
    console.log("PSE_PUBLISHED_GALLERY_ARCHIVE="+JSON.stringify(report.archive));
  }finally{await ctx.close()}
  report.summary={nativePosts:report.records.length,nativeOriginalImages:report.records.reduce((a,x)=>a+x.images,0),
    responsiveViews:report.views.length,decodeSamples:report.imagesChecked.length,
    archivePages:report.archive.pages,uncertainAlbum975StillQuarantined:true,
    sourceJoomlaUnavailableNotSilentlyPassed:true,noCmsWrites:true,noBuild:true};
  if(report.summary.nativePosts!==3||report.summary.nativeOriginalImages!==354||
    report.summary.responsiveViews!==6||report.summary.decodeSamples!==30) {
    throw Error("Incomplete target-only postrelease acceptance");
  }
  console.log("PSE_THREE_PUBLISHED_GALLERY_POSTRELEASE=PASS "+JSON.stringify(report.summary));
} catch(e) {
  report.errors.push(String(e?.message||e).slice(0,300));
  console.error("PSE_THREE_PUBLISHED_GALLERY_POSTRELEASE=FAIL "+report.errors[0]);
  throw e;
} finally {
  await mkdir("artifacts/pse-gallery-native-postrelease",{recursive:true});
  await writeFile("artifacts/pse-gallery-native-postrelease/report.json",JSON.stringify(report,null,2)+"\n");
  await browser.close();
}
