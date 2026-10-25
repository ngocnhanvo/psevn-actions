/** Read-only live regression for CMS Product detail table and assigned taxonomy Header. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL_CLIENT="));
if(rows.length!==1)throw Error("PSE frontend origin unavailable");
const site=new URL(rows[0].slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(site.protocol!=="https:"||site.username||site.password||site.search||site.hash||!["","/"].includes(site.pathname))throw Error("Invalid frontend origin");
const path="/san-pham/npk-phu-my-15-15-15-nhap-khau-1714";
const browser=await chromium.launch({headless:true});
await mkdir("artifacts/pse-product-live",{recursive:true});
const results=[];
try {
  for (const width of [390,768,1440]) {
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
    try{
      const res=await page.goto(site.origin+path,{waitUntil:"domcontentloaded",timeout:60000});
      const d=await page.evaluate(()=>{
        const wrapper=document.querySelector("#data-content-wrapper");
        const desc=document.querySelector(".pse-product-detail .product-description");
        const specTable=desc?.querySelector("table");
        const rect=el=>el?.getBoundingClientRect();
        const td=specTable?.querySelector("td");
        const active=[...document.querySelectorAll("#main-header a[aria-current='location']")].map(el=>({text:el.textContent?.trim().slice(0,95),href:el.getAttribute("href")}));
        const tableRect=rect(specTable),descRect=rect(desc);
        return {
          canonical:document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
          h1:document.querySelector(".pse-product-detail h1")?.textContent?.trim(),
          detailWidth:Math.round(descRect?.width||0),
          tableWidth:Math.round(tableRect?.width||0),
          tableHeight:Math.round(tableRect?.height||0),
          tableComputedHeight:specTable?getComputedStyle(specTable).height:null,
          tableComputedWidth:specTable?getComputedStyle(specTable).width:null,
          firstCellPadding:td?getComputedStyle(td).padding:null,
          productMain:!!wrapper,
          titleText:specTable?.textContent?.replace(/\s+/g," ").trim().slice(0,150),
          active,
          pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
        };
      });
      const validActive=d.active.some(x=>{
        try{
          const target=new URL(x.href,site.origin);
          return target.origin===site.origin&&target.pathname.startsWith("/san-pham/")
            &&target.pathname!==path&&target.pathname!=="/san-pham/";
        }catch{return false}
      });
      const pass=res?.status()===200&&d.productMain&&d.detailWidth>0
        &&d.tableWidth>0&&d.tableWidth<=d.detailWidth+2
        &&d.tableWidth<909&&d.tableHeight>0&&!d.pageOverflow
        &&d.canonical===site.origin+path
        &&d.titleText?.includes("NPK Phú Mỹ")
        &&validActive;
      const result={width,http:res?.status(),...d,pass};
      results.push(result);
      console.log("PSE_PRODUCT_DETAIL_RESPONSIVE="+JSON.stringify(result));
      if(res?.status()===200) {
        const desc=page.locator(".pse-product-detail .product-description").first();
        await desc.scrollIntoViewIfNeeded();
        await page.screenshot({path:"artifacts/pse-product-live/npk-detail-"+width+".png",animations:"disabled",fullPage:false});
      }
    }catch(e){const result={width,error:String(e).slice(0,350),pass:false};results.push(result);console.log("PSE_PRODUCT_DETAIL_RESPONSIVE="+JSON.stringify(result))}
    finally{await page.close()}
  }
  const passed=results.filter(x=>x.pass).length;
  console.log("PSE_PRODUCT_DETAIL_RESPONSIVE_SUMMARY="+JSON.stringify({passed,total:results.length,readOnly:true,noBuild:true}));
  if(passed!==results.length)process.exitCode=1;
}finally{await browser.close()}
