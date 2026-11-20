/** Final PSE disclosure parity: original 190 source IDs => 190 published CMS articles.
 * Includes frontend SSR archive and restored detail checks. READ ONLY.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {chromium} from "playwright";
const s=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(s.schema!=="pse-legacy-article-migration-v1")throw Error("Wrong migration checkpoint");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=(name)=>{
 const v=env.filter(x=>x.startsWith(name+"="));
 if(v.length!==1)throw Error("Missing origin "+name);
 const u=new URL(v[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
  throw Error("Unsafe origin "+name);
 return u.origin;
};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
const rows=Object.entries(s.articles).filter(([id,r])=>r.source_url?.includes("/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin/"))
 .map(([id,r])=>({id,source:r.source_url,wpId:r.wp_id||null,status:r.status,verifiedDate:r.verified_date||null,dateSource:r.date_source||null}));
const initialRestoreIds=new Set(["75","1740","1742","208","302","319","320","330","1013","1026","1044","1045","1047","1058","1121","1127","1149","1533","1670"]);
const report={schema:"pse-disclosure-final-parity-v1",wp,front,source:190,checkpoint:rows.length,sourceUnique:new Set(rows.map(r=>r.id)).size,cmsTotal:null,cmsFetched:null,cmsExtra:[],missing:[],wrongCategory:[],wrongSlugs:[],unpublished:[],empty:[],dateDifferences:[],oldLinks:[],externalLinkChecks:[],frontend:{},restoredDetails:[],errors:[]};
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:1350,height:900}});
 const api=async(path)=>{let last;
  for(let i=0;i<2;i++){try{
   const res=await ctx.request.get(wp+path,{timeout:45000,headers:{Accept:"application/json"}});
   if(res.status()>=500)throw Error("HTTP "+res.status());
   return {http:res.status(),total:res.headers()["x-wp-total"],pages:res.headers()["x-wp-totalpages"],data:await res.json().catch(()=>null)};
  }catch(e){last=e}}
  throw Error("WordPress REST failed: "+path.slice(0,95)+": "+String(last).slice(0,120));
 };
 const c=await api("/wp-json/wp/v2/categories?slug=ban-cong-bo-thong-tin&hide_empty=false&_fields=id,slug,parent,count");
 if(c.http!==200||c.data?.length!==1||c.data[0].id!==1753||c.data[0].parent!==1744)
  throw Error("PSE disclosure taxonomy changed");
 const postRows=[];
 for(let page=1;page<=2;page++){
  const resp=await api("/wp-json/wp/v2/posts?categories=1753&per_page=100&page="+page+"&_fields=id,slug,status,title,content,categories,date,link");
  if(resp.http!==200||!Array.isArray(resp.data))throw Error("WP posts page "+page+" not accessible");
  if(page===1)report.cmsTotal=Number(resp.total||0);
  postRows.push(...resp.data);
 }
 report.cmsFetched=postRows.length;
 const wpById=new Map(postRows.map(p=>[p.id,p]));
 const sourceWpIds=new Set(rows.map(r=>r.wpId).filter(Boolean));
 report.cmsExtra=postRows.filter(p=>!sourceWpIds.has(p.id)).map(p=>({id:p.id,slug:p.slug}));
 for(const r of rows){
  const p=wpById.get(r.wpId);
  if(!p){report.missing.push({id:r.id,wpId:r.wpId,status:r.status});continue}
  if(p.status!=="publish")report.unpublished.push({id:r.id,wpId:p.id,status:p.status});
  if(!p.categories?.includes(1753))report.wrongCategory.push({id:r.id,wpId:p.id,categories:p.categories});
  const slug=new URL(r.source).pathname.split("/").at(-1).replace(/^\d+-/,"").replace(/[.]html$/i,"");
  if(p.slug!==slug)report.wrongSlugs.push({id:r.id,wpId:p.id,slug,actual:p.slug});
  const html=String(p.content?.rendered||"");
  if(!html.trim())report.empty.push({id:r.id,wpId:p.id});
  const sourceLinks=[...new Set((html.match(/https?:\/\/(?:www[.])?pse[.]vn\/(?:images|media|files)\/[^"'<>\s]+/gi)||[]))];
  if(sourceLinks.length)report.oldLinks.push({id:r.id,wpId:p.id,links:sourceLinks});
  if(r.dateSource==="joomla_com_search_created"&&r.verifiedDate&&
    p.date?.slice(0,10)!==r.verifiedDate.slice(0,10))
    report.dateDifferences.push({id:r.id,wpId:p.id,source:r.verifiedDate,date:p.date});
 }
 console.log("PSE_FINAL_CMS="+JSON.stringify({source:rows.length,total:report.cmsTotal,fetched:report.cmsFetched,missing:report.missing,extras:report.cmsExtra,wrongCategory:report.wrongCategory.length,wrongSlug:report.wrongSlugs.length,unpublished:report.unpublished.length,oldMediaLinks:report.oldLinks.length,dateDifferences:report.dateDifferences.length}));
 for(const item of report.oldLinks){
  for(const url of item.links){
   const proof={id:item.id,url};
   try{
    const res=await ctx.request.head(url,{timeout:45000});
    proof.http=res.status();proof.contentType=res.headers()["content-type"]||null;
   }catch(e){proof.error=String(e).slice(0,150)}
   report.externalLinkChecks.push(proof);
   console.log("PSE_FINAL_EXTERNAL_MEDIA="+JSON.stringify(proof));
  }
 }
 const listing=await ctx.newPage();
 for(const [pageNum,url] of [[1,front+"/tin-tuc-su-kien/ban-cong-bo-thong-tin"],[16,front+"/tin-tuc-su-kien/ban-cong-bo-thong-tin/16"]]){
  try{
   const response=await listing.goto(url,{waitUntil:"domcontentloaded",timeout:50000});
   const text=await listing.locator("body").innerText();
   const indicator=text.match(/Trang\s*\d+\s*\/\s*\d+\s*\(\s*Tổng\s*\d+\s*bài viết\s*\)/i)?.[0]||
     text.match(/Tổng\s+\d+\s+bài viết/i)?.[0]||null;
   report.frontend["page"+pageNum]={url,http:response?.status(),indicator,title:await listing.title(),bodyExcerpt:text.slice(0,900)};
   if(pageNum===1){
    const newer=text.indexOf("2026.11.12: CBTT"),older=text.indexOf("2026.08.13: CBTT");
    report.frontend.page1.sourceChronologyCorrect=newer>=0&&older>=0&&newer<older;
    report.frontend.page1.topTwo={newerIndex:newer,olderIndex:older};
   }
  }catch(e){report.errors.push({stage:"frontend_listing",pageNum,error:String(e).slice(0,170)})}
 }
 await listing.close();
 const targets=rows.filter(r=>initialRestoreIds.has(r.id)&&r.wpId).sort((a,b)=>Number(a.id)-Number(b.id));
 let i=0;
 const worker=async()=>{
  const p=await ctx.newPage();
  await p.route(/\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
  try{
   while(i<targets.length){
    const row=targets[i++],slug=new URL(row.source).pathname.split("/").at(-1).replace(/^\d+-/,"").replace(/[.]html$/i,"");
    const url=front+"/"+slug;
    const item={sourceId:row.id,url,wpId:row.wpId};
    try{
     const response=await p.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
     item.http=response?.status()||null;item.final=p.url();
     const info=await p.evaluate(()=>({title:document.title,body:document.body?.innerText?.slice(0,900)||"",h1:document.querySelector("h1")?.textContent?.trim()||""}));
     item.pageTitle=info.title;item.h1=info.h1;
     item.empty=!info.body.trim();
    }catch(e){item.error=String(e).slice(0,180)}
    report.restoredDetails.push(item);
    console.log("PSE_FINAL_DETAIL="+JSON.stringify(item));
   }
  }finally{await p.close()}
 };
 await Promise.all([worker(),worker(),worker()]);
 console.log("PSE_FINAL_FRONTEND="+JSON.stringify({listing:report.frontend,detailChecked:report.restoredDetails.length,detailFail:report.restoredDetails.filter(p=>p.http!==200||p.empty||p.error).length}).slice(0,3500));
} catch(e){report.errors.push({stage:"general",error:String(e).slice(0,250)});console.error("PSE_FINAL_ERROR="+String(e).slice(0,250))}
finally{
 await mkdir("artifacts/pse-disclosure-final",{recursive:true});
 await writeFile("artifacts/pse-disclosure-final/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
const pass=report.sourceUnique===190&&report.checkpoint===190&&report.cmsTotal===190&&report.cmsFetched===190&&
 !report.missing.length&&!report.cmsExtra.length&&!report.wrongCategory.length&&!report.wrongSlugs.length&&
 !report.unpublished.length&&!report.empty.length&&!report.dateDifferences.length&&!report.oldLinks.length&&!report.errors.length&&
 report.frontend.page1?.sourceChronologyCorrect===true&&
 [1,16].every(n=>report.frontend["page"+n]?.http===200)&&
 report.restoredDetails.length===19&&report.restoredDetails.every(x=>x.http===200&&!x.empty&&!x.error);
console.log("PSE_FINAL_PARITY="+(pass?"PASS":"PARTIAL")+"; source="+report.sourceUnique+"; cms="+report.cmsTotal+"; unresolved="+report.missing.length+"; old_media_refs="+report.oldLinks.length+"; ssr_details="+report.restoredDetails.length);
if(!pass)process.exitCode=1;
