/** Read-only public verification of owner-approved 17 Nov 2026 publication date. */
import {chromium} from "playwright";
const url="https://pse.webnvn.com/20260813-cbtt-bao-cao-tai-chinh-ban-nien-2026";
const wp="https://admin-pse.webnvn.com/wp-json/wp/v2/posts/82508?_fields=id,slug,title,date,status,content";
const expected="2026-11-17";
const browser=await chromium.launch({headless:true});
try{
  const ctx=await browser.newContext();
  const r=await ctx.request.get(wp,{timeout:45000,failOnStatusCode:false});
  const post=await r.json().catch(()=>null);
  if(r.status()!==200||post?.id!==82508||post.slug!=="20260813-cbtt-bao-cao-tai-chinh-ban-nien-2026"||
     !String(post.date||"").startsWith(expected+"T")||!String(post.title?.rendered||"").includes("Báo cáo tài chính bán niên 2026")){
    throw new Error("PSE_DATE_PUBLIC_WORDPRESS_FAIL http="+r.status()+" id="+post?.id+" date="+post?.date);
  }
  console.log("PSE_1742_PUBLIC_REST_DATE_PASS="+post.date);
  for (const width of [1366,390]){
    const page=await ctx.newPage({viewport:{width,height:900}});
    const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:65000});
    const detail=await page.evaluate(()=>{
      const root=document.querySelector("main");
      const h1=root?.querySelector("h1")?.textContent?.replace(/\s+/g," ").trim()||"";
      const t=root?.querySelector("time")?.getAttribute("datetime")||"";
      const published=root?.querySelector("time")?.textContent?.replace(/\s+/g," ").trim()||"";
      const mainText=root?.textContent?.replace(/\s+/g," ").trim()||"";
      return {h1,time:t,published,exactDateVisible:/17[\/.-]11[\/.-]2026/.test(published),mainTextLength:mainText.length};
    });
    if(response?.status()!==200 ||
       !detail.h1.includes("Báo cáo tài chính bán niên 2026")||
       !String(detail.time).startsWith(expected)||
       !detail.exactDateVisible||detail.mainTextLength<200){
      throw new Error("PSE_1742_FRONTEND_DATE_FAIL "+JSON.stringify({http:response?.status(),width,...detail}));
    }
    console.log("PSE_1742_FRONTEND_DATE_PASS "+JSON.stringify({http:200,width,...detail}));
    await page.close();
  }
  await ctx.close();
}finally{await browser.close();}
