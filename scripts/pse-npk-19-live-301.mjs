/** READ ONLY - verify all 19 distinct ?id= Joomla NPK redirects on Astro production. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const source="/hoat-dong-kinh-doanh/san-pham/npk-phu-my.html";
const original="/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/1434-npk-phu-my.html";
const pairs=[
 ["1436","npk-phu-my-17-15-9-10s-te-1703"],["1435","npk-phu-my-17-15-9-13s-te-1702"],
 ["1482","npk-16-7-16-05412"],["1438","npk-phu-my-15-15-15-te-1717"],
 ["1440","npk-phu-my-16-8-16-te-1686"],["1442","npk-phu-my-16-8-17-te-1687"],
 ["1446","npk-phu-my-17-7-17-te-1689"],["1449","npk-phu-my-20-7-7-te-1713"],
 ["1451","npk-phu-my-20-20-15-te-1699"],["1455","npk-phu-my-17-17-8-13s-te-1700"],
 ["1459","npk-phu-my-16-16-8-5s-te-00066"],["1460","npk-phu-my-16-16-8-9s-te-00063"],
 ["1461","npk-phu-my-16-16-8-10s-te-00062"],["1462","npk-phu-my-16-16-8-13s-te-1705"],
 ["1463","npk-phu-my-16-6-19-te-1683"],["1464","npk-phu-my-16-16-16-te-1716"],
 ["1465","npk-phu-my-16-8-8-te-1712"],["1483","npk-phu-my-15-5-20-te-1690"],
 ["1484","npk-phu-my-20-5-5-te-1711"]
];
const front="https://pse.webnvn.com";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const results=[];
try{
 const request=async u=>{
  for(let n=0;n<3;n++){
   try{
    const r=await page.request.get(front+u,{maxRedirects:0,timeout:30000,failOnStatusCode:false});
    if(r.status()>=500&&n<2)continue;
    return r;
   }catch(e){
    if(n>=2||!/timeout|ECONNRESET|socket hang up/i.test(String(e)))throw e;
   }
  }
  throw Error("Retry exhausted "+u);
 };
 for(let start=0;start<19;start+=4){
  const batch=await Promise.all(pairs.slice(start,start+4).map(async([id,slug])=>{
   const from=source+"?id="+id,to="/san-pham/"+slug;
   try{
    const response=await request(from),location=response.headers().location||"";
    const target=await request(to);
    const html=target.status()===200?await target.text():"";
    const canon=html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
    const canonicalPath=canon?new URL(canon,front).pathname:"";
    return {id,from,to,status:response.status(),location,targetStatus:target.status(),
      canonicalPath,hasH1:/<h1(?:\s|>)/i.test(html),
      pass:response.status()===301&&location===to&&target.status()===200&&canonicalPath===to&&/<h1(?:\s|>)/i.test(html)};
   }catch(e){return {id,from,to,error:String(e).slice(0,160),pass:false};}
  }));
  results.push(...batch);
 }
 const preserved=await request(original);
 const unknown=await request(source+"?id=999999");
 const none=await request(source);
 const specialOk=preserved.status()===301&&preserved.headers().location==="/npk-phu-my";
 const unknownOk=unknown.status()!==301;
 const noQueryOk=none.status()!==301;
 const report={schema:"pse-npk-19-exact-query-live-301-v1",checked:results.length,passed:results.filter(x=>x.pass).length,
  originalPageRedirectKept:specialOk,unknownIdNotRedirected:unknownOk,withoutIdNotRedirected:noQueryOk,
  observedUnknown:unknown.status(),observedNoQuery:none.status(),rules:results};
 await mkdir("artifacts/pse-npk-19-live-301",{recursive:true});
 await writeFile("artifacts/pse-npk-19-live-301/report.json",JSON.stringify(report,null,2)+"\n");
 console.log("PSE_NPK_19_301_LIVE="+JSON.stringify({checked:report.checked,pass:report.passed,fail:report.checked-report.passed,originalPageRedirectKept:specialOk,unknownIdNotRedirected:unknownOk,withoutIdNotRedirected:noQueryOk}));
 if(report.checked!==19||report.passed!==19||!specialOk||!unknownOk||!noQueryOk)throw Error("NPK exact legacy 301 production parity failed");
}finally{await browser.close();}
