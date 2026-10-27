/** Read-only Joomla com_search lookup of full-text category posts lacking anchors. */
import {chromium} from "playwright";
import {parseCreated,sourceId} from "./pse-legacy-search-date.mjs";
const base="https://www.pse.vn";
const titles=[
 "Kỷ niệm 21 năm Công đoàn PVFCCo – Hướng về 50 năm Ngày Giải phóng Miền Nam, thống nhất Đất nước",
 "PVFCCo-PSE cùng nhau hưởng ứng hướng về ngày Lễ trọng đại, kỷ niệm 50 năm Ngày Giải phóng Miền Nam, thống nhất Đất nước (30/4/1975 – 30/4/2025)",
 "PVFCCo-PSE tổ chức hoạt động kỷ niệm Ngày Quốc tế Phụ nữ 8/3",
 "Chi đoàn PVFCCo SE tổ chức chương trình trải nghiệm làm gốm thủ công cho con CB.NV Công ty",
 "PVFCCo-SE Đồng hành cùng Mùa hè xanh 2011"
];
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu," ").toLowerCase().replace(/\s+/g," ").trim();
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.route(/\.(?:png|jpe?g|webp|woff2?|gif)(?:\?.*)?$/i,r=>r.abort());
 for(const title of titles){
  const attempts=[],queries=[title.split(" ").slice(0,10).join(" "),title.split(" ").slice(0,6).join(" ")];
  for(const q of queries){
   const url=new URL("/component/search/",base);
   url.searchParams.set("searchword",q);
   url.searchParams.set("ordering","newest");
   url.searchParams.set("searchphrase","all");
   try{
    const r=await page.goto(url.toString(),{waitUntil:"domcontentloaded",timeout:45000});
    if(r?.status()!==200){attempts.push({query:q,http:r?.status()});continue}
    const data=await page.evaluate(()=>{
     const anchors=[...document.querySelectorAll("dl.search-results dt.result-title a[href],.search-results a[href],.result-title a[href]")];
     const rows=anchors.map(a=>{
      const dt=a.closest("dt");
      let sibling=dt?.nextElementSibling,date="";
      while(sibling && sibling.tagName!=="DT"){
       if(sibling.matches(".result-created,[class*=result-created]")){date=sibling.textContent||"";break}
       sibling=sibling.nextElementSibling;
      }
      if(!date)date=a.closest(".search-result,li,article")?.querySelector(".result-created,[class*=result-created]")?.textContent||"";
      return {href:a.href,title:(a.textContent||"").trim(),date:date.trim()};
     });
     return {rows,totalText:document.querySelector(".search-results")?.textContent?.length||0};
    });
    const matches=data.rows.filter(row=>norm(row.title)===norm(title));
    attempts.push({query:q,rows:data.rows.length,matches:matches.map(row=>({
      ...row,sourceId:sourceId(row.href),parsedCreated:parseCreated(row.date)
    })),sample:data.rows.slice(0,4)});
    if(matches.length)break;
   }catch(e){attempts.push({query:q,error:String(e).slice(0,180)})}
  }
  console.log("PSE_CONG_DOAN_UNLINKED_SOURCE="+JSON.stringify({title,attempts}));
 }
 console.log("PSE_CONG_DOAN_UNLINKED_DISCOVERY=COMPLETE; readonly=true; no_wp_write=true; no_build=true");
}finally{await browser.close()}
