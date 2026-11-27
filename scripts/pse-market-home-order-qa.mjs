/** Read-only PSE original Joomla vs WordPress market news-tab ordering audit. */
import { chromium } from "playwright";
const SOURCE="https://www.pse.vn/";
const WP="https://admin-pse.webnvn.com";
const SITE="https://pse.webnvn.com";
const CATEGORY=1743;
const targets=["Điểm tin ngành Nông nghiệp trên các báo ra ngày 14/6/2013","Sẽ loại hơn một nửa cơ sở sản xuất phân bón","Nông dân Đồng Kho trúng vụ bắp","Cà phê: Mưa chưa nhiều, giá đã xiêu!","Sức mua phân bón tăng","Ngóng mưa từng ngày"];
const normalize=x=>String(x||"").replace(/\s+/g," ").trim().normalize("NFC").toLocaleLowerCase("vi");
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:1366,height:900}});
 const source=await ctx.newPage();
 const o=await source.goto(SOURCE,{waitUntil:"domcontentloaded",timeout:60000});
 if(o?.status()!==200)throw Error("Legacy home HTTP "+o?.status());
 const old=await source.evaluate(() => {
  const root=document.querySelector("body");
  const wanted=["Điểm tin ngành Nông nghiệp trên các báo ra ngày 14/6/2013","Sẽ loại hơn một nửa cơ sở sản xuất phân bón","Nông dân Đồng Kho trúng vụ bắp","Cà phê: Mưa chưa nhiều, giá đã xiêu!","Sức mua phân bón tăng","Ngóng mưa từng ngày"];
  return wanted.map(t=> {
    const a=[...root.querySelectorAll("a")].find(z=>(z.textContent||"").replace(/\s+/g," ").trim()===t);
    return{title:t,exists:!!a,href:a?.href||null,htmlPosition:a?document.documentElement.outerHTML.indexOf(a.outerHTML):-1};
  });
 });
 const resp=await ctx.request.get(WP+"/wp-json/wp/v2/posts?categories="+CATEGORY+"&status=publish&orderby=date&order=desc&per_page=100&_fields=id,slug,title,date,date_gmt,modified,categories,status",{timeout:60000,failOnStatusCode:false});
 if(resp.status()!==200)throw Error("WP posts API HTTP "+resp.status());
 const posts=await resp.json();
 if(!Array.isArray(posts))throw Error("WP market category REST returned non-array");
 const wp=posts.map((p,i)=>({position:i+1,id:p.id,title:String(p.title?.rendered||"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim(),slug:p.slug,date:p.date,date_gmt:p.date_gmt,modified:p.modified,categories:p.categories}));
 const highlights=targets.map(t=>({target:t,matches:wp.filter(p=>normalize(p.title)===normalize(t)).map(p=>({position:p.position,id:p.id,date:p.date,modified:p.modified,slug:p.slug}))}));
 const featuredAndOther=wp.slice(0,9);
 console.log("PSE_MARKET_NEWS_OLD="+JSON.stringify(old));
 console.log("PSE_MARKET_NEWS_WP_TOP="+JSON.stringify({http:resp.status(),xWpTotal:resp.headers()["x-wp-total"],category:CATEGORY,top:featuredAndOther}));
 console.log("PSE_MARKET_NEWS_TARGET_DATES="+JSON.stringify(highlights));
 const page=await ctx.newPage();
 const res=await page.goto(SITE+"/trang-chu",{waitUntil:"domcontentloaded",timeout:60000});
 if(res?.status()!==200)throw Error("Astro home HTTP "+res?.status());
 const modern=await page.evaluate(()=>{
  const p=document.querySelector('[data-pse-news-panel="1"]');
  return {panelFound:!!p,featured:p?.querySelector(".pse-news__featured h2")?.textContent?.trim()||null,
    others:[...(p?.querySelectorAll(".pse-news__more li")||[])].map(li=>({
      title:li.querySelector("a")?.textContent?.trim()||"",
      date:li.querySelector("time")?.getAttribute("datetime")||"",
      visibleDate:li.querySelector("time")?.textContent?.trim()||""
    }))};
 });
 console.log("PSE_MARKET_NEWS_ASTRO="+JSON.stringify(modern));
 const actual=[modern.featured,...modern.others.map(x=>x.title)].filter(Boolean).map(normalize);
 const expected=wp.slice(0,5).map(x=>normalize(x.title));
 const matchesApi=actual.length===5 && JSON.stringify(actual)===JSON.stringify(expected);
 console.log("PSE_MARKET_NEWS_DIAGNOSIS="+JSON.stringify({
   readonly:true,categoryId:CATEGORY,sourceHomeHttp:o?.status(),wpHttp:resp.status(),astroHttp:res?.status(),
   originalHomeOrder:old.filter(x=>x.exists).map(x=>x.title),
   wpOrder:wp.slice(0,5).map(x=>x.title),
   astroOrder:[modern.featured,...modern.others.map(x=>x.title)],
   astroMatchesWpDateDesc:matchesApi,matchedTargetCount:highlights.filter(x=>x.matches.length===1).length,
   marketCategoryTotal:resp.headers()["x-wp-total"]
 }));
 if(!matchesApi)throw Error("Astro home differs from WP date-desc; investigate build cache and source");
 if(!old.slice(0,5).every(x=>x.exists) || old[5]?.exists) throw Error("Original Joomla home five market slots differ from recorded baseline");
const legacyTop5=old.slice(0,5).map(x=>normalize(x.title));
if(JSON.stringify(actual)!==JSON.stringify(legacyTop5))throw Error("PSE_MARKET_NEWS_JOOMLA_ORDER=FAIL expected="+JSON.stringify(legacyTop5)+" actual="+JSON.stringify(actual));
console.log("PSE_MARKET_NEWS_JOOMLA_ORDER=PASS; matched=5/5; source_module=148; source_sort=created_dsc");
}finally{await browser.close();}
