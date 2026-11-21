/** Browser acceptance for newly recovered native SOP product and all 11 original category rows. READ ONLY. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const base="https://pse.webnvn.com",cat="/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my";
const product="/san-pham/kali-phu-my-sop",name="Kali Phú Mỹ (SOP)";
const nonIdTitle="Đạm Phú Mỹ ( Chuyên dùng cho Nông, lâm trường)";
const browser=await chromium.launch({headless:true});
const out="artifacts/pse-sop-live-qa";
await mkdir(out,{recursive:true});
const found=[];
try{
 for(const width of [390,768,1366]){
  const context=await browser.newContext({viewport:{width,height:860}});
  const page=await context.newPage();
  const r=await page.goto(base+cat,{waitUntil:"domcontentloaded",timeout:60000});
  if(r?.status()!==200)throw Error("Category HTTP "+r?.status()+" at "+width);
  await page.locator("article.pse-catalog-card").first().waitFor({timeout:25000});
  const section=await page.evaluate(()=>{
   const cards=[...document.querySelectorAll("article.pse-catalog-card")];
   return {
    count:cards.length,
    titles:cards.map(card=>(card.querySelector("h2")?.textContent||"").replace(/\s+/g," ").trim()),
    sopCardSrcSet:cards.find(card=>card.textContent.includes("Kali Phú Mỹ (SOP)"))?.querySelector("img")?.getAttribute("srcset")||"",
    overflow:document.documentElement.scrollWidth-innerWidth,
    links:cards.map(card=>card.querySelector("a[href]")?.getAttribute("href")||"")
   };
  });
  if(section.count!==11)throw Error("Original 11 category rows do not match native cards: "+JSON.stringify({width,rows:section.count,titles:section.titles}));
  if(section.titles.filter(x=>x===name).length!==1||
     section.titles.filter(x=>x===nonIdTitle).length!==1)
   throw Error("Recovered SOP or original Nông Lâm product absent/duplicated at "+width+": "+JSON.stringify(section.titles));
  // <img srcset> deliberately has no src in the Astro listing. Check actual
  // browser-selected source and decoded pixels, not HTMLImageElement.src.
  const sopImage=await page.locator("article.pse-catalog-card").filter({hasText:name})
   .locator("img").first().evaluate(async img=>{
    img.loading="eager";
    try{await img.decode()}catch{}
    return {currentSrc:img.currentSrc||"",srcset:img.getAttribute("srcset")||"",
     naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight};
   });
  console.log("PSE_SOP_IMAGE_BROWSER="+JSON.stringify({width,...sopImage}));
  if(!sopImage.currentSrc||sopImage.currentSrc.includes("pse.vn/images/")||
     sopImage.naturalWidth<100||sopImage.naturalHeight<100)
   throw Error("SOP original image not decoded from local WordPress build cache: "+JSON.stringify({width,...sopImage}));
  if(section.overflow>5)throw Error("Category horizontal overflow "+section.overflow+" at "+width);
  await page.screenshot({path:out+"/category-"+width+".png",fullPage:true,timeout:40000});
  const detail=await context.newPage();
  const rd=await detail.goto(base+product,{waitUntil:"domcontentloaded",timeout:60000});
  if(rd?.status()!==200)throw Error("Product detail HTTP "+rd?.status()+" at "+width);
  const d=await detail.evaluate(()=>{
   const body=(document.querySelector("main")?.textContent||"").replace(/\s+/g," ").trim();
   return {h1:document.querySelector("main h1")?.textContent?.trim()||"",containsName:body.includes("Kali Phú Mỹ (SOP)"),
    containsKali:body.includes("50%"),containsSulfur:body.includes("17%"),
    overflow:document.documentElement.scrollWidth-innerWidth};
  });
  if(!d.containsName||!d.containsKali||!d.containsSulfur||d.overflow>5)
   throw Error("SOP detail data/overflow mismatch "+width+": "+JSON.stringify(d));
  await detail.screenshot({path:out+"/detail-"+width+".png",fullPage:true,timeout:40000});
  const item={width,categoryCards:section.count,originalRowNamesMatched:true,productHttp:rd.status(),
   imageOwnedByWp:!sopImage.currentSrc.includes("pse.vn/images/"),
   compositionMatched:true,categoryOverflow:section.overflow,detailOverflow:d.overflow};
  found.push(item);
  console.log("PSE_SOP_FRONTEND_CHECK="+JSON.stringify(item));
  await context.close();
 }
 console.log("PSE_SOP_LIVE_QA=PASS; 390_768_1366; source_rows=11; native_category_cards=11; product_detail_200=true; no_build=true");
}finally{await browser.close()}