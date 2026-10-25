/** Update only same-origin, taxonomy-backed News menu URLs to public SSR paths.
 * Existing WP Menu Manager is authoritative. Guarded native form submit, reversible audit.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const msg=String(event.head_commit?.message||"").split("\n")[0];
const apply=msg==="cms(pse): link WordPress news Header categories to SSR";
const audit=msg==="audit(pse): inspect news Header taxonomy URLs"||!apply;
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const getOrigin=key=>{
 const items=vars.filter(x=>x.startsWith(key+"="));if(items.length!==1)throw Error("Missing verified "+key);
 const url=new URL(items[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(url.protocol!=="https:"||!url.hostname||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))
  throw Error("Invalid PSE "+key);
 return url.origin;
};
const wp=getOrigin("WC_URL"),site=getOrigin("WC_URL_CLIENT");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:950}});
const report={mode:apply?"apply":"audit",planned:[],saved:false,readback:false};
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await page.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("WP challenge input missing");await input.fill(String(n))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login.php"))throw Error("WP admin auth failed");
 const nonce=await page.evaluate(async()=>{
   if(globalThis.wpApiSettings?.nonce)return globalThis.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("WP REST nonce unavailable");return(await r.text()).trim();
 });
 const api=async path=>page.evaluate(async({path,nonce})=>{
   const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json","Cache-Control":"no-cache"}});
   return{http:r.status,totalPages:Number(r.headers.get("X-WP-TotalPages")||1),data:await r.json().catch(()=>null)};
 },{path,nonce});
 const [native,esc,categories,archive,routes]=await Promise.all([
  api("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),
  api("/wp-json/esc-api/v1/menus?_esc_preview="+Date.now()),
  api("/wp-json/wp/v2/categories?hide_empty=false&per_page=100&_fields=id,slug,parent"),
  api("/wp-json/wp/v2/pages/77030?context=edit&_fields=id,slug,status,acf"),
  api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=publish&per_page=100&_fields=id,acf,route_priority,route_conditions"),
 ]);
 if(native.http!==200||!Array.isArray(native.data)||esc.http!==200||esc.data?.success!==true||
    categories.http!==200||!Array.isArray(categories.data)||categories.totalPages!==1||
    archive.http!==200||archive.data?.acf?.key!=="ssr-posts"||archive.data?.status!=="publish"||
    routes.http!==200||!Array.isArray(routes.data))throw Error("WordPress native news source unavailable");
 const menu=esc.data.menus?.Header?.vi;
 if(!menu?.id||!Array.isArray(menu.items))throw Error("WordPress Header/vi registry unavailable");
 const newsRoot=String(archive.data.slug||"");
 const categorySlugs=new Set(categories.data.map(c=>String(c.slug||"")).filter(Boolean));
 const flatten=a=>a.flatMap(x=>[x,...flatten(x.children||[])]);
 const nodes=flatten(menu.items);
 const targets=nodes.filter(item=>{
  if(item.linkMode!=="custom"||item.linkType!=="external"||!item.href)return false;
  let u;try{u=new URL(item.href)}catch{return false}
  const pathname=u.pathname.replace(/\/+$/,"");
  return u.origin===site&&pathname==="/"+newsRoot&&
     categorySlugs.has(String(u.searchParams.get("cat")||""));
 }).map(item=>{
  const url=new URL(item.href);
  const slug=String(url.searchParams.get("cat"));
  const canonical=site+"/"+newsRoot+"/"+slug;
  const matched=native.data.filter(n=>Number(n.id)===Number(item.id)&&n.type==="custom");
  if(matched.length!==1||!Number(item.id))throw Error("Missing native menu identity for category "+slug);
  const urlBefore=String(matched[0].url||"");
  if(urlBefore!==item.href&&urlBefore!==canonical)throw Error("Native URL diverged "+slug);
  return{id:Number(item.id),slug,old:urlBefore,escOld:item.href,canonical};
 });
 // A previously-synced SSR category is equally valid and should not be re-written.
 const canonicalItems=nodes.filter(item=>{
  if(item.linkMode!=="custom"||item.linkType!=="external"||!item.href)return false;
  let u;try{u=new URL(item.href)}catch{return false}
  const prefix="/"+newsRoot+"/";
  const slug=u.pathname.startsWith(prefix)?u.pathname.slice(prefix.length).replace(/\/$/,""):"";
  return u.origin===site&&categorySlugs.has(slug)&&/^[a-z0-9-]+$/.test(slug);
 });
 const unique=new Set(targets.map(x=>x.id));
 if(unique.size!==targets.length||targets.length===0&&canonicalItems.length===0)throw Error("No WordPress taxonomy-backed News submenu candidates");
 report.planned=targets;
 console.log("PSE_NEWS_MENU_SSR_PREFLIGHT="+JSON.stringify({
   menuId:menu.id,legacyCategoryLinks:targets.length,alreadyCanonical:canonicalItems.length,
   slugs:targets.map(x=>x.slug),mode:report.mode
 }));
 if(audit||!targets.length){console.log("PSE_NEWS_MENU_SSR="+(targets.length?"DRY_PASS":"ALREADY_PASS")+"; writes=0; noBuild=true");process.exit(0)}
 await mkdir("artifacts/pse-news-category",{recursive:true});
 await writeFile("artifacts/pse-news-category/menu-rollback.json",JSON.stringify(report,null,2)+"\n");
 const editor=wp+"/wp-admin/nav-menus.php?action=edit&menu="+Number(menu.id);
 const res=await page.goto(editor,{waitUntil:"domcontentloaded",timeout:60000});
 if(res?.status()!==200||await page.locator("form#update-nav-menu").count()!==1)
   throw Error("Native WordPress menu form missing");
 for(const item of targets){
  const before=await page.evaluate(id=>{
    const form=document.querySelector("#update-nav-menu");
    return{
      native:form?.querySelector('input[name="menu-item-url['+id+']"]')?.value,
      esc:form?.querySelector('input[name="esc-menu-item-custom-url['+id+']"]')?.value,
      mode:form?.querySelector('select[name="esc-menu-item-link-type['+id+']"]')?.value,
    }
  },item.id);
  if(![item.old,item.canonical].includes(before.native)||before.mode!=="custom"||
      ![item.escOld,item.canonical].includes(before.esc))
      throw Error("WordPress Menu UI validation failed id="+item.id);
 }
 await Promise.all([
  page.waitForNavigation({waitUntil:"domcontentloaded",timeout:60000}),
  page.evaluate(targets=>{
    const form=document.querySelector("#update-nav-menu");
    if(!(form instanceof HTMLFormElement))throw Error("Native WP form missing");
    for(const target of targets){
      for(const name of ["menu-item-url","esc-menu-item-custom-url"]){
        const field=form.querySelector('input[name="'+name+'['+target.id+']"]');
        if(!(field instanceof HTMLInputElement))throw Error("Missing WP form field "+name);
        field.value=target.canonical;
        field.dispatchEvent(new Event("input",{bubbles:true}));
        field.dispatchEvent(new Event("change",{bubbles:true}));
      }
    }
    const save=form.querySelector("#save_menu_header");
    if(!(save instanceof HTMLElement))throw Error("Save Menu button missing");
    form.requestSubmit(save);
  },targets),
 ]);
 report.saved=true;
 await page.goto(editor,{waitUntil:"domcontentloaded",timeout:60000});
 for(const item of targets){
  const values=await page.evaluate(id=>{
    const form=document.querySelector("#update-nav-menu");
    return{
      native:form?.querySelector('input[name="menu-item-url['+id+']"]')?.value,
      esc:form?.querySelector('input[name="esc-menu-item-custom-url['+id+']"]')?.value,
    }
  },item.id);
  if(values.native!==item.canonical||values.esc!==item.canonical)
    throw Error("Native WordPress news menu readback failed "+item.slug);
 }
 const escCheck=await api("/wp-json/esc-api/v1/menus?_esc_preview="+Date.now());
 const updated=flatten(escCheck.data?.menus?.Header?.vi?.items||[]);
 for(const item of targets){
  if(updated.find(x=>Number(x.id)===item.id)?.href!==item.canonical)
    throw Error("ESC WP Header readback failed "+item.slug);
 }
 report.readback=true;
 console.log("PSE_NEWS_MENU_SSR=PASS; changed="+targets.length+"; WordPress source verified; noBuild=true");
}finally{await browser.close()}
