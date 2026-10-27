/** Read-only source-document audit. Never publishes legal/financial notices with broken attachments. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
const prefix="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/hoat-dong-chi-bo-hdqt-bks/";
const names=[
 [1129,"nghi-quyet-ve-viec-phe-duyet-don-vi-kiem-toan-bao-cao-tai-chinh-nam-2015"],
 [1150,"nghi-quyet-ve-viec-thuc-hien-tam-ung-chi-tra-co-tuc-dot-12015"],
 [1155,"chi-tra-co-tuc-dot-1-nam-2015"]
];
const known=[
 "https://www.pse.vn/images/pdf/2015/Chi_tra_co_tuc_dot_1_2015.pdf",
 "https://www.pse.vn/images/tai-lieu-quan-tri/15-87-NQ-DNB-QD.pdf"
];
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.route(/\.(?:png|jpe?g|webp|woff2?|gif)(?:\?.*)?$/i,r=>r.abort());
 const docs=new Set(known);
 for(const [id,slug] of names){
  const url=prefix+id+"-"+slug+".html";
  try{
   const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
   const data=await page.evaluate(()=>{
    const body=document.querySelector('[itemprop="articleBody"]');
    return {title:document.title,bodyLength:body?.textContent?.trim().length||0,
      sample:body?.textContent?.replace(/\s+/g," ").trim().slice(0,300)||"",
      links:[...(body?.querySelectorAll("a[href]")||[])].map(x=>({url:x.href,text:x.textContent.trim().slice(0,75)})).slice(0,30)};
   });
   data.links.filter(x=>/\.(?:pdf|docx?|xlsx?)(?:[?#]|$)/i.test(x.url)).forEach(x=>docs.add(x.url));
   console.log("PSE_CHI_BO_2015_NOTICE="+JSON.stringify({id,sourceHttp:response?.status(),...data}));
  }catch(e){console.log("PSE_CHI_BO_2015_NOTICE="+JSON.stringify({id,error:String(e).slice(0,190)}))}
 }
 for(const url of docs){
  if(!url.startsWith("https://www.pse.vn/"))continue;
  try{
   const response=await page.request.get(url,{timeout:30000});
   const bytes=await response.body();
   const prefix=bytes.subarray(0,8).toString("latin1");
   console.log("PSE_CHI_BO_2015_MEDIA="+JSON.stringify({url,http:response.status(),
     bytes:bytes.length,mime:response.headers()["content-type"],
     validPDF:prefix.startsWith("%PDF-"),sha256:createHash("sha256").update(bytes).digest("hex").slice(0,16)}));
  }catch(e){console.log("PSE_CHI_BO_2015_MEDIA="+JSON.stringify({url,error:String(e).slice(0,160)}))}
 }
 console.log("PSE_CHI_BO_2015_SOURCE_AUDIT=PASS; readonly=true; no_wp_write=true");
}finally{await browser.close()}
