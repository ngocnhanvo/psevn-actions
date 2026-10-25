/** PSE category SSR cutover through the existing WordPress Page and product_cat admin; NO BUILD. */
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const action = String(event.head_commit?.message || "").split("\n")[0];
const dry = action === "audit(pse): product category SSR cutover";
const apply = action === "cms(pse): enable WordPress Product category SSR routes";
if (!dry && !apply) throw Error("Unrecognized PSE SSR-cutover operation");
const entries = String(process.env.ENV_FILE || "").split(/\r?\n/).map(x => x.trim().replace(/^export\s+/, ""));
const originFor = (key) => {
  const values = entries.filter(x => x.startsWith(key + "="));
  if (values.length !== 1) throw Error("Missing PSE origin: " + key);
  const u = new URL(values[0].slice(key.length + 1).replace(/^['"]|['"]$/g, ""));
  if (u.protocol !== "https:" || !u.hostname || u.username || u.password || u.search || u.hash || !["", "/"].includes(u.pathname)) throw Error("Unsafe PSE origin: " + key);
  return u.origin;
};
const adminOrigin = originFor("WC_URL"), frontOrigin = originFor("WC_URL_CLIENT");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const backup = { mode: dry ? "dry" : "apply", timestamp: new Date().toISOString(), page: null, menus: [], rewrites: [], categoryCount: 0 };
try {
  await page.goto(adminOrigin + "/wp-admin/", { waitUntil: "domcontentloaded", timeout: 60000 });
  if (await page.locator("#user_login").count()) {
    await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME || "");
    await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD || "");
    const raw = await page.locator("body").innerText();
    const math = raw.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i) || raw.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if (math) {
      const a = +math[1], b = +math[3], value = ({ "+":a+b, "-":a-b, x:a*b, "×":a*b, "*":a*b })[math[2]];
      const field = page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if (!await field.count()) throw Error("WordPress login challenge unsupported");
      await field.fill(String(value));
    }
    await Promise.all([page.waitForLoadState("domcontentloaded"), page.locator("#wp-submit").click()]);
  }
  if (page.url().includes("wp-login")) throw Error("WordPress login failed");
  const nonce = await page.evaluate(async () => {
    if (window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
    const r = await fetch("/wp-admin/admin-ajax.php?action=rest-nonce", { credentials: "same-origin" });
    if (!r.ok) throw Error("WordPress REST nonce unavailable");
    return (await r.text()).trim();
  });
  if (!/^[a-z0-9]{8,24}$/i.test(nonce)) throw Error("WordPress nonce malformed");
  const api = (url, method="GET", payload=undefined) => page.evaluate(async ({ url, method, payload, nonce }) => {
    const r = await fetch(url, { method, credentials:"same-origin", headers: { "X-WP-Nonce":nonce, Accept:"application/json", ...(payload ? { "Content-Type":"application/json" } : {}) }, ...(payload ? { body:JSON.stringify(payload) } : {}) });
    return { http:r.status, data:await r.json().catch(() => null) };
  }, { url, method, payload, nonce });
  const [p,c,m,r] = await Promise.all([
    api("/wp-json/wp/v2/pages/80968?context=edit&_fields=id,status,slug,title,acf,content"),
    api("/wp-json/wp/v2/product_cat?context=edit&hide_empty=false&per_page=100&_fields=id,slug,name,parent"),
    api("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),
    api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&_fields=id,status,acf")
  ]);
  if (p.http !== 200 || c.http !== 200 || m.http !== 200 || r.http !== 200 ||
      !Array.isArray(c.data) || !Array.isArray(m.data) || !Array.isArray(r.data)) throw Error("WordPress Page, taxonomy, menu or rewrite unavailable");
  const cmsPage=p.data;
  if (cmsPage.id !== 80968 || cmsPage.slug !== "san-pham" || cmsPage.status !== "publish") throw Error("Unexpected native PSE Product page");
  const old = cmsPage.acf?.action === "ProductsPage" && cmsPage.acf?.key === "products";
  const newMode = cmsPage.acf?.action === "ProductsSSRPage" && cmsPage.acf?.key === "ssr-products";
  if (!old && !newMode) throw Error("Unknown WordPress page routing metadata");
  if (String(cmsPage.content?.raw || "").trim()) throw Error("User-authored native catalog Page content exists; cannot cutover");
  const root = c.data.filter(v=>v.slug==="phan-bon-phu-my" && Number(v.parent)===0);
  if (root.length !== 1) throw Error("WordPress Product category root missing");
  const children = c.data.filter(v=>Number(v.parent)===Number(root[0].id) && v.slug!=="uncategorized");
  if (children.length < 6) throw Error("Expected native WooCommerce Product category children");
  const bySlug = new Map(children.map(v=>[v.slug,v]));
  const parent=m.data.find(x=>Number(x.id)===77005);
  if (!parent || Number(parent.object_id)!==cmsPage.id || parent.type!=="post_type") throw Error("PSE Header Product parent changed");
  const sourceMenus=m.data.filter(x=>Number(x.parent)===77005);
  const changes=[];
  for(const item of sourceMenus){
    if(item.type!=="custom") continue;
    const existing=String(item.url||"");
    let parsed; try{parsed=new URL(existing,frontOrigin)}catch{continue}
    if(parsed.origin!==frontOrigin || parsed.pathname.replace(/\/+$/,"")!=="/san-pham") continue;
    const slug=parsed.searchParams.get("cat");
    if(!slug) continue;
    if(!bySlug.has(slug)) throw Error("Menu points to non-existent ProductCategory " + slug);
    changes.push({id:item.id,title:item.title?.raw||item.title?.rendered||"",from:existing,to:frontOrigin+"/san-pham/"+encodeURIComponent(slug),slug});
  }
  // An existing custom wildcard product-detail rule would swallow /san-pham/<category>
  // before the seed's taxonomy-aware category route; constrain it to product ID suffixes.
  const oldFrom="^/san-pham/([a-z0-9-]+)$";
  const newFrom="^/san-pham/([a-z0-9-]+-[0-9]{3,5})$";
  const oldRedirect=r.data.filter(x=>[oldFrom,newFrom].includes(String(x.acf?.from_link||"")) && x.acf?.to_link==="/ssr/products/$1/detail");
  if(oldRedirect.length !== 1) throw Error("Expected exactly one pre-existing native Product detail rewrite");
  const route=oldRedirect[0];
  const routeChange=route.acf.from_link===oldFrom;
  if(!newMode && changes.length<1)throw Error("Category menu links unavailable; refuse orphaned SSR cutover");
  backup.page={id:cmsPage.id,acf:{key:cmsPage.acf.key,action:cmsPage.acf.action}};
  backup.menus=changes;
  backup.rewrites=[{id:route.id,status:route.status,from:route.acf.from_link,to:route.acf.to_link}];
  backup.categoryCount=children.length;
  const structural = r.data.filter(x =>
    /product-(?:list|category|category-page|pagination|detail)/.test(String(x.title || ""))
    || String(x.acf?.from_link || "").includes("([^/]+)")
    || String(x.acf?.to_link || "").includes("/ssr/products/")
  ).map(x => ({ id:x.id,title:x.title?.raw || x.title?.rendered || "",status:x.status,
    enabled:x.acf?.enable,from:x.acf?.from_link,to:x.acf?.to_link,priority:x.acf?.priority,
    matchType:x.acf?.match_type,conditions:x.acf?.conditions }));
  console.log("PSE_PRODUCT_SSR_ROUTE_REGISTRY="+JSON.stringify({total:r.data.length,structural}).slice(0,23000));
  const preflight={mode:dry?"dry":"apply",page:cmsPage.id,old,newMode,categories:children.length,menuUpdates:changes.length,routeId:route.id,routeChange};
  console.log("PSE_PRODUCT_SSR_PREFLIGHT="+JSON.stringify(preflight));
  if(apply && (old || routeChange || changes.length)) {
    await mkdir("artifacts/pse-product-ssr-cutover",{recursive:true});
    await writeFile("artifacts/pse-product-ssr-cutover/rollback.json",JSON.stringify(backup,null,2)+"\n");
    // Safe order: route narrowing first, then CMS Page action+key, then menu URLs.
    if(routeChange){
      const updated=await api("/wp-json/wp/v2/chuyen-huong-link/"+route.id,"POST",{acf:{from_link:newFrom}});
      if(updated.http!==200||updated.data?.acf?.from_link!==newFrom)throw Error("Product legacy detail wildcard narrowing failed");
    }
    if(old){
      const updated=await api("/wp-json/wp/v2/pages/"+cmsPage.id,"POST",{acf:{action:"ProductsSSRPage",key:"ssr-products"}});
      if(updated.http!==200||updated.data?.acf?.action!=="ProductsSSRPage"||updated.data?.acf?.key!=="ssr-products")throw Error("Native Product Page SSR switch failed");
    }
    for(const change of changes){
      const result=await api("/wp-json/wp/v2/menu-items/"+change.id,"POST",{type:"custom",url:change.to});
      if(result.http!==200||String(result.data?.url).replace(/\/+$/,"")!==change.to)throw Error("Product category Menu Manager URL update failed "+change.slug);
    }
  }
  const [pageAfter,menusAfter,routeAfter]=await Promise.all([
    api("/wp-json/wp/v2/pages/80968?context=edit&_fields=id,slug,status,acf"),
    api("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),
    api("/wp-json/wp/v2/chuyen-huong-link/"+route.id+"?context=edit&_fields=id,acf")
  ]);
  if(pageAfter.http!==200||menusAfter.http!==200||routeAfter.http!==200)throw Error("SSR cutover readback unavailable");
  if(apply) {
    if(pageAfter.data.acf?.action!=="ProductsSSRPage"||pageAfter.data.acf?.key!=="ssr-products")throw Error("Post-cutover page metadata mismatch");
    if(routeAfter.data.acf?.from_link!==newFrom)throw Error("Product detail route readback mismatch");
    for(const change of changes){
      const current=menusAfter.data.find(x=>x.id===change.id);
      if(!current||String(current.url).replace(/\/+$/,"")!==change.to)throw Error("Category menu readback mismatch "+change.slug);
    }
  }
  console.log("PSE_PRODUCT_SSR_CUTOVER="+JSON.stringify({applied:apply,preflight,pageKey:pageAfter.data.acf?.key,pageAction:pageAfter.data.acf?.action,confirmed:true}));
} finally {
  await browser.close();
}
