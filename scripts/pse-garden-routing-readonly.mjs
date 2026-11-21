/** Strict GET-only diagnosis for the eight original Garden Product public routes. */
import {chromium,request} from "playwright";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function origin(key){
 const a=vars.filter(s=>s.startsWith(key+"="));if(a.length!==1)throw Error("missing "+key);
 const u=new URL(a[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.port||!["","/"].includes(u.pathname))throw Error("invalid "+key);
 return u.origin;
}
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("wrong repository");
const front=origin("WC_URL"),cms=front;const publicFront=origin("WC_URL_CLIENT");
if(cms===publicFront)throw Error("overlapping origins");
const slugs=["009","002","003","004","005","006","007","008"].map(n=>"phu-my-garden-pmgarden"+n);
const browser=await chromium.launch({headless:true});
const net=await request.newContext({timeout:40000});
const inspected=[];
try{
 const page=await browser.newPage({javaScriptEnabled:false});
 await page.route(/\.(?:png|jpe?g|webp|gif|svg|woff2?)(?:\?|$)/i,r=>r.abort());
 const registry=await net.get(cms+"/wp-json/wp/v2/product?status=publish&per_page=100&_fields=id,slug,status");
 if(registry.status()!==200)throw Error("WP Product REST HTTP "+registry.status());
 const products=await registry.json();
 if(products.length!==53||slugs.some(s=>products.filter(p=>p.slug===s).length!==1))
  throw Error("Native Garden Product registry inconsistent");
 const found=[];
 for(let n=1;n<=4;n++){
  const url=publicFront+"/san-pham/"+(n===1?"":n);
  const r=await page.goto(url,{waitUntil:"domcontentloaded",timeout:65000});
  if(r?.status()!==200)throw Error("Catalog page "+n+" HTTP "+r?.status());
  const rows=await page.locator("article.pse-catalog-card a[href]").evaluateAll(xs=>xs.map(a=>({href:a.getAttribute("href"),label:(a.getAttribute("aria-label")||a.textContent||"").replace(/\s+/g," ").trim().slice(0,120)})));
  for(const s of slugs){
   const matches=rows.filter(x=>(x.href||"").includes(s));
   if(matches.length)found.push({slug:s,page:n,matches});
  }
 }
 console.log("PSE_GARDEN_PUBLIC_CATALOG_LINKS="+JSON.stringify(found));
 for(const slug of slugs){
  const linked=found.find(x=>x.slug===slug);
  const paths=[
   "/san-pham/"+slug,
   "/ssr/products/"+slug+"/detail",
   "/"+slug,
   ...(linked?.matches?.[0]?.href?[new URL(linked.matches[0].href,publicFront).pathname]:[])
  ];
  const rows=[];
  for(const path of [...new Set(paths)]){
   const r=await net.get(publicFront+path,{timeout:40000,maxRedirects:0,failOnStatusCode:false});
   const contentType=String(r.headers()["content-type"]||"");
   const html=r.status()===200&&contentType.includes("text/html")?await r.text():"";
   const title=html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]||"";
   const canonical=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||"";
   rows.push({path,http:r.status(),location:r.headers().location||null,title,canonical});
  }
  inspected.push({slug,linked:linked?.matches?.[0]?.href||null,rows});
  console.log("PSE_GARDEN_ROUTE_ROW="+JSON.stringify(inspected.at(-1)));
 }
 const url=publicFront+"/san-pham/phu-my-garden";
 const category=await net.get(url,{timeout:40000,maxRedirects:0,failOnStatusCode:false});
 console.log("PSE_GARDEN_CATEGORY_ROUTE="+JSON.stringify({path:new URL(url).pathname,http:category.status(),location:category.headers().location||null}));
 console.log("PSE_GARDEN_ROUTE_SUMMARY="+JSON.stringify({
   productsInWordPress:53,sourceVariants:8,
   linkedInPublishedCatalog:found.length,
   linkedHttp200:inspected.filter(x=>x.linked&&x.rows.find(y=>y.path===new URL(x.linked,publicFront).pathname)?.http===200).length,
   publicDetailHttp200:inspected.filter(x=>x.rows[0].http===200).length,
   internalDetailHttp200:inspected.filter(x=>x.rows[1].http===200).length,
   categoryHttp:category.status(),readOnly:true,noBuild:true
 }));
}finally{await net.dispose();await browser.close()}
