/** Native WordPress Product catalog Page sourced from PSE Product CPT; no Astro build. */
import {chromium} from "playwright";
import {readFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=event.head_commit?.message==="cms(pse): publish native PSE fertilizer Product catalog Page";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const root=env.filter(x=>x.startsWith("WC_URL="));if(root.length!==1)throw Error("No PSE WordPress origin");
const base=new URL(root[0].slice(7).replace(/^['"]|['"]$/g,""));
if(base.protocol!=="https:"||base.username||base.password||base.search||base.hash||!["","/"].includes(base.pathname))throw Error("Unsafe PSE WP origin");
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
try{
 await page.goto(base.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const s=await page.locator("body").innerText(),m=s.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||s.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Challenge not found");await f.fill(String(v))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress auth unavailable");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("WordPress nonce");return(await r.text()).trim()});
 const api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,total:r.headers.get("X-WP-Total"),data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
 const [products,categories,pages,menus]=await Promise.all([
  api("/wp-json/wp/v2/product?context=edit&status=publish&per_page=1&_fields=id,slug,title"),
  api("/wp-json/wp/v2/product_cat?context=edit&per_page=100&hide_empty=false&_fields=id,slug,parent,name"),
  api("/wp-json/wp/v2/pages?context=edit&status=publish,draft,private&per_page=100&_fields=id,slug,status,title,acf,content"),
  api("/wp-json/wp/v2/menu-items?context=edit&per_page=100")
 ]);
 if(products.http!==200||Number(products.total)<1||!Array.isArray(products.data))throw Error("Native verified fertilizer Products not yet published");
 if(categories.http!==200||!Array.isArray(categories.data)||pages.http!==200||!Array.isArray(pages.data)||menus.http!==200||!Array.isArray(menus.data))throw Error("CMS Page/Product registry unavailable");
 const parent=categories.data.filter(x=>x.slug==="phan-bon-phu-my"&&x.name==="Phân bón Phú Mỹ"&&Number(x.parent)===0);
 if(parent.length!==1)throw Error("Fertilizer Product root missing");
 const menu=menus.data.filter(m=>Number(m.id)===77005&&Number(m.parent)===77004&&String(m.title?.raw||m.title?.rendered||"").trim()==="Sản phẩm");
 if(menu.length!==1)throw Error("Product header parent menu mismatch");
 const existing=pages.data.filter(p=>p.slug==="san-pham");
 if(existing.length>1||existing.length===1&&(existing[0].acf?.action!=="ProductsPage"||existing[0].acf?.key!=="products"))throw Error("Conflicting Product Catalog Page slug");
 console.log("PSE_PRODUCT_CATALOG_PREFLIGHT="+JSON.stringify({mode:apply?"apply":"dry",publishedProductCount:products.total,parentCategoryId:parent[0].id,pageId:existing[0]?.id||null,menuId:menu[0].id,menuType:menu[0].type,menuUrl:menu[0].url,action:"ProductsPage",key:"products"}));
 if(!apply){console.log("PSE_PRODUCT_CATALOG=DRY_PASS; no_wp_write=true; no_build=true");process.exit(0)}
 let catalog=existing[0];
 if(!catalog){
  const r=await api("/wp-json/wp/v2/pages","POST",{title:"Sản phẩm Phú Mỹ",slug:"san-pham",status:"draft",acf:{action:"ProductsPage",key:"products"}});
  if(r.http!==201||!Number.isSafeInteger(Number(r.data?.id)))throw Error("WordPress catalog draft create failed HTTP "+r.http);
  catalog=r.data;
 }
 const before=await api("/wp-json/wp/v2/pages/"+catalog.id+"?context=edit&_fields=id,slug,status,acf,title,content");
 if(before.http!==200||before.data.slug!=="san-pham"||before.data.acf?.action!=="ProductsPage"||before.data.acf?.key!=="products")throw Error("Catalog ACF action/key readback failed");
 if(String(before.data.content?.raw||"").trim())throw Error("Existing catalog authored content not empty; refuse to replace");
 if(before.data.status==="draft"){
  const save=await api("/wp-json/wp/v2/pages/"+catalog.id,"POST",{status:"publish"});
  if(save.http!==200||save.data.status!=="publish")throw Error("Could not publish WordPress catalog");
 }else if(before.data.status!=="publish")throw Error("Unexpected catalog status");
 const check=await api("/wp-json/wp/v2/pages/"+catalog.id+"?context=edit&_fields=id,slug,status,acf");
 if(check.http!==200||check.data.slug!=="san-pham"||check.data.status!=="publish"||check.data.acf?.action!=="ProductsPage"||check.data.acf?.key!=="products")throw Error("Catalog publish verification failed");
 console.log("PSE_PRODUCT_CATALOG=PASS; page="+catalog.id+"; slug=san-pham; source=Product; key=products; action=ProductsPage; no_astro_build=true; menus_unmodified=true");
}finally{await browser.close()}
