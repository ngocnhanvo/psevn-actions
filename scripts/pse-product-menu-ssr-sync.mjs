/** Sync the six already-published PSE Product menu ESC custom URLs to the native WordPress canonical SSR URLs.
 * Guarded native nav-menus.php save; no Product, category, or Astro build changes.
 */
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const subject = String(event.head_commit?.message || "").split("\n")[0];
if (subject !== "cms(pse): synchronize Product SSR custom Header links") throw Error("Unsupported CMS operation");
const configured = String(process.env.ENV_FILE || "").split(/\r?\n/).map(s => s.trim().replace(/^export\s+/, ""));
function originOf(key) {
  const found = configured.filter(v => v.startsWith(key + "="));
  if (found.length !== 1) throw Error("Missing verified origin " + key);
  const url = new URL(found[0].slice(key.length + 1).replace(/^['"]|['"]$/g, ""));
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) throw Error("Untrusted origin " + key);
  return url.origin;
}
const cms = originOf("WC_URL"), site = originOf("WC_URL_CLIENT");
if (cms === site) throw Error("Frontend and WordPress must be separated");
const families = [
  { id:77006,slug:"nhom-phan-don-va-phan-phuc-hop-phu-my" },
  { id:77007,slug:"nhom-phan-hon-hop-npk-phu-my" },
  { id:77008,slug:"huu-co-phu-my" },
  { id:77009,slug:"phan-bon-sinh-hoc" },
  { id:77010,slug:"nhom-san-pham-ure-nguyen-lieu-cho-san-xuat-cong-nghiep" },
  { id:77011,slug:"dam-phu-my" },
];
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:950}});
const report={mode:"apply",preflight:false,menuId:null,changes:[],written:false,verified:false};
try {
  await page.goto(cms+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
  if (await page.locator("#user_login").count()) {
    await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME || "");
    await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD || "");
    const text = await page.locator("body").innerText();
    const match = text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i) || text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if (match) {
      const a=Number(match[1]),b=Number(match[3]);
      const result=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[match[2]];
      const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if (!await field.count()) throw Error("Login arithmetic challenge without field");
      await field.fill(String(result));
    }
    await Promise.all([page.waitForLoadState("domcontentloaded"), page.locator("#wp-submit").click()]);
  }
  if (page.url().includes("wp-login")) throw Error("WordPress admin login failed");
  const nonce = await page.evaluate(async () => {
    if (globalThis.wpApiSettings?.nonce) return globalThis.wpApiSettings.nonce;
    const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
    if (!r.ok) throw Error("No WordPress REST nonce");
    return (await r.text()).trim();
  });
  if (!/^[A-Za-z0-9]{8,24}$/.test(nonce)) throw Error("Unexpected REST nonce");
  async function getApi(path) {
    const result = await page.evaluate(async ({path,nonce}) => {
      const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json","Cache-Control":"no-cache"}});
      return {status:r.status,body:await r.json().catch(()=>null)};
    },{path,nonce});
    if (result.status !== 200) throw Error("WP API unavailable ("+result.status+")");
    return result.body;
  }
  const [native,esc]=await Promise.all([
    getApi("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),
    getApi("/wp-json/esc-api/v1/menus?_esc_preview="+Date.now()),
  ]);
  const menu = esc?.menus?.Header?.vi;
  if (!Array.isArray(native) || !menu?.id || !Array.isArray(menu.items)) throw Error("Authoritative Header/vi menu unavailable");
  report.menuId=Number(menu.id);
  const walk=nodes=>nodes.flatMap(n=>[n,...walk(Array.isArray(n.children)?n.children:[])]);
  const items=walk(menu.items);
  const approved=families.map(f=>{
    const original=native.filter(n=>Number(n.id)===f.id&&Number(n.parent)===77005);
    const rendered=items.filter(n=>Number(n.id)===f.id);
    const wanted=site+"/san-pham/"+f.slug;
    const legacy=site+"/san-pham/?cat="+f.slug;
    if(original.length!==1||rendered.length!==1 || original[0].type!=="custom"
       || original[0].url!==wanted || !["custom"].includes(String(rendered[0].linkMode))
       || ![legacy,wanted].includes(String(rendered[0].href))) {
      throw Error("Product Menu CMS/native URL mismatch id="+f.id);
    }
    return {...f,wanted,legacy,before:rendered[0].href};
  });
  const editor=cms+"/wp-admin/nav-menus.php?action=edit&menu="+report.menuId;
  const loaded=await page.goto(editor,{waitUntil:"domcontentloaded",timeout:60000});
  if(loaded?.status()!==200||!await page.locator("form#update-nav-menu").count()||!await page.locator("#menu-to-edit").count()) throw Error("WP native Menu editor unavailable");
  for(const item of approved){
    const custom=page.locator('input[name="esc-menu-item-custom-url['+item.id+']"]');
    const nativeUrl=page.locator('input[name="menu-item-url['+item.id+']"]');
    const mode=page.locator('select[name="esc-menu-item-link-type['+item.id+']"]');
    if(await custom.count()!==1||await nativeUrl.count()!==1||await mode.count()!==1)throw Error("Missing native ESC menu fields id="+item.id);
    const current=await custom.inputValue();
    if(![item.legacy,item.wanted].includes(current)||await nativeUrl.inputValue()!==item.wanted||await mode.inputValue()!=="custom")throw Error("ESC URL changed unexpectedly id="+item.id);
    report.changes.push({id:item.id,before:current,after:item.wanted,changed:current!==item.wanted});
  }
  report.preflight=true;
  console.log("PSE_PRODUCT_CUSTOM_MENU_PREFLIGHT="+JSON.stringify({menuId:report.menuId,changed:report.changes.filter(x=>x.changed).length,validated:report.changes.length}));
  if(report.changes.some(x=>x.changed)) {
    for(const row of report.changes.filter(x=>x.changed)) await page.locator('input[name="esc-menu-item-custom-url['+row.id+']"]').fill(row.after);
    const save=page.locator("#save_menu_header");
    if(await save.count()!==1)throw Error("Native Save Menu button unavailable");
    await Promise.all([page.waitForLoadState("domcontentloaded"), save.click()]);
    report.written=true;
  }
  await page.goto(editor,{waitUntil:"domcontentloaded",timeout:60000});
  for(const row of report.changes){
    const field=page.locator('input[name="esc-menu-item-custom-url['+row.id+']"]');
    if(await field.inputValue()!==row.after) throw Error("Readback ESC menu custom URL mismatch id="+row.id);
  }
  const after=await getApi("/wp-json/esc-api/v1/menus?_esc_preview="+Date.now());
  const updated=walk(after?.menus?.Header?.vi?.items||[]);
  if(report.changes.some(row=>updated.find(n=>Number(n.id)===row.id)?.href!==row.after)) throw Error("ESC Header REST readback did not update all six targets");
  report.verified=true;
  console.log("PSE_PRODUCT_CUSTOM_MENU=PASS; six source-verified canonical category links; noBuild=true");
}finally{
  await mkdir("artifacts/pse-product-menu",{recursive:true});
  await writeFile("artifacts/pse-product-menu/esc-ssr-link-sync.json",JSON.stringify(report,null,2)+"\n");
  await browser.close();
}
