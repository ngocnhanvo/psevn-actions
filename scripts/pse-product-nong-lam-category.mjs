/** Restore missing SOURCE CATEGORY membership on one existing PSE Product, preserving native content and media. */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const e=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const message=String(e.head_commit?.message||"").split("\n")[0];
const dryMessage="audit(pse): verify Nong Lam product category source";
const applyMessage="cms(pse): restore verified Nong Lam source category";
if(![dryMessage,applyMessage].includes(message)||process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Unauthorized source-to-category repair message");
const apply=message===applyMessage;
const name="Đạm Phú Mỹ ( Chuyên dùng cho Nông, lâm trường)";
const group="nhom-phan-don-va-phan-phuc-hop-phu-my",dam="dam-phu-my";
const origin="https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/";
const targetId=80946,legacyId="1669";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(env.length!==1)throw Error("Missing configured PSE WordPress origin");
const u=new URL(env[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.port||!["","/"].includes(u.pathname))
 throw Error("Unsafe WordPress origin");
const wp=u.origin;
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext();
const report={mode:apply?"apply":"dry",sourceRows:[],productId:targetId,desiredCategories:[],before:null,after:null,errors:[]};
try{
 const source=await ctx.newPage();
 for(const family of [group,dam]){
  const address=origin+family+".html";
  const response=await source.goto(address,{waitUntil:"domcontentloaded",timeout:60000});
  if(response?.status()!==200)throw Error("Joomla source unavailable "+family);
  const items=await source.evaluate(()=>{
   const body=document.querySelector(".item-page [itemprop=articleBody]");
   if(!body)throw Error("Original Joomla articleBody missing");
   return[...body.querySelectorAll("table tr")].flatMap(tr=>{
    const cells=[...tr.children].filter(c=>c.tagName==="TD");
    if(cells.length<2||!cells[0].querySelector("img[src]"))return[];
    const full=(cells[1].textContent||"").replace(/\s+/g," ").trim();
    const title=full.split(/Mã số\s*:/i)[0].trim();
    if(title!=="Đạm Phú Mỹ ( Chuyên dùng cho Nông, lâm trường)")return[];
    const anchor=cells[0].querySelector("a[href*='id=']");
    let id=null;try{id=anchor?new URL(anchor.href).searchParams.get("id"):null}catch{}
    return[{title,full,id,image:new URL(cells[0].querySelector("img").getAttribute("src"),location.href).href}];
   });
  });
  if(items.length!==1||items[0].title!==name||!/Mã số\s*:\s*00056\b/i.test(items[0].full))
   throw Error("No unique independent source row "+family);
  if(family===group&&items[0].id)throw Error("Source family row unexpectedly gained a Joomla ID");
  if(family===dam&&items[0].id!==legacyId)throw Error("Canonical Joomla detail id changed");
  report.sourceRows.push({family,...items[0]});
 }
 console.log("PSE_NONG_LAM_SOURCE_PROOF="+JSON.stringify(report.sourceRows.map(x=>({family:x.family,id:x.id,title:x.title,sourceSpec:x.full.slice(0,230)}))));
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WP admin authorization");
 const admin=await ctx.newPage();
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=(await admin.locator("#loginform").innerText()).slice(0,650);
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],num=m[2]==="+"?a+b:m[2]==="-"?a-b:a*b;
   const input=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("WP login captcha control missing");
   await input.fill(String(num));
  }
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(admin.url().includes("wp-login")||!await admin.locator("#adminmenu").count())
  throw Error("WP authorization not available: refuse category mutation");
 const nonce=await admin.evaluate(async()=>window.wpApiSettings?.nonce||
  await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"}).then(x=>x.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid WordPress nonce");
 const api=(path,method="GET",data)=>admin.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",
   headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(data?{"Content-Type":"application/json"}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return{http:r.status,data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 const [cats,old]=await Promise.all([
  api("/wp-json/wp/v2/product_cat?context=edit&per_page=100&hide_empty=false&_fields=id,slug,name,parent"),
  api("/wp-json/wp/v2/product/"+targetId+"?context=edit&_fields=id,slug,status,title,date,excerpt,content,featured_media,product_cat")
 ]);
 const product=old.data;
 if(cats.http!==200||!Array.isArray(cats.data)||old.http!==200||product?.id!==targetId||
  !String(product.slug).endsWith("-"+legacyId)||product.status!=="publish"||
  String(product.title?.raw||product.title?.rendered).replace(/\s+/g," ").trim()!==name||
  !Number(product.featured_media)||!Array.isArray(product.product_cat))
  throw Error("Canonical existing product not source-verified");
 const map=new Map(cats.data.map(c=>[c.slug,c]));
 if(map.get(group)?.id!==1762||map.get(dam)?.id!==1763||
  map.get(group)?.parent!==1760||map.get(dam)?.parent!==1760)
  throw Error("PSE Product category ancestry changed");
 if(!product.product_cat.includes(1763))throw Error("Original Dam Phu My category missing");
 const desired=[...new Set([...product.product_cat,1762])].sort((a,b)=>a-b);
 report.before={id:product.id,title:name,slug:product.slug,categories:product.product_cat,featuredMedia:product.featured_media};
 report.desiredCategories=desired;
 console.log("PSE_NONG_LAM_CATEGORY_PREFLIGHT="+JSON.stringify({mode:report.mode,...report.before,desired}));
 if(!apply){console.log("PSE_NONG_LAM_CATEGORY=DRY_PASS; no_wp_write=true; no_astro_build=true");}
 else{
  if(!product.product_cat.includes(1762)){
   const changed=await api("/wp-json/wp/v2/product/"+targetId,"POST",{product_cat:desired});
   if(changed.http!==200||changed.data?.id!==targetId)throw Error("WP product taxonomy save failed HTTP "+changed.http);
  }
  const check=await api("/wp-json/wp/v2/product/"+targetId+"?context=edit&_fields=id,slug,status,title,date,excerpt,content,featured_media,product_cat");
  const now=check.data;
  if(check.http!==200||now.id!==product.id||now.slug!==product.slug||now.status!==product.status||
   (now.title?.raw||now.title?.rendered)!==(product.title?.raw||product.title?.rendered)||
   now.date!==product.date||now.excerpt?.raw!==product.excerpt?.raw||
   now.content?.raw!==product.content?.raw||now.featured_media!==product.featured_media||
   now.product_cat.length!==desired.length||!desired.every(x=>now.product_cat.includes(x)))
   throw Error("WP category-only readback changed unrelated Product fields");
  report.after={id:now.id,slug:now.slug,categories:now.product_cat,unchangedContent:true,unchangedMedia:true};
  console.log("PSE_NONG_LAM_CATEGORY=PASS; product_id="+targetId+"; categories="+desired.join(",")+"; original_article_id="+legacyId+"; no_product_created=true; no_build=true");
 }
}catch(error){report.errors.push(String(error?.message||error).slice(0,350));console.error("PSE_NONG_LAM_ERROR="+report.errors[0]);throw error}
finally{
 await mkdir("artifacts/pse-product-batch",{recursive:true});
 await writeFile("artifacts/pse-product-batch/nong-lam-category.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}