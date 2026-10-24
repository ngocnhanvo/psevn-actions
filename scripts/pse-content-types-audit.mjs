/** PSE actual Product/ProductCategory and investor Post REST inventory; read only. */
import {chromium} from "playwright";
const v=String(process.env.ENV_FILE||"").split(/\r?\n/).find(x=>x.trim().startsWith("WC_URL="));if(!v)throw Error("WC_URL absent");const u=new URL(v.trim().slice(7).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:")throw Error("CMS must use HTTPS");
const b=await chromium.launch({headless:true});const p=await b.newPage();
try{
 await p.goto(u.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const txt=await p.locator("body").innerText();const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],c=+m[3],v=({"+":a+c,"-":a-c,x:a*c,"×":a*c,"*":a*c})[m[2]];const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Math captcha missing");await f.fill(String(v))}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});return (await r.text()).trim()});
 const path=["/wp-json/wp/v2/pages?context=edit&status=publish&per_page=100&_fields=id,slug,action,acf,status,title","/wp-json/wp/v2/product?context=edit&status=publish&per_page=4&_fields=id,slug,title,product_categories,acf","/wp-json/astro/v1/get-product-categories","/wp-json/wp/v2/posts?status=publish&per_page=3&categories=1744&_fields=id,slug,title,acf,categories,date,link","/wp-json/wp/v2/posts?status=publish&per_page=3&categories=1743&_fields=id,slug,title,acf,categories,date,link"];
 const x=await p.evaluate(async({path,nonce})=>Promise.all(path.map(async route=>{const r=await fetch(route,{headers:{"X-WP-Nonce":nonce},credentials:"same-origin"});return{route,http:r.status,total:r.headers.get("X-WP-Total"),data:await r.json().catch(()=>null)}})),{path,nonce});
 const [pages,products,cats,share,market]=x;
 console.log("PSE_REMAINING_PAGES="+JSON.stringify({http:pages.http,total:pages.total,list:pages.data?.map?.(p=>({id:p.id,slug:p.slug,title:p.title?.raw||p.title?.rendered,status:p.status,action:p.acf?.action,key:p.acf?.key}))}));
 console.log("PSE_REMAINING_PRODUCTS="+JSON.stringify({http:products.http,total:products.total,sample:products.data?.map?.(p=>({id:p.id,slug:p.slug,title:p.title?.raw||p.title?.rendered,categories:p.product_categories,acfFields:Object.keys(p.acf||{})}))}));
 console.log("PSE_REMAINING_PRODUCT_CATEGORIES="+JSON.stringify({http:cats.http,size:cats.data?.length,entries:cats.data?.slice?.(0,70).map?.(v=>({id:v.id,slug:v.slug,name:v.name,parent:v.parent}))}));
 console.log("PSE_REMAINING_INVESTOR_POSTS="+JSON.stringify({http:share.http,total:share.total,sample:share.data?.map?.(p=>({id:p.id,slug:p.slug,title:p.title?.rendered,date:p.date,categories:p.categories,acfFields:Object.keys(p.acf||{})}))}));
 console.log("PSE_REMAINING_MARKET_POSTS="+JSON.stringify({http:market.http,total:market.total,sample:market.data?.map?.(p=>({id:p.id,slug:p.slug,title:p.title?.rendered,date:p.date,categories:p.categories,acfFields:Object.keys(p.acf||{})}))}));
}finally{await b.close()}
