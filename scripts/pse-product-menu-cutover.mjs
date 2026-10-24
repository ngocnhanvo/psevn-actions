/** Bind PSE source-verified fertilizer Product menu and detail routing only after catalog release. */
import {chromium} from "playwright";
import {readFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=event.head_commit?.message==="cms(pse): activate verified fertilizer catalog routes and menu";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const env=(key)=>{const x=vars.filter(t=>t.startsWith(key+"="));if(x.length!==1)throw Error("PSE missing "+key);const u=new URL(x[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Untrusted "+key);return u.origin};
const cms=env("WC_URL"),frontend=env("WC_URL_CLIENT");
const families=[
 {id:77006,slug:"nhom-phan-don-va-phan-phuc-hop-phu-my",name:"Nhóm phân đơn và phân phức hợp Phú Mỹ"},
 {id:77007,slug:"nhom-phan-hon-hop-npk-phu-my",name:"Nhóm phân hỗn hợp NPK Phú Mỹ"},
 {id:77008,slug:"huu-co-phu-my",name:"Hữu cơ Phú Mỹ"},
 {id:77009,slug:"phan-bon-sinh-hoc",name:"Phân bón sinh học"},
 {id:77010,slug:"nhom-san-pham-ure-nguyen-lieu-cho-san-xuat-cong-nghiep",name:"Nhóm sản phẩm ure nguyên liệu cho sản xuất công nghiệp"},
 {id:77011,slug:"dam-phu-my",name:"Đạm Phú Mỹ"}
];
const browser=await chromium.launch({headless:true});const p=await browser.newPage();
try{
 await p.goto(cms+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await p.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Missing CAPTCHA");await f.fill(String(n))}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("WordPress nonce failed");return(await r.text()).trim()});
 const api=(path,method="GET",body)=>p.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{credentials:"same-origin",method,headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,total:r.headers.get("X-WP-Total"),data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
 const [catalog,menu,categories,products,rewrites]=await Promise.all([
  api("/wp-json/wp/v2/pages/80968?context=edit&_fields=id,slug,status,acf,title"),
  api("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),
  api("/wp-json/wp/v2/product_cat?context=edit&per_page=100&hide_empty=false&_fields=id,slug,parent,name,count"),
  api("/wp-json/wp/v2/product?status=publish&per_page=1&_fields=id,slug"),
  api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&_fields=id,status,acf")
 ]);
 if(catalog.http!==200||catalog.data?.status!=="publish"||catalog.data?.slug!=="san-pham"||catalog.data?.acf?.key!=="products"||catalog.data?.acf?.action!=="ProductsPage")throw Error("Native Product catalog not ready");
 if(menu.http!==200||!Array.isArray(menu.data)||categories.http!==200||!Array.isArray(categories.data)||products.http!==200||!Array.isArray(products.data)||rewrites.http!==200||!Array.isArray(rewrites.data))throw Error("PSE native Product routing preflight unavailable");
 const parent=menu.data.filter(x=>Number(x.id)===77005&&Number(x.parent)===77004&&String(x.title?.raw||x.title?.rendered||"").trim()==="Sản phẩm");
 if(parent.length!==1)throw Error("Product parent menu identity changed");
 const root=categories.data.filter(x=>x.slug==="phan-bon-phu-my"&&x.name==="Phân bón Phú Mỹ"&&Number(x.parent)===0);
 if(root.length!==1)throw Error("WordPress root PSE ProductCategory unavailable");
 const ready=families.map(f=>{
  const nodes=menu.data.filter(x=>x.id===f.id&&Number(x.parent)===77005&&String(x.title?.raw||x.title?.rendered||"").trim()===f.name);
  if(nodes.length!==1)throw Error("Product family menu changed "+f.slug);
  const cate=categories.data.filter(c=>c.slug===f.slug&&Number(c.parent)===Number(root[0].id));
  if(cate.length!==1)throw Error("Original ProductCategory not imported yet "+f.slug);
  const from="https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/"+f.slug+".html";
  const to=frontend+"/san-pham/?cat="+f.slug;
  if(nodes[0].url!==from&&nodes[0].url!==to)throw Error("Product family external link changed unexpectedly "+f.slug);
  return{...f,from,to,currentUrl:nodes[0].url,categoryId:cate[0].id,count:cate[0].count};
 });
 const rewrite={from:"^/san-pham/([a-z0-9-]+)$",to:"/ssr/products/$1/detail"};
 const found=rewrites.data.filter(x=>x.acf?.from_link===rewrite.from);
 if(found.length>1)throw Error("Ambiguous existing Product detail rewrite");
 if(found.length===1&&(found[0].acf?.to_link!==rewrite.to||String(found[0].acf?.type).toLowerCase()!=="rewrite"||found[0].acf?.match_type!=="Regex"||!found[0].acf?.enable))throw Error("Existing Product detail rewrite conflicts");
 const readyParent=parent[0].type==="post_type"&&parent[0].object==="page"&&Number(parent[0].object_id)===80968;
 if(!readyParent&&parent[0].type!=="custom")throw Error("Cannot convert unknown parent menu type");
 console.log("PSE_PRODUCT_MENU_PREFLIGHT="+JSON.stringify({mode:apply?"apply":"dry",nativePage:catalog.data.id,publishedProducts:products.total,rootCategory:root[0].id,menuParent:parent[0].id,alreadyBoundParent:readyParent,families:ready.map(x=>({slug:x.slug,category:x.categoryId,count:x.count,alreadyBound:x.currentUrl===x.to})),existingRewrite:found[0]?.id||null}));
 if(!apply){console.log("PSE_PRODUCT_MENU=DRY_PASS; no_cms_mutation=true; no_build=true");process.exit(0)}
 // No activation before the built public catalog actually works.
 const site=await browser.newPage();
 const live=await site.goto(frontend+"/san-pham/",{waitUntil:"domcontentloaded",timeout:60000});
 if(live?.status()!==200||!(await site.locator("#main-content.pse-products-catalog").count())||
    !(await site.locator("#product-grid article").count()))throw Error("Live Astro PSE Product catalog not deployed/has zero products; refuse menu cutover");
 // Also verify Product detail SSR via direct internal route, without publishing any
 // new broad matching redirect before its target is confirmed.
 const productTest=products.data[0]?.slug;
 if(!productTest)throw Error("No published Product slug for detail SSR smoke");
 const direct=await site.goto(frontend+"/ssr/products/"+encodeURIComponent(productTest)+"/detail",{waitUntil:"domcontentloaded",timeout:60000});
 if(direct?.status()!==200||!(await site.locator("main").count()))throw Error("Native product SSR detail handler unavailable");
 const endpoint="/wp-json/wp/v2/chuyen-huong-link";
 let rewriteId=found[0]?.id;
 if(!rewriteId){
  const created=await api(endpoint,"POST",{title:"PSE native fertilizer Product detail path",status:"draft",acf:{from_link:rewrite.from,to_link:rewrite.to,type:"Rewrite",match_type:"Regex",enable:true}});
  if(created.http!==201||!Number.isSafeInteger(Number(created.data?.id)))throw Error("Cannot stage PSE Product detail rewrite");
  rewriteId=Number(created.data.id);
 }
 const verify=await api(endpoint+"/"+rewriteId+"?context=edit&_fields=id,status,acf");
 if(verify.http!==200||verify.data?.acf?.from_link!==rewrite.from||verify.data?.acf?.to_link!==rewrite.to||String(verify.data?.acf?.type).toLowerCase()!=="rewrite")throw Error("Product rewrite readback failed");
 if(verify.data.status!=="publish"){
  const pub=await api(endpoint+"/"+rewriteId,"POST",{status:"publish"});
  if(pub.http!==200||pub.data?.status!=="publish")throw Error("Cannot publish Product Rewrite");
 }
 if(!readyParent){
  const r=await api("/wp-json/wp/v2/menu-items/77005","POST",{type:"post_type",object:"page",object_id:80968});
  if(r.http!==200||r.data?.object!=="page"||Number(r.data.object_id)!==80968)throw Error("Product catalog Header parent binding failed");
 }
 let changed=0;
 for(const f of ready){
  if(f.currentUrl===f.to)continue;
  const r=await api("/wp-json/wp/v2/menu-items/"+f.id,"POST",{type:"custom",url:f.to});
  if(r.http!==200||r.data?.url!==f.to)throw Error("Product family Header submenu bind failed "+f.slug);
  changed++;
 }
 const checks=await api("/wp-json/wp/v2/menu-items?context=edit&per_page=100");
 if(checks.http!==200||!Array.isArray(checks.data))throw Error("Menu update readback unavailable");
 const currentParent=checks.data.find(x=>x.id===77005);
 if(currentParent?.type!=="post_type"||Number(currentParent.object_id)!==80968||
    ready.some(f=>checks.data.find(x=>x.id===f.id)?.url!==f.to))throw Error("Product menu activation readback failed");
 console.log("PSE_PRODUCT_MENU=PASS; catalog=80968; verifiedFamilies=6; changedChildLinks="+changed+"; rewrite="+rewriteId+"; menuReadback=true; noBuild=true");
}finally{await browser.close()}
