/** Read-only original Joomla asset audit for two quarantined Cong doan articles. */
import {chromium} from "playwright";
const ids=[
 [230,"chi-doan-pvfcco-se-voi-chuong-trinh-moi-tin-nhan-mot-vien-da-xay-truong-sa"],
 [321,"doan-thanh-nien-pvfcco-se-tham-gia-cuoc-thi-tim-hieu-ve-bien-dao"]
];
const path="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/hoat-dong-cong-doan-doan-tn-nu-cong/";
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.route(/\.(?:woff2?|ttf)(?:\?.*)?$/i,r=>r.abort());
 for(const [id,slug] of ids){
  const url=path+id+"-"+slug+".html";
  const res=await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
  const data=await page.evaluate(()=>{
   const body=document.querySelector('[itemprop="articleBody"]')||document.querySelector(".item-page");
   if(!body)throw Error("Joomla article body absent");
   const files=[...body.querySelectorAll("img[src],a[href]")].map(el=>{
    const attr=el.tagName==="IMG"?"src":"href";
    const rel=el.getAttribute(attr)||"";
    return {tag:el.tagName,raw:rel,url:new URL(rel,document.baseURI).href,
      caption:el.tagName==="IMG"?el.getAttribute("alt"):el.textContent?.trim().slice(0,80)};
   }).filter(r=>/\.(?:png|jpe?g|webp|gif|pdf)(?:[?#]|$)/i.test(r.url));
   return {title:document.title,sourceText:body.textContent?.replace(/\s+/g," ").trim().slice(0,230),
      bodyLength:body.innerHTML.length,assets:[...new Map(files.map(x=>[x.url,x])).values()]};
  });
  const assets=[];
  for(const a of data.assets){
   try{
    const r=await page.request.get(a.url,{timeout:23000});
    const b=await r.body();
    assets.push({...a,status:r.status(),size:b.length,mime:r.headers()["content-type"]});
   }catch(e){assets.push({...a,error:String(e).slice(0,160)})}
  }
  console.log("PSE_CONG_DOAN_MEDIA_AUDIT="+JSON.stringify({sourceId:id,sourceHttp:res?.status(),...data,assets}));
 }
 console.log("PSE_CONG_DOAN_MEDIA_AUDIT=PASS; readonly=true; no_build=true");
}finally{await browser.close()}
