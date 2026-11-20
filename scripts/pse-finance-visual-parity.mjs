/** Browser source/target financial archive QA at identical desktop and mobile viewports. READ ONLY. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const legacy="https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh.html";
const target="https://pse.webnvn.com/tin-tuc-su-kien/bao-cao-tai-chinh";
const report={schema:"pse-finance-visual-source-target-v1",source:legacy,target,views:[],errors:[],status:"UNVERIFIED"};
await mkdir("artifacts/pse-finance-visual",{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const size of [{name:"desktop",width:1366,height:768},{name:"mobile",width:390,height:844}]){
  const ctx=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:1});
  const s=await ctx.newPage(),d=await ctx.newPage();
  for(const [label,url,page] of [
   ["original-first",legacy,s],["new-first",target,d],
   ["original-last",legacy+"?start=72",s],["new-last",target+"/7",d]
  ]){
   const one={viewport:size.name,label,url,http:null,heading:null,sourceArticleIds:[],targetCardCount:null,targetTitles:[],pagination:null,horizontalOverflow:null,screenshot:null};
   try{
    const res=await page.goto(url,{waitUntil:"domcontentloaded",timeout:55000});
    one.http=res?.status()||null;
    const state=await page.evaluate(({isOriginal})=>{
     const main=document.querySelector("main")||document;
     const headings=[...main.querySelectorAll("h1")].map(x=>x.textContent.replace(/\s+/g," ").trim()).filter(Boolean);
     const links=[];
     if(isOriginal){
      for(const a of document.querySelectorAll("a[href]")){
       try{
        const u=new URL(a.href);
        const m=u.pathname.match(/\/quan-he-nha-dau-tu\/bao-cao-tai-chinh\/(\d{2,6})-([^/]+)\.html$/);
        if(m&&!links.some(o=>o.id===m[1]))links.push({id:m[1],slug:m[2]});
       }catch{}
      }
     }
     const cards=[...main.querySelectorAll("#posts-grid h2")].map(h=>({
      title:(h.textContent||"").replace(/\s+/g," ").trim(),
      href:h.closest("a")?.href||null
     }));
     const pg=(main.textContent||"").match(/Trang\s+(\d+)\s*\/\s*(\d+)\s*\(Tổng\s*(\d+)\s*bài viết\)/i);
     return{heading:headings[0]||null,sourceLinks:links,cards,pagination:pg?{current:+pg[1],pages:+pg[2],total:+pg[3]}:null,
      horizontalOverflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
      distinctCardTitles:new Set(cards.map(x=>x.title)).size};
    },{isOriginal:label.startsWith("original")});
    one.heading=state.heading;
    one.sourceArticleIds=state.sourceLinks;
    one.targetCardCount=state.cards.length;
    one.targetTitles=state.cards;
    one.pagination=state.pagination;
    one.horizontalOverflow=state.horizontalOverflow;
    one.distinctCardTitles=state.distinctCardTitles;
    const file="artifacts/pse-finance-visual/"+size.name+"-"+label+".png";
    await page.screenshot({path:file,fullPage:false,animations:"disabled",timeout:20000});
    one.screenshot=file;
    if(one.http!==200)report.errors.push(label+" "+size.name+": HTTP "+one.http);
    if(label.startsWith("new")){
     const isFirst=label.endsWith("first");
     if(one.targetCardCount!==(isFirst?12:4))report.errors.push(label+" "+size.name+": card count "+one.targetCardCount);
     if(one.distinctCardTitles!==one.targetCardCount)report.errors.push(label+" "+size.name+": duplicate titles");
     if(one.pagination?.total!==76||one.pagination?.pages!==7||one.pagination?.current!==(isFirst?1:7))
      report.errors.push(label+" "+size.name+": pagination "+JSON.stringify(one.pagination));
     if(!one.heading?.toLowerCase().includes("báo cáo tài chính"))
      report.errors.push(label+" "+size.name+": H1 not finance");
     if(one.horizontalOverflow>10)report.errors.push(label+" "+size.name+": horizontal overflow "+one.horizontalOverflow);
     if(isFirst && !state.cards[0]?.href?.includes("20261105-cbtt-dinh-chinh-thong-tin-da-cong-bo-trong-bctc-quy-3-2026"))
      report.errors.push(label+" "+size.name+": newest post missing or not first");
    }else if(one.sourceArticleIds.length<4){
     report.errors.push(label+" "+size.name+": original links unavailable");
    }
   }catch(e){one.error=String(e).slice(0,240);report.errors.push(label+" "+size.name+": "+one.error)}
   report.views.push(one);
   console.log("PSE_FINANCE_VISUAL_VIEW="+JSON.stringify({
    viewport:size.name,label,http:one.http,heading:one.heading,sourceIds:one.sourceArticleIds.map(x=>x.id),
    cardCount:one.targetCardCount,pagination:one.pagination,horizontalOverflow:one.horizontalOverflow,error:one.error
   }));
  }
  await ctx.close();
 }
 report.status=report.errors.length?"FAIL":"PASS";
 console.log("PSE_FINANCE_VISUAL_PARITY="+JSON.stringify({status:report.status,views:report.views.length,errors:report.errors}));
}finally{
 await writeFile("artifacts/pse-finance-visual/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
if(report.status!=="PASS")process.exitCode=1;
