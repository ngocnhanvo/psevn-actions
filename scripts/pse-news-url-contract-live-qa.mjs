/** Read-only targeted news taxonomy SEO URL contracts after successful 12/12 UI QA. */
import {chromium} from "playwright";
const raw=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL_CLIENT="));
if(raw.length!==1)throw Error("Expected one frontend origin");
const host=new URL(raw[0].slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(host.protocol!=="https:"||!host.hostname||host.username||host.password||host.search||host.hash||!["","/"].includes(host.pathname))throw Error("Invalid PSE frontend origin");
const browser=await chromium.launch({headless:true}),site=host.origin;
const results=[];
try{
 const api=await browser.newContext();
 const legacy=await api.request.get(site+"/tin-tuc-su-kien/?cat=tin-cong-ty",{maxRedirects:0,timeout:30000});
 const oldStatus=legacy.status(),location=legacy.headers()["location"]||"";
 const goodLegacy=oldStatus===301&&new URL(location,site).pathname==="/tin-tuc-su-kien/tin-cong-ty";
 results.push({case:"legacy-query-301",status:oldStatus,location,pass:goodLegacy});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const res=await page.goto(site+"/tin-tuc-su-kien/tin-cong-ty/2",{waitUntil:"domcontentloaded",timeout:60000});
 const data=await page.evaluate(()=>({
   canonical:document.querySelector('link[rel="canonical"]')?.getAttribute("href")||"",
   h1:[...document.querySelectorAll("#main-content h1")].map(x=>x.textContent?.trim()),
   links:[...document.querySelectorAll("#posts-grid a[href]")].length,
   page2:document.querySelector('nav[aria-label="Phân trang"] a[aria-current="page"]')?.textContent?.trim()||"",
   categoryDropdown:document.querySelector("#dropdown-trigger")?.textContent?.trim()||"",
 }));
 const pageOk=res?.status()===200&&new URL(data.canonical).pathname==="/tin-tuc-su-kien/tin-cong-ty/2"&&data.h1.length===1&&data.links>0&&data.page2==="2";
 results.push({case:"native-category-page2",http:res?.status(),...data,pass:pageOk});
 const bad=await api.request.get(site+"/tin-tuc-su-kien/pse-unknown-category-test",{maxRedirects:0,timeout:30000});
 results.push({case:"unknown-category-404",status:bad.status(),pass:bad.status()===404});
 console.log("PSE_NEWS_URL_CONTRACT="+JSON.stringify(results).slice(0,12000));
 console.log("PSE_NEWS_URL_CONTRACT_SUMMARY="+JSON.stringify({total:results.length,passed:results.filter(x=>x.pass).length,readOnly:true}));
 if(results.some(x=>!x.pass))process.exitCode=1;
}finally{await browser.close()}
