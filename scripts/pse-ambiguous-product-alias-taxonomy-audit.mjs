/** Joomla five legacy product articles vs native WP ProductCategory (READ ONLY). */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const legacy=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const ids=[1425,1426,1434,1639,1678];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 legacy.schema!=="pse-legacy-article-migration-v1"||!legacy.backup_verified)throw Error("PSE provenance missing");
const v=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const getOrigin=key=>{const a=v.filter(s=>s.startsWith(key+"="));if(a.length!==1)throw Error(key+" missing");const u=new URL(a[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Wrong origin "+key);return u.origin};
const wp=getOrigin("WC_URL"),front=getOrigin("WC_URL_CLIENT");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
await page.route(/\.(?:jpe?g|png|webp|gif|woff2?|svg)(?:[?#]|$)/i,r=>r.abort());
const text=s=>String(s||"").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
const tokens=s=>new Set(text(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>=4));
const overlap=(a,b)=>{const x=tokens(a),y=tokens(b);return x.size?Number(([...x].filter(w=>y.has(w)).length/x.size).toFixed(3)):0};
const report={schema:"pse-five-ambiguous-joomla-product-alias-taxonomy-v1",readOnly:true,rows:[],categories:0};
try{
 // PSE stores complete editor-owned category HTML in protected term meta.
 // The native public product_cat.description may legitimately be empty.
 // Its official custom Astro REST endpoint resolves rich_description first.
 const req=await page.request.get(wp+"/wp-json/astro/v1/get-product-categories",{timeout:35000});
 if(req.status()!==200)throw Error("PSE native ProductCategory source REST "+req.status());
 const cats=await req.json();if(!Array.isArray(cats)||cats.length<6||cats.length>100)throw Error("Native product categories unavailable");
 report.categories=cats.length;
 for(const id of ids){
  const source=legacy.articles[id];if(source?.status!=="quarantined"||!source.source_url?.startsWith("https://www.pse.vn/"))throw Error("Unknown original source "+id);
  const res=await page.goto(source.source_url,{waitUntil:"domcontentloaded",timeout:55000});
  if(res?.status()!==200)throw Error("Original page unavailable "+id);
  const orig=await page.evaluate(()=>{
   const e=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page")||document.querySelector("article");
   return{title:(document.querySelector("h1")?.textContent||document.title||"").trim(),
    body:(e?.textContent||"").replace(/\s+/g," ").trim()};
  });
  const matches=cats.map(c=>({id:c.id,slug:c.slug,title:c.name,descriptionChars:text(c.description).length,
    sourceBodyOverlap:overlap(orig.body,c.description)})).sort((a,b)=>b.sourceBodyOverlap-a.sourceBodyOverlap).slice(0,4);
  const best=matches[0],to="/san-pham/"+best.slug;
  let target={path:to,status:null,canonicalOkay:false};
  if(best.sourceBodyOverlap>=0.5){
   const r=await page.request.get(front+to,{timeout:30000,maxRedirects:0,failOnStatusCode:false});
   target.status=r.status();
   if(r.status()===200){
    const html=await r.text();
    const canon=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||
      html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
    const u=canon?new URL(canon,front):null;
    target.canonicalOkay=!!u&&u.origin===front&&u.pathname===to&&!u.search&&!u.hash;
   }
  }
  report.rows.push({sourceId:id,sourceUrl:source.source_url,sourceTitle:orig.title,sourceBodyChars:orig.body.length,matches,target,
   decision:"REVIEW_ONLY_NO_REDIRECT"});
  console.log("PSE_PRODUCT_CATEGORY_SOURCE="+JSON.stringify({id,bodyChars:orig.body.length,matches,target}).slice(0,2000));
 }
 await mkdir("artifacts/pse-product-alias-taxonomy",{recursive:true});
 await writeFile("artifacts/pse-product-alias-taxonomy/report.json",JSON.stringify(report,null,2)+"\n");
 console.log("PSE_PRODUCT_CATEGORY_AUDIT=PASS sourceAliases="+report.rows.length+" categoryCount="+report.categories+" cmsWrites=0");
}finally{await browser.close()}
