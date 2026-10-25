/** Examine PSE Joomla fertilizer product rows as discrete Product CPT draft proposals. READ ONLY. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const cs=rows.filter(x=>x.startsWith("WC_URL="));if(cs.length!==1)throw Error("WP origin not configured");
const url=new URL(cs[0].slice(7).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||!["","/"].includes(url.pathname)||url.search||url.hash)throw Error("Invalid WP origin");
const browser=await chromium.launch({headless:true});const admin=await browser.newPage();
try{
 await admin.goto(url.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await admin.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("WP math input missing");await f.fill(String(v))}
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("WP admin session missing");
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("nonce rejected");return(await r.text()).trim()});
 const wp=async(path,method="GET")=>admin.evaluate(async({path,method,nonce})=>{const r=await fetch(path,{credentials:"same-origin",method,headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});return{http:r.status,data:await r.json().catch(()=>({}))}},{path,method,nonce});
 const endpoints=await wp("/wp-json/");
 if(endpoints.http!==200||!endpoints.data.routes)throw Error("Cannot inspect WP route index");
 const routes=Object.keys(endpoints.data.routes).filter(k=>/(product|product_cat|woocommerce)/i.test(k)).sort();
 console.log("PSE_PRODUCT_REST_ROUTES="+JSON.stringify(routes.slice(0,80)));
 const potential=routes.filter(k=>/\/wp\/v2\/product_cat(?:\/|$)/.test(k));
 const responses=[];
 for(const key of potential.slice(0,5)){
  const r=await wp("/wp-json"+key);responses.push({path:key,http:r.http,summary:Array.isArray(r.data)?r.data.slice(0,6).map(x=>({id:x.id,name:x.name,slug:x.slug,parent:x.parent})):Object.keys(r.data||{})});
 }
 console.log("PSE_PRODUCT_TAXONOMY_REST="+JSON.stringify(responses));
 const pages=[
 "nhom-phan-don-va-phan-phuc-hop-phu-my",
 "nhom-phan-hon-hop-npk-phu-my",
 "huu-co-phu-my",
 "phan-bon-sinh-hoc",
 "nhom-san-pham-ure-nguyen-lieu-cho-san-xuat-cong-nghiep",
 "dam-phu-my"
 ];
 const source=await browser.newPage({viewport:{width:1440,height:880}});
 const all=[];
 for(const family of pages){
  const site="https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/"+family+".html";
  const response=await source.goto(site,{waitUntil:"domcontentloaded",timeout:55000});
  if(response?.status()!==200)throw Error("Missing Joomla product family "+family);
  const v=await source.evaluate(()=>{
   const body=document.querySelector(".item-page [itemprop=articleBody]");if(!body)throw Error("No verified legacy article");
   const output=[];
   for(const table of body.querySelectorAll("table")){
    for(const row of table.querySelectorAll("tr")){
     const cells=[...row.children].filter(x=>x.tagName==="TD");
     if(cells.length<2)continue;
     const imgs=[...cells[0].querySelectorAll("img[src]")].map(i=>({src:new URL(i.getAttribute("src"),location.href).href,alt:i.alt||""}));
     if(!imgs.length)continue;
     const nameRaw=(cells[1].querySelector("strong")?.textContent||"").replace(/\s+/g," ").trim();
     const full=(cells[1].textContent||"").replace(/\s+/g," ").trim();
     const title=nameRaw.length>=5&&nameRaw.length<=135?nameRaw:full.split(/Mã số\s*:/i)[0].trim().slice(0,130);
     const match=cells[0].querySelector("a[href*='id=']");
     const id=(()=>{try{return new URL(match.href).searchParams.get("id")||""}catch{return""}})();
     const detailUrl=match?.href || "";
     const spec=(cells[1].innerHTML||"").replace(/<script[\s\S]*?<\/script>/ig,"").slice(0,8000);
     output.push({legacyId:id,title,specification:full.slice(0,1900),html:spec,images:imgs,detailUrl});
    }
   }
   return output;
  });
  console.log("PSE_PRODUCT_ROW_SOURCE="+JSON.stringify({family,rows:v.length,ids:v.filter(x=>x.legacyId).length,images:v.reduce((n,x)=>n+x.images.length,0),examples:v.slice(0,4).map(x=>({id:x.legacyId,title:x.title,images:x.images.length,spec:x.specification.slice(0,170)}))}));
  all.push({family,source:site,products:v});
 }
 const ids=new Map(),collisions=[];
 for(const group of all)for(const item of group.products){
  if(!item.title||item.title.length<4||!item.images?.length)throw Error("Invalid original fertilizer row "+group.family);
  if(!item.legacyId)continue;
  const p=ids.get(item.legacyId);
  if(p)collisions.push({id:item.legacyId,firstGroup:p.group,otherGroup:group.family,firstTitle:p.title,otherTitle:item.title});
  else ids.set(item.legacyId,{group:group.family,title:item.title});
 }
 const wpProducts=await wp("/wp-json/wp/v2/product?context=edit&status=publish&per_page=100&_fields=id,slug,title,excerpt,content,acf,featured_media");
 if(wpProducts.http!==200||!Array.isArray(wpProducts.data))throw Error("Cannot audit existing native products");
 const samples=all.flatMap(g=>g.products.map(p=>({...p,group:g.family}))).filter(p=>/kebo|drone/i.test(p.title)).slice(0,4);
 const detailPreviews=[];
 for(const item of samples){
  let detailStatus=null,detailText="",detailTables=0,sourceTitle="";
  if(item.detailUrl){
   const u=new URL(item.detailUrl);if(u.hostname!=="www.pse.vn"&&u.hostname!=="pse.vn")throw Error("Untrusted Joomla article link");
   const got=await source.goto(u.href,{waitUntil:"domcontentloaded",timeout:55000});detailStatus=got?.status();
   if(detailStatus===200){
    const d=await source.evaluate(()=>{const el=document.querySelector(".item-page [itemprop=articleBody]");return{text:(el?.innerText||"").replace(/\\s+/g," ").slice(0,2200),tables:el?.querySelectorAll("table").length||0,title:document.title}});
    detailText=d.text;detailTables=d.tables;sourceTitle=d.title;
   }
  }
  const matches=wpProducts.data.filter(p=>String(p.slug).endsWith("-"+item.legacyId));
  detailPreviews.push({id:item.legacyId,group:item.group,legacyTitle:item.title,detailUrl:item.detailUrl,
   detailStatus,detailTables,sourceTitle,detailText,matches:matches.map(p=>({id:p.id,title:p.title?.raw||p.title?.rendered,
    excerpt:(p.excerpt?.raw||p.excerpt?.rendered||"").slice(0,700),
    content:(p.content?.raw||p.content?.rendered||"").slice(0,1200),acfKeys:Object.keys(p.acf||{})}))});
 }
 console.log("PSE_PRODUCT_DETAIL_PARITY="+JSON.stringify({wpCount:wpProducts.data.length,samples:detailPreviews}).slice(0,12500));
 await mkdir("artifacts/pse-native-products",{recursive:true});
 await writeFile("artifacts/pse-native-products/verified-rows.json",JSON.stringify({routes,categoryEndpoints:responses,families:all,duplicateSourceIds:collisions,detailPreviews},null,2)+"\n");
 console.log("PSE_NATIVE_PRODUCT_ROWS=PASS; originalRows="+all.reduce((n,g)=>n+g.products.length,0)+"; uniqueOriginIds="+ids.size+"; duplicateOriginIds="+collisions.length+"; no_product_created=true; no_build=true");
}finally{await browser.close()}
