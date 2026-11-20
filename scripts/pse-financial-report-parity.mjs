/**
 * PSE /bao-cao-tai-chinh — independent original Joomla -> WordPress -> Astro source-parity audit.
 * READ ONLY. Never invent/import/publish a financial record from an unverified listing.
 */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const legacy="https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh.html";
const originalRoot="https://www.pse.vn";
const archivePath="/quan-he-nha-dau-tu/bao-cao-tai-chinh/";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function getOrigin(k){
 const rows=env.filter(x=>x.startsWith(k+"="));
 if(rows.length!==1)throw Error("Missing unique configuration "+k);
 const u=new URL(rows[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid configured "+k);
 return u.origin;
}
const cms=getOrigin("WC_URL"),front=getOrigin("WC_URL_CLIENT");
if(!front.includes("pse.")||!cms.includes("pse."))throw Error("Wrong project origin");
const report={schema:"pse-financial-report-source-parity-v1",mode:"READ_ONLY",
 source:legacy,target:front+"/tin-tuc-su-kien/bao-cao-tai-chinh",
 sourcePages:[],sourceArticles:[],category:null,wpCount:0,wpArticles:[],targetHttp:null,
 targetFirstPage:[],missingSourceInWp:[],extraWpInCategory:[],missingMedia:[],sourceErrors:[],oldMediaLinks:[],
 matchingModeCounts:{originId:0,slug:0},checkedDetails:0,errors:[],status:"UNVERIFIED"};
const browser=await chromium.launch({headless:true});
const src=await browser.newPage({viewport:{width:1365,height:900}});
await src.route(/\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf)(?:\?.*)?$/i,r=>r.abort());
const byId=new Map();
const fetchSource=async(url,page)=>{
 let response,err;
 for(let attempt=0;attempt<2;attempt++){
  try{response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:35000});if(response?.status()===200)return response;err="HTTP "+response?.status()}
  catch(e){err=String(e).slice(0,200)}
 }
 throw Error("Legacy fetch failed "+url+" "+err);
};
try{
 let zero=0;
 for(let i=0;i<22;i++){
  const url=legacy+(i?"?start="+i*6:"");
  try{
   await fetchSource(url,src);
   const hits=await src.evaluate(base=>{
    const root=document.querySelector(".blog")||document.querySelector("main")||document;
    const items=new Map();
    for(const a of root.querySelectorAll("a[href]")){
     let u;try{u=new URL(a.href)}catch{continue}
     if(!["www.pse.vn","pse.vn"].includes(u.hostname)||!u.pathname.startsWith(base))continue;
     const m=u.pathname.slice(base.length).match(/^(\d{2,6})-([^/]+)\.html$/);
     if(!m)continue;
     const t=(a.textContent||"").replace(/\s+/g," ").trim();
     const prev=items.get(m[1]);
     if(!prev||t.length>prev.title.length&&!/^(Xem tiếp|Read more)\b/i.test(t))
      items.set(m[1],{id:m[1],slug:m[2],href:"https://www.pse.vn"+u.pathname,title:t});
    }
    return [...items.values()];
   },archivePath);
   let fresh=0;for(const h of hits)if(!byId.has(h.id)){byId.set(h.id,h);fresh++}
   report.sourcePages.push({page:i+1,url,found:hits.length,newArticles:fresh});
   zero=fresh===0?zero+1:0;
   console.log("PSE_FINANCE_SOURCE_PAGE="+JSON.stringify({page:i+1,found:hits.length,newItems:fresh,total:byId.size}));
   if(zero>=2&&i>=12)break;
  }catch(e){
   report.sourceErrors.push({page:i+1,url,error:String(e).slice(0,250)});
   if(i===0)throw e;
  }
 }
 report.sourceArticles=[...byId.values()];
 if(!byId.size)throw Error("No original Joomla financial records discovered");
 const wp=await browser.newPage();
 await wp.goto(cms+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await wp.locator("#user_login").count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WordPress admin credentials unavailable");
  await wp.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await wp.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await wp.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const field=wp.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("WP math challenge field missing");
   await field.fill(String(v));
  }
  await Promise.all([wp.waitForLoadState("domcontentloaded"),wp.locator("#wp-submit").click()]);
 }
 if(wp.url().includes("wp-login"))throw Error("PSE WordPress login failed");
 const nonce=await wp.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce unavailable");
  return(await r.text()).trim();
 });
 const api=path=>wp.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json","X-WP-Nonce":nonce}});
  return{http:r.status,total:Number(r.headers.get("X-WP-Total")||0),pages:Number(r.headers.get("X-WP-TotalPages")||0),body:await r.json().catch(()=>null)};
 },{path,nonce});
 const cats=await api("/wp-json/wp/v2/categories?context=edit&slug=bao-cao-tai-chinh&hide_empty=false&_fields=id,name,slug,parent,count");
 if(cats.http!==200||!Array.isArray(cats.body)||cats.body.length!==1)throw Error("Finance category missing/ambiguous "+cats.http);
 const cat=cats.body[0];
 if(cat.slug!=="bao-cao-tai-chinh"||Number(cat.parent)!==1744)throw Error("Finance taxonomy parent not verified");
 report.category=cat;
 const articles=[];let pages=1;
 for(let i=1;i<=pages;i++){
  const query="/wp-json/wp/v2/posts?context=edit&status=publish&categories="+cat.id+"&per_page=100&page="+i+"&_fields=id,slug,title,date,categories,acf,content";
  const r=await api(query);
  if(r.http!==200||!Array.isArray(r.body))throw Error("WP financial posts unavailable page="+i+" HTTP "+r.http);
  if(i===1)pages=r.pages||1;
  if(pages>20)throw Error("Finance WordPress page count unexpected "+pages);
  articles.push(...r.body);
 }
 report.wpCount=articles.length;
 report.wpArticles=articles.map(p=>({id:p.id,slug:p.slug,originPageId:p.acf?.origin_page_id||null,date:p.date,title:p.title?.raw||p.title?.rendered||""}));
 const bySlug=new Map(articles.map(p=>[p.slug,p])),byOriginal=new Map(articles.filter(p=>p.acf?.origin_page_id).map(p=>[String(p.acf.origin_page_id),p]));
 const matched=new Set();
 for(const source of report.sourceArticles){
  let post=byOriginal.get(source.id),how="originId";
  if(!post){post=bySlug.get(source.slug);how="slug"}
  if(!post){report.missingSourceInWp.push(source);continue}
  matched.add(post.id);report.matchingModeCounts[how]++;
  source.wpId=post.id;source.wpSlug=post.slug;
 }
 report.extraWpInCategory=report.wpArticles.filter(p=>!matched.has(p.id));
 const live=await browser.newPage({viewport:{width:1365,height:900}});
 try{
  const r=await live.goto(report.target,{waitUntil:"domcontentloaded",timeout:40000});
  report.targetHttp=r?.status()||null;
  report.targetFirstPage=await live.evaluate(()=>{
   const root=document.querySelector("main")||document;
   return [...new Set([...root.querySelectorAll("a[href]")].map(a=>a.href).filter(h=>h.includes("/tin-tuc-su-kien/")&&!h.endsWith("/bao-cao-tai-chinh")))].slice(0,35);
  });
 }catch(e){report.errors.push("Target page fetch: "+String(e).slice(0,180))}
 const knownDocs=new Set(["pdf","doc","docx","xls","xlsx","zip","rar"]);
 const basename=x=>{
  try{return decodeURIComponent(new URL(x,originalRoot).pathname.split("/").at(-1)||"").toLowerCase().replace(/\s+/g," ")}
  catch{return ""}
 };
 const docsFromHtml=html=>{
  const out=[];
  for(const raw of String(html||"").matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)){
   try{const u=new URL(raw[1],cms);const ext=basename(u.href).split(".").at(-1);if(knownDocs.has(ext))out.push({name:basename(u.href),url:u.href})}catch{}
  }
  return [...new Map(out.map(o=>[o.name,o])).values()];
 };
 const batches=report.sourceArticles.filter(x=>x.wpId);
 for(let i=0;i<batches.length;i+=4){
  const chunk=batches.slice(i,i+4);
  await Promise.all(chunk.map(async(item)=>{
   const page=await browser.newPage();
   try{
    await page.route(/\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf)(?:\?.*)?$/i,r=>r.abort());
    await fetchSource(item.href,page);
    const sourceDocs=await page.evaluate(()=>{
     const root=document.querySelector(".item-page")||document.querySelector("article")||document.querySelector("main")||document;
     return [...root.querySelectorAll("a[href]")].map(a=>({url:a.href,text:(a.textContent||"").replace(/\s+/g," ").trim().slice(0,110)}))
      .filter(x=>/\.(?:pdf|docx?|xlsx?|zip|rar)(?:[?#]|$)/i.test(x.url));
    });
    const post=articles.find(p=>p.id===item.wpId);
    const targetDocs=docsFromHtml(post?.content?.raw||post?.content?.rendered||"");
    const targetNames=new Set(targetDocs.map(x=>x.name));
    item.sourceDocCount=sourceDocs.length;item.wpDocCount=targetDocs.length;
    item.sourceDocs=sourceDocs;
    item.wpDocs=targetDocs;
    for(const d of sourceDocs){
     const name=basename(d.url);
     if(!targetNames.has(name))report.missingMedia.push({sourceId:item.id,wpId:item.wpId,filename:name,sourceUrl:d.url,sourceText:d.text});
    }
    const old=targetDocs.filter(x=>/\/\/(?:www\.)?pse\.vn\//i.test(x.url));
    if(old.length)report.oldMediaLinks.push({sourceId:item.id,wpId:item.wpId,files:old});
    report.checkedDetails++;
   }catch(e){report.sourceErrors.push({sourceId:item.id,url:item.href,error:String(e).slice(0,250)})}
   finally{await page.close()}
  }));
  console.log("PSE_FINANCE_DETAIL_BATCH="+JSON.stringify({checked:report.checkedDetails,total:batches.length,mediaMissing:report.missingMedia.length,sourceErrors:report.sourceErrors.length}));
 }
 report.errors.push(...(report.sourceErrors.length?["Legacy original could not be fully crawled"]:[]));
 if(report.missingSourceInWp.length)report.errors.push("Missing original financial posts: "+report.missingSourceInWp.length);
 if(report.missingMedia.length)report.errors.push("Missing original attached files by filename: "+report.missingMedia.length);
 if(report.oldMediaLinks.length)report.errors.push("Finance posts still hotlink original media: "+report.oldMediaLinks.length);
 if(report.targetHttp!==200)report.errors.push("Astro archive did not return HTTP 200");
 report.status=report.errors.length?"FAIL":"PARITY_CANDIDATE";
 console.log("PSE_FINANCE_PARITY_SUMMARY="+JSON.stringify({
  status:report.status,legacyPages:report.sourcePages.length,sourceCount:report.sourceArticles.length,
  wpCount:report.wpCount,category:report.category?.id,sourceMissing:report.missingSourceInWp.length,
  wpExtra:report.extraWpInCategory.length,sourceDetailsChecked:report.checkedDetails,
  originalFilesMissing:report.missingMedia.length,oldMediaLinks:report.oldMediaLinks.length,
  targetHttp:report.targetHttp,targetCards:report.targetFirstPage.length,
  errors:report.errors,sourceErrors:report.sourceErrors.slice(0,5),
  missingSample:report.missingSourceInWp.slice(0,10),mediaSample:report.missingMedia.slice(0,10)
 }));
} catch(e){report.errors.push(String(e));report.status="FAIL";console.error("PSE_FINANCE_AUDIT_ERROR="+String(e))}
finally{
 await mkdir("artifacts/pse-financial-report-parity",{recursive:true});
 await writeFile("artifacts/pse-financial-report-parity/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
if(report.status!=="PARITY_CANDIDATE")process.exitCode=1;
