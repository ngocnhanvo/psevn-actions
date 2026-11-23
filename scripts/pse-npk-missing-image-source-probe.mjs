/** Read only: prove broken NPK image #5 and check alternate original-source URLs. */
import {chromium} from "playwright";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1240,height:900}});
try{
  await page.goto("https://pse.webnvn.com/npk-phu-my",{waitUntil:"domcontentloaded",timeout:60000});
  const evidence=await page.evaluate(()=>{
    const first=document.querySelector("main .article-content table");
    const img=[...first.querySelectorAll("img")][4];
    const td=img.closest("td");
    const row=td.closest("tr");
    return {html:img.outerHTML.slice(0,1000),rowDescription:row.querySelectorAll("td")[1]?.textContent?.replace(/\s+/g," ").trim().slice(0,500),
      imageCount:first.querySelectorAll("img").length,href:img.closest("a")?.href||null};
  });
  console.log("PSE_NPK_SOURCE_BAD_IMAGE_DOM="+JSON.stringify(evidence));
  const root="https://dpm.vn";
  const rel="/static/upload/users/dpm.vn/2021/SP%20Phan%20bon%20luu%20hanh/02.png";
  const options=[
    root+"/_thumbs/w270-h372-q80-b0-f0-v2019.12.30.1-eorig-wt0"+rel+"?v=v1.0r1&t=1fdfc29b",
    root+rel,
    "https://www.dpm.vn"+rel,
    "https://dpm.vn"+rel.replace("/02.png","/02.PNG")
  ];
  for(const url of options){
    try{
      const r=await page.request.get(url,{timeout:20000,maxRedirects:4,failOnStatusCode:false});
      const mime=r.headers()["content-type"]||"";
      console.log("PSE_NPK_SOURCE_IMAGE_PROBE="+JSON.stringify({
        url:url.slice(0,200),http:r.status(),mime,bytes:(await r.body()).length,finalUrl:r.url().slice(0,200)}));
    }catch(e){console.log("PSE_NPK_SOURCE_IMAGE_PROBE_ERROR="+JSON.stringify({url:url.slice(0,200),reason:String(e.message).slice(0,180)}));}
  }
}finally{await browser.close();}
