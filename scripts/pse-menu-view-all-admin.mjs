/** Update only WordPress Header/vi -> Tin tức -> Thư viện's native
 * per-item View all checkbox through the supported Menu Manager Save action.
 * No raw SQL, no direct postmeta mutation, no Astro build.
 */
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if (event.head_commit?.message !== "cms(pse): disable Library View all in Menu Manager") {
  throw Error("Menu-edit operation requires the explicitly authorized marker");
}
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const env=(key)=>{
  const entries=rows.filter(x=>x.startsWith(key+"="));
  if(entries.length!==1)throw Error("Missing configured origin "+key);
  const u=new URL(entries[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
  if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
    throw Error("Invalid configured origin "+key);
  return u.origin;
};
const wordpress=env("WC_URL");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1380,height:900}});
const flat=(items)=>items.flatMap(item=>[item,...flat(item.children||[])]);
const normal=(str)=>String(str||"").trim().toLocaleLowerCase("vi").replace(/\s+/g," ");
try {
  await page.goto(wordpress+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
  if(await page.locator("#user_login").count()){
    await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
    await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
    const body=await page.locator("body").innerText();
    const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
      const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await input.count())throw Error("WP security challenge input unavailable");
      await input.fill(String(v));
    }
    await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
  }
  if(page.url().includes("wp-login"))throw Error("WordPress authentication failed");
  const load=async()=> {
    const response=await page.request.get(wordpress+"/wp-json/esc-api/v1/menus?_esc_preview="+Date.now(),{timeout:25000});
    if(!response.ok())throw Error("Menu API unavailable HTTP "+response.status());
    const data=await response.json();
    if(data?.success!==true||!Array.isArray(data?.menus?.Header?.vi?.items))throw Error("Header/vi not configured");
    return data.menus.Header.vi;
  };
  const original=await load();
  const all=flat(original.items);
  const roots=original.items.filter(item=>/tin tức/i.test(normal(item.label)));
  if(roots.length!==1)throw Error("Cannot identify unique News root");
  const libraries=(roots[0].children||[]).filter(item=>normal(item.label)==="thư viện");
  if(libraries.length!==1||!Array.isArray(libraries[0].children)||libraries[0].children.length<1)
    throw Error("Cannot identify unique Library branch under News");
  const library=libraries[0];
  if(!Number.isSafeInteger(Number(library.id))||Number(library.id)<1||!Number.isSafeInteger(Number(original.id)))
    throw Error("Menu IDs unavailable");
  if(library.showViewAll===false){
    console.log("PSE_MENU_VIEW_ALL=ALREADY_DISABLED libraryItemId="+library.id+" noCmsWrite=true");
    process.exitCode=0;
  } else {
    const response=await page.goto(wordpress+"/wp-admin/nav-menus.php?action=edit&menu="+Number(original.id),
      {waitUntil:"domcontentloaded",timeout:60000});
    if(response?.status()!==200||!await page.locator("#menu-to-edit").count())throw Error("Native Menu Manager editor unavailable");
    const checkbox=page.locator('.esc-menu-item-fields[data-item-id="'+Number(library.id)+'"] input[type="checkbox"][name="esc-menu-item-show-view-all['+Number(library.id)+']"]');
    if(await checkbox.count()!==1)throw Error("WordPress item checkbox not deployed; avoid unsafe save");
    if(!await checkbox.isChecked())throw Error("Unexpected persisted View all state; abort");
    await checkbox.uncheck({force:true});
    if(await checkbox.isChecked())throw Error("Checkbox could not be changed");
    const save=page.locator('input[name="save_menu"]:visible').first();
    if(!await save.count())throw Error("Native WordPress Save Menu control unavailable");
    await Promise.all([page.waitForLoadState("domcontentloaded"),save.click()]);
    const updated=await load();
    const after=flat(updated.items), beforeById=new Map(all.map(x=>[Number(x.id),x]));
    if(after.length!==all.length||after.some(x=>!beforeById.has(Number(x.id))))
      throw Error("Header menu identities changed unexpectedly after save");
    const newLib=after.find(x=>Number(x.id)===Number(library.id));
    if(newLib?.showViewAll!==false)throw Error("Library checkbox did not persist via WordPress API");
    const changed=after.filter(item=>{
      const before=beforeById.get(Number(item.id));
      return Boolean(before.showViewAll)!==Boolean(item.showViewAll) ||
         before.label!==item.label || before.href!==item.href ||
         JSON.stringify((before.children||[]).map(x=>x.id))!==JSON.stringify((item.children||[]).map(x=>x.id));
    });
    if(changed.length!==1||Number(changed[0].id)!==Number(library.id))
      throw Error("Unexpected menu changes after saving Library setting: "+JSON.stringify(changed.map(x=>x.id)));
    console.log("PSE_MENU_VIEW_ALL=PASS menuCode=Header language=vi libraryId="+library.id+
      " showViewAll=false children="+(newLib.children||[]).length+" allItems="+after.length+
      " changedItems=1 nativeWordPressSave=true");
  }
} finally {await browser.close();}
