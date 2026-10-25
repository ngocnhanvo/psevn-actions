/** PSE News taxonomy public SSR and WordPress contextual article menu (read only). */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origins=rows.filter(x=>x.startsWith("WC_URL_CLIENT="));
if(origins.length!==1)throw Error("PSE frontend origin must be configured");
const url=new URL(origins[0].slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||!url.hostname||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Invalid PSE frontend origin");
const site=url.origin;
const items=[
 {slug:"tin-cong-ty",name:"Tin Công ty"},
 {slug:"kien-thuc-nong-nghiep",name:"Kiến thức nông nghiệp"},
 {slug:"tin-tong-hop",name:"Tin tổng hợp"},
];
const browser=await chromium.launch({headless:true});
await mkdir("artifacts/pse-news-taxonomy",{recursive:true});
const tests=[];
const normalize=s=>String(s||"").replace(/\s+/g," ").trim().toLowerCase();
try{
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  try{
   for(const cat of items){
    const path="/tin-tuc-su-kien/"+cat.slug;
    const response=await page.goto(site+path,{waitUntil:"domcontentloaded",timeout:60000});
    const info=await page.evaluate(()=>{
      const canonical=document.querySelector('link[rel="canonical"]')?.getAttribute("href")||"";
      const h1=Array.from(document.querySelectorAll("#main-content h1")).map(x=>(x.textContent||"").trim());
      const articles=document.querySelectorAll("#posts-grid a[href]").length;
      const dropdown=document.querySelector("#dropdown-trigger")?.textContent?.trim()||"";
      const main=document.querySelector("#main-content.pse-posts");
      return{canonical,h1,articles,dropdown,ssr:!!main,horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3};
    });
    if(response?.status()!==200||new URL(info.canonical).pathname!==path||
       !info.ssr||!info.h1.some(h=>normalize(h).includes(normalize(cat.name)))||
       info.horizontalOverflow)throw Error("News SSR/canonical/H1 invalid "+JSON.stringify({http:response?.status(),...info}));
    const nav=page.locator("#desktop-menu");
    const desktop=await nav.isVisible();
    const rootLabel = cat.slug === "kien-thuc-nong-nghiep" ? "HOẠT ĐỘNG KINH DOANH" : "TIN TỨC";
    let root,rootPanel,selection;
    if(desktop){
      root=nav.locator('button[data-menu-trigger]').filter({hasText:rootLabel}).first();
      await root.click();
      rootPanel=page.locator("#"+await root.getAttribute("aria-controls"));
    }else{
      await page.locator("#hamburger-btn").click();
      const mobile=page.locator("#mobile-menu-container");
      root=mobile.locator('button[data-menu-toggle]').filter({hasText:rootLabel}).first();
      await root.click();
      rootPanel=page.locator("#"+await root.getAttribute("aria-controls"));
    }
    // A category with descendants is a button in WordPress Menu Manager.
    // Its own navigation is the separate "Xem tất cả" anchor in its panel.
    const isParent = cat.slug === "tin-cong-ty" || cat.slug === "kien-thuc-nong-nghiep";
    if(cat.slug==="tin-tong-hop" || isParent){
      const owner = cat.slug==="tin-tong-hop" ? "Tin Công ty" : cat.name;
      const trigger = rootPanel.locator(desktop?'button[data-submenu-trigger]':'button[data-menu-toggle]').filter({hasText:owner}).first();
      if(await trigger.count()!==1)throw Error("Missing WordPress category branch "+owner);
      await trigger.click();
      rootPanel=page.locator("#"+await trigger.getAttribute("aria-controls"));
    }
    selection=isParent
      ? rootPanel.locator('a[aria-current="page"]').first()
      : rootPanel.locator('a[href]').filter({hasText:cat.name}).first();
    if(await selection.count()!==1)throw Error("Missing active WordPress category link "+cat.name);
    const link=await selection.getAttribute("href");
    if(new URL(link,site).pathname!==path||
       await selection.getAttribute("aria-current")!=="page")
      throw Error("News category Header not active "+JSON.stringify({cat:cat.slug,link,current:await selection.getAttribute("aria-current")}));
    tests.push({width,path,categoryActive:true,canonical:info.canonical,articles:info.articles,pass:true});
    if(width===1440 && cat.slug==="tin-cong-ty"){
      await page.screenshot({path:"artifacts/pse-news-taxonomy/news-category-desktop.png",fullPage:false,animations:"disabled"});
    }
    // Clear old opened menus on subsequent navigations.
   }
   const detailListing=site+"/tin-tuc-su-kien/tin-cong-ty";
   await page.goto(detailListing,{waitUntil:"domcontentloaded",timeout:60000});
   const href=await page.locator('#posts-grid a[href]').first().getAttribute("href");
   if(!href)throw Error("No native WordPress Post in Tin Công ty");
   const article=await page.goto(new URL(href,site).href,{waitUntil:"domcontentloaded",timeout:60000});
   if(article?.status()!==200||!await page.locator(".pse-post-detail h1").count())throw Error("WordPress Post detail not SSR 200");
   const nav=page.locator("#desktop-menu"),desktop=await nav.isVisible();
   let rootPanel;
   if(desktop){
     const root=nav.locator('button[data-menu-trigger][aria-label*="TIN TỨC"]').first();
     if(!await root.count())throw Error("News root not found for article");
     await root.click();rootPanel=page.locator("#"+await root.getAttribute("aria-controls"));
   }else{
     await page.locator("#hamburger-btn").click();
     const root=page.locator('#mobile-menu-container button[data-menu-toggle][aria-label*="TIN TỨC"]').first();
     if(!await root.count())throw Error("Mobile news root not found for article");
     await root.click();rootPanel=page.locator("#"+await root.getAttribute("aria-controls"));
   }
   const current=await rootPanel.locator('a[aria-current="location"]').count();
   const nested=await rootPanel.locator('button[class*="text-"][aria-label*="Tin Công ty"]').count();
   if(current===0){
     const company=rootPanel.locator(desktop?'button[data-submenu-trigger][aria-label*="Tin Công ty"]':'button[data-menu-toggle][aria-label*="Tin Công ty"]').first();
     if(await company.count()){
       await company.click();
       const child=page.locator("#"+await company.getAttribute("aria-controls"));
       if(await child.locator('a[aria-current="location"]').count()===0)
         throw Error("Post detail has no active WordPress category");
     }else throw Error("Post detail has no active category");
   }
   tests.push({width,path:new URL(href,site).pathname,articleCategoryActive:true,nested,pass:true});
  }catch(error){
   tests.push({width,pass:false,error:String(error).slice(0,480)});
  }finally{await page.close()}
 }
 const total=tests.length,passed=tests.filter(t=>t.pass).length;
 console.log("PSE_NEWS_CATEGORY_LIVE="+JSON.stringify(tests).slice(0,20000));
 console.log("PSE_NEWS_CATEGORY_LIVE_SUMMARY="+JSON.stringify({total,passed,failed:tests.filter(t=>!t.pass),noBuild:true,readOnly:true}));
 if(passed!==12)process.exitCode=1;
}finally{await browser.close()}
