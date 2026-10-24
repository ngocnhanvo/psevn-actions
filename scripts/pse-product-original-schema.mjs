/** PSE original fertilizer product family DOM and WP CPT schema; READ ONLY. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(v=>v.trim().replace(/^export\s+/,""));
const values=env.filter(s=>s.startsWith("WC_URL="));if(values.length!==1)throw Error("WordPress origin missing");
const origin=new URL(values[0].slice(7).replace(/^['"]|['"]$/g,""));
if(origin.protocol!=="https:"||origin.username||origin.password||origin.search||origin.hash||!["","/"].includes(origin.pathname))throw Error("Unsafe CMS origin");
const browser=await chromium.launch({headless:true}),p=await browser.newPage();
try{
 await p.goto(origin.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await p.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Missing captcha");await f.fill(String(v))}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Nonce unavailable");return (await r.text()).trim()});
 const rest=async(path,method="GET")=>p.evaluate(async({path,method,nonce})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce}});return{http:r.status,data:await r.json().catch(()=>({})),total:r.headers.get("X-WP-Total")}},{path,method,nonce});
 const targets=[
 ["/wp-json/wp/v2/product","OPTIONS"],
 ["/wp-json/wp/v2/product?context=edit&status=publish&per_page=2&_fields=id,slug,title,acf,product_categories","GET"],
 ["/wp-json/astro/v1/get-product-categories","GET"],
 ["/wp-json/wp/v2/product_categories?context=edit&per_page=2","GET"],
 ["/wp-json/wp/v2/media","OPTIONS"]
 ];
 const result=[];
 for(const [path,method] of targets){
  const r=await rest(path,method);
  const data=method==="OPTIONS"?{
    props:Object.fromEntries(Object.entries(r.data.schema?.properties||{}).map(([name,p])=>[name,{type:p.type,readonly:p.readonly,items:p.items?.type,required:p.required}])),
    required:r.data.schema?.required,
    endpoints:r.data.endpoints?.map(x=>({methods:x.methods,args:Object.keys(x.args||{})}))
  }:path.includes("get-product-categories")?{count:r.data?.length,items:r.data?.slice?.(0,12)}:r.data?.slice?.(0,2)||r.data;
  result.push({path,method,http:r.http,total:r.total,data});
  console.log("PSE_PRODUCT_CPT_AUDIT="+JSON.stringify({path,method,http:r.http,total:r.total,data}).slice(0,18000));
 }
 const src=await browser.newPage({viewport:{width:1440,height:950}});
 const urls=[
 "https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my.html",
 "https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-hon-hop-npk-phu-my.html",
 "https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/huu-co-phu-my.html",
 "https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/phan-bon-sinh-hoc.html",
 "https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-san-pham-ure-nguyen-lieu-cho-san-xuat-cong-nghiep.html",
 "https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/dam-phu-my.html"
 ];
 const parsed=[];
 for(const url of urls){
  const r=await src.goto(url,{waitUntil:"domcontentloaded",timeout:60000});if(r?.status()!==200)throw Error("Joomla product source missing "+url);
  const obj=await src.evaluate(()=>{
   const root=document.querySelector(".item-page [itemprop=articleBody]");if(!root)throw Error("No article body");
   const headers=[...root.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(x=>(x.textContent||"").replace(/\s+/g," ").trim());
   const imgs=[...root.querySelectorAll("img[src]")].map(e=>({url:new URL(e.getAttribute("src"),location.href).href,alt:e.getAttribute("alt")||"",parent:e.parentElement?.tagName,container:e.parentElement?.parentElement?.tagName,near:(e.parentElement?.parentElement?.textContent||"").replace(/\s+/g," ").trim().slice(0,200)}));
   const child=[...root.children].map(el=>({tag:el.tagName,cls:String(el.className||"").slice(0,100),text:(el.textContent||"").replace(/\s+/g," ").trim().slice(0,140),images:el.querySelectorAll("img").length,html:el.outerHTML.slice(0,450)}));
   return {length:(root.textContent||"").length,headers,images:imgs,children:child.slice(0,65),tableCount:root.querySelectorAll("table").length,sourceHtml:root.outerHTML.slice(0,7500)};
  });
  console.log("PSE_PRODUCT_FAMILY="+JSON.stringify({path:new URL(url).pathname,length:obj.length,headerCount:obj.headers.length,headings:obj.headers.slice(0,20),images:obj.images.length,firstImages:obj.images.slice(0,5),tableCount:obj.tableCount,children:obj.children.slice(0,18),htmlSample:obj.sourceHtml.slice(0,1300)}));
  parsed.push({url,...obj});
 }
 await mkdir("artifacts/pse-product-original",{recursive:true});
 await writeFile("artifacts/pse-product-original/schema-and-families.json",JSON.stringify({wordpress:result,legacy:parsed},null,2)+"\n");
 console.log("PSE_PRODUCT_SOURCE_AUDIT=PASS; families="+parsed.length+"; source_images="+parsed.reduce((n,x)=>n+x.images.length,0)+"; wordpress_cpt=verified; no_writes=true");
}finally{await browser.close()}
