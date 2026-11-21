/** Read-only: distinguish obsolete Joomla /8-trang-chu/ product-description
 * article aliases from truly missing WordPress Product content.
 */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const ids=[1425,1426,1434,1484,1639,1676,1464,1678];
if(state.schema!=="pse-legacy-article-migration-v1"||
 process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 ids.some(id=>state.articles[id]?.status!=="quarantined"||
 state.articles[id]?.reason!=="Original Joomla section cannot be mapped to verified WP taxonomy"))
 throw Error("Source identity/quarantine state changed; do not guess aliases");
const x=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).find(s=>s.startsWith("WC_URL="));
if(!x)throw Error("Missing WP origin");const wp=new URL(x.slice(7).replace(/^['"]|['"]$/g,""));
if(wp.protocol!=="https:"||wp.username||wp.password||wp.port||!["","/"].includes(wp.pathname))
 throw Error("Invalid WordPress origin");
const normalize=x=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/gi,"d").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
const terms=s=>new Set(normalize(s).split(" ").filter(t=>t.length>=2&&!/^(phu|my|mo|ta|va|hdsd|su|dung|phan|bon|nhom|san|pham|bao|gom)$/i.test(t)));
const intersect=(a,b)=>[...a].filter(v=>b.has(v)).length;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1320,height:840}});
await page.route(/\.(?:jpe?g|png|webp|svg|gif|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const report={schema:"pse-eight-historical-joomla-product-description-alias-v1",readOnly:true,wpProductCount:0,aliases:[],summary:{}};
try{
 const response=await page.request.get(wp.origin+"/wp-json/wp/v2/product?status=publish&per_page=100&_fields=id,slug,title,content,excerpt",{timeout:45000});
 if(response.status()!==200)throw Error("Public WooCommerce native Products REST "+response.status());
 const products=await response.json();
 if(!Array.isArray(products)||products.length!==45)throw Error("Unexpected published product registry "+products.length);
 report.wpProductCount=products.length;
 const strip=s=>String(s||"").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/ig," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
 for(const id of ids){
  const source=state.articles[id].source_url;
  const legacyUrl=new URL(source);
  if(legacyUrl.protocol!=="https:"||!["www.pse.vn","pse.vn"].includes(legacyUrl.hostname)||
    !legacyUrl.pathname.includes("/8-trang-chu/"))throw Error("Unexpected Joomla source "+id);
  const r=await page.goto(source,{waitUntil:"domcontentloaded",timeout:45000});
  const html=await page.evaluate(()=>{
    const b=document.querySelector(".item-page [itemprop=articleBody]")||
      document.querySelector(".item-page")||document.querySelector("article");
    const heading=(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||"").replace(/\s+/g," ").trim();
    const text=(b?.textContent||"").replace(/\s+/g," ").trim();
    return{heading,text,html:!!b,links:[...(b?.querySelectorAll("a[href]")||[])].map(e=>e.href).filter(u=>/san-pham|\/product/i.test(u)).slice(0,6)};
  });
  const originalTitleFromPath=legacyUrl.pathname.split("/").pop().replace(/^([0-9]+)-/,"").replace(/\.html$/,"").replace(/-/g," ");
  const heading=html.heading||originalTitleFromPath;
  const sourceTerms=terms(originalTitleFromPath);
  const matches=products.map(p=>{
    const title=strip(p.title?.rendered||p.title?.raw||"");
    const pTerms=terms(title);
    const overlap=intersect(sourceTerms,pTerms);
    const score=sourceTerms.size?overlap/sourceTerms.size:0;
    const titleNormalized=normalize(title);
    const sourceTitle=normalize(originalTitleFromPath);
    const exact=titleNormalized===sourceTitle||
      titleNormalized.startsWith(sourceTitle+" ")||sourceTitle.startsWith(titleNormalized+" ");
    const body=strip((p.content?.rendered||"")+" "+(p.excerpt?.rendered||""));
    const hTerms=terms(html.text.slice(0,3500)),wpTerms=terms(body);
    const bodyOverlap=hTerms.size?intersect(hTerms,wpTerms)/hTerms.size:0;
    return{wpId:p.id,slug:p.slug,title,score:Number(score.toFixed(3)),
      titleExact:exact,bodyOverlap:Number(bodyOverlap.toFixed(3)),wpBodyChars:body.length};
  }).sort((a,b)=>Number(b.titleExact)-Number(a.titleExact)||b.score-a.score||b.bodyOverlap-a.bodyOverlap).slice(0,5);
  const exact=matches.filter(m=>m.titleExact);
  const decision=r?.status()===200&&html.html&&html.text.length>=120&&exact.length===1?
    "EXACT_PRODUCT_TITLE_CANDIDATE":"MANUAL_SEMANTIC_REVIEW";
  const row={id,source,http:r?.status()||0,sourceHeading:heading,
    originalBodyChars:html.text.length,internalProductLinks:html.links,
    result:decision,candidates:matches};
  report.aliases.push(row);
  console.log("PSE_LEGACY_PRODUCT_ALIAS="+JSON.stringify({id,http:row.http,title:heading,
    bodyChars:row.originalBodyChars,result:decision,candidates:matches.slice(0,3)}).slice(0,2300));
 }
 report.summary={sourceAliases:ids.length,source200:report.aliases.filter(r=>r.http===200).length,
   exactTitleCandidates:report.aliases.filter(r=>r.result==="EXACT_PRODUCT_TITLE_CANDIDATE").length,
   manualReview:report.aliases.filter(r=>r.result==="MANUAL_SEMANTIC_REVIEW").map(r=>r.id),
   wpProducts:products.length,publishedNewProducts:0,readOnly:true};
 await mkdir("artifacts/pse-legacy-product-article-alias",{recursive:true});
 await writeFile("artifacts/pse-legacy-product-article-alias/report.json",JSON.stringify(report,null,2)+"\n");
 console.log("PSE_LEGACY_PRODUCT_ALIAS_SUMMARY="+JSON.stringify(report.summary));
 if(report.summary.source200!==8)process.exitCode=1;
}finally{await browser.close()}