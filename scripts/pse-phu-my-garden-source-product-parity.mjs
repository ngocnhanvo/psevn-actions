/** PSE original Phú Mỹ Garden 8 pack/crop variants vs native WordPress
 * Product/ProductCategory. Read-only audit; never create guesses or redirects.
 * Six core fertilizer categories are independently 45/45 PASS, not proof that
 * the separately embedded historical Garden product family is complete.
 */
import {chromium,request} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const REPO="ngocnhanvo/psevn-actions";
if(process.env.GITHUB_REPOSITORY!==REPO)throw Error("Wrong project repository");
const settings=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function origin(key){
 const values=settings.filter(x=>x.startsWith(key+"="));
 if(values.length!==1)throw Error("Missing unique "+key);
 const u=new URL(values[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||
  !["","/"].includes(u.pathname))throw Error("Untrusted "+key);
 return u.origin;
}
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("WordPress and Astro origins must differ");
const sourceUrl="https://pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-hon-hop-npk-phu-my/8-trang-chu.html";
const report={schema:"pse-phu-my-garden-source-product-parity-v1",readOnly:true,
 sourceUrl,source:{},wordpress:{},sourceRows:[],matches:[],summary:{},issues:[]};
const clean=s=>String(s||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
const normalized=s=>clean(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/gi,"d").toLowerCase();
const browser=await chromium.launch({headless:true});
const net=await request.newContext({timeout:65000});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",r=>r.abort());
try{
 const source=await net.get(sourceUrl,{timeout:65000,maxRedirects:3});
 if(source.status()!==200)throw Error("Original Garden page HTTP "+source.status());
 const html=await source.text();
 if(html.length<600||html.length>8_000_000)throw Error("Untrusted Joomla original HTML size");
 const page=await ctx.newPage();
 await page.setContent('<base href="'+sourceUrl+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),
  {waitUntil:"domcontentloaded",timeout:25000});
 const info=await page.evaluate(()=>{
  const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article")||document.body;
  const candidates=[...root.querySelectorAll("img[src]")].filter(img=>
   /pmgarden\s*0?\d/i.test((img.getAttribute("src")||"")+" "+(img.getAttribute("alt")||"")));
  const headings=[...root.querySelectorAll("h1,h2,h3,h4")].map(x=>(x.textContent||"").trim());
  const results=candidates.map(img=>{
   const tr=img.closest("tr");
   const container=tr||img.closest("figure,li,div")||img.parentElement;
   const cells=tr?[...tr.children].filter(el=>el.tagName==="TD"):[];
   const desc=(cells.find(td=>!td.contains(img))||container);
   const full=String(desc?.textContent||"").replace(/\s+/g," ").trim();
   const nameMatch=full.match(/(?:NPK\s*\d+\s*-\s*\d+\s*-\s*\d+(?:\+\d+S)?(?:\s*vi sinh)?(?:\s*\+TE)?|Đạm Phú Mỹ\s*\+\s*Kebo)/i);
   const crop=full.match(/Loại cây trồng\s*:\s*(.{3,90}?)(?:Đặt hàng\s*:|$)/i);
   const weight=full.match(/(?:trọng lượng tịnh|trọng lượng)\s*([\d.,]+\s*(?:kg|gr|g)\s*\/\s*túi)/i);
   return{sourceImage:new URL(img.getAttribute("src"),location.href).href,
    sourceAlt:String(img.alt||"").trim().slice(0,140),
    label:nameMatch?.[0]?.replace(/\s+/g," ").trim()||full.slice(0,110),
    crop:crop?.[1]?.trim()||null,packaging:weight?.[1]?.trim()||null,
    text:full.slice(0,1200)};
  });
  return{headingHasGarden:headings.some(x=>/^\s*phú mỹ garden\s*$/i.test(x)),
   gardenHeadings:headings.filter(x=>/garden/i.test(x)).slice(0,10),
   rows:results};
 });
 await page.close();
 if(!info.headingHasGarden)throw Error("Expected original Phú Mỹ Garden section heading absent");
 if(info.rows.length!==8||new Set(info.rows.map(x=>x.sourceImage)).size!==8)
  throw Error("Expected 8 unique source Garden images; found "+info.rows.length);
 for(const r of info.rows){
  const u=new URL(r.sourceImage);
  if(u.protocol!=="https:"||!["www.pse.vn","pse.vn"].includes(u.hostname)||
    !u.pathname.startsWith("/images/")||!/\.(?:png|jpe?g|webp)$/i.test(u.pathname))
   throw Error("Unverified original Garden image URL "+u.pathname);
  if(!r.label||r.label.length<5||r.text.length<40)throw Error("Source Garden row incomplete");
 }
 report.source={http:source.status(),hasGardenHeading:true,originalImageRows:info.rows.length};
 report.sourceRows=info.rows;
 const [pr,cr]=await Promise.all([
  net.get(wp+"/wp-json/wp/v2/product?status=publish&per_page=100&_fields=id,slug,title,content,excerpt,product_cat,featured_media",{timeout:65000}),
  net.get(wp+"/wp-json/wp/v2/product_cat?per_page=100&hide_empty=false&_fields=id,slug,name,parent",{timeout:65000})
 ]);
 if(pr.status()!==200||cr.status()!==200)throw Error("Native WordPress Product REST unavailable "+pr.status()+"/"+cr.status());
 const products=await pr.json(),categories=await cr.json();
 if(!Array.isArray(products)||products.length<40||products.length>100||
   !Array.isArray(categories)||categories.length<6)throw Error("Incomplete WP Product/ProductCategory registry");
 report.wordpress={publishedProductCount:products.length,categoryCount:categories.length,
  gardenTerms:categories.filter(c=>/garden|n[oô]ng nghi[eê]p [dđ][oô] th[iị]/i.test(normalized(c.slug+" "+c.name)))
   .map(c=>({id:c.id,slug:c.slug,name:c.name}))};
 const listed=products.map(p=>({
  id:p.id,slug:p.slug,title:clean(p.title?.rendered||p.title?.raw),
  body:clean((p.content?.rendered||p.content?.raw||"")+" "+(p.excerpt?.rendered||p.excerpt?.raw||"")),
  categories:Array.isArray(p.product_cat)?p.product_cat:[]
 }));
 const explicitGarden=listed.filter(p=>/phu my garden|pmgarden|mpet zip|nong nghiep do thi/i.test(normalized(p.title+" "+p.body)));
 report.wordpress.explicitGardenProducts=explicitGarden.map(p=>({id:p.id,slug:p.slug,title:p.title}));
 for(const item of info.rows){
  const formula=normalized(item.label).replace(/\s*\+\s*/g,"+").replace(/\s*-\s*/g,"-");
  const possible=listed.filter(p=>{
   const title=normalized(p.title).replace(/\s*\+\s*/g,"+").replace(/\s*-\s*/g,"-");
   return title===formula||title.includes(formula)||formula.includes(title);
  }).map(p=>({id:p.id,slug:p.slug,title:p.title,
    gardenProof:/phu my garden|pmgarden|mpet zip|nong nghiep do thi/i.test(normalized(p.title+" "+p.body)),
    cropProof:item.crop?normalized(p.body).includes(normalized(item.crop)):false,
    packagingProof:item.packaging?normalized(p.body).includes(normalized(item.packaging)):false
   }));
  const distinct=possible.filter(p=>p.gardenProof&&p.cropProof&&p.packagingProof);
  const row={sourceLabel:item.label,crop:item.crop,packaging:item.packaging,
   originalImage:item.sourceImage,
   formulaTitleCandidates:possible.slice(0,12),
   exactGardenVariantProven:distinct.length===1,matchedWordPressIds:distinct.map(p=>p.id)};
  report.matches.push(row);
  console.log("PSE_GARDEN_VARIANT="+JSON.stringify({...row,originalImage:new URL(item.sourceImage).pathname}).slice(0,2200));
 }
 report.summary={sourceFamily:"Phú Mỹ Garden",sourceRows:8,originalImages:8,
  wpProducts:products.length,wpExplicitGardenProducts:explicitGarden.length,
  wpGardenCategories:report.wordpress.gardenTerms.length,
  exactGardenVariantMatches:report.matches.filter(x=>x.exactGardenVariantProven).length,
  unmatched:report.matches.filter(x=>!x.exactGardenVariantProven).length,
  independentSixCategoryParityUnaffected:true,
  noCmsWrites:true,noBuild:true,
  decision:report.matches.every(x=>x.exactGardenVariantProven)?
   "SOURCE_GARDEN_VARIANTS_COVERED":"GARDEN_FAMILY_NOT_IN_EXISTING_SIX_CATEGORY_PARITY_REVIEW_REQUIRED"};
 console.log("PSE_GARDEN_SOURCE_WP_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-phu-my-garden-parity",{recursive:true});
 await writeFile("artifacts/pse-phu-my-garden-parity/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await ctx.close();await browser.close();
}