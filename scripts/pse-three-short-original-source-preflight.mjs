/** GET-only check of three historical Joomla pages quarantined for short/oversized body. */
import {chromium,request} from "playwright";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const ids=[338,341,1085];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 ids.some(id=>state.articles?.[id]?.status!=="quarantined"||
 state.articles[id].reason!=="Source content incomplete or oversized"))
 throw Error("Source state/quarantine changed");
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:45000});
const pageCtx=await browser.newContext({javaScriptEnabled:false});
await pageCtx.route("**/*",r=>r.abort());
const dateCtx=await browser.newContext({viewport:{width:1366,height:850}});
await dateCtx.route(/\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const report={schema:"pse-original-three-short-content-parity-readonly-v1",
 readOnly:true,noCmsWrites:true,noBuild:true,rows:[]};
try{
 for(const id of ids){
  const url=state.articles[id].source_url;
  const row={id,url,http:null,title:null,bodyChars:0,htmlBytes:0,sourceCreatedDay:null,
   sourceDateMethod:null,media:[],editorialLinks:0,decision:"SOURCE_NOT_READY",error:null};
  report.rows.push(row);
  try{
   const u=new URL(url);
   if(u.protocol!=="https:"||u.hostname!=="www.pse.vn"||
    !new RegExp("/"+id+"-[^/]+\\.html$","i").test(u.pathname)||u.search||u.hash)
    throw Error("Source original URL changed");
   const r=await net.get(url,{timeout:50000,maxRedirects:3});
   row.http=r.status();if(row.http!==200)throw Error("Source HTTP "+row.http);
   const html=await r.text();
   if(html.length>7000000||html.length<200)throw Error("Original HTML size unsafe");
   const page=await pageCtx.newPage();
   let p;
   try{
    await page.setContent('<base href="'+url+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded",timeout:25000});
    p=await page.evaluate(()=>{
     const root=document.querySelector(".item-page [itemprop=articleBody]")||
      document.querySelector(".item-page")||document.querySelector("article");
     if(!root)return null;
     const norm=s=>String(s||"").replace(/\s+/g," ").trim();
     const refs=[...root.querySelectorAll("img[src],a[href],iframe[src],object[data],embed[src]")].map(el=>{
      const a=el.getAttribute("src")||el.getAttribute("href")||el.getAttribute("data")||"";
      let u;try{u=new URL(a,document.baseURI)}catch{return null}
      if(!["https:","http:"].includes(u.protocol))return null;
      return{tag:el.tagName.toLowerCase(),path:u.pathname,host:u.hostname,
       isRequiredImage:el.tagName==="IMG",isMedia:/(?:\.(?:jpe?g|png|gif|webp|pdf))(?:$)/i.test(u.pathname)};
     }).filter(Boolean);
     return{title:norm(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||
      document.title),text:norm(root.textContent),htmlBytes:root.innerHTML.length,
      refs,contentBlocks:root.querySelectorAll("p,h2,h3,ul,ol,table").length};
    });
   }finally{await page.close()}
   if(!p||!p.title||p.text.length<10)throw Error("Source original body missing");
   row.title=p.title;row.bodyChars=p.text.length;row.bodySample=p.text.slice(0,200);
   row.htmlBytes=p.htmlBytes;row.contentBlocks=p.contentBlocks;
   row.media=p.refs.filter(x=>x.isRequiredImage||x.isMedia||["iframe","embed","object"].includes(x.tag));
   row.editorialLinks=p.refs.filter(x=>x.tag==="a"&&!x.isMedia).length;
   if(p.text.length>=60){
    const datePage=await dateCtx.newPage();
    let date;
    try{date=await searchDate(datePage,{id,sourceUrl:url,title:p.title,opening:p.text.slice(0,350)})}
    finally{await datePage.close()}
    row.sourceCreatedDay=date?.source==="joomla_com_search_created"?date.day:null;
    row.sourceDateMethod=date?.source||null;
    row.dateAttempts=date?.day?[]:(date?.attempts||[]);
   }
   row.decision=row.bodyChars>=180&&row.sourceCreatedDay&&row.media.length===0?
    "ORIGINAL_SHORT_BODY_WITH_CREATED_DAY_NO_MANDATORY_MEDIA":
    row.bodyChars>=180&&row.sourceCreatedDay?"SOURCE_CONTENT_DATE_PASS_MEDIA_NEEDS_BYTES":
    "SOURCE_BODY_OR_DATE_REVIEW";
  }catch(e){row.error=String(e?.message||e).slice(0,200)}
  console.log("PSE_THREE_SHORT_SOURCE_ROW="+JSON.stringify({id:row.id,http:row.http,
    title:row.title,bodyChars:row.bodyChars,contentBlocks:row.contentBlocks,
    media:row.media,sourceCreatedDay:row.sourceCreatedDay,decision:row.decision,error:row.error}).slice(0,5000));
 }
 report.summary={sourceCount:3,source200:report.rows.filter(r=>r.http===200).length,
   contentWithDay:report.rows.filter(r=>r.sourceCreatedDay&&r.bodyChars>=180).map(r=>r.id),
   noMandatoryMedia:report.rows.filter(r=>r.sourceCreatedDay&&r.bodyChars>=180&&r.media.length===0).map(r=>r.id),
   readOnly:true,noCmsWrites:true};
 console.log("PSE_THREE_SHORT_SOURCE_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-three-short-source",{recursive:true});
 await writeFile("artifacts/pse-three-short-source/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await pageCtx.close();await dateCtx.close();await browser.close();
}
