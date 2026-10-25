/** PSE: restore only four existing-pattern Product URL rules in WordPress routing manager. NO BUILD. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const message=String(event.head_commit?.message||"").split("\n")[0];
const dry=message==="audit(pse): missing Product SSR public routes";
const apply=message==="cms(pse): add WordPress-managed Product SSR public routes";
if(!dry&&!apply)throw Error("Unapproved Product routing operation");
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origins=vars.filter(x=>x.startsWith("WC_URL="));
if(origins.length!==1)throw Error("Missing exactly one native WordPress origin");
const parsed=new URL(origins[0].slice(7).replace(/^['"]|['"]$/g,""));
if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.search||parsed.hash||!["","/"].includes(parsed.pathname))throw Error("Unsafe WP origin");
const wp=parsed.origin;
const expected=[
  {key:"product-list",title:"PSE: Sản phẩm - SSR danh sách",from:"^/san-pham/?$",to:"/ssr/products/san-pham/null",priority:400,conditions:[]},
  {key:"product-category",title:"PSE: Sản phẩm - SSR danh mục WordPress",from:"^/san-pham/([a-z0-9-]+)/?$",to:"/ssr/products/san-pham/null?catSlug=$1",priority:405,conditions:[{type:"product_category",capture:1,value:""}]},
  {key:"product-category-page",title:"PSE: Sản phẩm - SSR phân trang danh mục",from:"^/san-pham/([a-z0-9-]+)/([0-9]+)/?$",to:"/ssr/products/san-pham/$2?catSlug=$1",priority:405,conditions:[{type:"product_category",capture:1,value:""}]},
  {key:"product-pagination",title:"PSE: Sản phẩm - SSR phân trang",from:"^/san-pham/([0-9]+)/?$",to:"/ssr/products/san-pham/$1",priority:410,conditions:[]}
];
const browser=await chromium.launch({headless:true});
const p=await browser.newPage();
const report={dry,created:[],verified:[],mode:dry?"dry":"apply"};
try{
 await p.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await p.locator("body").innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("WordPress login math challenge unsupported");await f.fill(String(n));
  }
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 if(p.url().includes("wp-login"))throw Error("Admin auth failed");
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("REST nonce");return(await r.text()).trim()});
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("REST nonce invalid");
 const api=(path,method="GET",body=null)=>p.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const cmsPage=await api("/wp-json/wp/v2/pages/80968?context=edit&_fields=id,status,slug,acf");
 if(cmsPage.http!==200||cmsPage.data?.acf?.key!=="ssr-products"||cmsPage.data?.acf?.action!=="ProductsSSRPage")throw Error("Native Product Page SSR action/key not active");
 const registry=await api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&_fields=id,title,acf,status,route_priority,route_conditions");
 if(registry.http!==200||!Array.isArray(registry.data))throw Error("WordPress routing registry unavailable");
 const existing=new Map();
 for(const record of registry.data){
  const from=String(record.acf?.from_link||"");
  const expectedRule=expected.find(x=>x.from===from);
  if(expectedRule){
   if(existing.has(from))throw Error("Duplicate category routing record "+from);
   if(record.acf?.to_link!==expectedRule.to||record.acf?.match_type!=="Regex"||
       String(record.acf?.type).toLowerCase()!=="rewrite")throw Error("Conflicting existing category rule "+from);
   existing.set(from,record);
  }
 }
 // Check that the existing Product detail route remains disjoint with category
 // and keep user-authored WordPress routes untouched.
 const legacy=registry.data.filter(x=>x.acf?.from_link==="^/san-pham/([a-z0-9-]+-[0-9]{3,5})$"&&x.acf?.to_link==="/ssr/products/$1/detail");
 if(legacy.length!==1)throw Error("Product detail numeric suffix rewrite changed");
 const probe=await p.goto(wp+"/wp-admin/post.php?post="+legacy[0].id+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const form={
   http:probe?.status(),
   priority:await p.locator('input[name="esc_route_priority"]').count(),
   nonce:await p.locator('input[name="esc_url_routing_conditions_nonce"]').count(),
   add:await p.locator("#esc-route-add-condition").count(),
   publish:await p.locator("#publish").count()
 };
 console.log("PSE_PRODUCT_SSR_ROUTE_EDITOR="+JSON.stringify(form));
 const missing=expected.filter(x=>!existing.has(x.from));
 console.log("PSE_PRODUCT_SSR_ROUTE_PREFLIGHT="+JSON.stringify({existing:existing.size,missing:missing.map(x=>x.key),cmsKey:cmsPage.data.acf.key,legacyDetail:legacy[0].id,form,dry}));
 if(form.http!==200||!form.priority||!form.nonce||!form.add||!form.publish)throw Error("Routing Manager classic editor controls unavailable; no write");
 if(dry){console.log("PSE_PRODUCT_SSR_PUBLIC_RULES=DRY_PASS; writes=0");process.exit(0)}
 await mkdir("artifacts/pse-product-ssr-cutover",{recursive:true});
 await writeFile("artifacts/pse-product-ssr-cutover/public-rules-rollback.json",JSON.stringify({before:registry.data.filter(x=>expected.some(rule=>rule.from===x.acf?.from_link)),expected,created:[]},null,2)+"\n");
 for(const rule of expected){
  let record=existing.get(rule.from);
  if(record&&record.status==="publish"&&record.acf?.enable===true&&record.route_priority===rule.priority&&
    JSON.stringify(record.route_conditions||[])===JSON.stringify(rule.conditions)){
    report.verified.push({key:rule.key,id:record.id,already:true});continue;
  }
  if(!record){
   const created=await api("/wp-json/wp/v2/chuyen-huong-link","POST",{
    status:"draft",title:rule.title,
    acf:{from_link:rule.from,to_link:rule.to,type:"Rewrite",match_type:"Regex",enable:true}
   });
   if(created.http!==201||!Number(created.data?.id))throw Error("Cannot create WordPress draft route "+rule.key+" HTTP "+created.http);
   record=created.data;report.created.push({id:record.id,key:rule.key});
   await writeFile("artifacts/pse-product-ssr-cutover/public-rules-rollback.json",JSON.stringify({expected,created:report.created},null,2)+"\n");
  }
  const editor=await p.goto(wp+"/wp-admin/post.php?post="+record.id+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
  if(editor?.status()!==200||await p.locator('input[name="esc_route_priority"]').count()!==1||
     await p.locator("#publish").count()!==1)throw Error("Failed to open native route editor "+rule.key);
  await p.locator('input[name="esc_route_priority"]').fill(String(rule.priority));
  let rows=p.locator("#esc-route-condition-rows tr");
  const existingRows=await rows.count();
  for(let i=0;i<existingRows;i++)await rows.last().locator(".esc-route-remove-condition").click();
  for(const condition of rule.conditions){
   await p.locator("#esc-route-add-condition").click();
   const row=rows.last();
   await row.locator('select[name="esc_route_condition_type[]"]').selectOption(condition.type);
   await row.locator('input[name="esc_route_condition_capture[]"]').fill(String(condition.capture));
   await row.locator('input[name="esc_route_condition_value[]"]').fill(condition.value);
  }
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#publish").click()]);
  const meta=await api("/wp-json/wp/v2/chuyen-huong-link/"+record.id+"?context=edit&_fields=id,acf,status,route_priority,route_conditions");
  if(meta.http!==200||meta.data?.route_priority!==rule.priority||
     JSON.stringify(meta.data?.route_conditions||[])!==JSON.stringify(rule.conditions)||
     meta.data.acf?.from_link!==rule.from||meta.data.acf?.to_link!==rule.to)throw Error("WordPress routing condition readback failed "+rule.key);
  if(meta.data.status!=="publish"){
   const pub=await api("/wp-json/wp/v2/chuyen-huong-link/"+record.id,"POST",{status:"publish"});
   if(pub.http!==200||pub.data?.status!=="publish")throw Error("Cannot activate native route "+rule.key);
  }
  report.verified.push({key:rule.key,id:record.id,priority:rule.priority,conditions:rule.conditions,success:true});
  console.log("PSE_PRODUCT_SSR_ROUTE_SAVED="+JSON.stringify(report.verified.at(-1)));
 }
 console.log("PSE_PRODUCT_SSR_PUBLIC_RULES="+JSON.stringify({status:"PASS",verified:report.verified,created:report.created.length,wpOwned:true}));
}finally{await browser.close();}
